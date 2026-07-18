import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718123000_community_prepared_food_catalog_list_perf.sql",
);

describe("community prepared food catalog performance SQL", () => {
  it("adds a follow-up migration instead of editing the merged community catalog migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("replaces the redundant public_dataset admission EXISTS and adds trigram indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/create extension if not exists pg_trgm/i);
    expect(sql).toMatch(/create index if not exists food_products_visible_name_trgm_idx/i);
    expect(sql).toMatch(/create index if not exists food_products_visible_brand_trgm_idx/i);
    expect(sql).toMatch(/using gin \(lower\(name\) gin_trgm_ops\)/i);
    expect(sql).toMatch(/using gin \(lower\(coalesce\(brand, ''\)\) gin_trgm_ops\)/i);
    expect(sql).toMatch(/product\.current_nutrition_version_id is not null/i);
    expect(sql).toMatch(/join lateral\s*\(\s*select 1\s*from public\.food_product_nutrition_versions admitted_version/i);
    expect(sql).not.toMatch(/with admitted_public_dataset as materialized/i);
    expect(sql).toMatch(/lower\(product\.name\) like/i);
    expect(sql).toMatch(/lower\(coalesce\(product\.brand, ''\)\) like/i);
  });
});
