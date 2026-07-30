import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertRecipeSnapshotAuthorityHybridLocalResult,
  assertRecipeSnapshotAuthorityRemoteAuthEvidence,
  buildRecipeSnapshotAuthorityHybridLocalPsqlRequest,
  buildRecipeSnapshotAuthorityHybridSummary,
  buildRecipeSnapshotAuthorityHybridVerificationPlan,
} from "../scripts/lib/recipe-snapshot-authority-hybrid-verifier.mjs";

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

const remoteAuthEvidence = {
  evidence_scope_status: "remote-auth-control-plane-read-only",
  source_merge_sha: "a".repeat(40),
  evidence_digest: "b".repeat(64),
  observed_at: "2026-07-30T06:00:00.000Z",
  active_epoch_count: 2,
  active_binding_count: 3,
  active_epoch_without_binding_count: 0,
  epoch_binding_mismatch_count: 0,
  expired_binding_count: 0,
  terminal_deletion_count: 1,
  terminal_readback_mismatch_count: 0,
  mirror_terminal_mismatch_count: 0,
  remote_application_writes: 0,
};

describe("recipe snapshot authority hybrid verifier", () => {
  it("builds one local read-only plan with the local auth.users zero guard", () => {
    const plan = buildRecipeSnapshotAuthorityHybridVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      target: "local-application-db",
    });
    expect(plan.sql).toContain("recipe_content_snapshots");
    expect(plan.sql).toContain("local_auth_user_count");
    expect(plan.sql).toContain("from auth.users");
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
    );
    expect(() =>
      buildRecipeSnapshotAuthorityHybridVerificationPlan({ mode: "remote" }),
    ).toThrow(/unsupported recipe snapshot authority hybrid verification mode/i);
  });

  it("requires zero local auth users without weakening snapshot inventory checks", () => {
    expect(() =>
      assertRecipeSnapshotAuthorityHybridLocalResult({
        ...snapshotResult,
        local_auth_user_count: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertRecipeSnapshotAuthorityHybridLocalResult({
        ...snapshotResult,
        local_auth_user_count: 1,
      }),
    ).toThrow(/local auth.users=0/i);
    expect(() =>
      assertRecipeSnapshotAuthorityHybridLocalResult({
        ...snapshotResult,
        local_auth_user_count: 0,
        missing_table_count: 1,
      }),
    ).toThrow(/snapshot authority verification failed/i);
  });

  it("fails closed when authority mismatch or backfill telemetry is nonzero", () => {
    for (const field of [
      "content_direct_mismatch_count",
      "backfill_gap_count",
      "compatibility_pair_mismatch_count",
    ] as const) {
      expect(() =>
        assertRecipeSnapshotAuthorityHybridLocalResult({
          ...snapshotResult,
          local_auth_user_count: 0,
          [field]: 1,
        }),
      ).toThrow(/snapshot authority verification failed/i);
    }
  });

  it("reports historical direct-only inventory without treating it as release-window write evidence", () => {
    expect(() =>
      assertRecipeSnapshotAuthorityHybridLocalResult({
        ...snapshotResult,
        local_auth_user_count: 0,
        compatibility_direct_only_write_count: 1,
      }),
    ).not.toThrow();
  });

  it("accepts fresh aggregate Auth evidence with exact epoch coverage and multiple session bindings", () => {
    expect(() =>
      assertRecipeSnapshotAuthorityRemoteAuthEvidence(remoteAuthEvidence, {
        now: new Date("2026-07-30T06:05:00.000Z"),
      }),
    ).not.toThrow();

    for (const evidence of [
      { ...remoteAuthEvidence, active_binding_count: 1 },
      { ...remoteAuthEvidence, active_epoch_without_binding_count: 1 },
      { ...remoteAuthEvidence, epoch_binding_mismatch_count: 1 },
      { ...remoteAuthEvidence, expired_binding_count: 1 },
      { ...remoteAuthEvidence, terminal_readback_mismatch_count: 1 },
      { ...remoteAuthEvidence, mirror_terminal_mismatch_count: 1 },
      { ...remoteAuthEvidence, remote_application_writes: 1 },
      { ...remoteAuthEvidence, observed_at: "2026-07-29T00:00:00.000Z" },
      { ...remoteAuthEvidence, email: "must-not-appear@example.com" },
      { ...remoteAuthEvidence, raw_session_id: "secret" },
    ]) {
      expect(() =>
        assertRecipeSnapshotAuthorityRemoteAuthEvidence(evidence, {
          now: new Date("2026-07-30T06:05:00.000Z"),
        }),
      ).toThrow(/remote Auth control-plane evidence failed/i);
    }
  });

  it("returns a secret-safe zero-write summary", () => {
    const summary = buildRecipeSnapshotAuthorityHybridSummary({
      mergeSha: "a".repeat(40),
      localResult: { ...snapshotResult, local_auth_user_count: 0 },
      remoteAuthEvidence,
      now: new Date("2026-07-30T06:05:00.000Z"),
    });

    expect(summary).toEqual({
      ok: true,
      mode: "post-merge-read-only",
      merge_sha: "a".repeat(40),
      local_application_db_status: "ready",
      local_auth_user_count: 0,
      remote_auth_control_plane_status: "ready",
      active_epoch_count: 2,
      active_binding_count: 3,
      terminal_deletion_count: 1,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("example.com");
    expect(JSON.stringify(summary)).not.toContain(remoteAuthEvidence.evidence_digest);
  });

  it("binds remote Auth evidence to the exact merge SHA under verification", () => {
    expect(() =>
      buildRecipeSnapshotAuthorityHybridSummary({
        mergeSha: "c".repeat(40),
        localResult: { ...snapshotResult, local_auth_user_count: 0 },
        remoteAuthEvidence: {
          ...remoteAuthEvidence,
          source_merge_sha: "d".repeat(40),
        },
        now: new Date("2026-07-30T06:05:00.000Z"),
      }),
    ).toThrow(/exact merge SHA/i);
  });

  it("accepts only an explicit loopback local database and strips poisoned PG settings", () => {
    const request = buildRecipeSnapshotAuthorityHybridLocalPsqlRequest({
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
    expect(() =>
      buildRecipeSnapshotAuthorityHybridLocalPsqlRequest({
        databaseUrl: "postgresql://postgres:secret@[::1]:54322/postgres",
        planSql: "select 1",
      }),
    ).not.toThrow();
    expect(() =>
      buildRecipeSnapshotAuthorityHybridLocalPsqlRequest({
        databaseUrl: "postgresql://postgres:secret@db.example.supabase.co/postgres",
        planSql: "select 1",
      }),
    ).toThrow(/loopback local application database/i);
  });

  it("keeps the CLI on local Data plus sanitized Auth evidence without linked remote DB access", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-hybrid.mjs",
      "utf8",
    );

    expect(cli).toContain("RECIPE_SNAPSHOT_AUTHORITY_LOCAL_DATABASE_URL");
    expect(cli).toContain("--remote-auth-evidence");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain("buildRecipeSnapshotAuthorityHybridSummary");
    expect(cli).not.toContain("supabase db dump");
    expect(cli).not.toContain("--linked");
    expect(cli).not.toContain("resolveSecurityFunctionLinkedRoot");
    expect(cli).not.toMatch(/console\.(?:log|error)\([^)]*(?:databaseUrl|evidence)\b/u);
  });
});
