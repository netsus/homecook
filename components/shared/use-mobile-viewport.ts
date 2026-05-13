"use client";

import { useEffect, useState } from "react";

import { APP_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";

export function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia(APP_VIEW_MEDIA_QUERY);
    const syncViewport = () => setIsMobileViewport(query.matches);
    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

  return isMobileViewport;
}
