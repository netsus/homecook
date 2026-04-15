import * as React from "react";

import { LocalDevSessionControls } from "@/components/auth/local-dev-session-controls";
import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellProps {
  children: React.ReactNode;
  currentTab: "home" | "planner" | "pantry" | "mypage";
}

export function AppShell({ children, currentTab }: AppShellProps) {
  const showLocalDevSessionControls = isLocalDevAuthEnabled();

  return (
    <div className="app-shell bottom-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-[clamp(1rem,4vw,1.5rem)]">
        <header className="glass-panel overflow-hidden rounded-[24px] md:rounded-[32px]">
          <div className="flex items-center justify-between gap-3 px-[clamp(1rem,4vw,1.25rem)] py-[clamp(0.75rem,3vw,0.875rem)] md:gap-4 md:px-7 md:py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--olive)]">
                Homecook
              </p>
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
