"use client";

import { useMobileFullscreenPage } from "@/components/shared/use-mobile-fullscreen-page";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { CookedBatchCompletionSheet, type CookedBatchCompletionError } from "@/components/cooking/cooked-batch-completion-sheet";
import { MobileCookModeLoadingBoard } from "@/components/cooking/cook-mode-loading-board";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { useAppReturn } from "@/components/shared/use-app-return";
import { cancelSnapshotV2CookingSession, completeSnapshotV2CookingSession, fetchSnapshotV2CookMode, isCookingApiError } from "@/lib/api/cooking";
import { createPostAuthNextCookie } from "@/lib/auth/post-auth-next";
import type { SnapshotV2CompleteBody, SnapshotV2CookModeData } from "@/types/cooking";

export function SnapshotV2CookModeScreen({ initialAuthenticated, sessionId }: { initialAuthenticated: boolean; sessionId: string }) {
  useMobileFullscreenPage(true, sessionId);
  const [data, setData] = useState<SnapshotV2CookModeData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unauthorized">(initialAuthenticated ? "loading" : "unauthorized");
  const [cancelling, setCancelling] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionPreparing, setCompletionPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const completionRefreshRef = useRef(false);
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState<CookedBatchCompletionError | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const notifiedSessionRef = useRef<string | null>(null);
  const cancelKeyRef = useRef<string | null>(null);
  const completeAttemptRef = useRef<{ key: string; payload: string } | null>(null);
  const completeInFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const recoveryFocusRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const appReturn = useAppReturn({
    fallback: data?.mode === "standalone" ? `/recipe/${data.recipe.id}` : "/planner",
  });

  const loadSnapshot = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setData(null);
    setState("loading");
    try {
      const value = await fetchSnapshotV2CookMode(sessionId);
      if (requestId === requestIdRef.current) {
        setData(value);
        setState("ready");
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState(isCookingApiError(error) && error.status === 401 ? "unauthorized" : "error");
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!initialAuthenticated) return;
    void loadSnapshot();
    return () => { requestIdRef.current += 1; };
  }, [initialAuthenticated, loadSnapshot]);

  useEffect(() => {
    if (state === "error" || state === "unauthorized") {
      recoveryFocusRef.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    if (!completionNotice) return;
    const timeout = window.setTimeout(() => setCompletionNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [completionNotice]);

  const returnPath = `/cooking/session-attempts/${sessionId}/cook-mode`;
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;

  if (state === "unauthorized") return <CookModeRecoveryShell
    description="요리 기록은 소유자만 볼 수 있어요. 로그인하면 이 기록으로 돌아와요."
    primaryAction={<a className="inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-[var(--brand)] px-5 font-bold text-[var(--text-inverse)]" href={loginHref} onClick={() => { document.cookie = createPostAuthNextCookie(returnPath); }} ref={recoveryFocusRef as React.RefObject<HTMLAnchorElement | null>}>로그인</a>}
    title="로그인이 필요해요"
  />;

  if (state === "loading") return <div role="status"><MobileCookModeLoadingBoard description="고정된 레시피를 불러오고 있어요." loadingTestId="snapshot-v2-cook-mode-loading-content" screenTestId="snapshot-v2-cook-mode-loading" title="요리 기록 준비 중" /></div>;
  if (state === "error" || !data) return <CookModeRecoveryShell
    description="잠시 후 다시 시도해 주세요. 고정된 레시피 기록만 다시 불러와요."
    primaryAction={<button className="min-h-12 w-full rounded-[16px] bg-[var(--brand)] px-5 font-bold text-[var(--text-inverse)]" onClick={() => void loadSnapshot()} ref={recoveryFocusRef as React.RefObject<HTMLButtonElement | null>} type="button">다시 시도</button>}
    title="요리 기록을 불러오지 못했어요"
  />;

  const submitCompletion = (body: SnapshotV2CompleteBody) => {
    if (completeInFlightRef.current || data.status !== "in_progress") return;
    const payload = JSON.stringify(body);
    const attempt = completeAttemptRef.current?.payload === payload
      ? completeAttemptRef.current
      : { key: crypto.randomUUID(), payload };
    completeAttemptRef.current = attempt;
    completeInFlightRef.current = true;
    setCompletionSubmitting(true);
    setCompletionError(null);
    void completeSnapshotV2CookingSession(sessionId, body, attempt.key)
      .then((result) => {
        if (notifiedSessionRef.current !== result.session_id) {
          notifiedSessionRef.current = result.session_id;
          const servings = result.cooked_batch.cooking_servings ?? data.recipe.cooking_servings;
          const lines = [`${result.cooked_batch.recipe_title} ${servings}인분을 완성했어요.`];
          if (result.pantry_removed > 0) {
            const selected = new Set(body.consumed_pantry_item_ids);
            const removed = data.pantry_candidates.filter((item) => selected.has(item.pantry_item_id));
            const names = removed.map((item) => item.name || item.standard_name).filter(Boolean);
            const label = names.length === result.pantry_removed ? names.join(", ") : `재료 ${result.pantry_removed}개`;
            lines.push(`팬트리에서 ${label} 차감했어요.`);
          }
          setCompletionNotice(lines.join("\n"));
        }
        setCompletionOpen(false);
        setData((current) => current ? { ...current, status: "completed" } : current);
      })
      .catch(async (error: unknown) => {
        if (isCookingApiError(error) && error.status === 401) {
          setCompletionOpen(false);
          setState("unauthorized");
          return;
        }
        if (isCookingApiError(error) && [404, 409, 422].includes(error.status) && error.code !== "ACCOUNT_SESSION_STALE") {
          try {
            const latest = await fetchSnapshotV2CookMode(sessionId);
            setData(latest);
            if (latest.status !== "in_progress") setCompletionOpen(false);
          } catch { /* Keep the submitted draft and its explicit error. */ }
        }
        setCompletionError(isCookingApiError(error)
          ? { code: error.code, fields: error.fields, message: error.message, status: error.status }
          : { code: "UNKNOWN_ERROR", fields: [], message: "요리 완료를 저장하지 못했어요.", status: 500 });
      })
      .finally(() => {
        completeInFlightRef.current = false;
        setCompletionSubmitting(false);
      });
  };

  const openCompletion = async () => {
    if (data.status !== "in_progress" || cancelling || completionRefreshRef.current) return;
    completionRefreshRef.current = true;
    setCompletionPreparing(true);
    setPreparationError(null);
    setCompletionError(null);
    try {
      const latest = await fetchSnapshotV2CookMode(sessionId);
      setData(latest);
      if (latest.status === "in_progress") setCompletionOpen(true);
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) setState("unauthorized");
      else setPreparationError("팬트리를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      completionRefreshRef.current = false;
      setCompletionPreparing(false);
    }
  };

  const cancelCooking = () => {
    if (cancelling || data.status !== "in_progress") return;
    setCancelling(true);
    const idempotencyKey = cancelKeyRef.current ?? crypto.randomUUID();
    cancelKeyRef.current = idempotencyKey;
    void cancelSnapshotV2CookingSession(sessionId, idempotencyKey)
      .then(() => {
        cancelKeyRef.current = null;
        setData((current) => current ? { ...current, status: "cancelled" } : current);
      })
      .catch(() => setState("error"))
      .finally(() => setCancelling(false));
  };

  return (
    <>
      <SnapshotV2CookModeView
        cancelling={cancelling}
        data={data}
        onCancel={cancelCooking}
        onComplete={() => void openCompletion()}
        preparingCompletion={completionPreparing}
        returnHref={appReturn.href}
      />
      {preparationError ? <AppFeedbackToast message={preparationError} position="bottom" tone="error" /> : null}
      {completionNotice ? <AppFeedbackToast className="pointer-events-none whitespace-pre-line" message={completionNotice} position="bottom" testId="cooking-completion-notice" tone="success" /> : null}
      {completionOpen ? (
        <CookedBatchCompletionSheet
          candidates={data.pantry_candidates}
          onClose={() => {
            if (!completionSubmitting) setCompletionOpen(false);
          }}
          onSubmit={submitCompletion}
          serverError={completionError}
          submitting={completionSubmitting}
        />
      ) : null}
    </>
  );
}

function CookModeRecoveryShell({
  description,
  primaryAction,
  title,
}: {
  description: string;
  primaryAction: React.ReactNode;
  title: string;
}) {
  return <main
    className="cook-mobile-whole-screen relative mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center overflow-hidden px-5 py-8 text-center"
    data-cook-theme="dark"
    data-testid="snapshot-v2-cook-mode-recovery"
    role="alert"
  >
    <section className="w-full rounded-[16px] bg-[var(--surface-alpha-08)] p-5 shadow-[var(--shadow-2)]">
      <p aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-alpha-12)] text-2xl">!</p>
      <h1 className="cook-mobile-whole-title text-xl font-extrabold">{title}</h1>
      <p className="cook-mobile-whole-subtitle mt-2 text-sm leading-6">{description}</p>
      <div className="mt-6 flex flex-col gap-3">
        {primaryAction}
        <button className="min-h-12 w-full rounded-[16px] border border-[var(--surface-alpha-24)] bg-transparent px-5 font-bold text-[var(--text-inverse)]" onClick={() => window.history.back()} type="button">이전 화면</button>
      </div>
    </section>
  </main>;
}
