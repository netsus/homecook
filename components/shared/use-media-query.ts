"use client";

import { useSyncExternalStore } from "react";

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

function getMediaQuerySnapshot(query: string, fallback: boolean) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return fallback;
  }

  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string, fallback: boolean) {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return () => {};
      }

      const mediaQuery = window.matchMedia(query) as LegacyMediaQueryList;
      const listener = () => onStoreChange();

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", listener);
        return () => mediaQuery.removeEventListener("change", listener);
      }

      mediaQuery.addListener?.(listener);
      return () => mediaQuery.removeListener?.(listener);
    },
    () => getMediaQuerySnapshot(query, fallback),
    () => fallback,
  );
}
