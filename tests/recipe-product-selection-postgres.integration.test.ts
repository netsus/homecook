import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";
import { projectSnapshotV2CookModeData } from "@/lib/server/recipe-content-snapshot-future-propagation";

const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const container = `supabase_db_${projectId}`;
const owner = "77000000-0000-4000-8000-000000000001";
const otherOwner = "77000000-0000-4000-8000-000000000002";
const ingredientId = "77000000-0000-4000-8000-000000000003";
const cutoverId = "77000000-0000-4000-8000-000000000004";
const epoch = "2026-01-01T00:00:00Z";
const issued = "2026-01-02T00:00:00Z";

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

const fixture = `
  begin;
  set local request.jwt.claim.role = 'service_role';
  set local request.jwt.claims = '{"role":"service_role","sub":"${owner}"}';
  insert into auth.users (id, created_at, email) values
    ('${owner}', '${epoch}', 'recipe-product-a@example.invalid'),
    ('${otherOwner}', '${epoch}', 'recipe-product-b@example.invalid');
  insert into public.users (id, nickname, social_provider, social_id) values
    ('${owner}', '제품 테스트 A', 'google', 'recipe-product-a'),
    ('${otherOwner}', '제품 테스트 B', 'google', 'recipe-product-b');
  insert into public.user_account_generation_watermarks (owner_uuid, last_account_generation)
    values ('${owner}', 1), ('${otherOwner}', 1);
  insert into public.user_account_lifecycles (
    owner_uuid, account_generation, auth_identity_created_at_snapshot, origin, status, activated_at
  ) values
    ('${owner}', 1, '${epoch}', 'runtime', 'active', '${epoch}'),
    ('${otherOwner}', 1, '${epoch}', 'runtime', 'active', '${epoch}');
  insert into public.user_session_generation_bindings (
    session_key_hash, hmac_key_version, owner_uuid, expected_account_generation,
    auth_identity_created_at_snapshot, binding_state, auth_authority, local_issuer,
    local_verified_at, auth_cutover_epoch, session_issued_at, binding_expires_at
  ) values (
    repeat('7',64), 1, '${owner}', 1, '${epoch}', 'active', 'local',
    'https://auth.recipe-product.test/auth/v1', now(), 2, '${issued}', '2099-01-01'
  );
  insert into public.ingredients (id, standard_name, category, default_unit)
    values ('${ingredientId}', '베타제품검증재료', '유제품', 'g');
  create temporary table recipe_product_fixture (
    label text, product_id uuid, version_id uuid, payload jsonb
  ) on commit drop;
  do $fixture$
  declare
    v_label text;
    v_product uuid;
    v_version uuid;
    v_profile uuid;
    v_owner uuid;
  begin
    foreach v_label in array array['public','own-private','other-private','hidden','unlinked'] loop
      v_product := gen_random_uuid(); v_version := gen_random_uuid(); v_profile := gen_random_uuid();
      v_owner := case when v_label = 'other-private' then '${otherOwner}'::uuid else '${owner}'::uuid end;
      set constraints food_products_current_version_fk deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name, current_nutrition_version_id
      ) values (
        v_product, v_owner,
        case when v_label in ('own-private','other-private') then 'private' else 'public' end,
        'manual', case when v_label = 'hidden' then 'hidden_by_operator' else 'visible' end,
        '베타제품검증 ' || v_label, v_version
      );
      insert into public.nutrition_profiles (
        id, profile_kind, normalization_method, basis_amount, basis_unit, version,
        review_status, is_active, created_by
      ) values (v_profile, 'product_label', 'as_labeled', 100, 'g', 1, 'self_reported', true, v_owner);
      perform public.insert_manual_food_product_values(v_profile,
        '{"energy_kcal":80,"carbohydrate_g":6,"protein_g":5,"fat_g":4,"sodium_mg":20}'::jsonb);
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
      ) values (v_version, v_product, v_profile, 1, '[]', v_owner);
      if v_label <> 'unlinked' then
        insert into public.food_product_ingredient_links (
          product_id, ingredient_id, relation, review_status, is_primary, is_active,
          source, decision_reason, reviewed_at
        ) values (v_product, '${ingredientId}', 'represents', 'approved', true, true,
          'isolated-test', 'isolated fixture only', now());
      end if;
      insert into recipe_product_fixture values (v_label, v_product, v_version,
        jsonb_build_array(jsonb_build_object(
          'ingredient_id', '${ingredientId}', 'food_product_id', v_product,
          'food_product_nutrition_version_id', v_version, 'amount', 50, 'unit', 'g',
          'ingredient_type', 'QUANT', 'scalable', true, 'sort_order', 0
        )));
    end loop;
  end $fixture$;
  insert into public.account_generation_cutover_attempts (id,state,capability_revision,result_json)
    values ('${cutoverId}', 'promoted', 2, '{}');
  update public.account_generation_capability_state
    set state='generation_active', revision=revision+1, current_cutover_attempt_id='${cutoverId}',
      activated_at='${epoch}' where singleton;
  update private.full_local_auth_control
    set authority='local', local_issuer='https://auth.recipe-product.test/auth/v1', cutover_epoch=2,
      hmac_key_version=1, flows_open=true, local_activated_at='${epoch}' where singleton;
  select public.set_account_generation_internal_writer_marker('${cutoverId}', true);
`;

const createCall = (payload: string) => `public.create_manual_recipe_with_managed_image(
  '${owner}', '${epoch}', repeat('7',64), 1, null, null, '제품 레시피 검증', 2,
  null, array[]::text[], 'system_suggested', ${payload}, '[]'::jsonb
)`;

// This suite accepts only the unique disposable target created by the catalog
// runner. All fixtures and mutations roll back; supplied URLs are never used to connect.
describe.skipIf(!projectId && !databaseUrl)("recipe product selection after all migrations", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);
    const result = spawnSync("docker", ["inspect", container], { encoding: "utf8", timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    const [state] = JSON.parse(result.stdout);
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(projectId);
    expect(state.NetworkSettings.Ports["5432/tcp"]?.map((port: { HostPort: string }) => port.HostPort))
      .toContain(new URL(databaseUrl!).port);
  });

  it("search exposes approved recipe identities only for products this account can use", () => {
    const result = psql(`${fixture}
      select jsonb_agg(jsonb_build_object('name', item->>'name', 'recipe_ingredient_id', item->'recipe_ingredient_id') order by item->>'name')
      from jsonb_array_elements(public.search_food_catalog_ranked(
        '${owner}', '베타제품검증', array['food_product'], null, null, null, repeat('a',64), 50
      )->'items') item;
      rollback;
    `).split("\n").filter(Boolean).at(-1)!;
    expect(JSON.parse(result)).toEqual([
      { name: "베타제품검증 own-private", recipe_ingredient_id: ingredientId },
      { name: "베타제품검증 public", recipe_ingredient_id: ingredientId },
      { name: "베타제품검증 unlinked", recipe_ingredient_id: null },
    ]);
  });

  it.each(["public", "own-private"])("persists canonical and exact product identities together: %s", (label) => {
    psql(`${fixture}
      do $check$
      declare v_fixture record; v_result jsonb;
      begin
        select * into v_fixture from recipe_product_fixture where label='${label}';
        v_result := ${createCall("v_fixture.payload")};
        if not exists (select 1 from public.recipe_ingredients where recipe_id=(v_result->>'id')::uuid
          and ingredient_id='${ingredientId}' and food_product_id=v_fixture.product_id
          and food_product_nutrition_version_id=v_fixture.version_id and amount=50 and unit='g') then
          raise exception 'product identity was not persisted';
        end if;
      end $check$;
      rollback;
    `);
  });

  it.each(["other-private", "hidden", "unlinked", "wrong-version", "wrong-ingredient", "missing-version", "revoked-link"])(
    "rejects an invalid selection atomically: %s", (label) => {
      psql(`${fixture}
        do $check$
        declare v_payload jsonb; v_before bigint;
        begin
          select payload into v_payload from recipe_product_fixture where label='${["other-private", "hidden", "unlinked"].includes(label) ? label : "public"}';
          ${label === "wrong-version" ? "v_payload := jsonb_set(v_payload, '{0,food_product_nutrition_version_id}', to_jsonb(gen_random_uuid()::text));" : ""}
          ${label === "wrong-ingredient" ? "v_payload := jsonb_set(v_payload, '{0,ingredient_id}', to_jsonb(gen_random_uuid()::text));" : ""}
          ${label === "missing-version" ? "v_payload := v_payload #- '{0,food_product_nutrition_version_id}';" : ""}
          ${label === "revoked-link" ? "update public.food_product_ingredient_links set is_primary=false, is_active=false, review_status='revoked' where product_id=(v_payload->0->>'food_product_id')::uuid;" : ""}
          select count(*) into v_before from public.recipes;
          begin
            perform ${createCall("v_payload")};
            raise exception 'invalid product selection was accepted';
          exception when sqlstate '22023' then
            if sqlerrm <> 'RECIPE_PRODUCT_UNAVAILABLE' then raise; end if;
          end;
          if (select count(*) from public.recipes) <> v_before then
            raise exception 'failed recipe creation left a partial recipe';
          end if;
        end $check$;
        rollback;
      `);
    },
  );

  it("reads exact renamed sources and preserves current units without search pagination", () => {
    psql(`${fixture}
      do $check$
      declare v_product uuid; v_item jsonb;
      begin
        select product_id into v_product from recipe_product_fixture where label='public';
        update public.food_products set name='검색어와 다른 새 제품명' where id=v_product;
        v_item := public.read_food_catalog_source('${owner}', 'food_product', v_product);
        if v_item->>'name' <> '검색어와 다른 새 제품명'
          or v_item->>'id' <> v_product::text
          or v_item->'nutrition'->'basis'->>'unit' <> 'g'
          or v_item->>'recipe_ingredient_id' <> '${ingredientId}' then
          raise exception 'identity read did not preserve the current product';
        end if;
        v_item := public.read_food_catalog_source('${owner}', 'ingredient', '${ingredientId}');
        if v_item->>'id' <> '${ingredientId}' or v_item->>'default_unit' <> 'g' then
          raise exception 'ingredient identity read failed';
        end if;
      end $check$;
      rollback;
    `);
  });

  it("exact source lookup excludes other-owner private, moderated, deleted and quarantined food", () => {
    psql(`${fixture}
      do $check$
      declare v_product uuid;
      begin
        for v_product in select product_id from recipe_product_fixture where label in ('other-private','hidden') loop
          if public.read_food_catalog_source('${owner}', 'food_product', v_product) is not null then
            raise exception 'invisible identity was exposed';
          end if;
        end loop;
        select product_id into v_product from recipe_product_fixture where label='public';
        update public.food_products set deleted_at=now() where id=v_product;
        if public.read_food_catalog_source('${owner}', 'food_product', v_product) is not null then
          raise exception 'deleted identity was exposed';
        end if;
        select product_id into v_product from recipe_product_fixture where label='own-private';
        update public.user_account_lifecycles set status='quarantined', quarantine_reason='isolated fixture'
          where owner_uuid='${owner}';
        if public.read_food_catalog_source('${owner}', 'food_product', v_product) is not null then
          raise exception 'quarantined identity was exposed';
        end if;
      end $check$;
      rollback;
    `);
  });

  it("grants authenticated self reads while excluding anonymous calls", () => {
    expect(psql(`begin read only;
      select (not has_function_privilege('anon','public.read_food_catalog_source(uuid,text,uuid)','execute')
        and has_function_privilege('authenticated','public.read_food_catalog_source(uuid,text,uuid)','execute')
        and has_function_privilege('service_role','public.read_food_catalog_source(uuid,text,uuid)','execute'))::text;
      rollback;`)).toBe("true");
  });

  it("executes authenticated A/B reads and rejects actor impersonation", () => {
    psql(`${fixture}
      grant select on recipe_product_fixture to authenticated;
      set local request.jwt.claim.role = 'authenticated';
      set local request.jwt.claims = '{"role":"authenticated","sub":"${owner}"}';
      set local role authenticated;
      do $check$
      declare v_product uuid; v_item jsonb;
      begin
        select product_id into v_product from recipe_product_fixture where label='own-private';
        v_item := public.read_food_catalog_source('${owner}', 'food_product', v_product);
        if v_item->>'id' is distinct from v_product::text then
          raise exception 'authenticated owner could not read their product';
        end if;
        select product_id into v_product from recipe_product_fixture where label='other-private';
        if public.read_food_catalog_source('${owner}', 'food_product', v_product) is not null then
          raise exception 'authenticated owner read another private product';
        end if;
        begin
          perform public.read_food_catalog_source('${otherOwner}', 'food_product', v_product);
          raise exception 'authenticated actor impersonation was accepted';
        exception when raise_exception then
          if sqlerrm <> 'FORBIDDEN' then raise; end if;
        end;
      end $check$;
      reset role;
      set local request.jwt.claims = '{"role":"authenticated","sub":"${otherOwner}"}';
      set local role authenticated;
      do $check_b$
      declare v_product uuid;
      begin
        select product_id into v_product from recipe_product_fixture where label='own-private';
        if public.read_food_catalog_source('${otherOwner}', 'food_product', v_product) is not null then
          raise exception 'account B read account A private product';
        end if;
      end $check_b$;
      rollback;
    `);
  });

  it("reads the real snapshot-v2 RPC and projects its pinned product name after catalog rename", () => {
    const output = psql(`${fixture}
      create temporary table cook_mode_test_session (id uuid) on commit drop;
      do $prepare$
      declare v_payload jsonb; v_created jsonb; v_recipe uuid; v_snapshot uuid; v_session uuid;
      begin
        select payload into v_payload from recipe_product_fixture where label='public';
        v_created := ${createCall("v_payload")};
        v_recipe := (v_created->>'id')::uuid;
        v_payload := jsonb_set(v_payload, '{0,food_product_name}', '"처음 우유"') ;
        v_payload := jsonb_set(v_payload, '{0,food_product_brand}', '"처음 브랜드"');
        -- These optional snapshot fields can be absent in old rows; the RPC
        -- must not reject the row or reread a mutable product name.
        v_payload := jsonb_set(v_payload, '{0,display_text}', '"처음 브랜드 · 처음 우유 50g"');
        insert into public.recipe_content_snapshots (
          owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash
        ) values ('${owner}',v_recipe,'제품 요리',2,v_payload,'[]',repeat('a',64)) returning id into v_snapshot;
        insert into public.cooking_sessions (
          user_id,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision
        ) values ('${owner}','snapshot_v2','standalone',v_recipe,v_snapshot,4,1) returning id into v_session;
        update public.food_products set name='바뀐 제품 이름',brand='새 브랜드'
          where id=(v_payload->0->>'food_product_id')::uuid;
        insert into cook_mode_test_session values(v_session);
      end $prepare$;
      select public.read_snapshot_v2_cook_mode('${owner}','${epoch}',repeat('7',64),1,'${issued}',
        (select id from cook_mode_test_session))->'data';
      rollback;
    `).split("\n").filter(Boolean).at(-1)!;
    const data = JSON.parse(output);
    expect(data.recipe.ingredients[0]).toMatchObject({
      standard_name: "처음 브랜드 · 처음 우유", food_product_name: "처음 우유", food_product_brand: "처음 브랜드",
    });
    expect(projectSnapshotV2CookModeData(data)?.recipe.ingredients[0]).toMatchObject({
      standard_name: "처음 브랜드 · 처음 우유", display_text: "처음 브랜드 · 처음 우유 100g", amount: 100,
    });
  });

  it("recovery retry returns one recipe with its selected product preserved", () => {
    psql(`${fixture}
      do $check$
      declare v_payload jsonb; v_first jsonb; v_replay jsonb; v_key uuid:=gen_random_uuid(); v_before bigint;
      begin
        select jsonb_build_object('p_title','복구 제품 레시피','p_base_servings',2,
          'p_tags','[]'::jsonb,'p_tag_source','system_suggested','p_ingredients',payload,'p_steps','[]'::jsonb)
          into v_payload from recipe_product_fixture where label='public';
        select count(*) into v_before from public.recipes;
        v_first := public.create_manual_recipe_recoverable('${owner}','${epoch}',repeat('7',64),1,'${issued}',v_key,v_payload,v_payload);
        v_replay := public.create_manual_recipe_recoverable('${owner}','${epoch}',repeat('7',64),1,'${issued}',v_key,v_payload,v_payload);
        if v_first is distinct from v_replay or (select count(*) from public.recipes) <> v_before+1 then
          raise exception 'product creation replay was not idempotent';
        end if;
        if not exists(select 1 from public.recipe_ingredients where recipe_id=(v_first->>'id')::uuid
          and food_product_id=(v_payload->'p_ingredients'->0->>'food_product_id')::uuid) then
          raise exception 'recovered recipe lost its product';
        end if;
      end $check$;
      rollback;
    `);
  });
});
