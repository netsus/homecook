"use client";

import React, { useEffect, useRef, useState } from "react";
import { hasCurrentWeightImprovementConsent } from "@/lib/weight-improvement-participation";
import type { WeightImprovementParticipation, WeightImprovementSurface } from "@/types/weight-improvement-participation";
import { useWeightImprovementParticipation } from "./participation-provider";

function participationDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function WeightImprovementParticipationSetting({ surface }: { surface: Extract<WeightImprovementSurface, "settings_mobile" | "settings_desktop"> }) {
  const participation = useWeightImprovementParticipation();
  const [confirmWithdraw, setConfirmWithdraw] = useState<WeightImprovementParticipation | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (confirmWithdraw && (!participation?.status || confirmWithdraw.subject.owner_uuid !== participation.status.subject.owner_uuid
      || confirmWithdraw.subject.account_generation !== participation.status.subject.account_generation)) setConfirmWithdraw(null);
  }, [confirmWithdraw, participation?.status]);
  useEffect(() => { if (participation?.error) errorRef.current?.focus(); }, [participation?.error]);
  if (!participation) return null;
  const { status, error, loading, busy } = participation;
  if (loading && !status) return <p role="status" className="p-4 text-sm">참여 정보를 확인하고 있어요.</p>;
  if (!status) return error ? <section className="rounded-[var(--radius-card)] border border-[var(--line)] p-4">
    <p ref={errorRef} tabIndex={-1} role="alert">{error}</p><button className="mt-2 min-h-11 font-bold" onClick={() => void participation.refresh()} type="button">참여 정보 다시 확인</button>
  </section> : null;
  const canParticipate = status.participation_enabled && status.document !== null;
  if (!canParticipate && status.decision !== "opted_in" && status.decision !== "withdrawn") return null;
  const optedIn = canParticipate && hasCurrentWeightImprovementConsent(status);
  const confirmingCurrentSubject = confirmWithdraw?.subject.owner_uuid === status.subject.owner_uuid
    && confirmWithdraw.subject.account_generation === status.subject.account_generation && status.decision === "opted_in";
  return <section className="space-y-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4" data-testid="weight-participation-setting" aria-busy={busy}>
    <h2 className="text-lg font-bold">데이터 활용 선택</h2>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="font-bold">추정 정확도 개선에 참여하기 (선택)</p>
        <p className="mt-1 text-sm">{status.document?.personal_service ?? "참여하지 않아도 개인 실측과 모든 기존 기능은 그대로 이용할 수 있어요."}</p>
        <p className="mt-2 text-sm">{optedIn ? "참여 중" : status.decision === "withdrawn" ? "철회됨" : status.decision === "opted_in" ? canParticipate ? "새 설명 확인 필요" : "기존 참여 선택이 남아 있어요" : "미참여"}</p>
      </div>
      {canParticipate ? <button aria-label="무게 추정 개선 참여" aria-checked={optedIn} role="switch" type="button" disabled={busy || loading}
        className="min-h-11 min-w-16 shrink-0 rounded-[var(--radius-control)] border border-[var(--line)] px-2 font-bold disabled:opacity-50"
        onClick={() => optedIn ? setConfirmWithdraw(status) : participation.open(surface, status)}>{optedIn ? "ON" : "OFF"}</button> : null}
    </div>
    {canParticipate ? <button className="min-h-11 text-sm font-bold underline" onClick={() => participation.open(surface, status)} type="button" disabled={busy}>참여 설명 보기</button>
      : <p className="text-sm">새로운 참여는 현재 받지 않아요. 기존 참여는 철회할 수 있어요.</p>}
    {status.decision === "opted_in" && !optedIn ? <button className="min-h-11 text-sm font-bold underline" onClick={() => setConfirmWithdraw(status)} type="button" disabled={busy || loading}>기존 참여 철회</button> : null}
    {status.opted_in_at && status.consent_document_version ? <p className="text-sm">참여 선택: {participationDate(status.opted_in_at)} · 동의한 설명: {status.consent_document_version}</p> : null}
    {status.withdrawn_at ? <p className="text-sm">철회 선택: {participationDate(status.withdrawn_at)}</p> : null}
    {status.decision === "withdrawn" ? <p className="text-sm">{status.cleanup_status === "pending" || status.cleanup_status === "retrying"
      ? "참여 철회는 반영됐어요. 개선용 자료 정리 상태는 아직 확인 중이에요."
      : status.cleanup_status === "completed" ? "서버에서 개선용 자료 정리 완료를 확인했어요." : "참여 철회가 반영됐어요."}</p> : null}
    {confirmingCurrentSubject && confirmWithdraw ? <div className="rounded-[var(--radius-control)] border border-[var(--line)] p-3">
      <p>무게 추정 개선 참여를 철회할까요? 개인 기록과 실측 기능은 계속 이용할 수 있어요.</p>
      <div className="mt-2 flex flex-wrap gap-2"><button className="min-h-11 rounded-[var(--radius-control)] border px-3 font-bold" disabled={busy}
        onClick={() => { setConfirmWithdraw(null); void participation.withdraw(surface, confirmWithdraw); }} type="button">참여 철회</button>
        <button className="min-h-11 px-3 font-bold" disabled={busy} onClick={() => setConfirmWithdraw(null)} type="button">유지하기</button></div>
    </div> : null}
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
  </section>;
}
