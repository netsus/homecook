import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "@/lib/legal-info";

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = getPublicSiteOrigin();

  return {
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
