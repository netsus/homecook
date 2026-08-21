import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertRecipeSnapshotAuthorityFullLocalExecutionEvidence,
  assertRecipeSnapshotAuthorityFullLocalResult,
  buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildRecipeSnapshotAuthorityFullLocalSummary,
  buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
} from "../scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs";
import * as fullLocalVerifier from
  "../scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs";

const sourceMergeSha = "a".repeat(40);

const fullLocalPolicyExpressionInventory = [
  {
    schema: "public", table: "recipes", name: "recipes_public_and_owner_read",
    using: "deleted_at is null and recipe_visibility_guard.is_owner_publicly_visible(created_by) and (visibility = 'public' or auth.uid() = created_by)", check: "",
  },
  {
    schema: "public", table: "recipe_sources", name: "recipe_sources_parent_read",
    using: "exists (select 1 from public.recipes as recipe where recipe.id = recipe_sources.recipe_id)", check: "",
  },
  {
    schema: "public", table: "recipe_ingredients", name: "recipe_ingredients_parent_read",
    using: "exists (select 1 from public.recipes as recipe where recipe.id = recipe_ingredients.recipe_id)", check: "",
  },
  {
    schema: "public", table: "recipe_steps", name: "recipe_steps_parent_read",
    using: "exists (select 1 from public.recipes as recipe where recipe.id = recipe_steps.recipe_id)", check: "",
  },
  {
    schema: "public", table: "recipe_step_cooking_methods", name: "recipe_step_cooking_methods_parent_read",
    using: "exists (select 1 from public.recipe_steps as step join public.recipes as recipe on recipe.id = step.recipe_id where step.id = recipe_step_cooking_methods.step_id)", check: "",
  },
  {
    schema: "public", table: "recipe_tags", name: "recipe_tags_parent_read",
    using: "visibility = 'public' and review_status = 'approved' and exists (select 1 from public.recipes as recipe where recipe.id = recipe_tags.recipe_id)", check: "",
  },
  {
    schema: "public", table: "tags", name: "tags_public_read",
    using: "is_system = true or exists (select 1 from public.recipe_tags as recipe_tag join public.recipes as recipe on recipe.id = recipe_tag.recipe_id where recipe_tag.tag_id = tags.id and recipe_tag.visibility = 'public' and recipe_tag.review_status = 'approved')", check: "",
  },
  {
    schema: "public", table: "leftover_dishes", name: "leftover_dishes_select_own",
    using: "auth.uid() = user_id", check: "",
  },
  {
    schema: "public", table: "leftover_dishes", name: "leftover_dishes_update_own",
    using: "auth.uid() = user_id", check: "auth.uid() = user_id",
  },
  {
    schema: "public", table: "recipe_content_snapshots", name: "recipe_content_snapshots_authenticated_read",
    using: "owner_user_id is null or auth.uid() = owner_user_id", check: "",
  },
  {
    schema: "public", table: "recipe_nutrition_snapshots", name: "recipe_nutrition_snapshots_authenticated_read",
    using: "owner_user_id is null or auth.uid() = owner_user_id", check: "",
  },
];

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
  full_local_security_inventory: {
    required_function_count: 35,
    function_missing_count: 0,
    function_source_drift_count: 0,
    function_security_drift_count: 0,
    function_owner_drift_count: 0,
    function_search_path_drift_count: 0,
    function_acl_drift_count: 0,
    unexpected_function_overload_count: 0,
    required_role_count: 4,
    role_missing_count: 0,
    role_attribute_drift_count: 0,
    required_role_membership_count: 2,
    role_membership_missing_count: 0,
    role_membership_drift_count: 0,
    unexpected_role_membership_count: 0,
    required_rls_table_count: 12,
    rls_table_missing_count: 0,
    rls_disabled_count: 0,
    rls_owner_drift_count: 0,
    rls_force_drift_count: 0,
    required_snapshot_table_acl_count: 2,
    snapshot_table_acl_missing_count: 0,
    snapshot_table_acl_drift_count: 0,
    _snapshot_table_acl_inventory: [
      {
        schema: "public",
        table: "recipe_content_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
      {
        schema: "public",
        table: "recipe_nutrition_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
    ],
    required_policy_count: 11,
    policy_missing_count: 0,
    policy_drift_count: 0,
    unexpected_policy_count: 0,
    _policy_expression_inventory: fullLocalPolicyExpressionInventory,
  },
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
  it("requires both application authority environment controls to be exactly local", () => {
    const assertEnvironment = (
      fullLocalVerifier as Record<string, unknown>
    ).assertRecipeSnapshotAuthorityFullLocalEnvironment as
      | ((environment: Record<string, string | undefined>) => void)
      | undefined;

    expect(assertEnvironment).toBeTypeOf("function");
    expect(() => assertEnvironment?.({
      HOMECOOK_AUTH_AUTHORITY: "local",
      HOMECOOK_DATA_AUTHORITY: "local",
    })).not.toThrow();

    for (const environment of [
      { HOMECOOK_AUTH_AUTHORITY: "remote", HOMECOOK_DATA_AUTHORITY: "local" },
      { HOMECOOK_AUTH_AUTHORITY: "local", HOMECOOK_DATA_AUTHORITY: "remote" },
      { HOMECOOK_DATA_AUTHORITY: "local" },
      { HOMECOOK_AUTH_AUTHORITY: "local" },
      {},
      { HOMECOOK_AUTH_AUTHORITY: "local-shadow", HOMECOOK_DATA_AUTHORITY: "local" },
      { HOMECOOK_AUTH_AUTHORITY: "local", HOMECOOK_DATA_AUTHORITY: "local-shadow" },
      { HOMECOOK_AUTH_AUTHORITY: "locla", HOMECOOK_DATA_AUTHORITY: "local" },
    ]) {
      expect(() => assertEnvironment?.(environment)).toThrow(
        /full-local application authority environment is not active/i,
      );
    }

    try {
      assertEnvironment?.({
        HOMECOOK_AUTH_AUTHORITY: "sensitive-authority-value",
        HOMECOOK_DATA_AUTHORITY: "local",
      });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-authority-value");
    }

    const cli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-full-local.mjs",
      "utf8",
    );
    const runner = readFileSync(
      "scripts/lib/full-local-verification-cli-runner.mjs",
      "utf8",
    );
    expect(cli.indexOf("assertRecipeSnapshotAuthorityFullLocalEnvironment"))
      .toBeGreaterThanOrEqual(0);
    expect(runner.indexOf("assertEnvironment(environment)"))
      .toBeLessThan(runner.indexOf("if (dryRun)"));
  });

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
    expect(plan.sql).toContain("pg_catalog.aclexplode");
    expect(plan.sql).toContain("pg_catalog.pg_auth_members");
    expect(plan.sql).toContain("membership_catalog_support.has_set_option");
    expect(plan.sql).toContain("role.rolbypassrls");
    expect(plan.sql).toContain("relation.relrowsecurity");
    expect(plan.sql).toContain("unexpected_function_overload_count");
    expect(plan.sql).toContain("function_source_drift_count");
    expect(plan.sql).toContain(
      "public.revoke_full_local_session_authority(text,uuid,text,integer)",
    );
    expect(plan.sql).toContain(
      "public.backfill_meal_recipe_content_snapshots()",
    );
    const cleanupHash = createHash("md5")
      .update(currentAccountCleanupSource())
      .digest("hex");
    expect(plan.sql).toContain(cleanupHash);
    expect(plan.sql).not.toContain("fd9116a5fd1c58066d73b01e30220850");
    expect(plan.sql).toContain("authority_target_status");
    expect(plan.sql.replace(/'(?:''|[^'])*'/gu, "''")).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
    );
    expect(() =>
      buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
        mode: "post-merge-read-only",
      }),
    ).toThrow(/unsupported recipe snapshot authority full-local verification mode/i);
  });

  it("keeps the full-local membership inventory compatible with PG15 catalogs", () => {
    const plan = buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
      mode: "post-merge-full-local-read-only",
    });

    expect(plan.sql).toContain("'pg_catalog.pg_auth_members'::regclass");
    expect(plan.sql).toContain("attname = 'inherit_option'");
    expect(plan.sql).toContain("attname = 'set_option'");
    expect(plan.sql).toContain("membership_catalog_support.has_inherit_option");
    expect(plan.sql).toContain("membership_catalog_support.has_set_option");
    expect(plan.sql).toContain("pg_catalog.to_jsonb(membership) ->> 'inherit_option'");
    expect(plan.sql).toContain("pg_catalog.to_jsonb(membership) ->> 'set_option'");
    expect(plan.sql).toContain("member_role.rolinherit");
    expect(plan.sql).toContain("else true");
    expect(plan.sql).not.toContain("membership.inherit_option");
    expect(plan.sql).not.toContain("membership.set_option");
  });

  it("propagates personal and future inventory opts into the full-local plan when the env requests them", async () => {
    const previousTargetMigration =
      process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION;
    const previousPersonalFlag =
      process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS;
    const previousFutureFlag =
      process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS;
    process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION =
      "supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql";
    process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS = "1";
    process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS = "1";

    try {
      const moduleUrl =
        `${pathToFileURL(resolve(
          "scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs",
        )).href}?opts=${Date.now()}`;
      const verifier = await import(
        /* @vite-ignore */ moduleUrl
      );
      const plan = verifier.buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
        mode: "post-merge-full-local-read-only",
      });

      expect(plan.sql).toContain(
        "public.write_personal_recipe_core(uuid, timestamp with time zone, text, integer, timestamp with time zone, text, uuid, uuid, bigint, jsonb, jsonb, jsonb, uuid, bigint, uuid, timestamp with time zone)",
      );
      expect(plan.sql).toContain(
        "public.protect_meal_recipe_content_pin_with_future_propagation()",
      );
      expect(plan.sql).toContain(
        "cooking_sessions_contract_namespace_check",
      );
    } finally {
      if (previousTargetMigration === undefined) {
        delete process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION;
      } else {
        process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION =
          previousTargetMigration;
      }
      if (previousPersonalFlag === undefined) {
        delete process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS;
      } else {
        process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS =
          previousPersonalFlag;
      }
      if (previousFutureFlag === undefined) {
        delete process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS;
      } else {
        process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS =
          previousFutureFlag;
      }
    }
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
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        function_source_drift_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        function_acl_drift_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        role_attribute_drift_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        unexpected_role_membership_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        rls_owner_drift_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        rls_force_drift_count: 1,
      }],
      ["full_local_security_inventory", {
        ...localResult.full_local_security_inventory,
        _policy_expression_inventory:
          fullLocalPolicyExpressionInventory.map((policy) =>
            policy.name === "recipes_public_and_owner_read"
              ? {
                  ...policy,
                  using: "(deleted_at is null and recipe_visibility_guard.is_owner_publicly_visible(created_by) and visibility = 'public') or auth.uid() = created_by",
                }
              : policy
          ),
      }],
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

  it.each([
    ["uppercase visibility", "visibility = 'PUBLIC'"],
    ["spaced visibility", "visibility = 'p u b l i c'"],
    ["uppercase review status", "review_status = 'APPROVED'"],
    ["doubled-quote literal", "visibility = 'pub''lic'"],
    ["escape-string literal", String.raw`visibility = E'pub\'lic'`],
    [
      "dollar-quoted literal",
      "visibility = $$public. ::text (AND OR) as  $$",
    ],
    [
      "literal containing normalizer tokens",
      "visibility = 'public. ::text (AND OR) as  '",
    ],
    ["quoted identifier", `"visibility" = 'public'`],
    ["dollar-bearing identifier", "visibility$or = 'public'"],
  ])("rejects %s lexical drift in the production assertion", (_name, literal) => {
    const mutatedInventory = fullLocalPolicyExpressionInventory.map((policy) => {
      if (literal.startsWith("review_status")) {
        return policy.name === "recipe_tags_parent_read"
          ? {
              ...policy,
              using: policy.using.replace(
                "review_status = 'approved'",
                literal,
              ),
            }
          : policy;
      }
      return policy.name === "recipes_public_and_owner_read"
        ? {
            ...policy,
            using: policy.using.replace("visibility = 'public'", literal),
          }
        : policy;
    });

    expect(() =>
      assertRecipeSnapshotAuthorityFullLocalResult({
        ...localResult,
        full_local_security_inventory: {
          ...localResult.full_local_security_inventory,
          _policy_expression_inventory: mutatedInventory,
        },
      })
    ).toThrow(/full-local verification failed closed/i);
  });

  it("accepts only unquoted case, whitespace and PostgreSQL text-cast noise", () => {
    const deparsedInventory = fullLocalPolicyExpressionInventory.map((policy) =>
      policy.name === "recipes_public_and_owner_read"
        ? {
            ...policy,
            using: `
              (DELETED_AT IS NULL)
              AND recipe_visibility_guard.is_owner_publicly_visible(created_by)
              AND ((visibility = 'public'::text) OR (auth.uid() = created_by))
            `,
          }
        : policy
    );

    expect(() =>
      assertRecipeSnapshotAuthorityFullLocalResult({
        ...localResult,
        full_local_security_inventory: {
          ...localResult.full_local_security_inventory,
          _policy_expression_inventory: deparsedInventory,
        },
      })
    ).not.toThrow();
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
    const runner = readFileSync(
      "scripts/lib/full-local-verification-cli-runner.mjs",
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(runner).toContain("--no-replace-objects");
    expect(runner).toContain("merge-base");
    expect(runner).toContain("--is-ancestor");
    expect(runner).toContain("--untracked-files=all");
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
