import Link from "next/link";
import * as React from "react";

import { MumeokHorizontalLogo } from "@/components/brand/mumeok-horizontal-logo";
import { YoutubeExtractionNotificationTrigger } from "@/components/youtube-extraction/youtube-extraction-notification-center";
import { PRIMARY_WEB_NAV_ITEMS } from "@/lib/navigation/app-nav";

interface AppHeaderProps {
  brandAsPageTitle?: boolean;
  currentTab?: "home" | "planner" | "pantry" | "mypage";
}

export function AppHeader({
  brandAsPageTitle = false,
  currentTab,
}: AppHeaderProps) {
  const brandLink = (
    <Link
      aria-label="무먹, 무엇을 먹든"
      className="inline-flex items-center leading-none transition-opacity hover:opacity-80"
      href="/"
    >
      <MumeokHorizontalLogo />
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-20 border-b border-[var(--wave1-border)] bg-[var(--wave1-surface)]"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <div className="mx-auto flex min-h-[var(--control-height-xl)] max-w-6xl items-center justify-between gap-3 px-4 md:min-h-[56px] md:px-6">
        {brandAsPageTitle ? <h1>{brandLink}</h1> : brandLink}
        <nav aria-label="데스크탑 주요 메뉴" className="hidden items-center gap-1 lg:flex">
          {PRIMARY_WEB_NAV_ITEMS.map((item) => {
            const active = item.id === currentTab;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-[var(--radius-full)] px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]"
                    : "text-[var(--muted)] hover:rounded-[var(--radius-full)] hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]",
                ].join(" ")}
                href={item.href}
                key={item.id}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <YoutubeExtractionNotificationTrigger />
          <Link aria-label="마이페이지" className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-sky-50 lg:inline-flex" href="/mypage">
            <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20"><circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" /><path d="M4.75 17c.65-2.65 2.46-4 5.25-4s4.6 1.35 5.25 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
