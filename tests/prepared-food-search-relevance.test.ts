import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260725120000_prepared_food_search_relevance_foundation.sql",
);

function readMigration() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("prepared food search relevance foundation", () => {
  it("ships an additive follow-up migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("normalizes NFKC text without exposing stored search columns", () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /create or replace function public\.normalize_food_search_text\(\s*p_value text,\s*p_compact boolean default false\s*\)/i,
    );
    expect(sql).toMatch(/language sql\s+immutable\s+parallel safe\s+returns null on null input/i);
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/i);
    expect(sql).toMatch(/normalize\(p_value,\s*NFKC\)/i);
    expect(sql).toMatch(/lower\(/i);
    expect(sql).toMatch(/regexp_replace\([^;]*'\[\[:space:\]\]\+'/i);
    expect(sql).toMatch(/regexp_replace\([^;]*'\[\[:space:\]\[:punct:\]\]\+'/i);

    expect(sql).not.toMatch(/alter table public\.(?:food_products|ingredients)/i);
    expect(sql).not.toMatch(/add column if not exists search_(?:normalized|compact)/i);
    expect(sql).toMatch(
      /revoke all on function public\.normalize_food_search_text\(text,\s*boolean\)\s+from public,\s*anon,\s*authenticated,\s*service_role/i,
    );
  });

  it("defers catalog indexes until the prefix and concurrent-build plan is complete", () => {
    const sql = readMigration();

    expect(sql).not.toMatch(/create index/i);
    expect(sql).not.toMatch(/gin_trgm_ops/i);
    expect(sql).not.toMatch(/text_pattern_ops/i);
  });

  it("does not replace the legacy food-product list function or expose a ranked RPC yet", () => {
    const sql = readMigration();

    expect(sql).not.toMatch(/create or replace function public\.list_food_products/i);
    expect(sql).not.toMatch(/create (?:or replace )?function public\.search_food_catalog/i);
    expect(sql).not.toMatch(/\bgrant execute\b/i);
  });
});
