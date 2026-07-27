import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const enabled
  = process.env.HOMECOOK_ACCOUNT_VISIBILITY_NEUTRAL_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGPORT ?? "";
const database
  = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGDATABASE ?? "";

function populationDigest(lines: string[]) {
  return createHash("sha256")
    .update([...lines].sort().join("\n"), "utf8")
    .digest("hex");
}

function authPopulationLine(ownerUuid: string, identityEpoch: string) {
  const utc = new Date(identityEpoch).toISOString().replace(
    /\.(\d{3})Z$/u,
    ".$1000Z",
  );
  return `${ownerUuid}:${utc}`;
}

function psql(sql: string) {
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

describe.runIf(enabled)(
  "account cleanup preserves owner-neutral visibility",
  () => {
    it("keeps neutral rows byte-stable through quarantine, recovery, and real cleanup", () => {
      const attempt = "75000000-0000-4000-8000-000000000001";
      const owner = "75000000-0000-4000-8000-000000000002";
      const systemRecipe = "75000000-0000-4000-8000-000000000003";
      const ownerRecipe = "75000000-0000-4000-8000-000000000004";
      const neutralProduct = "75000000-0000-4000-8000-000000000005";
      const ownerProduct = "75000000-0000-4000-8000-000000000006";
      const neutralVersion = "75000000-0000-4000-8000-000000000007";
      const ownerVersion = "75000000-0000-4000-8000-000000000008";
      const neutralProfile = "75000000-0000-4000-8000-000000000009";
      const ownerProfile = "75000000-0000-4000-8000-000000000010";
      const identityEpoch = "2026-07-27T11:00:00Z";
      const sessionHash = "6".repeat(64);
      const activateKey = "75000000-0000-4000-8000-000000000011";
      const deleteKey = "75000000-0000-4000-8000-000000000012";
      const activatePayloadHash = "7".repeat(64);
      const deletePayloadHash = "8".repeat(64);
      const authDigest = populationDigest([
        authPopulationLine(owner, identityEpoch),
      ]);
      const emptyDigest = populationDigest([]);
      const personalDigest = populationDigest([owner]);

      const result = psql(`
        begin;
        set constraints all deferred;

        create table public.recipe_image_objects (id uuid primary key);
        create table public.storage_object_deletion_outbox (id uuid primary key);

        insert into public.recipes (
          id, title, source_type, created_by, visibility
        ) values (
          '${systemRecipe}',
          'neutral preservation system recipe',
          'system',
          null,
          'public'
        );
        insert into public.nutrition_profiles (
          id,
          profile_kind,
          normalization_method,
          basis_amount,
          basis_unit,
          version,
          review_status,
          is_active,
          created_by
        ) values (
          '${neutralProfile}',
          'product_label',
          'as_labeled',
          100,
          'g',
          1,
          'pending',
          false,
          null
        );
        insert into public.food_products (
          id,
          owner_user_id,
          visibility,
          source_type,
          moderation_status,
          name,
          external_product_key,
          current_nutrition_version_id
        ) values (
          '${neutralProduct}',
          null,
          'public',
          'public_dataset',
          'visible',
          'neutral preservation product',
          'neutral-preservation-product',
          '${neutralVersion}'
        );
        insert into public.food_product_nutrition_versions (
          id,
          product_id,
          nutrition_profile_id,
          version,
          basis_relations_json,
          created_by
        ) values (
          '${neutralVersion}',
          '${neutralProduct}',
          '${neutralProfile}',
          1,
          '[]'::jsonb,
          null
        );

        create temporary table neutral_snapshots (
          stage text primary key,
          digest text not null
        );
        create function pg_temp.neutral_digest()
        returns text
        language sql
        stable
        as $function$
          select
            encode(
              extensions.digest(
                string_agg(stored_row::text, '|' order by kind, id),
                'sha256'
              ),
              'hex'
            )
          from (
            select
              'product'::text as kind,
              product.id,
              to_jsonb(product) as stored_row
            from public.food_products as product
            where product.id = '${neutralProduct}'
            union all
            select 'profile', profile.id, to_jsonb(profile)
            from public.nutrition_profiles as profile
            where profile.id = '${neutralProfile}'
            union all
            select 'recipe', recipe.id, to_jsonb(recipe)
            from public.recipes as recipe
            where recipe.id = '${systemRecipe}'
            union all
            select 'version', version.id, to_jsonb(version)
            from public.food_product_nutrition_versions as version
            where version.id = '${neutralVersion}'
          ) as neutral_rows
        $function$;
        insert into neutral_snapshots
        values ('before', pg_temp.neutral_digest());

        insert into auth.users (
          id, created_at, email, raw_app_meta_data, raw_user_meta_data
        ) values (
          '${owner}',
          '${identityEpoch}',
          'neutral-preservation@example.com',
          '{"provider":"google"}'::jsonb,
          '{"sub":"neutral-preservation"}'::jsonb
        );

        set role service_role;
        select public.begin_account_generation_cutover('${attempt}', 1);
        select public.stage_account_generation_cutover_owner(
          '${attempt}',
          2,
          '${owner}',
          '${identityEpoch}',
          1,
          'quarantine',
          'auth_without_profile_quarantined',
          null,
          null,
          'validated'
        );
        select public.set_account_generation_cutover_snapshot(
          '${attempt}',
          2,
          1,
          '${authDigest}',
          0,
          '${emptyDigest}',
          1,
          '${personalDigest}',
          'auth_table_lock',
          '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
        );
        select public.promote_account_generation_cutover(
          '${attempt}',
          2,
          1,
          '${authDigest}',
          0,
          '${emptyDigest}',
          1,
          '${personalDigest}'
        );
        reset role;

        create temporary table quarantine_observation as
        select status
        from public.user_account_lifecycles
        where owner_uuid = '${owner}' and account_generation = 1;
        insert into neutral_snapshots
        values ('quarantined', pg_temp.neutral_digest());

        set role service_role;
        select public.resolve_account_cutover_quarantine(
          '${owner}',
          '${identityEpoch}',
          '${sessionHash}',
          1,
          '${activateKey}',
          '${activatePayloadHash}',
          'activate',
          '중립 보존 사용자'
        );
        reset role;

        create temporary table recovery_observation as
        select status
        from public.user_account_lifecycles
        where owner_uuid = '${owner}' and account_generation = 1;
        insert into neutral_snapshots
        values ('recovered', pg_temp.neutral_digest());

        -- Seed cleanup controls through F0's canonical internal-writer fence.
        -- Recovery and deletion themselves still run only through their RPCs.
        select public.set_account_generation_internal_writer_marker(
          '${attempt}',
          true
        );
        insert into public.recipes (
          id, title, source_type, created_by, visibility
        ) values (
          '${ownerRecipe}',
          'neutral preservation owner recipe',
          'manual',
          '${owner}',
          'public'
        );
        insert into public.nutrition_profiles (
          id,
          profile_kind,
          normalization_method,
          basis_amount,
          basis_unit,
          version,
          review_status,
          is_active,
          created_by
        ) values (
          '${ownerProfile}',
          'product_label',
          'as_labeled',
          1,
          'serving',
          1,
          'self_reported',
          true,
          '${owner}'
        );
        insert into public.food_products (
          id,
          owner_user_id,
          visibility,
          source_type,
          moderation_status,
          name,
          current_nutrition_version_id
        ) values (
          '${ownerProduct}',
          '${owner}',
          'public',
          'manual',
          'visible',
          'neutral preservation owner product',
          '${ownerVersion}'
        );
        insert into public.food_product_nutrition_versions (
          id,
          product_id,
          nutrition_profile_id,
          version,
          basis_relations_json,
          created_by
        ) values (
          '${ownerVersion}',
          '${ownerProduct}',
          '${ownerProfile}',
          1,
          '[]'::jsonb,
          '${owner}'
        );
        select public.set_account_generation_internal_writer_marker(
          '${attempt}',
          false
        );

        set role service_role;
        select public.initiate_account_generation_delete(
          '${owner}',
          '${identityEpoch}',
          '${sessionHash}',
          1,
          '${deleteKey}',
          '${deletePayloadHash}'
        );
        reset role;

        insert into neutral_snapshots
        values ('cleanup', pg_temp.neutral_digest());

        select concat_ws(
          ':',
          (select status from quarantine_observation),
          (select status from recovery_observation),
          (
            select status
            from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          ),
          (select count(*) from public.users where id = '${owner}'),
          (
            select count(*)
            from public.recipes
            where id = '${ownerRecipe}'
              and created_by is null
              and visibility = 'public'
              and deleted_at is null
          ),
          (
            select count(*)
            from public.food_products
            where id = '${ownerProduct}'
              and owner_user_id is null
              and visibility = 'public'
              and source_type = 'manual'
              and moderation_status = 'visible'
              and deleted_at is null
          ),
          (
            select count(*)
            from public.food_product_nutrition_versions as version
            join public.nutrition_profiles as profile
              on profile.id = version.nutrition_profile_id
            where version.id = '${ownerVersion}'
              and version.created_by is null
              and profile.created_by is null
          ),
          (
            select count(distinct digest)
            from neutral_snapshots
          ),
          (
            select count(*)
            from neutral_snapshots
          ),
          (
            select position(
              'update public.food_products'
              in lower(pg_get_functiondef(
                'public.delete_user_private_data(uuid)'::regprocedure
              ))
            ) > 0
          )
        );
        rollback;
      `);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        "quarantined:active:cleanup_pending:0:1:1:1:1:4:t",
      );
    });
  },
);
