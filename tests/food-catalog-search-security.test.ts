import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/api/v1/food-catalog/search/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260725140000_prepared_food_search_ranked_rpc.sql",
  "utf8",
);

describe("food catalog search security boundary", () => {
  it("authenticates before parsing filters or invoking the service-only RPC", () => {
    const authIndex = route.indexOf("auth.getUser()");
    expect(authIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(
      route.indexOf("const parsed = parseFoodCatalogSearchQuery"),
    );
    expect(authIndex).toBeLessThan(
      route.indexOf('db.rpc("read_food_catalog_source"'),
    );
    expect(authIndex).toBeLessThan(
      route.indexOf('db.rpc("search_food_catalog_ranked"'),
    );
    expect(route).not.toMatch(/createServiceRoleClient/i);
    expect(route).toMatch(/p_actor_id:\s*user\.id/i);
  });

  it("derives visible scopes in SQL and never accepts client visibility", () => {
    expect(route).not.toMatch(/searchParams\.get\(["']visibility["']\)/i);
    expect(migration).toMatch(
      /product\.visibility = 'private'[\s\S]*product\.owner_user_id = p_actor_id/i,
    );
    expect(migration).toMatch(
      /product\.visibility = 'public'[\s\S]*product\.moderation_status = 'visible'[\s\S]*product\.deleted_at is null/i,
    );
  });

  it("does not project private authority or raw ranking fields", () => {
    const payloadSection = migration.slice(
      migration.indexOf("product_payloads as materialized"),
    );

    expect(payloadSection).not.toMatch(
      /'owner_user_id'\s*,|'moderation_status'\s*,|'external_product_key'\s*,/i,
    );
    expect(payloadSection).not.toMatch(
      /'raw_score'\s*,|'similarity'\s*,|'query_fingerprint'\s*,/i,
    );
  });

  it("revokes direct Data API execution and grants only service_role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.search_food_catalog_ranked\([\s\S]*\) from public,\s*anon,\s*authenticated;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.search_food_catalog_ranked\([\s\S]*\) to service_role;/i,
    );
  });
});
