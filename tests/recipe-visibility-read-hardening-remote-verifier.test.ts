import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("recipe visibility read-hardening remote verifier", () => {
  it("defines one merged-exact read-only role and readiness plan", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-remote-verifier.mjs"
    );

    const plan = verifier.buildRecipeVisibilityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
    });
    expect(plan.sql).toContain("has_table_privilege");
    expect(plan.sql).toContain("pg_catalog.pg_policy");
    expect(plan.sql).toContain("recipe_image_objects");
    expect(plan.sql).toContain("storage.buckets");
    expect(plan.sql).toContain("storage.objects");
    expect(plan.sql).toContain("has_any_column_privilege");
    expect(plan.sql).toMatch(
      /has_column_privilege\([\s\S]*'public\.tags'[\s\S]*column_name[\s\S]*'SELECT'/u,
    );
    expect(plan.sql).toContain("has_function_privilege");
    expect(plan.sql).toContain("homecook_recipe_visibility_guard_owner");
    expect(plan.sql).toContain("supabase_admin");
    expect(plan.sql).toContain("inherit_option");
    expect(plan.sql).toContain("set_option");
    expect(plan.sql).toContain("recipe_visibility_guard_lifecycle_select");
    expect(plan.sql).toMatch(
      /has_schema_privilege\(\s*'homecook_recipe_visibility_guard_owner',\s*'public',\s*'USAGE'/u,
    );
    expect(plan.sql).toContain("recipe_sources_parent_read");
    expect(plan.sql).toContain("tags_public_read");
    expect(plan.sql).toContain("union_zero_ready_count");
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/iu,
    );
  });

  it("rejects unknown modes and non-merged or dirty source trees", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-remote-verifier.mjs"
    );

    expect(() =>
      verifier.buildRecipeVisibilityRemoteVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow(/unsupported recipe visibility remote verification mode/i);
    expect(() =>
      verifier.assertRecipeVisibilityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to equal origin\/master/i);
    expect(() =>
      verifier.assertRecipeVisibilityMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
  });

  it("accepts only the exact schema, role matrix, readiness counts, and write-zero result", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-remote-verifier.mjs"
    );
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
    const validResult = {
      schema_ready: true,
      capability_state: "legacy",
      capability_revision: 1,
      capability_current_cutover_attempt_id: null,
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      cutover_attempt_count: 0,
      cutover_staging_count: 0,
      role_matrix_ok: true,
      reader_missing_select_count: 0,
      reader_table_mutation_count: 0,
      reader_column_mutation_count: 0,
      internal_table_privilege_count: 0,
      internal_column_privilege_count: 0,
      service_role_tag_table_mutation_count: 0,
      service_role_tag_column_mutation_count: 0,
      guard_membership_count: 0,
      guard_unsafe_membership_count: 0,
      anon_direct_mutation_count: 0,
      authenticated_direct_mutation_count: 0,
      public_recipe_select: true,
      authenticated_recipe_select: true,
      rls_matrix_ok: true,
      policy_inventory: policyInventory,
      unexpected_reader_policy_count: 0,
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
          return v_latest_status is null
            or v_latest_status = 'active';
        end
      `,
      guard_lifecycle_select: true,
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
      storage_mutation_policy_count: 3,
      unallowlisted_storage_mutation_policy_count: 0,
      union_zero_candidate_count: 0,
      union_zero_ready_count: 0,
      union_zero_blocked_count: 0,
      remote_writes: 0,
    };

    expect(() =>
      verifier.assertRecipeVisibilityRemoteVerificationResult(validResult),
    ).not.toThrow();

    for (const invalidResult of [
      { ...validResult, schema_ready: false },
      { ...validResult, capability_state: "generation_active" },
      {
        ...validResult,
        capability_current_cutover_attempt_id:
          "00000000-0000-4000-8000-000000000001",
      },
      { ...validResult, lifecycle_count: 1 },
      { ...validResult, storage_mutation_policy_count: 2 },
      { ...validResult, unallowlisted_storage_mutation_policy_count: 1 },
      { ...validResult, reader_column_mutation_count: 1 },
      { ...validResult, internal_table_privilege_count: 1 },
      { ...validResult, internal_column_privilege_count: 1 },
      { ...validResult, service_role_tag_table_mutation_count: 1 },
      { ...validResult, guard_membership_count: 2 },
      { ...validResult, guard_unsafe_membership_count: 1 },
      { ...validResult, role_matrix_ok: false },
      { ...validResult, rls_matrix_ok: false },
      {
        ...validResult,
        policy_inventory: policyInventory.map((policy) =>
          policy.name === "recipes_public_and_owner_read"
            ? { ...policy, qualification: "true" }
            : policy
        ),
      },
      {
        ...validResult,
        policy_inventory: policyInventory.map((policy) =>
          policy.name === "recipes_public_and_owner_read"
            ? {
                ...policy,
                qualification: policy.qualification.replace(
                  "'public'",
                  "'PUBLIC'",
                ),
              }
            : policy
        ),
      },
      {
        ...validResult,
        policy_inventory: policyInventory.map((policy) =>
          policy.name === "recipes_public_and_owner_read"
            ? {
                ...policy,
                qualification: policy.qualification.replace(
                  "'public'",
                  "'pub lic'",
                ),
              }
            : policy
        ),
      },
      { ...validResult, guard_function_body: "begin return true; end" },
      {
        ...validResult,
        guard_function_body:
          validResult.guard_function_body.replace("'active'", "'act ive'"),
      },
      { ...validResult, guard_function_volatility: "v" },
      { ...validResult, guard_function_strict: true },
      { ...validResult, guard_function_language: "sql" },
      { ...validResult, guard_lifecycle_select: false },
      { ...validResult, guard_lifecycle_policy_count: 0 },
      { ...validResult, private_bucket_exact: false },
      { ...validResult, storage_select_policy_count: 2 },
      {
        ...validResult,
        policy_inventory: policyInventory.map((policy) =>
          policy.name === "recipes_public_and_owner_read"
            ? {
                ...policy,
                qualification:
                  "(((deleted_at IS NULL) AND recipe_visibility_guard.is_owner_publicly_visible(created_by) AND (visibility = 'public')) OR (auth.uid() = created_by))",
              }
            : policy
        ),
      },
      {
        ...validResult,
        union_zero_candidate_count: 1,
        union_zero_ready_count: 1,
      },
      { ...validResult, remote_writes: 1 },
    ]) {
      expect(() =>
        verifier.assertRecipeVisibilityRemoteVerificationResult(invalidResult),
      ).toThrow(/remote recipe visibility verification failed/i);
    }
  });

  it("requires one complete linked PG environment without inherited credentials", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-remote-verifier.mjs"
    );
    const fixtureCredential = ["opaque", "fixture"].join("-");
    const passwordKey = ["PG", "PASSWORD"].join("");
    const linkedEnvironment = {
      PGDATABASE: "postgres",
      PGHOST: "db.example.invalid",
      [passwordKey]: fixtureCredential,
      PGPORT: "5432",
      PGUSER: "postgres",
    };
    const environment =
      verifier.parseRecipeVisibilityDatabaseEnvironment({
        output: [
          ...Object.entries(linkedEnvironment).map(
            ([key, value]) => `export ${key}=${value}`
          ),
          "export UNRELATED=value",
        ].join("\n"),
        baseEnvironment: {
          PATH: "/usr/bin",
          PGHOST: "wrong.invalid",
          PGOPTIONS: "-c default_transaction_read_only=off",
        },
      });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      ...linkedEnvironment,
      PGSSLMODE: "require",
    });
    expect(() =>
      verifier.parseRecipeVisibilityDatabaseEnvironment({
        output: "export PGHOST=db.example.invalid",
        baseEnvironment: { PATH: "/usr/bin" },
      })
    ).toThrow(/environment is incomplete/i);
  });

  it("builds a privileged pooler-safe read-only request without role downgrade", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-visibility-read-hardening-remote-verifier.mjs"
    );
    const request = verifier.buildRecipeVisibilityPsqlRequest({
      databaseEnvironment: {
        PATH: "/usr/bin",
        PGHOST: "example.invalid",
        PGOPTIONS: "-c default_transaction_read_only=off",
      },
      planSql: "select '{}'::jsonb;",
    });

    expect(request.environment).toMatchObject({
      PATH: "/usr/bin",
      PGHOST: "example.invalid",
    });
    expect(request.environment).not.toHaveProperty("PGOPTIONS");
    expect(request.input).toContain("begin transaction read only");
    expect(request.input).not.toContain("set local role service_role");
    expect(request.args).toEqual([
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
  });

  it("keeps the CLI merged-exact, value-safe, and dry-runnable", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-visibility-read-hardening-remote.mjs",
      "utf8",
    );

    expect(cli).toContain("--untracked-files=no");
    expect(cli).toContain("supabase");
    expect(cli).toContain("db");
    expect(cli).toContain("dump");
    expect(cli).toContain("--dry-run");
    expect(cli).toContain("--linked");
    expect(cli).toContain("buildRecipeVisibilityPsqlRequest");
    expect(cli).not.toContain("PGOPTIONS");
    expect(cli).not.toMatch(/process\.stdout\.write\([^\n]*(?:password|secret)/i);
  });
});
