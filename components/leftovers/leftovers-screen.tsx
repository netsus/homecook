"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppBackLink } from "@/components/shared/app-back-button";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { showActionConfirmation } from "@/stores/ui-store";
import { MealLogAddSheet, type MealLogSourceSelection } from "@/components/planner/meal-log-add-sheet";
import { createMealLogEntry, fetchMealLogDay } from "@/lib/api/meal-log";
import type { MealLogColumn } from "@/types/meal-log";
import { CookedBatchActionSheet, type CookedBatchActionError } from "./cooked-batch-action-sheet";
import { CookedBatchSection, type CookedBatchSectionState } from "./cooked-batch-section";
import { mergeCookedBatchPages, nextCookedBatchOperation, type CookedBatchAction, type CookedBatchMutationRequest, type CookedBatchOperation } from "./cooked-batch-state";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useMobileFullscreenPage } from "@/components/shared/use-mobile-fullscreen-page";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { adjustCookedBatch, closeUnweighedCookedBatch, discardCookedBatch, fetchCookedBatches, isCookingApiError, updateCookedBatchWeight } from "@/lib/api/cooking";
import type { CookedBatchProjection } from "@/types/cooking";

export interface LeftoversScreenProps { initialAuthenticated?: boolean }
export function LeftoversScreen({ initialAuthenticated = false }: LeftoversScreenProps) {
  useMobileFullscreenPage();
  const appReturn = useAppReturn({ fallback: "/planner" });
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthorized">(initialAuthenticated ? "authenticated" : "checking");
  const [batchState, setBatchState] = useState<CookedBatchSectionState>("loading");
  const [batchItems, setBatchItems] = useState<CookedBatchProjection[]>([]);
  const [batchCursor, setBatchCursor] = useState<string | null>(null);
  const [batchHasNext, setBatchHasNext] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchPagePending, setBatchPagePending] = useState(false);
  const [batchActionTarget, setBatchActionTarget] = useState<{ action: CookedBatchAction; batch: CookedBatchProjection } | null>(null);
  const [batchActionError, setBatchActionError] = useState<CookedBatchActionError | null>(null);
  const [batchMutationPending, setBatchMutationPending] = useState(false);
  const batchOperationRef = useRef<CookedBatchOperation | null>(null);
  const batchActionReturnFocusRef = useRef<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "status" } | null>(null);
  const [mealLogTarget, setMealLogTarget] = useState<MealLogSourceSelection | null>(null);
  const [mealLogColumns, setMealLogColumns] = useState<MealLogColumn[]>([]);
  const [mealLogDate, setMealLogDate] = useState("");
  const logOpenRequest = useRef(0);
  const logMutationKeys = useRef(new Map<string, string>());
  const listGeneration = useRef(0);
  const mutationLatch = useRef(false);
  useEffect(() => {
    const override = readE2EAuthOverride();
    if (typeof override === "boolean") { setAuthState(override ? "authenticated" : "unauthorized"); return; }
    if (!hasSupabasePublicEnv()) { if (!initialAuthenticated) setAuthState("unauthorized"); return; }
    const client = getSupabaseBrowserClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setAuthState(session ? "authenticated" : "unauthorized"));
    if (!initialAuthenticated) void client.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => setAuthState(session ? "authenticated" : "unauthorized"));
    return () => subscription.unsubscribe();
  }, [initialAuthenticated]);
  useEffect(() => {
    if (authState !== "authenticated") { setMealLogTarget(null); setBatchActionTarget(null); setBatchItems([]); logMutationKeys.current.clear(); }
    const requests = logOpenRequest, lists = listGeneration;
    return () => { ++requests.current; ++lists.current; };
  }, [authState]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const loadCookedBatches = useCallback(async ({ preserve = false }: { preserve?: boolean } = {}) => {
    const generation = ++listGeneration.current;
    if (!preserve) setBatchState("loading");
    setBatchError(null);
    try {
      const data = await fetchCookedBatches({ availability: "all", limit: 20 });
      if (generation !== listGeneration.current) return null;
      setBatchItems(data.items);
      setBatchCursor(data.next_cursor);
      setBatchHasNext(data.has_next);
      setBatchState(data.items.length > 0 ? "ready" : "empty");
      return data.items;
    } catch (error) {
      if (generation !== listGeneration.current) return null;
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return null;
      }
      const message = isCookingApiError(error) && error.status === 404
        ? "요청한 기록을 찾을 수 없어요."
        : error instanceof Error ? error.message : "중량·잔량 기록을 불러오지 못했어요.";
      setBatchError(message);
      if (!preserve) setBatchState("error");
      return null;
    }
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadCookedBatches();
  }, [authState, loadCookedBatches]);

  const loadMoreCookedBatches = useCallback(async () => {
    if (!batchCursor || batchPagePending || batchMutationPending) return;
    const generation = listGeneration.current;
    setBatchPagePending(true);
    setBatchError(null);
    try {
      const data = await fetchCookedBatches({ availability: "all", cursor: batchCursor, limit: 20 });
      if (generation !== listGeneration.current) return;
      setBatchItems((current) => mergeCookedBatchPages(current, data.items));
      setBatchCursor(data.next_cursor);
      setBatchHasNext(data.has_next);
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      } else {
        setBatchError(error instanceof Error ? error.message : "다음 기록을 불러오지 못했어요.");
      }
    } finally {
      setBatchPagePending(false);
    }
  }, [batchCursor, batchMutationPending, batchPagePending]);

  const openBatchAction = useCallback((batch: CookedBatchProjection, action: CookedBatchAction) => {
    batchActionReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setBatchActionTarget({ action, batch });
    setBatchActionError(null);
    batchOperationRef.current = null;
  }, []);

  const closeBatchAction = useCallback(() => {
    if (batchMutationPending) return;
    const returnTarget = batchActionReturnFocusRef.current;
    const fallbackSelector = batchActionTarget
      ? `[data-batch-id="${batchActionTarget.batch.id}"][data-batch-action="${batchActionTarget.action}"]`
      : null;
    setBatchActionTarget(null);
    setBatchActionError(null);
    batchOperationRef.current = null;
    requestAnimationFrame(() => {
      const fallbackTarget = fallbackSelector
        ? document.querySelector<HTMLElement>(fallbackSelector)
        : null;
      if (returnTarget?.isConnected) returnTarget.focus();
      else fallbackTarget?.focus();
      batchActionReturnFocusRef.current = null;
    });
  }, [batchActionTarget, batchMutationPending]);

  const submitBatchAction = useCallback(async (request: CookedBatchMutationRequest) => {
    if (!batchActionTarget || mutationLatch.current) return;
    mutationLatch.current = true;
    const operation = nextCookedBatchOperation(batchOperationRef.current, request);
    batchOperationRef.current = operation;
    setBatchMutationPending(true);
    setBatchActionError(null);
    try {
      let result;
      if (request.action === "set_finished_weight" || request.action === "mark_unrecoverable") {
        result = await updateCookedBatchWeight(batchActionTarget.batch.id, request, operation.key);
      } else if (request.action === "discard") {
        const { action: _action, ...body } = request;
        void _action;
        result = await discardCookedBatch(batchActionTarget.batch.id, body, operation.key);
      } else if (request.action === "adjust") {
        const { action: _action, ...body } = request;
        void _action;
        result = await adjustCookedBatch(batchActionTarget.batch.id, body, operation.key);
      } else {
        result = await closeUnweighedCookedBatch(batchActionTarget.batch.id, request, operation.key);
      }
      setBatchItems((current) => current.map((item) => item.id === result.batch.id ? result.batch : item));
      setBatchActionTarget(null);
      setBatchActionError(null);
      batchOperationRef.current = null;
      setFeedback({ message: "저장했어요.", tone: "status" });
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setBatchActionTarget(null);
        setAuthState("unauthorized");
      } else {
        const apiError: CookedBatchActionError = isCookingApiError(error)
          ? { code: error.code, fields: error.fields, message: error.status === 404 ? "요청한 기록을 찾을 수 없어요." : error.message, status: error.status }
          : { code: "UNKNOWN_ERROR", fields: [], message: error instanceof Error ? error.message : "요청을 처리하지 못했어요.", status: 500 };
        setBatchActionError(apiError);
        const refreshed = apiError.status === 409 || apiError.status === 422
          ? await loadCookedBatches({ preserve: true })
          : null;
        if (refreshed) {
          const latest = refreshed.find((item) => item.id === batchActionTarget.batch.id);
          if (latest) setBatchActionTarget((current) => current ? { ...current, batch: latest } : current);
        }
        if (apiError.code === "WEIGHT_UNRECOVERABLE") setBatchActionTarget(null);
      }
    } finally {
      mutationLatch.current = false;
      setBatchMutationPending(false);
    }
  }, [batchActionTarget, loadCookedBatches]);

  const openMealLogSheet = useCallback(async (item: CookedBatchProjection) => {
    if (authState !== "authenticated") return;
    const request = ++logOpenRequest.current;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    try {
      const day = await fetchMealLogDay(today);
      if (request !== logOpenRequest.current) return;
      if (!day.active_columns.length) throw new Error("식사 기록의 끼니를 확인하지 못했어요.");
      setMealLogColumns(day.active_columns);
      setMealLogDate(today);
      setMealLogTarget({ type: "cooked_batch", id: item.id, name: item.recipe_title, brand: null, amount: Math.min(100, item.remaining_weight_g ?? 100), unit: "g" });
    } catch (error) {
      if (request === logOpenRequest.current) setFeedback({ message: error instanceof Error ? error.message : "식사 기록을 열지 못했어요.", tone: "error" });
    }
  }, [authState]);

  const mealLogSheet = mealLogTarget ? (
    <MealLogAddSheet
      columns={mealLogColumns}
      date={mealLogDate}
      initialColumnId={mealLogColumns[0]?.id ?? ""}
      initialSelection={mealLogTarget}
      initialSuggestionConfirmed={false}
      onClose={() => setMealLogTarget(null)}
      onUnauthorized={() => { setMealLogTarget(null); setAuthState("unauthorized"); }}
      onSave={async (selection, columnId, date) => {
        const input = {
          consumedAt: null, consumedLocalDate: date, mealPlanColumnId: columnId,
          quantity: { amount: selection.amount, unit: selection.unit },
          source: { id: selection.id, type: selection.type },
          timezoneNameSnapshot: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const fingerprint = JSON.stringify(input);
        const key = logMutationKeys.current.get(fingerprint) ?? crypto.randomUUID();
        logMutationKeys.current.set(fingerprint, key);
        await createMealLogEntry(input, key);
        logMutationKeys.current.delete(fingerprint);
        setMealLogTarget(null);
        showActionConfirmation("식사 기록에 추가했어요.");
        void loadCookedBatches();
      }}
    />
  ) : null;
  const selfHref = buildReturnHref("/leftovers", { returnSurface: "leftovers.list", returnTo: appReturn.href });
  const eatenHref = buildReturnHref("/leftovers/ate", { returnSurface: "leftovers.list", returnTo: selfHref });
  return <div className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--surface-fill)] text-[var(--foreground)] lg:static lg:mx-auto lg:h-auto lg:max-w-5xl lg:min-h-screen lg:overflow-visible" data-testid="leftovers-screen">
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b bg-[var(--surface)] px-4">
      <AppBackLink href={appReturn.href} />
      <h1 className="flex-1 text-xl font-bold">남은 요리</h1>
      <Link className="rounded-full border px-3 py-2 font-semibold" href={eatenHref}>다 먹은 요리</Link>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(100px+env(safe-area-inset-bottom))] lg:overflow-visible lg:pb-8" data-testid="leftovers-scroll">
      {authState === "unauthorized" ? <div className="p-8 text-center"><p>로그인이 필요해요.</p><Link className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-5 py-3 text-white" href={`/login?next=${encodeURIComponent(selfHref)}`}>로그인</Link></div> : <CookedBatchSection error={batchError} hasNext={batchHasNext} items={batchItems} onAction={openBatchAction} onRecord={batch => void openMealLogSheet(batch)} onLoadMore={() => void loadMoreCookedBatches()} onRetry={() => void loadCookedBatches()} pagePending={batchPagePending || batchMutationPending} state={batchState} />}
    </main>
    {feedback ? <AppFeedbackToast message={feedback.message} position="bottom" testId="feedback-toast" tone={feedback.tone === "error" ? "error" : "success"} /> : null}
    {batchActionTarget ? <CookedBatchActionSheet action={batchActionTarget.action} batch={batchActionTarget.batch} error={batchActionError} onClose={closeBatchAction} onSubmit={request => void submitBatchAction(request)} pending={batchMutationPending} /> : null}
    {mealLogSheet}
    <Wave1MobileBottomTab ariaLabel="남은 요리 하단 탭" currentTab="mypage" />
  </div>;
}
