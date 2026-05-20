import Link from "next/link";
import * as React from "react";

interface AppHeaderProps {
  brandAsPageTitle?: boolean;
  currentTab?: "home" | "planner" | "pantry" | "mypage";
}

const navItems = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export function AppHeader({
  brandAsPageTitle = false,
  currentTab,
}: AppHeaderProps) {
  const brandLink = (
    <Link
      aria-label="Homecook"
      className="inline-flex text-[22px] font-bold leading-none transition-opacity hover:opacity-80"
      href="/"
    >
      <span className="text-[var(--wave1-mint-contrast)]">homecook</span>
      <span className="text-[var(--wave1-ink)]">_</span>
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-20 border-b border-[var(--wave1-border)] bg-[var(--wave1-surface)]"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <div className="flex min-h-[var(--control-height-xl)] items-center justify-center px-4 md:min-h-[56px] md:px-6">
        {brandAsPageTitle ? <h1>{brandLink}</h1> : brandLink}
        <nav aria-label="데스크탑 주요 메뉴" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = item.id === currentTab;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-[var(--radius-full)] px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand-deep)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]",
                ].join(" ")}
                href={item.href}
                key={item.id}
                prefetch={false}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
