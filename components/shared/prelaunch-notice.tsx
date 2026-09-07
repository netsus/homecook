"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { type ReactNode } from "react";

import { isPrelaunchUiEnabled } from "@/lib/prelaunch";

function isMarketingPath(pathname: string | null) {
  return pathname === "/beta" || pathname?.startsWith("/beta/");
}

export function PrelaunchNotice() {
  const pathname = usePathname();
  if (!isPrelaunchUiEnabled() || isMarketingPath(pathname)) return null;

  return <PrelaunchNoticeContent className="service-prelaunch-notice-mobile" />;
}

export function DesktopPrelaunchNotice() {
  if (!isPrelaunchUiEnabled()) return null;

  return <PrelaunchNoticeContent className="service-prelaunch-notice-desktop" />;
}

function PrelaunchNoticeContent({ className }: { className: string }) {
  return (
    <aside aria-label="서비스 준비 안내" className={`service-prelaunch-notice ${className} flex flex-wrap items-center justify-center gap-x-2 gap-y-0 border-b border-sky-100 bg-sky-50 px-4 py-1.5 text-center text-[11px] leading-5 text-slate-600 sm:text-xs`}>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold leading-5 text-sky-700"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-400" />서비스 준비 중</span>
      <span className="leading-5">더 편한 식생활을 위해 하나씩 채워가고 있어요.</span>
    </aside>
  );
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
  const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700";
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center" aria-labelledby="youtube-preparation-title">
      <span aria-hidden="true" className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-600">▶</span>
      <p className="mb-2 text-xs font-bold text-blue-600">유튜브 레시피 가져오기</p>
      <h1 id="youtube-preparation-title" className="text-xl font-extrabold text-[var(--foreground)]">준비 중인 기능이에요</h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-[var(--text-2)]">더 정확하게 레시피를 가져올 수 있도록 준비하고 있어요.<br />조금만 기다려 주세요.</p>
      {onBack ? <button className={actionClass} style={{ color: "#fff" }} onClick={onBack} type="button">돌아가기</button> : <Link className={actionClass} style={{ color: "#fff" }} href={backHref}>돌아가기</Link>}
    </section>
  );
}
