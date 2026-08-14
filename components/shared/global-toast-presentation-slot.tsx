"use client";

import React, { type ReactNode } from "react";
import { createPortal } from "react-dom";

export const GLOBAL_TOAST_YOUTUBE_SLOT_ID = "global-toast-youtube-channel";
export const GLOBAL_TOAST_GROWTH_SLOT_ID = "global-toast-growth-channel";

export function GlobalToastPresentationSlot() {
  return (
    <section
      aria-label="새 알림"
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[80] mx-auto flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]"
      data-testid="global-toast-presentation-slot"
    >
      <div
        className="flex w-full flex-col gap-2"
        data-testid="global-toast-channel-youtube"
        id={GLOBAL_TOAST_YOUTUBE_SLOT_ID}
      />
      <div
        className="flex w-full flex-col gap-2"
        data-testid="global-toast-channel-growth"
        id={GLOBAL_TOAST_GROWTH_SLOT_ID}
      />
    </section>
  );
}

export function GlobalToastPortal({
  children,
  enabled,
  slotId,
}: {
  children: ReactNode;
  enabled: boolean;
  slotId: string;
}) {
  if (!enabled) return children;
  if (typeof document === "undefined") return null;

  const target = document.getElementById(slotId);
  return target ? createPortal(children, target) : null;
}
