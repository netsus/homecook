import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "@/lib/legal-info";

const PUBLIC_STATIC_PATHS = ["/", "/login", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getPublicSiteOrigin();

  return PUBLIC_STATIC_PATHS.map((path) => ({
    changeFrequency: path === "/" ? "daily" : "monthly",
    lastModified: new Date(),
    priority: path === "/" ? 1 : 0.5,
    url: path === "/" ? siteOrigin : `${siteOrigin}${path}`,
  }));
}
