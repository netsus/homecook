import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260629120000_normalize_foodsafety_image_urls.sql";

describe("FoodSafety image URL normalization migration", () => {
  it("normalizes only the documented FoodSafety image fields", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("http://www.foodsafetykorea.go.kr");
    expect(sql).toContain("https://www.foodsafetykorea.go.kr");
    expect(sql).toContain("update public.recipes");
    expect(sql).toContain("thumbnail_url");
    expect(sql).toContain("update public.recipe_sources");
    expect(sql).toContain("source_image_url");
    expect(sql).toContain("image_candidates");
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("is distinct from");
    expect(sql).toContain("like v_http_host || '/%'");
  });
});
