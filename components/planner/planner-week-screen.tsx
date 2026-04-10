"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { createDefaultPlannerRange, isPlannerApiError } from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { usePlannerStore } from "@/stores/planner-store";
import type { MealStatus, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;
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

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatWeekdayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatRangeLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} ~ ${formatDateLabel(endDate)}`;
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

export function PlannerWeekScreen({
  initialAuthenticated = false,
}: PlannerWeekScreenProps) {
  const rangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const rangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const columns = usePlannerStore((state) => state.columns);
  const meals = usePlannerStore((state) => state.meals);
  const screenState = usePlannerStore((state) => state.screenState);
  const errorMessage = usePlannerStore((state) => state.errorMessage);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);
  const resetRange = usePlannerStore((state) => state.resetRange);
  const shiftRange = usePlannerStore((state) => state.shiftRange);

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const defaultRange = createDefaultPlannerRange();
  const isCurrentRange =
    rangeStartDate === defaultRange.startDate && rangeEndDate === defaultRange.endDate;

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

  if (authState === "checking") {
    return (
      <div className="glass-panel rounded-[20px] p-6">
        <p className="text-sm text-[var(--muted)]">로그인 상태를 확인하고 있어요...</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="-mt-5 glass-panel rounded-[20px] p-4 md:mt-0 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
          Planner Access
        </p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-[var(--foreground)] md:mt-3 md:text-2xl">
          이 화면은 로그인이 필요해요
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-[var(--muted)] md:mt-3">
          플래너를 사용하려면 로그인해주세요. 로그인 후에는 다시 플래너 화면으로 돌아옵니다.
        </p>
        <div className="mt-2 md:mt-6">
          <SocialLoginButtons nextPath="/planner" />
        </div>
        <div className="mt-2 md:mt-4">
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
    <div className="space-y-3 sm:space-y-4">
      <section className="glass-panel rounded-[clamp(22px,6vw,28px)] px-[clamp(14px,4vw,24px)] py-[clamp(14px,4vw,24px)]">
        <div className="flex flex-col gap-[clamp(12px,3vw,18px)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                Planner Week
              </p>
              <h2 className="mt-1.5 text-[clamp(1.9rem,8vw,2.7rem)] font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
                식단 플래너
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              {CTA_BUTTONS.map((label) => (
                <button
                  key={label}
                  aria-disabled="true"
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] opacity-60 sm:min-h-10 sm:px-4 sm:text-sm"
                  disabled
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[clamp(18px,5vw,24px)] border border-[var(--line)] bg-white/78 px-[clamp(12px,3.5vw,18px)] py-[clamp(12px,3.5vw,18px)]">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                    현재 범위
                  </p>
                  <h3 className="mt-1 text-[clamp(1.45rem,6vw,2rem)] font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                    {formatRangeLabel(rangeStartDate, rangeEndDate)}
                  </h3>
                </div>
                <div className="inline-flex w-fit items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[12px] font-semibold text-[var(--muted)] sm:text-[13px]">
                  식사 {meals.length}건
                </div>
              </div>

              <nav aria-label="주간 이동" className="flex flex-wrap items-center gap-2">
                <button
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                  onClick={() => shiftRange(-RANGE_SHIFT_DAYS)}
                  type="button"
                >
                  이전 주
                </button>
                <button
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] disabled:opacity-50 sm:min-h-10 sm:px-4 sm:text-sm"
                  disabled={isCurrentRange}
                  onClick={() => resetRange()}
                  type="button"
                >
                  이번주로 가기
                </button>
                <button
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                  onClick={() => shiftRange(RANGE_SHIFT_DAYS)}
                  type="button"
                >
                  다음 주
                </button>
              </nav>

              <ol
                aria-label="주간 날짜 스트립"
                className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-[var(--muted)] sm:gap-2 sm:text-xs"
              >
                {dateKeys.map((dateKey) => (
                  <li key={dateKey} className="list-none">
                    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-1.5 py-2 sm:px-2">
                      <p>{formatWeekdayLabel(dateKey)}</p>
                      <p className="mt-1 text-[clamp(0.95rem,3.4vw,1rem)] text-[var(--foreground)]">
                        {dateKey.slice(8)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {screenState === "loading" ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="glass-panel min-h-36 animate-pulse rounded-[20px] bg-white/70"
            />
          ))}
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

      {screenState === "ready" || screenState === "empty" ? (
        <section className="space-y-2.5 sm:space-y-3">
          {screenState === "empty" ? (
            <div className="glass-panel rounded-[18px] px-4 py-3">
              <p className="text-sm text-[var(--muted)]">아직 등록된 식사가 없어요.</p>
            </div>
          ) : null}

          {dateKeys.map((dateKey) => (
            <article
              key={dateKey}
              aria-label={`${formatDateLabel(dateKey)} 식단 카드`}
              className="glass-panel rounded-[clamp(20px,5vw,24px)] px-[clamp(12px,3.5vw,18px)] py-[clamp(12px,3.5vw,18px)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[12px] bg-[var(--foreground)] px-3 text-sm font-bold text-white sm:min-h-11 sm:min-w-11">
                    {formatWeekdayLabel(dateKey)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[clamp(1.2rem,5.2vw,1.6rem)] font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                      {formatDateLabel(dateKey)}
                    </p>
                  </div>
                </div>
                <button
                  aria-disabled="true"
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-[var(--line)] text-lg text-[var(--muted)] opacity-55 sm:min-h-10 sm:min-w-10"
                  disabled
                  type="button"
                >
                  ⋯
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {columns.map((column) => {
                  const slotKey = `${dateKey}:${column.id}`;
                  const slotMeals = mealsByDateAndColumn.get(slotKey) ?? [];
                  const meal = slotMeals[0] ?? null;

                  return (
                    <section
                      key={slotKey}
                      className={`rounded-[16px] border px-[clamp(10px,3vw,14px)] py-[clamp(10px,3vw,14px)] ${
                        meal?.is_leftover
                          ? "border-[color:rgba(46,166,122,0.2)] bg-[color:rgba(46,166,122,0.08)]"
                          : "border-[var(--line)] bg-[var(--surface)]"
                      }`}
                    >
                      <h4 className="text-[13px] font-bold text-[var(--foreground)] sm:text-sm">
                        {column.name}
                      </h4>
                      {meal ? (
                        <>
                          <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold text-[var(--foreground)] sm:text-sm">
                            {meal.recipe_title}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--muted)] sm:text-xs">
                            {meal.planned_servings}인분
                          </p>
                          <span
                            className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${STATUS_META[meal.status].className}`}
                          >
                            {STATUS_META[meal.status].label}
                          </span>
                          {slotMeals.length > 1 ? (
                            <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                              +{slotMeals.length - 1}건 더 있음
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
                          비어 있음
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
