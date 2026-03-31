import type { ReactNode } from "react";

import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellProps {
  children: ReactNode;
  currentTab: "home" | "planner" | "pantry" | "mypage";
}

export function AppShell({ children, currentTab }: AppShellProps) {
  return (
    <div className="app-shell bottom-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="glass-panel overflow-hidden rounded-[32px]">
          <div className="flex items-start justify-between gap-4 px-5 py-4 md:px-7 md:py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--olive)]">
                Homecook
              </p>
              <h1 className="display mt-2 text-3xl text-[var(--brand-deep)] md:text-4xl">
                오늘 집밥 메뉴를 찾는 주방
              </h1>
            </div>
            <div className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-medium text-[var(--muted)]">
              MVP Slice 01
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <BottomTabs currentTab={currentTab} />
    </div>
  );
}
