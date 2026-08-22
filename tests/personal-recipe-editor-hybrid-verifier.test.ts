import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertPersonalRecipeEditorHybridLocalResult,
  assertPersonalRecipeEditorMergedSource,
  assertPersonalRecipeEditorHybridSourceEvidence,
  buildPersonalRecipeEditorHybridLocalPsqlRequest,
  buildPersonalRecipeEditorHybridSummary,
  buildPersonalRecipeEditorHybridVerificationPlan,
  collectPersonalRecipeEditorHybridSourceEvidence,
} from "../scripts/lib/personal-recipe-editor-hybrid-verifier.mjs";

const localResult = {
  schema_ready: true,
  capability_state: "legacy",
  capability_revision: 1,
  capability_current_cutover_attempt_id: null,
  capability_count: 1,
  watermark_count: 0,
  lifecycle_count: 0,
  cutover_attempt_count: 0,
  cutover_staging_count: 0,
  local_role_matrix_ok: true,
  reader_required_table_select_count: 12,
  reader_tags_table_select_count: 0,
  reader_tags_allowed_column_select_count: 14,
  reader_tags_usage_count_select_count: 0,
  reader_dml_mutation_count: 0,
  internal_table_privilege_count: 0,
  internal_column_privilege_count: 0,
  anon_direct_storage_write_count: 0,
  authenticated_direct_storage_write_count: 0,
  public_recipe_select: true,
  rls_matrix_ok: true,
  unexpected_reader_policy_count: 0,
  policy_inventory: [
    {
      relation: "public.recipe_ingredients",
      name: "recipe_ingredients_parent_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_ingredients.recipe_id)))",
    },
    {
      relation: "public.recipe_sources",
      name: "recipe_sources_parent_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_sources.recipe_id)))",
    },
    {
      relation: "public.recipe_step_cooking_methods",
      name: "recipe_step_cooking_methods_parent_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "(EXISTS (SELECT 1 FROM (recipe_steps step JOIN recipes recipe ON ((recipe.id = step.recipe_id))) WHERE (step.id = recipe_step_cooking_methods.step_id)))",
    },
    {
      relation: "public.recipe_steps",
      name: "recipe_steps_parent_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_steps.recipe_id)))",
    },
    {
      relation: "public.recipe_tags",
      name: "recipe_tags_parent_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "((visibility = 'public') AND (review_status = 'approved') AND (EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_tags.recipe_id))))",
    },
    {
      relation: "public.recipes",
      name: "recipes_public_and_owner_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "((deleted_at IS NULL) AND recipe_visibility_guard.is_owner_publicly_visible(created_by) AND ((visibility = 'public') OR (auth.uid() = created_by)))",
    },
    {
      relation: "public.tags",
      name: "tags_public_read",
      permissive: true,
      command: "r",
      roles: ["anon", "authenticated"],
      qualification:
        "((is_system = true) OR (EXISTS (SELECT 1 FROM (recipe_tags recipe_tag JOIN recipes recipe ON ((recipe.id = recipe_tag.recipe_id))) WHERE ((recipe_tag.tag_id = tags.id) AND (recipe_tag.visibility = 'public') AND (recipe_tag.review_status = 'approved')))))",
    },
  ],
  guard_function_volatility: "s",
  guard_function_strict: false,
  guard_function_language: "plpgsql",
  guard_function_identity_arguments: "p_owner_uuid uuid",
  guard_function_result_type: "boolean",
  guard_function_body: `
declare
  v_latest_status text;
begin
  if p_owner_uuid is null then
    return true;
  end if;

  select lifecycle.status
    into v_latest_status
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by account_generation desc
  limit 1;

  return v_latest_status is null or v_latest_status = 'active';
end
`,
  guard_lifecycle_select: true,
  guard_unexpected_membership_count: 0,
  guard_lifecycle_table_mutation_count: 0,
  guard_lifecycle_column_mutation_count: 0,
  guard_lifecycle_rls_enabled: true,
  guard_lifecycle_policy_count: 1,
  guard_lifecycle_policy: {
    permissive: true,
    command: "r",
    roles: ["homecook_recipe_visibility_guard_owner"],
    qualification: "true",
  },
  private_bucket_exact: true,
  storage_select_policy_count: 1,
  storage_select_policy: {
    permissive: true,
    command: "r",
    public_role: true,
    qualification: "(bucket_id = 'recipe-images'::text)",
  },
  storage_public_mutation_policy_count: 0,
  storage_legacy_write_policy_count: 3,
  union_zero_candidate_count: 0,
  union_zero_ready_count: 0,
  union_zero_blocked_count: 0,
  local_writes: 0,
  local_auth_user_count: 0,
  local_active_epoch_count: 0,
  local_active_binding_count: 0,
  local_active_epoch_without_binding_count: 0,
  local_epoch_binding_mismatch_count: 0,
  local_expired_binding_count: 0,
};

const sourceEvidence = {
  app_surface_personal_editor_marker_count: 0,
  browser_direct_storage_path_count: 0,
  capability_on_occurrence_count: 0,
  capability_off_occurrence_count: 3,
  internal_operation_violation_count: 0,
  legacy_recipe_post_handler_count: 1,
  mypage_surface_personal_editor_marker_count: 0,
  personal_create_active_entry: false,
  recipe_collection_personal_editor_marker_count: 0,
  recipe_collection_personal_origin_field_count: 7,
  recipe_delete_handler_count: 1,
  recipe_patch_handler_count: 1,
  recipebook_surface_personal_editor_marker_count: 0,
  user_direct_service_role_count: 11,
  user_service_role_violation_count: 0,
};

const remoteAuthEvidence = {
  evidence_scope_status: "remote-auth-control-plane-read-only",
  source_merge_sha: "a".repeat(40),
  evidence_digest: "b".repeat(64),
  observed_at: "2026-07-31T00:00:00.000Z",
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

describe("personal recipe editor hybrid verifier", () => {
  it("accepts a clean exact SHA already merged into a newer origin/master", () => {
    const mergedSha = "a".repeat(40);

    expect(
      assertPersonalRecipeEditorMergedSource({
        head: mergedSha,
        isAncestorOfOriginMaster: true,
        originMaster: "b".repeat(40),
        trackedStatus: "",
      }),
    ).toBe(mergedSha);
    expect(() =>
      assertPersonalRecipeEditorMergedSource({
        head: mergedSha,
        isAncestorOfOriginMaster: false,
        originMaster: "b".repeat(40),
        trackedStatus: "",
      }),
    ).toThrow(/merged into origin\/master/i);
    expect(() =>
      assertPersonalRecipeEditorMergedSource({
        head: mergedSha,
        isAncestorOfOriginMaster: true,
        originMaster: "b".repeat(40),
        trackedStatus: " M tracked.ts",
      }),
    ).toThrow(/clean tracked tree/i);
  });

  it("builds a merged-SHA local Data/Storage read-only plan", () => {
    const plan = buildPersonalRecipeEditorHybridVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      requiresLocalSupabase: true,
      remoteAuthEvidenceRequired: true,
      target: "local-application-data-storage",
    });
    expect(plan.sql).toContain("local_auth_user_count");
    expect(plan.sql).toContain("from auth.users");
    expect(plan.sql).toContain("storage.objects");
    expect(plan.sql).toContain("private.remote_auth_identity_epochs");
    expect(plan.sql).toContain("public.user_session_generation_bindings");
    expect(() =>
      buildPersonalRecipeEditorHybridVerificationPlan({ mode: "remote" }),
    ).toThrow(/unsupported personal recipe editor hybrid verification mode/i);
  });

  it("requires local auth.users=0 while preserving Data/Storage and dark capability checks", () => {
    expect(() =>
      assertPersonalRecipeEditorHybridLocalResult(localResult),
    ).not.toThrow();
    expect(() =>
      assertPersonalRecipeEditorHybridLocalResult({
        ...localResult,
        local_auth_user_count: 1,
      }),
    ).toThrow(/local auth.users=0/i);

    for (const result of [
      { ...localResult, capability_state: "generation_active" },
      { ...localResult, anon_direct_storage_write_count: 1 },
      { ...localResult, storage_public_mutation_policy_count: 1 },
      { ...localResult, local_writes: 1 },
    ]) {
      expect(() =>
        assertPersonalRecipeEditorHybridLocalResult(result),
      ).toThrow(/personal recipe editor local verification failed/i);
    }
    for (const result of [
      {
        ...localResult,
        local_active_epoch_count: 1,
        local_active_binding_count: 0,
      },
      { ...localResult, local_active_epoch_without_binding_count: 1 },
      { ...localResult, local_epoch_binding_mismatch_count: 1 },
      { ...localResult, local_expired_binding_count: 1 },
    ]) {
      expect(() =>
        assertPersonalRecipeEditorHybridLocalResult(result),
      ).toThrow(/local session authority verification failed/i);
    }
  });

  it("collects exact-source evidence for allowlisted service-role and zero browser direct Storage paths", () => {
    expect(
      collectPersonalRecipeEditorHybridSourceEvidence(process.cwd()),
    ).toEqual(sourceEvidence);
    expect(() =>
      assertPersonalRecipeEditorHybridSourceEvidence(sourceEvidence),
    ).not.toThrow();

    for (const evidence of [
      { ...sourceEvidence, user_service_role_violation_count: 1 },
      { ...sourceEvidence, user_direct_service_role_count: 8 },
      { ...sourceEvidence, user_direct_service_role_count: 10 },
      { ...sourceEvidence, internal_operation_violation_count: 1 },
      { ...sourceEvidence, app_surface_personal_editor_marker_count: 1 },
      { ...sourceEvidence, browser_direct_storage_path_count: 1 },
      { ...sourceEvidence, capability_on_occurrence_count: 1 },
      { ...sourceEvidence, capability_off_occurrence_count: 0 },
      { ...sourceEvidence, legacy_recipe_post_handler_count: 0 },
      { ...sourceEvidence, mypage_surface_personal_editor_marker_count: 1 },
      { ...sourceEvidence, personal_create_active_entry: true },
      {
        ...sourceEvidence,
        recipe_collection_personal_editor_marker_count: 1,
      },
      {
        ...sourceEvidence,
        recipe_collection_personal_origin_field_count: 6,
      },
      { ...sourceEvidence, recipe_patch_handler_count: 0 },
      { ...sourceEvidence, recipe_patch_handler_count: 2 },
      { ...sourceEvidence, recipe_delete_handler_count: 0 },
      { ...sourceEvidence, recipe_delete_handler_count: 2 },
      { ...sourceEvidence, recipebook_surface_personal_editor_marker_count: 1 },
    ]) {
      expect(() =>
        assertPersonalRecipeEditorHybridSourceEvidence(evidence),
      ).toThrow(/source evidence failed closed/i);
    }
  });

  it("uses only a loopback database and strips inherited PG settings", () => {
    const request = buildPersonalRecipeEditorHybridLocalPsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        PGHOST: "poison",
        PGOPTIONS: "-c statement_timeout=1",
      },
      databaseUrl:
        "postgresql://postgres:local-secret@127.0.0.1:54322/postgres",
      planSql: "with safe as (select 1) select * from safe",
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
    expect(() =>
      buildPersonalRecipeEditorHybridLocalPsqlRequest({
        databaseUrl:
          "postgresql://postgres:secret@db.example.supabase.co/postgres",
        planSql: "select 1",
      }),
    ).toThrow(/loopback Postgres URL/i);
    expect(() =>
      buildPersonalRecipeEditorHybridLocalPsqlRequest({
        databaseUrl:
          "postgresql://postgres:secret@127.0.0.1:54322/postgres",
        planSql: "select 1; delete from recipes",
      }),
    ).toThrow(/single SELECT|mutating SQL/i);
  });

  it("returns a secret-safe exact-SHA summary with all write paths dark", () => {
    const summary = buildPersonalRecipeEditorHybridSummary({
      localResult,
      mergeSha: "a".repeat(40),
      now: new Date("2026-07-31T00:05:00.000Z"),
      remoteAuthEvidence,
      sourceEvidence,
    });

    expect(summary).toEqual({
      ok: true,
      mode: "post-merge-read-only",
      merge_sha: "a".repeat(40),
      local_application_data_storage_status: "ready",
      local_auth_user_count: 0,
      local_active_epoch_count: 0,
      local_active_binding_count: 0,
      service_role_user_path_count: 11,
      browser_direct_storage_path_count: 0,
      remote_auth_control_plane_status: "ready",
      active_epoch_count: 2,
      active_binding_count: 2,
      external_personal_write_status: "dark",
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
    expect(JSON.stringify(summary)).not.toContain(
      remoteAuthEvidence.evidence_digest,
    );
  });

  it("binds Auth evidence to the exact merge SHA and fails closed on remote writes", () => {
    expect(() =>
      buildPersonalRecipeEditorHybridSummary({
        localResult,
        mergeSha: "c".repeat(40),
        now: new Date("2026-07-31T00:05:00.000Z"),
        remoteAuthEvidence,
        sourceEvidence,
      }),
    ).toThrow(/exact merge SHA/i);
    expect(() =>
      buildPersonalRecipeEditorHybridSummary({
        localResult,
        mergeSha: "a".repeat(40),
        now: new Date("2026-07-31T00:05:00.000Z"),
        remoteAuthEvidence: {
          ...remoteAuthEvidence,
          remote_application_writes: 1,
        },
        sourceEvidence,
      }),
    ).toThrow(/remote Auth control-plane evidence failed/i);
  });

  it("keeps the CLI local and read-only without linked remote DB access", () => {
    const cli = readFileSync(
      "scripts/verify-personal-recipe-editor-hybrid.mjs",
      "utf8",
    );

    expect(cli).toContain("PERSONAL_RECIPE_EDITOR_LOCAL_DATABASE_URL");
    expect(cli).toContain("--remote-auth-evidence");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain('"merge-base", "--is-ancestor"');
    expect(cli).toContain("collectPersonalRecipeEditorHybridSourceEvidence");
    expect(cli).not.toContain(
      "assertRecipeSnapshotAuthorityMergedExactSource",
    );
    expect(cli).not.toContain("supabase db dump");
    expect(cli).not.toContain("--linked");
    expect(cli).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:databaseUrl|evidence)\b/u,
    );
    expect(() =>
      execFileSync(
        "node",
        ["scripts/generate-hybrid-authority-inventories.mjs", "--check"],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
