"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
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

function formatShortDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatLeftoverMeta(item: LeftoverListItemData) {
  const sourceLabel = item.source_meal_label ?? "연결 끼니 없음";
  return `${sourceLabel} · ${item.cooking_servings}인분`;
}

function getFallbackEmoji(title: string) {
  if (title.includes("밥")) return "🍚";
  if (title.includes("찌개")) return "🍲";
  return "🍽️";
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
      className="group overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
      data-testid="leftover-card"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--surface-fill)]">
        {item.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            fill
            sizes="(min-width: 1024px) 320px, 56px"
            src={item.recipe_thumbnail_url}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--muted)]">
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
              <path d="M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
            </svg>
            <span className="text-xs font-semibold">남은요리</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold tracking-[-0.3px] text-[var(--foreground)]">
            {item.recipe_title}
          </p>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            {formatCookedAt(item.cooked_at)} 요리
          </p>
          <p className="text-sm text-[var(--text-3)]">
            {formatLeftoverMeta(item)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="flex min-h-[44px] min-w-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-center text-sm font-semibold leading-5 text-[var(--text-2)] active:border-[var(--text-2)] active:bg-[var(--surface-subtle)] disabled:opacity-60"
            data-testid="eat-button"
            disabled={anyMutating}
            onClick={() => onEat(item.id)}
            type="button"
          >
            {isEating ? "처리 중..." : "다 먹었어요"}
          </button>
          <button
            className="flex min-h-[44px] min-w-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-center text-sm font-bold leading-5 text-white active:bg-[var(--brand-deep)] disabled:opacity-60"
            data-testid="planner-add-button"
            disabled={anyMutating}
            onClick={() => onPlannerAdd(item)}
            type="button"
          >
            식단에 추가
          </button>
        </div>
      </div>
    </article>
  );
}

export function LeftoversScreen({
  initialAuthenticated = false,
}: LeftoversScreenProps) {
  const isMobileViewport = useIsMobileViewport();
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

  const plannerAddSheet = (
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
  );

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

  if (isMobileViewport) {
    return (
      <LeftoversMobileView
        eatingId={eatingId}
        errorMessage={errorMessage}
        feedback={feedback}
        items={items}
        onEat={handleEat}
        onPlannerAdd={openPlannerAddSheet}
        onRetry={loadLeftovers}
        plannerAddSheet={plannerAddSheet}
        screenState={screenState}
      />
    );
  }

  const totalServings = items.reduce(
    (sum, item) => sum + item.cooking_servings,
    0,
  );

  return (
    <div className="space-y-6 pb-12" data-testid="leftovers-screen">
      <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-1)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link
              aria-label="뒤로가기"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-fill)] px-4 text-sm font-semibold text-[var(--text-2)] hover:text-[var(--brand)]"
              href="/planner"
            >
              <span aria-hidden="true">&lt;</span>
              플래너 보기
            </Link>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              Leftovers
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
              남은요리
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              요리 완료 후 남은 음식을 다시 식단에 올리거나 먹은 기록으로 정리해요.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted)]">남은요리</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
                {items.length}개
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted)]">총 인분</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
                {totalServings}인분
              </p>
            </div>
            <Link
              className="flex min-h-[76px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 text-sm font-bold text-[var(--brand-deep)]"
              href="/leftovers/ate"
            >
              다먹은 목록
            </Link>
          </div>
        </div>
      </section>

      {feedback ? (
        <div
          className={[
            "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-[color-mix(in_srgb,var(--danger)_70%,black)]"
              : "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-deep)]",
          ].join(" ")}
          data-testid="feedback-toast"
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}

      {screenState === "loading" ? (
        <div
          className="grid gap-4 lg:grid-cols-3"
          data-testid="leftovers-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="border border-[var(--line)]"
              height={280}
              rounded="lg"
            />
          ))}
        </div>
      ) : null}

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

      {screenState === "ready" ? (
        <div
          className="grid gap-4 lg:grid-cols-3"
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

      {plannerAddSheet}
    </div>
  );
}

function LeftoversMobileView({
  eatingId,
  errorMessage,
  feedback,
  items,
  onEat,
  onPlannerAdd,
  onRetry,
  plannerAddSheet,
  screenState,
}: {
  eatingId: string | null;
  errorMessage: string | null;
  feedback: { message: string; tone: FeedbackTone } | null;
  items: LeftoverListItemData[];
  onEat: (id: string) => void;
  onPlannerAdd: (item: LeftoverListItemData) => void;
  onRetry: () => void;
  plannerAddSheet: React.ReactNode;
  screenState: ScreenState;
}) {
  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      data-testid="leftovers-screen"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
      }}
    >
      <MobileAppBar
        actionHref="/leftovers/ate"
        actionLabel="다먹은 요리"
        backHref="/planner"
        title="남은요리"
      />

      {feedback ? <MobileFeedback feedback={feedback} /> : null}

      <section className="border-b border-[#DEE2E6] bg-white px-4 py-3">
        <h2 className="text-[18px] font-extrabold leading-[1.35] text-[#212529]">
          남은 요리 {items.length}개
        </h2>
        <p className="mt-1 text-[12px] font-medium leading-[1.35] text-[#868E96]">
          요리한 끼니를 다시 플래너에 올리거나 다 먹은 것으로 정리할 수 있어요.
        </p>
      </section>

      {screenState === "loading" ? (
        <div className="space-y-3 p-4" data-testid="leftovers-loading">
          {[1, 2].map((index) => (
            <div
              className="h-[136px] rounded-xl border border-[#DEE2E6] bg-white"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {screenState === "error" ? (
        <div className="p-4">
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            onAction={() => {
              void onRetry();
            }}
            title="남은요리를 불러오지 못했어요"
            tone="error"
          />
        </div>
      ) : null}

      {screenState === "empty" ? (
        <div className="p-4">
          <ContentState
            actionLabel="플래너로 돌아가기"
            description="요리를 완료하면 여기에 저장돼요"
            onAction={() => {
              window.location.href = "/planner";
            }}
            title="남은 요리가 없어요"
            tone="empty"
          />
        </div>
      ) : null}

      {screenState === "ready" ? (
        <div className="space-y-[10px] p-4" data-testid="leftover-list">
          {items.map((item) => (
            <MobileLeftoverCard
              anyMutating={eatingId !== null}
              isEating={eatingId === item.id}
              item={item}
              key={item.id}
              onEat={onEat}
              onPlannerAdd={onPlannerAdd}
            />
          ))}
        </div>
      ) : null}

      {plannerAddSheet}
      <Wave1MobileBottomTab ariaLabel="남은요리 하단 탭" currentTab="mypage" />
    </div>
  );
}

function MobileLeftoverCard({
  anyMutating,
  isEating,
  item,
  onEat,
  onPlannerAdd,
}: {
  anyMutating: boolean;
  isEating: boolean;
  item: LeftoverListItemData;
  onEat: (id: string) => void;
  onPlannerAdd: (item: LeftoverListItemData) => void;
}) {
  return (
    <article
      className="rounded-xl border border-[#DEE2E6] bg-white p-3"
      data-testid="leftover-card"
    >
      <div className="flex items-center gap-3">
        <MobileDishThumb
          emoji={getFallbackEmoji(item.recipe_title)}
          src={item.recipe_thumbnail_url}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold leading-[1.35] text-[#212529]">
            {item.recipe_title}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.35] text-[#868E96]">
            {formatShortDate(item.cooked_at)} 요리 · {formatLeftoverMeta(item)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[106px_minmax(0,1fr)] gap-2">
        <button
          className="flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#DEE2E6] bg-white px-2 text-center text-[12px] font-extrabold leading-none text-[#495057] disabled:opacity-60"
          data-testid="planner-add-button"
          disabled={anyMutating}
          onClick={() => onPlannerAdd(item)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px] bg-[#E7F5FF] text-[9px] text-[#4DABF7]"
          >
            ↗
          </span>
          <span className="whitespace-nowrap">플래너에 추가</span>
        </button>
        <button
          className="flex h-10 min-w-0 items-center justify-center rounded-lg bg-[#2AC1BC] px-2 text-center text-[13px] font-extrabold leading-none text-white disabled:opacity-60"
          data-testid="eat-button"
          disabled={anyMutating}
          onClick={() => onEat(item.id)}
          type="button"
        >
          {isEating ? "처리 중..." : "✓ 다먹음"}
        </button>
      </div>
    </article>
  );
}

function MobileDishThumb({
  emoji,
  src,
}: {
  emoji: string;
  src: string | null;
}) {
  if (src) {
    return (
      <Image
        alt=""
        className="h-14 w-14 shrink-0 rounded-lg object-cover"
        height={56}
        src={src}
        unoptimized
        width={56}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#FFE3E3] text-[24px]">
      <span aria-hidden="true">{emoji}</span>
    </div>
  );
}

function MobileFeedback({
  feedback,
}: {
  feedback: { message: string; tone: FeedbackTone };
}) {
  return (
    <div
      className={[
        "mx-4 mt-2 rounded-lg px-4 py-3 text-center text-[13px] font-extrabold",
        feedback.tone === "error"
          ? "bg-[#FFF5F5] text-[#FF6B6B]"
          : "bg-[#E6FCF5] text-[#099268]",
      ].join(" ")}
      data-testid="feedback-toast"
      role="alert"
    >
      {feedback.message}
    </div>
  );
}

function MobileAppBar({
  actionHref,
  actionLabel,
  backHref,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  backHref: string;
  title: string;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <Link
        aria-label="뒤로가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start text-[#212529]"
        href={backHref}
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.3"
          viewBox="0 0 24 24"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[#212529]">
        {title}
      </h1>
      <Link
        className="absolute right-4 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#DEE2E6] bg-white px-3 text-[12px] font-extrabold text-[#2AC1BC]"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
