export type InteractionPerformanceSnapshot = {
  frameIntervalsMs: number[];
  inputToPaintMs: number[];
  droppedFrames: number;
};

const snapshot: InteractionPerformanceSnapshot = {
  frameIntervalsMs: [],
  inputToPaintMs: [],
  droppedFrames: 0
};

let installed = false;

const retain = (samples: number[], value: number): void => {
  samples.push(value);
  if (samples.length > 600) samples.shift();
};

export const installPerformanceInstrumentation = (): void => {
  if (installed) return;
  installed = true;
  let previousFrame: number | null = null;
  const sampleFrame = (timestamp: number): void => {
    if (previousFrame !== null) {
      const interval = timestamp - previousFrame;
      retain(snapshot.frameIntervalsMs, interval);
      if (interval > 25) snapshot.droppedFrames += Math.max(1, Math.round(interval / 16.67) - 1);
    }
    previousFrame = timestamp;
    requestAnimationFrame(sampleFrame);
  };
  requestAnimationFrame(sampleFrame);

  const sampleInput = (): void => {
    const startedAt = performance.now();
    requestAnimationFrame(() => retain(snapshot.inputToPaintMs, performance.now() - startedAt));
  };
  document.addEventListener("input", sampleInput, { capture: true, passive: true });
  document.addEventListener("pointerdown", sampleInput, { capture: true, passive: true });
  document.addEventListener("keydown", sampleInput, { capture: true, passive: true });
};

export const getPerformanceSnapshot = (): InteractionPerformanceSnapshot => ({
  frameIntervalsMs: [...snapshot.frameIntervalsMs],
  inputToPaintMs: [...snapshot.inputToPaintMs],
  droppedFrames: snapshot.droppedFrames
});

export const resetPerformanceSnapshot = (): void => {
  snapshot.frameIntervalsMs.length = 0;
  snapshot.inputToPaintMs.length = 0;
  snapshot.droppedFrames = 0;
};
