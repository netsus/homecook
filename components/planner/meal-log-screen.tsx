"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MealLogAddSheet, type MealLogSourceSelection } from "@/components/planner/meal-log-add-sheet";
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
  MealLogNutritionEvidence,
} from "@/types/meal-log";

interface MealLogScreenProps {
  date: string;
  onDateChange: (date: string) => void;
  onUnauthorized: () => void;
}

type DialogState =
  | { type: "add"; columnId: string; restoredInvoker?: boolean; selection?: MealLogSourceSelection }
  | { type: "edit"; entry: MealLogEntry; restoredInvoker?: boolean; draft?: { amount: number; columnId: string; unit: string } }
  | { type: "delete"; entry: MealLogEntry; restoredInvoker?: boolean }
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

function compactDate(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function longDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${WEEKDAYS[value.getUTCDay()]}요일`;
}

function deletedSectionHeadingId(slotName: string) {
  return `meal-log-deleted-${slotName.replaceAll(" ", "-")}`;
}

function sectionAddActionId(columnId: string) {
  return `meal-log-column-${columnId}-add`;
}

function entryActionId(entryId: string, action: "delete" | "edit") {
  return `meal-log-entry-${entryId}-${action}`;
}

function returnInvokerId(context: MealLogReturnContext) {
  if (context.invoker === "section-add") return sectionAddActionId(context.columnId);
  return entryActionId(context.entryId, context.invoker === "entry-edit" ? "edit" : "delete");
}

function number(value: number | null, unit: string) {
  return value === null ? "정보 준비 중" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}${unit}`;
}

function stateLabel(nutrition: MealLogNutritionEvidence) {
  if (nutrition.calculation_status === "partial") return "최소";
  if (nutrition.calculation_status === "unavailable") return "정보 준비 중";
  return null;
}

function NutritionSummary({
  compact = false,
  incompleteCount = 0,
  nutrition,
}: {
  compact?: boolean;
  incompleteCount?: number;
  nutrition: MealLogNutritionEvidence;
}) {
  const state = stateLabel(nutrition);
  return (
    <div className={compact ? "text-xs text-[var(--text-2)]" : "mt-3"}>
      <p className={compact ? "font-bold text-[var(--foreground)]" : "text-3xl font-black tracking-tight"}>
        {state === "최소" ? "최소 " : ""}{number(nutrition.calories_kcal, " kcal")}
      </p>
      <p className={`${compact ? "mt-1" : "mt-3 text-sm"} leading-6`}>
        탄수화물 {number(nutrition.carbohydrate_g, "g")} · 단백질 {number(nutrition.protein_g, "g")} · 지방 {number(nutrition.fat_g, "g")}
      </p>
      <p className={compact ? "mt-1" : "mt-1 text-sm"}>나트륨 {number(nutrition.sodium_mg, "mg")}</p>
      {state ? <p className="mt-1 font-bold text-[var(--brand-primary-text)]">{state}</p> : null}
      {incompleteCount > 0 ? <p className="mt-1 font-bold">일부 정보 없음 {incompleteCount}건</p> : null}
    </div>
  );
}

function EntryRow({ disabled, entry, onDelete, onEdit }: {
  entry: MealLogEntry;
  disabled: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const source = entry.source.type === "cooked_batch"
    ? "요리한 음식"
    : entry.source.type === "food_product" ? "제품" : "재료";
  return (
    <li className="py-3">
      <div className="min-w-0">
        <p className="line-clamp-2 font-extrabold [overflow-wrap:anywhere]">{entry.display_name}</p>
        <p className="mt-1 text-xs text-[var(--text-2)]">
          {entry.display_brand ? `${entry.display_brand} · ` : ""}{entry.quantity.amount}{entry.quantity.unit} · {source}
        </p>
        <NutritionSummary compact nutrition={entry.nutrition} />
      </div>
      <div className="mt-2 flex justify-end gap-2 min-[360px]:flex-row max-[359px]:grid">
        <button
          aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 수정`}
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          disabled={disabled}
          id={entryActionId(entry.id, "edit")}
          onClick={onEdit}
          type="button"
        >
          수정
        </button>
        <button
          aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 삭제`}
          className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold text-[var(--danger-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-strong)]"
          disabled={disabled}
          id={entryActionId(entry.id, "delete")}
          onClick={onDelete}
          type="button"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function ActiveSection({ disabled, section, onAdd, onDelete, onEdit }: {
  disabled: boolean;
  section: MealLogActiveSection;
  onAdd: () => void;
  onDelete: (entry: MealLogEntry) => void;
  onEdit: (entry: MealLogEntry) => void;
}) {
  return (
    <section aria-labelledby={`meal-log-section-${section.meal_plan_column_id}`} className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold" id={`meal-log-section-${section.meal_plan_column_id}`} tabIndex={-1}>{section.slot_name_snapshot}</h2>
        {section.entries.length > 0 ? <p className="text-sm font-bold">{number(section.subtotal.calories_kcal, " kcal")}</p> : null}
      </div>
      {section.incomplete_count > 0 ? <p className="mt-1 text-xs font-bold">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} key={entry.id} onDelete={() => onDelete(entry)} onEdit={() => onEdit(entry)} />)}
      </ul>
      {section.entries.length === 0 ? <p className="py-4 text-sm text-[var(--text-2)]">기록한 음식이 없어요.</p> : null}
      <button
        className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand-primary-text)] px-3 text-sm font-bold text-[var(--brand-primary-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        disabled={disabled}
        id={sectionAddActionId(section.meal_plan_column_id)}
        onClick={onAdd}
        type="button"
      >
        {section.slot_name_snapshot}에 먹은 음식 추가
      </button>
    </section>
  );
}

function DeletedSection({ disabled, section, onDelete, onEdit }: {
  disabled: boolean;
  section: MealLogDeletedColumnSection;
  onDelete: (entry: MealLogEntry) => void;
  onEdit: (entry: MealLogEntry) => void;
}) {
  const headingId = deletedSectionHeadingId(section.slot_name_snapshot);
  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold" id={headingId} tabIndex={-1}>삭제된 끼니의 기록 · {section.slot_name_snapshot}</h2>
        <p className="text-sm font-bold">{number(section.subtotal.calories_kcal, " kcal")}</p>
      </div>
      <p className="mt-1 text-xs text-[var(--text-2)]">새 음식 추가 없음</p>
      {section.incomplete_count > 0 ? <p className="mt-1 text-xs font-bold">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow disabled={disabled} entry={entry} key={entry.id} onDelete={() => onDelete(entry)} onEdit={() => onEdit(entry)} />)}
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
  mutationEnabled,
  onUnauthorized,
}: {
  day: MealLogDayData;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
  state: Exclude<DialogState, { type: "add" } | null>;
  onClose: () => void;
  onComplete: () => Promise<MealLogDayData>;
  mutationEnabled: boolean;
  onUnauthorized: (context: MealLogReturnContext) => void;
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
    if (!error) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  async function mutate() {
    if (!mutationEnabled || (state.type === "edit" && (!columnValid || amount <= 0 || !unit.trim()))) return;
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
        ? `meal-log-section-${columnId}`
        : entry.meal_plan_column_id
          ? `meal-log-section-${entry.meal_plan_column_id}`
          : deletedSectionHeadingId(entry.slot_name_snapshot);
      const exactSuccessTargetId = entryActionId(entry.id, state.type);
      setReturnFocusTarget(() => document.getElementById(exactSuccessTargetId)
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
        aria-label={state.type === "delete" ? "식사 기록 삭제 확인" : "식사 기록 수정"}
        aria-modal="true"
        className="w-full max-w-lg rounded-t-[var(--radius-card)] bg-[var(--surface)] p-4 outline-none lg:rounded-[var(--radius-card)]"
        ref={panelRef}
        role={state.type === "delete" ? "alertdialog" : "dialog"}
        tabIndex={-1}
      >
        <h2 className="text-lg font-extrabold">{state.type === "delete" ? "식사 기록을 삭제할까요?" : "기록 수정"}</h2>
        <p className="mt-2 text-sm text-[var(--text-2)]">{entry.display_name} · {entry.quantity.amount}{entry.quantity.unit} · {entry.slot_name_snapshot}</p>
        {state.type === "edit" ? (
          <div className="mt-4 space-y-3">
            {requiresColumnSelection ? <p className="text-sm font-bold">기존 위치: 삭제된 끼니 {entry.slot_name_snapshot}</p> : null}
            <label className="block text-sm font-bold">옮길 끼니{requiresColumnSelection ? " (필수)" : ""}
              <select className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setColumnId(event.target.value)} ref={selectorRef} required={requiresColumnSelection} value={columnId}>
                {requiresColumnSelection ? <option value="">선택해 주세요</option> : null}
                {day.active_columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </label>
            {requiresColumnSelection && day.active_columns.length === 0 ? <p className="text-sm text-[var(--danger-strong)]" role="alert">옮길 수 있는 현재 끼니가 없어 저장할 수 없어요.</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-bold">실제 양<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" min="0.01" onChange={(event) => setAmount(Number(event.target.value))} step="any" type="number" value={amount} /></label>
              <label className="text-sm font-bold">단위<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setUnit(event.target.value)} value={unit} /></label>
            </div>
          </div>
        ) : <p className="mt-3 text-sm leading-6">요리한 음식이면 이 기록의 섭취 event만 되돌리고 기록은 목록에서 사라져요.</p>}
        {error ? <p className="mt-3 text-sm text-[var(--danger-strong)]" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
        <div className="mt-5 grid gap-2 min-[360px]:grid-cols-2">
          <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" disabled={pending} onClick={onClose} ref={cancelRef} type="button">취소</button>
          <button className={`min-h-11 rounded-[var(--radius-control)] px-4 font-bold disabled:opacity-50 ${state.type === "delete" ? "text-[var(--danger-strong)]" : "bg-[var(--brand-primary-text)] text-[var(--text-inverse)]"}`} disabled={!mutationEnabled || pending || (state.type === "edit" && (!columnValid || amount <= 0 || !unit.trim()))} onClick={() => void mutate()} type="button">{pending ? "처리 중…" : state.type === "delete" ? "삭제" : "수정 저장"}</button>
        </div>
      </div>
    </div>
  );
}

export function MealLogScreen({ date, onDateChange, onUnauthorized }: MealLogScreenProps) {
  const dates = useMemo(() => weekDates(date), [date]);
  const weekKey = dates[0];
  const [days, setDays] = useState<Record<string, MealLogDayData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedDates, setFailedDates] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const dateRailRef = useRef<HTMLOListElement | null>(null);
  const dateRadioRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const requestRef = useRef(0);
  const weekLoadRef = useRef<{
    key: string;
    promise: Promise<Array<PromiseSettledResult<readonly [string, MealLogDayData]>>>;
  } | null>(null);
  const mutationKeys = useRef(new Map<string, string>());
  const restoredContextRef = useRef(false);
  const day = days[date];
  const mutationEnabled = Boolean(day) && !loading && !failedDates.has(date);

  const loseAuthorization = useCallback((context?: MealLogReturnContext) => {
    if (context) saveReturnContext(context);
    setDays({});
    setDialog(null);
    setError(null);
    onUnauthorized();
  }, [onUnauthorized]);

  const handleAddUnauthorized = useCallback((selection: MealLogSourceSelection | null, columnId: string) => {
    loseAuthorization({ version: 1, action: "add", date, columnId, invoker: "section-add", draft: selection });
  }, [date, loseAuthorization]);

  const loadWeek = useCallback(async (force = false) => {
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
      if (request !== requestRef.current) return;
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
      if (request !== requestRef.current) return;
      setError(reason instanceof Error ? reason.message : "식사 기록을 불러오지 못했어요.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [dates, loseAuthorization, weekKey]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    const rail = dateRailRef.current;
    const selectedRadio = dateRadioRefs.current.get(date);
    if (!rail || !selectedRadio) return;
    const railRect = rail.getBoundingClientRect();
    const selectedRect = selectedRadio.getBoundingClientRect();
    if (selectedRect.left < railRect.left) {
      rail.scrollLeft += selectedRect.left - railRect.left;
    } else if (selectedRect.right > railRect.right) {
      rail.scrollLeft += selectedRect.right - railRect.right;
    }
  }, [date, dates]);

  function handleDateRadioKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const activationKey = event.key === " " || event.key === "Enter";
    const movementKey = ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key);
    if (!activationKey && !movementKey) return;
    event.preventDefault();

    let targetIndex = index;
    if (event.key === "ArrowLeft") targetIndex = Math.max(0, index - 1);
    if (event.key === "ArrowRight") targetIndex = Math.min(dates.length - 1, index + 1);
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = dates.length - 1;
    const targetDate = activationKey ? dates[index] : dates[targetIndex];
    if (targetDate !== date) onDateChange(targetDate);
    requestAnimationFrame(() => dateRadioRefs.current.get(targetDate)?.focus());
  }

  async function reloadSelected() {
    try {
      const next = await fetchMealLogDay(date);
      setDays((current) => ({ ...current, [date]: next }));
      setFailedDates((current) => {
        const updated = new Set(current);
        updated.delete(date);
        return updated;
      });
      setError(null);
      return next;
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 401) {
        loseAuthorization();
      } else {
        setDialog(null);
        setDays((current) => {
          const next = { ...current };
          delete next[date];
          return next;
        });
        setFailedDates((current) => new Set(current).add(date));
        setError(reason instanceof Error ? reason.message : "최신 식사 기록을 확인하지 못했어요.");
      }
      throw reason;
    }
  }

  async function add(selection: MealLogSourceSelection, columnId: string) {
    const input = {
      consumedAt: null,
      consumedLocalDate: date,
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
    document.getElementById(returnInvokerId(context))?.focus();
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
    <main aria-labelledby="planner-log-tab meal-log-title" className="mx-auto max-w-5xl px-4 py-4 lg:py-6" id="planner-log-panel" role="tabpanel" tabIndex={0}>
      <section aria-label="식사 기록 날짜 탐색" className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button aria-label="이전 7일" className="h-11 w-11 rounded-full border border-[var(--line-strong)] text-xl" onClick={() => onDateChange(shiftDate(date, -7))} type="button">‹</button>
          <p className="text-center text-sm font-extrabold">{compactDate(dates[0])}–{compactDate(dates[6])}</p>
          <button aria-label="다음 7일" className="h-11 w-11 rounded-full border border-[var(--line-strong)] text-xl" onClick={() => onDateChange(shiftDate(date, 7))} type="button">›</button>
        </div>
        <ol aria-label="식사 기록 날짜 선택" className="mt-2 flex snap-x gap-1 overflow-x-auto overscroll-x-contain pb-1" ref={dateRailRef} role="radiogroup">
          {dates.map((item, index) => {
            const value = new Date(`${item}T00:00:00.000Z`);
            return (
              <li className="w-11 shrink-0 snap-start" key={item} role="none">
                <button aria-checked={item === date} aria-label={`${compactDate(item)} ${WEEKDAYS[value.getUTCDay()]}요일 선택${days[item]?.entries.length ? ", 기록 있음" : ""}`} className={`flex min-h-11 w-11 flex-col items-center justify-center rounded-[var(--radius-control)] text-xs font-bold ${item === date ? "bg-[var(--brand-primary-text)] text-[var(--text-inverse)]" : "text-[var(--text-2)]"}`} onClick={() => onDateChange(item)} onKeyDown={(event) => handleDateRadioKeyDown(event, index)} ref={(node) => { if (node) dateRadioRefs.current.set(item, node); else dateRadioRefs.current.delete(item); }} role="radio" tabIndex={item === date ? 0 : -1} type="button">
                  <span>{WEEKDAYS[value.getUTCDay()]}</span><span>{Number(item.slice(8))}</span>{days[item]?.entries.length ? <span aria-hidden="true">•</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <h1 className="mt-5 text-xl font-extrabold" id="meal-log-title" ref={headingRef} tabIndex={-1}>{longDate(date)} 식사 기록</h1>
      {loading ? <div aria-busy="true" className="mt-4 space-y-3"><div className="h-36 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" /><div className="h-44 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" /></div> : null}
      {error ? <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface)] p-5" role="alert"><h2 className="font-extrabold">식사 기록을 불러오지 못했어요</h2><p className="mt-2 text-sm">{error}</p><button className="mt-3 min-h-11 font-bold text-[var(--brand-primary-text)]" onClick={() => void loadWeek(true)} type="button">다시 시도</button></div> : null}

      {!loading && day ? (
        <>
          {day.entries.length > 0 ? (
            <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4" aria-labelledby="meal-log-summary-title">
              <h2 className="font-extrabold" id="meal-log-summary-title">오늘 먹은 영양</h2>
              <NutritionSummary incompleteCount={day.day_total.incomplete_count} nutrition={day.day_total} />
            </section>
          ) : null}
          {day.entries.length === 0 ? <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-center text-sm text-[var(--text-2)]">이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요.</p> : null}
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            {day.active_sections.map((section) => <ActiveSection disabled={!mutationEnabled} key={section.meal_plan_column_id} onAdd={() => setDialog({ type: "add", columnId: section.meal_plan_column_id })} onDelete={(entry) => setDialog({ type: "delete", entry })} onEdit={(entry) => setDialog({ type: "edit", entry })} section={section} />)}
          </div>
          {day.deleted_column_sections.length > 0 ? <div className="mt-4 space-y-3">{day.deleted_column_sections.map((section) => <DeletedSection disabled={!mutationEnabled} key={section.slot_name_snapshot} onDelete={(entry) => setDialog({ type: "delete", entry })} onEdit={(entry) => setDialog({ type: "edit", entry })} section={section} />)}</div> : null}
        </>
      ) : null}

      {dialog?.type === "add" && day ? <MealLogAddSheet columns={day.active_columns} date={date} initialColumnId={dialog.columnId} initialSelection={dialog.selection} initialSuggestionConfirmed mutationEnabled={mutationEnabled} onClose={() => setDialog(null)} onSave={add} onUnauthorized={handleAddUnauthorized} /> : null}
      {dialog && dialog.type !== "add" && day ? <EntryDialog day={day} fallbackFocusRef={headingRef} mutationEnabled={mutationEnabled} onClose={() => setDialog(null)} onComplete={reloadSelected} onUnauthorized={loseAuthorization} state={dialog} /> : null}
    </main>
  );
}
