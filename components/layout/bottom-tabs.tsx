import * as React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import type { PrimaryMobileTabId } from "@/lib/navigation/app-nav";

interface BottomTabsProps {
  currentTab: PrimaryMobileTabId;
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
