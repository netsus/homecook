"use client";

import Image from "next/image";
import React, { useState } from "react";
import { getCookedBatchActions, type CookedBatchAction } from "./cooked-batch-state";
import { formatKoreaCompactDate } from "@/lib/korean-date";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { Skeleton } from "@/components/ui/skeleton";
import type { CookedBatchProjection } from "@/types/cooking";

export type CookedBatchSectionState = "loading" | "empty" | "error" | "ready";
interface CookedBatchSectionProps {
  error: string | null;
  hasNext: boolean;
  items: CookedBatchProjection[];
  onAction: (batch: CookedBatchProjection, action: CookedBatchAction) => void;
  onRecord: (batch: CookedBatchProjection) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  pagePending: boolean;
  state: CookedBatchSectionState;
}
const actionLabels: Record<CookedBatchAction, string> = {
  set_finished_weight: "무게 입력",
  mark_unrecoverable: "무게 확인 불가",
  discard: "버림",
  adjust: "남은 양 수정",
  close: "다 먹음·버림 처리",
  cancel_current: "종료 취소",
};

export function CookedBatchSection({ error, hasNext, items, onAction, onRecord, onLoadMore, onRetry, pagePending, state }: CookedBatchSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const remaining = items.filter(batch => batch.status === "leftover" && batch.batch_status !== "depleted");
  return <section aria-label="남은 요리 목록" className="space-y-3 p-4">
    {state === "loading" ? <div aria-busy="true" aria-label="남은 요리 불러오는 중" className="space-y-3" role="status">{[0, 1].map(id => <Skeleton className="h-36 rounded-2xl" key={id} />)}</div> : null}
    {error ? <div role="alert"><p>{error}</p><button className="mt-2 min-h-11 rounded-xl border px-4" onClick={onRetry} type="button">다시 시도</button></div> : null}
    {state !== "loading" && state !== "error" && remaining.length === 0 && !hasNext ? <p className="py-12 text-center">남은 요리가 없어요.</p> : null}
    {remaining.map(batch => {
      const actions = getCookedBatchActions(batch).filter(action => action !== "mark_unrecoverable");
      const canRecord = batch.weight_status === "known" && batch.batch_status === "available" && (batch.remaining_weight_g ?? 0) > 0;
      return <article aria-label={batch.recipe_title} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4" data-testid="cooked-batch-card" key={batch.id}>
        <div className="flex items-start gap-3">
          <Image alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" height={64} width={64} unoptimized src={resolveRecipeImage({ id: batch.recipe_id, thumbnail_url: batch.recipe_thumbnail_url })} />
          <div className="min-w-0 flex-1"><h2 className="line-clamp-2 font-bold">{batch.recipe_title}</h2><p className="mt-1 text-sm text-[var(--text-2)]">{formatKoreaCompactDate(batch.cooked_at)}{batch.cooking_servings ? ` · ${batch.cooking_servings}인분` : ""}</p></div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="font-semibold">{canRecord ? `${batch.weight_source === "estimated" ? "약 " : ""}${batch.remaining_weight_g?.toLocaleString("ko-KR")}g 남음` : "무게 없음"}</p>
          <div className="flex items-center gap-2">
            {canRecord ? <button aria-label={`${batch.recipe_title} 식사 기록`} className="min-h-11 rounded-xl bg-[var(--brand)] px-3 font-bold text-white" onClick={() => onRecord(batch)} type="button">식사 기록</button>
              : actions.includes("set_finished_weight") ? <button className="min-h-11 rounded-xl border border-[var(--brand)] px-3 text-[var(--brand)]" onClick={() => onAction(batch, "set_finished_weight")} type="button">무게 입력</button> : null}
            {actions.length > 0 ? <button aria-label={`${batch.recipe_title} 관리`} aria-expanded={expandedId === batch.id} className="grid h-11 w-11 place-items-center rounded-xl border text-xl" onClick={() => setExpandedId(current => current === batch.id ? null : batch.id)} type="button">⋯</button> : null}
          </div>
        </div>
        {expandedId === batch.id ? <div aria-label={`${batch.recipe_title} 관리 메뉴`} className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {actions.map(action => <button className="min-h-11 rounded-xl border px-3" data-batch-id={batch.id} data-batch-action={action} key={action} onClick={() => onAction(batch, action)} type="button">{action === "set_finished_weight" && batch.weight_status === "known" ? "무게 수정" : actionLabels[action]}</button>)}
        </div> : null}
      </article>;
    })}
    {hasNext ? <button className="min-h-11 w-full rounded-xl border bg-[var(--surface)]" disabled={pagePending} onClick={onLoadMore} type="button">{pagePending ? "불러오는 중…" : "더 보기"}</button> : null}
  </section>;
}
