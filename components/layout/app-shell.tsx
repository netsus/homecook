import * as React from "react";

import { AppHeader } from "@/components/layout/app-header";
import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellProps {
  children: React.ReactNode;
  currentTab: "home" | "planner" | "pantry" | "mypage";
  headerMode?: "default" | "hidden";
}

export function AppShell({
  children,
  currentTab,
  headerMode = "default",
}: AppShellProps) {
  const showSharedHeader = headerMode === "default";
  const brandAsPageTitle = currentTab === "home";

  return (
    <div className="app-shell bottom-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-[clamp(1rem,4vw,1.5rem)]">
        {showSharedHeader ? <AppHeader brandAsPageTitle={brandAsPageTitle} /> : null}
        <main>{children}</main>
      </div>
      <BottomTabs currentTab={currentTab} />
    </div>
  );
}
