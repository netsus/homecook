"use client";

import Link from "next/link";
import React, { useState } from "react";

import { AppBackButton } from "@/components/shared/app-back-button";
import { AppBottomSheet } from "@/components/shared/app-overlay";

interface YoutubeImportEntrySheetProps {
  onBack: () => void;
  onClose: () => void;
  targetLabel?: string;
  youtubeHref: string;
}

export function buildYoutubeImportHref(baseHref: string, youtubeUrl: string) {
  const trimmed = youtubeUrl.trim();
  if (!trimmed) return baseHref;

  const parsed = new URL(baseHref, "http://localhost");
  parsed.searchParams.set("youtubeUrl", trimmed);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function YoutubeImportEntrySheet({
  onBack,
  onClose,
  targetLabel,
  youtubeHref,
}: YoutubeImportEntrySheetProps) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const importHref = buildYoutubeImportHref(youtubeHref, youtubeUrl);

  return (
    <AppBottomSheet
      ariaLabelledBy="youtube-import-entry-title"
      bodyClassName="pb-5"
      description="링크를 붙여넣고 기존 유튜브 가져오기 화면에서 추출을 이어가요"
      headerSlot={
        targetLabel ? (
          <p className="text-[12px] font-medium text-[var(--text-3)]">
            대상 · {targetLabel}
          </p>
        ) : null
      }
      leadingAction={
        <AppBackButton onClick={onBack} testId="youtube-import-entry-back" />
      }
      onClose={onClose}
      panelClassName="max-w-md"
      testId="youtube-import-entry-sheet"
      title="유튜브 가져오기"
    >
      <label
        className="block text-[13px] font-semibold text-[var(--text-2)]"
        htmlFor="youtube-import-entry-url"
      >
        유튜브 링크
      </label>
      <input
        className="mt-2 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-3 text-[14px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-4)] focus:border-[var(--brand)]"
        id="youtube-import-entry-url"
        inputMode="url"
        onChange={(event) => setYoutubeUrl(event.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        type="url"
        value={youtubeUrl}
      />
      <p className="mt-2 text-[12px] leading-[1.45] text-[var(--text-3)]">
        링크를 비워도 가져오기 화면을 열 수 있어요.
      </p>
      <div className="mt-5 flex gap-2.5">
        <button
          className="flex h-[var(--control-height-lg)] flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-4 text-sm font-semibold text-[var(--wave1-text-2)] transition-colors hover:bg-[var(--wave1-surface-fill)]"
          onClick={onBack}
          type="button"
        >
          뒤로
        </button>
        <Link
          className="flex h-[var(--control-height-lg)] flex-[2] items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--wave1-mint-contrast)] px-4 text-sm font-bold text-[var(--wave1-surface)] shadow-[var(--wave1-shadow-natural)] transition-colors hover:bg-[var(--wave1-mint-contrast-deep)]"
          href={importHref}
          onClick={onClose}
        >
          가져오기 화면 열기
        </Link>
      </div>
    </AppBottomSheet>
  );
}
