const RECIPE_NUTRITION_POSTGRES_TEST_TIMEOUT_MS = 30_000;

export function buildRecipeNutritionPostgresVitestArgs() {
  return [
    "exec",
    "vitest",
    "run",
    "tests/all-recipe-nutrition-recalculation-postgres.integration.test.ts",
    "tests/recipe-nutrition-postgres.integration.test.ts",
    "--pool=forks",
    "--maxWorkers=1",
    `--testTimeout=${RECIPE_NUTRITION_POSTGRES_TEST_TIMEOUT_MS}`,
  ];
}
