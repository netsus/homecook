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
import { useAppReturn } from "@/components/shared/use-app-return";
import {
  WebButton,
  WebCard,
  WebEmptyState,
  WebErrorState,
  WebPageHeader,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import {
  eatLeftover,
  fetchLeftovers,
  isLeftoverApiError,
} from "@/lib/api/leftovers";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import { fetchPlanner } from "@/lib/api/planner";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { formatKoreaCompactDate, formatKoreaDate } from "@/lib/korean-date";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { LeftoverListItemData } from "@/types/leftover";
import type { PlannerColumnData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";
type FeedbackTone = "error" | "status";

const FEEDBACK_AUTO_DISMISS_MS = 4000;
const LEFTOVERS_DESCRIPTION =
  "요리한 음식 기록을 확인하고, 남은 음식은 다른 끼니에 추가할 수 있어요. 다 먹은 음식은 다먹음 버튼으로 정리해 주세요.";
const LEFTOVER_LIST_PLANNER_ADD_LABEL = "플래너에 추가";
const LEFTOVER_PLANNER_ADD_CONFIRM_LABEL = "날짜 끼니에 추가";
const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export interface LeftoversScreenProps {
  initialAuthenticated?: boolean;
}

function formatCookedAt(dateStr: string) {
  return formatKoreaDate(dateStr, {
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(dateStr: string) {
  return formatKoreaCompactDate(dateStr);
}

function formatLeftoverMeta(item: LeftoverListItemData) {
  const sourceLabel = item.source_meal_label ?? "연결 끼니 없음";
  return `${sourceLabel} · ${item.cooking_servings}인분`;
}

function LeftoverImageIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
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
  );
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
    <WebCard
      className="web-leftover-card"
      data-testid="leftover-card"
      interactive
    >
      <div className="web-leftover-thumb">
        {item.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-full w-full object-cover"
            fill
            sizes="(min-width: 1024px) 320px, 56px"
            src={item.recipe_thumbnail_url}
            unoptimized
          />
        ) : (
          <div
            className="web-leftover-thumb-placeholder"
            data-testid="leftover-image-placeholder"
          >
            <LeftoverImageIcon className="h-7 w-7" />
            <span className="text-xs font-semibold">사진 없음</span>
          </div>
        )}
      </div>

      <div className="web-leftover-body">
        <div className="web-leftover-head">
          <Link
            className="web-leftover-title"
            href={`/recipe/${item.recipe_id}`}
            prefetch={false}
          >
            {item.recipe_title}
          </Link>
          <span className="web-leftover-tag">남은 요리</span>
        </div>
        <p className="web-leftover-meta">
          {formatCookedAt(item.cooked_at)} · {formatLeftoverMeta(item)}
        </p>

        <div className="web-leftover-actions">
          <WebButton
            data-testid="planner-add-button"
            disabled={anyMutating}
            onClick={() => onPlannerAdd(item)}
            size="sm"
            variant="secondary"
          >
            플래너에 추가
          </WebButton>
          <WebButton
            data-testid="eat-button"
            disabled={anyMutating}
            onClick={() => onEat(item.id)}
            size="sm"
            variant="ghost"
          >
            {isEating ? "처리 중..." : "다 먹었어요"}
          </WebButton>
        </div>
      </div>
    </WebCard>
  );
}

export function LeftoversScreen({
  initialAuthenticated = false,
}: LeftoversScreenProps) {
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/planner" });
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

    for (let i = 0; i < 14; i++) {
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
          : "남은 요리를 불러오지 못했어요.",
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
        const nextItems = items.filter((item) => item.id !== leftoverId);
        setItems(nextItems);

        if (nextItems.length === 0) {
          setScreenState("empty");
        }

        setFeedback({ message: "다먹음 처리됐어요", tone: "status" });
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
    [eatingId, items],
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
      defaultConfirmLabel={LEFTOVER_PLANNER_ADD_CONFIRM_LABEL}
    />
  );
  const leftoversSelfHref = buildReturnHref("/leftovers", {
    returnSurface: "leftovers.list",
    returnTo: appReturn.href,
  });
  const eatenListHref = buildReturnHref("/leftovers/ate", {
    returnSurface: "leftovers.list",
    returnTo: leftoversSelfHref,
  });

  if (isMobileViewport) {
    if (authState === "checking") {
      return (
        <LeftoversMobileStateShell
          actionHref={eatenListHref}
          actionLabel="다먹은 요리"
          appReturnHref={appReturn.href}
          testId="leftovers-mobile-auth-loading"
          title="남은 요리"
        >
          <div className="space-y-3 p-4" data-testid="leftovers-loading">
            {[1, 2].map((index) => (
              <div
                className="h-[136px] rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
                key={index}
              />
            ))}
          </div>
        </LeftoversMobileStateShell>
      );
    }

    if (authState === "unauthorized") {
      return (
        <LeftoversMobileStateShell
          actionHref={eatenListHref}
          actionLabel="다먹은 요리"
          appReturnHref={appReturn.href}
          testId="leftovers-mobile-auth-gate"
          title="남은 요리"
        >
          <div className="p-4">
            <ContentState
              description="남은 요리를 관리하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
              eyebrow="로그인 필요"
              safeBottomPadding
              tone="gate"
              title="이 화면은 로그인이 필요해요"
            >
              <div className="space-y-3">
                <SocialLoginButtons nextPath={leftoversSelfHref} />
                <Link
                  className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--text-2)]"
                  href={appReturn.href}
                >
                  이전 화면으로 돌아가기
                </Link>
              </div>
            </ContentState>
          </div>
        </LeftoversMobileStateShell>
      );
    }

    return (
      <LeftoversMobileView
        appReturnHref={appReturn.href}
        eatenListHref={eatenListHref}
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

  return (
    <WebShell className="web-leftovers-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={<div className="web-profile-button">JY</div>}
      />
      <div className="web-leftovers-screen" data-testid="leftovers-screen">
        <nav aria-label="남은 요리 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href="/mypage">
            &lt; 마이페이지
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">남은 요리</span>
        </nav>

        <WebPageHeader
          actions={
            <Link className="web-button web-button-tertiary" href={eatenListHref}>
              다먹은 요리
            </Link>
          }
          description={LEFTOVERS_DESCRIPTION}
          title={`남은 요리 ${items.length}개`}
        />

        {authState === "checking" ? (
          <WebEmptyState
            description="남은 요리 화면에 접근하기 위해 로그인 상태를 확인하고 있어요."
            icon={<span aria-hidden="true">...</span>}
            title="로그인 상태를 확인하고 있어요"
          />
        ) : null}

        {authState === "unauthorized" ? (
          <WebEmptyState
            action={
              <div className="web-leftover-login-actions">
                <SocialLoginButtons nextPath={leftoversSelfHref} />
                <Link className="web-button web-button-tertiary" href={appReturn.href}>
                  이전 화면으로 돌아가기
                </Link>
              </div>
            }
            description="남은 요리를 관리하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
            icon={<span aria-hidden="true">!</span>}
            title="이 화면은 로그인이 필요해요"
          />
        ) : null}

      {authState === "authenticated" && feedback ? (
        <div
          className={[
            "web-leftover-feedback",
            feedback.tone === "error"
              ? "web-leftover-feedback-error"
              : "web-leftover-feedback-status",
          ].join(" ")}
          data-testid="feedback-toast"
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}

      {authState === "authenticated" && screenState === "loading" ? (
        <div
          className="web-leftover-grid"
          data-testid="leftovers-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <WebSkeleton
              key={i}
              height={276}
            />
          ))}
        </div>
      ) : null}

      {authState === "authenticated" && screenState === "error" ? (
        <WebErrorState
          action={
            <WebButton
              onClick={() => {
                void loadLeftovers();
              }}
              variant="secondary"
            >
              다시 시도
            </WebButton>
          }
          description={errorMessage ?? "잠시 후 다시 시도해주세요."}
          icon={<span aria-hidden="true">!</span>}
          title="남은 요리를 불러오지 못했어요"
        />
      ) : null}

      {authState === "authenticated" && screenState === "empty" ? (
        <WebEmptyState
          action={
            <Link className="web-button web-button-tertiary" href={appReturn.href}>
              이전 화면으로 돌아가기
            </Link>
          }
          description="요리를 완료하면 여기에 저장돼요"
          icon={<span aria-hidden="true">□</span>}
          title="남은 요리가 없어요"
        />
      ) : null}

      {authState === "authenticated" && screenState === "ready" ? (
        <div
          className="web-leftover-grid"
          data-testid="leftover-list"
        >
          {items.map((item) => (
            <LeftoverCard
              key={item.id}
              anyMutating={eatingId === item.id}
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
    </WebShell>
  );
}

function LeftoversMobileView({
  appReturnHref,
  eatenListHref,
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
  appReturnHref: string;
  eatenListHref: string;
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
      className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
      data-testid="leftovers-screen"
    >
      <MobileAppBar
        actionHref={eatenListHref}
        actionLabel="다먹은 요리"
        backHref={appReturnHref}
        title="남은 요리"
      />

      {feedback ? <MobileFeedback feedback={feedback} /> : null}

      <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3">
        <h2 className="text-[18px] font-extrabold leading-[1.35] text-[var(--foreground)]">
          남은 요리 {items.length}개
        </h2>
        <p className="mt-1 text-[12px] font-medium leading-[1.35] text-[var(--text-3)]">
          {LEFTOVERS_DESCRIPTION}
        </p>
      </section>

      {screenState === "loading" ? (
        <div className="space-y-3 p-4" data-testid="leftovers-loading">
          {[1, 2].map((index) => (
            <div
              className="h-[136px] rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
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
            title="남은 요리를 불러오지 못했어요"
            tone="error"
          />
        </div>
      ) : null}

      {screenState === "empty" ? (
        <div className="p-4">
          <ContentState
            actionLabel="이전 화면으로 돌아가기"
            description="요리를 완료하면 여기에 저장돼요"
            onAction={() => {
              window.location.href = appReturnHref;
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
              anyMutating={eatingId === item.id}
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
      <Wave1MobileBottomTab ariaLabel="남은 요리 하단 탭" currentTab="mypage" />
    </div>
  );
}

function LeftoversMobileStateShell({
  actionHref,
  actionLabel,
  appReturnHref,
  children,
  testId,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  appReturnHref: string;
  children: React.ReactNode;
  testId: string;
  title: string;
}) {
  return (
    <div
      className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
      data-testid={testId}
    >
      <MobileAppBar
        actionHref={actionHref}
        actionLabel={actionLabel}
        backHref={appReturnHref}
        title={title}
      />
      {children}
      <Wave1MobileBottomTab ariaLabel={`${title} 하단 탭`} currentTab="mypage" />
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
      className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
      data-testid="leftover-card"
    >
      <div className="flex items-center gap-3">
        <MobileDishThumb
          src={item.recipe_thumbnail_url}
        />
        <div className="min-w-0 flex-1">
          <Link
            className="block truncate text-[14px] font-extrabold leading-[1.35] text-[var(--foreground)]"
            href={`/recipe/${item.recipe_id}`}
            prefetch={false}
          >
            {item.recipe_title}
          </Link>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.35] text-[var(--text-3)]">
            {formatShortDate(item.cooked_at)} 요리 · {formatLeftoverMeta(item)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_82px] gap-2">
        <button
          aria-label={LEFTOVER_LIST_PLANNER_ADD_LABEL}
          className="flex h-9 min-w-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--surface)] px-2 text-center text-[11px] font-extrabold leading-none text-[var(--brand)] disabled:opacity-60"
          data-testid="planner-add-button"
          disabled={anyMutating}
          onClick={() => onPlannerAdd(item)}
          type="button"
        >
          <span className="whitespace-nowrap">추가</span>
        </button>
        <button
          className="flex h-9 min-w-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-2 text-center text-[12px] font-extrabold leading-none text-[var(--text-2)] disabled:opacity-60"
          data-testid="eat-button"
          disabled={anyMutating}
          onClick={() => onEat(item.id)}
          type="button"
        >
          {isEating ? "처리 중..." : "다먹음"}
        </button>
      </div>
    </article>
  );
}

function MobileDishThumb({
  src,
}: {
  src: string | null;
}) {
  if (src) {
    return (
      <Image
        alt=""
        className="h-14 w-14 shrink-0 rounded-[var(--radius-control)] object-cover"
        height={56}
        src={src}
        unoptimized
        width={56}
      />
    );
  }

  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[var(--text-3)]"
      data-testid="leftover-image-placeholder"
    >
      <LeftoverImageIcon className="h-6 w-6" />
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
        "mx-4 mt-2 rounded-[var(--radius-control)] border px-4 py-3 text-center text-[13px] font-extrabold",
        feedback.tone === "error"
          ? "border-[var(--feedback-danger-border)] bg-[var(--feedback-danger-soft)] text-[var(--danger)]"
          : "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]",
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
      className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <Link
        aria-label="뒤로가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start text-[var(--foreground)]"
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
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[var(--foreground)]">
        {title}
      </h1>
      <Link
        className="absolute right-4 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-extrabold text-[var(--brand)]"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
