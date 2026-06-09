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

const wakeLockUserActivationEvents = [
  "pointerdown",
  "touchend",
  "click",
  "keydown",
] as const;

export type ScreenWakeLockStatus =
  | "off"
  | "unsupported"
  | "waiting"
  | "requesting"
  | "active"
  | "failed";

function canRequestWakeLock() {
  return (
    typeof navigator !== "undefined" &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    Boolean((navigator as NavigatorWithWakeLock).wakeLock?.request)
  );
}

export function useScreenWakeLock(enabled: boolean) {
  const [status, setStatus] = useState<ScreenWakeLockStatus>(
    enabled ? "waiting" : "off",
  );
  const activeRef = useRef<{
    sentinel: ScreenWakeLockSentinel;
    handleRelease: () => void;
  } | null>(null);
  const requestingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return;
    }

    let disposed = false;

    async function requestWakeLock() {
      if (!enabled || requestingRef.current) return;

      if (!canRequestWakeLock()) {
        const hasWakeLockApi =
          typeof navigator !== "undefined" &&
          Boolean((navigator as NavigatorWithWakeLock).wakeLock?.request);
        setStatus(hasWakeLockApi ? "waiting" : "unsupported");
        return;
      }

      const current = activeRef.current?.sentinel;
      if (current && current.released !== true) return;

      requestingRef.current = true;
      setStatus("requesting");
      try {
        const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
        const sentinel = await wakeLock?.request("screen");

        if (!sentinel) {
          setStatus("unsupported");
          return;
        }

        if (disposed) {
          void sentinel.release().catch(() => {});
          return;
        }

        const handleRelease = () => {
          if (activeRef.current?.sentinel === sentinel) {
            activeRef.current = null;
            setStatus("waiting");
          }
        };

        sentinel.addEventListener?.("release", handleRelease);
        activeRef.current = { sentinel, handleRelease };
        setStatus("active");
      } catch {
        activeRef.current = null;
        setStatus("failed");
      } finally {
        requestingRef.current = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    }

    function handleUserActivation() {
      void requestWakeLock();
    }

    const userActivationListenerOptions = { capture: true };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    for (const eventType of wakeLockUserActivationEvents) {
      document.addEventListener(
        eventType,
        handleUserActivation,
        userActivationListenerOptions,
      );
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      for (const eventType of wakeLockUserActivationEvents) {
        document.removeEventListener(
          eventType,
          handleUserActivation,
          userActivationListenerOptions,
        );
      }

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

  return status;
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

  const status = useScreenWakeLock(enabled && screenWakeLockEnabled);

  return {
    enabled: screenWakeLockEnabled,
    status,
    isActive: status === "active",
  };
}
