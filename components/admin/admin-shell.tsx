"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ADMIN_TABS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/events", label: "이벤트" },
  { href: "/admin/feedback", label: "피드백" },
  { href: "/admin/audit-logs", label: "감사로그" },
] as const;

const FUTURE_TABS = [
  { label: "커뮤니티" },
  { label: "신고" },
  { label: "제재" },
] as const;

function isActiveTab(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname.startsWith(href);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header
        className="sticky top-0 z-20 border-b bg-[var(--surface)]"
        style={{ borderColor: "var(--line-strong)" }}
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center">
            <h1 className="text-xl font-extrabold text-[var(--foreground)]">
              관리자
            </h1>
          </div>
        </div>
      </header>

      <nav
        className="sticky top-14 z-10 overflow-x-auto border-b bg-[var(--surface)]"
        role="tablist"
        style={{ borderColor: "var(--line-strong)" }}
      >
        <div className="mx-auto flex max-w-6xl px-4">
          {ADMIN_TABS.map((tab) => {
            const active = isActiveTab(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                aria-selected={active}
                className={`flex h-11 shrink-0 items-center px-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-b-2 font-bold text-[var(--brand)]"
                    : "text-[var(--text-3)]"
                }`}
                href={tab.href}
                role="tab"
                style={active ? { borderColor: "var(--brand)" } : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
          {FUTURE_TABS.map((tab) => (
            <span
              key={tab.label}
              aria-disabled="true"
              className="flex h-11 shrink-0 cursor-default items-center px-3 text-sm font-medium text-[var(--text-4)] opacity-50"
              role="tab"
            >
              {tab.label}
            </span>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}
