import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const policyInventory = [
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
];

function validLocalResult(overrides: Record<string, unknown> = {}) {
  return {
    anon_direct_storage_write_count: 0,
    authenticated_direct_storage_write_count: 0,
    capability_count: 1,
    capability_current_cutover_attempt_id: null,
    capability_revision: 34,
    capability_state: "legacy",
    cutover_attempt_count: 0,
    cutover_staging_count: 0,
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
        return v_latest_status is null
          or v_latest_status = 'active';
      end
    `,
    guard_function_identity_arguments: "p_owner_uuid uuid",
    guard_function_language: "plpgsql",
    guard_function_result_type: "boolean",
    guard_function_strict: false,
    guard_function_volatility: "s",
    guard_lifecycle_column_mutation_count: 0,
    guard_lifecycle_policy: {
      permissive: true,
      command: "r",
      roles: ["homecook_recipe_visibility_guard_owner"],
      qualification: "true",
    },
    guard_lifecycle_policy_count: 1,
    guard_lifecycle_rls_enabled: true,
    guard_lifecycle_select: true,
    guard_lifecycle_table_mutation_count: 0,
    guard_unexpected_membership_count: 0,
    internal_column_privilege_count: 0,
    internal_table_privilege_count: 0,
    lifecycle_count: 0,
    local_role_matrix_ok: true,
    local_writes: 0,
    policy_inventory: policyInventory,
    private_bucket_exact: true,
    public_recipe_select: true,
    reader_dml_mutation_count: 0,
    reader_required_table_select_count: 12,
    reader_tags_allowed_column_select_count: 14,
    reader_tags_table_select_count: 0,
    reader_tags_usage_count_select_count: 0,
    rls_matrix_ok: true,
    storage_legacy_write_policy_count: 3,
    schema_ready: true,
    storage_public_mutation_policy_count: 0,
    storage_select_policy: {
      permissive: true,
      command: "r",
      public_role: true,
      qualification: "(bucket_id = 'recipe-images'::text)",
    },
    storage_select_policy_count: 1,
    union_zero_blocked_count: 0,
    union_zero_candidate_count: 0,
    union_zero_ready_count: 0,
    unexpected_reader_policy_count: 0,
    watermark_count: 0,
    ...overrides,
  };
}

describe("recipe visibility read-hardening local verifier", () => {
  it("defines a local-only read-only plan that accepts column-limited tags", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-local-verifier.mjs"
    );

    const plan = verifier.buildRecipeVisibilityLocalVerificationPlan({
      mode: "local-read-only",
    });

    expect(plan).toMatchObject({
      mode: "local-read-only",
      readOnly: true,
      requiresLocalSupabase: true,
      requiresMergedOriginMaster: false,
      requiresCleanTrackedTree: false,
    });
    expect(plan.sql).toContain("reader_tags_allowed_column_select_count");
    expect(plan.sql).toContain("reader_tags_usage_count_select_count");
    expect(plan.sql).toContain("storage_public_mutation_policy_count");
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/iu,
    );
  });

  it("accepts the local Supabase role baseline without exposing tag usage_count", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-local-verifier.mjs"
    );

    expect(() =>
      verifier.assertRecipeVisibilityLocalVerificationResult(
        validLocalResult(),
      ),
    ).not.toThrow();

    for (const invalidResult of [
      validLocalResult({ schema_ready: false }),
      validLocalResult({ reader_tags_table_select_count: 2 }),
      validLocalResult({ reader_tags_allowed_column_select_count: 13 }),
      validLocalResult({ reader_tags_usage_count_select_count: 1 }),
      validLocalResult({ reader_dml_mutation_count: 1 }),
      validLocalResult({ guard_unexpected_membership_count: 1 }),
      validLocalResult({ anon_direct_storage_write_count: 1 }),
      validLocalResult({ storage_legacy_write_policy_count: 2 }),
      validLocalResult({ storage_public_mutation_policy_count: 1 }),
      validLocalResult({ local_writes: 1 }),
    ]) {
      expect(() =>
        verifier.assertRecipeVisibilityLocalVerificationResult(
          invalidResult,
        ),
      ).toThrow(/local recipe visibility verification failed/i);
    }
  });

  it("requires a Supabase CLI local DB URL and builds a non-TLS read-only psql request", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-local-verifier.mjs"
    );
    const defaultLocalDbUrl = [
      "postgresql://postgres",
      "postgres@127.0.0.1:54322/postgres",
    ].join(":");
    const localhostDbUrl = [
      "postgresql://postgres",
      "postgres@localhost:55432/postgres",
    ].join(":");

    const localEnvironment =
      verifier.parseRecipeVisibilityLocalDatabaseEnvironment({
        output: [
          'API_URL="http://127.0.0.1:54321"',
          `DB_URL="${defaultLocalDbUrl}"`,
          'SERVICE_ROLE_KEY="fixture"',
        ].join("\n"),
      });

    expect(localEnvironment).toEqual({
      databaseUrl: defaultLocalDbUrl,
    });
    expect(() =>
      verifier.parseRecipeVisibilityLocalDatabaseEnvironment({
        output:
          'DB_URL="postgresql://postgres:postgres@db.example.com:5432/postgres"',
      }),
    ).toThrow(/local Supabase DB_URL/i);
    expect(
      verifier.parseRecipeVisibilityLocalDatabaseEnvironment({
        output: `DB_URL="${localhostDbUrl}"`,
      }),
    ).toEqual({
      databaseUrl: localhostDbUrl,
    });

    const request = verifier.buildRecipeVisibilityLocalPsqlRequest({
      databaseUrl: localEnvironment.databaseUrl,
      planSql: "select '{}'::jsonb;",
    });
    expect(request.args).toEqual([
      localEnvironment.databaseUrl,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(request.input).toContain("begin transaction read only");
    expect(request.environment).not.toHaveProperty("PGSSLMODE");
  });

  it("keeps the local CLI local-status based, value-safe, and dry-runnable", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-visibility-read-hardening-local.mjs",
      "utf8",
    );

    expect(cli).toContain("supabase");
    expect(cli).toContain("status");
    expect(cli).toContain("-o");
    expect(cli).toContain("env");
    expect(cli).toContain("--dry-run");
    expect(cli).toContain("buildRecipeVisibilityLocalPsqlRequest");
    expect(cli).not.toContain("--linked");
    expect(cli).not.toMatch(/process\.stdout\.write\([^\n]*(?:password|secret|key)/i);
  });
});
