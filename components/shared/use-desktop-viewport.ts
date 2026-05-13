"use client";

import { useEffect, useState } from "react";

import { WEB_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";

function getDesktopViewportSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia(WEB_VIEW_MEDIA_QUERY).matches;
}

export function useDesktopViewport() {
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    getDesktopViewportSnapshot,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(WEB_VIEW_MEDIA_QUERY);
    const syncViewport = () => setIsDesktopViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  return isDesktopViewport;
}
