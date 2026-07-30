import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const runner = readFileSync(
  "scripts/run-product-ingredient-link-postgres-integration.mjs",
  "utf8",
);

describe("product ingredient link PostgreSQL runner contract", () => {
  it("wires the non-skippable package command to the isolated runner", () => {
    expect(
      packageJson.scripts?.["test:product-ingredient-link-foundation:postgres"],
    ).toBe("node scripts/run-product-ingredient-link-postgres-integration.mjs");
    expect(runner).toContain(
      'const TEST_FILE = "tests/product-ingredient-link-postgres.integration.test.ts"',
    );
    expect(runner).toContain(
      '"supabase/migrations/20260730210000_product_ingredient_link_foundation.sql"',
    );
    expect(runner).toContain("POSTGRES_RUNTIME_UNAVAILABLE");
  });

  it("runs both fresh and replay databases with a pre-target data fixture", () => {
    expect(runner).toContain('runMode(postgresBin, "fresh")');
    expect(runner).toContain('runMode(postgresBin, "replay")');
    expect(runner).toContain("replaySeedSql()");
    expect(runner).toContain(
      '"supabase/migrations/20260718090000_community_prepared_food_catalog.sql"',
    );
  });

  it("uses a narrow temporary root and always removes only that root", () => {
    expect(runner).toMatch(
      /mkdtempSync\([\s\S]*`hcn-product-link-\$\{mode\}-`[\s\S]*\)/,
    );
    expect(runner).toContain(
      "rmSync(root, { recursive: true, force: true })",
    );
    expect(runner).not.toMatch(
      /linked-remote|SUPABASE_DB_URL|DATABASE_URL|production|staging/i,
    );
  });
});
