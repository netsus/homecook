"use client";

import { useMediaQuery } from "@/components/shared/use-media-query";
import { APP_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";

export function useIsMobileViewport() {
  return useMediaQuery(APP_VIEW_MEDIA_QUERY, true);
}
