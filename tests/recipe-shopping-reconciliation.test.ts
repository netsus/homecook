import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");

function readFuturePropagationMigration() {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
    .sort();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return readFileSync(join(migrationsDir, candidates.at(-1)!), "utf8");
}

describe("recipe shopping reconciliation", () => {
  it("keeps completed shopping immutable while preview still reports both incomplete and completed counts", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("incomplete_shopping_list_count");
    expect(sql).toContain("completed_shopping_list_count");
    expect(sql).toContain("replace_all_allowed");
    expect(sql).toContain("replace_all");
    expect(sql).toContain("keep");
  });

  it("reconciles shopping through the existing item identity surfaces instead of inventing new item schemas", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("shopping_list_items");
    expect(sql).toMatch(/ingredient_id|food_product_id/i);
    expect(sql).not.toMatch(/shopping_item_snapshot|shopping_item_replacement/i);
  });

  it("treats claimed targets as all-or-nothing replace_all failures instead of partial silent skips", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("active_cooking_claim_count");
    expect(sql).toContain("MEAL_COOKING_ALREADY_STARTED");
    expect(sql).not.toMatch(/skip_claimed|ignore_claimed/i);
  });
});
