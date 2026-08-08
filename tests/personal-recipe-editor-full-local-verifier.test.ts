import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPersonalRecipeEditorFullLocalEnvironment,
  assertPersonalRecipeEditorFullLocalExecutionEvidence,
  assertPersonalRecipeEditorFullLocalResult,
  assertPersonalRecipeEditorMergedExactSource,
  assertPersonalRecipeEditorSourceEvidence,
  buildPersonalRecipeEditorCheckEnvironment,
  buildPersonalRecipeEditorBoundaryChecks,
  buildPersonalRecipeEditorFullLocalPsqlRequest,
  buildPersonalRecipeEditorFullLocalSummary,
  buildPersonalRecipeEditorFullLocalVerificationPlan,
  collectPersonalRecipeEditorSourceEvidence,
} from "../scripts/lib/personal-recipe-editor-full-local-verifier.mjs";

const sourceMergeSha = "a".repeat(40);

const policyExpressionInventory = [
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

const storageOwnerPredicate = "bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text and account_generation_storage_guard.allows_legacy_recipe_image_write()";
const storagePolicyExpressionInventory = [
  {
    schema: "storage", table: "objects", name: "recipe_images_public_read",
    command: "SELECT", roles: "public", permissive: "PERMISSIVE",
    using: "bucket_id = 'recipe-images'", check: "",
  },
  {
    schema: "storage", table: "objects", name: "recipe_images_insert_own",
    command: "INSERT", roles: "authenticated", permissive: "PERMISSIVE",
    using: "", check: storageOwnerPredicate,
  },
  {
    schema: "storage", table: "objects", name: "recipe_images_update_own",
    command: "UPDATE", roles: "authenticated", permissive: "PERMISSIVE",
    using: storageOwnerPredicate, check: storageOwnerPredicate,
  },
  {
    schema: "storage", table: "objects", name: "recipe_images_delete_own",
    command: "DELETE", roles: "authenticated", permissive: "PERMISSIVE",
    using: storageOwnerPredicate, check: "",
  },
];

const fullLocalResult = {
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
  authority_target_status: "self-hosted-local-auth-db-storage-single-authority",
  local_control_row_count: 1,
  local_control_shape_drift_count: 0,
  stable_auth_uuid_drift_count: 0,
  local_session_binding_shape_drift_count: 0,
  full_local_security_inventory: {
    required_function_count: 32,
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
        schema: "public", table: "recipe_content_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
      {
        schema: "public", table: "recipe_nutrition_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
    ],
    required_policy_count: 11,
    policy_missing_count: 0,
    policy_drift_count: 0,
    unexpected_policy_count: 0,
    _policy_expression_inventory: policyExpressionInventory,
  },
  account_cleanup_function_missing_count: 0,
  owner_null_shared_snapshot_count: 2,
  remote_application_writes: 0,
  public_user_count: 3,
  auth_user_count: 3,
  auth_identity_count: 3,
  auth_identity_mapping_mismatch_count: 0,
  auth_session_row_count: 0,
  auth_refresh_token_row_count: 0,
  auth_flow_state_row_count: 0,
  storage_bucket_count: 2,
  storage_object_count: 1,
  private_storage_bucket_count: 1,
  private_storage_bucket_drift_count: 0,
  storage_objects_rls_disabled_count: 0,
  storage_policy_count: 4,
  storage_policy_drift_count: 0,
  unexpected_storage_policy_count: 0,
  unexpected_storage_mutation_grant_count: 0,
  _storage_policy_expression_inventory: storagePolicyExpressionInventory,
  image_registry_acl_drift_count: 0,
  private_storage_object_count: 1,
  private_storage_object_registry_mismatch_count: 0,
  private_image_registry_shape_drift_count: 0,
  private_image_registry_active_object_mismatch_count: 0,
};

const sourceEvidence = {
  app_surface_personal_editor_marker_count: 0,
  browser_direct_data_mutation_count: 0,
  browser_direct_storage_path_count: 0,
  browser_raw_rest_mutation_count: 0,
  capability_on_occurrence_count: 0,
  capability_off_occurrence_count: 3,
  internal_operation_violation_count: 0,
  legacy_recipe_post_handler_count: 1,
  mypage_surface_personal_editor_marker_count: 0,
  personal_create_active_entry: false,
  recipe_collection_personal_editor_marker_count: 0,
  recipe_collection_personal_origin_field_count: 0,
  recipe_delete_handler_count: 1,
  recipe_patch_handler_count: 1,
  recipebook_surface_personal_editor_marker_count: 0,
  public_service_role_entry_count: 0,
  user_direct_service_role_count: 7,
  user_service_role_violation_count: 0,
};

const requiredCheckIds = [
  "personal-editor-permissions-contract",
  "personal-editor-full-local-source-boundary",
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
  "final-backup-restore",
  "off-mac-restore",
  "first-local-mutation-cutover",
  "post-floor-recovery",
] as const;

const boundaryChecks = {
  owner_access: "passed",
  other_owner_nondisclosure: "passed",
  deleted_nondisclosure: "passed",
  quarantined_nondisclosure: "passed",
  public_surface_boundary: "passed",
  browser_direct_data_storage_mutation: "zero",
  service_role_user_fallback: "zero",
  remote_application_writes: "zero",
};

const requiredCheckCommandLedger =
  buildPersonalRecipeEditorFullLocalVerificationPlan({
    mode: "post-merge-full-local-read-only",
  }).requiredChecks.map(({ id, command, args }) => ({
    id,
    command,
    args,
  }));

const legacyExecutionObservation = {
  git_fetch_transport: "https-read-only",
  database_target: "loopback",
  database_transaction: "read-only",
  required_checks_target: "local-sanitized",
  remote_application_write_target: "absent",
};

const executionObservation = {
  ...legacyExecutionObservation,
  required_check_command_ledger: requiredCheckCommandLedger,
  required_check_environment_keys: ["HOME", "LANG", "PATH"],
  remote_application_target_environment_keys: [],
  remote_application_credential_environment_keys: [],
};

const executionEvidence = {
  source_merge_sha: sourceMergeSha,
  checks: Object.fromEntries(requiredCheckIds.map((id) => [id, "passed"])),
  manual_only: Object.fromEntries(
    manualOnlyPending.map((id) => [id, "pending"]),
  ),
  boundary_checks: boundaryChecks,
  execution_observation: executionObservation,
  production_writes: 0,
  staging_writes: 0,
};

const validLocalResult = {
  full_local_authority: fullLocalResult,
  personal_editor_source: sourceEvidence,
};

function createSourceEvidenceFixtureRepository(extraFiles: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "personal-editor-full-local-"));
  for (const relativeDir of [
    "components/mypage",
    "components/recipebook",
  ]) {
    mkdirSync(join(root, relativeDir), { recursive: true });
  }
  const requiredFiles = [
    "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
    "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
    "app/api/v1/cooking/session-attempts/route.ts",
    "app/api/v1/meals/[meal_id]/route.ts",
    "app/api/v1/meals/route.ts",
    "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
    "app/api/v1/recipes/[id]/route.ts",
    "app/api/v1/recipes/route.ts",
    "app/api/v1/shopping/lists/route.ts",
    "components/recipe/recipe-detail-screen.tsx",
    "lib/personal-recipe-editor.ts",
  ];

  for (const relativePath of requiredFiles) {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(relativePath, destination);
  }

  for (const [relativePath, source] of Object.entries(extraFiles)) {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  }

  return root;
}

describe("personal recipe editor full-local verifier", () => {
  it("rejects remote authority and any unmerged, dirty or grafted source", () => {
    expect(() => assertPersonalRecipeEditorFullLocalEnvironment({
      HOMECOOK_AUTH_AUTHORITY: "local",
      HOMECOOK_DATA_AUTHORITY: "local",
    })).not.toThrow();
    for (const environment of [
      { HOMECOOK_AUTH_AUTHORITY: "remote", HOMECOOK_DATA_AUTHORITY: "local" },
      { HOMECOOK_AUTH_AUTHORITY: "local", HOMECOOK_DATA_AUTHORITY: "remote" },
      { HOMECOOK_AUTH_AUTHORITY: "hybrid", HOMECOOK_DATA_AUTHORITY: "local" },
      {},
    ]) {
      expect(() =>
        assertPersonalRecipeEditorFullLocalEnvironment(environment),
      ).toThrow(/requires local Auth and Data authority/i);
    }

    const validSource = {
      head: sourceMergeSha,
      originMaster: "b".repeat(40),
      isAncestorOfOriginMaster: true,
      legacyGrafts: "",
      trackedStatus: "",
    };
    expect(assertPersonalRecipeEditorMergedExactSource(validSource)).toBe(
      sourceMergeSha,
    );
    for (const source of [
      { ...validSource, isAncestorOfOriginMaster: false },
      { ...validSource, trackedStatus: " M tracked.ts" },
      { ...validSource, trackedStatus: "?? untracked.ts" },
      { ...validSource, legacyGrafts: `${sourceMergeSha} ${"c".repeat(40)}` },
      { ...validSource, head: "short" },
    ]) {
      expect(() => assertPersonalRecipeEditorMergedExactSource(source)).toThrow(
        /clean merged exact origin\/master source/i,
      );
    }
  });

  it("locks the active full-local plan, required checks and Manual Only list exactly", () => {
    const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
      mode: "post-merge-full-local-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      sourceOfRecord: "live-remote-read-only-pre-floor",
      stableRemoteUuidRestore: "pending-manual-restore-manifest",
      remoteTransientAuthState: "local-zero-manifest-pending",
      restoreManifest: "pending-manual-evidence",
      externalPersonalWrite: "dark",
      productionWrites: 0,
      stagingWrites: 0,
      remoteApplicationWrites: 0,
    });
    expect(plan.requiredChecks.map((check) => check.id)).toEqual(
      requiredCheckIds,
    );
    expect(plan.manualOnlyPending).toEqual(manualOnlyPending);
    expect(plan.sql).toContain("full_local_security_inventory");
    expect(plan.sql).toContain("auth.uid()");
    expect(plan.sql).toContain("auth.identities");
    expect(plan.sql).toContain("auth.sessions");
    expect(plan.sql).toContain("auth.refresh_tokens");
    expect(plan.sql).toContain("auth.flow_state");
    expect(plan.sql).toContain("storage.buckets");
    expect(plan.sql).toContain("storage.objects");
    expect(plan.sql).toContain("public.recipe_image_objects");
    expect(plan.sql).not.toContain("remote_auth_identity_epochs");
    expect(() =>
      buildPersonalRecipeEditorFullLocalVerificationPlan({
        mode: "post-merge-read-only",
      }),
    ).toThrow(/unsupported personal recipe editor full-local verification mode/i);
  });

  it("accepts only a credentialed loopback database and strips inherited routing", () => {
    const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
      mode: "post-merge-full-local-read-only",
    });
    const request = buildPersonalRecipeEditorFullLocalPsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        PGHOST: "poison",
        PGOPTIONS: "-c statement_timeout=1",
        PGSERVICE: "remote",
      },
      databaseUrl:
        "postgresql://postgres:local-secret@127.0.0.1:54322/postgres",
      planSql: plan.sql,
    });

    expect(request.args).toEqual(["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
    expect(request.environment).toEqual({
      PATH: "/usr/bin:/bin",
      PGHOST: "127.0.0.1",
      PGPORT: "54322",
      PGUSER: "postgres",
      PGPASSWORD: "local-secret",
      PGDATABASE: "postgres",
      PGSSLMODE: "disable",
    });
    expect(request.input).toContain(
      "transaction isolation level read committed read only",
    );
    expect(request.input).not.toContain("local-secret");

    for (const databaseUrl of [
      "postgresql://postgres:secret@db.example.com/postgres",
      "postgresql://127.0.0.1/postgres",
      "postgresql://postgres@127.0.0.1/postgres",
      "postgresql://postgres:secret@127.0.0.1",
      "postgresql://postgres:secret@127.0.0.1/postgres?sslmode=require",
      "postgresql://postgres:secret@127.0.0.1/postgres#fragment",
      "postgresql://postgres:%ZZ@127.0.0.1/postgres",
    ]) {
      expect(() =>
        buildPersonalRecipeEditorFullLocalPsqlRequest({
          databaseUrl,
          planSql: plan.sql,
        }),
      ).toThrow();
    }
    expect(() =>
      buildPersonalRecipeEditorFullLocalPsqlRequest({
        databaseUrl:
          "postgresql://postgres:secret@127.0.0.1:54322/postgres",
        planSql: "select 1; delete from public.recipes",
      }),
    ).toThrow(/mutating SQL|read-only/i);
  });

  it("runs required checks with a sanitized non-authority environment", () => {
    expect(buildPersonalRecipeEditorCheckEnvironment({
      PATH: "/usr/bin:/bin",
      HOME: "/tmp/home",
      TMPDIR: "/tmp",
      CI: "true",
      PERSONAL_RECIPE_EDITOR_FULL_LOCAL_DATABASE_URL: "secret-url",
      SUPABASE_SERVICE_ROLE_KEY: "secret-role",
      GIT_CONFIG_GLOBAL: "/tmp/poison",
      PGHOST: "remote.example.com",
    })).toEqual({
      PATH: "/usr/bin:/bin",
      HOME: "/tmp/home",
      TMPDIR: "/tmp",
      CI: "true",
    });
  });

  it("accepts an exact valid self-owned isolated full-local result", () => {
    expect(() =>
      assertPersonalRecipeEditorFullLocalResult({
        ...validLocalResult,
      }),
    ).not.toThrow();
    expect(collectPersonalRecipeEditorSourceEvidence(process.cwd())).toEqual(
      sourceEvidence,
    );
  });

  it("fails closed on missing, extra, drift, count and remote-write result changes", () => {
    const validResult = validLocalResult;
    const missingFullLocalField = Object.fromEntries(
      Object.entries(fullLocalResult).filter(([key]) => key !== "remote_writes"),
    );

    for (const result of [
      null,
      { full_local_authority: fullLocalResult },
      { ...validResult, extra: true },
      { ...validResult, remote_auth_evidence: { status: "historical" } },
      { ...validResult, full_local_authority: missingFullLocalField },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          stable_auth_uuid_drift_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          local_control_row_count: 2,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          remote_application_writes: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          public_user_count: 0,
          auth_user_count: 0,
          auth_identity_count: 0,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          auth_identity_mapping_mismatch_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          auth_session_row_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          private_storage_bucket_drift_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          storage_policy_drift_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          unexpected_storage_policy_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          unexpected_storage_mutation_grant_count: 1,
        },
      },
      {
        ...validResult,
        full_local_authority: {
          ...fullLocalResult,
          private_storage_object_registry_mismatch_count: 1,
        },
      },
    ]) {
      expect(() =>
        assertPersonalRecipeEditorFullLocalResult(result),
      ).toThrow(/personal recipe editor full-local result failed closed/i);
    }
  });

  it("fails closed on browser mutation, service fallback and capability activation", () => {
    expect(() => assertPersonalRecipeEditorSourceEvidence(sourceEvidence))
      .not.toThrow();

    for (const evidence of [
      { ...sourceEvidence, browser_direct_storage_path_count: 1 },
      { ...sourceEvidence, browser_direct_data_mutation_count: 1 },
      { ...sourceEvidence, browser_raw_rest_mutation_count: 1 },
      { ...sourceEvidence, user_direct_service_role_count: 6 },
      { ...sourceEvidence, user_direct_service_role_count: 8 },
      { ...sourceEvidence, user_service_role_violation_count: 1 },
      { ...sourceEvidence, capability_on_occurrence_count: 1 },
      { ...sourceEvidence, capability_off_occurrence_count: 0 },
      { ...sourceEvidence, personal_create_active_entry: true },
      { ...sourceEvidence, recipe_patch_handler_count: 0 },
      { ...sourceEvidence, recipe_patch_handler_count: 2 },
      { ...sourceEvidence, recipe_delete_handler_count: 0 },
      { ...sourceEvidence, recipe_delete_handler_count: 2 },
      { ...sourceEvidence, public_service_role_entry_count: 1 },
      { ...sourceEvidence, public_service_role_entry_count: 2 },
      { ...sourceEvidence, extra: 0 },
    ]) {
      expect(() => assertPersonalRecipeEditorSourceEvidence(evidence)).toThrow(
        /personal recipe editor source evidence failed closed/i,
      );
    }
  });

  it("treats extra user service-role routes outside the exact official allowlist as violations", () => {
    const root = createSourceEvidenceFixtureRepository({
      "app/api/v1/unapproved/route.ts": `import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST() {
  const client = createServiceRoleClient();
  void client;
  return Response.json({ success: true });
}
`,
    });

    try {
      const evidence = collectPersonalRecipeEditorSourceEvidence(root);

      expect(evidence.user_direct_service_role_count).toBe(
        sourceEvidence.user_direct_service_role_count,
      );
      expect(evidence.user_service_role_violation_count).toBe(1);
      expect(() => assertPersonalRecipeEditorSourceEvidence(evidence)).toThrow(
        /personal recipe editor source evidence failed closed/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats extra public service-role calls inside the official recipe route as violations", () => {
    const routeSource = readFileSync(
      "app/api/v1/recipes/[id]/route.ts",
      "utf8",
    );
    const root = createSourceEvidenceFixtureRepository({
      "app/api/v1/recipes/[id]/route.ts": `${routeSource}

export async function __testExtraPublicServiceRoleCall() {
  const client = createServiceRoleClient();
  void client;
  return null;
}
`,
    });

    try {
      const evidence = collectPersonalRecipeEditorSourceEvidence(root);

      expect(evidence.public_service_role_entry_count).toBe(
        sourceEvidence.public_service_role_entry_count,
      );
      expect(evidence.user_service_role_violation_count).toBe(1);
      expect(() => assertPersonalRecipeEditorSourceEvidence(evidence)).toThrow(
        /personal recipe editor source evidence failed closed/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires exact checks and fails closed on permission/public/write boundary drift", () => {
    expect(() =>
      assertPersonalRecipeEditorFullLocalExecutionEvidence(
        executionEvidence,
        { localResult: validLocalResult },
      ),
    ).not.toThrow();

    for (const evidence of [
      {
        ...executionEvidence,
        checks: { ...executionEvidence.checks, unexpected: "passed" },
      },
      {
        ...executionEvidence,
        boundary_checks: {
          ...boundaryChecks,
          other_owner_nondisclosure: "failed",
        },
      },
      {
        ...executionEvidence,
        boundary_checks: {
          ...boundaryChecks,
          public_surface_boundary: "drifted",
        },
      },
      {
        ...executionEvidence,
        boundary_checks: {
          ...boundaryChecks,
          browser_direct_data_storage_mutation: "one",
        },
      },
      {
        ...executionEvidence,
        boundary_checks: {
          ...boundaryChecks,
          service_role_user_fallback: "one",
        },
      },
      {
        ...executionEvidence,
        execution_observation: {
          ...executionObservation,
          remote_application_write_target: "present",
        },
      },
      (() => {
        const legacyEvidence: Record<string, unknown> = { ...executionEvidence };
        delete legacyEvidence.execution_observation;
        return { ...legacyEvidence, remote_application_writes: 0 };
      })(),
      { ...executionEvidence, extra: true },
    ]) {
      expect(() =>
        assertPersonalRecipeEditorFullLocalExecutionEvidence(
          evidence,
          { localResult: validLocalResult },
        ),
      ).toThrow(/execution evidence failed closed/i);
    }
  });

  it("requires an exact required-check command ledger and explicit remote environment absence", () => {
    const lockedEvidence = {
      ...executionEvidence,
      execution_observation: executionObservation,
      boundary_checks: buildPersonalRecipeEditorBoundaryChecks({
        checks: executionEvidence.checks,
        localResult: validLocalResult,
        executionObservation,
      }),
    };

    expect(() =>
      assertPersonalRecipeEditorFullLocalExecutionEvidence(
        lockedEvidence,
        { localResult: validLocalResult },
      ),
    ).not.toThrow();
    expect(() =>
      assertPersonalRecipeEditorFullLocalExecutionEvidence(
        {
          ...executionEvidence,
          execution_observation: legacyExecutionObservation,
        },
        { localResult: validLocalResult },
      ),
    ).toThrow(/execution evidence failed closed/i);
  });

  it("rejects unknown required-check commands and remote target or credential environment keys", () => {
    for (const executionObservationDrift of [
      {
        ...executionObservation,
        required_check_command_ledger: [
          ...requiredCheckCommandLedger,
          { id: "unknown", command: "node", args: ["unknown.mjs"] },
        ],
      },
      {
        ...executionObservation,
        required_check_environment_keys: [
          ...executionObservation.required_check_environment_keys,
          "SUPABASE_URL",
        ],
        remote_application_target_environment_keys: ["SUPABASE_URL"],
      },
      {
        ...executionObservation,
        required_check_environment_keys: [
          ...executionObservation.required_check_environment_keys,
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        remote_application_credential_environment_keys: [
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
      },
    ]) {
      const driftedEvidence = {
        ...executionEvidence,
        execution_observation: executionObservationDrift,
        boundary_checks: buildPersonalRecipeEditorBoundaryChecks({
          checks: executionEvidence.checks,
          localResult: validLocalResult,
          executionObservation: executionObservationDrift,
        }),
      };
      expect(() =>
        assertPersonalRecipeEditorFullLocalExecutionEvidence(
          driftedEvidence,
          { localResult: validLocalResult },
        ),
      ).toThrow(/execution evidence failed closed/i);
    }
  });

  it("derives boundary statuses from validated SQL and AST observations", () => {
    expect(buildPersonalRecipeEditorBoundaryChecks({
      checks: executionEvidence.checks,
      localResult: validLocalResult,
      executionObservation,
    })).toEqual(boundaryChecks);

    expect(buildPersonalRecipeEditorBoundaryChecks({
      checks: executionEvidence.checks,
      localResult: {
        ...validLocalResult,
        personal_editor_source: {
          ...sourceEvidence,
          browser_direct_data_mutation_count: 1,
        },
      },
      executionObservation,
    }).browser_direct_data_storage_mutation).toBe("detected");
    expect(buildPersonalRecipeEditorBoundaryChecks({
      checks: executionEvidence.checks,
      localResult: {
        ...validLocalResult,
        personal_editor_source: {
          ...sourceEvidence,
          user_service_role_violation_count: 1,
        },
      },
      executionObservation,
    }).service_role_user_fallback).toBe("detected");
    expect(buildPersonalRecipeEditorBoundaryChecks({
      checks: executionEvidence.checks,
      localResult: validLocalResult,
    }).remote_application_writes).toBe("not-observed");
    expect(buildPersonalRecipeEditorBoundaryChecks({
      checks: executionEvidence.checks,
      localResult: validLocalResult,
      executionObservation: {
        ...executionObservation,
        remote_application_write_target: "present",
      },
    }).remote_application_writes).toBe("detected");
  });

  it("builds an exact secret-safe summary without hybrid authority evidence", () => {
    const summary = buildPersonalRecipeEditorFullLocalSummary({
      mergeSha: sourceMergeSha,
      localResult: validLocalResult,
      executionEvidence,
    });

    expect(summary).toEqual({
      ok: true,
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      merge_sha: sourceMergeSha,
      source_of_record_status: "live-remote-read-only-pre-floor",
      full_local_auth_db_storage_status: "ready",
      stable_remote_uuid_restore_status: "pending-manual-restore-manifest",
      remote_transient_auth_state_status: "local-zero-manifest-pending",
      local_session_rls_owner_boundary_status: "ready",
      personal_editor_permission_boundary_status: "ready",
      public_surface_status: "app-and-official-auth-v1-only",
      private_storage_image_authority_status: "ready",
      restore_manifest_status: "pending-manual-evidence",
      external_personal_write_status: "dark",
      automated_check_count: requiredCheckIds.length,
      manual_only_status: "pending",
      manual_only_pending: manualOnlyPending,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(
      /(?:password|secret|token|refresh|session_id|email|provider_payload|remote_auth_identity_epochs)/iu,
    );
  });

  it("keeps the CLI merged-exact, local, read-only and secret-safe", () => {
    const cli = readFileSync(
      "scripts/verify-personal-recipe-editor-full-local.mjs",
      "utf8",
    );
    const runner = readFileSync(
      "scripts/lib/full-local-verification-cli-runner.mjs",
      "utf8",
    );
    const executionSource = cli + runner;

    expect(cli).toContain("PERSONAL_RECIPE_EDITOR_FULL_LOCAL_DATABASE_URL");
    expect(executionSource).toContain("--dry-run");
    expect(executionSource).toContain('"merge-base",');
    expect(executionSource).toContain('"--is-ancestor"');
    expect(executionSource).toContain("--no-replace-objects");
    expect(executionSource).toContain("--untracked-files=all");
    expect(cli).toContain("collectPersonalRecipeEditorSourceEvidence");
    expect(cli).not.toContain("verify-personal-recipe-editor-hybrid");
    expect(cli).not.toContain("remote_auth_identity_epochs");
    expect(cli).not.toContain("supabase db dump");
    expect(cli).not.toContain("--linked");
    expect(cli).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:databaseUrl|localResult|sourceEvidence)\b/u,
    );
    expect(() =>
      execFileSync("node", ["--check", "scripts/verify-personal-recipe-editor-full-local.mjs"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
