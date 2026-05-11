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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DEE2E6] bg-white px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-2 md:hidden"
      style={{ borderTopWidth: "0.5px" }}
    >
      <div className="mx-auto grid max-w-[430px] grid-cols-4">
        {items.map((item) => {
          const active = item.id === currentTab;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-[52px] flex-col items-center justify-center gap-[3px] py-1 text-[11px]",
                active ? "font-bold text-[#2AC1BC]" : "font-medium text-[#868E96]",
              ].join(" ")}
              href={item.href}
              key={item.id}
              prefetch={false}
              style={{ color: active ? "#2AC1BC" : "#868E96" }}
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
