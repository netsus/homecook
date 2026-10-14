import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { calculateRecipeDraftNutrition } from "@/lib/server/recipe-content-snapshot-future-propagation";

const enabled = process.env.HOMECOOK_RECIPE_QUANTITY_ISOLATED_PG === "1";
const cid = process.env.HOMECOOK_RECIPE_QUANTITY_TEST_CONTAINER ?? "";
const tag = process.env.HOMECOOK_RECIPE_QUANTITY_TEST_TAG ?? "";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
if (enabled && (!/^[a-f0-9]{64}$/u.test(cid) || !/^[a-f0-9]{32}$/u.test(tag))) throw new Error("Owned offline recipe quantity fixture required");
const fixture = readFileSync("tests/sql/recipe-product-only-fixture.sql", "utf8");
const id = (n: number) => `78000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1);
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
delete env.DOCKER_CONTEXT; delete env.DOCKER_TLS_VERIFY; delete env.DOCKER_CERT_PATH;
function sql(body: string) {
  const inspect = spawnSync("docker", ["inspect", cid], { encoding: "utf8", env, timeout: 10000 });
  expect(inspect.status, inspect.stderr).toBe(0);
  const state = JSON.parse(inspect.stdout)[0];
  expect(state.Config.Labels["homecook.c04-recipe-schema-probe"]).toBe(tag);
  expect(state.Config.Image).toBe(image); expect(state.HostConfig.NetworkMode).toBe("none");
  const result = spawnSync("docker", ["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], { input: body, env, encoding: "utf8", timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}
const generic = `update public.ingredients set standard_name='제품 라벨' where id='${id(2)}';
 insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
 values('${id(51)}','${id(7)}','ingredient_source','mass_100g',100,'g',1,'approved','fixture','${owner}',now(),true,'${owner}');
 insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status) values('${id(51)}','energy_kcal','energy_kcal','kcal',100,'observed');
 insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
 values('${id(50)}','${id(2)}','${id(51)}','raw-edible','exact_standard_name',true,'approved','fixture','${owner}',now(),1,true,'{"edible_portion_basis":"edible"}');`;
const raw = (unit: string, product = false) => `jsonb_build_object('schema_version','quantity-v4','raw_value','1/3','raw_unit','${unit}','expected_context_sha256',private.recipe_quantity_context_hash_v4('${id(2)}',${product ? `'${id(3)}','${id(4)}'` : "null,null"}))${product ? `||jsonb_build_object('expected_product_nutrition_version_id','${id(4)}')` : ""}`;

describe.runIf(enabled)("recipe quantity v4 on owned schema-only PostgreSQL", () => {
  beforeAll(() => expect(sql("select count(*) from public.recipes;")).toBe("0"));
  it("keeps legacy row JSON/hash and raw numeric scale unchanged while OFF", () => {
    sql(`${fixture}update public.recipes set created_by='${owner}',visibility='private' where id='${id(10)}';do $t$ declare a jsonb;b jsonb;rows jsonb;original jsonb;begin
      select to_jsonb(s) into a from public.build_recipe_content_snapshot_input('${id(10)}') s;
      if a->'ingredients_json'->0 ? 'quantity_input' then raise exception 'LEGACY_NULL_KEY_ADDED';end if;
      select jsonb_agg(to_jsonb(r)) into original from public.recipe_ingredients r where recipe_id='${id(10)}';
      rows:=jsonb_build_array(jsonb_build_object('row_key','${id(11)}','source_kind','food_product','ingredient_id',null,'food_product_id','${id(3)}','food_product_nutrition_version_id','${id(4)}','amount',0.5,'unit','package','ingredient_type','QUANT','scalable',true));
      perform private.write_recipe_source_rows('${id(10)}','${owner}',rows,original,true);
      select to_jsonb(s) into b from public.build_recipe_content_snapshot_input('${id(10)}') s;
      if a is distinct from b then raise exception 'LEGACY_HASH_CHANGED';end if;
    end $t$;rollback;`);
  });
  it("stores original fractions, independent display quantities and exact product version", () => {
    sql(`${fixture}${generic}update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare q jsonb;begin
        q:=private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'g',${raw("g")});
        if q->>'numerator'<>'1' or q->>'denominator'<>'3' or q->>'raw_value'<>'1/3' or q#>>'{normalized,unit}'<>'g' then raise exception 'RAW_FRACTION_LOST';end if;
        q:=private.recipe_quantity_snapshot_v4(null,'${id(3)}','${id(4)}',200.0/3,'g',jsonb_build_object('schema_version','quantity-v4','raw_value','1/3','raw_unit','package','expected_product_nutrition_version_id','${id(4)}','expected_context_sha256',private.recipe_quantity_context_hash_v4(null,'${id(3)}','${id(4)}')));
        if q->>'denominator'<>'3' or abs((q#>>'{normalized,amount}')::numeric-200.0/3)>0.00000001 or q->'source_versions'<>jsonb_build_array('${id(4)}'::text) then raise exception 'PRODUCT_VERSION_OR_PRECISION_LOST';end if;
      end $t$;rollback;`);
  });
  it("leaves missing density and ambiguous physical counts unknown without a fabricated conversion", () => {
    sql(`${fixture}${generic}do $t$ declare q jsonb;begin
      q:=private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'ml',${raw("ml")});
      if q->'normalized'<>'null'::jsonb or q->>'reason'<>'DENSITY_REQUIRED' then raise exception 'DENSITY_INVENTED';end if;
      q:=private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'알',${raw("알")});
      if q->'normalized'<>'null'::jsonb or q->>'reason'<>'PIECE_IDENTITY_REQUIRED' then raise exception 'PIECE_IDENTITY_INVENTED';end if;
      begin perform private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'g',${raw("ml")});raise exception 'DENSITY_FAILURE_REINTERPRETED';
      exception when invalid_parameter_value then if sqlerrm not in('UNIT_CONVERSION_MISSING','VALIDATION_ERROR') then raise;end if;end;
    end $t$;rollback;`);
  });
  it("rejects stale context, wrong version and direct evidence injection atomically", () => {
    sql(`${fixture}${generic}update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare before_rows jsonb;begin
      select jsonb_agg(to_jsonb(r)) into before_rows from public.recipe_ingredients r;
      begin perform private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'g',${raw("g")}||jsonb_build_object('expected_context_sha256',repeat('0',64)));raise exception 'STALE_CONTEXT_ACCEPTED';
      exception when serialization_failure then if sqlerrm<>'UNIT_CONTEXT_STALE' then raise;end if;end;
      begin perform private.recipe_quantity_snapshot_v4(null,'${id(3)}','${id(4)}',1.0/3,'package',jsonb_build_object('schema_version','quantity-v4','raw_value','1/3','raw_unit','package','expected_product_nutrition_version_id','${id(5)}','expected_context_sha256',private.recipe_quantity_context_hash_v4(null,'${id(3)}','${id(4)}')));raise exception 'WRONG_VERSION_ACCEPTED';
      exception when serialization_failure then if sqlerrm<>'NUTRITION_VERSION_CONFLICT' then raise;end if;end;
      begin update public.recipe_ingredients set quantity_input='{"schema_version":"quantity-v4","raw_value":"1/2","raw_unit":"package","context_sha256":"fake","evidence_ids":["fake"]}' where id='${id(11)}';raise exception 'FAKE_EVIDENCE_ACCEPTED';
      exception when serialization_failure or invalid_parameter_value then null;end;
      if before_rows is distinct from (select jsonb_agg(to_jsonb(r)) from public.recipe_ingredients r) then raise exception 'NEGATIVE_PARTIAL_WRITE';end if;
    end $t$;rollback;`);
  });
  it("managed writer pins metadata and snapshot without rewriting cooking instruction numbers", () => {
    sql(`${fixture}update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare rows jsonb;steps jsonb;result jsonb;r uuid;snapshot jsonb;original jsonb;begin
      rows:=jsonb_build_array(jsonb_build_object('ingredient_id',null,'row_key','${id(20)}','source_kind','food_product','food_product_id','${id(3)}','food_product_nutrition_version_id','${id(4)}','amount',1.0/3,'unit','package','ingredient_type','QUANT','scalable',true,'sort_order',0,'quantity_input',jsonb_build_object('schema_version','quantity-v4','raw_value','1/3','raw_unit','package','expected_product_nutrition_version_id','${id(4)}','expected_context_sha256',private.recipe_quantity_context_hash_v4(null,'${id(3)}','${id(4)}'))));
      steps:=jsonb_build_array(jsonb_build_object('step_number',1,'instruction','0.5팩을 섞어요. 원문 그대로','cooking_method_id','79000000-0000-4000-8000-000000000003','ingredients_used','[]'::jsonb));
      result:=public.create_manual_recipe_with_managed_image('${owner}','2026-01-01',repeat('7',64),1,null,null,'분수 원문',2,null,array[]::text[],'system_suggested',rows,steps);r:=(result->>'id')::uuid;
      select to_jsonb(s) into snapshot from public.build_recipe_content_snapshot_input(r) s;
      if snapshot#>>'{ingredients_json,0,quantity_input,raw_value}'<>'1/3' or not exists(select 1 from public.recipe_steps where recipe_id=r and instruction='0.5팩을 섞어요. 원문 그대로') then raise exception 'RAW_OR_INSTRUCTION_CHANGED';end if;
      select jsonb_agg(to_jsonb(i)) into original from public.recipe_ingredients i where recipe_id=r;
      begin perform private.write_recipe_source_rows(r,'${owner}',jsonb_build_array((rows->0)-'quantity_input'),original,true);raise exception 'OLD_SERIALIZER_DROPPED_RAW';
      exception when invalid_parameter_value then if sqlerrm<>'RECIPE_SOURCE_CONTRACT_REQUIRED' then raise;end if;end;
      update private.quantity_input_v4_policy set enabled=false;
      if snapshot is distinct from (select to_jsonb(s) from public.build_recipe_content_snapshot_input(r) s) then raise exception 'OFF_READ_CHANGED';end if;
      begin perform private.write_recipe_source_rows(r,'${owner}',rows,original,true);raise exception 'OFF_NEW_WRITE_ACCEPTED';exception when sqlstate '55000' then if sqlerrm<>'UNIT_POLICY_INACTIVE' then raise;end if;end;
    end $t$;rollback;`);
  });
  it("keeps an original fraction without a nutrition profile and converts only direct unit families", () => {
    sql(`${fixture}update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare q jsonb;c jsonb;begin
        c:=private.recipe_quantity_options_v4('${id(2)}',null,null);
        if c->>'ready'<>'true' or c->>'raw_default_unit'<>'g' or c ? 'options' then raise exception 'MISSING_PROFILE_APPROVED';end if;
        q:=private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3000,'kg',${raw("g")});
        if q->>'raw_value'<>'1/3' or q->>'denominator'<>'3' or abs((q#>>'{normalized,amount}')::numeric-1.0/3)>0.000000001 then raise exception 'PROFILE_MISSING_RAW_LOST';end if;
        begin perform private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1.0/3,'g',${raw("mL")});raise exception 'MISSING_PROFILE_DENSITY_INVENTED';
        exception when invalid_parameter_value then if sqlerrm<>'UNIT_CONVERSION_MISSING' then raise;end if;end;
      end $t$;rollback;`);
  });
  it("permits explicit TO_TASTE clearing but refuses numeric raw loss and keeps original text", () => {
    sql(`${fixture}${generic}update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare q jsonb;begin
      q:=private.recipe_quantity_snapshot_v4('${id(2)}',null,null,1,'g',jsonb_build_object('schema_version','quantity-v4','raw_value','1','raw_unit','g','expected_context_sha256',private.recipe_quantity_context_hash_v4('${id(2)}',null,null)));
      insert into public.recipe_ingredients(id,recipe_id,ingredient_id,amount,unit,ingredient_type,display_text,scalable,sort_order,quantity_input) values('${id(60)}','${id(10)}','${id(2)}',1,'g','QUANT','소금 약간 원문',true,1,q);
      begin update public.recipe_ingredients set quantity_input=null where id='${id(60)}';raise exception 'RAW_SILENTLY_CLEARED';exception when invalid_parameter_value then if sqlerrm<>'RECIPE_SOURCE_CONTRACT_REQUIRED' then raise;end if;end;
      update public.recipe_ingredients set quantity_input=null,amount=null,unit=null,ingredient_type='TO_TASTE',scalable=false where id='${id(60)}';
      if not exists(select 1 from public.recipe_ingredients where id='${id(60)}' and display_text='소금 약간 원문' and amount is null and unit is null) then raise exception 'TO_TASTE_ORIGINAL_LOST';end if;
    end $t$;rollback;`);
  });
  it("keeps private helpers inaccessible and existing reader owner boundaries intact", () => {
    sql(`${fixture}do $t$ begin
      if has_function_privilege('authenticated','private.recipe_quantity_snapshot_v4(uuid,uuid,uuid,numeric,text,jsonb)','EXECUTE')
        or has_function_privilege('service_role','private.recipe_quantity_snapshot_v4(uuid,uuid,uuid,numeric,text,jsonb)','EXECUTE') then raise exception 'PRIVATE_EXECUTE_LEAK';end if;
      perform set_config('request.jwt.claims','{"role":"authenticated","sub":"79000000-0000-4000-8000-000000000002"}',true);
      begin perform public.read_recipe_product_nutrition_predecessors('79000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('id','x','ingredient_id','${id(2)}','food_product_id','${id(12)}','food_product_nutrition_version_id','${id(13)}','quantity_options_requested',true)));raise exception 'OTHER_PRIVATE_CONTEXT_EXPOSED';
      exception when insufficient_privilege then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
    end $t$;rollback;`);
  });
  it("aligns exact product calculator/SQL guards and rejects cup-to-200mL assumptions in v4", async () => {
    const draft = { title: "고정 제품", base_servings: 2, ingredients: [{ row_key: id(20), source_kind: "food_product", ingredient_id: null, food_product_id: id(3), food_product_nutrition_version_id: id(4), amount: 1 / 3, unit: "package", ingredient_type: "QUANT", scalable: true,
      quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: id(4) } }], steps: [{ step_number: 1, instruction: "0.5팩 원문", cooking_method_id: "79000000-0000-4000-8000-000000000003", ingredients_used: [] }] };
    const client = { from() { throw new Error("Product cannot borrow generic evidence"); }, async rpc(_name: string, args: Record<string, unknown>) {
      return { data: JSON.parse(sql(`${fixture}select public.read_recipe_product_nutrition_predecessors('${owner}',${literal(args.p_ingredients)});rollback;`)), error: null };
    } };
    const prepared = await calculateRecipeDraftNutrition(client, { recipeId: id(10), baseRecipeRevision: 1, draft, ownerUserId: owner });
    expect(prepared.nutritionSnapshot.calculation_version).toBe("recipe-nutrition-v4");
    expect(prepared.nutritionSnapshot.scalable_values.energy_kcal).toBeCloseTo(200, 9);
    const guard = JSON.parse(sql(`${fixture}select public.build_recipe_draft_nutrition_predecessor_guard(${literal(draft)});rollback;`));
    expect(prepared.predecessorGuard).toEqual(guard);
    const sources = JSON.parse(sql(`${fixture}select public.build_recipe_nutrition_contributing_sources(${literal(guard)});rollback;`));
    expect(prepared.nutritionSnapshot.sources).toEqual(sources);
    const { quantity_input: legacyRaw, ...legacyRow } = draft.ingredients[0];
    expect(legacyRaw.raw_value).toBe("1/3");
    const legacyDraft = { ...draft, ingredients: [legacyRow] };
    const legacyNutrition = await calculateRecipeDraftNutrition(client, { recipeId: id(10), baseRecipeRevision: 1, draft: legacyDraft, ownerUserId: owner });
    expect(legacyNutrition.nutritionSnapshot.calculation_version).toBe("recipe-nutrition-v3");
    sql(`${fixture}set local homecook.personal_recipe_v2='on';do $legacy$ declare a jsonb;r uuid;begin
      a:=public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','create',null,null,1,${literal(legacyDraft)},${literal(legacyNutrition.nutritionSnapshot)},null,null,0,'${id(69)}');
      r:=(a->'data'->>'id')::uuid;
      if private.recipe_quantity_mode_metadata_v4(r)<>'{}'::jsonb or not exists(select 1 from public.recipe_nutrition_snapshots where recipe_id=r and is_current and calculation_version='recipe-nutrition-v3') then raise exception 'LEGACY_V3_FORCED_TO_V4';end if;
    end $legacy$;rollback;`);
    const toTasteDraft = { ...draft, ingredients: [{ ...draft.ingredients[0], amount: null, unit: null, ingredient_type: "TO_TASTE", scalable: false, quantity_input: null }] };
    const toTasteNutrition = await calculateRecipeDraftNutrition(client, { recipeId: id(10), baseRecipeRevision: 1,
      draft: toTasteDraft, ownerUserId: owner, quantityMode: true });
    const stampedDraft = { ...draft, ingredients: [{ ...draft.ingredients[0], quantity_input: {
      ...draft.ingredients[0].quantity_input, expected_context_sha256: guard.recipe_ingredients[0].recipe_quantity_context_sha256,
    } }] };
    sql(`${fixture}set local homecook.personal_recipe_v2='on';update private.quantity_input_v4_policy set enabled=true;
      do $t$ declare a jsonb;b jsonb;r uuid;past jsonb;v_to jsonb;v_read jsonb;v_ns uuid;v_row uuid;begin
      a:=public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','create',null,null,1,${literal(stampedDraft)},${literal(prepared.nutritionSnapshot)},null,null,0,'${id(70)}');
      r:=(a->'data'->>'id')::uuid;
      select jsonb_agg(to_jsonb(s) order by s.id) into past from public.recipe_content_snapshots s;
      update private.quantity_input_v4_policy set enabled=false;
      b:=public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','create',null,null,1,${literal(stampedDraft)},${literal(prepared.nutritionSnapshot)},null,null,0,'${id(70)}');
      if a is distinct from b or past is distinct from (select jsonb_agg(to_jsonb(s) order by s.id) from public.recipe_content_snapshots s) then raise exception 'OFF_RECEIPT_OR_PAST_CHANGED';end if;
      begin perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','create',null,null,1,${literal(stampedDraft)},${literal(prepared.nutritionSnapshot)},null,null,0,'${id(71)}');raise exception 'OFF_NEW_WRITE_ACCEPTED';
      exception when sqlstate '55000' then if sqlerrm<>'UNIT_POLICY_INACTIVE' then raise;end if;end;
      begin perform public.preview_recipe_future_plan_impact('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02',r,1,${literal(stampedDraft)});raise exception 'OFF_PREVIEW_WRITE_ACCEPTED';
      exception when sqlstate '55000' then if sqlerrm<>'UNIT_POLICY_INACTIVE' then raise;end if;end;
      if (select count(*) from public.recipes where id=r)<>1 then raise exception 'RECEIPT_DUPLICATED_RECIPE';end if;
      update private.quantity_input_v4_policy set enabled=true;
      select id into v_row from public.recipe_ingredients where recipe_id=r;
      v_to:=jsonb_set(${literal(toTasteDraft)},'{ingredients,0,row_key}',to_jsonb(v_row::text));
      perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',r,null,1,v_to,${literal(toTasteNutrition.nutritionSnapshot)},null,null,0,'${id(72)}');
      if exists(select 1 from public.recipe_ingredients where recipe_id=r and quantity_input is not null)
        or private.recipe_quantity_mode_metadata_v4(r)->>'quantity_policy_version'<>'quantity-v4' then raise exception 'LAST_QUANTITY_REMOVAL_DOWNGRADED';end if;
      v_read:=public.read_recipe_snapshot_entrypoint_context('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02',r);
      if v_read->>'quantity_policy_version'<>'quantity-v4' or v_read#>>'{edit_context,draft,ingredients,0,row_key}'<>v_row::text then raise exception 'REOPEN_MODE_OR_ROW_LOST';end if;
      select id into v_ns from public.recipe_nutrition_snapshots where recipe_id=r and is_current;
      perform public.write_personal_recipe_core('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02','update',r,null,2,v_read#>'{edit_context,draft}',${literal(toTasteNutrition.nutritionSnapshot)},null,null,0,'${id(73)}');
      if not exists(select 1 from public.recipe_nutrition_snapshots where id=v_ns and is_current and calculation_version='recipe-nutrition-v4') then raise exception 'UNCHANGED_SAVE_DOWNGRADED';end if;
      if exists(select 1 from jsonb_array_elements(past) p where not exists(select 1 from public.recipe_content_snapshots s where to_jsonb(s)=p)) then raise exception 'PAST_SNAPSHOT_REWRITTEN';end if;
      -- A stale current nutrition pointer is explicitly unverified, never v3.
      begin update public.recipes set title='unauthorized legacy change' where id=r;raise exception 'LEGACY_WRITE_FENCE_LOST';
      exception when sqlstate '55000' then if sqlerrm<>'legacy account mutation authority is unavailable' then raise;end if;end;
      perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      update public.recipes set title='fixture content changed outside verified update' where id=r;
      perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);
      if private.recipe_quantity_mode_metadata_v4(r)->>'quantity_policy_version'<>'unverified' then raise exception 'STALE_MODE_TREATED_AS_LEGACY';end if;
      begin perform public.read_recipe_snapshot_entrypoint_context('${owner}','2026-01-01',repeat('7',64),1,'2026-01-02',r);raise exception 'STALE_MODE_READ_ACCEPTED';
      exception when serialization_failure then if sqlerrm<>'UNIT_CONTEXT_STALE' then raise;end if;end;

      end $t$;rollback;`);
    const unknown = await calculateRecipeDraftNutrition(client, { recipeId: id(10), baseRecipeRevision: 1, draft: { ...draft, ingredients: [{ ...draft.ingredients[0], unit: "cup" }] }, ownerUserId: owner });
    expect(unknown.nutritionSnapshot.calculation_status).toBe("unavailable");
    expect(unknown.nutritionSnapshot.sources).toEqual([]);
  });
});
