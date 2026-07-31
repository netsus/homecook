import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260731110000_product_ingredient_link_contract_runtime.sql",
  "utf8",
);

describe("shared pantry effective ingredient reader", () => {
  it("returns a distinct generic plus eligible exact-product projection", () => {
    expect(migration).toMatch(
      /create or replace function public\.select_pantry_effective_ingredients\(p_user_id uuid\)[\s\S]*returns table \(ingredient_id uuid\)/i,
    );
    expect(migration).toMatch(
      /select distinct[\s\S]*from public\.pantry_items[\s\S]*union[\s\S]*food_product_ingredient_links/i,
    );
    expect(migration).toMatch(/relation = 'represents'/i);
    expect(migration).toMatch(/review_status = 'approved'/i);
    expect(migration).toMatch(/is_primary/i);
    expect(migration).toMatch(/is_active/i);
    expect(migration).not.toMatch(/ingredient_synonyms|product\.name|product\.brand/i);
  });

  it("requires authenticated self and exposes execution only to authenticated", () => {
    expect(migration).toMatch(
      /if auth\.uid\(\) is null or auth\.uid\(\) <> p_user_id then[\s\S]*return/i,
    );
    expect(migration).toMatch(
      /security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.select_pantry_effective_ingredients\(uuid\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.select_pantry_effective_ingredients\(uuid\)[\s\S]*to authenticated/i,
    );
    const readerAcl = migration.match(
      /revoke all on function public\.select_pantry_effective_ingredients\(uuid\)[\s\S]*?to authenticated;/i,
    )?.[0];
    expect(readerAcl).toBeDefined();
    expect(readerAcl).not.toMatch(/grant[\s\S]*to service_role/i);
  });

  it("routes both owned consumers through the shared reader", () => {
    for (const path of [
      "app/api/v1/recipes/pantry-match/route.ts",
      "app/api/v1/recipes/themes/route.ts",
    ]) {
      const route = readFileSync(path, "utf8");

      expect(route).toContain("select_pantry_effective_ingredients");
      expect(route).not.toMatch(
        /\.from\("pantry_items"\)[\s\S]{0,500}\.select\("ingredient_id"\)/,
      );
    }
  });
});
