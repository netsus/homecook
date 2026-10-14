"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { fetchWeightAttestationContext } from "@/lib/api/cooking";
import { fetchUserProfile } from "@/lib/api/mypage";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { WeightAttestationContext, WeightAttestationTarget } from "@/types/cooked-weight-attestation";

export function useWeightAttestationContext(target: WeightAttestationTarget, id: string | undefined, enabled: boolean) {
  const [context, setContext] = useState<WeightAttestationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const pendingRetry = useRef<(() => void) | null>(null);
  const current = useRef({ target, id, enabled, context });
  current.current = { target, id, enabled, context };

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setContext(null);
    current.current.context = null;
    if (!enabled || !id) { setLoading(false); return; }
    setLoading(true);
    const isCurrent = () => request === sequence.current && current.current.enabled
      && current.current.target === target && current.current.id === id;
    try {
      const before = await fetchUserProfile();
      if (!isCurrent()) return;
      if (!Number.isSafeInteger(before.account_generation) || Number(before.account_generation) <= 0) throw new Error("UNVERIFIED_SUBJECT");
      const value = await fetchWeightAttestationContext(target, id);
      if (!isCurrent()) return;
      const after = await fetchUserProfile();
      if (!isCurrent()) return;
      if (value.target_kind !== target || value.target_id !== id || before.id !== value.subject.owner_uuid
        || before.account_generation !== value.subject.account_generation || after.id !== before.id
        || after.account_generation !== before.account_generation) throw new Error("SUBJECT_CHANGED");
      current.current.context = value;
      setContext(value);
      setError(null);
      return value;
    } catch {
      if (isCurrent()) setError("개인 확인 정보를 불러오지 못했어요.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [enabled, id, target]);

  useEffect(() => {
    const requests = sequence;
    const retries = pendingRetry;
    setError(null);
    void refresh();
    if (!enabled || !id) return;
    const onForeground = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    const subscription = hasSupabasePublicEnv() ? getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "INITIAL_SESSION") return;
      ++requests.current;
      retries.current?.();
      current.current.context = null;
      setContext(null);
      setLoading(false);
      setError("계정 상태가 바뀌었어요. 개인 확인 정보를 다시 불러와 주세요.");
    }).data.subscription : null;
    return () => {
      ++requests.current;
      retries.current?.();
      current.current.context = null;
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
      subscription?.unsubscribe();
    };
  }, [enabled, id, refresh]);

  const isCurrentContext = (expected: WeightAttestationContext) => current.current.enabled
    && current.current.id === expected.target_id && current.current.target === expected.target_kind
    && current.current.context === expected;
  const accept = (value: WeightAttestationContext, expected: WeightAttestationContext) => {
    if (!isCurrentContext(expected) || value.target_id !== expected.target_id || value.target_kind !== expected.target_kind
      || value.subject.owner_uuid !== expected.subject.owner_uuid || value.subject.account_generation !== expected.subject.account_generation) return false;
    current.current.context = value;
    setContext(value);
    return true;
  };
  const retry = async (button: HTMLButtonElement, fallback: { current: HTMLElement | null }) => {
    if (loading || pendingRetry.current) return;
    const path = window.location.pathname;
    const ownedFocus = document.activeElement === button;
    let cancelled = false;
    let frame: number | null = null;
    const onFocus = (event: FocusEvent) => { if (event.target !== button && event.target !== document.body) cancelled = true; };
    const onPointer = (event: PointerEvent) => { if (event.target instanceof Node && !button.contains(event.target)) cancelled = true; };
    const cleanup = () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointer);
      if (pendingRetry.current === cleanup) pendingRetry.current = null;
    };
    pendingRetry.current = cleanup;
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", onPointer);
    const value = await refresh();
    if (!value || !ownedFocus || cancelled) { cleanup(); return; }
    frame = requestAnimationFrame(() => {
      const target = fallback.current;
      if (!cancelled && isCurrentContext(value) && window.location.pathname === path && target?.isConnected
        && !target.closest("[inert], [aria-hidden='true']")
        && (document.activeElement === button || document.activeElement === document.body)) target.focus({ preventScroll: true });
      cleanup();
    });
  };
  return { context: enabled && context?.target_kind === target && context.target_id === id ? context : null,
    loading, error, refresh, retry, isCurrentContext, accept };
}
