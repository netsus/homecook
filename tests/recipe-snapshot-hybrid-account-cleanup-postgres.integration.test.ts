import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled
  = process.env.HOMECOOK_RECIPE_SNAPSHOT_HYBRID_CLEANUP_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_SNAPSHOT_HYBRID_CLEANUP_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_SNAPSHOT_HYBRID_CLEANUP_PGPORT ?? "";
const database
  = process.env.HOMECOOK_RECIPE_SNAPSHOT_HYBRID_CLEANUP_PGDATABASE ?? "";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
    },
  });
}

function readJsonEvidence(
  result: ReturnType<typeof psqlResult>,
  marker: string,
) {
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`${marker}=`));
  expect(line, `${marker} evidence was not emitted`).toBeTruthy();
  return JSON.parse(line!.slice(marker.length + 1)) as Record<string, unknown>;
}

describe.runIf(enabled)(
  "recipe snapshot hybrid cleanup PostgreSQL integration",
  () => {
    let lifecycleNotice: ReturnType<typeof psqlResult>;

    beforeAll(() => {
      expect(host).not.toBe("");
      expect(port).not.toBe("");
      expect(database).toMatch(/^homecook_recipe_snapshot_hybrid_cleanup/);

      const attempt = "76000000-0000-4000-8000-000000000001";
      const owner = "76000000-0000-4000-8000-000000000002";
      const issuer = "https://remote-auth.example.test";
      const identityEpoch = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const verifiedAt = new Date(Date.now() - 60 * 1000).toISOString();
      const staleSessionHash = "1".repeat(64);
      const activeSessionHash = "2".repeat(64);
      const staleDeleteKey = "76000000-0000-4000-8000-000000000003";
      const deleteKey = "76000000-0000-4000-8000-000000000004";
      const pendingDeleteKey = "76000000-0000-4000-8000-000000000025";
      const expiredDeleteKey = "76000000-0000-4000-8000-000000000022";
      const payloadHash = "3".repeat(64);
      const reusedPayloadHash = "8".repeat(64);
      const privateRecipe = "76000000-0000-4000-8000-000000000005";
      const sharedRecipe = "76000000-0000-4000-8000-000000000006";
      const privateContent = "76000000-0000-4000-8000-000000000007";
      const sharedContent = "76000000-0000-4000-8000-000000000008";
      const privateNutrition = "76000000-0000-4000-8000-000000000009";
      const sharedNutrition = "76000000-0000-4000-8000-000000000010";
      const privateProfile = "76000000-0000-4000-8000-000000000011";
      const sharedProfile = "76000000-0000-4000-8000-000000000012";
      const privateProduct = "76000000-0000-4000-8000-000000000013";
      const sharedProduct = "76000000-0000-4000-8000-000000000014";
      const privateVersion = "76000000-0000-4000-8000-000000000015";
      const sharedVersion = "76000000-0000-4000-8000-000000000016";
      const meal = "76000000-0000-4000-8000-000000000017";
      const session = "76000000-0000-4000-8000-000000000018";
      const sessionMeal = "76000000-0000-4000-8000-000000000019";
      const leftover = "76000000-0000-4000-8000-000000000020";
      const privateNutritionValue = "76000000-0000-4000-8000-000000000023";
      const sharedNutritionValue = "76000000-0000-4000-8000-000000000024";
      const otherAdmin = "76000000-0000-4000-8000-000000000026";
      const operationalEvent = "76000000-0000-4000-8000-000000000027";
      lifecycleNotice = psqlResult(`
        begin;
        set constraints all deferred;
        select set_config('app.settings.auth_expected_issuer', '${issuer}', true);

        insert into public.users (
          id, nickname, email, social_provider, social_id
        ) values
          (
            '${owner}',
            'snapshot cleanup owner',
            null,
            'google',
            'snapshot-hybrid-cleanup'
          ),
          (
            '${otherAdmin}',
            'preserved admin',
            null,
            'google',
            'snapshot-hybrid-preserved-admin'
          );

        insert into public.admin_members (user_id, granted_by) values
          ('${owner}', '${owner}'),
          ('${otherAdmin}', '${owner}');
        insert into public.admin_audit_logs (actor_admin_user_id)
        values ('${owner}');
        insert into public.operational_events (
          id, actor_user_id, target_user_id, metadata_json
        ) values (
          '${operationalEvent}',
          '${owner}',
          '${owner}',
          jsonb_build_object(
            'user_id', '${owner}',
            'owner_uuid', '${owner}',
            'actor_user_id', '${owner}',
            'target_user_id', '${owner}',
            'account_id', '${owner}',
            'safe_context', 'preserve'
          )
        );

        insert into public.recipes (
          id, title, source_type, created_by, visibility
        ) values
          ('${privateRecipe}', 'private snapshot recipe', 'manual', '${owner}', 'private'),
          ('${sharedRecipe}', 'shared snapshot recipe', 'system', null, 'public');

        insert into public.recipe_sources (recipe_id) values
          ('${privateRecipe}'),
          ('${sharedRecipe}');

        insert into public.nutrition_profiles (
          id, profile_kind, normalization_method, basis_amount, basis_unit, version, review_status, is_active, created_by
        ) values
          ('${privateProfile}', 'product_label', 'as_labeled', 100, 'g', 1, 'approved', true, '${owner}'),
          ('${sharedProfile}', 'product_label', 'as_labeled', 100, 'g', 1, 'approved', true, null);

        insert into public.food_products (
          id, owner_user_id, visibility, source_type, moderation_status, name, current_nutrition_version_id
        ) values
          ('${privateProduct}', '${owner}', 'private', 'manual', 'visible', 'private owner product', '${privateVersion}'),
          ('${sharedProduct}', null, 'public', 'manual', 'visible', 'shared owner-null product', '${sharedVersion}');

        insert into public.food_product_nutrition_versions (
          id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
        ) values
          ('${privateVersion}', '${privateProduct}', '${privateProfile}', 1, '[]'::jsonb, '${owner}'),
          ('${sharedVersion}', '${sharedProduct}', '${sharedProfile}', 1, '[]'::jsonb, null);

        insert into public.nutrition_values (id, profile_id) values
          ('${privateNutritionValue}', '${privateProfile}'),
          ('${sharedNutritionValue}', '${sharedProfile}');

        insert into public.user_account_generation_watermarks (
          owner_uuid, last_account_generation
        ) values (
          '${owner}', 1
        );

        insert into public.user_account_lifecycles (
          owner_uuid,
          account_generation,
          auth_identity_created_at_snapshot,
          origin,
          status,
          activated_at
        ) values (
          '${owner}', 1, '${identityEpoch}', 'runtime', 'active', now()
        );

        insert into public.recipe_nutrition_snapshots (
          id,
          recipe_id,
          owner_user_id,
          base_servings,
          input_hash,
          calculation_version,
          scalable_values_json,
          fixed_values_json,
          nutrient_status_json,
          calculation_status,
          calculation_quality,
          reflected_ingredient_count,
          target_ingredient_count,
          missing_reasons,
          warnings_json,
          sources_json,
          is_current,
          calculated_at
        ) values
          (
            '${privateNutrition}',
            '${privateRecipe}',
            '${owner}',
            2,
            repeat('6', 64),
            'recipe-nutrition-v1',
            '{"energy_kcal":100}'::jsonb,
            '{"energy_kcal":0}'::jsonb,
            '{"energy_kcal":{"status":"complete","amount":100}}'::jsonb,
            'complete',
            'direct',
            1,
            1,
            '{}'::text[],
            '[]'::jsonb,
            '[]'::jsonb,
            true,
            now()
          ),
          (
            '${sharedNutrition}',
            '${sharedRecipe}',
            null,
            2,
            repeat('7', 64),
            'recipe-nutrition-v1',
            '{"energy_kcal":200}'::jsonb,
            '{"energy_kcal":0}'::jsonb,
            '{"energy_kcal":{"status":"complete","amount":200}}'::jsonb,
            'complete',
            'direct',
            1,
            1,
            '{}'::text[],
            '[]'::jsonb,
            '[]'::jsonb,
            true,
            now()
          );

        insert into public.recipe_content_snapshots (
          id,
          recipe_id,
          owner_user_id,
          title,
          base_servings,
          ingredients_json,
          steps_json,
          content_hash,
          recipe_nutrition_snapshot_id,
          schema_version,
          created_at
        ) values
          (
            '${privateContent}',
            '${privateRecipe}',
            '${owner}',
            'private content',
            2,
            '[]'::jsonb,
            '[]'::jsonb,
            repeat('4', 64),
            '${privateNutrition}',
            1,
            now()
          ),
          (
            '${sharedContent}',
            '${sharedRecipe}',
            null,
            'shared content',
            2,
            '[]'::jsonb,
            '[]'::jsonb,
            repeat('5', 64),
            '${sharedNutrition}',
            1,
            now()
          );

        insert into public.meals (
          id,
          user_id,
          recipe_id,
          planned_servings,
          status,
          recipe_content_snapshot_id,
          recipe_content_snapshot_origin,
          recipe_nutrition_snapshot_id,
          nutrition_snapshot_origin
        ) values (
          '${meal}',
          '${owner}',
          '${privateRecipe}',
          2,
          'registered',
          '${privateContent}',
          'created',
          '${privateNutrition}',
          'created'
        );

        insert into public.cooking_sessions (
          id, user_id, status
        ) values (
          '${session}', '${owner}', 'in_progress'
        );

        insert into public.cooking_session_meals (
          id, session_id, meal_id, recipe_id, cooking_servings
        ) values (
          '${sessionMeal}', '${session}', '${meal}', '${privateRecipe}', 2
        );

        insert into public.leftover_dishes (
          id,
          user_id,
          recipe_id,
          status,
          cooked_at,
          cooking_servings,
          recipe_content_snapshot_id
        ) values (
          '${leftover}',
          '${owner}',
          '${privateRecipe}',
          'leftover',
          now(),
          2,
          '${privateContent}'
        );

        set role service_role;
        select set_config('request.jwt.claim.role', 'service_role', true);
        select public.record_hybrid_remote_session_authority(
          '${issuer}',
          '${owner}',
          '${identityEpoch}',
          2,
          repeat('9', 64),
          '${verifiedAt}'::timestamptz + interval '1 minute',
          2,
          '${activeSessionHash}',
          1,
          '${verifiedAt}'::timestamptz + interval '31 minutes',
          '${verifiedAt}'::timestamptz + interval '31 minutes'
        );
        reset role;

        insert into public.account_generation_cutover_attempts (
          id, state, capability_revision
        ) values (
          '${attempt}', 'promoted', 3
        );
        update public.account_generation_capability_state
        set
          state = 'cutover_maintenance',
          revision = 2,
          current_cutover_attempt_id = '${attempt}';
        update public.account_generation_capability_state
        set state = 'generation_active', revision = 3, activated_at = now();
        update public.user_session_generation_bindings
        set expected_account_generation = 1
        where owner_uuid = '${owner}'
          and session_key_hash = '${activeSessionHash}'
          and hmac_key_version = 1;

        do $block$
        begin
          set role service_role;
          perform public.initiate_account_generation_delete(
            '${owner}',
            '${identityEpoch}',
            '${staleSessionHash}',
            1,
            '${staleDeleteKey}',
            '${payloadHash}'
          );
          reset role;
          raise exception 'stale hybrid cleanup session was not rejected';
        exception
          when sqlstate '55000' then
            reset role;
            if sqlerrm is distinct from 'ACCOUNT_SESSION_STALE' then
              raise exception 'unexpected stale hybrid cleanup error: %', sqlerrm;
            end if;
        end;
        $block$;
        select 'stale_session_rejected';

        do $block$
        begin
          update public.user_session_generation_bindings
          set binding_expires_at = remote_verified_at + interval '1 millisecond'
          where owner_uuid = '${owner}'
            and session_key_hash = '${activeSessionHash}'
            and hmac_key_version = 1;

          set role service_role;
          perform public.initiate_account_generation_delete(
            '${owner}',
            '${identityEpoch}',
            '${activeSessionHash}',
            1,
            '${expiredDeleteKey}',
            '${payloadHash}'
          );
          reset role;
          raise exception 'expired hybrid cleanup session was not rejected';
        exception
          when sqlstate '55000' then
            reset role;
            if sqlerrm is distinct from 'ACCOUNT_SESSION_STALE' then
              raise exception 'unexpected expired hybrid cleanup error: %', sqlerrm;
            end if;
        end;
        $block$;
        select 'expired_session_rejected';

        set role service_role;
        select public.assert_hybrid_remote_session_authority(
          '${issuer}',
          '${owner}',
          '${identityEpoch}',
          '${activeSessionHash}',
          1
        );
        create temporary table initial_delete_result as
        select public.initiate_account_generation_delete(
          '${owner}',
          '${identityEpoch}',
          '${activeSessionHash}',
          1,
          '${deleteKey}',
          '${payloadHash}'
        ) as result;
        select 'IDEMPOTENCY_REPLAY=' || jsonb_build_object(
          'initial_result', (select result from initial_delete_result),
          'replay_result', public.initiate_account_generation_delete(
            '${owner}',
            '${identityEpoch}',
            '${activeSessionHash}',
            1,
            '${deleteKey}',
            '${payloadHash}'
          )
        )::text;
        reset role;
        select 'active_epoch_session_delete_started';

        do $block$
        begin
          set role service_role;
          perform public.initiate_account_generation_delete(
            '${owner}',
            '${identityEpoch}',
            '${activeSessionHash}',
            1,
            '${deleteKey}',
            '${reusedPayloadHash}'
          );
          reset role;
          raise exception 'same delete key with different payload was not rejected';
        exception
          when sqlstate '23505' then
            reset role;
            if sqlerrm is distinct from 'IDEMPOTENCY_KEY_REUSED' then
              raise exception 'unexpected reused delete key error: %', sqlerrm;
            end if;
        end;
        $block$;
        select 'reused_key_rejected';

        do $block$
        begin
          set role service_role;
          perform public.initiate_account_generation_delete(
            '${owner}',
            '${identityEpoch}',
            '${activeSessionHash}',
            1,
            '${pendingDeleteKey}',
            '${payloadHash}'
          );
          reset role;
          raise exception 'different delete key while pending was not rejected';
        exception
          when sqlstate '55000' then
            reset role;
            if sqlerrm is distinct from 'ACCOUNT_DELETION_PENDING' then
              raise exception 'unexpected pending deletion error: %', sqlerrm;
            end if;
        end;
        $block$;
        select 'different_key_pending_rejected';

        create temporary table cleanup_snapshot as
        select jsonb_build_object(
          'lifecycle_status', (
            select status from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          'public_user_count', (
            select count(*) from public.users where id = '${owner}'
          ),
          'local_auth_user_count', (
            select count(*) from auth.users
          ),
          'owner_admin_member_count', (
            select count(*) from public.admin_members where user_id = '${owner}'
          ),
          'owner_grantor_count', (
            select count(*) from public.admin_members where granted_by = '${owner}'
          ),
          'owner_audit_actor_count', (
            select count(*) from public.admin_audit_logs
            where actor_admin_user_id = '${owner}'
          ),
          'owner_operational_reference_count', (
            select count(*) from public.operational_events
            where actor_user_id = '${owner}' or target_user_id = '${owner}'
          ),
          'owner_operational_metadata_count', (
            select count(*) from public.operational_events
            where metadata_json ->> 'user_id' = '${owner}'
              or metadata_json ->> 'owner_uuid' = '${owner}'
              or metadata_json ->> 'actor_user_id' = '${owner}'
              or metadata_json ->> 'target_user_id' = '${owner}'
              or metadata_json ->> 'account_id' = '${owner}'
          ),
          'operational_safe_context', (
            select metadata_json ->> 'safe_context'
            from public.operational_events where id = '${operationalEvent}'
          ),
          'private_recipe_count', (
            select count(*) from public.recipes where id = '${privateRecipe}'
          ),
          'private_recipe_source_count', (
            select count(*) from public.recipe_sources where recipe_id = '${privateRecipe}'
          ),
          'private_meal_count', (
            select count(*) from public.meals where id = '${meal}'
          ),
          'private_session_count', (
            select count(*) from public.cooking_sessions where id = '${session}'
          ),
          'private_session_meal_count', (
            select count(*) from public.cooking_session_meals where id = '${sessionMeal}'
          ),
          'private_leftover_count', (
            select count(*) from public.leftover_dishes where id = '${leftover}'
          ),
          'private_content_count', (
            select count(*) from public.recipe_content_snapshots where id = '${privateContent}'
          ),
          'private_nutrition_count', (
            select count(*) from public.recipe_nutrition_snapshots where id = '${privateNutrition}'
          ),
          'private_product_count', (
            select count(*) from public.food_products where id = '${privateProduct}'
          ),
          'private_profile_count', (
            select count(*) from public.nutrition_profiles where id = '${privateProfile}'
          ),
          'private_version_count', (
            select count(*) from public.food_product_nutrition_versions where id = '${privateVersion}'
          ),
          'private_nutrition_value_count', (
            select count(*) from public.nutrition_values where id = '${privateNutritionValue}'
          ),
          'shared_recipe_count', (
            select count(*) from public.recipes where id = '${sharedRecipe}' and created_by is null
          ),
          'shared_recipe_source_count', (
            select count(*) from public.recipe_sources where recipe_id = '${sharedRecipe}'
          ),
          'shared_content_count', (
            select count(*) from public.recipe_content_snapshots
            where id = '${sharedContent}' and owner_user_id is null
          ),
          'shared_nutrition_count', (
            select count(*) from public.recipe_nutrition_snapshots
            where id = '${sharedNutrition}' and owner_user_id is null
          ),
          'shared_product_count', (
            select count(*) from public.food_products
            where id = '${sharedProduct}' and owner_user_id is null
          ),
          'shared_profile_count', (
            select count(*) from public.nutrition_profiles
            where id = '${sharedProfile}' and created_by is null
          ),
          'shared_version_count', (
            select count(*) from public.food_product_nutrition_versions
            where id = '${sharedVersion}' and created_by is null
          ),
          'shared_nutrition_value_count', (
            select count(*) from public.nutrition_values where id = '${sharedNutritionValue}'
          ),
          'outbox_state', (
            select state from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          'outbox_generation', (
            select account_generation from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          )
        ) as summary;
        select 'CLEANUP_SNAPSHOT=' || summary::text from cleanup_snapshot;

        select public.claim_auth_identity_deletion_outbox(
          (
            select id
            from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          '76000000-0000-4000-8000-000000000021',
          clock_timestamp()
        );
        select public.finalize_auth_identity_deletion_outbox(
          (
            select id
            from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          '76000000-0000-4000-8000-000000000021',
          1,
          'deleted',
          null,
          clock_timestamp()
        );
        set role service_role;
        select public.revoke_hybrid_remote_session_authority(
          '${activeSessionHash}',
          1
        );
        reset role;

        update public.user_account_lifecycles
        set
          status = 'complete',
          auth_identity_deleted_at = clock_timestamp(),
          updated_at = clock_timestamp()
        where owner_uuid = '${owner}'
          and account_generation = 1
          and status = 'cleanup_pending';

        update private.remote_auth_identity_epochs
        set active_epoch = false,
            deleted_terminal_at = clock_timestamp(),
            deleted_terminal_reason = 'deleted'
        where issuer = '${issuer}'
          and owner_uuid = '${owner}'
          and identity_created_at = '${identityEpoch}';

        update public.user_session_generation_bindings
        set binding_state = 'deleted_terminal',
            revoked_at = coalesce(revoked_at, clock_timestamp())
        where owner_uuid = '${owner}'
          and session_key_hash = '${activeSessionHash}'
          and hmac_key_version = 1;

        select 'TERMINAL_SNAPSHOT=' || jsonb_build_object(
          'outbox_state', (
            select state from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          'outbox_terminal_result', (
            select terminal_result from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          'remote_terminal_reason', (
            select deleted_terminal_reason
            from private.remote_auth_identity_epochs
            where issuer = '${issuer}'
              and owner_uuid = '${owner}'
              and identity_created_at = '${identityEpoch}'
          ),
          'binding_state', (
            select binding_state from public.user_session_generation_bindings
            where owner_uuid = '${owner}'
              and session_key_hash = '${activeSessionHash}'
              and hmac_key_version = 1
          ),
          'lifecycle_status', (
            select status from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          )
        )::text;
        rollback;
      `);
    });

    it("rejects a stale hybrid session before account cleanup", () => {
      expect(lifecycleNotice.status, lifecycleNotice.stderr).toBe(0);
      expect(lifecycleNotice.stdout).toContain("stale_session_rejected");
    });

    it("rejects an expired active binding before account cleanup", () => {
      expect(lifecycleNotice.status, lifecycleNotice.stderr).toBe(0);
      expect(lifecycleNotice.stdout).toContain("expired_session_rejected");
    });

    it("starts deletion for the exact active identity epoch and session", () => {
      expect(lifecycleNotice.stdout).toContain(
        "active_epoch_session_delete_started",
      );
    });

    it("replays the same delete intent and rejects key or pending intent conflicts", () => {
      expect(readJsonEvidence(lifecycleNotice, "IDEMPOTENCY_REPLAY")).toEqual({
        initial_result: { deletion_status: "cleanup_pending" },
        replay_result: { deletion_status: "cleanup_pending" },
      });
      expect(lifecycleNotice.stdout).toContain("reused_key_rejected");
      expect(lifecycleNotice.stdout).toContain(
        "different_key_pending_rejected",
      );
    });

    it("scrubs operational account identifiers before local user deletion", () => {
      expect(readJsonEvidence(lifecycleNotice, "CLEANUP_SNAPSHOT")).toMatchObject({
        owner_admin_member_count: 0,
        owner_grantor_count: 0,
        owner_audit_actor_count: 0,
        owner_operational_reference_count: 0,
        owner_operational_metadata_count: 0,
        operational_safe_context: "preserve",
      });
    });

    it("deletes private snapshot, nutrition, recipe data while preserving owner-null shared rows", () => {
      const evidence = readJsonEvidence(lifecycleNotice, "CLEANUP_SNAPSHOT");
      expect(evidence).toMatchObject({
        lifecycle_status: "cleanup_pending",
        public_user_count: 0,
        local_auth_user_count: 0,
        private_recipe_count: 0,
        private_recipe_source_count: 0,
        private_meal_count: 0,
        private_session_count: 0,
        private_session_meal_count: 0,
        private_leftover_count: 0,
        private_content_count: 0,
        private_nutrition_count: 0,
        private_product_count: 0,
        private_profile_count: 0,
        private_version_count: 0,
        private_nutrition_value_count: 0,
        shared_recipe_count: 1,
        shared_recipe_source_count: 1,
        shared_content_count: 1,
        shared_nutrition_count: 1,
        shared_product_count: 1,
        shared_profile_count: 1,
        shared_version_count: 1,
        shared_nutrition_value_count: 1,
      });
    });

    it("creates an exact-generation auth deletion outbox row in pending state", () => {
      expect(readJsonEvidence(lifecycleNotice, "CLEANUP_SNAPSHOT")).toMatchObject({
        outbox_state: "pending",
        outbox_generation: 1,
      });
    });

    it("finalizes the local lifecycle and mirrors remote epoch and session terminal state", () => {
      expect(readJsonEvidence(lifecycleNotice, "TERMINAL_SNAPSHOT")).toEqual({
        outbox_state: "succeeded",
        outbox_terminal_result: "deleted",
        remote_terminal_reason: "deleted",
        binding_state: "deleted_terminal",
        lifecycle_status: "complete",
      });
    });
  },
);
