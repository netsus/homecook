"use client";

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

export const GLOBAL_TOAST_YOUTUBE_SLOT_ID = "global-toast-youtube-channel";
export const GLOBAL_TOAST_GROWTH_SLOT_ID = "global-toast-growth-channel";

type GlobalToastChannel = "growth" | "youtube";

interface GlobalToastPresentationContextValue {
  grants: Record<GlobalToastChannel, boolean>;
  limits: Record<GlobalToastChannel, number>;
  setCandidate: (channel: GlobalToastChannel, active: boolean) => void;
}

const GlobalToastPresentationContext = createContext<GlobalToastPresentationContextValue>({
  grants: { growth: true, youtube: true },
  limits: { growth: Number.POSITIVE_INFINITY, youtube: Number.POSITIVE_INFINITY },
  setCandidate: () => undefined,
});

export function GlobalToastPresentationProvider({ children }: { children: ReactNode }) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 359px)").matches);
  const [candidates, setCandidates] = useState<Record<GlobalToastChannel, boolean>>({
    growth: false,
    youtube: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 359px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const setCandidate = useCallback((channel: GlobalToastChannel, active: boolean) => {
    setCandidates((current) => current[channel] === active
      ? current
      : { ...current, [channel]: active });
  }, []);

  const grants = useMemo<Record<GlobalToastChannel, boolean>>(() => narrow
    ? {
        growth: !candidates.youtube && candidates.growth,
        youtube: candidates.youtube,
      }
    : { growth: true, youtube: true }, [candidates, narrow]);
  const limits = useMemo<Record<GlobalToastChannel, number>>(() => narrow
    ? { growth: 1, youtube: 1 }
    : { growth: Number.POSITIVE_INFINITY, youtube: Number.POSITIVE_INFINITY }, [narrow]);
  const value = useMemo(
    () => ({ grants, limits, setCandidate }),
    [grants, limits, setCandidate],
  );

  return (
    <GlobalToastPresentationContext.Provider value={value}>
      {children}
    </GlobalToastPresentationContext.Provider>
  );
}

export function useGlobalToastPresentationLimit(
  channel: GlobalToastChannel,
  coordinated: boolean,
) {
  const { limits } = useContext(GlobalToastPresentationContext);
  return coordinated ? limits[channel] : Number.POSITIVE_INFINITY;
}

export function useGlobalToastPresentationGrant(
  channel: GlobalToastChannel,
  active: boolean,
  coordinated: boolean,
) {
  const { grants, setCandidate } = useContext(GlobalToastPresentationContext);

  useEffect(() => {
    if (!coordinated) return undefined;
    setCandidate(channel, active);
    return () => setCandidate(channel, false);
  }, [active, channel, coordinated, setCandidate]);

  return coordinated ? grants[channel] : true;
}

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
