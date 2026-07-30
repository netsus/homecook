import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const runnerPath = join(
  process.cwd(),
  "scripts",
  "run-recipe-snapshot-authority-postgres-integration.mjs",
);
const integrationPath = join(
  process.cwd(),
  "tests",
  "recipe-snapshot-authority-postgres.integration.test.ts",
);

describe("recipe snapshot authority PostgreSQL gate", () => {
  it("wires a non-skippable isolated fresh-and-replay PostgreSQL runner", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(
      packageJson.scripts?.["test:recipe-snapshot-authority:postgres"],
    ).toBe(
      "node scripts/run-recipe-snapshot-authority-postgres-integration.mjs",
    );
    expect(existsSync(runnerPath)).toBe(true);
    expect(existsSync(integrationPath)).toBe(true);

    if (!existsSync(runnerPath)) {
      return;
    }

    const runner = readFileSync(runnerPath, "utf8");
    expect(runner).toContain("POSTGRES_RUNTIME_UNAVAILABLE");
    expect(runner).toContain("mkdtempSync");
    expect(runner).toContain(
      "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
    );
    expect(runner).toContain(
      "tests/recipe-snapshot-authority-postgres.integration.test.ts",
    );
    expect(runner).toContain("fresh");
    expect(runner).toContain("replay");
    expect(runner).toContain("rmSync(root, { recursive: true, force: true })");
  });
});
