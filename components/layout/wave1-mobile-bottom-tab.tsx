"use client";

import Link from "next/link";
import React from "react";

type Wave1MobileBottomTabId = "home" | "planner" | "pantry" | "mypage";

interface Wave1MobileBottomTabProps {
  currentTab: Wave1MobileBottomTabId;
  ariaLabel: string;
}

const items: Array<{
  href: string;
  icon: (active: boolean) => React.ReactNode;
  id: Wave1MobileBottomTabId;
  label: string;
}> = [
  { href: "/", icon: (active) => <HomeIcon active={active} />, id: "home", label: "홈" },
  {
    href: "/planner",
    icon: (active) => <CalendarIcon active={active} />,
    id: "planner",
    label: "플래너",
  },
  {
    href: "/pantry",
    icon: (active) => <PantryIcon active={active} />,
    id: "pantry",
    label: "팬트리",
  },
  {
    href: "/mypage",
    icon: (active) => <UserIcon active={active} />,
    id: "mypage",
    label: "마이",
  },
];

export function Wave1MobileBottomTab({
  ariaLabel,
  currentTab,
}: Wave1MobileBottomTabProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-[calc(8px+env(safe-area-inset-bottom))] z-30 px-4 lg:hidden"
    >
      <div
        className="mx-auto grid h-16 max-w-[360px] grid-cols-4 rounded-full border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-2 shadow-[0_14px_36px_rgba(33,37,41,0.16)]"
        data-slot="bottom-tab-container"
      >
        {items.map((item) => {
          const active = item.id === currentTab;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-[3px] py-1 text-[11px] transition-colors",
                active
                  ? "bottom-tab-active-link font-extrabold text-[#111111]"
                  : "font-semibold text-[var(--wave1-text-3)] hover:text-[var(--wave1-text-2)]",
              ].join(" ")}
              href={item.href}
              key={item.id}
              prefetch={false}
            >
              {item.icon(active)}
              <span>{item.label}</span>
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
      className={active ? "bottom-tab-active-icon h-6 w-6" : "h-6 w-6"}
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
      className={active ? "bottom-tab-active-icon h-6 w-6" : "h-6 w-6"}
      data-testid="bottom-tab-icon-planner"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {active ? (
        <rect
          fill="currentColor"
          height="6.5"
          rx="2"
          stroke="none"
          width="10.5"
          x="6.75"
          y="11"
        />
      ) : null}
      <path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5z" fill="none" />
      {active ? (
        <circle
          cx="12"
          cy="14.25"
          data-testid="bottom-tab-planner-center-dot"
          fill="var(--wave1-surface)"
          r="2.1"
          stroke="none"
        />
      ) : null}
    </svg>
  );
}

function PantryIcon({ active }: { active: boolean }) {
  const innerStroke = active ? "var(--wave1-surface)" : "currentColor";

  return (
    <svg
      aria-hidden="true"
      className={active ? "bottom-tab-active-icon h-6 w-6" : "h-6 w-6"}
      data-testid="bottom-tab-icon-pantry-fridge"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="18" rx="3" width="13" x="5.5" y="3" />
      <path d="M5.5 9.5h13" stroke={innerStroke} />
      <path d="M15 13v4" stroke={innerStroke} />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={active ? "bottom-tab-active-icon h-6 w-6" : "h-6 w-6"}
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
