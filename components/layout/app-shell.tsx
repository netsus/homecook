import * as React from "react";

import { AppHeader } from "@/components/layout/app-header";
import { BottomTabs } from "@/components/layout/bottom-tabs";

interface AppShellProps {
  children: React.ReactNode;
  currentTab: "home" | "planner" | "pantry" | "mypage";
  className?: string;
  headerMode?: "default" | "desktop-only" | "hidden";
  bottomTabsMode?: "default" | "hidden";
}

export function AppShell({
  children,
  className,
  currentTab,
  bottomTabsMode = "default",
  headerMode = "default",
}: AppShellProps) {
  const showSharedHeader = headerMode !== "hidden";
  const showSharedBottomTabs = bottomTabsMode === "default";
  const brandAsPageTitle = currentTab === "home";
  const shellClassName = ["app-shell", showSharedBottomTabs ? "bottom-safe" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const sharedHeader = (
    <AppHeader
      brandAsPageTitle={brandAsPageTitle}
      currentTab={currentTab}
    />
  );

  return (
    <div className={shellClassName}>
      <div className="mx-auto flex max-w-6xl flex-col gap-[clamp(1rem,4vw,1.5rem)]">
        {showSharedHeader ? (
          headerMode === "desktop-only" ? (
            <div className="hidden lg:block">{sharedHeader}</div>
          ) : (
            sharedHeader
          )
        ) : null}
        <main>{children}</main>
      </div>
      {showSharedBottomTabs ? (
        <div className="lg:hidden">
          <BottomTabs
            compactOnNarrow={currentTab === "mypage"}
            currentTab={currentTab}
          />
        </div>
      ) : null}
    </div>
  );
}
