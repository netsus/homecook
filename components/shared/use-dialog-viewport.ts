"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Fixed dialogs follow the visible screen when a phone keyboard covers its layout viewport. */
export function useDialogViewport() {
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      // Do not counteract user pinch zoom. Browser accessibility zoom remains available.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      setStyle({
        "--dialog-viewport-height": `${viewport?.height ?? window.innerHeight}px`,
        "--dialog-viewport-top": `${viewport?.offsetTop ?? 0}px`,
      } as CSSProperties);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return style;
}
