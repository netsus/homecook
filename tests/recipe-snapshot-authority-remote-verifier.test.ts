import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("recipe snapshot authority remote verifier", () => {
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

  it("rejects unknown modes and non-merged or dirty source trees", async () => {
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
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to equal origin\/master/i);
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
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

    expect(cli).toContain("buildRecipeSnapshotAuthorityRemotePsqlRequest");
    expect(cli).toContain(
      "parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment",
    );
    expect(cli).toContain("resolveSecurityFunctionLinkedRoot");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain("--dry-run");
    expect(cli).not.toContain("PGOPTIONS");
    expect(cli).not.toMatch(/process\.stdout\.write\([^\n]*PGPASSWORD/u);
  });
});
