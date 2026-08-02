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

describe("recipe future impact security", () => {
  it("keeps lifecycle and authority failures explicit in the server-only writer path", () => {
    const sql = readFuturePropagationMigration();

    for (const code of [
      "ACCOUNT_GENERATION_STALE",
      "ACCOUNT_SESSION_STALE",
      "ACCOUNT_DELETING",
      "FORBIDDEN",
      "RESOURCE_NOT_FOUND",
      "RECIPE_IMPACT_STALE",
      "MEAL_COOKING_ALREADY_STARTED",
    ]) {
      expect(sql, `missing official failure ${code}`).toContain(code);
    }

    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function[\s\S]*service_role/i);
  });

  it("funnels preview and mutation through RPC calls instead of direct meal or shopping table writes", () => {
    const previewRoute = readRoute(
      previewRoutePath,
      "future impact preview route is missing",
    );
    const recipeRoute = readRoute(
      recipeRoutePath,
      "recipe detail route is missing",
    );

    expect(previewRoute).toMatch(/\.rpc\(/);
    expect(recipeRoute).toMatch(/\.rpc\(/);
    expect(recipeRoute).not.toMatch(/\.from\(\"meals\"\)\.(insert|update|delete)/);
    expect(recipeRoute).not.toMatch(
      /\.from\(\"shopping_list_items\"\)\.(insert|update|delete)/,
    );
  });

  it("requires UUID idempotency on patch/delete and keeps replay logic on the server", () => {
    const recipeRoute = readRoute(
      recipeRoutePath,
      "recipe detail route is missing",
    );
    const sql = readFuturePropagationMigration();

    expect(recipeRoute).toContain("Idempotency-Key");
    expect(sql).toMatch(/p_idempotency_key uuid/i);
    expect(sql).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(sql).toMatch(/durable_result/i);
  });
});
