import Link from "next/link";
import * as React from "react";

const tabs = [
  { id: "home", label: "홈", href: "/", icon: HomeIcon },
  { id: "planner", label: "플래너", href: "/planner", icon: CalendarIcon },
  { id: "pantry", label: "팬트리", href: "/pantry", icon: PantryIcon },
  { id: "mypage", label: "마이", href: "/mypage", icon: UserIcon },
] as const;

interface BottomTabsProps {
  currentTab: (typeof tabs)[number]["id"];
  compactOnNarrow?: boolean;
}

export function BottomTabs({
  compactOnNarrow = false,
  currentTab,
}: BottomTabsProps) {
  const compactNavClass = compactOnNarrow ? " max-[360px]:px-3" : "";
  const compactLinkClass = compactOnNarrow ? " max-[360px]:min-h-[48px]" : "";

  return (
    <nav
      aria-label="하단 탭"
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-2${compactNavClass}`}
      style={{ borderTopWidth: "0.5px" }}
    >
      <div className="mx-auto grid max-w-[430px] grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.id === currentTab;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-[3px] py-1 text-[11px] transition-colors${compactLinkClass} ${
                active
                  ? "font-bold text-[var(--wave1-mint-contrast)]"
                  : "font-medium text-[var(--wave1-text-3)] hover:text-[var(--wave1-text-2)]"
              }`}
              href={tab.href}
              prefetch={false}
            >
              <Icon active={active} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5z" fill="none" />
      {active ? <path d="M8 12h3v3H8zM13 12h3v3h-3z" stroke="none" /> : null}
    </svg>
  );
}

function PantryIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 9h14v11H5z" />
      <path d="M8 9V6h8v3" />
      <path d="M9 13h6" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
