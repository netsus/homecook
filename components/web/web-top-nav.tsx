"use client";

import Link from "next/link";
import * as React from "react";

import { MumeokHorizontalLogo } from "@/components/brand/mumeok-horizontal-logo";
import { DesktopPrelaunchNotice } from "@/components/shared/prelaunch-notice";
import { YoutubeExtractionNotificationTrigger } from "@/components/youtube-extraction/youtube-extraction-notification-center";
import { cn } from "@/components/web/utils";
import {
  PRIMARY_WEB_NAV_ITEMS,
  type PrimaryWebNavId,
} from "@/lib/navigation/app-nav";

export interface WebTopNavProps {
  activeId?: PrimaryWebNavId | "login";
  brandHref?: string;
  className?: string;
  onNavigate?: (
    href: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => void;
  rightSlot?: React.ReactNode;
  plannerDate?: string;
  plannerSegment?: "plan" | "log";
  onPlannerSegmentSelect?: (segment: "plan" | "log") => void;
}

export function WebTopNav({
  activeId,
  brandHref = "/",
  className,
  onNavigate,
  rightSlot,
  plannerDate,
  plannerSegment = "plan",
  onPlannerSegmentSelect,
}: WebTopNavProps) {
  return (
    <header className={cn("web-topnav", className)}>
      <div className="web-topnav-inner">
        <Link
          aria-label="무먹, 무엇을 먹든"
          className="web-topnav-brand"
          href={brandHref}
          onClick={(event) => onNavigate?.(brandHref, event)}
        >
          <MumeokHorizontalLogo />
        </Link>
        <nav aria-label="데스크탑 주요 메뉴" className="web-topnav-tabs">
          {PRIMARY_WEB_NAV_ITEMS.map((item) => {
            const segment =
              item.id === "planner" ? "plan" : item.id === "meal-log" ? "log" : null;
            const active = activeId === "planner" && segment
              ? segment === plannerSegment
              : item.id === activeId;
            const params = new URLSearchParams();
            if (plannerDate) params.set("date", plannerDate);
            if (segment === "log") params.set("segment", "log");
            const href = segment ? `/planner${params.size ? `?${params}` : ""}` : item.href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "web-topnav-tab",
                  active && "web-topnav-tab-active",
                )}
                href={href}
                key={item.id}
                onClick={(event) => {
                  if (
                    segment && onPlannerSegmentSelect &&
                    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
                  ) {
                    event.preventDefault();
                    onPlannerSegmentSelect(segment);
                    return;
                  }
                  onNavigate?.(href, event);
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="web-topnav-actions">
          <YoutubeExtractionNotificationTrigger />
          {rightSlot ?? (
            <Link
              aria-current={activeId === "mypage" ? "page" : undefined}
              aria-label="내 프로필"
              className="web-profile-button"
              href="/mypage"
            >
              <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
                <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4.75 17c.65-2.65 2.46-4 5.25-4s4.6 1.35 5.25 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
              </svg>
            </Link>
          )}
        </div>
      </div>
      <DesktopPrelaunchNotice />
    </header>
  );
}
