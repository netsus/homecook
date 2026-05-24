"use client";

import { useEffect, useRef, useState } from "react";

import { fetchUserProfile } from "@/lib/api/mypage";

type ScreenWakeLockSentinel = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (
    type: "release",
    listener: () => void,
  ) => void;
  removeEventListener?: (
    type: "release",
    listener: () => void,
  ) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

function canRequestWakeLock() {
  return (
    typeof navigator !== "undefined" &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    Boolean((navigator as NavigatorWithWakeLock).wakeLock?.request)
  );
}

export function useScreenWakeLock(enabled: boolean) {
  const activeRef = useRef<{
    sentinel: ScreenWakeLockSentinel;
    handleRelease: () => void;
  } | null>(null);
  const requestingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    async function requestWakeLock() {
      if (!enabled || requestingRef.current || !canRequestWakeLock()) return;

      const current = activeRef.current?.sentinel;
      if (current && current.released !== true) return;

      requestingRef.current = true;
      try {
        const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
        const sentinel = await wakeLock?.request("screen");

        if (!sentinel) return;

        if (disposed) {
          void sentinel.release().catch(() => {});
          return;
        }

        const handleRelease = () => {
          if (activeRef.current?.sentinel === sentinel) {
            activeRef.current = null;
          }
        };

        sentinel.addEventListener?.("release", handleRelease);
        activeRef.current = { sentinel, handleRelease };
      } catch {
        activeRef.current = null;
      } finally {
        requestingRef.current = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      const active = activeRef.current;
      activeRef.current = null;
      requestingRef.current = false;

      if (active) {
        active.sentinel.removeEventListener?.("release", active.handleRelease);

        if (active.sentinel.released !== true) {
          void active.sentinel.release().catch(() => {});
        }
      }
    };
  }, [enabled]);
}

export function useUserScreenWakeLock(enabled: boolean) {
  const [screenWakeLockEnabled, setScreenWakeLockEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setScreenWakeLockEnabled(false);
      return;
    }

    let cancelled = false;

    void fetchUserProfile()
      .then((profile) => {
        if (!cancelled) {
          setScreenWakeLockEnabled(profile.settings.screen_wake_lock);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScreenWakeLockEnabled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useScreenWakeLock(enabled && screenWakeLockEnabled);
}
