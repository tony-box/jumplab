import { useCallback, useEffect, useRef, useState } from "react";

import {
  scenarioSchema,
  type PoseClip,
  type PoseSample,
  type Scenario
} from "../../../../../packages/schema/src/index";

import { useAppServices } from "../../app/AppProviders";
import type { JointName } from "./pose-sampling";

type PreviewKey = { s: number; label: string; targets: Record<JointName, number> };

/** Fractions of the entry speed the clip can be previewed at. */
export const PREVIEW_RATES = [0.1, 0.25, 0.5, 1] as const;
export type PreviewRate = (typeof PREVIEW_RATES)[number];

export type PosePreview = {
  /** Distance being previewed, or null while editing keys. */
  s: number | null;
  sample: PoseSample | null;
  playing: boolean;
  rate: PreviewRate;
  start: number;
  end: number;
  /** Label of the key at or just behind the preview position. */
  label: string;
  toggle: () => void;
  scrubTo: (s: number) => void;
  setRate: (rate: PreviewRate) => void;
  exit: () => void;
};

/**
 * Plays the pose clip through its keyframes. The rider is sampled by the core at each preview
 * distance, so the preview shows exactly the interpolated pose a solve would use.
 */
export const usePosePreview = (
  scenario: Scenario | null,
  keyframes: PreviewKey[],
  interpolation: PoseClip["interpolation"]
): PosePreview => {
  const { solverGateway } = useAppServices();
  const [s, setS] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PreviewRate>(0.25);
  const [sample, setSample] = useState<PoseSample | null>(null);

  const ordered = [...keyframes].sort((left, right) => left.s - right.s);
  const start = ordered[0]?.s ?? 0;
  const end = ordered[ordered.length - 1]?.s ?? 0;
  const speed = Math.max(0.1, (scenario?.entry.speed ?? 1) * rate);

  const exit = useCallback(() => {
    setPlaying(false);
    setS(null);
    setSample(null);
  }, []);

  // Editing or reselecting keys returns to key editing.
  useEffect(() => exit(), [exit, keyframes, interpolation]);

  const scrubTo = useCallback(
    (next: number) => {
      setPlaying(false);
      setS(Math.min(end, Math.max(start, next)));
    },
    [end, start]
  );

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Playing from the end, or from key editing, starts the clip over.
    setS((current) => (current === null || current >= end ? start : current));
    setPlaying(true);
  }, [end, playing, start]);

  const positionRef = useRef<number | null>(null);
  positionRef.current = s;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (time: number) => {
      const elapsed = last === null ? 0 : (time - last) / 1000;
      last = time;
      const next = Math.min(end, (positionRef.current ?? start) + elapsed * speed);
      positionRef.current = next;
      setS(next);
      if (next >= end) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, playing, speed, start]);

  // One core request at a time; while one is in flight only the newest position is queued.
  const busyRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (s === null || !scenario) return;
    const scenarioForSample = scenarioSchema.parse({
      ...scenario,
      poseClip: {
        id: scenario.poseClip.id,
        name: scenario.poseClip.name,
        interpolation,
        keys: ordered.map((key) => ({ s: key.s, label: key.label, targets: { ...key.targets } }))
      }
    });

    const request = async (at: number) => {
      busyRef.current = true;
      try {
        const next = await solverGateway.samplePose(scenarioForSample, at);
        if (activeRef.current) setSample(next);
      } catch {
        // Keep the last pose on screen; the next position retries.
      } finally {
        busyRef.current = false;
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued !== null && activeRef.current) void request(queued);
      }
    };

    if (busyRef.current) queuedRef.current = s;
    else void request(s);
    // `ordered` is derived from keyframes, which are already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interpolation, keyframes, s, scenario, solverGateway]);

  const behind = s === null ? undefined : [...ordered].reverse().find((key) => key.s <= s + 1e-6);
  const label = behind?.label ?? ordered[0]?.label ?? "";

  return {
    s,
    sample: s === null ? null : sample,
    playing,
    rate,
    start,
    end,
    label,
    toggle,
    scrubTo,
    setRate,
    exit
  };
};
