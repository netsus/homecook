import type { ReactNode } from "react";

import { LocalDevSessionControls } from "@/components/auth/local-dev-session-controls";
import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellProps {
  children: ReactNode;
  currentTab: "home" | "planner" | "pantry" | "mypage";
}

export function AppShell({ children, currentTab }: AppShellProps) {
  const showLocalDevSessionControls = isLocalDevAuthEnabled();

  return (
    <div className="app-shell bottom-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-[clamp(1rem,4vw,1.5rem)]">
        <header className="glass-panel overflow-hidden rounded-[24px] md:rounded-[32px]">
          <div className="flex items-start justify-between gap-3 px-[clamp(1rem,4vw,1.25rem)] py-[clamp(0.875rem,3.5vw,1rem)] md:gap-4 md:px-7 md:py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--olive)]">
                Homecook
              </p>
              <h1 className="display mt-1.5 text-[clamp(1.5rem,7vw,1.875rem)] leading-[1.05] text-[var(--brand-deep)] md:mt-2 md:text-4xl">
                오늘 집밥 메뉴를 찾는 주방
              </h1>
            </div>
            <div className="rounded-full border border-[var(--line)] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] max-[360px]:px-2 max-[360px]:text-[10px]">
              MVP Slice 01
            </div>
          </div>
          {showLocalDevSessionControls ? <LocalDevSessionControls /> : null}
        </header>
        <main>{children}</main>
      </div>
      <BottomTabs currentTab={currentTab} />
    </div>
  );
}
