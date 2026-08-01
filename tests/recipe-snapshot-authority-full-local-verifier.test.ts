import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertRecipeSnapshotAuthorityFullLocalExecutionEvidence,
  assertRecipeSnapshotAuthorityFullLocalResult,
  buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildRecipeSnapshotAuthorityFullLocalSummary,
  buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
} from "../scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs";

const sourceMergeSha = "a".repeat(40);

const snapshotResult = {
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

const localResult = {
  ...snapshotResult,
  authority_target_status: "self-hosted-local-auth-db-storage-single-authority",
  local_control_row_count: 1,
  local_control_shape_drift_count: 0,
  stable_auth_uuid_drift_count: 0,
  local_session_binding_shape_drift_count: 0,
  local_session_revocation_function_missing_count: 0,
  auth_uid_rls_policy_missing_count: 0,
  request_authority_function_missing_count: 0,
  account_cleanup_function_missing_count: 0,
  owner_null_shared_snapshot_count: 2,
  remote_application_writes: 0,
};

const expectedChecks = [
  "snapshot-unit-security-readers-account-delete",
  "snapshot-postgres-existing-fresh-replay",
  "full-local-auth-session-runtime-request-authority",
  "full-local-storage-public-boundary-plan",
  "full-local-postgres-authority",
  "train-b-storage-outbox",
  "train-b-effective-ingredient",
] as const;

const manualOnlyPending = [
  "provider-live-callback-link",
  "cloudflare-public-edge",
  "remote-final-backup",
  "off-mac-restore-twice",
  "first-local-mutation-cutover",
  "compatibility-release-observation",
  "full-actual-db-cleanup-rehearsal",
] as const;

const executionEvidence = {
  source_merge_sha: sourceMergeSha,
  checks: Object.fromEntries(expectedChecks.map((check) => [check, "passed"])),
  manual_only: Object.fromEntries(
    manualOnlyPending.map((check) => [check, "pending"]),
  ),
  production_writes: 0,
  staging_writes: 0,
  remote_application_writes: 0,
};

function currentAccountCleanupSource() {
  const migration = readFileSync(
    "supabase/migrations/20260731111000_product_ingredient_link_account_cleanup.sql",
    "utf8",
  );
  const functionStart = migration.indexOf(
    "create or replace function public.delete_user_private_data",
  );
  const bodyStartMarker = "as $$";
  const bodyStart = migration.indexOf(bodyStartMarker, functionStart);
  const bodyEnd = migration.indexOf("\n$$;", bodyStart);
  return migration.slice(bodyStart + bodyStartMarker.length, bodyEnd)
    .replace(/^\n|\n$/gu, "");
}

describe("recipe snapshot authority full-local verifier", () => {
  it("builds one fail-closed full-local read-only plan", () => {
    const plan = buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
      mode: "post-merge-full-local-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      productionWrites: 0,
      stagingWrites: 0,
      remoteApplicationWrites: 0,
    });
    expect(plan.requiredChecks.map((check) => check.id)).toEqual(expectedChecks);
    expect(plan.manualOnlyPending).toEqual(manualOnlyPending);
    expect(plan.sql).toContain("recipe_content_snapshots");
    expect(plan.sql).toContain("full_local_auth_control");
    expect(plan.sql).toContain("control.authority is distinct from 'local'");
    expect(plan.sql).toContain("control.local_issuer is null");
    expect(plan.sql).toContain(
      "control.local_issuer !~ '^https://[^/?#]+/auth/v1$'",
    );
    expect(plan.sql).toContain("user_session_generation_bindings");
    expect(plan.sql).toContain("auth.users");
    expect(plan.sql).toContain("pg_policies");
    expect(plan.sql).toContain(
      "public.revoke_full_local_session_authority(text,uuid,text,integer)",
    );
    const cleanupHash = createHash("md5")
      .update(currentAccountCleanupSource())
      .digest("hex");
    expect(plan.sql).toContain(cleanupHash);
    expect(plan.sql).not.toContain("fd9116a5fd1c58066d73b01e30220850");
    expect(plan.sql).toContain("authority_target_status");
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
    );
    expect(() =>
      buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
        mode: "post-merge-read-only",
      }),
    ).toThrow(/unsupported recipe snapshot authority full-local verification mode/i);
  });

  it("pins the current local cleanup function and its exact private dependency order", () => {
    const cleanup = currentAccountCleanupSource();
    const orderedFragments = [
      "recipe_snapshot_account_cleanup_guard",
      "delete from public.cooking_session_meal_claims",
      "delete from public.cooking_session_meals",
      "delete from public.cooking_sessions",
      "delete from public.meals",
      "delete from public.leftover_dishes",
      "delete from public.recipe_content_snapshots",
      "delete from public.recipe_nutrition_snapshots",
      "delete from public.recipes",
      "delete from public.pantry_items",
      "delete from public.shopping_list_items",
      "delete from public.product_planner_entries",
      "private product references remain",
      "delete from public.food_products",
      "delete from public.nutrition_profiles",
      "delete from public.users",
    ];
    let cursor = -1;
    for (const fragment of orderedFragments) {
      const next = cleanup.indexOf(fragment, cursor + 1);
      expect(next, fragment).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(cleanup).toContain("owner_user_id is null public/shared");
  });

  it("accepts only an explicit loopback database and strips inherited PG settings", () => {
    const request = buildRecipeSnapshotAuthorityFullLocalPsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        HOME: "/tmp/homecook",
        PGHOST: "poison",
        PGOPTIONS: "-c statement_timeout=1",
        PGSERVICE: "poison",
      },
      databaseUrl: "postgresql://postgres:local-secret@127.0.0.1:54322/postgres",
      planSql: "with safe as (select 1) select * from safe",
    });

    expect(request.args).toEqual(["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
    expect(request.environment).toEqual({
      PATH: "/usr/bin:/bin",
      HOME: "/tmp/homecook",
      PGHOST: "127.0.0.1",
      PGPORT: "54322",
      PGUSER: "postgres",
      PGPASSWORD: "local-secret",
      PGDATABASE: "postgres",
      PGSSLMODE: "disable",
    });
    expect(request.input).toContain("transaction isolation level read committed read only");
    expect(request.input).not.toContain("local-secret");

    for (const databaseUrl of [
      "postgresql://postgres:secret@db.example.supabase.co/postgres",
      "postgresql://postgres:secret@127.0.0.1/postgres?sslmode=require",
      "postgresql://postgres@127.0.0.1/postgres",
    ]) {
      expect(() =>
        buildRecipeSnapshotAuthorityFullLocalPsqlRequest({
          databaseUrl,
          planSql: "select 1",
        }),
      ).toThrow(/loopback local full-local database/i);
    }
  });

  it("requires the snapshot and full-local DB authority inventory together", () => {
    expect(() =>
      assertRecipeSnapshotAuthorityFullLocalResult(localResult),
    ).not.toThrow();

    for (const [field, value] of [
      ["missing_table_count", 1],
      ["local_control_row_count", 0],
      ["local_control_shape_drift_count", 1],
      ["stable_auth_uuid_drift_count", 1],
      ["local_session_binding_shape_drift_count", 1],
      ["local_session_revocation_function_missing_count", 1],
      ["auth_uid_rls_policy_missing_count", 1],
      ["request_authority_function_missing_count", 1],
      ["account_cleanup_function_missing_count", 1],
      ["remote_application_writes", 1],
    ] as const) {
      expect(() =>
        assertRecipeSnapshotAuthorityFullLocalResult({
          ...localResult,
          [field]: value,
        }),
      ).toThrow(/full-local verification failed closed/i);
    }
  });

  it("requires every automated check passed and every live operation pending", () => {
    expect(() =>
      assertRecipeSnapshotAuthorityFullLocalExecutionEvidence(executionEvidence),
    ).not.toThrow();

    for (const evidence of [
      {
        ...executionEvidence,
        checks: { ...executionEvidence.checks, "train-b-storage-outbox": "skipped" },
      },
      {
        ...executionEvidence,
        manual_only: {
          ...executionEvidence.manual_only,
          "off-mac-restore-twice": "passed",
        },
      },
      { ...executionEvidence, production_writes: 1 },
      { ...executionEvidence, operator_email: "must-not-appear@example.com" },
      { ...executionEvidence, raw_provider_row: "secret" },
    ]) {
      expect(() =>
        assertRecipeSnapshotAuthorityFullLocalExecutionEvidence(evidence),
      ).toThrow(/execution evidence failed closed/i);
    }
  });

  it("returns a secret-safe exact-SHA summary without claiming Manual Only completion", () => {
    const summary = buildRecipeSnapshotAuthorityFullLocalSummary({
      mergeSha: sourceMergeSha,
      localResult,
      executionEvidence,
    });

    expect(summary).toEqual({
      ok: true,
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      merge_sha: sourceMergeSha,
      snapshot_authority_status: "ready",
      full_local_db_authority_status: "ready",
      automated_check_count: expectedChecks.length,
      manual_only_status: "pending",
      manual_only_pending: manualOnlyPending,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("local-secret");
    expect(() =>
      buildRecipeSnapshotAuthorityFullLocalSummary({
        mergeSha: "b".repeat(40),
        localResult,
        executionEvidence,
      }),
    ).toThrow(/exact merge SHA/i);
  });

  it("wires the CLI and package script to no-replace exact ancestry and active gates", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-full-local.mjs",
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(cli).toContain("--no-replace-objects");
    expect(cli).toContain("merge-base");
    expect(cli).toContain("--is-ancestor");
    expect(cli).toContain("--untracked-files=all");
    expect(cli).toContain("RECIPE_SNAPSHOT_AUTHORITY_FULL_LOCAL_DATABASE_URL");
    expect(cli).not.toContain("RECIPE_SNAPSHOT_AUTHORITY_REMOTE_DATABASE_URL");
    expect(packageJson.scripts["verify:recipe-snapshot-authority:full-local"]).toBe(
      "node scripts/verify-recipe-snapshot-authority-full-local.mjs --mode post-merge-full-local-read-only",
    );
  });

  it("locks official S3/rclone restore planning and app-plus-Auth-only exposure", () => {
    const plan = readFileSync(
      "docs/engineering/full-local-supabase-production-plan.md",
      "utf8",
    );
    const proxy = readFileSync(
      "infra/full-local-supabase/auth-only-proxy.mjs",
      "utf8",
    );
    const compose = readFileSync(
      "infra/full-local-supabase/docker-compose.production.yml",
      "utf8",
    );

    expect(plan).toContain("pinned `rclone`");
    expect(plan).toContain("provider=Other");
    expect(plan).toContain("https://<project-ref>.supabase.co/storage/v1/s3");
    expect(plan).toContain(
      "http://127.0.0.1:<local-gateway-port>/storage/v1/s3",
    );
    expect(plan).toContain(
      "hosted Storage를 Docker volume이나 파일 경로로 직접 복사하지 않는다",
    );
    expect(proxy).toContain('/auth/v1/');
    expect(proxy).not.toContain('pathname.startsWith("/rest/v1/")');
    expect(proxy).not.toContain('pathname.startsWith("/storage/v1/")');
    expect(compose).not.toMatch(/published:\s*(?:5432|54321|54323|8000)/u);
  });
});
