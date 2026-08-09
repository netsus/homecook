"use client";

import Image from "next/image";
import React from "react";

import {
  DEPLETED_REASON_LABELS,
  getCookedBatchActions,
  type CookedBatchAction,
} from "@/components/leftovers/cooked-batch-state";
import { formatKoreaCompactDate } from "@/lib/korean-date";
import type { CookedBatchProjection } from "@/types/cooking";

export type CookedBatchSectionState = "loading" | "empty" | "error" | "ready";

interface CookedBatchSectionProps {
  error: string | null;
  hasNext: boolean;
  items: CookedBatchProjection[];
  onAction: (batch: CookedBatchProjection, action: CookedBatchAction) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  pagePending: boolean;
  state: CookedBatchSectionState;
}

const actionLabels: Record<CookedBatchAction, string> = {
  set_finished_weight: "완성 중량 입력",
  mark_unrecoverable: "원래 무게를 알 수 없음",
  discard: "버림",
  adjust: "양 조정",
  close: "무게 없이 종료",
  cancel_current: "방금 종료 취소",
};

function CookedBatchPlaceholderIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M5 9h14l-1 10H6L5 9Z" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" />
      <path d="M9 13h6" />
    </svg>
  );
}

function nutritionLabel(batch: CookedBatchProjection) {
  if (batch.nutrition_calculation_status === "complete") return "영양 계산 가능";
  if (batch.nutrition_calculation_status === "partial") return "일부 영양 정보 없음";
  if (batch.nutrition_calculation_status === "unavailable") return "영양 정보 없음";
  return "영양 상태를 확인할 수 없음";
}

function statusLabel(batch: CookedBatchProjection) {
  if (batch.batch_status === null || batch.weight_status === null) {
    return "이전 기록 · 중량 상태를 확인할 수 없음";
  }
  if (batch.batch_status === "depleted" && batch.depleted_reason) {
    return DEPLETED_REASON_LABELS[batch.depleted_reason];
  }
  if (batch.weight_status === "known") return "남은 요리";
  if (batch.weight_status === "missing") return "무게 입력 필요";
  return "원래 무게 확인 불가";
}

function grams(value: number | null) {
  return value === null ? "확인할 수 없음" : `${value.toLocaleString("ko-KR")}g`;
}

function CookedBatchCard({
  batch,
  onAction,
}: {
  batch: CookedBatchProjection;
  onAction: CookedBatchSectionProps["onAction"];
}) {
  const actions = getCookedBatchActions(batch);
  const isLegacyUnknown = batch.batch_status === null || batch.weight_status === null;

  return (
    <article
      aria-label={`중량·잔량 기록 ${batch.recipe_title}`}
      className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
      data-testid="cooked-batch-card"
    >
      <div className="flex gap-3">
        {batch.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-14 w-14 shrink-0 rounded-[var(--radius-control)] object-cover"
            height={56}
            src={batch.recipe_thumbnail_url}
            unoptimized
            width={56}
          />
        ) : (
          <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[var(--text-3)]">
            <CookedBatchPlaceholderIcon />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="break-words text-sm font-extrabold leading-5">{batch.recipe_title}</h3>
            <span className="rounded-[var(--radius-chip)] bg-[var(--surface-fill)] px-2 py-1 text-xs font-bold text-[var(--text-2)]">{statusLabel(batch)}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
            {formatKoreaCompactDate(batch.cooked_at)} 요리
            {batch.cooking_servings === null ? "" : ` · ${batch.cooking_servings}인분`}
          </p>
        </div>
      </div>

      {isLegacyUnknown ? (
        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-3 text-sm leading-5 text-[var(--text-2)]">
          이전 기록이라 중량과 잔량 상태를 추정하지 않아요.
        </p>
      ) : batch.weight_status === "known" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3">
          <p className="text-xs text-[var(--text-3)]">완성 중량<strong className="mt-1 block text-base text-[var(--foreground)]">{grams(batch.finished_weight_g)}</strong></p>
          <p className="text-xs text-[var(--text-3)]">남은 양<strong className="mt-1 block text-base text-[var(--foreground)]">{grams(batch.remaining_weight_g)}</strong></p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-5 text-[var(--text-2)]">
          {batch.weight_status === "missing"
            ? "완성 직후 음식 전체 무게가 필요해요. 현재 남은 양을 추정하지 않아요."
            : "완성 중량과 g 단위 기록을 사용할 수 없어요."}
        </p>
      )}

      <p className="mt-2 text-xs leading-5 text-[var(--text-3)]">{nutritionLabel(batch)}</p>

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {actions.map((action) => (
            <button
              aria-label={`${batch.recipe_title} ${actionLabels[action]}`}
              className={[
                "min-h-[var(--control-height-md)] rounded-[var(--radius-control)] border px-4 text-sm font-bold",
                action === "set_finished_weight"
                  ? "border-[var(--brand-primary-text)] bg-[var(--brand-primary-text)] text-[var(--surface)]"
                  : action === "mark_unrecoverable" || action === "discard"
                    ? "border-[var(--danger-strong)] bg-[var(--surface)] text-[var(--danger-strong)]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-2)]",
              ].join(" ")}
              data-batch-action={action}
              data-batch-id={batch.id}
              key={action}
              onClick={() => onAction(batch, action)}
              type="button"
            >
              {actionLabels[action]}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CookedBatchSection({
  error,
  hasNext,
  items,
  onAction,
  onLoadMore,
  onRetry,
  pagePending,
  state,
}: CookedBatchSectionProps) {
  return (
    <section aria-labelledby="cooked-batch-section-title" className="border-t border-[var(--line)] px-4 py-5">
      <h2 className="text-lg font-extrabold" id="cooked-batch-section-title">중량·잔량 기록</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">요리 직후 음식 무게와 현재 남은 양을 따로 관리해요.</p>

      {state === "loading" ? (
        <div className="mt-4 space-y-3" data-testid="cooked-batch-loading" role="status">
          <span className="sr-only">중량·잔량 기록을 불러오는 중</span>
          {[1, 2].map((index) => <div className="h-36 rounded-[var(--radius-card)] bg-[var(--surface-fill)]" key={index} />)}
        </div>
      ) : null}
      {state === "empty" ? <p className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-fill)] p-5 text-center text-sm">중량·잔량 기록이 없어요.</p> : null}
      {state === "error" ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger-border)] p-4" role="alert">
          <p className="text-sm">{error ?? "중량·잔량 기록을 불러오지 못했어요."}</p>
          <button className="mt-3 min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] px-4 text-sm font-bold" onClick={onRetry} type="button">다시 시도</button>
        </div>
      ) : null}
      {state === "ready" ? (
        <div className="mt-4 space-y-3">
          {items.map((batch) => <CookedBatchCard batch={batch} key={batch.id} onAction={onAction} />)}
          {error ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] p-4" role="alert">
              <p className="text-sm">{error}</p>
              <button
                className="mt-3 min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] px-4 text-sm font-bold"
                onClick={onRetry}
                type="button"
              >
                처음부터 새로고침
              </button>
            </div>
          ) : null}
          {hasNext ? (
            <button
              className="min-h-[var(--control-height-md)] w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold disabled:opacity-50"
              disabled={pagePending}
              onClick={onLoadMore}
              type="button"
            >
              {pagePending ? "더 불러오는 중…" : "더 보기"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
