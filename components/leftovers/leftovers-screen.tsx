"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  eatLeftover,
  fetchLeftovers,
  isLeftoverApiError,
} from "@/lib/api/leftovers";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import { fetchPlanner } from "@/lib/api/planner";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { LeftoverListItemData } from "@/types/leftover";
import type { PlannerColumnData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";
type FeedbackTone = "error" | "status";

const FEEDBACK_AUTO_DISMISS_MS = 4000;

export interface LeftoversScreenProps {
  initialAuthenticated?: boolean;
}

function formatCookedAt(dateStr: string) {
  const date = new Date(dateStr);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function LeftoverCard({
  item,
  isEating,
  anyMutating,
  onEat,
  onPlannerAdd,
}: {
  item: LeftoverListItemData;
  isEating: boolean;
  anyMutating: boolean;
  onEat: (id: string) => void;
  onPlannerAdd: (item: LeftoverListItemData) => void;
}) {
  return (
    <article
      className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
      data-testid="leftover-card"
    >
      <div className="flex items-center gap-3">
        {item.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] object-cover"
            height={56}
            src={item.recipe_thumbnail_url}
            unoptimized
            width={56}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-fill)]">
            <span className="text-xl" aria-hidden="true">
              🍲
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-[var(--foreground)]">
            {item.recipe_title}
          </p>
          <p className="text-sm text-[var(--text-3)]">
            {formatCookedAt(item.cooked_at)} 요리
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] text-sm font-semibold text-[var(--text-2)] active:border-[var(--text-2)] active:bg-[var(--surface-subtle)] disabled:opacity-60"
          data-testid="eat-button"
          disabled={anyMutating}
          onClick={() => onEat(item.id)}
          type="button"
        >
          {isEating ? "처리 중..." : "다먹음"}
        </button>
        <button
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] text-sm font-bold text-white active:bg-[var(--brand-deep)] disabled:opacity-60"
          data-testid="planner-add-button"
          disabled={anyMutating}
          onClick={() => onPlannerAdd(item)}
          type="button"
        >
          플래너에 추가
        </button>
      </div>
    </article>
  );
}

export function LeftoversScreen({
  initialAuthenticated = false,
}: LeftoversScreenProps) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [items, setItems] = useState<LeftoverListItemData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eatingId, setEatingId] = useState<string | null>(null);

  // Feedback toast
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: FeedbackTone;
  } | null>(null);

  useEffect(() => {
    if (!feedback) return;

    const timer = setTimeout(() => setFeedback(null), FEEDBACK_AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [feedback]);

  // Planner-add sheet state
  const [plannerAddTarget, setPlannerAddTarget] =
    useState<LeftoverListItemData | null>(null);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] =
    useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);

  const buildSelectableDates = useCallback(() => {
    const dates: string[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${day}`);
    }

    return dates;
  }, []);

  const selectableDates = useMemo(
    () => buildSelectableDates(),
    [buildSelectableDates],
  );

  // Auth check
  useEffect(() => {
    const e2eOverride = readE2EAuthOverride();

    if (typeof e2eOverride === "boolean") {
      setAuthState(e2eOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (!mounted) return;
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // Load leftovers
  const loadLeftovers = useCallback(async () => {
    setScreenState("loading");
    setErrorMessage(null);

    try {
      const data = await fetchLeftovers("leftover");
      setItems(data.items);
      setScreenState(data.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (isLeftoverApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "남은요리를 불러오지 못했어요.",
      );
      setScreenState("error");
    }
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadLeftovers();
  }, [authState, loadLeftovers]);

  // Eat action
  const handleEat = useCallback(
    async (leftoverId: string) => {
      if (eatingId) return;
      setEatingId(leftoverId);
      setFeedback(null);

      try {
        await eatLeftover(leftoverId);
        setItems((current) => current.filter((item) => item.id !== leftoverId));
        setFeedback({ message: "다먹음 처리됐어요", tone: "status" });

        // Check if list is now empty
        setItems((current) => {
          if (current.length === 0) {
            setScreenState("empty");
          }

          return current;
        });
      } catch (error) {
        if (isLeftoverApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }

        setFeedback({
          message:
            error instanceof Error
              ? error.message
              : "다먹음 처리에 실패했어요.",
          tone: "error",
        });
      } finally {
        setEatingId(null);
      }
    },
    [eatingId],
  );

  // Planner-add flow
  const loadPlannerColumns = useCallback(async () => {
    setPlannerAddSheetState("loading-columns");
    setPlannerAddError(null);

    try {
      const today = selectableDates[0] ?? "";
      const data = await fetchPlanner(today, today);
      setPlannerColumns(data.columns);
      setSelectedPlanColumnId((current) => {
        if (current && data.columns.some((col) => col.id === current)) {
          return current;
        }

        return data.columns[0]?.id ?? "";
      });
      setPlannerAddSheetState("ready");
    } catch {
      setPlannerAddSheetState("error");
      setPlannerAddError("플래너 슬롯을 불러오지 못했어요.");
    }
  }, [selectableDates]);

  const openPlannerAddSheet = useCallback(
    async (item: LeftoverListItemData) => {
      if (authState !== "authenticated") return;

      setPlannerAddTarget(item);
      setIsPlannerAddSheetOpen(true);
      setPlannerAddError(null);
      setFeedback(null);
      setSelectedPlanDate(selectableDates[0] ?? "");
      setPlannerServings(1);

      await loadPlannerColumns();
    },
    [authState, loadPlannerColumns, selectableDates],
  );

  const closePlannerAddSheet = useCallback(() => {
    if (plannerAddSheetState === "submitting") return;
    setIsPlannerAddSheetOpen(false);
    setPlannerAddError(null);
    setPlannerAddTarget(null);
  }, [plannerAddSheetState]);

  const handlePlannerAddSubmit = useCallback(async () => {
    if (
      !plannerAddTarget ||
      !selectedPlanColumnId ||
      !selectedPlanDate ||
      plannerAddSheetState !== "ready"
    ) {
      return;
    }

    setPlannerAddSheetState("submitting");
    setPlannerAddError(null);

    try {
      await createMeal({
        recipe_id: plannerAddTarget.recipe_id,
        plan_date: selectedPlanDate,
        column_id: selectedPlanColumnId,
        planned_servings: plannerServings,
        leftover_dish_id: plannerAddTarget.id,
      });

      setIsPlannerAddSheetOpen(false);
      setPlannerAddTarget(null);

      const [, planM, planD] = selectedPlanDate.split("-").map(Number);
      const dateLabel = `${planM}월 ${planD}일`;
      const columnName =
        plannerColumns.find((c) => c.id === selectedPlanColumnId)?.name ??
        "선택한 끼니";
      setFeedback({
        message: `${dateLabel} ${columnName}에 추가됐어요`,
        tone: "status",
      });
    } catch (error) {
      const message =
        isMealApiError(error) && error.status === 403
          ? "내 플래너 슬롯에만 추가할 수 있어요."
          : error instanceof Error
            ? error.message
            : "플래너 추가에 실패했어요. 다시 시도해주세요.";

      setPlannerAddError(message);
      setPlannerAddSheetState("ready");
    }
  }, [
    plannerAddTarget,
    plannerAddSheetState,
    plannerColumns,
    plannerServings,
    selectedPlanColumnId,
    selectedPlanDate,
  ]);

  // Auth checking state
  if (authState === "checking") {
    return (
      <ContentState
        description="남은요리 화면에 접근하기 위해 로그인 상태를 확인하고 있어요."
        eyebrow="세션 확인"
        tone="loading"
        title="로그인 상태를 확인하고 있어요"
      />
    );
  }

  // Unauthorized state
  if (authState === "unauthorized") {
    return (
      <ContentState
        description="남은요리를 관리하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
        eyebrow="로그인 필요"
        safeBottomPadding
        tone="gate"
        title="이 화면은 로그인이 필요해요"
      >
        <div className="space-y-3">
          <SocialLoginButtons nextPath="/leftovers" />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/planner"
          >
            플래너로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="leftovers-screen">
      {/* AppBar */}
      <div className="flex items-center gap-3">
        <Link
          aria-label="뒤로가기"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--foreground)]"
          href="/planner"
        >
          <svg fill="none" height="20" viewBox="0 0 12 20" width="12">
            <path
              d="M10 2L2 10l8 8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold text-[var(--foreground)]">
          남은요리
        </h1>
        <Link
          className="ml-auto text-sm font-semibold text-[var(--olive)]"
          href="/leftovers/ate"
        >
          다먹은 목록
        </Link>
      </div>

      {/* Feedback toast */}
      {feedback ? (
        <div
          className={[
            "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-deep)]"
              : "border-[var(--olive)] bg-[color:rgba(46,166,122,0.1)] text-[var(--olive)]",
          ].join(" ")}
          data-testid="feedback-toast"
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}

      {/* Loading */}
      {screenState === "loading" ? (
        <div className="flex flex-col gap-3" data-testid="leftovers-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="border border-[var(--line)]"
              height={120}
              rounded="lg"
            />
          ))}
        </div>
      ) : null}

      {/* Error */}
      {screenState === "error" ? (
        <ContentState
          actionLabel="다시 시도"
          description={errorMessage ?? "잠시 후 다시 시도해주세요."}
          onAction={() => {
            void loadLeftovers();
          }}
          title="남은요리를 불러오지 못했어요"
          tone="error"
        />
      ) : null}

      {/* Empty */}
      {screenState === "empty" ? (
        <ContentState
          actionLabel="플래너로 돌아가기"
          description="요리를 완료하면 여기에 저장돼요"
          onAction={() => {
            window.location.href = "/planner";
          }}
          title="남은 요리가 없어요"
          tone="empty"
        />
      ) : null}

      {/* Ready: leftover list */}
      {screenState === "ready" ? (
        <div
          className="flex flex-col gap-3"
          data-testid="leftover-list"
        >
          {items.map((item) => (
            <LeftoverCard
              key={item.id}
              anyMutating={eatingId !== null}
              isEating={eatingId === item.id}
              item={item}
              onEat={handleEat}
              onPlannerAdd={openPlannerAddSheet}
            />
          ))}
        </div>
      ) : null}

      {/* Planner Add Sheet */}
      <PlannerAddSheet
        columns={plannerColumns}
        errorMessage={plannerAddError}
        isOpen={isPlannerAddSheetOpen}
        onChangeServings={setPlannerServings}
        onClose={closePlannerAddSheet}
        onRetryLoad={loadPlannerColumns}
        onSelectColumn={setSelectedPlanColumnId}
        onSelectDate={setSelectedPlanDate}
        onSubmit={handlePlannerAddSubmit}
        selectableDates={selectableDates}
        selectedColumnId={selectedPlanColumnId}
        selectedDate={selectedPlanDate}
        servings={plannerServings}
        sheetState={plannerAddSheetState}
      />
    </div>
  );
}
