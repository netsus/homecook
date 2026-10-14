"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchWeightImprovementParticipation, isWeightImprovementApiError, mutateWeightImprovementParticipation } from "@/lib/api/weight-improvement-participation";
import { readPendingAction } from "@/lib/auth/pending-action";
import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";
import { useAuthGateStore } from "@/stores/ui-store";
import type { WeightImprovementDocument, WeightImprovementMutation, WeightImprovementParticipation, WeightImprovementSurface } from "@/types/weight-improvement-participation";
import { WeightImprovementParticipationNotice } from "./participation-notice";

interface ParticipationContextValue {
  status: WeightImprovementParticipation | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  open: (surface: WeightImprovementSurface, expected: WeightImprovementParticipation) => void;
  withdraw: (surface: WeightImprovementSurface, expected: WeightImprovementParticipation) => Promise<void>;
}
const ParticipationContext = createContext<ParticipationContextValue | null>(null);
export function useWeightImprovementParticipation() { return useContext(ParticipationContext); }
function subjectKey(status: WeightImprovementParticipation) {
  return `${status.subject.owner_uuid}:${status.subject.account_generation}:${status.purpose}`;
}
function noticeKey(status: WeightImprovementParticipation) { return `homecook.weight-improvement-notice:${subjectKey(status)}`; }
function noticeWasDismissed(status: WeightImprovementParticipation) {
  try { return sessionStorage.getItem(noticeKey(status)) !== null; } catch { return false; }
}
function rememberNotice(status: WeightImprovementParticipation) {
  try { sessionStorage.setItem(noticeKey(status), "seen"); } catch { /* Server state remains authoritative. */ }
}
export function automaticParticipationSurface(): "mobile_web" | "mobile_pwa" | null {
  if (navigator.maxTouchPoints < 1 || !window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(min-width: 1024px)").matches) return null;
  return window.matchMedia("(display-mode: standalone)").matches ? "mobile_pwa" : "mobile_web";
}

// Preparation is deliberately dark outside the existing loopback QA fixture mode.
// Publishing a production consent document requires the later policy/operating approval.
export function WeightImprovementParticipationProvider({ children }: { children: React.ReactNode }) {
  return isQaFixtureClientModeEnabled() ? <ActiveParticipationProvider>{children}</ActiveParticipationProvider> : <>{children}</>;
}

function ActiveParticipationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const authGateOpen = useAuthGateStore((state) => state.isOpen);
  const [status, setStatus] = useState<WeightImprovementParticipation | null>(null);
  const statusRef = useRef<WeightImprovementParticipation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState<WeightImprovementSurface | null>(null);
  const surfaceSubjectRef = useRef<string | null>(null);
  const pendingSeenRef = useRef<Promise<void> | null>(null);
  const readSequenceRef = useRef(0);
  const retryRef = useRef<{ input: WeightImprovementMutation; key: string } | null>(null);
  const publish = useCallback((next: WeightImprovementParticipation) => {
    const current = statusRef.current;
    if (current && subjectKey(current) === subjectKey(next) && current.revision > next.revision) return;
    if (current && subjectKey(current) !== subjectKey(next)) {
      setSurface(null);
      surfaceSubjectRef.current = null;
      pendingSeenRef.current = null;
      retryRef.current = null;
    }
    statusRef.current = next;
    setStatus(next);
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++readSequenceRef.current;
    setLoading(true);
    try {
      const next = await fetchWeightImprovementParticipation();
      if (sequence !== readSequenceRef.current) return;
      publish(next);
      setError(null);
    } catch (caught) {
      if (sequence !== readSequenceRef.current) return;
      statusRef.current = null;
      setStatus(null);
      setSurface(null);
      surfaceSubjectRef.current = null;
      pendingSeenRef.current = null;
      retryRef.current = null;
      setError(isWeightImprovementApiError(caught) && caught.status === 401 ? null : "참여 정보를 확인하지 못했어요. 다른 기능은 계속 이용할 수 있어요.");
    } finally { if (sequence === readSequenceRef.current) setLoading(false); }
  }, [publish]);
  const mutate = useCallback(async (input: WeightImprovementMutation) => {
    const current = statusRef.current;
    if (!current || current.subject.owner_uuid !== input.expected_subject.owner_uuid || current.subject.account_generation !== input.expected_subject.account_generation) return false;
    ++readSequenceRef.current;
    setLoading(false);
    const pending = retryRef.current;
    const key = pending && JSON.stringify(pending.input) === JSON.stringify(input) ? pending.key : crypto.randomUUID();
    retryRef.current = { input, key };
    try {
      const next = await mutateWeightImprovementParticipation(input, key);
      if (subjectKey(next) !== subjectKey(current)) throw new Error("참여 계정이 바뀌었어요.");
      if (!statusRef.current || subjectKey(statusRef.current) !== subjectKey(current)) return false;
      publish(next);
      retryRef.current = null;
      setError(null);
      return true;
    } catch (caught) {
      if (!statusRef.current || subjectKey(statusRef.current) !== subjectKey(current)) return false;
      if (isWeightImprovementApiError(caught) && caught.status === 401) {
        ++readSequenceRef.current;
        statusRef.current = null;
        setStatus(null);
        setSurface(null);
        surfaceSubjectRef.current = null;
        pendingSeenRef.current = null;
        retryRef.current = null;
        setLoading(false);
        setError("로그인 상태가 바뀌었어요. 참여 정보를 다시 확인해 주세요.");
        return false;
      }
      const message = isWeightImprovementApiError(caught) ? caught.message : "참여 선택을 저장하지 못했어요. 다른 기능은 계속 이용할 수 있어요.";
      setError(message);
      if (isWeightImprovementApiError(caught) && caught.status === 409) {
        retryRef.current = null;
        await refresh();
        if (statusRef.current && subjectKey(statusRef.current) === subjectKey(current)) setError(message);
      }
      return false;
    }
  }, [publish, refresh]);
  const recordSeen = useCallback((selectedSurface: WeightImprovementSurface) => {
    const current = statusRef.current;
    if (!current || current.notice_seen_at || pendingSeenRef.current) return;
    rememberNotice(current);
    const request = mutate({ action: "notice_seen", expected_subject: current.subject, expected_revision: current.revision, surface: selectedSurface }).then(() => undefined);
    pendingSeenRef.current = request;
    void request.finally(() => { if (pendingSeenRef.current === request) pendingSeenRef.current = null; });
  }, [mutate]);
  useEffect(() => { void refresh(); }, [pathname, refresh]);
  useEffect(() => {
    const foreground = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => { window.removeEventListener("focus", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [refresh]);
  useEffect(() => {
    if (!status?.participation_enabled || !status.document || status.decision !== "unanswered" || status.notice_seen_at || surface || loading || authGateOpen) return;
    const selectedSurface = automaticParticipationSurface();
    if (!selectedSurface) return;
    const safeRoutes = ["/", "/planner", "/pantry", "/mypage"];
    if (!safeRoutes.includes(pathname) || readPendingAction() || new URLSearchParams(window.location.search).has("resumeAction")) return;
    if (noticeWasDismissed(status)) {
      recordSeen(selectedSurface);
      return;
    }
    const tick = requestAnimationFrame(() => {
      if (!statusRef.current || subjectKey(statusRef.current) !== subjectKey(status)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"], main [aria-busy="true"]')) return;
      surfaceSubjectRef.current = subjectKey(status);
      setSurface(selectedSurface);
      recordSeen(selectedSurface);
    });
    return () => cancelAnimationFrame(tick);
  }, [authGateOpen, loading, pathname, recordSeen, status, surface]);
  const open = (selectedSurface: WeightImprovementSurface, expected: WeightImprovementParticipation) => {
    const current = statusRef.current;
    if (!current?.participation_enabled || !current.document || busy || subjectKey(current) !== subjectKey(expected)) return;
    setError(null);
    surfaceSubjectRef.current = subjectKey(current);
    setSurface(selectedSurface);
    recordSeen(selectedSurface);
  };
  const close = () => {
    if (busy) return;
    if (statusRef.current) rememberNotice(statusRef.current);
    setSurface(null);
    surfaceSubjectRef.current = null;
  };
  const decline = async (expected: WeightImprovementParticipation) => {
    const selectedSurface = surface;
    const expectedSubject = subjectKey(expected);
    if (surfaceSubjectRef.current !== expectedSubject) return;
    close();
    await pendingSeenRef.current;
    const current = statusRef.current;
    if (current && selectedSurface && subjectKey(current) === expectedSubject) await mutate({ action: "decline", expected_subject: current.subject, expected_revision: current.revision, surface: selectedSurface });
  };
  const optIn = async (document: WeightImprovementDocument, expected: WeightImprovementParticipation) => {
    if (busy || !surface) return;
    const expectedSubject = subjectKey(expected);
    if (surfaceSubjectRef.current !== expectedSubject) return;
    setBusy(true);
    try {
      await pendingSeenRef.current;
      const current = statusRef.current;
      if (current && subjectKey(current) === expectedSubject && await mutate({ action: "opt_in", expected_subject: current.subject, expected_revision: current.revision, surface,
        consent_checked: true, document_version: document.version, document_hash: document.hash })) setSurface(null);
    } finally { setBusy(false); }
  };
  const withdraw = async (selectedSurface: WeightImprovementSurface, expected: WeightImprovementParticipation) => {
    if (busy || !statusRef.current || subjectKey(statusRef.current) !== subjectKey(expected)) return;
    setBusy(true);
    try {
      await pendingSeenRef.current;
      const current = statusRef.current;
      if (current && subjectKey(current) === subjectKey(expected)) await mutate({ action: "withdraw", expected_subject: current.subject, expected_revision: current.revision, surface: selectedSurface });
    } finally { setBusy(false); }
  };
  return <ParticipationContext.Provider value={{ status, loading, busy, error, refresh, open, withdraw }}>
    {children}
    {surface && status?.participation_enabled && status.document ? <WeightImprovementParticipationNotice document={status.document}
      busy={busy} error={error} onClose={close} onDecline={() => void decline(status)} onOptIn={(document) => void optIn(document, status)} /> : null}
  </ParticipationContext.Provider>;
}
