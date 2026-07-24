import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RUNNER_PATH = path.join(
  process.cwd(),
  "scripts/run-recipe-visibility-read-hardening-postgres-integration.mjs",
);
const INTEGRATION_TEST_PATH = path.join(
  process.cwd(),
  "tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
);

describe("recipe visibility PostgreSQL gate", () => {
  it("has a non-skippable isolated PostgreSQL runner wired to the package script", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(
      packageJson.scripts?.["test:recipe-visibility-read-hardening:postgres"],
    ).toBe(
      "node scripts/run-recipe-visibility-read-hardening-postgres-integration.mjs",
    );
    expect(existsSync(RUNNER_PATH)).toBe(true);
    expect(existsSync(INTEGRATION_TEST_PATH)).toBe(true);

    if (!existsSync(RUNNER_PATH)) {
      return;
    }

    const runner = readFileSync(RUNNER_PATH, "utf8");
    expect(runner).toContain("POSTGRES_RUNTIME_UNAVAILABLE");
    expect(runner).toContain("mkdtempSync");
    expect(runner).toContain(
      "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
    );
    expect(runner).toContain("for (const migrationPath of MIGRATION_PATHS)");
    expect(runner).toContain(
      "tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
    );
    expect(runner).toContain("rmSync(root, { recursive: true, force: true })");
  });
});
