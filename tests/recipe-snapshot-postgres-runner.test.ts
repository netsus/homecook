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
    const activeFullLocalMigrations = [
      "20260801120000_full_local_auth_db_foundation.sql",
      "20260801150000_full_local_account_bootstrap.sql",
      "20260801151000_full_local_request_authority.sql",
      "20260803090000_full_local_session_issue_time_precision.sql",
      "20260803091000_full_local_optional_nbf_authority.sql",
      "20260803092000_recipe_future_internal_scope.sql",
      "20260803093000_full_local_read_only_request_authority.sql",
    ];
    let previousIndex = -1;
    for (const migration of activeFullLocalMigrations) {
      const currentIndex = runner.indexOf(migration);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
    expect(runner).toContain("rmSync(root, { recursive: true, force: true })");
  });
});
