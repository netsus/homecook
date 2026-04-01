"use client";

import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { isPlannerApiError } from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { usePlannerStore } from "@/stores/planner-store";
import type { MealStatus, PlannerColumnData, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

const RANGE_SHIFT_DAYS = 7;
const SCROLL_SHIFT_DEBOUNCE_MS = 650;
const CTA_BUTTONS = ["장보기", "요리하기", "남은요리"] as const;

const STATUS_META: Record<MealStatus, { label: string; className: string }> = {
  registered: {
    label: "식사 등록 완료",
    className: "bg-[color:rgba(255,108,60,0.12)] text-[var(--brand-deep)]",
  },
  shopping_done: {
    label: "장보기 완료",
    className: "bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]",
  },
  cook_done: {
    label: "요리 완료",
    className: "bg-[color:rgba(30,30,30,0.08)] text-[var(--foreground)]",
  },
};

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function buildDateKeys(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dateKeys: string[] = [];

  while (start <= end) {
    dateKeys.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return dateKeys;
}

function sortColumns(columns: PlannerColumnData[]) {
  return [...columns].sort((left, right) => {
    if (left.sort_order === right.sort_order) {
      return left.id.localeCompare(right.id);
    }

    return left.sort_order - right.sort_order;
  });
}

function buildMealMap(meals: PlannerMealData[]) {
  const mealMap = new Map<string, PlannerMealData[]>();

  meals.forEach((meal) => {
    const key = `${meal.plan_date}:${meal.column_id}`;
    const current = mealMap.get(key) ?? [];
    mealMap.set(key, [...current, meal]);
  });

  return mealMap;
}

export function PlannerWeekScreen() {
  const rangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const rangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const columns = usePlannerStore((state) => state.columns);
  const meals = usePlannerStore((state) => state.meals);
  const screenState = usePlannerStore((state) => state.screenState);
  const errorMessage = usePlannerStore((state) => state.errorMessage);
  const feedbackMessage = usePlannerStore((state) => state.feedbackMessage);
  const isMutating = usePlannerStore((state) => state.isMutating);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);
  const shiftRange = usePlannerStore((state) => state.shiftRange);
  const clearFeedback = usePlannerStore((state) => state.clearFeedback);
  const addColumn = usePlannerStore((state) => state.addColumn);
  const renameColumn = usePlannerStore((state) => state.renameColumn);
  const reorderColumn = usePlannerStore((state) => state.reorderColumn);
  const removeColumn = usePlannerStore((state) => state.removeColumn);

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [newColumnName, setNewColumnName] = useState("");
  const [columnNameDrafts, setColumnNameDrafts] = useState<Record<string, string>>({});
  const scrollShiftAtRef = useRef(0);

  const sortedColumns = useMemo(() => sortColumns(columns), [columns]);
  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const hasMeals = meals.length > 0;

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};

    sortedColumns.forEach((column) => {
      nextDrafts[column.id] = columnNameDrafts[column.id] ?? column.name;
    });

    setColumnNameDrafts(nextDrafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedColumns]);

  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (e2eAuthOverride !== null) {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
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
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    void loadPlanner().catch((error) => {
      if (isPlannerApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    });
  }, [authState, loadPlanner, rangeEndDate, rangeStartDate]);

  const runMutation = useCallback(
    async (mutation: () => Promise<void>) => {
      clearFeedback();

      try {
        await mutation();
      } catch (error) {
        if (isPlannerApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
        }
      }
    },
    [clearFeedback],
  );

  const handleRangeShift = useCallback(
    (direction: "next" | "prev") => {
      clearFeedback();
      shiftRange(direction === "next" ? RANGE_SHIFT_DAYS : -RANGE_SHIFT_DAYS);
    },
    [clearFeedback, shiftRange],
  );

  const handleGridWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (authState !== "authenticated") {
        return;
      }

      if (Math.abs(event.deltaY) < 48) {
        return;
      }

      const now = Date.now();

      if (now - scrollShiftAtRef.current < SCROLL_SHIFT_DEBOUNCE_MS) {
        return;
      }

      scrollShiftAtRef.current = now;
      handleRangeShift(event.deltaY > 0 ? "next" : "prev");
    },
    [authState, handleRangeShift],
  );

  const handleAddColumn = useCallback(async () => {
    const name = newColumnName.trim();

    if (!name) {
      return;
    }

    await runMutation(async () => {
      await addColumn(name);
      setNewColumnName("");
    });
  }, [addColumn, newColumnName, runMutation]);

  const handleRenameColumn = useCallback(
    async (columnId: string) => {
      const draftName = columnNameDrafts[columnId] ?? "";

      await runMutation(async () => {
        await renameColumn(columnId, draftName);
      });
    },
    [columnNameDrafts, renameColumn, runMutation],
  );

  const handleReorderColumn = useCallback(
    async (columnId: string, nextSortOrder: number) => {
      await runMutation(async () => {
        await reorderColumn(columnId, nextSortOrder);
      });
    },
    [reorderColumn, runMutation],
  );

  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      await runMutation(async () => {
        await removeColumn(columnId);
      });
    },
    [removeColumn, runMutation],
  );

  if (authState === "checking") {
    return (
      <div className="glass-panel rounded-[20px] p-6">
        <p className="text-sm text-[var(--muted)]">로그인 상태를 확인하고 있어요...</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="glass-panel rounded-[20px] p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
          Planner Access
        </p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
          이 화면은 로그인이 필요해요
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          플래너를 사용하려면 로그인해주세요. 로그인 후에는 다시 플래너 화면으로 돌아옵니다.
        </p>
        <div className="mt-6">
          <SocialLoginButtons nextPath="/planner" />
        </div>
        <div className="mt-4">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_320px]">
      <section className="space-y-6">
        <div className="glass-panel rounded-[20px] px-5 py-6 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Planner Week
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
            식단 플래너
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            날짜와 끼니 컬럼을 한눈에 보면서 식단을 관리해요.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {CTA_BUTTONS.map((label) => (
              <button
                key={label}
                aria-disabled="true"
                className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)] opacity-60"
                disabled
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[20px] px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
              {formatDateLabel(rangeStartDate)} ~ {formatDateLabel(rangeEndDate)}
            </h3>
            <div className="flex items-center gap-2">
              <button
                className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                onClick={() => handleRangeShift("prev")}
                type="button"
              >
                이전 범위
              </button>
              <button
                className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                onClick={() => handleRangeShift("next")}
                type="button"
              >
                다음 범위
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            플래너 영역에서 위/아래 스크롤하면 주간 범위를 이동할 수 있어요.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 w-full flex-1 items-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 md:max-w-sm">
              <span className="visually-hidden">새 끼니 컬럼 이름</span>
              <input
                className="w-full bg-transparent outline-none placeholder:text-[var(--muted)]"
                onChange={(event) => setNewColumnName(event.target.value)}
                placeholder="새 끼니 컬럼 이름"
                value={newColumnName}
              />
            </label>
            <button
              className="min-h-11 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isMutating}
              onClick={() => void handleAddColumn()}
              type="button"
            >
              컬럼 추가
            </button>
          </div>

          {feedbackMessage ? (
            <p className="mt-3 rounded-[12px] border border-[color:rgba(255,108,60,0.25)] bg-[color:rgba(255,108,60,0.08)] px-4 py-3 text-sm text-[var(--brand-deep)]">
              {feedbackMessage}
            </p>
          ) : null}
        </div>

        {screenState === "loading" ? (
          <div className="glass-panel rounded-[20px] p-5">
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-24 animate-pulse rounded-[16px] bg-white/70"
                />
              ))}
            </div>
          </div>
        ) : null}

        {screenState === "error" ? (
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            onAction={() => {
              void loadPlanner().catch((error) => {
                if (isPlannerApiError(error) && error.status === 401) {
                  setAuthState("unauthorized");
                }
              });
            }}
            title="플래너를 불러오지 못했어요"
          />
        ) : null}

        {screenState === "read-only" ? (
          <ContentState
            description="현재 슬라이스에서는 플래너 조회 화면이 항상 수정 가능한 상태로 제공돼요."
            title="읽기 전용 상태는 이번 단계에서 사용하지 않아요"
          />
        ) : null}

        {screenState === "ready" || screenState === "empty" ? (
          <div className="glass-panel overflow-hidden rounded-[20px]">
            {screenState === "empty" ? (
              <div className="border-b border-[var(--line)] px-5 py-4 md:px-6">
                <p className="text-sm text-[var(--muted)]">
                  아직 등록된 식사가 없어요. 끼니 컬럼을 정리하고 다음 슬라이스에서 식사를 추가할 수 있어요.
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto" onWheel={handleGridWheel}>
              <div className="min-w-[760px] px-5 py-5 md:px-6">
                <div className="grid gap-2" style={{ gridTemplateColumns: `160px repeat(${sortedColumns.length}, minmax(160px, 1fr))` }}>
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    날짜
                  </div>
                  {sortedColumns.map((column, index) => {
                    const draftName = columnNameDrafts[column.id] ?? column.name;

                    return (
                      <div
                        key={column.id}
                        className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                      >
                        <input
                          className="w-full bg-transparent text-sm font-semibold text-[var(--foreground)] outline-none"
                          onChange={(event) =>
                            setColumnNameDrafts((current) => ({
                              ...current,
                              [column.id]: event.target.value,
                            }))
                          }
                          value={draftName}
                        />
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          <button
                            className="min-h-11 rounded-[10px] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                            disabled={isMutating || index === 0}
                            onClick={() => void handleReorderColumn(column.id, index - 1)}
                            type="button"
                          >
                            ←
                          </button>
                          <button
                            className="min-h-11 rounded-[10px] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                            disabled={isMutating || index === sortedColumns.length - 1}
                            onClick={() => void handleReorderColumn(column.id, index + 1)}
                            type="button"
                          >
                            →
                          </button>
                          <button
                            className="min-h-11 rounded-[10px] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                            disabled={isMutating}
                            onClick={() => void handleRenameColumn(column.id)}
                            type="button"
                          >
                            저장
                          </button>
                          <button
                            className="min-h-11 rounded-[10px] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                            disabled={isMutating}
                            onClick={() => void handleDeleteColumn(column.id)}
                            type="button"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {dateKeys.map((dateKey) => (
                    <React.Fragment key={dateKey}>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm font-semibold text-[var(--foreground)]">
                        {formatDateLabel(dateKey)}
                      </div>
                      {sortedColumns.map((column) => {
                        const cellKey = `${dateKey}:${column.id}`;
                        const cellMeals = mealsByDateAndColumn.get(cellKey) ?? [];
                        const primaryMeal = cellMeals[0] ?? null;

                        return (
                          <div
                            key={cellKey}
                            className={`rounded-[12px] border border-[var(--line)] px-3 py-3 ${
                              primaryMeal?.is_leftover
                                ? "bg-[color:rgba(46,166,122,0.1)]"
                                : "bg-[var(--surface)]"
                            }`}
                          >
                            {primaryMeal ? (
                              <>
                                <p className="text-sm font-semibold text-[var(--foreground)]">
                                  {primaryMeal.recipe_title}
                                </p>
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                  {primaryMeal.planned_servings}인분
                                </p>
                                <span
                                  className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_META[primaryMeal.status].className}`}
                                >
                                  {STATUS_META[primaryMeal.status].label}
                                </span>
                                {cellMeals.length > 1 ? (
                                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                                    외 {cellMeals.length - 1}건 더 있어요
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-xs text-[var(--muted)]">등록된 식사가 없어요</p>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <div className="glass-panel rounded-[20px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Planner Status
          </p>
          <dl className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <div className="flex items-center justify-between gap-3">
              <dt>화면 상태</dt>
              <dd className="font-semibold text-[var(--foreground)]">{screenState}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>컬럼 수</dt>
              <dd className="font-semibold text-[var(--foreground)]">{sortedColumns.length}개</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>식사 수</dt>
              <dd className="font-semibold text-[var(--foreground)]">{meals.length}건</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>범위</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {rangeStartDate} ~ {rangeEndDate}
              </dd>
            </div>
          </dl>
        </div>
        <div className="glass-panel rounded-[20px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Stage 4 Scope
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li>플래너 주간 조회</li>
            <li>끼니 컬럼 CRUD</li>
            <li>상태 뱃지 표시</li>
            <li>상단 CTA 비활성 노출</li>
            <li>로그인 필요 상태 안내</li>
          </ul>
          {!hasMeals && screenState === "empty" ? (
            <p className="mt-4 rounded-[12px] bg-[color:rgba(46,166,122,0.08)] px-4 py-3 text-sm text-[var(--olive)]">
              식사가 없더라도 컬럼 관리 기능은 계속 사용할 수 있어요.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
