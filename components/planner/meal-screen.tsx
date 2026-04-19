"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ModalHeader } from "@/components/shared/modal-header";
import { deleteMeal, fetchMeals, isMealApiError, updateMealServings } from "@/lib/api/meal";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { MealListItemData } from "@/types/meal";
import type { MealStatus } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";

interface ModalState {
  type: "serving-change" | "delete";
  mealId: string;
  pendingServings?: number;
}

export interface MealScreenProps {
  planDate: string;
  columnId: string;
  slotName: string;
  initialAuthenticated: boolean;
}

const STATUS_META: Record<MealStatus, { label: string; className: string }> = {
  registered: {
    label: "식사 등록 완료",
    className: "bg-[var(--muted)] text-[var(--surface)]",
  },
  shopping_done: {
    label: "장보기 완료",
    className: "bg-[var(--brand)] text-white",
  },
  cook_done: {
    label: "요리 완료",
    className: "bg-[var(--olive)] text-white",
  },
};

function formatDateLong(planDate: string) {
  const date = new Date(`${planDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateShort(planDate: string) {
  const date = new Date(`${planDate}T00:00:00.000Z`);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}/${day}`;
}

function buildNextPath(planDate: string, columnId: string, slotName: string) {
  const base = `/planner/${planDate}/${columnId}`;
  return slotName ? `${base}?slot=${encodeURIComponent(slotName)}` : base;
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  titleFull: string;
  titleShort: string;
  onBack: () => void;
}

function AppBar({ titleFull, titleShort, onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="flex h-14 items-center gap-2 px-2">
        <button
          aria-label="뒤로 가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-white/60"
          onClick={onBack}
          type="button"
        >
          <svg
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5L7 10L12 15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
          {/* Full title on ≥361px, short title on narrow */}
          <span className="hidden [@media(min-width:361px)]:inline">{titleFull}</span>
          <span className="[@media(min-width:361px)]:hidden">{titleShort}</span>
        </h1>
        {/* Right spacer matching back button width */}
        <div className="h-11 w-11 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="식사 목록 불러오는 중">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[16px] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
        >
          <div className="h-4 w-44 rounded-full bg-[var(--line)]" />
          <div className="mt-2 h-3 w-20 rounded-full bg-[var(--line)]" />
          <div className="mt-4 flex items-center gap-2">
            <div className="h-11 w-11 rounded-[12px] bg-[var(--line)]" />
            <div className="h-4 w-6 rounded-full bg-[var(--line)]" />
            <div className="h-11 w-11 rounded-[12px] bg-[var(--line)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MealStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      aria-label={meta.label}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

// ─── Meal card ────────────────────────────────────────────────────────────────

interface MealCardProps {
  meal: MealListItemData;
  conflictError: string | null;
  isPending: boolean;
  onStepDown: () => void;
  onStepUp: () => void;
  onDelete: () => void;
}

function MealCard({
  meal,
  conflictError,
  isPending,
  onStepDown,
  onStepUp,
  onDelete,
}: MealCardProps) {
  const isMin = meal.planned_servings <= 1;

  function stopProp(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <article
      aria-label={`${meal.recipe_title} 식사 카드`}
      className={`rounded-[16px] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      {/* Recipe title */}
      <p className="truncate text-base font-bold text-[var(--foreground)]">{meal.recipe_title}</p>

      {/* Status badge */}
      <div className="mt-1.5">
        <StatusBadge status={meal.status} />
      </div>

      {/* Stepper + delete row */}
      <div className="mt-3 flex items-center justify-between">
        {/* Stepper */}
        <div className="flex items-center gap-2" onClick={stopProp} role="group" aria-label="인분 조절">
          <button
            aria-label="인분 감소"
            className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--brand)] text-white disabled:opacity-40"
            disabled={isMin || isPending}
            onClick={onStepDown}
            type="button"
          >
            <span aria-hidden="true" className="text-lg font-bold leading-none">−</span>
          </button>
          <span
            className="min-w-[2.5rem] text-center text-base font-bold text-[var(--foreground)]"
            aria-live="polite"
            aria-label={`${meal.planned_servings}인분`}
          >
            {meal.planned_servings}
            <span className="ml-0.5 text-sm font-normal text-[var(--muted)]">인분</span>
          </span>
          <button
            aria-label="인분 증가"
            className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--brand)] text-white disabled:opacity-40"
            disabled={isPending}
            onClick={onStepUp}
            type="button"
          >
            <span aria-hidden="true" className="text-lg font-bold leading-none">+</span>
          </button>
        </div>

        {/* Delete button */}
        <button
          aria-label={`${meal.recipe_title} 삭제`}
          className="flex h-11 min-w-[44px] items-center justify-center px-2 text-sm text-[var(--muted)] disabled:opacity-40"
          disabled={isPending}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          type="button"
        >
          삭제
        </button>
      </div>

      {/* 409 conflict inline error */}
      {conflictError ? (
        <p className="mt-2 text-sm text-[var(--brand-deep)]" role="alert">
          {conflictError}
        </p>
      ) : null}
    </article>
  );
}

// ─── Center modal backdrop + container ───────────────────────────────────────

interface CenterModalProps {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}

function CenterModal({ children, onClose, labelledBy }: CenterModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {/* backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* content */}
      <div
        ref={contentRef}
        className="relative w-full max-w-sm rounded-[20px] bg-[var(--panel)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MealScreen({
  planDate,
  columnId,
  slotName,
  initialAuthenticated,
}: MealScreenProps) {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [meals, setMeals] = useState<MealListItemData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());

  // ── Auth setup (identical pattern to PlannerWeekScreen) ──────────────────
  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
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
        if (!mounted) {
          return;
        }
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

  // ── Meal loading ─────────────────────────────────────────────────────────
  const loadMeals = useCallback(async () => {
    setScreenState("loading");
    setErrorMessage(null);
    try {
      const data = await fetchMeals(planDate, columnId);
      setMeals(data.items);
      setScreenState(data.items.length === 0 ? "empty" : "ready");
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setErrorMessage(
        isMealApiError(error) ? error.message : "식사 목록을 불러오지 못했어요.",
      );
      setScreenState("error");
    }
  }, [planDate, columnId]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }
    void loadMeals();
  }, [authState, loadMeals]);

  // ── Sync screenState when meals list changes ──────────────────────────────
  useEffect(() => {
    if (screenState === "ready" || screenState === "empty") {
      setScreenState(meals.length === 0 ? "empty" : "ready");
    }
  }, [meals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clearConflictError(mealId: string) {
    setConflictErrors((prev) => {
      const next = { ...prev };
      delete next[mealId];
      return next;
    });
  }

  function setConflictError(mealId: string) {
    setConflictErrors((prev) => ({
      ...prev,
      [mealId]: "변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요.",
    }));
  }

  function addPending(mealId: string) {
    setPendingMealIds((prev) => new Set([...prev, mealId]));
  }

  function removePending(mealId: string) {
    setPendingMealIds((prev) => {
      const next = new Set(prev);
      next.delete(mealId);
      return next;
    });
  }

  // ── API actions ───────────────────────────────────────────────────────────
  async function applyServingChange(mealId: string, newServings: number) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      const updated = await updateMealServings(mealId, newServings);
      setMeals((prev) =>
        prev.map((meal) =>
          meal.id === mealId
            ? { ...meal, planned_servings: updated.planned_servings, status: updated.status }
            : meal,
        ),
      );
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  async function applyDelete(mealId: string) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      await deleteMeal(mealId);
      setMeals((prev) => prev.filter((meal) => meal.id !== mealId));
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleStepperTap(meal: MealListItemData, delta: number) {
    const newServings = meal.planned_servings + delta;
    if (newServings < 1) {
      return;
    }
    if (meal.status === "shopping_done" || meal.status === "cook_done") {
      setModal({ type: "serving-change", mealId: meal.id, pendingServings: newServings });
      return;
    }
    void applyServingChange(meal.id, newServings);
  }

  function handleDeleteTap(mealId: string) {
    setModal({ type: "delete", mealId });
  }

  function handleModalCancel() {
    setModal(null);
  }

  function handleServingChangeConfirm() {
    if (!modal || modal.type !== "serving-change" || modal.pendingServings === undefined) {
      return;
    }
    const { mealId, pendingServings } = modal;
    setModal(null);
    void applyServingChange(mealId, pendingServings);
  }

  function handleDeleteConfirm() {
    if (!modal || modal.type !== "delete") {
      return;
    }
    const { mealId } = modal;
    setModal(null);
    void applyDelete(mealId);
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const titleFull = slotName
    ? `${formatDateLong(planDate)} · ${slotName}`
    : formatDateLong(planDate);
  const titleShort = slotName
    ? `${formatDateShort(planDate)} · ${slotName}`
    : formatDateShort(planDate);
  const nextPath = buildNextPath(planDate, columnId, slotName);

  // ── Unauthorized gate ─────────────────────────────────────────────────────
  if (authState === "unauthorized") {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--background)]"
        style={{ paddingBottom: "84px" }}
      >
        <AppBar
          titleFull={titleFull}
          titleShort={titleShort}
          onBack={() => router.back()}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
          <div className="rounded-[18px] border border-[var(--line)] bg-white/78 p-5">
            <p className="text-base font-semibold text-[var(--foreground)]">
              식사 목록을 보려면 로그인이 필요해요.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
              로그인 후 이 화면으로 자동으로 돌아옵니다.
            </p>
          </div>
          <SocialLoginButtons nextPath={nextPath} />
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Full-screen overlay — sits below BottomTabs (z-30) */}
      <div
        className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--background)]"
        style={{ paddingBottom: "84px" }}
      >
        <AppBar
          titleFull={titleFull}
          titleShort={titleShort}
          onBack={() => router.back()}
        />

        {/* Scrollable content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="space-y-3 p-4">
              {/* Loading skeletons */}
              {authState === "checking" || screenState === "loading" ? (
                <LoadingSkeleton />
              ) : null}

              {/* Error state */}
              {screenState === "error" ? (
                <div
                  className="flex flex-col items-center justify-center py-12 text-center"
                  data-testid="meal-screen-error"
                >
                  <p className="text-base text-[var(--muted)]">
                    식사 목록을 불러오지 못했어요.
                  </p>
                  {errorMessage ? (
                    <p className="mt-1 text-sm text-[var(--muted)]">{errorMessage}</p>
                  ) : null}
                  <button
                    className="mt-4 min-h-11 rounded-[12px] border border-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[var(--brand)]"
                    onClick={() => void loadMeals()}
                    type="button"
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}

              {/* Empty state */}
              {screenState === "empty" ? (
                <div
                  className="flex flex-col items-center justify-center py-12 text-center"
                  data-testid="meal-screen-empty"
                >
                  <p className="text-base text-[var(--muted)]">
                    이 끼니에 등록된 식사가 없어요.
                  </p>
                  {/* Inline prominent CTA for empty state */}
                  <button
                    aria-disabled="true"
                    className="mt-6 flex h-[52px] w-full max-w-xs items-center justify-center rounded-[12px] bg-[var(--brand)] px-4 text-base font-semibold text-white disabled:opacity-60"
                    disabled
                    type="button"
                  >
                    + 식사 추가
                  </button>
                </div>
              ) : null}

              {/* Meal cards */}
              {screenState === "ready"
                ? meals.map((meal) => (
                    <MealCard
                      key={meal.id}
                      conflictError={conflictErrors[meal.id] ?? null}
                      isPending={pendingMealIds.has(meal.id)}
                      meal={meal}
                      onDelete={() => handleDeleteTap(meal.id)}
                      onStepDown={() => handleStepperTap(meal, -1)}
                      onStepUp={() => handleStepperTap(meal, 1)}
                    />
                  ))
                : null}
            </div>
          </div>

          {/* Sticky bottom CTA */}
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <button
              aria-disabled="true"
              className="flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--brand)] px-4 text-base font-semibold text-white disabled:opacity-60"
              data-testid="meal-screen-add-cta"
              disabled
              type="button"
            >
              + 식사 추가
            </button>
          </div>
        </div>
      </div>

      {/* Serving-change confirmation modal */}
      {modal?.type === "serving-change" ? (
        <CenterModal labelledBy="serving-change-title" onClose={handleModalCancel}>
          <ModalHeader
            title="인분 변경"
            titleId="serving-change-title"
            onClose={handleModalCancel}
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
              onClick={handleModalCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex-[2] rounded-[14px] bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
              data-testid="serving-change-confirm"
              onClick={handleServingChangeConfirm}
              type="button"
            >
              변경하기
            </button>
          </div>
        </CenterModal>
      ) : null}

      {/* Delete confirmation modal */}
      {modal?.type === "delete" ? (
        <CenterModal labelledBy="delete-confirm-title" onClose={handleModalCancel}>
          <ModalHeader
            title="식사 삭제"
            titleId="delete-confirm-title"
            onClose={handleModalCancel}
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            이 식사를 삭제하시겠어요?
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
              onClick={handleModalCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex-[2] rounded-[14px] bg-[var(--brand-deep)] py-3.5 text-sm font-bold text-white"
              data-testid="delete-confirm"
              onClick={handleDeleteConfirm}
              type="button"
            >
              삭제
            </button>
          </div>
        </CenterModal>
      ) : null}
    </>
  );
}
