import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "@/scripts/lib/full-local-security-inventory.mjs";
import { hydratePantryCatalogSource, type PantryCatalogSourceClient } from "@/lib/server/food-catalog-pantry-source";
import { calculateRecipeDraftNutrition } from "@/lib/server/recipe-content-snapshot-future-propagation";

const contextPath = process.env.HOMECOOK_C03_ARCHIVE_CONTEXT;
const fixture = readFileSync(join(process.cwd(), "tests/sql/recipe-product-only-fixture.sql"), "utf8");
const id = (n: number) => `78000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1);
const method = "79000000-0000-4000-8000-000000000003";
const draft = {
  title: "제품만 사용한 원문", description: null, base_servings: 2,
  ingredients: [{ ingredient_id: null, row_key: id(20), source_kind: "food_product", food_product_id: id(3), food_product_nutrition_version_id: id(4), amount: 0.5, unit: "package", ingredient_type: "QUANT", display_text: "0.5팩", component_label: null, scalable: true }],
  steps: [{ step_number: 1, instruction: "0.5팩을 넣고 섞습니다.", cooking_method_id: method, cooking_method_ids: [method], ingredients_used: [{ ingredient_id: null, row_key: id(20), amount: 0.5, unit: "package", cut_size: null }], component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
};
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let container = "";
let tag = "";
const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
delete env.DOCKER_CONTEXT;
delete env.DOCKER_TLS_VERIFY;
delete env.DOCKER_CERT_PATH;
function assertOwned() {
  const result = spawnSync("docker", ["inspect", container], { encoding: "utf8", env, timeout: 10000 });
  expect(result.status, result.stderr).toBe(0);
  const [state] = JSON.parse(result.stdout);
  expect(state.Config.Labels["homecook.notification-test"]).toBe(tag);
  expect(state.HostConfig.NetworkMode).toBe("none");
  expect(state.Config.Image).toBe("public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a");
}
function psql(sql: string) {
  assertOwned();
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", env, timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}
const core = (operation: string, recipe: string | null, content: unknown, nutrition: unknown, key: string, revision = 1) =>
  `public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','${operation}',${recipe ? `'${recipe}'` : "null"},null,${revision},${literal(content)},${literal(nutrition)},null,null,0,'${key}')`;

describe.skipIf(!contextPath)("C03 on offline archive schema-only rehearsal", () => {
  beforeAll(() => {
    const context = JSON.parse(readFileSync(contextPath!, "utf8"));
    expect(context.container_id).toMatch(/^[a-f0-9]{64}$/);
    expect(context.tag).toMatch(/^[a-f0-9]{32}$/);
    container = context.container_id;
    tag = context.tag;
    assertOwned();
  });
  it("checks every registered function body, ACL and execution context, rejecting a changed private guard", () => {
    const sql=buildRecipeProductSourceFunctionInventorySql();
    expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(psql(sql)))).toMatchObject({required_functions:24,body:0,acl:0});
    const changed=JSON.parse(psql(`begin;create or replace function private.recipe_product_only_writes_enabled() returns boolean language sql stable security definer set search_path=pg_catalog,private,pg_temp as $test$select false$test$;${sql}rollback;`));
    expect(changed.body).toBe(1);
    expect(()=>assertRecipeProductSourceFunctionInventoryResult(changed)).toThrow("failed closed");
    expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(psql(sql)))).toMatchObject({body:0});
  });
  it("runs managed writer, atomic validation, v2 exact pantry consumption and replay fixture", () => {
    const verify = readFileSync(join(process.cwd(), "tests/sql/recipe-product-only-verify.sql"), "utf8");
    expect(JSON.parse(psql(fixture + verify)).status).toBe("PASS");
  });
  it("allows only the exact public recipe projection for anon and B, and preserves the scope/path boundary", () => {
    for (const role of ["anon", "authenticated"]) {
      psql(`${fixture}
        set local role ${role}; set local request.jwt.claims='{"role":"${role}","sub":"79000000-0000-4000-8000-000000000002"}';
        do $public_read$ begin
          if jsonb_array_length(public.read_public_recipe_product_sources('${id(10)}'))<>1
            or public.read_public_recipe_product_sources(gen_random_uuid())<>'[]'::jsonb then raise exception 'PUBLIC_SOURCE_SCOPE_FAILED'; end if;
        end $public_read$; reset role;
        update public.recipes set visibility='private' where id='${id(10)}';
        set local role ${role};
        do $private_read$ begin if public.read_public_recipe_product_sources('${id(10)}')<>'[]'::jsonb then raise exception 'PRIVATE_SOURCE_EXPOSED'; end if; end $private_read$;
        rollback;`);
    }
    psql(`${fixture} set local role postgres;
      set local request.headers='{"x-homecook-public-read-scope":"recipe-detail"}';
      set local request.method='POST'; set local request.path='/rpc/read_public_recipe_product_sources';
      select private.verify_full_local_anonymous_authority();
      set local request.path='/food_products';
      do $wrong_path$ begin
        begin perform private.verify_full_local_anonymous_authority(); raise exception 'BROAD_PRODUCT_SCOPE_ACCEPTED';
        exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise; end if; end;
      end $wrong_path$; rollback;`);
  });
  it("finds public product names and approved classifications without private owner hints or raw pins", () => {
    for (const role of ["anon","authenticated"]) psql(`${fixture}
      insert into public.food_product_ingredient_links(product_id,ingredient_id,relation,review_status,is_primary,is_active,source,decision_reason,reviewed_at)
        values('${id(3)}','${id(2)}','represents','approved',true,true,'manual_review','isolated approved classification',now());
      update public.food_products set brand='원문 등록업체' where id='${id(3)}';
      set local role ${role};set local request.jwt.claims='{"role":"${role}","sub":"79000000-0000-4000-8000-000000000002"}';
      do $public$ begin
        if (select count(*) from public.find_public_recipe_ids_by_product_name('라벨제품'))<>1
          or (select count(*) from public.find_public_recipe_ids_by_product_name('등록업체'))<>1
          or (select count(*) from public.find_public_recipe_ids_by_product_name('비공개라벨제품'))<>0
          or (select count(*) from public.read_recipe_product_ingredient_classification(array['${id(2)}'::uuid]))<>1
          or exists(select 1 from public.read_recipe_product_ingredient_classification(array[gen_random_uuid()])) then raise exception 'PUBLIC_PRODUCT_SEARCH_CLASSIFICATION_SCOPE_FAILED';end if;
      end $public$;reset role;
      set local session_replication_role=replica;
      update public.recipe_ingredients set ingredient_id='${id(2)}',source_kind=null,food_product_id='${id(12)}',food_product_nutrition_version_id='${id(13)}' where id='${id(11)}';
      set local session_replication_role=origin;
      set local role ${role};
      do $private$ begin
        if exists(select 1 from public.find_public_recipe_ids_by_product_name('비공개'))
          or exists(select 1 from public.read_recipe_product_ingredient_classification(array['${id(2)}'::uuid])) then raise exception 'PRIVATE_PRODUCT_HINT_EXPOSED';end if;
        begin perform public.read_public_recipe_product_sources('${id(10)}');raise exception 'PRIVATE_SOURCE_PUBLIC_READ_ACCEPTED';
          exception when sqlstate '55000' then if sqlerrm<>'RECIPE_PRODUCT_READ_UNAVAILABLE' then raise;end if;end;
      end $private$;rollback;`);
  });
  it("canonicalizes only fixed-version shopping needs, preserving source quantities and numeric precision", () => {
    psql(`${fixture.replace('"amount":200,"unit":"g"', '"amount":100,"unit":"g"')}
      do $shopping$
      declare v_snapshot uuid;v_list uuid;v_result jsonb;v_before jsonb;v_guard jsonb;v_items jsonb;
      begin
        update public.recipe_ingredients set component_label='A' where id='${id(11)}';
        insert into public.recipe_ingredients(id,recipe_id,ingredient_id,food_product_id,food_product_nutrition_version_id,
          source_kind,amount,unit,ingredient_type,scalable,component_label,sort_order)
          values('${id(45)}','${id(10)}',null,'${id(3)}','${id(4)}','food_product',50,'g','QUANT',true,'B',1);
        select jsonb_agg(to_jsonb(i) order by id) into v_before from public.recipe_ingredients i where recipe_id='${id(10)}';
        v_guard:=public.build_recipe_nutrition_input_guard('${id(10)}');
        insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${id(40)}','${owner}','검증 점심',0);
        insert into public.meals(id,user_id,recipe_id,column_id,plan_date,planned_servings)
          values('${id(41)}','${owner}','${id(10)}','${id(40)}','2026-10-14',2) returning recipe_content_snapshot_id into v_snapshot;
        v_items:=jsonb_build_array(jsonb_build_object('ingredient_id',null,'food_product_id','${id(3)}',
          'food_product_nutrition_version_id','${id(4)}','display_text','라벨제품','amounts_json',
          '[{"amount":50,"unit":"g"},{"amount":0.5,"unit":"package"}]'::jsonb,'is_pantry_excluded',false,'sort_order',0));
        v_result:=public.create_shopping_list_with_snapshot_authority('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02',
          '${owner}','제품 필요량','2026-10-14','2026-10-14',false,array['${id(41)}'::uuid],'[]','[]',
          jsonb_build_array(jsonb_build_object('recipe_id','${id(10)}','recipe_content_snapshot_id',v_snapshot,'shopping_servings',2,'planned_servings_total',2)),v_items,1);
        if v_result->>'error_code' is not null or v_result->'items'->0->'amounts_json'<>'[{"amount":100,"unit":"g"}]'::jsonb then
          raise exception 'PRODUCT_SHOPPING_CANONICAL_FAILED %',v_result->>'error_code';end if;
        v_list:=(v_result->>'id')::uuid;
        if v_before is distinct from (select jsonb_agg(to_jsonb(i) order by id) from public.recipe_ingredients i where recipe_id='${id(10)}')
          or v_guard is distinct from public.build_recipe_nutrition_input_guard('${id(10)}')
          or not exists(select 1 from public.meals where id='${id(41)}' and status='registered' and shopping_list_id=v_list) then
          raise exception 'SHOPPING_CHANGED_SOURCE_NUTRITION_OR_TRANSITION';end if;
        if private.canonical_recipe_product_amounts('${id(3)}','${id(5)}','${owner}','[{"amount":0.5,"unit":"package"}]')<>'[{"amount":150,"unit":"g"}]'::jsonb
          or private.canonical_recipe_product_amounts('${id(3)}','${id(4)}','${owner}','[{"amount":1,"unit":"봉"},{"amount":2,"unit":"봉"}]')<>'[{"amount":1,"unit":"봉"},{"amount":2,"unit":"봉"}]'::jsonb
          or private.canonical_recipe_product_amounts('${id(3)}','${id(4)}','${owner}','[{"amount":0.1,"unit":"g"},{"amount":0.2,"unit":"g"}]')<>'[{"amount":0.3,"unit":"g"}]'::jsonb then raise exception 'UNSUPPORTED_OR_VERSION_GROUP_CHANGED';end if;
        perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
        update public.recipe_ingredients set amount=0.125 where id='${id(11)}';
        if (select amount from public.recipe_ingredients where id='${id(11)}')<>0.125
          or (select ingredients_json->0->>'amount' from public.build_recipe_content_snapshot_input('${id(10)}'))<>'0.125' then raise exception 'FINITE_DECIMAL_ROUNDTRIP_LOST';end if;
        if private.convert_recipe_product_quantity(0.5,'package','serving','[{"from":{"amount":1,"unit":"package"},"to":{"amount":120,"unit":"g"}},{"from":{"amount":1,"unit":"serving"},"to":{"amount":60,"unit":"g"}}]')<>1 then raise exception 'PINNED_COMMON_BASIS_LOST';end if;
        if private.convert_recipe_product_quantity(1,'package','serving','[{"from":{"amount":1,"unit":"package"},"to":{"amount":2,"unit":"serving"}},{"from":{"amount":1,"unit":"package"},"to":{"amount":200,"unit":"g"}},{"from":{"amount":1,"unit":"serving"},"to":{"amount":50,"unit":"g"}}]') is not null then raise exception 'CONFLICTING_PRODUCT_PATH_ACCEPTED';end if;
      end $shopping$;rollback;`);
  });
  it("rejects conflicting pinned conversion paths at the actual nullable writer atomically", () => {
    const triangle='[{"from":{"amount":1,"unit":"package"},"to":{"amount":2,"unit":"serving"}},{"from":{"amount":1,"unit":"package"},"to":{"amount":200,"unit":"g"}},{"from":{"amount":1,"unit":"serving"},"to":{"amount":50,"unit":"g"}}]';
    psql(`${fixture.replace('[{"from":{"amount":1,"unit":"package"},"to":{"amount":200,"unit":"g"}}]',triangle)}
      do $conflicting_writer$ declare v_before bigint;begin
        select count(*) into v_before from public.recipes;
        begin
          perform public.create_manual_recipe_with_managed_image('${owner}','2026-01-01',repeat('7',64),1,null,null,
            '상충 단위 거절',2,null,array[]::text[],'system_suggested',${literal(draft.ingredients)},${literal([{...draft.steps[0],ingredients_used:[]}])});
          raise exception 'CONFLICTING_PINNED_WRITER_ACCEPTED';
        exception when invalid_parameter_value then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
        if (select count(*) from public.recipes)<>v_before then raise exception 'CONFLICTING_WRITER_PARTIAL_RECIPE';end if;
      end $conflicting_writer$;rollback;`);
  });
  it("preserves legacy linked raw count creation and title-only edits without inventing product nutrition", async () => {
    const linkedDraft = { ...draft, ingredients: [{ ...draft.ingredients[0], ingredient_id:id(2), amount:1, unit:"개", display_text:"1개" }],
      steps:[{ ...draft.steps[0], instruction:"1개를 넣습니다.", ingredients_used:[] }] };
    const client = { from:()=>{throw new Error("linked products must not borrow generic nutrition");},rpc:async(_name:string,args:Record<string,unknown>)=>({data:JSON.parse(psql(`${fixture} select public.read_recipe_product_nutrition_predecessors('${owner}',${literal(args.p_ingredients)});rollback;`)),error:null}) };
    const calculated=await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:linkedDraft,ownerUserId:owner});
    expect(calculated.nutritionSnapshot.scalable_values).toEqual({});
    expect(calculated.nutritionSnapshot.nutrient_status.energy_kcal).toMatchObject({amount:null,status:"unavailable"});
    expect(calculated.nutritionSnapshot.calculation_status).not.toBe("complete");
    psql(`${fixture}set local homecook.personal_recipe_v2='on';
      insert into public.food_product_ingredient_links(product_id,ingredient_id,relation,review_status,is_primary,is_active,source,decision_reason,reviewed_at)
        values('${id(3)}','${id(2)}','represents','approved',true,true,'manual_review','isolated legacy linked',now());
      update private.recipe_product_only_write_control set enabled=false where singleton;
      do $linked$ declare v_result jsonb;v_recipe uuid;v_draft jsonb:=${literal(linkedDraft)};v_bad jsonb;v_before jsonb;v_kind text;v_existing_row uuid;begin
        v_result:=${core("create",null,linkedDraft,calculated.nutritionSnapshot,id(60))};v_recipe:=(v_result->'data'->>'id')::uuid;
        if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and ingredient_id='${id(2)}' and food_product_id='${id(3)}' and food_product_nutrition_version_id='${id(4)}' and amount=1 and unit='개' and source_kind is null) then raise exception 'LEGACY_LINKED_RAW_COUNT_LOST';end if;
        if exists(select 1 from public.recipe_steps step cross join jsonb_array_elements(step.ingredients_used) ref where step.recipe_id=v_recipe and ref ? 'row_key') then raise exception 'OFF_LINKED_NEW_ROWREF_WRITTEN';end if;
        select id into v_existing_row from public.recipe_ingredients where recipe_id=v_recipe;
        update public.food_product_ingredient_links set is_active=false,is_primary=false where product_id='${id(3)}';
        v_draft:=jsonb_set(v_draft,'{ingredients}',jsonb_build_array((v_draft->'ingredients'->0)-'source_kind'-'row_key'));
        v_draft:=jsonb_set(v_draft,'{title}','"제목만 수정"');
        perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
          (select revision from public.recipes where id=v_recipe),v_draft,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(61)}');
        if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and amount=1 and unit='개'
          and ingredient_id='${id(2)}' and food_product_id='${id(3)}' and food_product_nutrition_version_id='${id(4)}' and source_kind is null and id=v_existing_row)
          or not exists(select 1 from public.recipe_steps where recipe_id=v_recipe and instruction='1개를 넣습니다.') then raise exception 'LEGACY_LINKED_TITLE_EDIT_CHANGED_RAW';end if;
        v_draft:=jsonb_set(jsonb_set(v_draft,'{ingredients,0,row_key}',to_jsonb(v_existing_row::text)),'{ingredients,0,component_label}','"소스"');
        perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_draft,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(66)}');
        if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and id=v_existing_row and component_label='소스' and amount=1 and unit='개' and source_kind is null) then raise exception 'SAME_ROW_COMPONENT_CHANGE_LOST_LEGACY_IDENTITY';end if;
        select jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),
          'rows',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_ingredients item where recipe_id=v_recipe),
          'steps',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_steps item where recipe_id=v_recipe),
          'snapshots',(select count(*) from public.recipe_content_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) into v_before;
        begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','create',null,null,1,v_draft,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(65)}');raise exception 'UNAPPROVED_NEW_LINKED_ROW_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
        begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','fork',null,v_recipe,
          (select revision from public.recipes where id=v_recipe),v_draft,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(63)}');raise exception 'UNAPPROVED_FORK_ROW_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
        v_bad:=jsonb_set(v_draft,'{ingredients,0,food_product_nutrition_version_id}','"${id(5)}"');
        begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
          (select revision from public.recipes where id=v_recipe),v_bad,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(64)}');raise exception 'UNAPPROVED_DIFFERENT_PAIR_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
        foreach v_kind in array array['linked','generic'] loop
          v_bad:=jsonb_set(jsonb_set(v_draft,'{ingredients}',jsonb_build_array((v_draft->'ingredients'->0)-'row_key')),'{steps,0,ingredients_used}',jsonb_build_array(jsonb_build_object('ingredient_id','${id(2)}','row_key','${id(89)}','amount',1,'unit','개','cut_size',null)));
          if v_kind='generic' then v_bad:=jsonb_set(v_bad,'{ingredients}',jsonb_build_array((v_bad->'ingredients'->0)-'food_product_id'-'food_product_nutrition_version_id'));end if;
          begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
            (select revision from public.recipes where id=v_recipe),v_bad,${literal(calculated.nutritionSnapshot)},null,null,0,'${id(62)}');raise exception 'OFF_STEP_ONLY_CORE_ACCEPTED';
            exception when invalid_parameter_value then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
          if v_before is distinct from jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),
            'rows',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_ingredients item where recipe_id=v_recipe),
            'steps',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_steps item where recipe_id=v_recipe),
            'snapshots',(select count(*) from public.recipe_content_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) then raise exception 'OFF_STEP_ONLY_CORE_PARTIAL_WRITE';end if;
        end loop;
        perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
        begin insert into public.recipe_ingredients(recipe_id,ingredient_id,food_product_id,food_product_nutrition_version_id,amount,unit,ingredient_type)
          values(v_recipe,'${id(2)}','${id(3)}','${id(4)}',1,'개','QUANT');raise exception 'DIRECT_NEW_UNAPPROVED_TRIPLE_ACCEPTED';
          exception when check_violation then if sqlerrm<>'recipe_ingredient_product_link_guard' then raise;end if;end;
        begin update public.recipe_ingredients set id='${id(88)}' where id=v_existing_row;raise exception 'DIFFERENT_PHYSICAL_ROW_ACCEPTED';
          exception when check_violation then if sqlerrm<>'recipe_ingredient_product_link_guard' then raise;end if;end;
        begin update public.recipe_ingredients set recipe_id='${id(10)}' where id=v_existing_row;raise exception 'DIFFERENT_RECIPE_ACCEPTED';
          exception when check_violation then if sqlerrm<>'recipe_ingredient_product_link_guard' then raise;end if;end;
        perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);
        perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${owner}"}',true);
        begin update public.recipe_ingredients set amount=2 where id=v_existing_row;raise exception 'DIRECT_UNVERIFIED_MUTATION_ACCEPTED';
          exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise;end if;end;
        if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and id=v_existing_row and amount=1 and unit='개') then raise exception 'DIRECT_NEGATIVE_CHANGED_ORIGINAL';end if;
      end $linked$;rollback;`);
  });
  it("keeps old and explicit generic/linked requests in the legacy shape while OFF, preserving unchanged numeric JSON and hashes", () => {
    psql(`${fixture}update private.recipe_product_only_write_control set enabled=false where singleton;
      do $off$ declare v_recipe uuid;v_result jsonb;v_key uuid:='${id(90)}';v_row uuid;v_written jsonb;v_input jsonb;v_before jsonb;v_original jsonb;v_rows jsonb;v_steps jsonb;begin
        v_rows:=jsonb_build_array(jsonb_build_object('ingredient_id','${id(2)}','row_key',v_key,'source_kind','ingredient','amount',1.00,'unit','g','ingredient_type','QUANT','scalable',true));
        v_steps:=jsonb_build_array(jsonb_build_object('step_number',1,'instruction','1.00g 원문 그대로','cooking_method_id','${method}','ingredients_used',jsonb_build_array(jsonb_build_object('ingredient_id','${id(2)}','row_key',v_key,'amount',1.00,'unit','g','cut_size',null))));
        v_result:=public.create_manual_recipe_with_managed_image('${owner}','2026-01-01',repeat('7',64),1,null,null,'기존형식',2,null,array[]::text[],'system_suggested',v_rows,v_steps);
        v_recipe:=(v_result->>'id')::uuid;
        select id into v_row from public.recipe_ingredients where recipe_id=v_recipe;
        if exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and source_kind is not null)
          or exists(select 1 from public.recipe_steps step cross join jsonb_array_elements(step.ingredients_used) ref where step.recipe_id=v_recipe and ref ? 'row_key') then raise exception 'OFF_GENERIC_NEW_FORMAT_WRITTEN';end if;
        select to_jsonb(input) into v_before from public.build_recipe_content_snapshot_input(v_recipe) input;
        select jsonb_agg(to_jsonb(item)) into v_original from public.recipe_ingredients item where recipe_id=v_recipe;
        v_rows:=jsonb_set(jsonb_build_array((v_rows->0)-'row_key'-'source_kind'),'{0,amount}','1'::jsonb);
        v_written:=private.write_recipe_source_rows(v_recipe,'${owner}',v_rows,v_original,true);
        select to_jsonb(input) into v_input from public.build_recipe_content_snapshot_input(v_recipe) input;
        if v_input is distinct from v_before or (select amount::text from public.recipe_ingredients where recipe_id=v_recipe)<>'1.00' then raise exception 'UNCHANGED_LEGACY_JSON_HASH_OR_NUMERIC_SCALE_CHANGED';end if;
        -- Direct new markers and step references must also fail while OFF.
        begin update public.recipe_ingredients set source_kind='ingredient' where recipe_id=v_recipe;raise exception 'OFF_DIRECT_MARKER_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
        begin update public.recipe_steps set ingredients_used=jsonb_build_array(jsonb_build_object('ingredient_id','${id(2)}','row_key',v_row)) where recipe_id=v_recipe;raise exception 'OFF_DIRECT_REF_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
        if not exists(select 1 from pg_locks where pid=pg_backend_pid() and relation='private.recipe_product_only_write_control'::regclass and mode='RowShareLock') then raise exception 'CONTROL_SHARED_TRANSACTION_LOCK_MISSING';end if;
      end $off$;rollback;`);
  });
  it("reorders existing rows, removes their references, recalculates nutrition and rolls back a stale removed-row reference atomically", async () => {
    const first={...draft.ingredients[0],component_label:"A"};
    const second={...first,row_key:id(21),component_label:"B",food_product_nutrition_version_id:id(5),amount:0.125};
    const original={...draft,ingredients:[first,second],steps:[{...draft.steps[0],instruction:"0.5팩 / 0.125팩 원문 그대로",ingredients_used:[draft.steps[0].ingredients_used[0],{...draft.steps[0].ingredients_used[0],row_key:id(21),amount:0.125}]}]};
    const reordered={...original,ingredients:[second,first]};
    const reduced={...original,ingredients:[first],steps:[{...original.steps[0],ingredients_used:[original.steps[0].ingredients_used[0]]}]};
    const client={from:()=>{throw new Error("products must not use generic evidence");},rpc:async(_name:string,args:Record<string,unknown>)=>({data:JSON.parse(psql(`${fixture}select public.read_recipe_product_nutrition_predecessors('${owner}',${literal(args.p_ingredients)});rollback;`)),error:null})};
    const nutrition=await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:original,ownerUserId:owner});
    const nutritionReordered=await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:reordered,ownerUserId:owner});
    const nutritionReduced=await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:reduced,ownerUserId:owner});
    expect(nutrition.nutritionSnapshot.scalable_values.energy_kcal).toBe(637.5);
    expect(nutritionReduced.nutritionSnapshot.scalable_values.energy_kcal).toBe(300);
    psql(`${fixture}set local homecook.personal_recipe_v2='on';do $ordering$ declare v_result jsonb;v_recipe uuid;v_a uuid;v_b uuid;v_reorder jsonb:=${literal(reordered)};v_reduced jsonb:=${literal(reduced)};v_bad jsonb;v_before jsonb;begin
      v_result:=${core("create",null,original,nutrition.nutritionSnapshot,id(70))};v_recipe:=(v_result->'data'->>'id')::uuid;
      select id into v_a from public.recipe_ingredients where recipe_id=v_recipe and component_label='A';select id into v_b from public.recipe_ingredients where recipe_id=v_recipe and component_label='B';
      v_reorder:=jsonb_set(jsonb_set(v_reorder,'{ingredients,0,row_key}',to_jsonb(v_b::text)),'{ingredients,1,row_key}',to_jsonb(v_a::text));
      v_reorder:=jsonb_set(jsonb_set(v_reorder,'{steps,0,ingredients_used,0,row_key}',to_jsonb(v_a::text)),'{steps,0,ingredients_used,1,row_key}',to_jsonb(v_b::text));
      perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_reorder,${literal(nutritionReordered.nutritionSnapshot)},null,null,0,'${id(71)}');
      if (select array_agg(id order by sort_order) from public.recipe_ingredients where recipe_id=v_recipe)<>array[v_b,v_a] then raise exception 'REORDER_CHANGED_IDS_OR_ORDER';end if;
      v_reduced:=jsonb_set(jsonb_set(v_reduced,'{ingredients,0,row_key}',to_jsonb(v_a::text)),'{steps,0,ingredients_used,0,row_key}',to_jsonb(v_a::text));
      perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_reduced,${literal(nutritionReduced.nutritionSnapshot)},null,null,0,'${id(72)}');
      if (select array_agg(id) from public.recipe_ingredients where recipe_id=v_recipe)<>array[v_a] or (select (scalable_values_json->>'energy_kcal')::numeric from public.recipe_nutrition_snapshots where recipe_id=v_recipe and is_current)<>300
        or not exists(select 1 from public.recipe_steps where recipe_id=v_recipe and instruction='0.5팩 / 0.125팩 원문 그대로' and jsonb_array_length(ingredients_used)=1 and ingredients_used->0->>'row_key'=v_a::text) then raise exception 'REMOVAL_REF_OR_NUTRITION_STALE';end if;
      select jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),'rows',(select jsonb_agg(to_jsonb(item)) from public.recipe_ingredients item where recipe_id=v_recipe),'steps',(select jsonb_agg(to_jsonb(step)) from public.recipe_steps step where recipe_id=v_recipe),'nutrition',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_nutrition_snapshots item where recipe_id=v_recipe),'content',(select count(*) from public.recipe_content_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) into v_before;
      v_bad:=jsonb_set(v_reduced,'{steps,0,ingredients_used,0,row_key}',to_jsonb(v_b::text));
      begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_bad,${literal(nutritionReduced.nutritionSnapshot)},null,null,0,'${id(73)}');raise exception 'REMOVED_ROW_REFERENCE_ACCEPTED';exception when invalid_parameter_value then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
      if v_before is distinct from jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),'rows',(select jsonb_agg(to_jsonb(item)) from public.recipe_ingredients item where recipe_id=v_recipe),'steps',(select jsonb_agg(to_jsonb(step)) from public.recipe_steps step where recipe_id=v_recipe),'nutrition',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_nutrition_snapshots item where recipe_id=v_recipe),'content',(select count(*) from public.recipe_content_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) then raise exception 'REMOVED_REF_PARTIAL_WRITE';end if;
    end $ordering$;rollback;`);
  });
  it("preserves explicit generic source markers and row refs, rejecting an old serializer atomically while retaining unresolved legacy refs", async () => {
    const genericRows=[{ingredient_id:id(2),row_key:id(90),source_kind:"ingredient",amount:10,unit:"g",ingredient_type:"QUANT",component_label:"A",display_text:null,scalable:true},{ingredient_id:id(2),row_key:id(91),source_kind:"ingredient",amount:20,unit:"g",ingredient_type:"QUANT",component_label:"B",display_text:null,scalable:true}];
    const genericDraft={...draft,ingredients:genericRows,steps:[{...draft.steps[0],instruction:"A만 1g 원문",ingredients_used:[{ingredient_id:id(2),row_key:id(90),amount:1,unit:"g",cut_size:null}]}]};
    const client={from:(table:string)=>{expect(["ingredient_nutrition_profiles","ingredient_conversion_assignments","piece_unit_weights"]).toContain(table);const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[],error:null})};return q;}};
    const nutrition=await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:genericDraft,ownerUserId:owner});
    psql(`${fixture}set local homecook.personal_recipe_v2='on';do $explicit$ declare v_result jsonb;v_recipe uuid;v_rows jsonb;v_steps jsonb;v_original jsonb;v_before jsonb;v_supported jsonb;v_old jsonb;v_markerless jsonb;v_kind_only jsonb;v_key_only jsonb;v_step_only jsonb;v_row uuid;v_bad jsonb;begin
      v_result:=${core("create",null,genericDraft,nutrition.nutritionSnapshot,id(80))};v_recipe:=(v_result->'data'->>'id')::uuid;
      select id into v_row from public.recipe_ingredients where recipe_id=v_recipe and component_label='A';
      select jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,'row_key',id,'source_kind','ingredient','amount',amount,'unit',unit,'ingredient_type',ingredient_type,'display_text',display_text,'component_label',component_label,'scalable',scalable) order by sort_order,id) into v_rows from public.recipe_ingredients where recipe_id=v_recipe;
      v_steps:=jsonb_set(${literal(genericDraft.steps)},'{0,ingredients_used,0,row_key}',to_jsonb(v_row::text));
      v_supported:=jsonb_set(jsonb_set(${literal(genericDraft)},'{ingredients}',v_rows),'{steps}',v_steps);
      perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_supported,${literal(nutrition.nutritionSnapshot)},null,null,0,'${id(81)}');
      if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and id=v_row and source_kind='ingredient') or not exists(select 1 from public.recipe_steps where recipe_id=v_recipe and ingredients_used->0->>'row_key'=v_row::text) then raise exception 'EXPLICIT_SUPPORTED_FORMAT_DOWNGRADED';end if;
      select jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),'rows',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_ingredients item where recipe_id=v_recipe),'steps',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_steps item where recipe_id=v_recipe),'content',(select count(*) from public.recipe_content_snapshots),'nutrition',(select count(*) from public.recipe_nutrition_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) into v_before;
      select jsonb_agg(item-'row_key'-'source_kind' order by ordinality) into v_original from jsonb_array_elements(v_rows) with ordinality row(item,ordinality);
      v_old:=jsonb_set(jsonb_set(v_supported,'{ingredients}',v_original),'{steps,0,ingredients_used,0}',(v_steps->0->'ingredients_used'->0)-'row_key');
      v_markerless:=jsonb_set(v_supported,'{ingredients}',v_original);
      v_kind_only:=jsonb_set(v_supported,'{ingredients}',(select jsonb_agg(item-'source_kind' order by ordinality) from jsonb_array_elements(v_rows) with ordinality input(item,ordinality)));
      v_key_only:=jsonb_set(v_supported,'{ingredients}',(select jsonb_agg(item-'row_key' order by ordinality) from jsonb_array_elements(v_rows) with ordinality input(item,ordinality)));
      v_step_only:=jsonb_set(v_supported,'{steps,0,ingredients_used,0}',(v_steps->0->'ingredients_used'->0)-'row_key');
      foreach v_bad in array array[v_old,v_markerless,v_kind_only,v_key_only,v_step_only] loop
        begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_bad,${literal(nutrition.nutritionSnapshot)},null,null,0,'${id(82)}');raise exception 'EXPLICIT_FORMAT_LOSS_ACCEPTED';exception when invalid_parameter_value then if sqlerrm<>'RECIPE_SOURCE_CONTRACT_REQUIRED' then raise;end if;end;
        if v_before is distinct from jsonb_build_object('recipe',(select to_jsonb(recipe) from public.recipes recipe where id=v_recipe),'rows',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_ingredients item where recipe_id=v_recipe),'steps',(select jsonb_agg(to_jsonb(item) order by id) from public.recipe_steps item where recipe_id=v_recipe),'content',(select count(*) from public.recipe_content_snapshots),'nutrition',(select count(*) from public.recipe_nutrition_snapshots),'receipts',(select count(*) from public.mutation_idempotency_keys)) then raise exception 'EXPLICIT_LOSS_PARTIAL_WRITE';end if;
      end loop;
      update private.recipe_product_only_write_control set enabled=false where singleton;
      begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,(select revision from public.recipes where id=v_recipe),v_supported,${literal(nutrition.nutritionSnapshot)},null,null,0,'${id(83)}');raise exception 'OFF_EXISTING_FORMAT_DOWNGRADED';exception when invalid_parameter_value then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise;end if;end;
      update private.recipe_product_only_write_control set enabled=true where singleton;
      -- A genuine pre-existing unresolved reference has no key and remains unchanged.
      select jsonb_agg(to_jsonb(item) order by sort_order,id) into v_original from public.recipe_ingredients item where recipe_id=v_recipe;
      v_original:=jsonb_set(v_original,'{0,source_kind}','null');
      v_steps:=jsonb_set(v_steps,'{0,ingredients_used,0}',(v_steps->0->'ingredients_used'->0)-'row_key');
      if private.map_recipe_step_source_rows(v_steps,v_rows,jsonb_build_object('ingredients',v_rows),v_original,v_steps)->0->'ingredients_used' is distinct from v_steps->0->'ingredients_used' then raise exception 'LEGACY_UNRESOLVED_REF_CHANGED';end if;
      -- Mixed existing unresolved and explicit refs retain the exact array too.
      v_steps:=jsonb_set(v_steps,'{0,ingredients_used}',(v_steps->0->'ingredients_used')||jsonb_build_array(jsonb_build_object('ingredient_id','${id(2)}','row_key',v_rows->1->'row_key','amount',1,'unit','g','cut_size',null)));
      if private.map_recipe_step_source_rows(v_steps,v_rows,jsonb_build_object('ingredients',v_rows),v_original,v_steps)->0->'ingredients_used' is distinct from v_steps->0->'ingredients_used' then raise exception 'MIXED_LEGACY_EXPLICIT_REF_CHANGED';end if;
    end $explicit$;rollback;`);
  });
  it("reads the existing verified session generation without renewing it and rejects stale or deleting identities", () => {
    psql(`${fixture}do $subject$ declare v_before jsonb;v_result jsonb;begin
      select to_jsonb(binding) into v_before from public.user_session_generation_bindings binding where session_key_hash=repeat('7',64);
      v_result:=public.assert_full_local_session_authority('https://auth.product-only.invalid/auth/v1','${owner}','2026-01-01',repeat('7',64),1,2,'2026-01-02');
      if v_result->>'binding_state'<>'active' or (v_result->>'expected_account_generation')::integer<>1 then raise exception 'PROFILE_SUBJECT_NOT_VERIFIED';end if;
      if v_before is distinct from (select to_jsonb(binding) from public.user_session_generation_bindings binding where session_key_hash=repeat('7',64)) then raise exception 'PROFILE_SUBJECT_RENEWED_SESSION';end if;
      perform set_config('session_replication_role','replica',true);
      update public.user_account_lifecycles set account_generation=2 where owner_uuid='${owner}';
      perform set_config('session_replication_role','origin',true);
      begin perform public.assert_full_local_session_authority('https://auth.product-only.invalid/auth/v1','${owner}','2026-01-01',repeat('7',64),1,2,'2026-01-02');raise exception 'PROFILE_STALE_GENERATION_ACCEPTED';
        exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_GENERATION_STALE' then raise;end if;end;
      perform set_config('session_replication_role','replica',true);
      update public.user_account_lifecycles set account_generation=1,status='deleting' where owner_uuid='${owner}';
      perform set_config('session_replication_role','origin',true);
      begin perform public.assert_full_local_session_authority('https://auth.product-only.invalid/auth/v1','${owner}','2026-01-01',repeat('7',64),1,2,'2026-01-02');raise exception 'PROFILE_DELETING_ACCOUNT_ACCEPTED';
        exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_GENERATION_STALE' then raise;end if;end;
    end $subject$;rollback;`);
  });
  it("hydrates the actual owned pantry V1 through authenticated RLS and refuses B, forged and cross-product pins", async () => {
    const setup=fixture+`insert into public.food_product_ingredient_links(product_id,ingredient_id,relation,review_status,is_primary,is_active,source,decision_reason,reviewed_at)
      values('${id(12)}','${id(2)}','represents','approved',true,true,'manual_review','isolated current manual',now());
      insert into public.pantry_items(id,user_id,food_product_id,food_product_nutrition_version_id) values('${id(95)}','${owner}','${id(3)}','${id(4)}'),('${id(97)}','${owner}','${id(12)}','${id(13)}');`;
    const source=JSON.parse(psql(`${setup}select public.read_food_catalog_source('${owner}','food_product','${id(3)}');rollback;`));
    expect(source.nutrition_version_id).toBe(id(5));
    function reader(actor:string):PantryCatalogSourceClient {return {rpc:async(name,args)=>{
      expect(name).toBe("read_recipe_product_nutrition_predecessors");
      return {data:JSON.parse(psql(`${setup}set local request.jwt.claim.role='authenticated';set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';set local role authenticated;select public.read_recipe_product_nutrition_predecessors('${actor}',${literal(args.p_ingredients)});rollback;`)),error:null};
    },from:(table:string)=>({select:()=>{
      const filters:Array<[string,string]>=[];
      const q={eq:(column:string,value:string)=>{filters.push([column,value]);return q;},maybeSingle:async()=>{
        if(!["pantry_items","food_product_nutrition_versions"].includes(table))throw new Error("Unexpected read table");
        const conditions=filters.map(([column,value])=>{if(!["id","user_id","product_id"].includes(column)||!/^[0-9a-f-]{36}$/i.test(value))throw new Error("Unsafe fixture query");return `item.${column}='${value}'`;}).join(" and ");
        const value="to_jsonb(item)";
        return {data:JSON.parse(psql(`${setup}set local request.jwt.claim.role='authenticated';set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';set local role authenticated;select coalesce((select ${value} from public.${table} item where ${conditions}),'null'::jsonb);rollback;`)),error:null};
      }};return q;
    }})};}
    const old=await hydratePantryCatalogSource(reader(owner),owner,id(95),source);
    expect(old).toMatchObject({nutrition_version_id:id(4),nutrition_version_number:1,nutrition:{values:{energy_kcal:{amount:300,status:"complete"}},sources:[{source_version:"2026-09-22"}]}});
    expect(old?.basis_relations).toEqual([{from:{amount:1,unit:"package"},to:{amount:200,unit:"g"}}]);
    expect(await hydratePantryCatalogSource(reader('79000000-0000-4000-8000-000000000002'),'79000000-0000-4000-8000-000000000002',id(95),source)).toBeNull();
    expect(await hydratePantryCatalogSource(reader(owner),owner,id(96),source)).toBeNull();
    expect(await hydratePantryCatalogSource(reader(owner),owner,id(95),{...source,id:id(12)})).toBeNull();
    const manual=JSON.parse(psql(`${setup}select public.read_food_catalog_source('${owner}','food_product','${id(12)}');rollback;`));
    expect(manual).toMatchObject({source_type:'manual',visibility:'private',nutrition_version_id:id(13),recipe_ingredient_id:id(2)});
    expect(await hydratePantryCatalogSource(reader(owner),owner,id(97),manual)).toEqual({...manual,nutrition_version_number:1,nutrition_version_created_at:expect.any(String)});
    expect(await hydratePantryCatalogSource(reader('79000000-0000-4000-8000-000000000002'),'79000000-0000-4000-8000-000000000002',id(97),manual)).toBeNull();
  });
  it("uses the backend draft calculator and SQL guard for the same exact version, then preserves core revision and idempotency", async () => {
    const client = { from: () => { throw new Error("product must not query generic predecessors"); },
      rpc: async (_name: string, args: Record<string, unknown>) => ({ data: JSON.parse(psql(`${fixture} select public.read_recipe_product_nutrition_predecessors('${owner}',${literal(args.p_ingredients)}); rollback;`)), error: null }),
    };
    const nutrition = await calculateRecipeDraftNutrition(client, { recipeId: id(10), baseRecipeRevision: 1, draft, ownerUserId: owner });
    const sqlGuard = JSON.parse(psql(`${fixture} select public.build_recipe_draft_nutrition_predecessor_guard(${literal(draft)}); rollback;`));
    expect(nutrition.predecessorGuard).toEqual(sqlGuard);
    expect(nutrition.nutritionSnapshot.scalable_values.energy_kcal).toBe(300);
    const decimalDraft={...draft,ingredients:[{...draft.ingredients[0],amount:0.125}]};
    expect((await calculateRecipeDraftNutrition(client,{recipeId:id(10),baseRecipeRevision:1,draft:decimalDraft,ownerUserId:owner})).nutritionSnapshot.scalable_values.energy_kcal).toBe(75);
    psql(`${fixture} set local homecook.personal_recipe_v2='on';
      do $core$
      declare v_first jsonb; v_replay jsonb; v_recipe uuid; v_row uuid; v_draft jsonb:=${literal(draft)}; v_before bigint; v_bad jsonb; v_state jsonb; v_receipts bigint;
      begin
        v_first:=${core("create", null, draft, nutrition.nutritionSnapshot, id(30))};
        v_replay:=${core("create", null, draft, nutrition.nutritionSnapshot, id(30))};
        if v_first is distinct from v_replay then raise exception 'CORE_IDEMPOTENCY_CHANGED'; end if;
        v_recipe:=(v_first->'data'->>'id')::uuid;
        select id into strict v_row from public.recipe_ingredients where recipe_id=v_recipe;
        if not exists(select 1 from public.recipe_content_snapshots where id=(v_first->'data'->>'content_snapshot_id')::uuid
          and ingredients_json->0->>'row_key'=v_row::text and ingredients_json->0->'ingredient_id'='null'::jsonb
          and steps_json->0->'ingredients_used'->0->>'row_key'=v_row::text) then raise exception 'CORE_SNAPSHOT_MAPPING_MISSING'; end if;
        v_draft:=jsonb_set(v_draft,'{ingredients,0,row_key}',to_jsonb(v_row::text));
        v_draft:=jsonb_set(v_draft,'{steps,0,ingredients_used,0,row_key}',to_jsonb(v_row::text));
        v_draft:=jsonb_set(v_draft,'{title}','"제목만 변경"');
        v_first:=public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
          (select revision from public.recipes where id=v_recipe),v_draft,${literal(nutrition.nutritionSnapshot)},null,null,0,'${id(31)}');
        if not exists(select 1 from public.recipe_ingredients where id=v_row and recipe_id=v_recipe)
          or not exists(select 1 from public.recipe_steps where recipe_id=v_recipe and instruction='0.5팩을 넣고 섞습니다.') then raise exception 'UNRELATED_EDIT_CHANGED_SOURCE'; end if;
        select jsonb_build_object('recipe',to_jsonb(r),'rows',(select jsonb_agg(to_jsonb(i) order by id) from public.recipe_ingredients i where recipe_id=v_recipe))
          into v_state from public.recipes r where id=v_recipe;
        select count(*) into v_before from public.recipe_content_snapshots;
        select count(*) into v_receipts from public.mutation_idempotency_keys;
        -- An actual old serializer removes null-ID product rows and omits both
        -- new raw fields. Its generic-only and dropped-all requests must not mutate.
        for v_bad in select value from jsonb_array_elements(jsonb_build_array(
          jsonb_set(jsonb_set(v_draft,'{ingredients}',jsonb_build_array(jsonb_build_object(
            'ingredient_id','${id(2)}','amount',20,'unit','g','ingredient_type','QUANT','display_text','20g','component_label',null,'scalable',true))),
            '{steps,0,ingredients_used}','[]'),
          jsonb_set(jsonb_set(v_draft,'{ingredients}','[]'),'{steps,0,ingredients_used}','[]'))) loop
          begin
            perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
              (select revision from public.recipes where id=v_recipe),v_bad,${literal(nutrition.nutritionSnapshot)},null,null,0,gen_random_uuid());
            raise exception 'OLD_SERIALIZER_PRODUCT_DROP_ACCEPTED';
          exception when invalid_parameter_value then
            if (jsonb_array_length(v_bad->'ingredients')>0 and sqlerrm<>'RECIPE_SOURCE_CONTRACT_REQUIRED')
              or (jsonb_array_length(v_bad->'ingredients')=0 and sqlerrm<>'VALIDATION_ERROR') then raise;end if;
          end;
          if v_state is distinct from (select jsonb_build_object('recipe',to_jsonb(r),'rows',(select jsonb_agg(to_jsonb(i) order by id) from public.recipe_ingredients i where recipe_id=v_recipe)) from public.recipes r where id=v_recipe)
            or (select count(*) from public.recipe_content_snapshots)<>v_before
            or (select count(*) from public.mutation_idempotency_keys)<>v_receipts then raise exception 'OLD_SERIALIZER_PARTIAL_WRITE';end if;
        end loop;
        begin
          perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',v_recipe,null,
            999,v_draft,${literal(nutrition.nutritionSnapshot)},null,null,0,'${id(32)}');
          raise exception 'STALE_REVISION_ACCEPTED';
        exception when serialization_failure then if sqlerrm<>'RECIPE_REVISION_CONFLICT' then raise; end if; end;
        if (select count(*) from public.recipe_content_snapshots)<>v_before then raise exception 'STALE_WRITE_PARTIAL_SNAPSHOT'; end if;
      end $core$; rollback;`);
  });
});
