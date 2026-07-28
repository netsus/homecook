import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260725140000_prepared_food_search_ranked_rpc.sql",
);
const hostedCompatibilityMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260725145000_prepared_food_search_hosted_compatibility.sql",
);

function readMigration() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

function readHostedCompatibilityMigration() {
  return existsSync(hostedCompatibilityMigrationPath)
    ? readFileSync(hostedCompatibilityMigrationPath, "utf8")
    : "";
}

describe("prepared food unified ranked search RPC", () => {
  it("ships as an additive replay-safe migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(readMigration()).not.toMatch(/alter table public\.(?:ingredients|food_products)/i);
  });

  it("locks the application-only signature, safe execution context, and ACL", () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /create or replace function public\.search_food_catalog_ranked\(\s*p_actor_id uuid,\s*p_query text,\s*p_types text\[\],\s*p_source text,\s*p_cursor_version integer,\s*p_cursor jsonb,\s*p_query_fingerprint text,\s*p_limit integer\s*\)/i,
    );
    expect(sql).toMatch(
      /returns jsonb\s+language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog,\s*public,\s*pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.search_food_catalog_ranked\(\s*uuid,\s*text,\s*text\[\],\s*text,\s*integer,\s*jsonb,\s*text,\s*integer\s*\)\s+from public,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.search_food_catalog_ranked\(\s*uuid,\s*text,\s*text\[\],\s*text,\s*integer,\s*jsonb,\s*text,\s*integer\s*\)\s+to service_role/i,
    );
  });

  it("validates official filters and keeps private scope separate before ranking", () => {
    const sql = readMigration();

    expect(sql).toMatch(/p_types\s*<@[\s\S]*array\['ingredient',\s*'food_product'\]/i);
    expect(sql).toMatch(/p_source not in \('public',\s*'community',\s*'mine'\)/i);
    expect(sql).toMatch(/raise exception 'INVALID_SEARCH_FILTER'/i);
    expect(sql).toMatch(/public_product_index_candidates as materialized/i);
    expect(sql).toMatch(/public_product_candidates as materialized/i);
    expect(sql).toMatch(/private_product_candidates as materialized/i);
    expect(sql).toMatch(
      /private_product_candidates[\s\S]*product\.visibility = 'private'[\s\S]*product\.owner_user_id = p_actor_id/i,
    );
    expect(sql).toMatch(
      /public_product_index_candidates[\s\S]*product\.visibility = 'public'[\s\S]*product\.moderation_status = 'visible'[\s\S]*product\.deleted_at is null[\s\S]*limit 400/i,
    );
  });

  it("bounds index candidates before exact current approved nutrition admission", () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /public_product_candidates as materialized[\s\S]*from public_product_index_candidates indexed_candidate[\s\S]*join lateral/i,
    );
    expect(sql).toMatch(
      /version\.id = product\.current_nutrition_version_id[\s\S]*version\.product_id = product\.id/i,
    );
    expect(sql).toMatch(/profile\.review_status = 'approved'[\s\S]*profile\.is_active/i);
    expect(sql).toMatch(
      /source_item\.external_item_key = product\.external_product_key/i,
    );
    expect(sql).toMatch(
      /source\.freshness_status = 'current'[\s\S]*source\.is_active/i,
    );
    expect(sql).toMatch(/count\(\*\)[\s\S]*nutrient_code in \([\s\S]*'energy_kcal'[\s\S]*\) = 5/i);
  });

  it("uses one integer tuple for order, cursor comparison, and next-page projection", () => {
    const sql = readMigration();

    for (const field of [
      "algorithm_version",
      "match_bucket",
      "coverage_bucket",
      "quantized_score",
      "source_partition",
      "type_partition",
      "created_at",
      "stable_id",
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toMatch(/p_cursor_version = 1[\s\S]*legacy_product_page/i);
    expect(sql).toMatch(/p_cursor_version = 2[\s\S]*ranked_page/i);
    expect(sql).toMatch(/jsonb_build_object\([\s\S]*'next_cursor_tuple'/i);
    expect(sql).not.toMatch(/'similarity'\s*,|'raw_score'\s*,/i);
  });

  it("replays on hosted Postgres without privileged pg_trgm function settings", () => {
    const sql = readHostedCompatibilityMigration();

    expect(existsSync(hostedCompatibilityMigrationPath)).toBe(true);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("pg_trgm.word_similarity_threshold");
    expect(sql).toContain("v_ingredient_word_match");
    expect(sql).toContain("v_product_word_match");
    expect(sql).toContain("v_query_bigrams");
    expect(sql).toContain("public.food_search_short_ngrams(");
    expect(sql).toContain("&& v_query_bigrams");
    expect(sql).toContain("public.word_similarity(");
    expect(sql).toContain("v_explicit_word_match_count <> 3");
    expect(sql).toContain("HOSTED_SEARCH_INGREDIENT_WORD_MATCH_ANCHOR_MISMATCH");
    expect(sql).toContain("HOSTED_SEARCH_PRODUCT_WORD_MATCH_ANCHOR_MISMATCH");
    expect(sql).toContain("HOSTED_SEARCH_THRESHOLD_CONFIG_ANCHOR_MISMATCH");
  });
});
