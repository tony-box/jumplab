import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  scenarioSchema,
  type PoseClip,
  type PoseSample,
  type Scenario
} from "../../../../../packages/schema/src/index";

import { useAppServices } from "../../app/AppProviders";
import { interpolatePoseSample, type PoseSampleCache } from "./pose-sample-cache";
import type { JointName } from "./pose-sampling";

/** Spacing of the pre-sampled clip, in metres. */
const CACHE_STEP_M = 0.05;
const CACHE_MAX_SAMPLES = 1_000;
/** Concurrent core requests while filling the cache. */
const CACHE_BATCH = 24;
/** Wait for edits to settle before sampling the clip. */
const CACHE_DELAY_MS = 250;

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
  interpolation: PoseClip["interpolation"],
  /** Distance range to play; defaults to the first and last keys. */
  range?: { start: number; end: number }
): PosePreview => {
  const { solverGateway } = useAppServices();
  const [s, setS] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PreviewRate>(0.25);
  const [sample, setSample] = useState<PoseSample | null>(null);

  const ordered = [...keyframes].sort((left, right) => left.s - right.s);
  const start = range?.start ?? ordered[0]?.s ?? 0;
  const end = range?.end ?? ordered[ordered.length - 1]?.s ?? 0;
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

  const clipScenario = useMemo(() => {
    if (!scenario) return null;
    // While the editor is still loading its keys the clip can be invalid; there is nothing to
    // preview yet, so this must not throw during render.
    const parsed = scenarioSchema.safeParse({
      ...scenario,
      poseClip: {
        id: scenario.poseClip.id,
        name: scenario.poseClip.name,
        interpolation,
        keys: [...keyframes]
          .sort((left, right) => left.s - right.s)
          .map((key) => ({ s: key.s, label: key.label, targets: { ...key.targets } }))
      }
    });
    return parsed.success ? parsed.data : null;
  }, [interpolation, keyframes, scenario]); // Only what changes the pose invalidates the cache: body, bike, clip, and the range.
  const cacheKey = clipScenario
    ? JSON.stringify([clipScenario.rider, clipScenario.bike, clipScenario.poseClip, start, end])
    : null;
  const [cache, setCache] = useState<(PoseSampleCache & { key: string }) | null>(null);
  const cacheReady = cache !== null && cache.key === cacheKey;

  // Playback must not wait on the worker every frame, or frames repeat while a reply is in
  // flight and then jump. The clip is sampled once in the background and blended per frame.
  useEffect(() => {
    if (!clipScenario || cacheKey === null || !(end > start)) return;
    let active = true;
    const timer = setTimeout(() => {
      const count = Math.min(CACHE_MAX_SAMPLES, Math.ceil((end - start) / CACHE_STEP_M) + 1);
      const step = (end - start) / (count - 1);
      const fill = async () => {
        const samples: PoseSample[] = [];
        for (let index = 0; index < count; index += CACHE_BATCH) {
          const batch = await Promise.all(
            Array.from({ length: Math.min(CACHE_BATCH, count - index) }, (_, offset) =>
              solverGateway.samplePose(clipScenario, start + (index + offset) * step)
            )
          );
          if (!active) return;
          samples.push(...batch);
        }
        setCache({ key: cacheKey, start, step, samples });
      };
      fill().catch(() => {
        // Without a cache, playback falls back to sampling each position directly.
      });
    }, CACHE_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `cacheKey` captures every input that changes the samples.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, solverGateway]);

  // Until the cache is ready, sample positions directly: one request at a time, newest wins.
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
    if (s === null || !clipScenario || cacheReady) return;

    const request = async (at: number) => {
      busyRef.current = true;
      try {
        const next = await solverGateway.samplePose(clipScenario, at);
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
  }, [cacheReady, clipScenario, s, solverGateway]);

  const previewSample = s === null ? null : cacheReady ? interpolatePoseSample(cache, s) : sample;
  const behind = s === null ? undefined : [...ordered].reverse().find((key) => key.s <= s + 1e-6);
  const label = behind?.label ?? (s === null ? "" : `before ${ordered[0]?.label ?? "first key"}`);

  return {
    s,
    sample: previewSample,
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
