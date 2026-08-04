"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

export interface RecipeFutureImpact {
  impact_token: string;
  expires_at: string;
  proposed_content_hash: string;
  future_meal_count: number;
  date_range: { from: string | null; to: string | null };
  incomplete_shopping_list_count: number;
  completed_shopping_list_count: number;
  active_cooking_claim_count: number;
  replace_all_allowed: boolean;
}

type Strategy = "keep" | "replace_all";

function dateLabel(value: string | null) {
  if (!value) return "없음";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(`${value}T12:00:00+09:00`));
}

export function RecipeFutureImpactDialog({ errorCode, impact, loading = false, onClose, onLogin, onRecheck, onSave, submitting = false }: {
  errorCode?: string | null;
  impact: RecipeFutureImpact | null;
  loading?: boolean;
  submitting?: boolean;
  onClose: () => void;
  onLogin?: () => void;
  onRecheck: () => void;
  onSave: (strategy: Strategy) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const recheckRef = useRef<HTMLButtonElement>(null);
  const loginRef = useRef<HTMLButtonElement>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const unauthorized = errorCode === "UNAUTHORIZED";
  const needsRecheck = Boolean(errorCode) && !unauthorized;
  useDialogBoundary({ dialogRef, initialFocusRef: unauthorized ? loginRef : needsRecheck ? recheckRef : undefined, onClose, closeOnEscape: !submitting });
  useEffect(() => {
    if (!errorCode) return;
    setStrategy(null);
    requestAnimationFrame(() => (unauthorized ? loginRef : recheckRef).current?.focus());
  }, [errorCode, unauthorized]);

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)] p-4 sm:items-center" role="presentation">
    <div aria-busy={loading || submitting} aria-describedby="future-impact-copy" aria-labelledby="future-impact-title" aria-modal="true" className="flex max-h-[calc(100dvh-32px)] w-full max-w-[390px] flex-col overflow-hidden rounded-[16px] bg-[var(--surface)] shadow-xl" ref={dialogRef} role="dialog" tabIndex={-1}>
      <div className="shrink-0 border-b border-[var(--line)] p-4"><h2 className="text-lg font-extrabold" id="future-impact-title">미래 계획 반영 확인</h2></div>
      <div className="min-h-0 overflow-y-auto p-4" id="future-impact-copy">
        {loading ? <p role="status">영향을 확인하고 있어요.</p> : null}
        {unauthorized ? <div role="alert"><p>로그인이 만료됐어요. 다시 로그인하면 수정한 내용으로 저장을 계속할 수 있어요.</p><button className="mt-3 min-h-11 rounded-[var(--radius-control)] border px-4 font-bold" onClick={onLogin} ref={loginRef} type="button">로그인하고 저장 계속하기</button></div> : null}
        {needsRecheck ? <div role="alert"><p>영향을 확인하지 못했어요. 최신 내용으로 다시 확인해 주세요.</p><button className="mt-3 min-h-11 rounded-[var(--radius-control)] border px-4 font-bold" onClick={onRecheck} ref={recheckRef} type="button">{errorCode === "RECIPE_IMPACT_STALE" || errorCode === "MEAL_COOKING_ALREADY_STARTED" ? "최신 영향 다시 확인" : "다시 확인"}</button></div> : null}
        {!loading && !errorCode && impact ? <>
          <section className="rounded-[16px] bg-[var(--surface-fill)] p-4" aria-label="영향 요약">
            <p className="font-bold">미래 계획 {impact.future_meal_count}개</p>
            <p>{dateLabel(impact.date_range.from)} ~ {dateLabel(impact.date_range.to)}</p>
            <p>미완료 장보기 {impact.incomplete_shopping_list_count}개 · 완료 장보기 {impact.completed_shopping_list_count}개</p>
            <p>진행 중인 요리 {impact.active_cooking_claim_count}개</p>
          </section>
          <fieldset className="mt-4 space-y-3"><legend className="font-bold">미래 계획에 어떻게 반영할까요?</legend>
            <label className="block min-h-11 rounded-[16px] border p-3"><input aria-describedby="replace-all-description replace-all-reason" checked={strategy === "replace_all"} disabled={!impact.replace_all_allowed || submitting} name="future-strategy" onChange={() => setStrategy("replace_all")} type="radio" /> <strong>전체 반영</strong><span className="block text-sm" id="replace-all-description">미래 계획과 미완료 장보기를 새 내용에 맞춰 바꿔요.</span>{!impact.replace_all_allowed ? <span className="block text-sm text-[var(--danger-strong)]" id="replace-all-reason">진행 중인 요리가 있어 전체 반영할 수 없어요.</span> : null}</label>
            <label className="block min-h-11 rounded-[16px] border p-3"><input checked={strategy === "keep"} disabled={submitting} name="future-strategy" onChange={() => setStrategy("keep")} type="radio" /> <strong>기존 계획 유지</strong><span className="block text-sm">기존 계획은 당시 내용으로 유지해요.</span></label>
          </fieldset>
          <p className="mt-4 text-sm">완료한 장보기 기록은 바뀌지 않아요. 요리는 각 계획에 고정된 레시피 내용으로 진행돼요.</p>
        </> : null}
      </div>
      <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] p-4"><button className="min-h-11 rounded-[var(--radius-control)] border" disabled={submitting} onClick={onClose} type="button">취소</button><button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={!impact || loading || Boolean(errorCode) || submitting || !strategy} onClick={() => strategy && onSave(strategy)} type="button">{submitting ? "저장 중…" : "저장"}</button></footer>
    </div>
  </div>;
}
