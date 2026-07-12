import Link from "next/link";
import * as React from "react";

import { cn } from "@/components/web/utils";
import {
  PRIMARY_WEB_NAV_ITEMS,
  type PrimaryWebNavId,
} from "@/lib/navigation/app-nav";

export interface WebTopNavProps {
  activeId?: PrimaryWebNavId | "login";
  brandHref?: string;
  brandLabel?: string;
  className?: string;
  rightSlot?: React.ReactNode;
}

export function WebTopNav({
  activeId,
  brandHref = "/",
  brandLabel = "집밥",
  className,
  rightSlot,
}: WebTopNavProps) {
  return (
    <header className={cn("web-topnav", className)}>
      <div className="web-topnav-inner">
        <Link className="web-topnav-brand" href={brandHref}>
          <span className="web-topnav-brand-dot" />
          <span>{brandLabel}</span>
        </Link>
        <nav aria-label="데스크탑 주요 메뉴" className="web-topnav-tabs">
          {PRIMARY_WEB_NAV_ITEMS.map((item) => {
            const active = item.id === activeId;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "web-topnav-tab",
                  active && "web-topnav-tab-active",
                )}
                href={item.href}
                key={item.id}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {rightSlot}
      </div>
    </header>
  );
}
