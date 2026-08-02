import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const previewRoutePath = join(
  process.cwd(),
  "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
);
const recipeRoutePath = join(process.cwd(), "app/api/v1/recipes/[id]/route.ts");

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

function readRoute(path: string, message: string) {
  expect(existsSync(path), message).toBe(true);
  return readFileSync(path, "utf8");
}

describe("recipe content snapshot future propagation", () => {
  it("adds the official future impact preview route and owner patch/delete handlers", () => {
    const previewRoute = readRoute(
      previewRoutePath,
      "future impact preview route is missing",
    );
    const recipeRoute = readRoute(
      recipeRoutePath,
      "recipe detail route is missing",
    );

    expect(previewRoute).toMatch(/export\s+async\s+function\s+POST/i);
    expect(recipeRoute).toMatch(/export\s+async\s+function\s+PATCH/i);
    expect(recipeRoute).toMatch(/export\s+async\s+function\s+DELETE/i);
  });

  it("locks the official preview and patch request surface without reviving legacy thumbnail writes", () => {
    const sql = readFuturePropagationMigration();

    for (const token of [
      "base_recipe_revision",
      "draft",
      "future_plan_strategy",
      "impact_token",
      "image_object_id",
      "replace_all",
      "keep",
    ]) {
      expect(sql, `missing official request token ${token}`).toContain(token);
    }

    expect(sql).not.toMatch(/thumbnail_url/i);
    expect(sql).not.toMatch(/storage_path/i);
  });

  it("keeps exact public stale and claim failures distinct from idempotency replay failures", () => {
    const sql = readFuturePropagationMigration();

    for (const code of [
      "RECIPE_IMPACT_STALE",
      "MEAL_COOKING_ALREADY_STARTED",
      "IDEMPOTENCY_KEY_REUSED",
    ]) {
      expect(sql, `missing official error code ${code}`).toContain(code);
    }
  });

  it("keeps preview and patch on the same full-draft surface instead of partial update shortcuts", () => {
    const previewRoute = readRoute(
      previewRoutePath,
      "future impact preview route is missing",
    );
    const recipeRoute = readRoute(
      recipeRoutePath,
      "recipe detail route is missing",
    );

    expect(previewRoute).toContain("base_recipe_revision");
    expect(previewRoute).toContain("draft");
    expect(recipeRoute).toContain("base_recipe_revision");
    expect(recipeRoute).toContain("draft");
    expect(recipeRoute).toContain("impact_token");
    expect(recipeRoute).toContain("future_plan_strategy");
  });
});
