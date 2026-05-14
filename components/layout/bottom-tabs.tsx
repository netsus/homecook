import * as React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";

type BottomTabId = "home" | "planner" | "pantry" | "mypage";

interface BottomTabsProps {
  currentTab: BottomTabId;
}

export function BottomTabs({
  currentTab,
}: BottomTabsProps) {
  return (
    <Wave1MobileBottomTab
      ariaLabel="하단 탭"
      currentTab={currentTab}
    />
  );
}
