"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { AppBottomSheet, AppModalFooterActions } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import type {
  CookedBatchAction,
  CookedBatchMutationRequest,
} from "@/components/leftovers/cooked-batch-state";
import type { CookedBatchProjection } from "@/types/cooking";

export interface CookedBatchActionError {
  code: string;
  fields: Array<{ field: string; reason: string }>;
  message: string;
  status: number;
}

interface CookedBatchActionSheetProps {
  action: CookedBatchAction;
  batch: CookedBatchProjection;
  error: CookedBatchActionError | null;
  onClose: () => void;
  onSubmit: (request: CookedBatchMutationRequest) => void;
  pending: boolean;
}

const titles: Record<CookedBatchAction, string> = {
  set_finished_weight: "완성 중량 입력",
  mark_unrecoverable: "원래 무게를 알 수 없음",
  discard: "버린 양 기록",
  adjust: "남은 양 조정",
  close: "무게 없이 종료",
  cancel_current: "방금 종료 취소",
};

const confirmLabels: Record<CookedBatchAction, string> = {
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
  const [step, setStep] = useState<"form" | "confirmation">("form");
  const [closureReason, setClosureReason] = useState<"consumed" | "discarded" | "mixed" | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useDialogBoundary({
    closeOnEscape: !pending,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    onClose,
  });

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
      onSubmit({ action, finished_weight_g: parsedAmount, expected_revision: batch.revision });
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
      closeDisabled={pending}
      description={`${batch.recipe_title} · 서버의 현재 기록을 기준으로 반영해요.`}
      footer={
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
      onClose={() => { if (!pending) onClose(); }}
      panelClassName="max-w-[430px]"
      panelRef={panelRef}
      testId="cooked-batch-action-sheet"
      title={titles[action]}
      titleRef={titleRef}
      titleTabIndex={-1}
    >
      {pending ? <p className="rounded-[var(--radius-card)] bg-[var(--brand-primary-soft)] p-3 text-sm" role="status">서버 결과를 기다리는 중이에요. 창을 닫지 않고 입력을 유지해요.</p> : null}
      {error ? <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] p-3 text-sm outline-none" id={ERROR_SUMMARY_ID} ref={errorRef} role="alert" tabIndex={-1}>{error.message}<span className="mt-1 block text-xs text-[var(--text-3)]">입력값은 유지했어요. 서버의 최신 상태를 확인한 뒤 다시 시도해 주세요.</span></div> : null}

      {!isConfirmationStep && action === "set_finished_weight" ? (
        <>
          <label className="block text-sm font-bold">음식만의 원래 전체 중량(g)
            <input aria-describedby={amountInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={amountInvalid || undefined} aria-label="음식만의 원래 전체 중량" className="mt-2 h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base" disabled={pending} inputMode="decimal" min="0" onChange={(event) => setAmount(event.target.value)} type="number" value={amount} />
          </label>
          <p className="text-sm leading-5 text-[var(--text-2)]">용기·그릇·접시를 제외한 요리 직후 음식 전체 무게예요. 현재 남은 양이 아니에요.</p>
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
          <p className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm">현재 남은 양 {batch.remaining_weight_g?.toLocaleString("ko-KR") ?? "확인 불가"}g · 입력을 확인한 뒤 최종 제출해요.</p>
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
          <p className="text-xs leading-5 text-[var(--text-3)]">이 값은 제출 전 안내예요. 최종 잔량과 상태는 서버 응답으로 확정해요.</p>
        </section>
      ) : null}
      {action === "close" ? (
        <>
          <fieldset aria-describedby={closureReasonInvalid ? ERROR_SUMMARY_ID : undefined} aria-invalid={closureReasonInvalid || undefined} className="space-y-2"><legend className="mb-2 text-sm font-bold">종료 이유</legend>{(["consumed", "discarded", "mixed"] as const).map((value) => <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] px-3" key={value}><input checked={closureReason === value} disabled={pending} name="closure-reason" onChange={() => setClosureReason(value)} type="radio" /><span>{closureReasonLabels[value]}</span></label>)}</fieldset>
          {closureReason ? <p className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm"><span className="text-[var(--text-3)]">선택한 종료 결과</span><strong>{closureReasonLabels[closureReason]}</strong></p> : null}
          <ul className="space-y-2 rounded-[var(--radius-control)] border border-[var(--danger-border)] p-3 text-sm leading-5">
            <li>그램 중량을 남기지 않아요.</li>
            <li>식사 영양을 계산하지 않아요.</li>
            <li>meal-log 식사 기록을 만들지 않아요.</li>
          </ul>
        </>
      ) : null}
      {action === "mark_unrecoverable" ? <p className="text-sm leading-6">이 변경은 되돌릴 수 없어요. 이후에는 완성 중량 입력, g 영양 계산, g 식사 기록을 사용할 수 없고 0g으로 추정하지 않아요.</p> : null}
      {action === "cancel_current" ? <p className="text-sm leading-6">서버가 현재 종료로 표시한 바로 그 기록만 취소해요. 과거 종료나 무게 확인 불가 표시는 되돌리지 않아요.</p> : null}

      {!isConfirmationStep && action !== "discard" && action !== "adjust" ? (
        <label className="flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3 text-sm leading-5">
          <input checked={confirmed} className="mt-0.5 h-5 w-5" disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          <span>{action === "set_finished_weight"
            ? "이 음식을 먹거나 버린 적이 없고, 요리 직후 전체 무게가 맞아요"
            : action === "close"
              ? "그램 중량이 남지 않고, 식사 영양을 계산하지 않으며, meal-log 식사 기록을 만들지 않는 결과를 확인했어요"
              : "표시된 결과와 되돌릴 수 없는 영향을 확인했어요"}</span>
        </label>
      ) : null}
    </AppBottomSheet>
  );
}
