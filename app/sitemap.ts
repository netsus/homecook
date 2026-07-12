import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "@/lib/legal-info";
import { createPublicDataClient } from "@/lib/supabase/server";

const PUBLIC_STATIC_PATHS = ["/", "/about", "/privacy", "/terms"] as const;
const MAX_SITEMAP_RECIPES = 49_000;
const SITEMAP_PAGE_SIZE = 1_000;

export const revalidate = 3600;

async function getPublicRecipeEntries(siteOrigin: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  try {
    const supabase = createPublicDataClient();

    for (let offset = 0; offset < MAX_SITEMAP_RECIPES; offset += SITEMAP_PAGE_SIZE) {
      const upperBound = Math.min(
        offset + SITEMAP_PAGE_SIZE - 1,
        MAX_SITEMAP_RECIPES - 1,
      );
      const result = await supabase
        .from("recipes")
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, upperBound);

      if (result.error || !result.data) return entries;

      entries.push(...result.data.map((recipe) => ({
        changeFrequency: "weekly" as const,
        lastModified: new Date(recipe.updated_at),
        priority: 0.8,
        url: `${siteOrigin}/recipe/${encodeURIComponent(recipe.id)}`,
      })));

      if (result.data.length < upperBound - offset + 1) break;
    }

    return entries;
  } catch {
    return entries;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteOrigin = getPublicSiteOrigin();
  const recipeEntries = await getPublicRecipeEntries(siteOrigin);

  return [
    ...PUBLIC_STATIC_PATHS.map((path) => ({
      changeFrequency: path === "/" ? "daily" as const : "monthly" as const,
      lastModified: new Date(),
      priority: path === "/" ? 1 : 0.5,
      url: path === "/" ? siteOrigin : `${siteOrigin}${path}`,
    })),
    ...recipeEntries,
  ];
}
