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
    expect(runner).toContain("create role supabase_admin nologin bypassrls");
    expect(runner).not.toContain("create role supabase_admin login bypassrls");
    expect(runner).toContain(
      "HOMECOOK_RECIPE_SNAPSHOT_POST_TARGET_MIGRATIONS",
    );
    expect(runner).toContain(
      "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
    );
    expect(runner).toContain(
      "tests/recipe-snapshot-authority-postgres.integration.test.ts",
    );
    expect(runner).toContain("HOMECOOK_RECIPE_SNAPSHOT_POST_TARGET_MIGRATIONS");
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
      "20260809100000_full_local_session_refresh_authority.sql",
      "20260809110000_full_local_request_transaction_and_youtube_scope.sql",
      "20260811120000_full_local_session_observability.sql",
      "20260812143000_full_local_session_superseded_token_window.sql",
      "20260820120000_full_local_session_bounded_token_overlap.sql",
    ];
    let previousIndex = -1;
    for (const migration of activeFullLocalMigrations) {
      const currentIndex = runner.indexOf(migration);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
    expect(runner).toContain("rmSync(root, { recursive: true, force: true })");
  });

  it("applies post-target migrations after the follow-up target and before follow-up verification", () => {
    const runner = readFileSync(runnerPath, "utf8");

    const postTargetDeclaration = runner.indexOf(
      "const POST_TARGET_MIGRATIONS =",
    );
    const followupTargetExecution = runner.indexOf(
      'runRequired(path.join(postgresBin, "psql"), [\n          ...connectionArgs,\n          "-f",\n          FOLLOWUP_TARGET_MIGRATION,',
    );
    const replayFollowupTargetExecution = runner.indexOf(
      'if (mode === "replay") {\n          runRequired(path.join(postgresBin, "psql"), [\n            ...connectionArgs,\n            "-f",\n            FOLLOWUP_TARGET_MIGRATION,',
    );
    const postTargetLoop = runner.indexOf(
      "for (const migration of POST_TARGET_MIGRATIONS)",
    );
    const followupVitest = runner.indexOf("if (FOLLOWUP_INTEGRATION_TEST)");
    const activeInventory = runner.indexOf("const activeSecurityResult =");

    expect(postTargetDeclaration).toBeGreaterThan(-1);
    expect(runner).toContain(
      "must not duplicate the follow-up target migration",
    );
    expect(runner).toContain(
      "must not contain duplicate migrations",
    );
    expect(followupTargetExecution).toBeGreaterThan(-1);
    expect(replayFollowupTargetExecution).toBeGreaterThan(followupTargetExecution);
    expect(postTargetLoop).toBeGreaterThan(replayFollowupTargetExecution);
    expect(followupVitest).toBeGreaterThan(postTargetLoop);
    expect(activeInventory).toBeGreaterThan(followupVitest);
  });
});
