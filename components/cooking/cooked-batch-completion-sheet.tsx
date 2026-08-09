"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import type {
  SnapshotV2CompleteBody,
  SnapshotV2PantryCandidate,
} from "@/types/cooking";

export interface CookedBatchCompletionError {
  code: string;
  fields: Array<{ field: string; reason: string }>;
  message: string;
  status: number;
}

interface CookedBatchCompletionSheetProps {
  candidates: SnapshotV2PantryCandidate[];
  initialSelection?: string[];
  initialWeight?: {
    action: "set_finished_weight" | "weigh_later";
    finishedWeight: string;
  };
  onClose: () => void;
  onSubmit: (body: SnapshotV2CompleteBody) => void;
  serverError: CookedBatchCompletionError | null;
  submitting: boolean;
}

export function CookedBatchCompletionSheet({
  candidates,
  initialSelection = [],
  initialWeight,
  onClose,
  onSubmit,
  serverError,
  submitting,
}: CookedBatchCompletionSheetProps) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelection));
  const [weightAction, setWeightAction] = useState<"set_finished_weight" | "weigh_later" | null>(initialWeight?.action ?? null);
  const [finishedWeight, setFinishedWeight] = useState(initialWeight?.finishedWeight ?? "");
  const [helperOpen, setHelperOpen] = useState(false);
  const [grossWeight, setGrossWeight] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useDialogBoundary({
    closeOnEscape: !submitting,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    onClose,
  });

  useEffect(() => {
    const validIds = new Set(candidates.map((candidate) => candidate.pantry_item_id));
    setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [candidates]);

  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { label: string; rows: SnapshotV2PantryCandidate[] }>();
    for (const candidate of candidates) {
      const group = groups.get(candidate.ingredient_id) ?? {
        label: candidate.standard_name,
        rows: [],
      };
      group.rows.push(candidate);
      groups.set(candidate.ingredient_id, group);
    }
    return [...groups.values()];
  }, [candidates]);

  const parsedWeight = Number(finishedWeight);
  const validFinishedWeight = finishedWeight.trim() !== ""
    && Number.isFinite(parsedWeight)
    && parsedWeight > 0;
  const canSubmit = !submitting
    && (weightAction === "weigh_later"
      || (weightAction === "set_finished_weight" && validFinishedWeight));
  const weightError = serverError?.fields.some(({ field }) => field === "finished_weight_g") ?? false;
  const errorDescription = serverError ? "cooked-batch-completion-error" : undefined;
  const parsedGrossWeight = Number(grossWeight);
  const parsedTareWeight = Number(tareWeight);
  const helperResult = parsedGrossWeight - parsedTareWeight;
  const validHelperResult = grossWeight.trim() !== ""
    && tareWeight.trim() !== ""
    && Number.isFinite(parsedGrossWeight)
    && Number.isFinite(parsedTareWeight)
    && parsedGrossWeight > 0
    && parsedTareWeight > 0
    && helperResult > 0;

  const toggleCandidate = (pantryItemId: string) => {
    if (submitting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(pantryItemId)) next.delete(pantryItemId);
      else next.add(pantryItemId);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!canSubmit || weightAction === null) return;
    const consumedIds = candidates
      .map((candidate) => candidate.pantry_item_id)
      .filter((id) => selectedIds.has(id));
    if (weightAction === "weigh_later") {
      onSubmit({
        consumed_pantry_item_ids: consumedIds,
        weight_action: "weigh_later",
        finished_weight_g: null,
      });
      return;
    }
    onSubmit({
      consumed_pantry_item_ids: consumedIds,
      weight_action: "set_finished_weight",
      finished_weight_g: parsedWeight,
    });
  };

  return (
    <AppBottomSheet
      ariaLabelledBy="cooked-batch-completion-title"
      bodyClassName="space-y-5"
      closeDisabled={submitting}
      description="실제로 사용한 팬트리 항목과 완성된 음식 전체 무게를 확인해요."
      descriptionClassName="mt-1 text-sm leading-5 text-[var(--wave1-text-2)]"
      footer={
        <div
          className="[--wave1-mint-contrast:var(--brand-primary-text)] [--wave1-mint-contrast-deep:var(--foreground)] [&_button]:text-base"
          data-testid="cooked-batch-completion-actions"
        >
          <AppModalFooterActions
            cancelDisabled={submitting}
            cancelLabel="돌아가기"
            confirmDisabled={!canSubmit}
            confirmLabel={submitting ? "저장 중…" : "완료 저장"}
            onCancel={onClose}
            onConfirm={handleSubmit}
          />
        </div>
      }
      horizontalPaddingClassName="px-4"
      onClose={() => {
        if (!submitting) onClose();
      }}
      panelClassName="max-w-[430px]"
      panelRef={panelRef}
      testId="cooked-batch-completion-sheet"
      title="요리 완료"
      titleRef={titleRef}
      titleTabIndex={0}
    >
      {submitting ? (
        <div
          className="rounded-[var(--radius-card)] bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-semibold leading-5 text-[var(--brand-primary-hover)]"
          role="status"
        >
          완료 결과를 기다리는 중이에요. 버튼과 선택을 잠시 잠갔어요.
        </div>
      ) : null}

      {serverError ? (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface-fill)] px-4 py-3 text-sm leading-5 text-[var(--danger-strong)] outline-none"
          id="cooked-batch-completion-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <strong className="block font-bold">{serverError.message}</strong>
          <span className="mt-1 block text-[var(--wave1-text-2)]">선택한 항목과 입력값은 유지했어요. 확인한 뒤 다시 시도해 주세요.</span>
        </div>
      ) : null}

      <aside className="rounded-[var(--radius-card)] bg-[var(--brand-primary-soft)] px-4 py-3 text-xs font-semibold leading-5 text-[var(--wave1-ink)]">
        같은 원재료라도 제품과 팬트리 항목은 다를 수 있어요. 실제로 사용한 팬트리 항목만 선택해 주세요.
      </aside>

      <section aria-labelledby="cooked-batch-pantry-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold" id="cooked-batch-pantry-heading">사용한 팬트리 항목</h3>
          <span className="text-xs font-semibold text-[var(--wave1-text-3)]">{selectedIds.size}개 선택</span>
        </div>

        {groupedCandidates.length === 0 ? (
          <div
            className="rounded-[var(--radius-card)] border border-dashed border-[var(--wave1-border)] bg-[var(--wave1-surface-fill)] px-4 py-6 text-center"
            data-testid="cooked-batch-pantry-empty"
          >
            <strong className="block text-sm font-bold">사용할 팬트리 항목이 없어요</strong>
            <p className="mt-1 text-xs leading-5 text-[var(--wave1-text-2)]">빈 선택을 유지하고 음식 무게만 선택해 완료할 수 있어요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedCandidates.map((group) => {
              let productOrdinal = 0;
              let ingredientOrdinal = 0;
              return (
                <fieldset className="space-y-2" key={group.rows[0].ingredient_id}>
                  <legend className="mb-2 text-sm font-semibold text-[var(--wave1-text-2)]">{group.label}</legend>
                  {group.rows.map((candidate) => {
                    const checked = selectedIds.has(candidate.pantry_item_id);
                    const ordinal = candidate.item_type === "food_product"
                      ? ++productOrdinal
                      : ++ingredientOrdinal;
                    const context = candidate.item_type === "food_product"
                      ? `${candidate.brand?.trim() || "무브랜드"} · 제품 팬트리 항목 ${ordinal}`
                      : `일반 재료 · 팬트리 항목 ${ordinal}`;
                    return (
                      <label
                        className={[
                          "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border px-3 py-3",
                          checked
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]"
                            : "border-[var(--wave1-border)] bg-[var(--wave1-surface)]",
                          submitting ? "cursor-not-allowed opacity-70" : "",
                        ].join(" ")}
                        key={candidate.pantry_item_id}
                      >
                        <input
                          aria-checked={checked}
                          aria-label={`${candidate.name} ${candidate.brand?.trim() || (candidate.item_type === "food_product" ? "무브랜드" : "일반 재료")} ${context} 선택`}
                          checked={checked}
                          className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
                          disabled={submitting}
                          onChange={() => toggleCandidate(candidate.pantry_item_id)}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block break-words text-sm font-bold leading-5">{candidate.name}</strong>
                          <span className="mt-0.5 block break-words text-xs leading-5 text-[var(--wave1-text-2)]">{context}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
          </div>
        )}
      </section>

      <fieldset aria-describedby={errorDescription}>
        <legend className="mb-3 text-base font-bold">완성 직후 음식 전체 중량</legend>
        <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--wave1-surface-fill)] p-3">
          <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] bg-[var(--wave1-surface)] px-3 py-2">
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3" htmlFor="cooked-batch-weight-now">
              <input
                checked={weightAction === "set_finished_weight"}
                className="h-6 w-6 accent-[var(--brand-primary)]"
                disabled={submitting}
                id="cooked-batch-weight-now"
                name="cooked-batch-weight-action"
                onChange={() => setWeightAction("set_finished_weight")}
                type="radio"
              />
              <span className="min-w-0 flex-1 text-sm font-bold">음식만 무게(g)</span>
            </label>
            <input
              aria-describedby={weightError ? errorDescription : undefined}
              aria-invalid={weightError || (!validFinishedWeight && finishedWeight !== "")}
              aria-label="완성 직후 음식 전체 중량"
              className="h-11 w-24 rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-3 text-right text-base font-bold disabled:bg-[var(--wave1-surface-fill)]"
              disabled={submitting || weightAction !== "set_finished_weight"}
              inputMode="decimal"
              min="0"
              onChange={(event) => setFinishedWeight(event.target.value)}
              placeholder="- g"
              step="any"
              type="number"
              value={finishedWeight}
            />
          </div>
          <button
            aria-expanded={helperOpen}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-3 text-left text-sm font-bold text-[var(--wave1-text-2)]"
            disabled={submitting}
            onClick={() => setHelperOpen((open) => !open)}
            type="button"
          >
            용기 무게 계산 도움
          </button>
          {helperOpen ? (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] p-3">
              <p className="text-xs leading-5 text-[var(--wave1-text-2)]">이 계산값은 이 화면에서만 사용하고 저장하거나 전송하지 않아요.</p>
              <label className="block text-sm font-bold">음식+용기 무게(g)
                <input aria-label="음식과 용기를 합친 무게" className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--wave1-border)] px-3 text-base" disabled={submitting} inputMode="decimal" min="0" onChange={(event) => setGrossWeight(event.target.value)} type="number" value={grossWeight} />
              </label>
              <label className="block text-sm font-bold">빈 용기 무게(g)
                <input aria-label="빈 용기 무게" className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--wave1-border)] px-3 text-base" disabled={submitting} inputMode="decimal" min="0" onChange={(event) => setTareWeight(event.target.value)} type="number" value={tareWeight} />
              </label>
              <div aria-label="계산한 음식만 무게" className="rounded-[var(--radius-control)] bg-[var(--wave1-surface-fill)] p-3 text-sm" role="status">
                계산한 음식만 무게 <strong className="float-right">{validHelperResult ? `${helperResult.toLocaleString("ko-KR")}g` : "계산 전"}</strong>
              </div>
              {!validHelperResult && (grossWeight || tareWeight) ? <p className="text-xs text-[var(--danger-strong)]" role="status">두 무게를 양수로 입력하고 음식+용기 무게가 더 큰지 확인해 주세요.</p> : null}
              <button
                className="min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-3 text-sm font-bold text-[var(--brand-primary-text)] disabled:opacity-40"
                disabled={submitting || !validHelperResult}
                onClick={() => {
                  setWeightAction("set_finished_weight");
                  setFinishedWeight(String(helperResult));
                }}
                type="button"
              >
                계산한 음식만 무게 사용
              </button>
            </div>
          ) : null}
          <label className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] bg-[var(--wave1-surface)] px-3 py-2">
            <input
              checked={weightAction === "weigh_later"}
              className="h-6 w-6 accent-[var(--brand-primary)]"
              disabled={submitting}
              name="cooked-batch-weight-action"
              onChange={() => setWeightAction("weigh_later")}
              type="radio"
            />
            <span className="text-sm font-bold">나중에 입력</span>
          </label>
          <p className="px-1 text-xs leading-5 text-[var(--wave1-text-2)]">용기·그릇 무게는 제외해 주세요. 현재 남은 양이 아니라 완성 직후 전체 음식 무게예요.</p>
        </div>
      </fieldset>
    </AppBottomSheet>
  );
}
