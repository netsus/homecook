import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const localResult = {
  verification_scope_status: "post-merge-read-only",
  schema_inventory_status: "ready",
  acl_inventory_status: "ready",
  function_inventory_status: "ready",
  link_authority_status: "ready",
  remote_write_status: "zero",
  storage_dependency_status: "no-storage-dependency-detected",
  required_table_count: 1,
  missing_table_count: 0,
  required_column_count: 13,
  column_missing_count: 0,
  column_drift_count: 0,
  required_fk_count: 2,
  fk_missing_count: 0,
  fk_drift_count: 0,
  required_unique_count: 1,
  unique_missing_count: 0,
  unique_drift_count: 0,
  required_check_count: 9,
  check_missing_count: 0,
  check_drift_count: 0,
  required_acl_count: 6,
  acl_missing_count: 0,
  acl_drift_count: 0,
  required_function_count: 3,
  function_missing_count: 0,
  function_source_drift_count: 0,
  function_security_drift_count: 0,
  function_search_path_drift_count: 0,
  function_acl_drift_count: 0,
  unexpected_function_count: 0,
  function_drift_count: 0,
  protected_visibility_gap_count: 0,
  local_storage_dependency_count: 0,
  remote_writes: 0,
  local_auth_user_count: 0,
};

const remoteAuthEvidence = {
  evidence_scope_status: "remote-auth-control-plane-read-only",
  source_merge_sha: "a".repeat(40),
  evidence_digest: "b".repeat(64),
  observed_at: "2026-07-30T11:45:00.000Z",
  active_epoch_count: 2,
  active_binding_count: 2,
  active_epoch_without_binding_count: 0,
  epoch_binding_mismatch_count: 0,
  expired_binding_count: 0,
  terminal_deletion_count: 0,
  terminal_readback_mismatch_count: 0,
  mirror_terminal_mismatch_count: 0,
  remote_application_writes: 0,
};

describe("product ingredient link hybrid verifier", () => {
  it("builds one local read-only plan with the local auth.users zero guard", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    const plan = verifier.buildProductIngredientLinkHybridVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      target: "local-application-db-and-storage",
      remoteAuthEvidenceRequired: true,
    });
    expect(plan.sql).toContain("food_product_ingredient_links");
    expect(plan.sql).toContain("local_auth_user_count");
    expect(plan.sql).toContain("from auth.users");
    expect(plan.sql).toContain("select_food_product_effective_ingredient");
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
    );
    expect(() =>
      verifier.buildProductIngredientLinkHybridVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow(/unsupported product ingredient link hybrid verification mode/i);
  });

  it("requires zero local auth users without weakening additive authority checks", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    expect(() =>
      verifier.assertProductIngredientLinkHybridLocalResult(localResult),
    ).not.toThrow();
    expect(() =>
      verifier.assertProductIngredientLinkHybridLocalResult({
        ...localResult,
        local_auth_user_count: 1,
      }),
    ).toThrow(/local auth.users=0/i);
    expect(() =>
      verifier.assertProductIngredientLinkHybridLocalResult({
        ...localResult,
        fk_missing_count: 1,
      }),
    ).toThrow(/product ingredient link verification failed/i);
  });

  it("accepts an exact merged SHA after origin/master advances and requires a clean tracked tree", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    expect(
      verifier.assertProductIngredientLinkMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        isAncestorOfOriginMaster: true,
        trackedStatus: "",
      }),
    ).toBe("a".repeat(40));
    expect(() =>
      verifier.assertProductIngredientLinkMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        isAncestorOfOriginMaster: false,
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to be merged into origin\/master/i);
    expect(() =>
      verifier.assertProductIngredientLinkMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        isAncestorOfOriginMaster: true,
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
  });

  it("accepts only fresh exact-epoch remote Auth evidence with zero remote writes", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    expect(() =>
      verifier.assertProductIngredientLinkRemoteAuthEvidence(remoteAuthEvidence, {
        now: new Date("2026-07-30T11:50:00.000Z"),
      }),
    ).not.toThrow();

    for (const evidence of [
      { ...remoteAuthEvidence, active_epoch_without_binding_count: 1 },
      { ...remoteAuthEvidence, epoch_binding_mismatch_count: 1 },
      { ...remoteAuthEvidence, expired_binding_count: 1 },
      { ...remoteAuthEvidence, remote_application_writes: 1 },
      { ...remoteAuthEvidence, observed_at: "2026-07-29T00:00:00.000Z" },
      { ...remoteAuthEvidence, raw_session_id: "secret" },
    ]) {
      expect(() =>
        verifier.assertProductIngredientLinkRemoteAuthEvidence(evidence, {
          now: new Date("2026-07-30T11:50:00.000Z"),
        }),
      ).toThrow(/remote Auth control-plane evidence failed/i);
    }
  });

  it("returns a secret-safe zero-write summary bound to the exact merge SHA", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    const summary = verifier.buildProductIngredientLinkHybridSummary({
      mergeSha: "a".repeat(40),
      localResult,
      remoteAuthEvidence,
      now: new Date("2026-07-30T11:50:00.000Z"),
    });

    expect(summary).toEqual({
      ok: true,
      mode: "post-merge-read-only",
      merge_sha: "a".repeat(40),
      local_application_db_status: "ready",
      local_auth_user_count: 0,
      local_application_storage_status: "no-storage-dependency-detected",
      local_storage_dependency_count: 0,
      remote_auth_control_plane_status: "ready",
      active_epoch_count: 2,
      active_binding_count: 2,
      terminal_deletion_count: 0,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
    expect(JSON.stringify(summary)).not.toContain(remoteAuthEvidence.evidence_digest);
    expect(() =>
      verifier.buildProductIngredientLinkHybridSummary({
        mergeSha: "c".repeat(40),
        localResult,
        remoteAuthEvidence: {
          ...remoteAuthEvidence,
          source_merge_sha: "d".repeat(40),
        },
        now: new Date("2026-07-30T11:50:00.000Z"),
      }),
    ).toThrow(/exact merge SHA/i);
  });

  it("accepts only a loopback local database and strips poisoned PG settings", async () => {
    const verifier = await import(
      "../scripts/lib/product-ingredient-link-hybrid-verifier.mjs"
    );

    const request = verifier.buildProductIngredientLinkHybridLocalPsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        HOME: "/tmp/homecook",
        PGHOST: "poison",
        PGOPTIONS: "-c statement_timeout=1",
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
      verifier.buildProductIngredientLinkHybridLocalPsqlRequest({
        databaseUrl: "postgresql://postgres:secret@db.example.supabase.co/postgres",
        planSql: "select 1",
      }),
    ).toThrow(/loopback local application database/i);
  });

  it("keeps the CLI on local Data plus sanitized Auth evidence without linked remote DB access", () => {
    const cli = readFileSync(
      "scripts/verify-product-ingredient-link-hybrid.mjs",
      "utf8",
    );

    expect(cli).toContain("PRODUCT_INGREDIENT_LINK_LOCAL_DATABASE_URL");
    expect(cli).toContain("--remote-auth-evidence");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain('"merge-base", "--is-ancestor"');
    expect(cli).toContain("buildProductIngredientLinkHybridSummary");
    expect(cli).not.toContain("supabase db dump");
    expect(cli).not.toContain("--linked");
    expect(cli).not.toMatch(/console\.(?:log|error)\([^)]*(?:databaseUrl|evidence)\b/u);
  });
});
