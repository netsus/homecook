"use client";

import React, { useEffect, useRef, useState } from "react";
import { AppBottomSheet, AppCenterDialog } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import type { WeightImprovementDocument } from "@/types/weight-improvement-participation";

export function WeightImprovementParticipationNotice({ document, busy, error, onClose, onDecline, onOptIn }: {
  document: WeightImprovementDocument;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDecline: () => void;
  onOptIn: (document: WeightImprovementDocument) => void;
}) {
  const [checked, setChecked] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isMobile = useIsMobileViewport();
  const Overlay = isMobile ? AppBottomSheet : AppCenterDialog;
  useDialogBoundary({ dialogRef: panelRef, initialFocusRef: closeRef, onClose, closeOnEscape: !busy });
  useEffect(() => setChecked(false), [document.version, document.hash]);
  useEffect(() => { if (error) { setChecked(false); errorRef.current?.focus(); } }, [error]);
  return <Overlay ariaLabelledBy="weight-participation-title" panelRef={panelRef} closeButtonRef={closeRef}
    closeDisabled={busy} onClose={() => { if (!busy) onClose(); }} title="추정 개선 참여 (선택)" testId="weight-participation-notice"
    footer={<div className="space-y-3">
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} type="checkbox" className="mt-1 size-5 shrink-0" />
        <span>[선택] 위 설명을 확인하고 참여에 동의합니다.</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] px-2 py-2 text-sm font-bold" disabled={busy} onClick={onDecline} type="button">참여 안 함</button>
        <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] px-2 py-2 text-sm font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={!checked || busy} onClick={() => onOptIn(document)} type="button">{busy ? "선택 저장 중…" : "동의하고 참여"}</button>
      </div>
    </div>}>
    <div aria-busy={busy} className={`${isMobile ? "" : "max-h-[55dvh] overflow-y-auto "}space-y-2 text-[13px] leading-[1.45]`}>
      <p className="font-bold">{document.title}</p>
      <p>{document.purpose}</p>
      <p><strong>활용 항목</strong> {document.data_items.join(" · ")}</p>
      <p><strong>사용하지 않는 항목</strong> {document.excluded_items.join(" · ")}</p>
      <p><strong>선별 자료 보유기간</strong> {document.sample_retention}</p>
      <p><strong>선택 근거 보유기간</strong> {document.evidence_retention}</p>
      <p>{document.withdrawal}</p>
      <p>{document.personal_service}</p>
      <details><summary className="min-h-11 cursor-pointer py-3 font-bold">전체 설명 보기</summary><p className="whitespace-pre-wrap">{document.body}</p></details>
      {error ? <p className="rounded-[var(--radius-control)] border border-[var(--danger)] p-3 text-[var(--danger)]" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
    </div>
  </Overlay>;
}
