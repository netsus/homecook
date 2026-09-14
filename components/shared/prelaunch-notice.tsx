"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { type ReactNode } from "react";

function isMarketingPath(pathname: string | null) {
  return pathname === "/beta" || pathname?.startsWith("/beta/");
}

export function PrelaunchNotice() {
  return null;
}

export function DesktopPrelaunchNotice() {
  return null;
}

/** The marketing experience owns its viewport and must not receive app popups. */
export function ServiceNotificationBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isMarketingPath(pathname) ? null : children;
}

export function YoutubePreparationNotice({
  onBack,
  backHref = "/planner",
}: {
  onBack?: () => void;
  backHref?: string;
}) {
  const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--ui-blue-600)] px-5 text-sm font-bold text-[var(--text-inverse)] hover:bg-[var(--ui-blue-700)]";
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center" aria-labelledby="youtube-preparation-title">
      <span aria-hidden="true" className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ui-blue-50)] text-xl text-[var(--ui-blue-600)]">▶</span>
      <p className="mb-2 text-xs font-bold text-[var(--ui-blue-600)]">유튜브 레시피 가져오기</p>
      <h1 id="youtube-preparation-title" className="text-xl font-extrabold text-[var(--foreground)]">준비 중인 기능이에요</h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-[var(--text-2)]">더 정확하게 레시피를 가져올 수 있도록 준비하고 있어요.<br />조금만 기다려 주세요.</p>
      {onBack ? <button className={actionClass} style={{ color: "var(--text-inverse)" }} onClick={onBack} type="button">돌아가기</button> : <Link className={actionClass} style={{ color: "var(--text-inverse)" }} href={backHref}>돌아가기</Link>}
    </section>
  );
}
