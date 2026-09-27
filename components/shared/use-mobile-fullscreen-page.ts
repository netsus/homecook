"use client";

import { useLayoutEffect } from "react";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";

let owners = 0;
let originalAttribute: string | null = null;

/** The page owns one viewport; its named content region owns the scrolling. */
export function useMobileFullscreenPage(enabled = true, resetKey?: string) {
  const mobile = useIsMobileViewport();
  useLayoutEffect(() => {
    if (!enabled || !mobile) return;
    const root = document.documentElement;
    if (owners++ === 0) originalAttribute = root.getAttribute("data-mobile-fullscreen-page");
    root.setAttribute("data-mobile-fullscreen-page", "true");
    const resetScroll = () => window.scrollTo({ left: 0, top: 0, behavior: "instant" });
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    return () => {
      cancelAnimationFrame(frame);
      if (--owners === 0) {
        if (originalAttribute === null) root.removeAttribute("data-mobile-fullscreen-page");
        else root.setAttribute("data-mobile-fullscreen-page", originalAttribute);
      }
    };
  }, [enabled, mobile, resetKey]);
}
