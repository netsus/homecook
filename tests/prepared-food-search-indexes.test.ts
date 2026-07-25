import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertMergedExactSource,
  buildPreparedFoodSearchIndexReleasePlan,
} from "../scripts/lib/prepared-food-search-index-release.mjs";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
);
const concurrentApplyPath = path.join(
  process.cwd(),
  "scripts/apply-prepared-food-search-indexes-concurrently.mjs",
);
const releasePlanPath = path.join(
  process.cwd(),
  "scripts/lib/prepared-food-search-index-release.mjs",
);

function readMigration() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("prepared food search relevance indexes", () => {
  it("ships a separate additive index migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("keeps the canonical migration transactional and replay-safe", () => {
    const sql = readMigration();
    const createIndexStatements =
      sql.match(/create index if not exists/gi) ?? [];

    expect(createIndexStatements).toHaveLength(9);
    expect(sql).not.toMatch(/create index concurrently/i);
    expect(sql).not.toMatch(/alter table public\.(?:food_products|ingredients)/i);
  });

  it("derives the concurrent release plan from the exact canonical migration", () => {
    expect(existsSync(concurrentApplyPath)).toBe(true);
    const script = readFileSync(concurrentApplyPath, "utf8");

    expect(script).toMatch(
      /replaceAll\([\s\S]*create index if not exists[\s\S]*create index concurrently if not exists/i,
    );
    expect(script).toMatch(/canonicalCreateCount !== 9/i);
    expect(script).toMatch(/--allow-isolated-test/i);
    const releasePlan = readFileSync(releasePlanPath, "utf8");
    expect(releasePlan).toMatch(/post-merge-release/i);
    expect(releasePlan).toMatch(/HEAD to equal origin\/master/i);
  });

  it("fails closed unless the production release runs from the clean merged exact source", () => {
    expect(
      buildPreparedFoodSearchIndexReleasePlan({
        mode: "post-merge-release",
      }),
    ).toEqual({
      mode: "post-merge-release",
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      requiresIsolatedSentinel: false,
      allowsLocalDatabase: false,
      requiresTls: true,
    });
    expect(() =>
      assertMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to equal origin\/master/i);
    expect(() =>
      assertMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
    expect(
      assertMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        trackedStatus: "",
      }),
    ).toBe("a".repeat(40));
  });

  it("keeps public and owner-private product candidate paths physically separated", () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /food_products_public_search_prefix_idx[\s\S]*where[\s\S]*visibility = 'public'[\s\S]*moderation_status = 'visible'[\s\S]*deleted_at is null/i,
    );
    expect(sql).toMatch(
      /food_products_private_search_prefix_idx[\s\S]*owner_user_id[\s\S]*where[\s\S]*visibility = 'private'[\s\S]*moderation_status = 'visible'[\s\S]*deleted_at is null/i,
    );
    expect(sql).toMatch(
      /food_products_public_search_compact_trgm_idx[\s\S]*gin_trgm_ops[\s\S]*where[\s\S]*visibility = 'public'/i,
    );
    expect(sql).toMatch(
      /food_products_private_search_compact_trgm_idx[\s\S]*gin_trgm_ops[\s\S]*where[\s\S]*visibility = 'private'/i,
    );
    expect(sql).not.toMatch(
      /food_products_(?:public|private)_search_[a-z_]+_idx[\s\S]*where[\s\S]*moderation_status\s*<>/i,
    );
  });

  it("adds indexed prefix, compact trigram, and exact short-substring paths", () => {
    const sql = readMigration();

    expect(sql).toMatch(/ingredients_search_prefix_idx[\s\S]*text_pattern_ops/i);
    expect(sql).toMatch(/ingredients_search_compact_trgm_idx[\s\S]*gin_trgm_ops/i);
    expect(sql).toMatch(
      /create or replace function public\.food_search_short_ngrams\(\s*p_value text\s*\)[\s\S]*immutable[\s\S]*parallel safe/i,
    );
    expect(sql).toMatch(/generate_series\(1,\s*2\)/i);
    expect(sql).toMatch(/ingredients_search_short_ngram_idx[\s\S]*using gin/i);
    expect(sql).toMatch(/food_products_public_search_short_ngram_idx[\s\S]*using gin/i);
    expect(sql).toMatch(/food_products_private_search_short_ngram_idx[\s\S]*using gin/i);
  });

  it("keeps both internal search helpers unavailable to API roles", () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /revoke all on function public\.food_search_short_ngrams\(text\)\s+from public,\s*anon,\s*authenticated,\s*service_role/i,
    );
    expect(sql).not.toMatch(/\bgrant execute\b/i);
  });
});
