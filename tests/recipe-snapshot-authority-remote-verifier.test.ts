import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("recipe snapshot authority remote verifier", () => {
  it("rejects replace refs and legacy grafts that forge merged ancestry", () => {
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), "recipe-snapshot-ancestry-"),
    );
    const repositoryRoot = join(fixtureRoot, "repository");
    const originRoot = join(fixtureRoot, "origin.git");
    const remoteCli = resolve(
      "scripts/verify-recipe-snapshot-authority-remote.mjs",
    );
    const hybridCli = resolve(
      "scripts/verify-recipe-snapshot-authority-hybrid.mjs",
    );
    const git = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    const verifyRejected = (cli: string) => {
      const result = spawnSync(
        process.execPath,
        [cli, "--mode", "post-merge-read-only", "--dry-run"],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
        },
      );
      expect(result.status, result.stdout).toBe(1);
      expect(result.stderr).toMatch(/merged into origin\/master|grafts/i);
    };

    try {
      mkdirSync(repositoryRoot);
      expect(
        spawnSync(
          "git",
          ["init", "--bare", "--initial-branch=master", originRoot],
          { encoding: "utf8" },
        ).status,
      ).toBe(0);
      git(["init", "--initial-branch=master"]);
      git(["config", "user.name", "Snapshot Test"]);
      git(["config", "user.email", "snapshot@example.test"]);
      writeFileSync(join(repositoryRoot, "base.txt"), "base\n");
      git(["add", "base.txt"]);
      git(["commit", "-m", "base"]);
      git(["remote", "add", "origin", originRoot]);
      git(["push", "-u", "origin", "master"]);
      git(["switch", "-c", "feature"]);
      writeFileSync(join(repositoryRoot, "feature.txt"), "feature\n");
      git(["add", "feature.txt"]);
      git(["commit", "-m", "feature"]);
      const featureSha = git(["rev-parse", "HEAD"]);
      git(["switch", "master"]);
      writeFileSync(join(repositoryRoot, "master.txt"), "master\n");
      git(["add", "master.txt"]);
      git(["commit", "-m", "master"]);
      const masterSha = git(["rev-parse", "HEAD"]);
      git(["push", "origin", "master"]);
      git(["switch", "feature"]);
      const manifestDirectory = join(repositoryRoot, "docs", "security");
      mkdirSync(manifestDirectory, { recursive: true });
      writeFileSync(
        join(
          manifestDirectory,
          "recipe-snapshot-authority-security-function-authorization-manifest.json",
        ),
        readFileSync(
          resolve(
            "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json",
          ),
          "utf8",
        ),
      );
      const migrationDirectory = join(repositoryRoot, "supabase", "migrations");
      mkdirSync(migrationDirectory, { recursive: true });
      writeFileSync(
        join(
          migrationDirectory,
          "20260729170500_recipe_snapshot_authority_foundation.sql",
        ),
        readFileSync(
          resolve(
            "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
          ),
          "utf8",
        ),
      );

      git(["replace", "--graft", masterSha, featureSha]);
      expect(
        spawnSync(
          "git",
          ["merge-base", "--is-ancestor", featureSha, "origin/master"],
          { cwd: repositoryRoot },
        ).status,
      ).toBe(0);
      verifyRejected(remoteCli);
      verifyRejected(hybridCli);

      git(["replace", "-d", masterSha]);
      const gitDirectory = git(["rev-parse", "--git-dir"]);
      const graftsPath = join(repositoryRoot, gitDirectory, "info", "grafts");
      writeFileSync(graftsPath, `${masterSha} ${featureSha}\n`);
      expect(
        spawnSync(
          "git",
          ["merge-base", "--is-ancestor", featureSha, "origin/master"],
          { cwd: repositoryRoot },
        ).status,
      ).toBe(0);
      verifyRejected(remoteCli);
      verifyRejected(hybridCli);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it("defines a merged-exact-SHA read-only verification plan", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
    });
    expect(plan.sql).toContain("required_tables");
    expect(plan.sql).toContain("pg_catalog.pg_attribute");
    expect(plan.sql).toContain("pg_catalog.pg_constraint");
    expect(plan.sql).toContain("pg_catalog.pg_trigger");
    expect(plan.sql).toContain("has_table_privilege");
    expect(plan.sql).toContain("has_function_privilege");
    expect(plan.sql).toContain("pg_catalog.pg_proc");
    expect(plan.sql).toContain("prosecdef");
    expect(plan.sql).toContain("safe_search_path");
    expect(plan.sql).toContain("recipe_content_snapshots");
    expect(plan.sql).toContain("cooking_session_meal_claims");
    expect(plan.sql).toContain("column_missing_count");
    expect(plan.sql).toContain("column_drift_count");
    expect(plan.sql).toContain("fk_missing_count");
    expect(plan.sql).toContain("fk_drift_count");
    expect(plan.sql).toContain("unique_missing_count");
    expect(plan.sql).toContain("unique_drift_count");
    expect(plan.sql).toContain("check_missing_count");
    expect(plan.sql).toContain("check_drift_count");
    expect(plan.sql).toContain("trigger_missing_count");
    expect(plan.sql).toContain("trigger_drift_count");
    expect(plan.sql).toContain("acl_missing_count");
    expect(plan.sql).toContain("acl_drift_count");
    expect(plan.sql).toContain("function_missing_count");
    expect(plan.sql).toContain("function_drift_count");
    expect(plan.sql).toContain(
      "'verification_scope_status', 'post-' || 'mer' || 'ge-read-only'",
    );
    expect(plan.sql).toContain("orphan_legacy_session_count");
    expect(plan.sql).toContain("mixed_legacy_session_count");
    expect(plan.sql).toContain("content_direct_mismatch_count");
    expect(plan.sql).toContain("backfill_gap_count");
    expect(plan.sql).toContain("compatibility_direct_only_write_count");
    const backfillPredicate = plan.sql.match(
      /count\(\*\) filter \(\s+where meal\.status in \('registered', 'shopping_done'\)[\s\S]*?\)::integer as backfill_gap_count/u,
    )?.[0];
    expect(backfillPredicate).toBeTruthy();
    expect(backfillPredicate).not.toContain(
      "meal.recipe_nutrition_snapshot_id",
    );
    expect(plan.sql).toMatch(
      /meal\.recipe_nutrition_snapshot_id is not null\s+and meal\.recipe_nutrition_snapshot_id is distinct from content_snapshot\.recipe_nutrition_snapshot_id/u,
    );
    expect(plan.sql).not.toMatch(
      /meal\.recipe_nutrition_snapshot_id is null\s+or meal\.recipe_nutrition_snapshot_id is distinct from content_snapshot\.recipe_nutrition_snapshot_id/u,
    );
    expect(plan.sql).toContain("'remote_writes', 0");
    const manifest = JSON.parse(
      readFileSync(
        "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json",
        "utf8",
      ),
    ) as {
      functions?: Array<{ signature?: string }>;
    };
    expect(manifest.functions).toHaveLength(16);
    for (const entry of manifest.functions ?? []) {
      expect(entry.signature).toBeTruthy();
      expect(plan.sql).toContain(entry.signature as string);
    }
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
    );
  });

  it("detects unexpected owned inventory instead of checking only missing rows", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan.sql).toContain("exact_owned_column_tables");
    expect(plan.sql).toContain("unexpected_owned_column_count");
    expect(plan.sql).toContain("expected_column.relation_name is null");
    expect(plan.sql).toContain("unexpected_owned_fk_count");
    expect(plan.sql).toContain("unexpected_owned_unique_count");
    expect(plan.sql).toContain("unexpected_owned_check_count");
    expect(plan.sql).toContain("unexpected_owned_trigger_count");
    expect(plan.sql).toContain("actual_owned_functions");
    expect(plan.sql).toContain("unexpected_owned_function_count");
  });

  it("verifies the full claims-table inventory that Stage 2 owns", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan.sql).toContain("public.cooking_session_meal_claims");
    expect(plan.sql).toContain("'meal_id'");
    expect(plan.sql).toContain("'session_id'");
    expect(plan.sql).toContain("'owner_user_id'");
    expect(plan.sql).toContain("'claimed_at'");
    expect(plan.sql).toContain(
      "'cooking_session_meal_claims_session_id_fkey'",
    );
    expect(plan.sql).toContain(
      "'cooking_session_meal_claims_owner_user_id_fkey'",
    );
  });

  it("accepts clean historical merged SHAs and rejects non-merged or dirty source trees", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    expect(() =>
      verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow(
      /unsupported recipe snapshot authority remote verification mode/i,
    );
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        isAncestorOfOriginMaster: false,
        legacyGrafts: "",
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to be merged into origin\/master/i);
    expect(
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        isAncestorOfOriginMaster: true,
        legacyGrafts: "",
        trackedStatus: "",
      }),
    ).toBe("a".repeat(40));
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        isAncestorOfOriginMaster: true,
        legacyGrafts: "",
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "",
        originMaster: "",
        isAncestorOfOriginMaster: true,
        legacyGrafts: "",
        trackedStatus: "",
      }),
    ).toThrow(/40-character commit SHA/i);
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        isAncestorOfOriginMaster: true,
        legacyGrafts: `${"b".repeat(40)} ${"a".repeat(40)}`,
        trackedStatus: "",
      }),
    ).toThrow(/legacy Git grafts/i);
  });

  it("fails closed on multi-statement SQL, mutating keywords, and psql meta-commands", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
        sql: "select 1; select 2;",
        fieldName: "test SQL",
      }),
    ).toThrow("test SQL must be a single SELECT/CTE statement");
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
        sql: "with safe as (select 1) update public.meals set status = 'x'",
        fieldName: "test SQL",
      }),
    ).toThrow("test SQL must not contain mutating SQL keywords");

    for (const sql of [
      "with safe as (select 1 as id) select id from safe;\n\\gexec",
      "with safe as (select 1 as id) select id from safe;\n\\copy public.users to '/tmp/users.csv'",
      "with safe as (select 1 as id) select id from safe;\n\\! echo hacked",
    ]) {
      expect(() =>
        verifier.assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
          sql,
          fieldName: "test SQL",
        }),
      ).toThrow("test SQL must not contain psql meta-commands");
    }
  });

  it("keeps only linked libpq keys, removes poisoned PG env, and forces a read-only TLS request", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    const linkedEnvironment =
      verifier.parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment({
        output: [
          'export PGHOST="db.example.internal"',
          "export PGPORT='6543'",
          "export PGUSER=linked_user",
          "export PGPASSWORD=linked_password",
          "export PGDATABASE=postgres",
          "export PGSERVICE=ignored",
        ].join("\n"),
      });

    expect(linkedEnvironment).toEqual({
      PGHOST: "db.example.internal",
      PGPORT: "6543",
      PGUSER: "linked_user",
      PGPASSWORD: "linked_password",
      PGDATABASE: "postgres",
    });

    const request = verifier.buildRecipeSnapshotAuthorityRemotePsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        LANG: "en_US.UTF-8",
        HOME: "/tmp/homecook",
        PGHOST: "poison-host",
        PGDATABASE: "poison-db",
        PGOPTIONS: "-c statement_timeout=1",
        PGSERVICE: "poison-service",
        PGSSLMODE: "disable",
      },
      databaseEnvironment: linkedEnvironment,
      planSql: "with safe as (select 1) select * from safe",
    });

    expect(request.environment).toEqual({
      PATH: "/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      HOME: "/tmp/homecook",
      PGHOST: "db.example.internal",
      PGPORT: "6543",
      PGUSER: "linked_user",
      PGPASSWORD: "linked_password",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
    });
    expect(request.args).toEqual(["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
    expect(request.input).toBe(
      "begin transaction isolation level read committed read only;\nwith safe as (select 1) select * from safe\ncommit;",
    );
  });

  it("removes Git environment overrides that can redirect ancestry evidence", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    expect(
      verifier.buildRecipeSnapshotAuthorityGitEnvironment({
        baseEnvironment: {
          PATH: "/usr/bin:/bin",
          HOME: "/tmp/homecook",
          GIT_DIR: "/tmp/forged.git",
          GIT_WORK_TREE: "/tmp/forged-worktree",
          GIT_OBJECT_DIRECTORY: "/tmp/forged-objects",
          GIT_ALTERNATE_OBJECT_DIRECTORIES: "/tmp/alternate-objects",
          GIT_REPLACE_REF_BASE: "refs/forged",
          GIT_SHALLOW_FILE: "/tmp/forged-shallow",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_GLOBAL: "/tmp/forged-global-config",
          GIT_CONFIG_KEY_0: "core.repositoryformatversion",
          GIT_CONFIG_SYSTEM: "/tmp/forged-system-config",
          GIT_CONFIG_VALUE_0: "0",
          GIT_ASKPASS: "/usr/bin/ssh-askpass",
        },
      }),
    ).toEqual({
      PATH: "/usr/bin:/bin",
      HOME: "/tmp/homecook",
      GIT_ASKPASS: "/usr/bin/ssh-askpass",
    });
  });

  it("accepts only exact status and zero-drift inventory fields with remote_writes=0", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );

    const validResult = {
      verification_scope_status: "post-merge-read-only",
      schema_inventory_status: "ready",
      acl_inventory_status: "ready",
      function_inventory_status: "ready",
      legacy_session_report_status: "report-only",
      content_authority_status: "report-only",
      compatibility_telemetry_status: "report-only",
      remote_write_status: "zero",
      required_table_count: 8,
      missing_table_count: 0,
      required_column_count: 27,
      column_missing_count: 0,
      column_drift_count: 0,
      required_fk_count: 9,
      fk_missing_count: 0,
      fk_drift_count: 0,
      required_unique_count: 3,
      unique_missing_count: 0,
      unique_drift_count: 0,
      required_check_count: 7,
      check_missing_count: 0,
      check_drift_count: 0,
      required_trigger_count: 10,
      trigger_missing_count: 0,
      trigger_drift_count: 0,
      required_acl_count: 27,
      acl_missing_count: 0,
      acl_drift_count: 0,
      required_function_count: 16,
      function_missing_count: 0,
      function_source_drift_count: 0,
      function_security_drift_count: 0,
      function_search_path_drift_count: 0,
      function_acl_drift_count: 0,
      unexpected_function_count: 0,
      function_drift_count: 0,
      orphan_legacy_session_count: 0,
      mixed_legacy_session_count: 0,
      content_direct_mismatch_count: 0,
      backfill_gap_count: 0,
      compatibility_direct_only_write_count: 0,
      compatibility_pair_mismatch_count: 0,
      remote_writes: 0,
    };

    expect(() =>
      verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult(
        validResult,
      ),
    ).not.toThrow();
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult({
        ...validResult,
        compatibility_direct_only_write_count: 1,
      }),
    ).not.toThrow();

    for (const invalidResult of [
      { ...validResult, remote_writes: 1 },
      { ...validResult, missing_table_count: 1 },
      { ...validResult, column_drift_count: 1 },
      { ...validResult, fk_missing_count: 1 },
      { ...validResult, unique_drift_count: 1 },
      { ...validResult, check_missing_count: 1 },
      { ...validResult, trigger_drift_count: 1 },
      { ...validResult, acl_missing_count: 1 },
      { ...validResult, acl_inventory_status: "drift" },
      { ...validResult, function_inventory_status: "drift" },
      { ...validResult, unexpected_function_count: 1 },
      { ...validResult, function_drift_count: 1 },
      { ...validResult, table_inventory_digest: "not-a-digest" },
      {
        ...validResult,
        raw_uuid: "10000000-0000-4000-8000-000000000001",
      },
    ]) {
      expect(() =>
        verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult(
          invalidResult,
        ),
      ).toThrow(/remote recipe snapshot authority verification failed/i);
    }
  });

  it("keeps the CLI secret-safe and dry-run gated", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-remote.mjs",
      "utf8",
    );
    const hybridCli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-hybrid.mjs",
      "utf8",
    );

    expect(cli).toContain("buildRecipeSnapshotAuthorityRemotePsqlRequest");
    expect(cli).toContain(
      "parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment",
    );
    expect(cli).toContain("resolveSecurityFunctionLinkedRoot");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain("--dry-run");
    expect(cli).toContain('"--no-replace-objects"');
    expect(cli).toContain('"merge-base"');
    expect(hybridCli).toContain('"--no-replace-objects"');
    expect(hybridCli).toContain('"merge-base"');
    expect(cli).not.toContain("PGOPTIONS");
    expect(cli).not.toMatch(/process\.stdout\.write\([^\n]*PGPASSWORD/u);
  });
});
