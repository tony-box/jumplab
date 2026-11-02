export type WorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type CanvasViewport = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  dpr: number;
  scale: number;
  worldToCss: (x: number, y: number) => [number, number];
  cssToWorld: (x: number, y: number) => [number, number];
  worldToBacking: (x: number, y: number) => [number, number];
};

export const createCanvasViewport = (
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  bounds: WorldBounds,
  padding = 24
): CanvasViewport => {
  const safeDpr = Math.max(1, dpr);
  const worldWidth = Math.max(0.001, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(0.001, bounds.maxY - bounds.minY);
  const drawableWidth = Math.max(1, cssWidth - padding * 2);
  const drawableHeight = Math.max(1, cssHeight - padding * 2);
  const scale = Math.min(drawableWidth / worldWidth, drawableHeight / worldHeight);
  const offsetX = (cssWidth - worldWidth * scale) / 2;
  const offsetY = (cssHeight - worldHeight * scale) / 2;
  const worldToCss = (x: number, y: number): [number, number] => [
    offsetX + (x - bounds.minX) * scale,
    cssHeight - (offsetY + (y - bounds.minY) * scale)
  ];
  const cssToWorld = (x: number, y: number): [number, number] => [
    bounds.minX + (x - offsetX) / scale,
    bounds.minY + (cssHeight - y - offsetY) / scale
  ];

  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.round(cssWidth * safeDpr),
    backingHeight: Math.round(cssHeight * safeDpr),
    dpr: safeDpr,
    scale,
    worldToCss,
    cssToWorld,
    worldToBacking: (x, y) => {
      const [cssX, cssY] = worldToCss(x, y);
      return [cssX * safeDpr, cssY * safeDpr];
    }
  };
};

export const configureCanvas = (
  canvas: HTMLCanvasElement,
  viewport: CanvasViewport
): CanvasRenderingContext2D => {
  // Only the backing store is sized here. Setting an inline CSS size would pin the canvas and
  // stop it from following its container when the layout changes.
  if (canvas.width !== viewport.backingWidth) canvas.width = viewport.backingWidth;
  if (canvas.height !== viewport.backingHeight) canvas.height = viewport.backingHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  return context;
};

export const observeCanvasViewport = (
  canvas: HTMLCanvasElement,
  bounds: WorldBounds,
  onViewport: (viewport: CanvasViewport) => void
): (() => void) => {
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) {
      return;
    }
    onViewport(
      createCanvasViewport(
        entry.contentRect.width,
        entry.contentRect.height,
        globalThis.devicePixelRatio || 1,
        bounds
      )
    );
  });
  observer.observe(canvas);
  return () => observer.disconnect();
};
