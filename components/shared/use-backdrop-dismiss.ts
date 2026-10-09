"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/** A selection drag can synthesize a click on the common backdrop ancestor. */
export function useBackdropDismiss(onDismiss: () => void) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const tapped = useRef(false);
  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      tapped.current = false;
      pointer.current = event.target === event.currentTarget && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      const start = pointer.current;
      tapped.current = Boolean(start && start.id === event.pointerId
        && event.target === event.currentTarget
        && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8);
      pointer.current = null;
    },
    onPointerCancelCapture() {
      pointer.current = null;
      tapped.current = false;
    },
    onClick(event: MouseEvent<HTMLElement>) {
      const dismiss = tapped.current && event.target === event.currentTarget;
      tapped.current = false;
      if (dismiss) onDismiss();
    },
  };
}
