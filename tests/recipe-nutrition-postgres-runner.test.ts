import { describe, expect, it } from "vitest";

import { buildRecipeNutritionPostgresVitestArgs } from "../scripts/lib/recipe-nutrition-postgres-runner-options.mjs";

describe("recipe nutrition PostgreSQL integration runner", () => {
  it("gives slow real-database concurrency tests an explicit 30 second timeout", () => {
    expect(buildRecipeNutritionPostgresVitestArgs()).toEqual([
      "exec",
      "vitest",
      "run",
      "tests/all-recipe-nutrition-recalculation-postgres.integration.test.ts",
      "tests/recipe-nutrition-postgres.integration.test.ts",
      "--pool=forks",
      "--maxWorkers=1",
      "--testTimeout=30000",
    ]);
  });
});
