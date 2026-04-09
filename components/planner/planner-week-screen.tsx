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

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

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

function clampSortOrder(nextSortOrder: number, columnCount: number) {
  if (columnCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(nextSortOrder, 0), columnCount - 1);
}

interface PlannerColumnCardProps {
  column: PlannerColumnData;
  draftName: string;
  columnCount: number;
  isMutating: boolean;
  isActiveDrag: boolean;
  isDragTarget: boolean;
  onDraftNameChange: (columnId: string, value: string) => void;
  onKeyboardReorder: (columnId: string, nextSortOrder: number) => void;
  onTouchDragStart: (
    columnId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onDragStart: (columnId: string) => void;
  onDragOver: (columnId: string) => void;
  onDrop: (columnId: string) => void;
  onDragEnd: () => void;
  onRename: (columnId: string) => void;
  onDelete: (columnId: string) => void;
}

function PlannerColumnCard({
  column,
  draftName,
  columnCount,
  isMutating,
  isActiveDrag,
  isDragTarget,
  onDraftNameChange,
  onKeyboardReorder,
  onTouchDragStart,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRename,
  onDelete,
}: PlannerColumnCardProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextSortOrder = clampSortOrder(column.sort_order + direction, columnCount);

      if (nextSortOrder === column.sort_order) {
        return;
      }

      onKeyboardReorder(column.id, nextSortOrder);
    },
    [column.id, column.sort_order, columnCount, onKeyboardReorder],
  );

  return (
    <div
      className={`min-w-0 rounded-[12px] border bg-[var(--surface)] px-3 py-3 transition-colors ${
        isDragTarget
          ? "border-[var(--brand)] bg-[color:rgba(255,108,60,0.08)]"
          : "border-[var(--line)]"
      } ${isActiveDrag ? "opacity-55" : ""}`}
      data-column-id={column.id}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver(column.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(column.id);
      }}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
          <button
            aria-label={`${column.name} 컬럼 순서 변경`}
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded-[10px] border border-[var(--line)] text-[18px] font-semibold leading-none text-[var(--muted)] transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isMutating}
            draggable={!isMutating}
            onDragEnd={onDragEnd}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", column.id);
              onDragStart(column.id);
            }}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") {
                return;
              }

              onTouchDragStart(column.id, event);
            }}
            style={{ touchAction: "none" }}
            type="button"
          >
            ⋮⋮
          </button>
          <label className="flex min-h-11 min-w-0 items-center rounded-[10px] border border-[var(--line)] px-3">
            <span className="visually-hidden">{column.name} 컬럼 이름</span>
            <input
              className="w-full min-w-0 bg-transparent text-sm font-semibold text-[var(--foreground)] outline-none"
              onChange={(event) => onDraftNameChange(column.id, event.target.value)}
              value={draftName}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-[10px] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--muted)] disabled:opacity-45"
            disabled={isMutating}
            onClick={() => onRename(column.id)}
            type="button"
          >
            저장
          </button>
          <button
            className="min-h-11 rounded-[10px] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--muted)] disabled:opacity-45"
            disabled={isMutating}
            onClick={() => onDelete(column.id)}
            type="button"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
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
  const feedbackMessage = usePlannerStore((state) => state.feedbackMessage);
  const isMutating = usePlannerStore((state) => state.isMutating);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);
  const shiftRange = usePlannerStore((state) => state.shiftRange);
  const clearFeedback = usePlannerStore((state) => state.clearFeedback);
  const addColumn = usePlannerStore((state) => state.addColumn);
  const renameColumn = usePlannerStore((state) => state.renameColumn);
  const reorderColumn = usePlannerStore((state) => state.reorderColumn);
  const removeColumn = usePlannerStore((state) => state.removeColumn);

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [newColumnName, setNewColumnName] = useState("");
  const [columnNameDrafts, setColumnNameDrafts] = useState<Record<string, string>>({});
  const [activeDragColumnId, setActiveDragColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const activeDragColumnIdRef = useRef<string | null>(null);
  const dragOverColumnIdRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const scrollShiftAtRef = useRef(0);

  const sortedColumns = useMemo(() => sortColumns(columns), [columns]);
  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const hasMeals = meals.length > 0;

  useEffect(() => {
    activeDragColumnIdRef.current = activeDragColumnId;
  }, [activeDragColumnId]);

  useEffect(() => {
    dragOverColumnIdRef.current = dragOverColumnId;
  }, [dragOverColumnId]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

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
      const clampedSortOrder = clampSortOrder(nextSortOrder, sortedColumns.length);

      await runMutation(async () => {
        await reorderColumn(columnId, clampedSortOrder);
      });
    },
    [reorderColumn, runMutation, sortedColumns.length],
  );

  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      await runMutation(async () => {
        await removeColumn(columnId);
      });
    },
    [removeColumn, runMutation],
  );

  const clearDragState = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    activeDragColumnIdRef.current = null;
    dragOverColumnIdRef.current = null;
    setActiveDragColumnId(null);
    setDragOverColumnId(null);
  }, []);

  const handleTouchDragStart = useCallback(
    (columnId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();

      dragCleanupRef.current?.();

      const pointerId = event.pointerId;
      const target = event.currentTarget;

      target.setPointerCapture?.(pointerId);
      activeDragColumnIdRef.current = columnId;
      dragOverColumnIdRef.current = columnId;
      setActiveDragColumnId(columnId);
      setDragOverColumnId(columnId);

      const updateDragTarget = (clientX: number, clientY: number) => {
        const elementAtPoint = document.elementFromPoint(clientX, clientY);
        const nextColumnId =
          elementAtPoint instanceof Element
            ? (elementAtPoint.closest("[data-column-id]") as HTMLElement | null)?.dataset.columnId
            : null;

        if (!nextColumnId || dragOverColumnIdRef.current === nextColumnId) {
          return;
        }

        dragOverColumnIdRef.current = nextColumnId;
        setDragOverColumnId(nextColumnId);
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }

        updateDragTarget(moveEvent.clientX, moveEvent.clientY);
      };

      const finishTouchDrag = (endEvent?: PointerEvent) => {
        if (endEvent && endEvent.pointerId !== pointerId) {
          return;
        }

        const activeColumnId = activeDragColumnIdRef.current;
        const nextColumnId = dragOverColumnIdRef.current;

        target.releasePointerCapture?.(pointerId);

        activeDragColumnIdRef.current = null;
        dragOverColumnIdRef.current = null;
        setActiveDragColumnId(null);
        setDragOverColumnId(null);

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishTouchDrag);
        window.removeEventListener("pointercancel", finishTouchDrag);
        dragCleanupRef.current = null;

        if (!activeColumnId || !nextColumnId || activeColumnId === nextColumnId) {
          return;
        }

        const nextSortOrder = sortedColumns.findIndex((column) => column.id === nextColumnId);

        if (nextSortOrder < 0) {
          return;
        }

        void handleReorderColumn(activeColumnId, nextSortOrder);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishTouchDrag);
      window.addEventListener("pointercancel", finishTouchDrag);
      dragCleanupRef.current = () => {
        target.releasePointerCapture?.(pointerId);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishTouchDrag);
        window.removeEventListener("pointercancel", finishTouchDrag);
      };
    },
    [handleReorderColumn, sortedColumns],
  );

  const handleColumnDragStart = useCallback((columnId: string) => {
    activeDragColumnIdRef.current = columnId;
    dragOverColumnIdRef.current = columnId;
    setActiveDragColumnId(columnId);
    setDragOverColumnId(columnId);
  }, []);

  const handleColumnDragOver = useCallback((columnId: string) => {
    if (!activeDragColumnIdRef.current || dragOverColumnIdRef.current === columnId) {
      return;
    }

    dragOverColumnIdRef.current = columnId;
    setDragOverColumnId(columnId);
  }, []);

  const handleColumnDrop = useCallback(
    (columnId: string) => {
      const activeColumnId = activeDragColumnIdRef.current;

      clearDragState();

      if (!activeColumnId || activeColumnId === columnId) {
        return;
      }

      const nextSortOrder = sortedColumns.findIndex((column) => column.id === columnId);

      if (nextSortOrder < 0) {
        return;
      }

      void handleReorderColumn(activeColumnId, nextSortOrder);
    },
    [clearDragState, handleReorderColumn, sortedColumns],
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
      <div className="glass-panel rounded-[20px] p-4 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
          Planner Access
        </p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-[var(--foreground)] md:mt-3 md:text-2xl">
          이 화면은 로그인이 필요해요
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)] md:mt-3">
          플래너를 사용하려면 로그인해주세요. 로그인 후에는 다시 플래너 화면으로 돌아옵니다.
        </p>
        <div className="mt-3 md:mt-6">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
              {formatDateLabel(rangeStartDate)} ~ {formatDateLabel(rangeEndDate)}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
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

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex min-h-11 min-w-0 flex-1 items-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 sm:max-w-sm">
              <span className="visually-hidden">새 끼니 컬럼 이름</span>
              <input
                className="w-full bg-transparent outline-none placeholder:text-[var(--muted)]"
                onChange={(event) => setNewColumnName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAddColumn();
                  }
                }}
                placeholder="새 끼니 컬럼 이름"
                value={newColumnName}
              />
            </label>
            <button
              className="min-h-11 shrink-0 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `160px repeat(${sortedColumns.length}, minmax(160px, 1fr))` }}
                >
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    날짜
                  </div>
                  {sortedColumns.map((column) => {
                    const draftName = columnNameDrafts[column.id] ?? column.name;

                    return (
                      <PlannerColumnCard
                        key={column.id}
                        column={column}
                        columnCount={sortedColumns.length}
                        draftName={draftName}
                        isActiveDrag={activeDragColumnId === column.id}
                        isDragTarget={Boolean(
                          activeDragColumnId &&
                            dragOverColumnId === column.id &&
                            activeDragColumnId !== column.id,
                        )}
                        isMutating={isMutating}
                        onDelete={(columnId) => void handleDeleteColumn(columnId)}
                        onDraftNameChange={(columnId, value) =>
                          setColumnNameDrafts((current) => ({
                            ...current,
                            [columnId]: value,
                          }))
                        }
                        onKeyboardReorder={(columnId, nextSortOrder) =>
                          void handleReorderColumn(columnId, nextSortOrder)
                        }
                        onDragEnd={clearDragState}
                        onDragOver={handleColumnDragOver}
                        onDragStart={handleColumnDragStart}
                        onDrop={handleColumnDrop}
                        onTouchDragStart={handleTouchDragStart}
                        onRename={(columnId) => void handleRenameColumn(columnId)}
                      />
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
