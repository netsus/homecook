"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ConsumedSelectionToolbar } from "@/components/cooking/consumed-ingredient-sheet";
import { AppBottomSheet } from "@/components/shared/app-overlay";
import { cookedWeightAssumptionText, cookedWeightUnavailableReasonText } from "@/lib/cooking/cooked-weight-summary";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useWeightAttestationContext } from "@/components/cooking/use-weight-attestation-context";
import { weightAttestationInput } from "@/lib/cooking/cooked-weight-attestation";
import { WEIGHT_ATTESTATION_TEXT } from "@/types/cooked-weight-attestation";
import type {
  SnapshotV2CompleteBody,
  SnapshotV2PantryCandidate,
  CookedWeightSummary,
} from "@/types/cooking";

export interface CookedBatchCompletionError {
  code: string;
  fields: Array<{ field: string; reason: string }>;
  message: string;
  status: number;
}

interface CookedBatchCompletionSheetProps {
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
  restoreFocusWhen?: () => boolean;
  candidates: SnapshotV2PantryCandidate[];
  initialSelection?: string[];
  onClose: () => void;
  onSubmit: (body: SnapshotV2CompleteBody) => void;
  serverError: CookedBatchCompletionError | null;
  submitting: boolean;
  weightEvidenceEnabled?: boolean;
  weightPrediction?: CookedWeightSummary;
  sessionId?: string;
}

export function CookedBatchCompletionSheet({
  returnFocusRef,
  restoreFocusWhen,
  candidates,
  initialSelection = [],
  onClose,
  onSubmit,
  serverError,
  submitting,
  weightEvidenceEnabled = false,
  weightPrediction,
  sessionId,
}: CookedBatchCompletionSheetProps) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelection));
  const [finishedWeight, setFinishedWeight] = useState("");
  const [weightError, setWeightError] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const attestation = useWeightAttestationContext("session", sessionId, weightEvidenceEnabled);
  useEffect(() => { setAttested(false); }, [attestation.context]);
  const weightRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const { setReturnFocusTarget } = useDialogBoundary({
    closeOnEscape: !submitting,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    onClose,
    restoreFocusWhen,
  });

  useEffect(() => {
    setReturnFocusTarget(returnFocusRef ? () => returnFocusRef.current : null);
  }, [returnFocusRef, setReturnFocusTarget]);

  useEffect(() => {
    const validIds = new Set(candidates.map((candidate) => candidate.pantry_item_id));
    setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [candidates]);

  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  const rows = useMemo(() => {
    const sameNameCounts = new Map<string, number>();
    const ordinals = new Map<string, number>();
    for (const candidate of candidates) {
      const key = JSON.stringify([candidate.name, candidate.brand, candidate.item_type]);
      sameNameCounts.set(key, (sameNameCounts.get(key) ?? 0) + 1);
    }
    return candidates.map((candidate) => {
      const key = JSON.stringify([candidate.name, candidate.brand, candidate.item_type]);
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      const brand = candidate.brand?.trim();
      const context = [
        brand && !candidate.name.includes(brand) ? brand : null,
        (sameNameCounts.get(key) ?? 0) > 1 ? `항목 ${ordinal}` : null,
      ].filter(Boolean).join(" · ");
      return { candidate, context };
    });
  }, [candidates]);
  const validIds = useMemo(() => [...new Set(candidates.map((candidate) => candidate.pantry_item_id))], [candidates]);
  const selectedCount = validIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = validIds.length > 0 && selectedCount === validIds.length;

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
    if (submitting) return;
    const provided = weightEvidenceEnabled && finishedWeight.trim() !== "";
    const grams = Number(finishedWeight);
    if (provided && (!Number.isFinite(grams) || grams <= 0)) {
      setWeightError("0보다 큰 전체무게를 입력하거나 빈칸으로 건너뛰어 주세요.");
      weightRef.current?.focus();
      return;
    }
    setWeightError(null);
    if (provided) {
      const body: SnapshotV2CompleteBody = { consumed_pantry_item_ids: validIds.filter((id) => selectedIds.has(id)),
        weight_action: "set_finished_weight", finished_weight_g: grams, weight_input_source: "reported_measured" };
      if (attested && attestation.context?.can_attest && attestation.isCurrentContext(attestation.context)) {
        body.weight_attestation = weightAttestationInput(attestation.context);
      }
      onSubmit(body);
      return;
    }
    onSubmit({
      consumed_pantry_item_ids: validIds.filter((id) => selectedIds.has(id)),
      weight_action: "weigh_later",
      finished_weight_g: null,
    });
  };

  return (
    <AppBottomSheet
      ariaLabelledBy="cooked-batch-completion-title"
      bodyClassName="space-y-5"
      closeDisabled={submitting}
      footer={
        <div
          className="flex flex-col gap-2.5 [--wave1-mint-contrast:var(--brand-primary-text)] [--wave1-mint-contrast-deep:var(--foreground)] [&_button]:text-base min-[321px]:flex-row-reverse"
          data-testid="cooked-batch-completion-actions"
        >
          <button
            className="flex h-[var(--control-height-lg)] w-full min-w-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--wave1-mint-contrast)] px-4 text-base font-bold text-[var(--wave1-surface)] shadow-[var(--wave1-shadow-natural)] transition-colors hover:bg-[var(--wave1-mint-contrast-deep)] disabled:opacity-50 min-[321px]:w-auto min-[321px]:flex-[2]"
            disabled={submitting}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? "저장 중…" : "완료 저장"}
          </button>

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
      titleTabIndex={-1}
    >
      {serverError ? (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface-fill)] px-4 py-3 text-sm leading-5 text-[var(--danger-strong)] outline-none"
          id="cooked-batch-completion-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <strong className="block font-bold">{serverError.message}</strong>
        </div>
      ) : null}

      {weightEvidenceEnabled ? (
        <section aria-labelledby="cooked-batch-weight-heading" className="space-y-3">
          <h3 className="text-base font-bold" id="cooked-batch-weight-heading">완성 음식 전체무게</h3>
          <p className="text-sm leading-5 text-[var(--text-2)]">
            {weightPrediction?.source === "conditional_estimate" && weightPrediction.predicted_g !== null
              ? `${weightPrediction.model_version === "ingredient-mass-75-v1" ? "재료량 75% 추정 무게" : "조건별 예상 무게"}는 약 ${Math.round(weightPrediction.predicted_g).toLocaleString("ko-KR")}g이에요. 실측값이 아니에요.`
              : cookedWeightUnavailableReasonText(weightPrediction?.reason_codes)}
          </p>
          {weightPrediction?.assumption_codes?.length ? <p className="text-sm leading-5 text-[var(--text-2)]">{cookedWeightAssumptionText(weightPrediction?.assumption_codes)}</p> : null}
          <label className="block text-sm font-bold" htmlFor="cooked-batch-reported-weight">저울로 잰 전체무게 (선택, g)</label>
          <input aria-describedby="cooked-batch-weight-help cooked-batch-weight-validation" aria-invalid={Boolean(weightError) || serverError?.fields.some(field => field.field === "finished_weight_g") || undefined}
            className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base"
            disabled={submitting} id="cooked-batch-reported-weight" inputMode="decimal" min="0" onChange={event => { setFinishedWeight(event.target.value); setWeightError(null); if (!event.target.value.trim() || Number(event.target.value) <= 0) setAttested(false); }}
            ref={weightRef} step="any" type="number" value={finishedWeight} />
          <p className="text-sm leading-5 text-[var(--text-2)]" id="cooked-batch-weight-help">용기를 뺀 음식 전체무게예요. 빈칸으로 두어도 저장돼요.</p>
          <p className="text-sm text-[var(--danger-strong)]" id="cooked-batch-weight-validation" role={weightError ? "alert" : undefined}>{weightError}</p>
          <details className="text-sm leading-5 text-[var(--text-2)]">
            <summary className="min-h-11 cursor-pointer py-3">무게 재는 방법</summary>
            <p>먹거나 버리기 전 전체를 재고, 먹을 국물은 포함해 주세요. 남은 양이나 한 접시 무게는 입력하지 않아요.</p>
          </details>
          {sessionId ? <div className="space-y-2">
            {attestation.loading ? <p className="text-sm text-[var(--text-2)]" role="status">개인 확인 정보를 불러오는 중…</p> : null}
            {attestation.context?.can_attest ? <label className="flex items-start gap-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm leading-5">
              <input aria-label={WEIGHT_ATTESTATION_TEXT} checked={attested} className="mt-0.5 h-5 w-5 shrink-0" disabled={submitting || !finishedWeight.trim() || !Number.isFinite(Number(finishedWeight)) || Number(finishedWeight) <= 0}
                onChange={event => setAttested(event.target.checked)} type="checkbox" />
              <span><strong className="mb-1 block">개인 확인 (선택)</strong>{WEIGHT_ATTESTATION_TEXT}</span>
            </label> : null}
            {attestation.error || attestation.context && !attestation.context.can_attest ? <p className="text-sm text-[var(--text-2)]">{attestation.error ?? "지금은 개인 확인을 함께 기록할 수 없어요."} 확인 없이 무게를 저장하거나 건너뛸 수 있어요.</p> : null}
            {attestation.error ? <button aria-disabled={attestation.loading || undefined} className="min-h-11 text-sm text-[var(--brand)]" disabled={submitting} onClick={event => void attestation.retry(event.currentTarget, weightRef)} type="button">개인 확인 정보 다시 불러오기</button> : null}
            {attestation.context?.can_attest ? <p className="text-sm leading-5 text-[var(--text-2)]">개인 기록용 확인이며, 정확도 검증이나 개선 자료 수집 동의가 아니에요.</p> : null}
          </div> : null}
        </section>
      ) : null}

      <section aria-labelledby="cooked-batch-pantry-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold" id="cooked-batch-pantry-heading">사용한 팬트리 항목</h3>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-[var(--radius-card)] bg-[var(--wave1-surface-fill)] px-4 py-5 text-sm text-[var(--wave1-text-2)]" data-testid="cooked-batch-pantry-empty">사용할 팬트리 항목이 없어요</p>
        ) : (
          <>
            <ConsumedSelectionToolbar
              allSelected={allSelected}
              partiallySelected={selectedCount > 0 && !allSelected}
              selectedCount={selectedCount}
              totalCount={validIds.length}
              disabled={submitting}
              onToggleAll={() => { if (!submitting) setSelectedIds(allSelected ? new Set() : new Set(validIds)); }}
              selectionLabel="팬트리 항목"
              variant="mobile"
            />
            <div className="space-y-2">
              {rows.map(({ candidate, context }) => {
                const checked = selectedIds.has(candidate.pantry_item_id);
                return (
                  <label className={`flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] border px-3 py-3 ${checked ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]" : "border-[var(--wave1-border)] bg-[var(--wave1-surface)]"} ${submitting ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`} key={candidate.pantry_item_id}>
                    <input
                      aria-label={[candidate.name, context, "선택"].filter(Boolean).join(" ")}
                      aria-checked={checked}
                      checked={checked}
                      className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
                      disabled={submitting}
                      onChange={() => toggleCandidate(candidate.pantry_item_id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words text-sm font-bold leading-5">{candidate.name}</strong>
                      {context ? <span className="mt-0.5 block text-xs text-[var(--wave1-text-2)]">{context}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </section>

    </AppBottomSheet>
  );
}
