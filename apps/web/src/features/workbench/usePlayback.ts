import { useCallback, useEffect, useRef, useState } from "react";

import type { FrameBufferView } from "../../solver/frame-buffer";

export const clampFrameIndex = (frameIndex: number, frameCount: number): number =>
  Math.min(Math.max(0, Math.trunc(frameIndex)), Math.max(0, frameCount - 1));

export const stepFrameIndex = (frameIndex: number, delta: number, frameCount: number): number =>
  clampFrameIndex(frameIndex + delta, frameCount);

const clampFramePosition = (framePosition: number, frameCount: number): number =>
  Math.min(Math.max(0, framePosition), Math.max(0, frameCount - 1));

export const normalizePlaybackRate = (rate: number): number => {
  const clamped = Math.min(2, Math.max(0.1, rate));
  for (const detent of [0.5, 1]) {
    if (Math.abs(clamped - detent) <= 0.05) return detent;
  }
  return Math.round(clamped * 10) / 10;
};

export const interpolateFrameField = (
  frames: FrameBufferView,
  fieldName: string,
  framePosition: number
): Float32Array => {
  const lowerIndex = clampFrameIndex(Math.floor(framePosition), frames.frameCount);
  const upperIndex = clampFrameIndex(Math.ceil(framePosition), frames.frameCount);
  const fraction = Math.min(1, Math.max(0, framePosition - lowerIndex));
  const lower = frames.readField(lowerIndex, fieldName);
  const upper = frames.readField(upperIndex, fieldName);

  return Float32Array.from(
    lower,
    (value, index) => value + ((upper[index] ?? value) - value) * fraction
  );
};

/** Inputs, selects and text areas keep their native arrow and space handling. */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as HTMLElement).tagName !== "string") {
    return false;
  }
  const element = target as HTMLElement;
  if (element.isContentEditable) {
    return true;
  }
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea";
};

export type PlaybackController = {
  framePosition: number;
  frameIndex: number;
  playing: boolean;
  rate: number;
  setFrameIndex: (nextFrameIndex: number) => void;
  setRate: (nextRate: number) => void;
  togglePlaying: () => void;
  step: (delta: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  bindKeyboard: (event: KeyboardEvent) => void;
};

export const usePlayback = (
  frameCount: number,
  outputHz: number,
  initialRate: number,
  onRateChange: (nextRate: number) => void
): PlaybackController => {
  const [framePosition, setFramePosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(() => normalizePlaybackRate(initialRate));
  const lastTimestamp = useRef<number | null>(null);
  const frameIndex = clampFrameIndex(Math.floor(framePosition), frameCount);

  useEffect(() => {
    setRateState(normalizePlaybackRate(initialRate));
  }, [initialRate]);

  useEffect(() => {
    if (!playing || frameCount <= 1) {
      lastTimestamp.current = null;
      return;
    }

    let animationFrame = 0;
    const tick = (timestamp: number) => {
      if (lastTimestamp.current !== null) {
        const elapsedFrames = ((timestamp - lastTimestamp.current) / 1000) * outputHz * rate;
        setFramePosition((current) => clampFramePosition(current + elapsedFrames, frameCount));
      }
      lastTimestamp.current = timestamp;
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [frameCount, outputHz, playing, rate]);

  useEffect(() => {
    if (playing && framePosition >= frameCount - 1) setPlaying(false);
  }, [frameCount, framePosition, playing]);

  useEffect(() => {
    setFramePosition((current) => clampFramePosition(current, frameCount));
  }, [frameCount]);

  const togglePlaying = useCallback(() => {
    lastTimestamp.current = null;
    // Playing from the last frame replays the run instead of stopping immediately.
    if (!playing && framePosition >= frameCount - 1) setFramePosition(0);
    setPlaying(!playing);
  }, [frameCount, framePosition, playing]);

  const setFrameIndex = useCallback(
    (nextFrameIndex: number) => {
      lastTimestamp.current = null;
      setFramePosition(clampFrameIndex(nextFrameIndex, frameCount));
    },
    [frameCount]
  );

  const setRate = useCallback(
    (nextRate: number) => {
      const clamped = normalizePlaybackRate(nextRate);
      lastTimestamp.current = null;
      setRateState(clamped);
      onRateChange(clamped);
    },
    [onRateChange]
  );

  const bindKeyboard = useCallback(
    (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePlaying();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFramePosition((current) => clampFrameIndex(Math.floor(current) - 1, frameCount));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setFramePosition((current) => clampFrameIndex(Math.floor(current) + 1, frameCount));
      }
    },
    [frameCount, togglePlaying]
  );

  return {
    framePosition,
    frameIndex,
    playing,
    rate,
    setFrameIndex,
    setRate,
    togglePlaying,
    step: (delta: number) =>
      setFramePosition((current) => clampFrameIndex(Math.floor(current) + delta, frameCount)),
    goToStart: () => setFrameIndex(0),
    goToEnd: () => setFrameIndex(frameCount - 1),
    bindKeyboard
  };
};
