import { useEffect, useState, type RefObject } from "react";

/**
 * Returns a counter that changes whenever the canvas container is resized or the device pixel
 * ratio changes (browser zoom, moving to another monitor), so draw effects can re-run.
 */
export const useCanvasResize = (canvasRef: RefObject<HTMLCanvasElement | null>): number => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const target = canvas?.parentElement ?? canvas;
    if (!target) return;
    const bump = () => setTick((value) => value + 1);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      let width = target.clientWidth;
      let height = target.clientHeight;
      observer = new ResizeObserver(() => {
        if (target.clientWidth === width && target.clientHeight === height) return;
        width = target.clientWidth;
        height = target.clientHeight;
        bump();
      });
      observer.observe(target);
    }

    let media: MediaQueryList | null = null;
    const watchRatio = () => {
      media?.removeEventListener("change", onRatioChange);
      media =
        globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`) ?? null;
      media?.addEventListener("change", onRatioChange);
    };
    const onRatioChange = () => {
      watchRatio();
      bump();
    };
    watchRatio();

    return () => {
      observer?.disconnect();
      media?.removeEventListener("change", onRatioChange);
    };
  }, [canvasRef]);

  return tick;
};
