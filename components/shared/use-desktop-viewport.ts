"use client";

import { useMediaQuery } from "@/components/shared/use-media-query";
import { WEB_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";

export function useDesktopViewport() {
  return useMediaQuery(WEB_VIEW_MEDIA_QUERY, false);
}
