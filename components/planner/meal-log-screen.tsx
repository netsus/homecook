"use client";

import { AppBackButton } from "@/components/shared/app-back-button";
import { PlannerTaskSheet } from "@/components/planner/planner-task-sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { DecimalInput } from "@/components/shared/decimal-input";

import Image from "next/image";
import { showActionConfirmation } from "@/stores/ui-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MealLogAddSheet, type MealLogSourceSelection } from "@/components/planner/meal-log-add-sheet";
import { PlannerWeekNavigation } from "@/components/planner/planner-week-navigation";
import { MealLogDayNutritionDetail } from "@/components/planner/meal-log-day-nutrition-detail";
import { formatMealLogNumber, MEAL_LOG_MACROS, scaleMealLogNutrition } from "@/lib/planner/meal-log-nutrition-presentation";
import { MealLogMacroBar, MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
import { emitAppActionNotification } from "@/lib/app-action-notifications";
import { createGuestMealLogDay, createGuestPlannerData } from "@/lib/planner/guest-planner-preview";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import {
  createMealLogEntry,
  deleteMealLogEntry,
  fetchMealLogDay,
  isMealLogApiError,
  updateMealLogEntry,
} from "@/lib/api/meal-log";
import type {
  MealLogActiveSection,
  MealLogDayData,
  MealLogDeletedColumnSection,
  MealLogEntry,
} from "@/types/meal-log";

interface MealLogScreenProps {
  date: string;
  guest?: boolean;
  activeColumns?: MealLogDayData["active_columns"];
  showDateNavigation?: boolean;
  onDayRef?: (date: string, node: HTMLElement | null) => void;
  onDaysReady?: (weekStart: string) => void;
  onLoginRequired?: (date?: string) => void;
  onFoodLoginRequired?: (date?: string) => void;
  onDateChange: (date: string) => void;
  onUnauthorized: () => void;
}

type DialogState =
  | { type: "add"; columnId: string; restoredInvoker?: boolean; selection?: MealLogSourceSelection; backgroundEntry?: MealLogEntry }
  | { type: "edit"; entry: MealLogEntry; restoredInvoker?: boolean; draft?: { amount: number; columnId: string; unit: string } }
  | { type: "delete"; entry: MealLogEntry; restoredInvoker?: boolean }
  | { type: "detail"; entry: MealLogEntry; guestPreview?: boolean }
  | null;

const MEAL_LOG_RETURN_CONTEXT_KEY = "homecook.meal-log-return-context.v1";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_TYPES = new Set(["cooked_batch", "food_product", "ingredient"]);

type MealLogReturnContext =
  | {
      version: 1;
      action: "add";
      date: string;
      columnId: string;
      invoker: "section-add";
      draft: MealLogSourceSelection | null;
    }
  | {
      version: 1;
      action: "edit";
      date: string;
      entryId: string;
      invoker: "entry-edit";
      draft: { amount: number; columnId: string; unit: string };
    }
  | {
      version: 1;
      action: "delete";
      date: string;
      entryId: string;
      invoker: "entry-delete";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeText(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isDateKey(value: unknown) {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function isUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseReturnContext(value: unknown): MealLogReturnContext | null {
  if (!isRecord(value) || value.version !== 1 || !isDateKey(value.date)) return null;
  if (value.action === "add") {
    if (!hasExactKeys(value, ["version", "action", "date", "columnId", "invoker", "draft"])
      || value.invoker !== "section-add" || !isUuid(value.columnId)) return null;
    if (value.draft === null) return value as unknown as MealLogReturnContext;
    if (!isRecord(value.draft)) return null;
    const draftKeys = ["type", "id", "name", "brand", "amount", "unit"];
    const draftKeysWithMax = [...draftKeys, "maxAmount"];
    if (!hasExactKeys(value.draft, draftKeys) && !hasExactKeys(value.draft, draftKeysWithMax)) return null;
    if (typeof value.draft.type !== "string" || !SOURCE_TYPES.has(value.draft.type)
      || !isUuid(value.draft.id) || !isSafeText(value.draft.name, 160)
      || (value.draft.brand !== null && !isSafeText(value.draft.brand, 160))
      || !isPositiveNumber(value.draft.amount) || !isSafeText(value.draft.unit, 40)
      || (value.draft.maxAmount !== undefined && !isPositiveNumber(value.draft.maxAmount))) return null;
    return value as unknown as MealLogReturnContext;
  }
  if (value.action === "edit") {
    if (!hasExactKeys(value, ["version", "action", "date", "entryId", "invoker", "draft"])
      || value.invoker !== "entry-edit" || !isUuid(value.entryId) || !isRecord(value.draft)
      || !hasExactKeys(value.draft, ["amount", "columnId", "unit"])
      || !isPositiveNumber(value.draft.amount) || !isUuid(value.draft.columnId)
      || !isSafeText(value.draft.unit, 40)) return null;
    return value as unknown as MealLogReturnContext;
  }
  if (value.action === "delete") {
    if (!hasExactKeys(value, ["version", "action", "date", "entryId", "invoker"])
      || value.invoker !== "entry-delete" || !isUuid(value.entryId)) return null;
    return value as unknown as MealLogReturnContext;
  }
  return null;
}

function saveReturnContext(context: MealLogReturnContext) {
  // Persist the editable draft contract, not transient catalog conversion metadata.
  const storedContext = context.action === "add" && context.draft
    ? {
        ...context,
        draft: {
          type: context.draft.type,
          id: context.draft.id,
          name: context.draft.name,
          brand: context.draft.brand,
          amount: context.draft.amount,
          unit: context.draft.unit,
          ...(context.draft.maxAmount !== undefined ? { maxAmount: context.draft.maxAmount } : {}),
        },
      }
    : context;
  try { window.sessionStorage.setItem(MEAL_LOG_RETURN_CONTEXT_KEY, JSON.stringify(storedContext)); } catch { /* optional return aid */ }
}

function readReturnContext() {
  try {
    const raw = window.sessionStorage.getItem(MEAL_LOG_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    const context = parseReturnContext(JSON.parse(raw));
    if (!context) window.sessionStorage.removeItem(MEAL_LOG_RETURN_CONTEXT_KEY);
    return context;
  } catch {
    try { window.sessionStorage.removeItem(MEAL_LOG_RETURN_CONTEXT_KEY); } catch { /* optional return aid */ }
    return null;
  }
}

function clearReturnContext() {
  try { window.sessionStorage.removeItem(MEAL_LOG_RETURN_CONTEXT_KEY); } catch { /* optional return aid */ }
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekDates(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  const monday = shiftDate(date, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

function longDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${WEEKDAYS[value.getUTCDay()]}요일`;
}

function deletedSectionHeadingId(slotName: string, date: string) {
  return `meal-log-deleted-${date}-${slotName.replaceAll(" ", "-")}`;
}

function sectionAddActionId(columnId: string, date: string) {
  return `meal-log-column-${date}-${columnId}-add`;
}

function entryActionId(entryId: string, action: "delete" | "edit") {
  return `meal-log-entry-${entryId}-${action}`;
}

function returnInvokerId(context: MealLogReturnContext) {
  if (context.invoker === "section-add") return sectionAddActionId(context.columnId, context.date);
  return entryActionId(context.entryId, context.invoker === "entry-edit" ? "edit" : "delete");
}

function number(value: number | null, unit: string) {
  if (value === null) return "정보 준비 중";
  const wholeNumber = unit === "g" || unit.trim() === "kcal";
  const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: wholeNumber ? 0 : 1 })
    .format(wholeNumber ? Math.round(value) : value);
  return `${formatted}${unit}`;
}

function foodNutritionValue(value: number | null, unit: string) {
  if (value === null) return "정보 준비 중";
  return <><strong className="font-normal tabular-nums text-[var(--nutrition-number)]">{Math.round(value).toLocaleString("ko-KR")}</strong> <span>{unit}</span></>;
}

function EntryRow({ disabled, entry, guest = false, onDetail }: {
  guest?: boolean;
  entry: MealLogEntry;
  disabled: boolean;
  onDetail: () => void;
}) {
  const thumbnail = guest ? createGuestPlannerData(entry.consumed_local_date).meals.find((meal) => meal.recipe_title === entry.display_name)?.recipe_thumbnail_url : null;
  const macros = MEAL_LOG_MACROS.map(macro => ({ ...macro, value: entry.nutrition[macro.key] }));
  return (
    <li className="py-4">
      <button aria-describedby={`meal-log-entry-${entry.id}-quantity`} aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 상세`} className="block min-h-11 w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)]" disabled={disabled} id={entryActionId(entry.id, "edit")} onClick={onDetail} type="button">
      <span className="flex items-start gap-3">
        {thumbnail ? <Image alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" height={48} src={thumbnail} width={48} /> : null}
        <span className="min-w-0 flex-1"><span className="block break-words text-base font-medium leading-6 text-[var(--ui-slate-800)]">{entry.display_name}</span>{entry.display_brand ? <span className="mt-0.5 block text-xs text-[var(--ui-slate-500)]">{entry.display_brand}</span> : null}<span id={`meal-log-entry-${entry.id}-quantity`} className="mt-1 block text-xs leading-5 text-[var(--ui-slate-600)]" aria-label={`먹은 양 ${number(entry.quantity.amount, entry.quantity.unit)}`}>{number(entry.quantity.amount, entry.quantity.unit)}</span></span>
        <span className="shrink-0 pt-0.5 text-right text-lg leading-6">{foodNutritionValue(entry.nutrition.calories_kcal, "kcal")}<span aria-hidden="true" className="ml-2 text-[var(--text-2)]">›</span></span>
      </span>
      <div aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 영양정보`} className={`${thumbnail ? "ml-[60px]" : ""} mt-3 text-xs leading-5 text-[var(--ui-slate-600)]`}>
        <MealLogMacroBar nutrition={entry.nutrition} thin />
        <p className="mt-2 flex justify-between gap-2">{macros.map((macro) => <span className="whitespace-nowrap" key={macro.label}>{macro.short} {foodNutritionValue(macro.value, "g")}</span>)}</p>
      </div>
      </button>
    </li>
  );
}

function ActiveSection({ date, disabled, guest = false, section, onAdd, onDetail }: {
  date: string;
  guest?: boolean;
  disabled: boolean;
  section: MealLogActiveSection;
  onAdd: () => void;
  onDetail: (entry: MealLogEntry) => void;
}) {
  return (
    <section aria-labelledby={`meal-log-section-${date}-${section.meal_plan_column_id}`} className="w-full min-w-0 bg-[var(--ui-white)] px-4 pb-1 pt-2">
      <div className={`flex items-center justify-between gap-2 pb-1 ${section.entries.length > 0 ? "border-b border-[var(--ui-slate-100)]" : ""}`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-medium text-[var(--ui-slate-800)] [overflow-wrap:anywhere]" id={`meal-log-section-${date}-${section.meal_plan_column_id}`} tabIndex={-1}>{section.slot_name_snapshot}</h2>
          {section.entries.length > 0 ? <p className="text-lg">{foodNutritionValue(section.subtotal.calories_kcal, "kcal")}</p> : null}
        </div>
        <button aria-label={`${section.slot_name_snapshot}에 먹은 음식 추가`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ui-slate-300)] bg-[var(--ui-white)] text-xl font-semibold text-[var(--brand-primary-text)] shadow-sm outline-none hover:border-[var(--brand)] hover:bg-[var(--ui-slate-50)] focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)]" disabled={disabled} id={sectionAddActionId(section.meal_plan_column_id, date)} onClick={onAdd} type="button">+</button>
      </div>
      {section.incomplete_count > 0 ? <p className="sr-only">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="divide-y divide-[var(--ui-slate-100)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} guest={guest} key={entry.id} onDetail={() => onDetail(entry)} />)}
      </ul>
      {section.entries.length === 0 ? <p className="sr-only">먹은 음식을 기록해 보세요.</p> : null}
    </section>
  );
}

function activeSectionsForDisplay(day: MealLogDayData) {
  const sectionsByColumn = new Map(
    day.active_sections.map((section) => [section.meal_plan_column_id, section]),
  );
  const emptySubtotal = {
    calculation_status: "complete" as const,
    calories_kcal: 0,
    carbohydrate_g: 0,
    protein_g: 0,
    fat_g: 0,
    sodium_mg: 0,
  };

  return day.active_columns.map((column) => sectionsByColumn.get(column.id) ?? {
    meal_plan_column_id: column.id,
    slot_name_snapshot: column.name,
    sort_order: column.sort_order,
    entries: [],
    subtotal: emptySubtotal,
    incomplete_count: 0,
  });
}

function DeletedSection({ date, disabled, section, onDetail }: {
  date: string;
  disabled: boolean;
  section: MealLogDeletedColumnSection;
  onDetail: (entry: MealLogEntry) => void;
}) {
  const headingId = deletedSectionHeadingId(section.slot_name_snapshot, date);
  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium" id={headingId} tabIndex={-1}>삭제된 끼니의 기록 · {section.slot_name_snapshot}</h2>
        <p className="text-sm font-medium">{number(section.subtotal.calories_kcal, " kcal")}</p>
      </div>
      <p className="mt-1 text-xs text-[var(--text-2)]">새 음식 추가 없음</p>
      {section.incomplete_count > 0 ? <p className="sr-only">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} key={entry.id} onDetail={() => onDetail(entry)} />)}
      </ul>
    </section>
  );
}

function EntryDialog({
  day,
  fallbackFocusRef,
  state,
  onClose,
  onAdd,
  onComplete,
  onFeedback,
  mutationEnabled,
  onUnauthorized,
  returnFocusTarget,
  inactive = false,
  onRemoved,
}: {
  day: MealLogDayData;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
  state: Exclude<DialogState, { type: "add" } | null>;
  onClose: () => void;
  onAdd: (columnId: string) => void;
  onComplete: () => Promise<MealLogDayData>;
  onFeedback: (message: string) => void;
  mutationEnabled: boolean;
  onUnauthorized: (context: MealLogReturnContext) => void;
  returnFocusTarget: () => HTMLElement | null;
  inactive?: boolean;
  onRemoved?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const selectorRef = useRef<HTMLSelectElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [authorityEntry, setAuthorityEntry] = useState(state.entry);
  const entry = authorityEntry;
  const entryTitle = `${Number(entry.consumed_local_date.slice(5, 7))}월 ${Number(entry.consumed_local_date.slice(8, 10))}일 ${entry.slot_name_snapshot}`;
  const [action, setAction] = useState<"edit" | "delete" | null>(state.type === "detail" ? null : state.type);
  const [discard, setDiscard] = useState(false);
  const mode = action ?? "detail";
  const authorityColumnActive = entry.meal_plan_column_id !== null
    && day.active_columns.some((column) => column.id === entry.meal_plan_column_id);
  const requiresColumnSelection = mode !== "delete" && !authorityColumnActive;
  const [columnId, setColumnId] = useState(state.type === "edit" && state.draft
    ? state.draft.columnId
    : authorityColumnActive ? entry.meal_plan_column_id ?? "" : "");
  const [amount, setAmount] = useState<number | null>(state.type === "edit" && state.draft ? state.draft.amount : entry.quantity.amount);
  const amountInvalid = amount === null || !Number.isFinite(amount) || amount < 0.01;
  const [unit, setUnit] = useState(state.type === "edit" && state.draft ? state.draft.unit : entry.quantity.unit);
  const [revision, setRevision] = useState(entry.revision);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const columnValid = mode === "delete"
    || day.active_columns.some((column) => column.id === columnId);
  const { setReturnFocusTarget } = useDialogBoundary({
    active: action === null && !inactive,
    closeOnEscape: !pending,
    dialogRef: panelRef,
    fallbackFocusRef,
    initialFocusRef: requiresColumnSelection ? selectorRef : cancelRef,
    onClose,
  });
  useEffect(() => {
    setReturnFocusTarget(returnFocusTarget);
  }, [returnFocusTarget, setReturnFocusTarget]);
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  useEffect(() => {
    if (action !== "edit" || !requiresColumnSelection) return;
    const frame = requestAnimationFrame(() => selectorRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [action, requiresColumnSelection]);

  function closeAction() {
    if (pending) return;
    const changed = mode === "edit" && (amount !== entry.quantity.amount || columnId !== (entry.meal_plan_column_id ?? ""));
    if (changed && !discard) { setDiscard(true); return; }
    setAmount(entry.quantity.amount); setUnit(entry.quantity.unit); setColumnId(entry.meal_plan_column_id ?? "");
    setError(null); setDiscard(false); setAction(null);
  }

  async function mutate() {
    if (pending || !mutationEnabled || (mode !== "delete" && (!columnValid || amountInvalid || !unit.trim()))) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "delete") {
        const fingerprint = JSON.stringify({ entryId: entry.id, expectedRevision: revision, type: "delete" });
        if (operation.current?.fingerprint !== fingerprint) {
          operation.current = { fingerprint, key: crypto.randomUUID() };
        }
        await deleteMealLogEntry(entry.id, revision, operation.current.key);
      } else {
        if (amount === null) return;
        const input = {
          consumedAt: entry.consumed_at,
          consumedLocalDate: entry.consumed_local_date,
          expectedRevision: revision,
          mealPlanColumnId: columnId,
          quantity: { amount, unit: unit.trim() },
          source: entry.source,
          timezoneNameSnapshot: entry.timezone_name_snapshot,
        };
        const fingerprint = JSON.stringify({ entryId: entry.id, input, type: "edit" });
        if (operation.current?.fingerprint !== fingerprint) {
          operation.current = { fingerprint, key: crypto.randomUUID() };
        }
        await updateMealLogEntry(entry.id, input, operation.current.key);
      }
      const refreshedDay = await onComplete();
      onFeedback(mode === "delete" ? "식사 기록을 삭제했어요." : "식사 기록을 수정했어요.");
      clearReturnContext();
      if (mode === "edit") {
        const updatedEntry = refreshedDay.entries.find((item) => item.id === entry.id);
        if (updatedEntry) {
          setAuthorityEntry(updatedEntry);
          setRevision(updatedEntry.revision);
          setAmount(updatedEntry.quantity.amount);
          setUnit(updatedEntry.quantity.unit);
        }
        operation.current = null;
        setPending(false);
        setAction(null);
        setDiscard(false);
        return;
      }
      const logicalSuccessTargetId = entry.meal_plan_column_id
        ? `meal-log-section-${entry.consumed_local_date}-${entry.meal_plan_column_id}`
        : deletedSectionHeadingId(entry.slot_name_snapshot, entry.consumed_local_date);
      setReturnFocusTarget(() => document.getElementById(logicalSuccessTargetId) ?? fallbackFocusRef.current);
      (onRemoved ?? onClose)();
      requestAnimationFrame(() => (document.getElementById(logicalSuccessTargetId) ?? fallbackFocusRef.current)?.focus({ preventScroll: true }));
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 401) {
        if (mode === "delete") {
          onUnauthorized({ version: 1, action: "delete", date: entry.consumed_local_date, entryId: entry.id, invoker: "entry-delete" });
        } else if (amount !== null) {
          onUnauthorized({ version: 1, action: "edit", date: entry.consumed_local_date, entryId: entry.id, invoker: "entry-edit", draft: { amount, columnId, unit } });
        }
        return;
      }
      if (isMealLogApiError(reason) && reason.status === 409) {
        try {
          const latestDay = await onComplete();
          const latestEntry = latestDay.entries.find((item) => item.id === entry.id);
          if (!latestEntry) {
            setError("최신 기록에서 이 항목을 찾을 수 없어요. 창을 닫고 다시 확인해 주세요.");
          } else {
            setAuthorityEntry(latestEntry);
            setRevision(latestEntry.revision);
            if (mode !== "delete") {
              const latestColumnActive = latestEntry.meal_plan_column_id !== null
                && latestDay.active_columns.some((column) => column.id === latestEntry.meal_plan_column_id);
              setColumnId(latestColumnActive ? latestEntry.meal_plan_column_id ?? "" : "");
            }
            operation.current = null;
            setError("다른 변경의 최신 기록을 반영했어요. 입력을 확인한 뒤 다시 시도해 주세요.");
          }
        } catch (refreshError) {
          setError(refreshError instanceof Error ? refreshError.message : "최신 기록을 불러오지 못했어요.");
        }
      } else {
        setError(reason instanceof Error ? reason.message : "요청을 처리하지 못했어요.");
      }
      setPending(false);
    }
  }

  return <>
    <div aria-label="식사 기록 상세" aria-modal={action === null && !inactive ? true : undefined} className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] outline-none" ref={panelRef} role="dialog" tabIndex={-1}>
      <div className="mx-auto max-w-3xl px-5 py-4">
        <header className="flex items-center gap-3"><AppBackButton ariaLabel="식사 기록으로 돌아가기" disabled={pending} onClick={onClose} ref={cancelRef} /><h2 className="flex-1 text-xl font-semibold">{entryTitle}</h2>{authorityColumnActive ? <button aria-label={`${entry.slot_name_snapshot}에 먹은 음식 추가`} className="h-11 w-11 rounded-xl border border-[var(--brand-primary-border)] text-2xl text-[var(--brand-primary-text)]" disabled={pending} onClick={() => onAdd(entry.meal_plan_column_id!)} type="button">+</button> : null}</header>
        <h3 className="mt-6 break-words text-2xl font-medium">{entry.display_name}</h3>
        {entry.display_brand ? <p className="mt-2 text-sm text-[var(--text-2)]">{entry.display_brand}</p> : null}
        <div className="my-6 flex justify-between rounded-xl bg-[var(--surface-fill)] p-4"><span className="font-medium">먹은 양</span><span>{number(entry.quantity.amount, entry.quantity.unit)}</span></div>
        <section aria-label="기록한 음식 영양정보" className="rounded-2xl bg-[var(--ui-sky-50)] p-5"><h3 className="mb-3 text-sm font-medium">먹은 양 기준 영양</h3><MealLogNutritionChart nutrition={entry.nutrition} /></section>
        <div className="my-6 flex justify-between"><span>나트륨</span><span>{number(entry.nutrition.sodium_mg, "mg")}</span></div>
        <button aria-label="식사 기록 수정" className="mt-4 min-h-12 w-full rounded-xl bg-[var(--brand-primary-accessible)] px-4 font-medium text-[var(--text-inverse)] disabled:opacity-50" disabled={!mutationEnabled || pending} onClick={() => setAction("edit")} type="button">먹은 양 수정</button>
        <button className="mt-3 min-h-12 w-full rounded-xl border border-[var(--danger-border)] px-4 font-medium text-[var(--danger-strong)] disabled:opacity-50" disabled={!mutationEnabled || pending} onClick={() => setAction("delete")} type="button">기록 삭제</button>
      </div>
    </div>
    {action ? <PlannerTaskSheet ariaLabelledBy="meal-log-entry-action-title" title={entryTitle} backdropLayerClassName="z-[70]" onClose={closeAction} closeDisabled={pending} bodyClassName="space-y-5 pb-6">
      {discard ? <div role="alert"><p className="font-medium">변경사항을 버릴까요?</p><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" className="min-h-11 rounded-xl border" onClick={() => setDiscard(false)}>계속 편집</button><button type="button" className="min-h-11 rounded-xl border text-[var(--danger-strong)]" onClick={closeAction}>변경사항 버리기</button></div></div> : <>
      <h3 className="text-xl font-medium">{entry.display_name}</h3>
      {mode === "edit" ? <>
        {requiresColumnSelection ? <p className="text-sm">기존 위치: 삭제된 끼니 {entry.slot_name_snapshot}</p> : null}
        <label className="block text-sm font-medium">옮길 끼니{requiresColumnSelection ? " (필수)" : ""}<select className="mt-2 min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base font-normal" onChange={event => setColumnId(event.target.value)} ref={selectorRef} required={requiresColumnSelection} value={columnId}>{requiresColumnSelection ? <option value="">선택해 주세요</option> : null}{day.active_columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
        {requiresColumnSelection && day.active_columns.length === 0 ? <p role="alert" className="text-sm text-[var(--danger-strong)]">옮길 수 있는 현재 끼니가 없어 저장할 수 없어요.</p> : null}
        <label className="block font-medium">먹은 양
          <span className="app-field-input mt-2 flex items-center rounded-xl border border-[var(--ui-slate-200)] bg-[var(--ui-white)] px-3 transition-[border-color,box-shadow]">
            <DecimalInput disabled={pending} aria-label="먹은 양" className="min-h-12 min-w-0 flex-1 bg-transparent text-base font-normal" style={{ border: 0, outline: "none", boxShadow: "none" }} min="0.01" onValueChange={setAmount} step="any" value={amount} />
            <input aria-label="단위" readOnly tabIndex={-1} className="w-12 bg-transparent text-right text-base font-normal text-[var(--text-2)]" style={{ border: 0, outline: "none", boxShadow: "none" }} value={unit} />
          </span>
        </label>
        {amount !== null && !amountInvalid ? <div className="rounded-xl bg-[var(--ui-sky-50)] p-4"><p className="mb-3 text-sm">{number(amount, unit)} 기준</p><MealLogNutritionChart nutrition={scaleMealLogNutrition(entry.nutrition, amount / entry.quantity.amount)} /></div> : null}
      </> : <><p>이 식사 기록을 삭제할까요?</p>{entry.source.type === "cooked_batch" ? <p className="text-sm text-[var(--text-2)]">먹은 양 {number(entry.quantity.amount, entry.quantity.unit)}을 남은 요리에 돌려놓아요.</p> : null}</>}
      {error ? <p className="text-sm text-[var(--danger-strong)]" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
      <div className="grid grid-cols-2 gap-3"><button className="min-h-12 rounded-xl border font-medium" disabled={pending} onClick={closeAction} type="button">취소</button><button className={`min-h-12 rounded-xl px-4 font-medium disabled:opacity-50 ${mode === "delete" ? "bg-[var(--danger-strong)] text-white" : "bg-[var(--brand-primary-accessible)] text-white"}`} disabled={!mutationEnabled || pending || (mode === "edit" && (!columnValid || amountInvalid || !unit.trim()))} onClick={() => void mutate()} type="button">{pending ? "처리 중…" : mode === "delete" ? "삭제" : "수정 저장"}</button></div>
      </>}
    </PlannerTaskSheet> : null}
  </>;
}

export function MealLogScreen({ date, guest = false, activeColumns, showDateNavigation = true, onDayRef, onDaysReady, onLoginRequired, onFoodLoginRequired, onDateChange, onUnauthorized }: MealLogScreenProps) {
  const weekKey = weekDates(date)[0];
  const dates = useMemo(() => weekDates(weekKey), [weekKey]);
  const [days, setDays] = useState<Record<string, MealLogDayData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedDates, setFailedDates] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogDate, setDialogDate] = useState(date);
  const [nutritionDate, setNutritionDate] = useState<string | null>(null);
  const todayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const requestRef = useRef(0);
  const weekLoadRef = useRef<{
    key: string;
    promise: Promise<Array<PromiseSettledResult<readonly [string, MealLogDayData]>>>;
  } | null>(null);
  const mutationKeys = useRef(new Map<string, string>());
  const restoredContextRef = useRef(false);
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const guestDays = useMemo(() => {
    if (!guest) return {};
    const sampleDate = dates.includes(todayKey) ? todayKey : dates[0];
    return Object.fromEntries(dates.map((item) => {
      const sample = createGuestMealLogDay(item);
      if (item === sampleDate) return [item, sample];
      const emptyNutrition = { calculation_status: "complete" as const, calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 };
      return [item, { ...sample, active_sections: sample.active_sections.map((section) => ({ ...section, entries: [], subtotal: emptyNutrition, incomplete_count: 0 })), entries: [], day_total: { ...emptyNutrition, incomplete_count: 0 } }];
    }));
  }, [dates, guest, todayKey]);
  const displayDays = guest ? guestDays : days;
  const day = displayDays[date];
  const isLoading = !guest && (loading || weekLoadRef.current?.key !== weekKey);
  const loadingColumns = activeColumns ?? Object.values(days).at(-1)?.active_columns ?? [];
  useEffect(() => {
    if (guest || (!loading && weekLoadRef.current?.key === weekKey && dates.every((key) => Boolean(days[key]) || failedDates.has(key)))) onDaysReady?.(weekKey);
  }, [days, dates, failedDates, guest, loading, onDaysReady, weekKey]);
  const mutationEnabled = !guest && Boolean(day) && !loading && !failedDates.has(date);
  const dialogDay = displayDays[dialogDate];
  const dialogMutationEnabled = !guest && Boolean(dialogDay) && !loading && !failedDates.has(dialogDate);
  function openDialog(next: Exclude<DialogState, null>, targetDate: string) {
    setDialogDate(targetDate);
    if (next.type === "detail" && guest) {
      (onFoodLoginRequired ?? onLoginRequired ?? onUnauthorized)(targetDate);
      return;
    }
    if (guest && next.type !== "detail") { setDialog(null); (onLoginRequired ?? onUnauthorized)(targetDate); return; }
    setDialog(next.type === "detail" ? { ...next, guestPreview: guest } : next);
  }

  function closeAdd() {
    if (dialog?.type !== "add") return;
    if (dialog.backgroundEntry) {
      setDialog({ type: "detail", entry: dialog.backgroundEntry, guestPreview: false });
      return;
    }
    const id = sectionAddActionId(dialog.columnId, dialogDate);
    setDialog(null);
    requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
  }

  function showSuccess(message: string) {
    showActionConfirmation(message);
    emitAppActionNotification({ message, title: "식사 기록" });
  }

  const loseAuthorization = useCallback((context?: MealLogReturnContext) => {
    if (guestRef.current) return;
    if (context) saveReturnContext(context);
    setDays({});
    setDialog(null);
    setError(null);
    onUnauthorized();
  }, [onUnauthorized]);

  const handleAddUnauthorized = useCallback((selection: MealLogSourceSelection | null, columnId: string) => {
    loseAuthorization({ version: 1, action: "add", date: dialogDate, columnId, invoker: "section-add", draft: selection });
  }, [dialogDate, loseAuthorization]);

  const loadWeek = useCallback(async (force = false) => {
    if (guest) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      if (force || weekLoadRef.current?.key !== weekKey) {
        weekLoadRef.current = {
          key: weekKey,
          promise: Promise.allSettled(
            dates.map(async (item) => [item, await fetchMealLogDay(item)] as const),
          ),
        };
      }
      const results = await weekLoadRef.current.promise;
      if (request !== requestRef.current || guestRef.current) return;
      const unauthorized = results.some((result) => result.status === "rejected" && isMealLogApiError(result.reason) && result.reason.status === 401);
      if (unauthorized) {
        loseAuthorization();
        return;
      }
      const loaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failed = results.find((result) => result.status === "rejected");
      setDays((current) => {
        const next = { ...current, ...Object.fromEntries(loaded) };
        results.forEach((result, index) => {
          if (result.status === "rejected") delete next[dates[index]];
        });
        return next;
      });
      setFailedDates((current) => {
        const next = new Set(current);
        results.forEach((result, index) => {
          if (result.status === "fulfilled") next.delete(dates[index]);
          else next.add(dates[index]);
        });
        return next;
      });
      if (failed?.status === "rejected") {
        setError(failed.reason instanceof Error ? failed.reason.message : "일부 날짜 표시를 불러오지 못했어요.");
      }
    } catch (reason) {
      if (request !== requestRef.current || guestRef.current) return;
      setError(reason instanceof Error ? reason.message : "식사 기록을 불러오지 못했어요.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [dates, guest, loseAuthorization, weekKey]);

  useEffect(() => {
    setDialog(null);
    if (guest) {
      setDays({});
      setFailedDates(new Set());
      setError(null);
      weekLoadRef.current = null;
    } else {
      void loadWeek();
    }
    return () => { requestRef.current += 1; };
  }, [guest, loadWeek]);

  async function reloadSelected(targetDate = dialogDate) {
    if (guestRef.current) return createGuestMealLogDay(targetDate);
    const request = requestRef.current;
    try {
      const next = await fetchMealLogDay(targetDate);
      if (guestRef.current || request !== requestRef.current) return next;
      setDays((current) => ({ ...current, [targetDate]: next }));
      setFailedDates((current) => {
        const updated = new Set(current);
        updated.delete(targetDate);
        return updated;
      });
      setError(null);
      return next;
    } catch (reason) {
      if (guestRef.current || request !== requestRef.current) throw reason;
      if (isMealLogApiError(reason) && reason.status === 401) {
        loseAuthorization();
      } else {
        setDialog(null);
        setDays((current) => {
          const next = { ...current };
          delete next[targetDate];
          return next;
        });
        setFailedDates((current) => new Set(current).add(targetDate));
        setError(reason instanceof Error ? reason.message : "최신 식사 기록을 확인하지 못했어요.");
      }
      throw reason;
    }
  }

  async function add(selection: MealLogSourceSelection, columnId: string, targetDate: string) {
    if (guestRef.current) return;
    const input = {
      consumedAt: null,
      consumedLocalDate: targetDate,
      mealPlanColumnId: columnId,
      quantity: { amount: selection.amount, unit: selection.unit },
      source: { id: selection.id, type: selection.type },
      timezoneNameSnapshot: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const fingerprint = JSON.stringify(input);
    const key = mutationKeys.current.get(fingerprint) ?? crypto.randomUUID();
    mutationKeys.current.set(fingerprint, key);
    await createMealLogEntry(input, key);
    mutationKeys.current.delete(fingerprint);
    setDialog(null);
    showSuccess("식사기록에 추가했어요.");
    await reloadSelected(targetDate);
    if (!dates.includes(targetDate)) onDateChange(targetDate);
    requestAnimationFrame(() => document.getElementById(sectionAddActionId(columnId, targetDate))?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    if (restoredContextRef.current || !day || !mutationEnabled || dialog) return;
    const context = readReturnContext();
    if (!context) return;
    if (context.date !== date) {
      onDateChange(context.date);
      return;
    }
    setDialogDate(context.date);
    if (context.action === "add") {
      if (!day.active_columns.some((column) => column.id === context.columnId)) {
        clearReturnContext();
        return;
      }
      restoredContextRef.current = true;
      clearReturnContext();
      document.getElementById(returnInvokerId(context))?.focus();
      setDialog({ type: "add", columnId: context.columnId, restoredInvoker: true, selection: context.draft ?? undefined });
      return;
    }
    const restoredEntry = day.entries.find((entry) => entry.id === context.entryId);
    if (!restoredEntry) {
      clearReturnContext();
      return;
    }
    restoredContextRef.current = true;
    clearReturnContext();
    const restoredInvoker = document.getElementById(returnInvokerId(context));
    restoredInvoker?.focus();
    setDialog(context.action === "edit"
      ? {
          type: "edit",
          entry: restoredEntry,
          restoredInvoker: true,
          draft: {
            ...context.draft,
            columnId: day.active_columns.some((column) => column.id === context.draft.columnId)
              ? context.draft.columnId
              : "",
          },
        }
      : { type: "delete", entry: restoredEntry, restoredInvoker: true });
  }, [date, day, dialog, mutationEnabled, onDateChange]);

  return (
    <>
      {showDateNavigation ? <PlannerWeekNavigation mode="log" startDate={dates[0]} endDate={dates[6]} selectedDate={date} today={todayKey} isCurrentWeek={dates.includes(todayKey)} onDateSelect={onDateChange} onShiftWeek={delta => onDateChange(shiftDate(date, delta))} onCurrentWeek={() => onDateChange(todayKey)} recordedDates={dates.filter(key => displayDays[key]?.entries.length)} /> : null}
    <main aria-labelledby="planner-log-tab meal-log-title" className="mx-auto w-full max-w-3xl px-4 pb-3 pt-1 lg:px-6 lg:pb-8 lg:pt-2" id="planner-log-panel" role="tabpanel" tabIndex={0}>
      {!guest && error ? <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface)] p-5" role="alert"><h2 className="font-medium">식사 기록을 불러오지 못했어요</h2><p className="mt-2 text-sm">{error}</p><button className="mt-3 min-h-11 font-medium text-[var(--brand-primary-text)]" onClick={() => void loadWeek(true)} type="button">다시 시도</button></div> : null}
      <h1 className="sr-only" id="meal-log-title" ref={headingRef} tabIndex={-1}>일주일 식사 기록</h1>
      <div className="space-y-4 pt-3">
        {[date].map((dayKey) => {
          const cardDay = displayDays[dayKey];
          const cardSections = cardDay ? activeSectionsForDisplay(cardDay) : [];
          const cardDisabled = !guest && (!cardDay || loading || failedDates.has(dayKey));
          const titleId = `meal-log-title-${dayKey}`;
          return <section aria-labelledby={titleId} className="scroll-mt-[calc(var(--planner-sticky-height,80px)+12px)] bg-[var(--ui-white)]" data-planner-date={dayKey} key={dayKey} ref={(node) => onDayRef?.(dayKey, node)}>
            <div className={cardDay && cardDay.entries.length > 0 ? "sr-only" : "flex items-center justify-between gap-2 px-4 py-3"}>
              <h2 aria-label={`${longDate(dayKey)} 식사 기록`} className="text-base font-medium text-[var(--ui-slate-800)]" id={titleId}>{dayKey === todayKey ? "오늘 · " : ""}{Number(dayKey.slice(5, 7))}/{Number(dayKey.slice(8, 10))} ({WEEKDAYS[new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()]})</h2>
              {cardDay && !isLoading ? <span aria-label={`기록한 끼니 ${cardSections.filter((section) => section.entries.length > 0).length}개, 전체 ${cardSections.length}개`} className="shrink-0 text-xs tabular-nums text-[var(--ui-slate-500)]">{cardSections.filter((section) => section.entries.length > 0).length} / {cardSections.length}</span> : null}
            </div>
            {isLoading && !cardDay ? <div aria-busy="true" aria-label={`${longDate(dayKey)} 기록 불러오는 중`} className="space-y-5 p-4" role="status">
              <Skeleton className="h-16 rounded-xl" />
              {loadingColumns.length > 0 ? loadingColumns.map(column => <section key={column.id} aria-labelledby={`meal-log-loading-${dayKey}-${column.id}`}>
                <h2 id={`meal-log-loading-${dayKey}-${column.id}`} className="mb-3 font-medium text-[var(--ui-slate-800)]">{column.name}</h2>
                <Skeleton className="h-20 rounded-xl" />
              </section>) : [0, 1, 2].map(index => <Skeleton className="h-20 rounded-xl" key={index} />)}
            </div> : cardDay ? <div className="p-3 lg:p-4">
              {cardDay.entries.length > 0 ? <section aria-label="하루 영양" className="mb-6 rounded-2xl bg-[var(--ui-sky-50)] p-4">
                <button aria-label="하루 영양 상세 보기" type="button" onClick={() => setNutritionDate(dayKey)} className="w-full text-left">
                  <span className="flex items-center gap-3">
                    <span className="flex-1 text-base font-medium text-[var(--ui-slate-700)]">{Number(dayKey.slice(5, 7))}월 {Number(dayKey.slice(8, 10))}일</span>
                    <span className="text-2xl font-semibold tabular-nums text-[var(--ui-slate-800)]">{formatMealLogNumber(cardDay.day_total.calories_kcal)}<span className="ml-1 text-sm font-normal text-[var(--text-2)]">{cardDay.day_total.calories_kcal !== null ? " kcal" : ""}</span></span>
                    <span aria-hidden="true" className="text-xl font-normal text-[var(--ui-slate-500)]">›</span>
                  </span>
                  <MealLogNutritionChart nutrition={cardDay.day_total} compact hideCalories summaryLabels />
                </button>
              </section> : null}
              {cardDay.entries.length === 0 ? <p className="sr-only">이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요.</p> : null}
              <div className="-mx-3 space-y-5 md:mx-0">
                {cardSections.map((section) => <ActiveSection date={dayKey} disabled={cardDisabled} guest={guest} key={section.meal_plan_column_id} onAdd={() => openDialog({ type: "add", columnId: section.meal_plan_column_id }, dayKey)} onDetail={(entry) => openDialog({ type: "detail", entry }, dayKey)} section={section} />)}
              </div>
              {cardDay.deleted_column_sections.length > 0 ? <div className="mt-3 space-y-3">{cardDay.deleted_column_sections.map((section) => <DeletedSection date={dayKey} disabled={cardDisabled} key={section.slot_name_snapshot} onDetail={(entry) => openDialog({ type: "detail", entry }, dayKey)} section={section} />)}</div> : null}
            </div> : <p className="p-4 text-sm text-[var(--ui-slate-600)]">이 날짜의 기록을 확인하지 못했어요. 위의 다시 시도로 불러와 주세요.</p>}
          </section>;
        })}
      </div>

      {nutritionDate && displayDays[nutritionDate] ? <MealLogDayNutritionDetail active={!dialog} day={displayDays[nutritionDate]} onClose={() => setNutritionDate(null)} onEntry={entry => openDialog({ type: "detail", entry }, nutritionDate)} /> : null}
      {!guest && dialog?.type === "add" && dialog.backgroundEntry && dialogDay ? <EntryDialog inactive day={dialogDay} fallbackFocusRef={headingRef} mutationEnabled={false} state={{ type: "detail", entry: dialog.backgroundEntry, guestPreview: false }} onClose={() => {}} onAdd={() => {}} onComplete={reloadSelected} onFeedback={showSuccess} onUnauthorized={loseAuthorization} returnFocusTarget={() => null} /> : null}
      {!guest && dialog?.type === "add" && dialogDay ? <MealLogAddSheet columns={dialogDay.active_columns} date={dialogDate} initialColumnId={dialog.columnId} initialSelection={dialog.selection} initialSuggestionConfirmed returnFocusTarget={() => dialog.backgroundEntry ? null : document.getElementById(sectionAddActionId(dialog.columnId, dialogDate))} mutationEnabled={dialogMutationEnabled} onClose={closeAdd} onSave={add} onUnauthorized={handleAddUnauthorized} /> : null}
      {dialog && dialog.type !== "add" && (dialog.type === "detail" ? Boolean(dialog.guestPreview) === guest : !guest) && dialogDay ? <EntryDialog day={dialogDay} fallbackFocusRef={headingRef} mutationEnabled={dialogMutationEnabled} onClose={() => setDialog(null)} onRemoved={() => { setDialog(null); setNutritionDate(null); }} onAdd={columnId => openDialog({ type: "add", columnId, backgroundEntry: dialog.entry }, dialogDate)} onComplete={reloadSelected} onFeedback={showSuccess} onUnauthorized={loseAuthorization} returnFocusTarget={() => (nutritionDate ? document.querySelector<HTMLElement>(`[data-meal-log-contributor="${dialog.entry.id}"]`) : null) ?? document.querySelector<HTMLElement>(`[data-planner-date="${dialogDate}"] [id="${entryActionId(dialog.entry.id, "edit")}"]`)} state={dialog} /> : null}
    </main>
    </>
  );
}
