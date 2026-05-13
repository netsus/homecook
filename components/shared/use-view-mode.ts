"use client";

import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import type { ViewMode } from "@/components/shared/view-mode";

export function useViewMode(): ViewMode {
  return useDesktopViewport() ? "web" : "app";
}
