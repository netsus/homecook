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
}

type DialogState =
  | { type: "add"; columnId: string }
  | { type: "edit"; entry: MealLogEntry }
  | { type: "delete"; entry: MealLogEntry }
  | null;

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

function EntryRow({ entry, onDelete, onEdit }: {
  entry: MealLogEntry;
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
          onClick={onEdit}
          type="button"
        >
          수정
        </button>
        <button
          aria-label={`${entry.slot_name_snapshot}의 ${entry.display_name} 식사 기록 삭제`}
          className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold text-[var(--danger-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-strong)]"
          onClick={onDelete}
          type="button"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function ActiveSection({ section, onAdd, onDelete, onEdit }: {
  section: MealLogActiveSection;
  onAdd: () => void;
  onDelete: (entry: MealLogEntry) => void;
  onEdit: (entry: MealLogEntry) => void;
}) {
  return (
    <section aria-labelledby={`meal-log-section-${section.meal_plan_column_id}`} className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold" id={`meal-log-section-${section.meal_plan_column_id}`}>{section.slot_name_snapshot}</h2>
        {section.entries.length > 0 ? <p className="text-sm font-bold">{number(section.subtotal.calories_kcal, " kcal")}</p> : null}
      </div>
      {section.incomplete_count > 0 ? <p className="mt-1 text-xs font-bold">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow entry={entry} key={entry.id} onDelete={() => onDelete(entry)} onEdit={() => onEdit(entry)} />)}
      </ul>
      {section.entries.length === 0 ? <p className="py-4 text-sm text-[var(--text-2)]">기록한 음식이 없어요.</p> : null}
      <button
        className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand-primary-text)] px-3 text-sm font-bold text-[var(--brand-primary-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        onClick={onAdd}
        type="button"
      >
        {section.slot_name_snapshot}에 먹은 음식 추가
      </button>
    </section>
  );
}

function DeletedSection({ section, onDelete, onEdit }: {
  section: MealLogDeletedColumnSection;
  onDelete: (entry: MealLogEntry) => void;
  onEdit: (entry: MealLogEntry) => void;
}) {
  const headingId = `meal-log-deleted-${section.slot_name_snapshot.replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold" id={headingId}>삭제된 끼니의 기록 · {section.slot_name_snapshot}</h2>
        <p className="text-sm font-bold">{number(section.subtotal.calories_kcal, " kcal")}</p>
      </div>
      <p className="mt-1 text-xs text-[var(--text-2)]">새 음식 추가 없음</p>
      {section.incomplete_count > 0 ? <p className="mt-1 text-xs font-bold">일부 정보 없음 {section.incomplete_count}건</p> : null}
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {section.entries.map((entry) => <EntryRow entry={entry} key={entry.id} onDelete={() => onDelete(entry)} onEdit={() => onEdit(entry)} />)}
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
}: {
  day: MealLogDayData;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
  state: Exclude<DialogState, { type: "add" } | null>;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initialRef = useRef<HTMLButtonElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const entry = state.entry;
  const deletedOrigin = entry.meal_plan_column_id === null;
  const [columnId, setColumnId] = useState(deletedOrigin ? "" : entry.meal_plan_column_id ?? "");
  const [amount, setAmount] = useState(entry.quantity.amount);
  const [unit, setUnit] = useState(entry.quantity.unit);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  useDialogBoundary({
    closeOnEscape: !pending,
    dialogRef: panelRef,
    fallbackFocusRef,
    initialFocusRef: initialRef,
    onClose,
  });
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  async function mutate() {
    if (state.type === "edit" && (!columnId || amount <= 0 || !unit.trim())) return;
    setPending(true);
    setError(null);
    try {
      if (state.type === "delete") {
        const fingerprint = JSON.stringify({ entryId: entry.id, expectedRevision: entry.revision, type: "delete" });
        if (operation.current?.fingerprint !== fingerprint) {
          operation.current = { fingerprint, key: crypto.randomUUID() };
        }
        await deleteMealLogEntry(entry.id, entry.revision, operation.current.key);
      } else {
        const input = {
          consumedAt: entry.consumed_at,
          consumedLocalDate: entry.consumed_local_date,
          expectedRevision: entry.revision,
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
      onClose();
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 409) {
        if (deletedOrigin) setColumnId("");
        setError("다른 변경이 먼저 반영됐어요. 최신 기록을 다시 불러온 뒤 시도해 주세요.");
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
            {deletedOrigin ? <p className="text-sm font-bold">기존 위치: 삭제된 끼니 {entry.slot_name_snapshot}</p> : null}
            <label className="block text-sm font-bold">옮길 끼니{deletedOrigin ? " (필수)" : ""}
              <select className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setColumnId(event.target.value)} required={deletedOrigin} value={columnId}>
                {deletedOrigin ? <option value="">선택해 주세요</option> : null}
                {day.active_columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </label>
            {deletedOrigin && day.active_columns.length === 0 ? <p className="text-sm text-[var(--danger-strong)]" role="alert">옮길 수 있는 현재 끼니가 없어 저장할 수 없어요.</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-bold">실제 양<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" min="0.01" onChange={(event) => setAmount(Number(event.target.value))} step="any" type="number" value={amount} /></label>
              <label className="text-sm font-bold">단위<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setUnit(event.target.value)} value={unit} /></label>
            </div>
          </div>
        ) : <p className="mt-3 text-sm leading-6">요리한 음식이면 이 기록의 섭취 event만 되돌리고 기록은 목록에서 사라져요.</p>}
        {error ? <p className="mt-3 text-sm text-[var(--danger-strong)]" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
        <div className="mt-5 grid gap-2 min-[360px]:grid-cols-2">
          <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" disabled={pending} onClick={onClose} ref={initialRef} type="button">취소</button>
          <button className={`min-h-11 rounded-[var(--radius-control)] px-4 font-bold ${state.type === "delete" ? "text-[var(--danger-strong)]" : "bg-[var(--brand-primary-text)] text-[var(--text-inverse)]"}`} disabled={pending || (state.type === "edit" && (!columnId || amount <= 0 || !unit.trim()))} onClick={() => void mutate()} type="button">{pending ? "처리 중…" : state.type === "delete" ? "삭제" : "수정 저장"}</button>
        </div>
      </div>
    </div>
  );
}

export function MealLogScreen({ date, onDateChange }: MealLogScreenProps) {
  const dates = useMemo(() => weekDates(date), [date]);
  const weekKey = dates[0];
  const [days, setDays] = useState<Record<string, MealLogDayData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const requestRef = useRef(0);
  const weekLoadRef = useRef<{
    key: string;
    promise: Promise<Array<PromiseSettledResult<readonly [string, MealLogDayData]>>>;
  } | null>(null);
  const mutationKeys = useRef(new Map<string, string>());
  const day = days[date];

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
      const loaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failed = results.find((result) => result.status === "rejected");
      setDays((current) => ({ ...current, ...Object.fromEntries(loaded) }));
      if (failed?.status === "rejected") {
        setError(failed.reason instanceof Error ? failed.reason.message : "일부 날짜 표시를 불러오지 못했어요.");
      }
    } catch (reason) {
      if (request !== requestRef.current) return;
      setError(reason instanceof Error ? reason.message : "식사 기록을 불러오지 못했어요.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [dates, weekKey]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  async function reloadSelected() {
    const next = await fetchMealLogDay(date);
    setDays((current) => ({ ...current, [date]: next }));
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

  return (
    <main aria-labelledby="planner-log-tab meal-log-title" className="mx-auto max-w-5xl px-4 py-4 lg:py-6" id="planner-log-panel" role="tabpanel" tabIndex={0}>
      <section aria-label="식사 기록 날짜 선택" className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button aria-label="이전 7일" className="h-11 w-11 rounded-full border border-[var(--line-strong)] text-xl" onClick={() => onDateChange(shiftDate(date, -7))} type="button">‹</button>
          <p className="text-center text-sm font-extrabold">{compactDate(dates[0])}–{compactDate(dates[6])}</p>
          <button aria-label="다음 7일" className="h-11 w-11 rounded-full border border-[var(--line-strong)] text-xl" onClick={() => onDateChange(shiftDate(date, 7))} type="button">›</button>
        </div>
        <ol className="mt-2 flex snap-x gap-1 overflow-x-auto pb-1">
          {dates.map((item) => {
            const value = new Date(`${item}T00:00:00.000Z`);
            return (
              <li className="w-11 shrink-0 snap-start" key={item}>
                <button aria-current={item === date ? "date" : undefined} aria-label={`${compactDate(item)} ${WEEKDAYS[value.getUTCDay()]}요일 선택${days[item]?.entries.length ? ", 기록 있음" : ""}`} className={`flex min-h-11 w-11 flex-col items-center justify-center rounded-[var(--radius-control)] text-xs font-bold ${item === date ? "bg-[var(--brand-primary-text)] text-[var(--text-inverse)]" : "text-[var(--text-2)]"}`} onClick={() => onDateChange(item)} type="button">
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
            {day.active_sections.map((section) => <ActiveSection key={section.meal_plan_column_id} onAdd={() => setDialog({ type: "add", columnId: section.meal_plan_column_id })} onDelete={(entry) => setDialog({ type: "delete", entry })} onEdit={(entry) => setDialog({ type: "edit", entry })} section={section} />)}
          </div>
          {day.deleted_column_sections.length > 0 ? <div className="mt-4 space-y-3">{day.deleted_column_sections.map((section) => <DeletedSection key={section.slot_name_snapshot} onDelete={(entry) => setDialog({ type: "delete", entry })} onEdit={(entry) => setDialog({ type: "edit", entry })} section={section} />)}</div> : null}
        </>
      ) : null}

      {dialog?.type === "add" && day ? <MealLogAddSheet columns={day.active_columns} date={date} initialColumnId={dialog.columnId} onClose={() => setDialog(null)} onSave={add} /> : null}
      {dialog && dialog.type !== "add" && day ? <EntryDialog day={day} fallbackFocusRef={headingRef} onClose={() => setDialog(null)} onComplete={reloadSelected} state={dialog} /> : null}
    </main>
  );
}
