"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppBottomSheet } from "@/components/shared/app-overlay";
import { isPrelaunchFeatureLocked } from "@/lib/prelaunch";
import { MealLogAddSheet, type MealLogSourceSelection } from "@/components/planner/meal-log-add-sheet";
import { PlannerWeekNavigation } from "@/components/planner/planner-week-navigation";
import { MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
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
  showDateNavigation?: boolean;
  onDayRef?: (date: string, node: HTMLElement | null) => void;
  onDaysReady?: (weekStart: string) => void;
  onLoginRequired?: (date?: string) => void;
  onFoodLoginRequired?: (date?: string) => void;
  onDateChange: (date: string) => void;
  onUnauthorized: () => void;
}

type DialogState =
  | { type: "add"; columnId: string; restoredInvoker?: boolean; selection?: MealLogSourceSelection }
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
  try { window.sessionStorage.setItem(MEAL_LOG_RETURN_CONTEXT_KEY, JSON.stringify(context)); } catch { /* optional return aid */ }
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
  return value === null ? "정보 준비 중" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}${unit}`;
}

function foodNutritionValue(value: number | null, unit: string, minimum = false) {
  if (value === null) return "정보 준비 중";
  return <>{minimum ? "최소 " : null}<strong className="font-[800] tabular-nums text-[var(--nutrition-number)]">{number(value, "")}</strong> <span>{unit}</span></>;
}

function DetailPreparationNotice({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBoundary({ dialogRef: panelRef, onClose });
  return <AppBottomSheet ariaLabelledBy="meal-detail-preparation-title" title="식사 상세는 준비 중이에요" panelRef={panelRef} onClose={onClose}>
    <p className="pb-4 text-sm leading-6 text-[var(--ui-slate-600)]">기록한 음식의 상세 조회와 수정 기능을 준비하고 있어요. 지금은 식사 목록에서 영양정보를 확인할 수 있어요.</p>
  </AppBottomSheet>;
}

function EntryRow({ disabled, entry, guest = false, onDelete, onDetail }: {
  guest?: boolean;
  entry: MealLogEntry;
  disabled: boolean;
  onDelete: () => void;
  onDetail: () => void;
}) {
  const thumbnail = guest ? createGuestPlannerData(entry.consumed_local_date).meals.find((meal) => meal.recipe_title === entry.display_name)?.recipe_thumbnail_url : null;
  const macros = [
    { label: "탄수화물", value: entry.nutrition.carbohydrate_g },
    { label: "단백질", value: entry.nutrition.protein_g },
    { label: "지방", value: entry.nutrition.fat_g },
  ];
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <button aria-describedby={`meal-log-entry-${entry.id}-quantity`} aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 상세`} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)]" disabled={disabled} id={entryActionId(entry.id, "edit")} onClick={onDetail} type="button">
          {thumbnail ? <Image alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" height={48} src={thumbnail} width={48} /> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold leading-6 text-[var(--ui-slate-800)] [overflow-wrap:anywhere]">{entry.display_name}</span>
            {entry.display_brand ? <span className="mt-0.5 block text-xs text-[var(--ui-slate-500)]">{entry.display_brand}</span> : null}
            <span id={`meal-log-entry-${entry.id}-quantity`} className="mt-1 flex flex-wrap gap-x-2 text-xs leading-5 text-[var(--ui-slate-600)]"><span aria-label={`먹은 양 ${number(entry.quantity.amount, entry.quantity.unit)}`}>{number(entry.quantity.amount, entry.quantity.unit)}</span><span aria-hidden="true">·</span><span>{foodNutritionValue(entry.nutrition.calories_kcal, "kcal", entry.nutrition.calculation_status === "partial")}</span></span>
          </span>
        </button>
        <button aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 삭제`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ui-slate-400)] outline-none hover:bg-[var(--ui-red-50)] hover:text-[var(--ui-red-700)] focus-visible:ring-2 focus-visible:ring-[var(--ui-red-400)]" disabled={disabled} id={entryActionId(entry.id, "delete")} onClick={onDelete} type="button">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
        </button>
      </div>
      <div aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 영양정보`} className="mt-1 space-y-1 text-xs leading-5 text-[var(--ui-slate-600)]">
        <p className="flex flex-wrap gap-x-2">{macros.map((macro) => <span key={macro.label}>{macro.label} {foodNutritionValue(macro.value, "g")}</span>)}</p>
        {entry.nutrition.calculation_status === "partial" ? <p className="text-[11px] text-[var(--ui-slate-500)]">확인된 영양만 표시해요.</p> : null}
      </div>
    </li>
  );
}

function ActiveSection({ date, disabled, guest = false, section, onAdd, onDelete, onDetail }: {
  date: string;
  guest?: boolean;
  disabled: boolean;
  section: MealLogActiveSection;
  onAdd: () => void;
  onDelete: (entry: MealLogEntry) => void;
  onDetail: (entry: MealLogEntry) => void;
}) {
  return (
    <section aria-labelledby={`meal-log-section-${date}-${section.meal_plan_column_id}`} className="min-w-0 rounded-2xl border border-[var(--ui-slate-200)] bg-[var(--ui-white)] px-4 pb-1 pt-2">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ui-slate-100)] pb-1">
        <div className="min-w-0">
          <h2 className="font-extrabold text-[var(--ui-slate-800)] [overflow-wrap:anywhere]" id={`meal-log-section-${date}-${section.meal_plan_column_id}`} tabIndex={-1}>{section.slot_name_snapshot}</h2>
          {section.entries.length > 0 ? <p className="mt-0.5 text-xs text-[var(--ui-slate-500)]">{foodNutritionValue(section.subtotal.calories_kcal, "kcal", section.subtotal.calculation_status === "partial")}</p> : null}
        </div>
        <button aria-label={`${section.slot_name_snapshot}에 먹은 음식 추가`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ui-slate-300)] bg-[var(--ui-white)] text-xl font-semibold text-[var(--brand-primary-text)] shadow-sm outline-none hover:border-[var(--brand)] hover:bg-[var(--ui-slate-50)] focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)]" disabled={disabled} id={sectionAddActionId(section.meal_plan_column_id, date)} onClick={onAdd} type="button">+</button>
      </div>
      {section.incomplete_count > 0 ? <p className="mt-2 text-xs font-medium text-[var(--ui-slate-500)]">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="divide-y divide-[var(--ui-slate-100)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} guest={guest} key={entry.id} onDelete={() => onDelete(entry)} onDetail={() => onDetail(entry)} />)}
      </ul>
      {section.entries.length === 0 ? <p className="sr-only">먹은 음식을 기록해 보세요.</p> : null}
    </section>
  );
}

function DeletedSection({ date, disabled, section, onDelete, onDetail }: {
  date: string;
  disabled: boolean;
  section: MealLogDeletedColumnSection;
  onDelete: (entry: MealLogEntry) => void;
  onDetail: (entry: MealLogEntry) => void;
}) {
  const headingId = deletedSectionHeadingId(section.slot_name_snapshot, date);
  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold" id={headingId} tabIndex={-1}>삭제된 끼니의 기록 · {section.slot_name_snapshot}</h2>
        <p className="text-sm font-bold">{number(section.subtotal.calories_kcal, " kcal")}</p>
      </div>
      <p className="mt-1 text-xs text-[var(--text-2)]">새 음식 추가 없음</p>
      {section.incomplete_count > 0 ? <p className="mt-1 text-xs font-bold">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} key={entry.id} onDelete={() => onDelete(entry)} onDetail={() => onDetail(entry)} />)}
      </ul>
    </section>
  );
}

function EntryDialog({
  day,
  fallbackFocusRef,
  state,
  onClose,
  onComplete,
  onEdit,
  mutationEnabled,
  onUnauthorized,
  returnFocusTarget,
}: {
  day: MealLogDayData;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
  state: Exclude<DialogState, { type: "add" } | null>;
  onClose: () => void;
  onComplete: () => Promise<MealLogDayData>;
  onEdit: () => void;
  mutationEnabled: boolean;
  onUnauthorized: (context: MealLogReturnContext) => void;
  returnFocusTarget: () => HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const selectorRef = useRef<HTMLSelectElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [authorityEntry, setAuthorityEntry] = useState(state.entry);
  const entry = authorityEntry;
  const authorityColumnActive = entry.meal_plan_column_id !== null
    && day.active_columns.some((column) => column.id === entry.meal_plan_column_id);
  const requiresColumnSelection = state.type === "edit" && !authorityColumnActive;
  const [columnId, setColumnId] = useState(state.type === "edit" && state.draft
    ? state.draft.columnId
    : authorityColumnActive ? entry.meal_plan_column_id ?? "" : "");
  const [amount, setAmount] = useState(state.type === "edit" && state.draft ? state.draft.amount : entry.quantity.amount);
  const [unit, setUnit] = useState(state.type === "edit" && state.draft ? state.draft.unit : entry.quantity.unit);
  const [revision, setRevision] = useState(entry.revision);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const columnValid = state.type !== "edit"
    || day.active_columns.some((column) => column.id === columnId);
  const { setReturnFocusTarget } = useDialogBoundary({
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
    if (state.type === "edit") (requiresColumnSelection ? selectorRef.current : cancelRef.current)?.focus();
  }, [state.type, requiresColumnSelection]);

  async function mutate() {
    if (state.type === "detail" || !mutationEnabled || (state.type === "edit" && (!columnValid || amount <= 0 || !unit.trim()))) return;
    setPending(true);
    setError(null);
    try {
      if (state.type === "delete") {
        const fingerprint = JSON.stringify({ entryId: entry.id, expectedRevision: revision, type: "delete" });
        if (operation.current?.fingerprint !== fingerprint) {
          operation.current = { fingerprint, key: crypto.randomUUID() };
        }
        await deleteMealLogEntry(entry.id, revision, operation.current.key);
      } else {
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
      await onComplete();
      clearReturnContext();
      const logicalSuccessTargetId = state.type === "edit"
        ? `meal-log-section-${entry.consumed_local_date}-${columnId}`
        : entry.meal_plan_column_id
          ? `meal-log-section-${entry.consumed_local_date}-${entry.meal_plan_column_id}`
          : deletedSectionHeadingId(entry.slot_name_snapshot, entry.consumed_local_date);
      const exactSuccessTargetId = state.type === "edit" && entry.meal_plan_column_id === columnId
        ? entryActionId(entry.id, state.type)
        : null;
      setReturnFocusTarget(() => (exactSuccessTargetId
        ? document.getElementById(exactSuccessTargetId)
        : null)
        ?? document.getElementById(logicalSuccessTargetId)
        ?? fallbackFocusRef.current);
      onClose();
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 401) {
        onUnauthorized(state.type === "delete" ? {
          version: 1, action: "delete", date: entry.consumed_local_date, entryId: entry.id, invoker: "entry-delete",
        } : {
          version: 1, action: "edit", date: entry.consumed_local_date, entryId: entry.id, invoker: "entry-edit",
          draft: { amount, columnId, unit },
        });
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
            if (state.type === "edit") {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--foreground-alpha-40)] lg:items-center lg:p-6">
      <div
        aria-label={state.type === "detail" ? "식사 기록 상세" : state.type === "delete" ? "식사 기록 삭제 확인" : "식사 기록 수정"}
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-card)] bg-[var(--surface)] p-4 outline-none lg:rounded-[var(--radius-card)]"
        ref={panelRef}
        role={state.type === "delete" ? "alertdialog" : "dialog"}
        tabIndex={-1}
      >
        <h2 className="text-lg font-extrabold">{state.type === "detail" ? "식사 기록 상세" : state.type === "delete" ? "식사 기록을 삭제할까요?" : "기록 수정"}</h2>
        <p className="mt-2 text-sm text-[var(--text-2)]">{entry.display_name} · {entry.quantity.amount}{entry.quantity.unit} · {entry.slot_name_snapshot}</p>
        {state.type === "detail" ? <div className="mt-4"><MealLogNutritionChart nutrition={entry.nutrition} /><p className="mt-4 text-sm text-[var(--ui-slate-600)]">나트륨 {number(entry.nutrition.sodium_mg, "mg")}</p></div> : state.type === "edit" ? (
          <div className="mt-4 space-y-3">
            {requiresColumnSelection ? <p className="text-sm font-bold">기존 위치: 삭제된 끼니 {entry.slot_name_snapshot}</p> : null}
            <label className="block text-sm font-bold">옮길 끼니{requiresColumnSelection ? " (필수)" : ""}
              <select className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setColumnId(event.target.value)} ref={selectorRef} required={requiresColumnSelection} value={columnId}>
                {requiresColumnSelection ? <option value="">선택해 주세요</option> : null}
                {day.active_columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </label>
            {requiresColumnSelection && day.active_columns.length === 0 ? <p className="text-sm text-[var(--danger-strong)]" role="alert">옮길 수 있는 현재 끼니가 없어 저장할 수 없어요.</p> : null}
            <p className="text-sm text-[var(--text-2)]">{entry.quantity.unit === "g" ? "먹은 양을 g(그램) 단위로 입력해 주세요." : `먹은 양은 ${entry.quantity.unit} 기준이에요. g 입력은 정확한 환산 정보가 있는 음식만 지원해요.`}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-bold">실제 양<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" min="0.01" onChange={(event) => setAmount(Number(event.target.value))} step="any" type="number" value={amount} /></label>
              <label className="text-sm font-bold">단위<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setUnit(event.target.value)} readOnly={entry.source.type === "cooked_batch"} value={unit} /></label>
            </div>
          </div>
        ) : <p className="mt-3 text-sm leading-6">요리한 음식이면 이 기록의 섭취 event만 되돌리고 기록은 목록에서 사라져요.</p>}
        {error ? <p className="mt-3 text-sm text-[var(--danger-strong)]" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
        <div className="mt-5 grid gap-2 min-[360px]:grid-cols-2">
          <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" disabled={pending} onClick={onClose} ref={cancelRef} type="button">{state.type === "detail" ? "닫기" : "취소"}</button>
          {state.type === "detail" ? <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary-accessible)] px-4 font-bold text-[var(--text-inverse)] hover:bg-[var(--brand-primary-accessible-hover)]" onClick={onEdit} type="button">식사 기록 수정</button> : <button className={`min-h-11 rounded-[var(--radius-control)] px-4 font-bold disabled:opacity-50 ${state.type === "delete" ? "text-[var(--danger-strong)]" : "bg-[var(--brand-primary-text)] text-[var(--text-inverse)]"}`} disabled={!mutationEnabled || pending || (state.type === "edit" && (!columnValid || amount <= 0 || !unit.trim()))} onClick={() => void mutate()} type="button">{pending ? "처리 중…" : state.type === "delete" ? "삭제" : "수정 저장"}</button>}
        </div>
      </div>
    </div>
  );
}

export function MealLogScreen({ date, guest = false, showDateNavigation = true, onDayRef, onDaysReady, onLoginRequired, onFoodLoginRequired, onDateChange, onUnauthorized }: MealLogScreenProps) {
  const weekKey = weekDates(date)[0];
  const dates = useMemo(() => weekDates(weekKey), [weekKey]);
  const [days, setDays] = useState<Record<string, MealLogDayData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedDates, setFailedDates] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogDate, setDialogDate] = useState(date);
  const [detailPreparationOpen, setDetailPreparationOpen] = useState(false);
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
  const isLoading = !guest && loading;
  useEffect(() => {
    if (guest || (!loading && weekLoadRef.current?.key === weekKey && dates.every((key) => Boolean(days[key]) || failedDates.has(key)))) onDaysReady?.(weekKey);
  }, [days, dates, failedDates, guest, loading, onDaysReady, weekKey]);
  const mutationEnabled = !guest && Boolean(day) && !loading && !failedDates.has(date);
  const dialogDay = displayDays[dialogDate];
  const dialogMutationEnabled = !guest && Boolean(dialogDay) && !loading && !failedDates.has(dialogDate);
  function openDialog(next: Exclude<DialogState, null>, targetDate: string) {
    setDialogDate(targetDate);
    if (next.type === "detail" && isPrelaunchFeatureLocked()) {
      if (guest) (onFoodLoginRequired ?? onLoginRequired ?? onUnauthorized)(targetDate);
      else setDetailPreparationOpen(true);
      return;
    }
    if (guest && next.type !== "detail") { setDialog(null); (onLoginRequired ?? onUnauthorized)(targetDate); return; }
    setDialog(next.type === "detail" ? { ...next, guestPreview: guest } : next);
  }

  function editDetail() {
    if (dialog?.type !== "detail" || Boolean(dialog.guestPreview) !== guest) {
      setDialog(null);
      return;
    }
    if (guest) { setDialog(null); (onLoginRequired ?? onUnauthorized)(dialogDate); return; }
    const entry = dialogDay?.entries.find((item) => item.id === dialog.entry.id);
    if (!entry || !dialogMutationEnabled) { setDialog(null); return; }
    setDialog({ type: "edit", entry });
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
    setDetailPreparationOpen(false);
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

  async function reloadSelected() {
    if (guestRef.current) return createGuestMealLogDay(dialogDate);
    const request = requestRef.current;
    try {
      const next = await fetchMealLogDay(dialogDate);
      if (guestRef.current || request !== requestRef.current) return next;
      setDays((current) => ({ ...current, [dialogDate]: next }));
      setFailedDates((current) => {
        const updated = new Set(current);
        updated.delete(dialogDate);
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
          delete next[dialogDate];
          return next;
        });
        setFailedDates((current) => new Set(current).add(dialogDate));
        setError(reason instanceof Error ? reason.message : "최신 식사 기록을 확인하지 못했어요.");
      }
      throw reason;
    }
  }

  async function add(selection: MealLogSourceSelection, columnId: string) {
    if (guestRef.current) return;
    const input = {
      consumedAt: null,
      consumedLocalDate: dialogDate,
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
    await reloadSelected();
    setDialog(null);
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
    if (context.action === "edit" && isPrelaunchFeatureLocked()) {
      // Keep the unsaved draft for later; preparation mode never opens the editor.
      document.getElementById(returnInvokerId(context))?.focus();
      setDetailPreparationOpen(true);
      return;
    }
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
    <main aria-labelledby="planner-log-tab meal-log-title" className="mx-auto max-w-7xl px-4 pb-3 pt-1 lg:px-6 lg:pb-8 lg:pt-2" id="planner-log-panel" role="tabpanel" tabIndex={0}>
      {!guest && error ? <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface)] p-5" role="alert"><h2 className="font-extrabold">식사 기록을 불러오지 못했어요</h2><p className="mt-2 text-sm">{error}</p><button className="mt-3 min-h-11 font-bold text-[var(--brand-primary-text)]" onClick={() => void loadWeek(true)} type="button">다시 시도</button></div> : null}
      <h1 className="sr-only" id="meal-log-title" ref={headingRef} tabIndex={-1}>일주일 식사 기록</h1>
      <div className="space-y-4 pt-3">
        {dates.map((dayKey) => {
          const cardDay = displayDays[dayKey];
          const cardDisabled = !guest && (!cardDay || loading || failedDates.has(dayKey));
          const titleId = `meal-log-title-${dayKey}`;
          return <section aria-labelledby={titleId} className="scroll-mt-[calc(var(--planner-sticky-height,80px)+12px)] overflow-hidden rounded-2xl border border-[var(--ui-slate-200)] bg-[var(--ui-white)]" data-planner-date={dayKey} key={dayKey} ref={(node) => onDayRef?.(dayKey, node)}>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--ui-slate-100)] px-4 py-3">
              <h2 aria-label={`${longDate(dayKey)} 식사 기록`} className="text-base font-extrabold text-[var(--ui-slate-800)]" id={titleId}>{dayKey === todayKey ? "오늘 · " : ""}{Number(dayKey.slice(5, 7))}/{Number(dayKey.slice(8, 10))} ({WEEKDAYS[new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()]})</h2>
              {cardDay && !isLoading ? <span aria-label={`기록한 끼니 ${cardDay.active_sections.filter((section) => section.entries.length > 0).length}개, 전체 ${cardDay.active_sections.length}개`} className="shrink-0 text-xs tabular-nums text-[var(--ui-slate-500)]">{cardDay.active_sections.filter((section) => section.entries.length > 0).length} / {cardDay.active_sections.length}</span> : null}
            </div>
            {isLoading ? <p aria-busy="true" className="p-4 text-sm text-[var(--ui-slate-500)]">기록을 불러오는 중이에요.</p> : cardDay ? <div className="p-3 lg:p-4">
              <section aria-label="하루 영양" className="mb-3 max-w-xl">
                <dl className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-1">
                  {[
                    { label: "칼로리", value: cardDay.day_total.calories_kcal, unit: "kcal" },
                    { label: "탄수화물", value: cardDay.day_total.carbohydrate_g, unit: "g" },
                    { label: "단백질", value: cardDay.day_total.protein_g, unit: "g" },
                    { label: "지방", value: cardDay.day_total.fat_g, unit: "g" },
                  ].map((metric) => <div className="min-w-0 rounded-lg border border-[var(--ui-slate-200)] px-1 py-2 text-center" key={metric.label}>
                    <dt className="text-[11px] font-bold text-[var(--ui-slate-700)]">{metric.label}</dt>
                    <dd className="mt-1 text-xs font-bold tabular-nums text-[var(--ui-slate-700)]">{metric.value === null ? <span className="text-[10px]">정보 없음</span> : <><strong className="text-sm font-[900] text-[var(--brand-primary-text)]">{number(metric.value, "")}</strong> {metric.unit}</>}</dd>
                  </div>)}
                </dl>
                {cardDay.day_total.incomplete_count > 0 ? <p className="mt-2 text-xs text-[var(--ui-slate-500)]">일부 정보 없음 {cardDay.day_total.incomplete_count}건 · 확인된 영양만 표시해요.</p> : null}
                {cardDay.day_total.calculation_status === "partial" ? <p className="mt-1 text-xs text-[var(--ui-slate-500)]">최소 확인된 영양 기준이에요.</p> : null}
              </section>
              {cardDay.entries.length === 0 ? <p className="sr-only">이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요.</p> : null}
              <div className="grid max-w-5xl items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
                {cardDay.active_sections.map((section) => <ActiveSection date={dayKey} disabled={cardDisabled} guest={guest} key={section.meal_plan_column_id} onAdd={() => openDialog({ type: "add", columnId: section.meal_plan_column_id }, dayKey)} onDelete={(entry) => openDialog({ type: "delete", entry }, dayKey)} onDetail={(entry) => openDialog({ type: "detail", entry }, dayKey)} section={section} />)}
              </div>
              {cardDay.deleted_column_sections.length > 0 ? <div className="mt-3 space-y-3">{cardDay.deleted_column_sections.map((section) => <DeletedSection date={dayKey} disabled={cardDisabled} key={section.slot_name_snapshot} onDelete={(entry) => openDialog({ type: "delete", entry }, dayKey)} onDetail={(entry) => openDialog({ type: "detail", entry }, dayKey)} section={section} />)}</div> : null}
            </div> : <p className="p-4 text-sm text-[var(--ui-slate-600)]">이 날짜의 기록을 확인하지 못했어요. 위의 다시 시도로 불러와 주세요.</p>}
          </section>;
        })}
      </div>

      {!guest && dialog?.type === "add" && dialogDay ? <MealLogAddSheet columns={dialogDay.active_columns} date={dialogDate} initialColumnId={dialog.columnId} initialSelection={dialog.selection} initialSuggestionConfirmed mutationEnabled={dialogMutationEnabled} onClose={() => setDialog(null)} onSave={add} onUnauthorized={handleAddUnauthorized} /> : null}
      {dialog && dialog.type !== "add" && (dialog.type === "detail" ? Boolean(dialog.guestPreview) === guest : !guest) && dialogDay ? <EntryDialog day={dialogDay} fallbackFocusRef={headingRef} mutationEnabled={dialogMutationEnabled} onClose={() => setDialog(null)} onComplete={reloadSelected} onEdit={editDetail} onUnauthorized={loseAuthorization} returnFocusTarget={() => document.querySelector<HTMLElement>(`[data-planner-date="${dialogDate}"] [id="${entryActionId(dialog.entry.id, dialog.type === "delete" ? "delete" : "edit")}"]`)} state={dialog} /> : null}
      {detailPreparationOpen && !guest ? <DetailPreparationNotice onClose={() => setDetailPreparationOpen(false)} /> : null}
    </main>
    </>
  );
}
