import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "@/lib/legal-info";

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = getPublicSiteOrigin();

  return {
    rules: {
      allow: "/",
      disallow: [
        "/admin",
        "/auth",
        "/cooking",
        "/leftovers",
        "/login",
        "/menu",
        "/menu-add",
        "/mypage",
        "/onboarding",
        "/pantry",
        "/planner",
        "/recipes/new",
        "/settings",
        "/shopping",
      ],
      userAgent: "*",
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
