"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { AppBottomSheet, AppModalFooterActions } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import type {
  CookedBatchActionView,
  CookedBatchMutationRequest,
} from "@/components/leftovers/cooked-batch-state";
import type { CookedBatchProjection } from "@/types/cooking";
import { useWeightAttestationContext } from "@/components/cooking/use-weight-attestation-context";
import { weightAttestationInput } from "@/lib/cooking/cooked-weight-attestation";
import { retractWeightAttestation } from "@/lib/api/cooking";
import { WEIGHT_ATTESTATION_TEXT } from "@/types/cooked-weight-attestation";
import { formatQuantityAmount } from "@/lib/quantity-input";

export interface CookedBatchActionError {
  code: string;
  fields: Array<{ field: string; reason: string }>;
  message: string;
  status: number;
}

interface CookedBatchActionSheetProps {
  returnFocusTarget?: () => HTMLElement | null;
  restoreFocusWhen?: () => boolean;
  action: CookedBatchActionView;
  batch: CookedBatchProjection;
  error: CookedBatchActionError | null;
  onClose: () => void;
  onSubmit: (request: CookedBatchMutationRequest) => void;
  pending: boolean;
}

const titles: Record<CookedBatchActionView, string> = {
  view_weight_attestation: "개인 확인 기록",
  set_finished_weight: "완성 중량 입력",
  mark_unrecoverable: "원래 무게를 알 수 없음",
  discard: "버린 양 기록",
  adjust: "남은 양 조정",
  close: "무게 없이 종료",
  cancel_current: "방금 종료 취소",
};

const confirmLabels: Record<CookedBatchActionView, string> = {
  view_weight_attestation: "확인 기록 철회",
  set_finished_weight: "중량 저장",
  mark_unrecoverable: "확인하고 변경",
  discard: "버림 기록",
  adjust: "조정 적용",
  close: "이 상태로 종료",
  cancel_current: "종료 취소",
};

const closureReasonLabels = {
  consumed: "다 먹음",
  discarded: "모두 버림",
  mixed: "먹고 버림",
} as const;

const ERROR_SUMMARY_ID = "cooked-batch-action-error";

function formatGrams(value: number) {
  return `${value.toLocaleString("ko-KR")}g`;
}

export function CookedBatchActionSheet({
  returnFocusTarget,
  restoreFocusWhen,
  action,
  batch,
  error,
  onClose,
  onSubmit,
  pending,
}: CookedBatchActionSheetProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attested, setAttested] = useState(false);
  const [retracting, setRetracting] = useState(false);
  const [retractionError, setRetractionError] = useState<string | null>(null);
  const retractionAttempt = useRef<{ payload: string; key: string } | null>(null);
  const retractionInFlight = useRef(false);
  const retractionSequence = useRef(0);
  const isRecordView = action === "view_weight_attestation";
  const attestation = useWeightAttestationContext("batch", batch.id,
    isRecordView || action === "set_finished_weight" && batch.weight_evidence_enabled === true);
  const busy = pending || retracting;
  useEffect(() => { setAttested(false); setRetractionError(null); }, [attestation.context, action]);
  useEffect(() => {
    const requests = retractionSequence;
    setRetracting(false);
    retractionInFlight.current = false;
    retractionAttempt.current = null;
    return () => { ++requests.current; };
  }, [action, batch.id]);
  const [step, setStep] = useState<"form" | "confirmation">("form");
  const [closureReason, setClosureReason] = useState<"consumed" | "discarded" | "mixed" | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const { setReturnFocusTarget } = useDialogBoundary({
    closeOnEscape: !busy,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    onClose,
    restoreFocusWhen,
  });

  useEffect(() => {
    setReturnFocusTarget(returnFocusTarget ?? null);
  }, [returnFocusTarget, setReturnFocusTarget]);

  const parsedAmount = Number(amount);
  const validAmount = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount !== 0;
  const resultingAmount = batch.remaining_weight_g === null
    ? null
    : batch.remaining_weight_g + (action === "discard" ? -parsedAmount : parsedAmount);
  const needsSecondConfirmation = action === "discard" || (action === "adjust" && parsedAmount < 0);
  const formValid = useMemo(() => {
    if (batch.revision === null) return false;
    if (action === "set_finished_weight") return parsedAmount > 0 && confirmed;
    if (action === "mark_unrecoverable") return confirmed;
    if (action === "discard") {
      return parsedAmount > 0
        && reason.trim().length > 0
        && resultingAmount !== null
        && resultingAmount >= 0;
    }
    if (action === "adjust") {
      return validAmount && reason.trim().length > 0
        && resultingAmount !== null
        && resultingAmount > 0
        && resultingAmount <= (batch.finished_weight_g ?? 0);
    }
    if (action === "close") return closureReason !== null && confirmed;
    return Boolean(batch.current_unweighed_closure_event_id) && confirmed;
  }, [action, batch, closureReason, confirmed, parsedAmount, reason, resultingAmount, validAmount]);

  const amountField = action === "set_finished_weight"
    ? "finished_weight_g"
    : action === "discard"
      ? "discarded_g"
      : action === "adjust"
        ? "delta_g"
        : null;
  const invalidFields = useMemo(
    () => new Set(error?.fields.map(({ field }) => field) ?? []),
    [error],
  );
  const amountInvalid = amountField !== null && invalidFields.has(amountField);
  const reasonInvalid = (action === "discard" || action === "adjust") && invalidFields.has("reason");
  const closureReasonInvalid = action === "close" && invalidFields.has("closure_reason");
  const hasMappedInvalidField = amountInvalid || reasonInvalid || closureReasonInvalid;

  useEffect(() => {
    if (!error) return;
    if (hasMappedInvalidField && step === "confirmation") setStep("form");
    errorRef.current?.focus();
  }, [error, hasMappedInvalidField, step]);

  const submit = () => {
    if (!formValid || pending || batch.revision === null) return;
    if (action === "set_finished_weight") {
      if (batch.weight_evidence_enabled) {
        const request: CookedBatchMutationRequest = { action, finished_weight_g: parsedAmount, expected_revision: batch.revision, weight_input_source: "reported_measured" };
        if (attested && attestation.context?.can_attest && attestation.isCurrentContext(attestation.context)) {
          request.weight_attestation = weightAttestationInput(attestation.context);
        }
        onSubmit(request);
      } else onSubmit({ action, finished_weight_g: parsedAmount, expected_revision: batch.revision });
    } else if (action === "mark_unrecoverable") {
      onSubmit({ action, expected_revision: batch.revision });
    } else if (action === "discard") {
      onSubmit({ action, discarded_g: parsedAmount, reason: reason.trim(), expected_revision: batch.revision });
    } else if (action === "adjust") {
      onSubmit({ action, delta_g: parsedAmount, reason: reason.trim(), expected_revision: batch.revision });
    } else if (action === "close" && closureReason) {
      onSubmit({ action, closure_reason: closureReason, expected_revision: batch.revision });
    } else if (action === "cancel_current" && batch.current_unweighed_closure_event_id) {
      onSubmit({ action, reverses_event_id: batch.current_unweighed_closure_event_id, expected_revision: batch.revision });
    }
  };

  const retract = async () => {
    const context = attestation.context;
    const record = context?.record;
    if (busy || retractionInFlight.current || !context || record?.status !== "attested" || !attestation.isCurrentContext(context)) return;
    retractionInFlight.current = true;
    const request = ++retractionSequence.current;
    const body = { expected_subject: context.subject, expected_record_id: record.id, expected_revision: record.revision,
      expected_context_fingerprint: record.context_fingerprint };
    const payload = JSON.stringify(body);
    const attempt = retractionAttempt.current?.payload === payload ? retractionAttempt.current : { payload, key: crypto.randomUUID() };
    retractionAttempt.current = attempt;
    setRetracting(true);
    setRetractionError(null);
    try {
      const value = await retractWeightAttestation(batch.id, body, attempt.key);
      if (request !== retractionSequence.current || !attestation.isCurrentContext(context)) return;
      if (value.record?.status !== "retracted" || value.record.measurement_evidence_id !== record.measurement_evidence_id
        || value.record.context_fingerprint !== record.context_fingerprint || value.record.measured_g !== record.measured_g
        || !attestation.accept(value, context)) throw new Error("INVALID_RETRACTION_RESPONSE");
      retractionAttempt.current = null;
    } catch {
      if (request === retractionSequence.current && attestation.isCurrentContext(context)) setRetractionError("확인 기록을 철회하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (request === retractionSequence.current) {
        retractionInFlight.current = false;
        setRetracting(false);
      }
    }
  };

  const confirmOrSubmit = () => {
    if (!formValid || pending) return;
    if (needsSecondConfirmation && step === "form") {
      setStep("confirmation");
      return;
    }
    submit();
  };

  const destructive = action === "mark_unrecoverable"
    || action === "discard"
    || action === "close"
    || action === "cancel_current"
    || (action === "adjust" && parsedAmount < 0);
  const isConfirmationStep = step === "confirmation" && needsSecondConfirmation;
  const footerConfirmLabel = pending
    ? "처리 중…"
    : needsSecondConfirmation && step === "form"
      ? "내용 확인"
      : confirmLabels[action];

  return (
    <AppBottomSheet
      ariaLabelledBy="cooked-batch-action-title"
      bodyClassName="space-y-4"
      closeDisabled={busy}
      description={batch.recipe_title}
      footer={isRecordView ? <div className="flex flex-wrap gap-2">
        <button className="min-h-11 flex-1 rounded-[var(--radius-control)] border px-4" disabled={busy} onClick={onClose} type="button">닫기</button>
        {attestation.context?.record?.status === "attested" ? <button className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--danger-border)] px-4 text-[var(--danger-strong)]" disabled={busy || attestation.loading} onClick={() => void retract()} type="button">{retracting ? "철회 중…" : "확인 기록 철회"}</button> : null}
      </div> :
        <div
          className={`${destructive ? "[--wave1-mint-contrast:var(--danger-strong)] [--wave1-mint-contrast-deep:var(--foreground)]" : "[--wave1-mint-contrast:var(--brand-primary-text)] [--wave1-mint-contrast-deep:var(--foreground)]"} [&_button]:text-base`}
          data-testid="cooked-batch-action-actions"
        >
          <AppModalFooterActions
            cancelDisabled={pending}
            cancelLabel={isConfirmationStep ? "입력 수정" : "취소"}
            confirmDisabled={!formValid || pending}
            confirmLabel={footerConfirmLabel}
            onCancel={isConfirmationStep ? () => setStep("form") : onClose}
            onConfirm={confirmOrSubmit}
          />
        </div>
      }
      onClose={() => { if (!busy) onClose(); }}
      panelClassName="max-w-[430px]"
      panelRef={panelRef}
      testId="cooked-batch-action-sheet"
      title={titles[action]}
      titleRef={titleRef}
      titleTabIndex={-1}
    >
      {isRecordView ? <section aria-label="개인 확인 이력" className="space-y-3">
        {attestation.loading ? <p role="status">개인 확인 기록을 불러오는 중…</p> : null}
        {attestation.error ? <p role="alert">{attestation.error}</p> : null}
        {retractionError ? <p role="alert">{retractionError}</p> : null}
        {attestation.error ? <button aria-disabled={attestation.loading || undefined} className="min-h-11 text-[var(--brand)]" disabled={busy} onClick={event => void attestation.retry(event.currentTarget, titleRef)} type="button">개인 확인 정보 다시 불러오기</button> : null}
        {attestation.context?.record ? <>
          <p className="font-bold">{attestation.context.record.status === "attested" ? "본인이 확인한 개인 기록이에요." : "철회한 개인 확인 기록이에요."}</p>
          <p>당시 실측 {formatQuantityAmount(attestation.context.record.measured_g)}g</p>
          <p className="text-sm text-[var(--text-2)]">{new Date(attestation.context.record.observed_at).toLocaleString("ko-KR")}</p>
          <p className="text-sm leading-5">{WEIGHT_ATTESTATION_TEXT}</p>
          <p className="text-sm leading-5 text-[var(--text-2)]">측정 정확도를 검증한 기록은 아니에요. 개인 확인을 철회해도 원무게와 식사 기록은 바뀌지 않아요.</p>
        </> : attestation.context ? <p>개인 확인 기록이 없어요. 기존 실측 무게는 그대로예요.</p> : null}
      </section> : null}
      {pending ? <p className="rounded-[var(--radius-card)] bg-[var(--brand-primary-soft)] p-3 text-sm" role="status">저장 중…</p> : null}
      {error ? <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] p-3 text-sm outline-none" id={ERROR_SUMMARY_ID} ref={errorRef} role="alert" tabIndex={-1}>{error.message}</div> : null}

      {!isConfirmationStep && action === "set_finished_weight" ? (
        <>
          <label className="block text-sm font-bold">{batch.weight_evidence_enabled ? "저울로 잰 전체무게(g)" : "음식만의 원래 전체 중량(g)"}
            <input aria-describedby={amountInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={amountInvalid || undefined} aria-label={batch.weight_evidence_enabled ? "저울로 잰 전체무게" : "음식만의 원래 전체 중량"} className="mt-2 h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base" disabled={pending} inputMode="decimal" min="0" onChange={(event) => { setAmount(event.target.value); if (!event.target.value.trim() || Number(event.target.value) <= 0) setAttested(false); }} ref={amountRef} type="number" value={amount} />
          </label>
          <p className="text-sm leading-5 text-[var(--text-2)]">{batch.weight_evidence_enabled ? "먹거나 버리기 전 음식 전체를 재 주세요. 용기는 빼고 먹을 국물은 포함해 주세요. 남은 양이나 한 접시 무게는 입력하지 않아요." : "용기를 제외한, 먹기 전 전체 무게예요."}</p>
          {batch.weight_evidence_enabled ? <div className="space-y-2">
            {attestation.loading ? <p className="text-sm text-[var(--text-2)]" role="status">개인 확인 정보를 불러오는 중…</p> : null}
            {attestation.context?.can_attest ? <label className="flex items-start gap-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm leading-5">
              <input aria-label={WEIGHT_ATTESTATION_TEXT} checked={attested} className="mt-0.5 h-5 w-5 shrink-0" disabled={pending || !validAmount || parsedAmount <= 0} onChange={event => setAttested(event.target.checked)} type="checkbox" />
              <span><strong className="mb-1 block">개인 확인 (선택)</strong>{WEIGHT_ATTESTATION_TEXT}</span>
            </label> : null}
            {attestation.error || attestation.context && !attestation.context.can_attest ? <p className="text-sm text-[var(--text-2)]">{attestation.error ?? "지금은 개인 확인을 함께 기록할 수 없어요."} 확인 없이 전체무게를 저장할 수 있어요.</p> : null}
            {attestation.error ? <button aria-disabled={attestation.loading || undefined} className="min-h-11 text-sm text-[var(--brand)]" disabled={pending} onClick={event => void attestation.retry(event.currentTarget, amountRef)} type="button">개인 확인 정보 다시 불러오기</button> : null}
            {attestation.context?.can_attest ? <p className="text-sm leading-5 text-[var(--text-2)]">본인이 확인한 개인 기록이에요. 측정 정확도를 검증하거나 개선 자료 수집에 참여하는 동의가 아니에요.</p> : null}
          </div> : null}
        </>
      ) : null}
      {!isConfirmationStep && (action === "discard" || action === "adjust") ? (
        <>
          <label className="block text-sm font-bold">{action === "discard" ? "버린 양(g)" : "조정량(g)"}
            <input aria-describedby={amountInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={amountInvalid || undefined} aria-label={action === "discard" ? "버린 양" : "남은 양 조정량"} className="mt-2 h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base" disabled={pending} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} type="number" value={amount} />
          </label>
          <label className="block text-sm font-bold">사유
            <input aria-describedby={reasonInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={reasonInvalid || undefined} className="mt-2 h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base" disabled={pending} onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
          <p className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm">현재 남은 양 {batch.remaining_weight_g?.toLocaleString("ko-KR") ?? "확인 불가"}g</p>
        </>
      ) : null}
      {isConfirmationStep && resultingAmount !== null ? (
        <section aria-label={action === "discard" ? "버림 내용 확인" : "조정 내용 확인"} className="space-y-3 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--surface-fill)] p-4" role="group">
          <dl className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4"><dt className="text-[var(--text-3)]">현재 남은 양</dt><dd className="font-bold">{formatGrams(batch.remaining_weight_g!)}</dd></div>
            <div className="flex items-start justify-between gap-4"><dt className="text-[var(--text-3)]">{action === "discard" ? "버릴 양" : "조정량"}</dt><dd className="font-bold">{formatGrams(parsedAmount)}</dd></div>
            <div className="flex items-start justify-between gap-4"><dt className="text-[var(--text-3)]">적용 후 안내</dt><dd className="font-bold">{formatGrams(resultingAmount)}</dd></div>
            <div className="flex items-start justify-between gap-4"><dt className="text-[var(--text-3)]">사유</dt><dd className="max-w-[65%] break-words text-right font-bold">{reason.trim()}</dd></div>
          </dl>
        </section>
      ) : null}
      {action === "close" ? (
        <>
          <fieldset aria-describedby={closureReasonInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={closureReasonInvalid || undefined} className="space-y-2"><legend className="mb-2 text-sm font-bold">종료 이유</legend>{(["consumed", "discarded", "mixed"] as const).map((value) => <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] px-3" key={value}><input checked={closureReason === value} disabled={pending} name="closure-reason" onChange={() => setClosureReason(value)} type="radio" /><span>{closureReasonLabels[value]}</span></label>)}</fieldset>
          {closureReason ? <p className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm"><span className="text-[var(--text-3)]">선택한 종료 결과</span><strong>{closureReasonLabels[closureReason]}</strong></p> : null}
          <p className="text-sm">음식 목록만 정리하며 식사 기록은 남기지 않아요.</p>
        </>
      ) : null}
      {action === "mark_unrecoverable" ? <p className="text-sm leading-6">이 변경은 되돌릴 수 없어요. 이후에는 완성 중량 입력, g 영양 계산, g 식사 기록을 사용할 수 없고 0g으로 추정하지 않아요.</p> : null}
      {action === "cancel_current" ? <p className="text-sm leading-6">방금 종료한 상태를 되돌려요.</p> : null}

      {!isRecordView && !isConfirmationStep && action !== "discard" && action !== "adjust" ? (
        <label className="flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm leading-5">
          <input checked={confirmed} className="mt-0.5 h-5 w-5" disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          <span>{action === "set_finished_weight"
            ? "아직 먹거나 버리지 않은 전체 무게예요"
            : action === "close"
              ? "식사 기록 없이 정리할게요"
              : "표시된 결과와 되돌릴 수 없는 영향을 확인했어요"}</span>
        </label>
      ) : null}
    </AppBottomSheet>
  );
}
