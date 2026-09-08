"use client";

import Link from "next/link";
import React, { useRef } from "react";
import { AppConfirmDialog } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

export function PlannerLoginDialog({ nextPath, onClose }: { nextPath: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBoundary({ dialogRef: ref, onClose });
  return (
    <AppConfirmDialog
      ariaLabelledBy="planner-preview-login-title"
      onClose={onClose}
      panelRef={ref}
      title="로그인이 필요해요"
      footer={<div className="flex gap-2">
        <button className="min-h-11 flex-1 rounded-xl border border-[var(--line-strong)] font-bold" onClick={onClose} type="button">계속 둘러보기</button>
        <Link className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[var(--brand-primary-accessible)] font-bold" style={{ color: "var(--text-inverse)" }} href={`/login?next=${encodeURIComponent(nextPath)}`}>로그인</Link>
      </div>}
    >
      <p className="text-sm leading-6 text-[var(--text-2)]">플래너는 자유롭게 둘러볼 수 있어요. 내 요리 계획과 식사 기록을 추가하려면 로그인해 주세요.</p>
    </AppConfirmDialog>
  );
}
