import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_CATALOG_PGDATABASE ?? "";

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
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

describe.runIf(enabled)(
  "quarantined owner visibility across recipe and community product surfaces",
  () => {
    it("hides every public row without mutating its stored payload", () => {
      const activeOwner = "32000000-0000-4000-8000-000000000001";
      const quarantinedOwner = "32000000-0000-4000-8000-000000000002";
      const actor = "32000000-0000-4000-8000-000000000003";
      const activeRecipe = "32000000-0000-4000-8000-000000000011";
      const quarantinedRecipe = "32000000-0000-4000-8000-000000000012";
      const systemRecipe = "32000000-0000-4000-8000-000000000013";
      const activeProduct = "32000000-0000-4000-8000-000000000021";
      const quarantinedProduct = "32000000-0000-4000-8000-000000000022";
      const activeVersion = "32000000-0000-4000-8000-000000000031";
      const quarantinedVersion = "32000000-0000-4000-8000-000000000032";
      const activeProfile = "32000000-0000-4000-8000-000000000041";
      const quarantinedProfile = "32000000-0000-4000-8000-000000000042";

      const result = psql(`
        begin;
        set constraints all deferred;

        insert into public.users (id, nickname, social_provider, social_id) values
          ('${activeOwner}', 'active-owner', 'google', 'active-owner'),
          ('${quarantinedOwner}', 'quarantined-owner', 'google', 'quarantined-owner'),
          ('${actor}', 'reader', 'google', 'reader');

        insert into public.user_account_lifecycles (
          owner_uuid, account_generation, status
        ) values
          ('${activeOwner}', 1, 'active'),
          ('${quarantinedOwner}', 1, 'quarantined');

        insert into public.recipes (
          id, title, source_type, created_by, visibility
        ) values
          ('${activeRecipe}', '격리표시 활성 레시피', 'manual', '${activeOwner}', 'public'),
          ('${quarantinedRecipe}', '격리표시 차단 레시피', 'manual', '${quarantinedOwner}', 'public'),
          ('${systemRecipe}', '격리표시 시스템 레시피', 'system', null, 'public');

        insert into public.food_products (
          id, owner_user_id, visibility, source_type, moderation_status, name,
          current_nutrition_version_id, created_at
        ) values
          (
            '${activeProduct}', '${activeOwner}', 'public', 'manual', 'visible',
            '격리표시 활성 상품', '${activeVersion}', '2026-07-27T01:00:00Z'
          ),
          (
            '${quarantinedProduct}', '${quarantinedOwner}', 'public', 'manual', 'visible',
            '격리표시 차단 상품', '${quarantinedVersion}', '2026-07-27T02:00:00Z'
          );

        insert into public.nutrition_profiles (
          id, profile_kind, normalization_method, basis_amount, basis_unit,
          version, review_status, is_active, created_by
        ) values
          (
            '${activeProfile}', 'product_label', 'as_labeled', 100, 'g',
            1, 'self_reported', true, '${activeOwner}'
          ),
          (
            '${quarantinedProfile}', 'product_label', 'as_labeled', 100, 'g',
            1, 'self_reported', true, '${quarantinedOwner}'
          );

        insert into public.nutrition_values (
          profile_id, nutrient_code, amount, value_status
        )
        select profile_id, nutrient_code, amount, 'observed'
        from (
          values
            ('${activeProfile}'::uuid, 'energy_kcal', 100::numeric),
            ('${activeProfile}'::uuid, 'carbohydrate_g', 10::numeric),
            ('${activeProfile}'::uuid, 'protein_g', 3::numeric),
            ('${activeProfile}'::uuid, 'fat_g', 4::numeric),
            ('${activeProfile}'::uuid, 'sodium_mg', 50::numeric),
            ('${quarantinedProfile}'::uuid, 'energy_kcal', 100::numeric),
            ('${quarantinedProfile}'::uuid, 'carbohydrate_g', 10::numeric),
            ('${quarantinedProfile}'::uuid, 'protein_g', 3::numeric),
            ('${quarantinedProfile}'::uuid, 'fat_g', 4::numeric),
            ('${quarantinedProfile}'::uuid, 'sodium_mg', 50::numeric)
        ) as fixture(profile_id, nutrient_code, amount);

        insert into public.food_product_nutrition_versions (
          id, product_id, nutrition_profile_id, version,
          basis_relations_json, created_by
        ) values
          (
            '${activeVersion}', '${activeProduct}', '${activeProfile}', 1,
            '[]'::jsonb, '${activeOwner}'
          ),
          (
            '${quarantinedVersion}', '${quarantinedProduct}',
            '${quarantinedProfile}', 1, '[]'::jsonb, '${quarantinedOwner}'
          );

        create temporary table fixture_digest as
        select extensions.digest(
          string_agg(stored_row::text, '|' order by kind, id),
          'sha256'
        ) as value
        from (
          select 'recipe'::text as kind, recipe.id, to_jsonb(recipe) as stored_row
          from public.recipes recipe
          where recipe.id in ('${activeRecipe}', '${quarantinedRecipe}', '${systemRecipe}')
          union all
          select 'product', product.id, to_jsonb(product)
          from public.food_products product
          where product.id in ('${activeProduct}', '${quarantinedProduct}')
          union all
          select 'version', version.id, to_jsonb(version)
          from public.food_product_nutrition_versions version
          where version.id in ('${activeVersion}', '${quarantinedVersion}')
        ) stored;

        create temporary table fixture_observation (
          direct_active_recipe_count integer,
          direct_quarantined_recipe_count integer,
          direct_system_recipe_count integer,
          direct_active_product_count integer,
          direct_quarantined_product_count integer,
          direct_active_version_count integer,
          direct_quarantined_version_count integer,
          profile_select_privilege boolean,
          list_active_count integer,
          list_quarantined_count integer,
          search_active_count integer,
          search_quarantined_count integer,
          report_blocked boolean
        );
        grant select, insert, update on fixture_observation
          to authenticated, service_role;

        set local role authenticated;
        set local request.jwt.claim.sub = '${actor}';
        insert into fixture_observation (
          direct_active_recipe_count,
          direct_quarantined_recipe_count,
          direct_system_recipe_count,
          direct_active_product_count,
          direct_quarantined_product_count,
          direct_active_version_count,
          direct_quarantined_version_count,
          profile_select_privilege
        )
        select
          (select count(*) from public.recipes where id = '${activeRecipe}'),
          (select count(*) from public.recipes where id = '${quarantinedRecipe}'),
          (select count(*) from public.recipes where id = '${systemRecipe}'),
          (select count(*) from public.food_products where id = '${activeProduct}'),
          (select count(*) from public.food_products where id = '${quarantinedProduct}'),
          (select count(*) from public.food_product_nutrition_versions
            where id = '${activeVersion}'),
          (select count(*) from public.food_product_nutrition_versions
            where id = '${quarantinedVersion}'),
          has_table_privilege('authenticated', 'public.users', 'select');
        reset role;

        set local role service_role;
        update fixture_observation
        set
          list_active_count = (
            select count(*)
            from jsonb_array_elements(
              public.list_food_products(
                '${actor}', '격리표시', 'manual', null, null, 20
              ) -> 'items'
            ) item
            where item ->> 'id' = '${activeProduct}'
          ),
          list_quarantined_count = (
            select count(*)
            from jsonb_array_elements(
              public.list_food_products(
                '${actor}', '격리표시', 'manual', null, null, 20
              ) -> 'items'
            ) item
            where item ->> 'id' = '${quarantinedProduct}'
          ),
          search_active_count = (
            select count(*)
            from jsonb_array_elements(
              public.search_food_catalog_ranked(
                '${actor}', '격리표시', array['food_product'], 'community',
                null, null, repeat('a', 64), 20
              ) -> 'items'
            ) item
            where item ->> 'id' = '${activeProduct}'
          ),
          search_quarantined_count = (
            select count(*)
            from jsonb_array_elements(
              public.search_food_catalog_ranked(
                '${actor}', '격리표시', array['food_product'], 'community',
                null, null, repeat('a', 64), 20
              ) -> 'items'
            ) item
            where item ->> 'id' = '${quarantinedProduct}'
          );

        do $fixture$
        begin
          begin
            perform public.report_food_product(
              '${actor}', '${quarantinedProduct}', 'spam', null
            );
            update fixture_observation set report_blocked = false;
          exception
            when others then
              if sqlerrm <> 'PRODUCT_REPORT_NOT_ALLOWED' then
                raise;
              end if;
              update fixture_observation set report_blocked = true;
          end;
        end
        $fixture$;
        reset role;

        select concat_ws(
          ':',
          direct_active_recipe_count,
          direct_quarantined_recipe_count,
          direct_system_recipe_count,
          direct_active_product_count,
          direct_quarantined_product_count,
          direct_active_version_count,
          direct_quarantined_version_count,
          profile_select_privilege,
          list_active_count,
          list_quarantined_count,
          search_active_count,
          search_quarantined_count,
          report_blocked,
          (
            select value = (
              select extensions.digest(
                string_agg(stored_row::text, '|' order by kind, id),
                'sha256'
              )
              from (
                select 'recipe'::text as kind, recipe.id, to_jsonb(recipe) as stored_row
                from public.recipes recipe
                where recipe.id in (
                  '${activeRecipe}', '${quarantinedRecipe}', '${systemRecipe}'
                )
                union all
                select 'product', product.id, to_jsonb(product)
                from public.food_products product
                where product.id in ('${activeProduct}', '${quarantinedProduct}')
                union all
                select 'version', version.id, to_jsonb(version)
                from public.food_product_nutrition_versions version
                where version.id in ('${activeVersion}', '${quarantinedVersion}')
              ) stored
            )
            from fixture_digest
          )
        )
        from fixture_observation;
        rollback;
      `);

      expect(result.status, result.stderr).toBe(0);
      const observation = result.stdout
        .trim()
        .split("\n")
        .find((line) => line.includes(":"));
      expect(observation).toBe(
        "1:0:1:1:0:1:0:f:1:0:1:0:t:t",
      );
    });
  },
);
