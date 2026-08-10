import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, test } from "vitest";

const enabled = process.env.HOMECOOK_MEAL_LOG_PG === "1";

const owner = "93000000-0000-4000-8000-000000000001";
const identity = "2026-08-10T00:00:00.000Z";
const issued = "2026-08-10T01:00:00.000Z";
const sessionHash = "9".repeat(64);
const cutover = "93000000-0000-4000-8000-000000000002";
const columnComplete = "93100000-0000-4000-8000-000000000001";
const columnPartial = "93100000-0000-4000-8000-000000000002";
const columnUnavailable = "93100000-0000-4000-8000-000000000003";
const recipeComplete = "93200000-0000-4000-8000-000000000001";
const recipePartial = "93200000-0000-4000-8000-000000000002";
const recipeUnavailable = "93200000-0000-4000-8000-000000000003";
const nutritionComplete = "93300000-0000-4000-8000-000000000001";
const nutritionPartial = "93300000-0000-4000-8000-000000000002";
const contentComplete = "93400000-0000-4000-8000-000000000001";
const contentPartial = "93400000-0000-4000-8000-000000000002";
const contentUnavailable = "93400000-0000-4000-8000-000000000003";
const batchA = "93500000-0000-4000-8000-000000000001";
const batchB = "93500000-0000-4000-8000-000000000002";
const batchPartial = "93500000-0000-4000-8000-000000000003";
const batchUnavailable = "93500000-0000-4000-8000-000000000004";
const batchSame = "93500000-0000-4000-8000-000000000005";
const batchDrift = "93500000-0000-4000-8000-000000000006";
const batchCapacity = "93500000-0000-4000-8000-000000000007";
const ingredient = "93600000-0000-4000-8000-000000000001";
const ingredientMissingPiece = "93600000-0000-4000-8000-000000000002";
const ingredientProfile = "93700000-0000-4000-8000-000000000001";
const ingredientMissingProfile = "93700000-0000-4000-8000-000000000002";
const ingredientNutritionProfile = "93800000-0000-4000-8000-000000000001";
const productNutritionProfile = "93800000-0000-4000-8000-000000000002";
const measurementSource = "93900000-0000-4000-8000-000000000001";
const nutrientSource = "93900000-0000-4000-8000-000000000002";
const ingredientSourceItem = "93900000-0000-4000-8000-000000000003";
const productSourceItem = "93900000-0000-4000-8000-000000000004";
const pieceEvidence = "93a00000-0000-4000-8000-000000000001";
const pieceWeight = "93b00000-0000-4000-8000-000000000001";
const volumeEvidence = "93a00000-0000-4000-8000-000000000010";
const volumeAssignment = "93b00000-0000-4000-8000-000000000010";
const product = "93c00000-0000-4000-8000-000000000001";
const productVersion = "93d00000-0000-4000-8000-000000000001";
const productForward = "93c00000-0000-4000-8000-000000000002";
const productForwardVersion = "93d00000-0000-4000-8000-000000000002";
const productReverse = "93c00000-0000-4000-8000-000000000003";
const productReverseVersion = "93d00000-0000-4000-8000-000000000003";
const productMissing = "93c00000-0000-4000-8000-000000000004";
const productMissingVersion = "93d00000-0000-4000-8000-000000000004";
const productDuplicate = "93c00000-0000-4000-8000-000000000005";
const productDuplicateVersion = "93d00000-0000-4000-8000-000000000005";

function psql(sql: string, expectSuccess = true) {
  const result = spawnSync("docker", [
    "exec", "-i", "supabase_db_homecook", "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { encoding: "utf8" });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  return result;
}

function psqlAsync(sql: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("docker", [
      "exec", "-i", "supabase_db_homecook", "psql", "-U", "postgres", "-d", "postgres",
      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function sqlJson(value: unknown) {
  return JSON.stringify(value).replaceAll("'", "''");
}

function payload(source: { type: string; id: string }, amount: number, unit: string, column = columnComplete) {
  return {
    consumed_local_date: "2026-08-10",
    timezone_name_snapshot: "Asia/Seoul",
    consumed_at: null,
    meal_plan_column_id: column,
    source,
    quantity: { amount, unit },
  };
}

function payloadOnDate(source: { type: string; id: string }, amount: number, unit: string) {
  return { ...payload(source, amount, unit), consumed_local_date: "2026-08-11" };
}

function mutationSql(
  action: "create" | "patch" | "delete",
  entryId: string,
  key: string,
  body: unknown,
  expectedRevision: number | null = null,
) {
  return `set local request.jwt.claim.role='service_role'; select public.mutate_meal_log_entry(
    '${owner}'::uuid,'${identity}'::timestamptz,'${sessionHash}'::text,1,'${issued}'::timestamptz,
    '${action}','${entryId}'::uuid,'${key}'::uuid,${expectedRevision ?? "null"},
    '${sqlJson(body)}'::jsonb,'2026-08-10T02:00:00Z'::timestamptz
  );`;
}

function mutation(
  action: "create" | "patch" | "delete",
  entryId: string,
  key: string,
  body: unknown,
  expectedRevision: number | null = null,
) {
  const result = psql(mutationSql(action, entryId, key, body, expectedRevision));
  return JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "null") as {
    success: boolean;
    data: { entry: Record<string, unknown> };
  };
}

function compactKeys(value: unknown) {
  expect(value).toBeTypeOf("object");
  return Object.keys(value as Record<string, unknown>).sort();
}

function stateDigest(batchId = batchDrift) {
  return psql(`select md5(jsonb_build_object(
    'entry',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.meal_log_entries e where e.cooked_batch_id='${batchId}'),
    'event',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.cooked_batch_quantity_events e where e.cooked_batch_id='${batchId}'),
    'batch',(select to_jsonb(b) from public.leftover_dishes b where b.id='${batchId}'),
    'receipt',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.mutation_idempotency_keys r where r.owner_uuid='${owner}' and r.operation_scope like 'meal_log_%')
  )::text);`).stdout.trim();
}

function entryStateDigest(entryId: string) {
  return psql(`select md5(jsonb_build_object(
    'entry',(select to_jsonb(e) from public.meal_log_entries e where e.id='${entryId}'),
    'receipt',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.mutation_idempotency_keys r where r.owner_uuid='${owner}' and r.operation_scope like 'meal_log_%')
  )::text);`).stdout.trim();
}

describe.runIf(enabled)("meal-log core PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      insert into auth.users(id,created_at,email) values('${owner}','${identity}','meal-log-stage3@example.invalid');
      update private.full_local_auth_control
      set authority='local',local_issuer='https://auth.mumeok.kr/auth/v1',cutover_epoch=2,
          hmac_key_version=1,flows_open=true,local_activated_at='2026-08-10T00:00:00Z',updated_at=now()
      where singleton;
      insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json)
      values('${cutover}','promoted',2,'{}'::jsonb);
      update public.account_generation_capability_state
      set state='generation_active',revision=revision+1,current_cutover_attempt_id='${cutover}',activated_at='2026-08-10T00:30:00Z'
      where singleton;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into public.users(id,nickname,social_provider,social_id)
      values('${owner}','meal-log-stage3','google','meal-log-stage3');
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1);
      insert into public.user_account_lifecycles(
        owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
      ) values('${owner}',1,'${identity}','runtime','active',now());
      insert into public.user_session_generation_bindings(
        session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,
        local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at
      ) values(
        '${sessionHash}',1,'${owner}',1,'${identity}','active','local','https://auth.mumeok.kr/auth/v1',
        '${issued}',2,'${issued}','2099-01-01T00:00:00Z'
      );
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values
        ('${columnComplete}','${owner}','완전',1),
        ('${columnPartial}','${owner}','부분',2),
        ('${columnUnavailable}','${owner}','없음',3);
      insert into public.recipes(id,title,base_servings,source_type,created_by,visibility,revision) values
        ('${recipeComplete}','complete batch',2,'manual','${owner}','private',1),
        ('${recipePartial}','partial batch',2,'manual','${owner}','private',1),
        ('${recipeUnavailable}','unavailable batch',2,'manual','${owner}','private',1);
      insert into public.recipe_nutrition_snapshots(
        id,recipe_id,owner_user_id,base_servings,input_hash,calculation_version,
        scalable_values_json,fixed_values_json,nutrient_status_json,calculation_status,
        calculation_quality,reflected_ingredient_count,target_ingredient_count,
        missing_reasons,warnings_json,sources_json,is_current,calculated_at
      ) values
        ('${nutritionComplete}','${recipeComplete}','${owner}',2,repeat('1',64),'stage3-fixture',
          '{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":50,"fat_g":30,"sodium_mg":500}',
          '{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}',
          '{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":50,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":30,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":500,"known_amount":null,"status":"complete","display_mode":"total"}}',
          'complete','direct',1,1,'{}','[]','[]',true,now()),
        ('${nutritionPartial}','${recipePartial}','${owner}',2,repeat('2',64),'stage3-fixture',
          '{"energy_kcal":500}','{"energy_kcal":0}',
          '{"energy_kcal":{"amount":null,"known_amount":500,"status":"partial","display_mode":"minimum"},"carbohydrate_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"protein_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"fat_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"sodium_mg":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null}}',
          'partial','direct',1,2,'{missing}','[]','[]',true,now());
      insert into public.recipe_content_snapshots(
        id,owner_user_id,recipe_id,recipe_nutrition_snapshot_id,title,base_servings,
        ingredients_json,steps_json,content_hash,schema_version
      ) values
        ('${contentComplete}','${owner}','${recipeComplete}','${nutritionComplete}','complete batch',2,'[]','[]',repeat('3',64),1),
        ('${contentPartial}','${owner}','${recipePartial}','${nutritionPartial}','partial batch',2,'[]','[]',repeat('4',64),1),
        ('${contentUnavailable}','${owner}','${recipeUnavailable}',null,'unavailable batch',2,'[]','[]',repeat('5',64),1);
      insert into public.leftover_dishes(
        id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        finished_weight_g,remaining_weight_g,weight_status,batch_status,depleted_reason,revision,event_checksum
      ) values
        ('${batchA}','${owner}','${recipeComplete}','${contentComplete}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchB}','${owner}','${recipeComplete}','${contentComplete}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchPartial}','${owner}','${recipePartial}','${contentPartial}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchUnavailable}','${owner}','${recipeUnavailable}','${contentUnavailable}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchSame}','${owner}','${recipeComplete}','${contentComplete}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchDrift}','${owner}','${recipeComplete}','${contentComplete}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchCapacity}','${owner}','${recipeComplete}','${contentComplete}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex'));
      insert into public.ingredients(id,standard_name,category,default_unit) values
        ('${ingredient}','stage3 exact piece','test','개'),
        ('${ingredientMissingPiece}','stage3 missing piece','test','개');
      insert into public.ingredient_synonyms(ingredient_id,synonym)
      values('${ingredientMissingPiece}','stage3 exact piece');
      insert into public.nutrition_sources(
        id,provider_code,dataset_name,source_kind,source_version,data_basis_date,fetched_at,
        freshness_checked_at,freshness_status,priority_rank,source_url,license_name,license_url,
        manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active
      ) values(
        '${nutrientSource}','STAGE3N','stage3 nutrition','nutrition_dataset','1','2026-08-10',now(),now(),
        'current',1,'https://example.test/nutrition','test-only','https://example.test/license',repeat('8',64),
        'approved','stage3 fixture','${owner}',now(),true
      );
      insert into public.nutrition_source_items(
        id,source_id,external_item_key,external_name,preparation_state,source_basis_text,
        source_basis_amount,source_basis_unit,edible_portion_percent,stable_fingerprint,review_status,
        decision_reason,reviewed_by,reviewed_at
      ) values
        ('${ingredientSourceItem}','${nutrientSource}','stage3-ingredient','stage3 exact piece','raw','100 g',100,'g',100,repeat('9',64),'approved','stage3 fixture','${owner}',now()),
        ('${productSourceItem}','${nutrientSource}','stage3-product','stage3 product',null,'100 g',100,'g',100,repeat('a',64),'approved','stage3 fixture','${owner}',now());
      insert into public.nutrition_profiles(
        id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,
        review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by
      ) values
        ('${ingredientNutritionProfile}','${ingredientSourceItem}','ingredient_source','mass_100g',100,'g',1,'approved','stage3 fixture','${owner}',now(),true,'${owner}'),
        ('${productNutritionProfile}','${productSourceItem}','product_label','mass_100g',100,'g',1,'approved','stage3 fixture','${owner}',now(),true,'${owner}');
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
      select profile_id,nutrient_code,nutrient_code,case when nutrient_code='energy_kcal' then 'kcal' when nutrient_code='sodium_mg' then 'mg' else 'g' end,amount,'observed' from (values
        ('${ingredientNutritionProfile}'::uuid,'energy_kcal',100::numeric),
        ('${ingredientNutritionProfile}'::uuid,'carbohydrate_g',20::numeric),
        ('${ingredientNutritionProfile}'::uuid,'protein_g',10::numeric),
        ('${ingredientNutritionProfile}'::uuid,'fat_g',5::numeric),
        ('${ingredientNutritionProfile}'::uuid,'sodium_mg',50::numeric)
      ) values(profile_id,nutrient_code,amount);
      insert into public.ingredient_nutrition_profiles(
        id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values
        ('${ingredientProfile}','${ingredient}','${ingredientNutritionProfile}','raw','exact_standard_name',true,'approved','stage3 fixture','${owner}',now(),1,true),
        ('${ingredientMissingProfile}','${ingredientMissingPiece}','${ingredientNutritionProfile}','raw','exact_standard_name',true,'approved','stage3 fixture','${owner}',now(),1,true);
      insert into public.nutrition_sources(
        id,provider_code,dataset_name,source_kind,source_version,data_basis_date,fetched_at,
        freshness_checked_at,freshness_status,priority_rank,source_url,license_name,license_url,
        manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active
      ) values(
        '${measurementSource}','STAGE3','stage3 piece evidence','measurement_reference','1','2026-08-10',now(),now(),
        'current',1,'https://example.test/piece','test-only','https://example.test/license',repeat('6',64),
        'approved','stage3 fixture','${owner}',now(),true
      );
      insert into public.measurement_source_evidence(
        id,source_id,evidence_kind,source_subject,preparation_state,size_code,source_observed_unit,
        source_observed_amount,observed_weight_g,source_url,source_accessed_at,evidence_fingerprint,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '${pieceEvidence}','${measurementSource}','piece_weight','stage3 exact piece','raw','medium','piece',
        1,50,'https://example.test/piece','2026-08-10',repeat('7',64),'approved','stage3 fixture','${owner}',now(),1,true
      );
      insert into public.piece_unit_weights(
        id,ingredient_id,evidence_id,size_code,preparation_state,weight_g,review_status,
        decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '${pieceWeight}','${ingredient}','${pieceEvidence}','medium','raw',50,'approved',
        'stage3 fixture','${owner}',now(),1,true
      );
      insert into public.measurement_source_evidence(
        id,source_id,evidence_kind,source_subject,preparation_state,source_observed_unit,
        source_observed_amount,observed_volume_ml,observed_weight_g,normalized_g_per_15ml,
        source_url,source_accessed_at,evidence_fingerprint,review_status,decision_reason,
        reviewed_by,reviewed_at,version,is_active
      ) values(
        '${volumeEvidence}','${measurementSource}','volume_weight','stage3 exact piece','raw','tbsp',
        1,15,10,10,'https://example.test/volume','2026-08-10',repeat('e',64),
        'approved','stage3 fixture','${owner}',now(),1,true
      );
      insert into public.ingredient_conversion_assignments(
        id,ingredient_id,conversion_profile_id,evidence_id,preparation_state,distance_g_per_15ml,
        candidate_rank,confidence_score,assignment_reason,review_status,reviewed_by,reviewed_at,version,is_active
      ) select
        '${volumeAssignment}','${ingredient}',profile.id,'${volumeEvidence}','raw',0,
        1,1,'stage3 fixture','approved','${owner}',now(),1,true
      from public.measurement_conversion_profiles profile where profile.code='VOLUME_G10' and profile.is_active;
      set session_replication_role='replica';
      set constraints all deferred;
      insert into public.food_products(
        id,owner_user_id,visibility,source_type,name,brand,current_nutrition_version_id,moderation_status
      ) values
        ('${product}','${owner}','private','manual','stage3 product','brand','${productVersion}','visible'),
        ('${productForward}','${owner}','private','manual','stage3 forward product','brand','${productForwardVersion}','visible'),
        ('${productReverse}','${owner}','private','manual','stage3 reverse product','brand','${productReverseVersion}','visible'),
        ('${productMissing}','${owner}','private','manual','stage3 missing product','brand','${productMissingVersion}','visible'),
        ('${productDuplicate}','${owner}','private','manual','stage3 duplicate product','brand','${productDuplicateVersion}','visible');
      insert into public.food_product_nutrition_versions(
        id,product_id,nutrition_profile_id,version,basis_relations_json,created_by
      ) values
        ('${productVersion}','${product}','${productNutritionProfile}',1,'[]','${owner}'),
        ('${productForwardVersion}','${productForward}','${productNutritionProfile}',1,
          '[{"from":{"amount":1,"unit":"serving"},"to":{"amount":50,"unit":"g"}}]','${owner}'),
        ('${productReverseVersion}','${productReverse}','${productNutritionProfile}',1,
          '[{"from":{"amount":100,"unit":"g"},"to":{"amount":2,"unit":"serving"}}]','${owner}'),
        ('${productMissingVersion}','${productMissing}','${productNutritionProfile}',1,'[]','${owner}'),
        ('${productDuplicateVersion}','${productDuplicate}','${productNutritionProfile}',1,
          '[{"from":{"amount":1,"unit":"serving"},"to":{"amount":50,"unit":"g"}},{"from":{"amount":1,"unit":"serving"},"to":{"amount":80,"unit":"g"}}]','${owner}');
      set session_replication_role='origin';
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
      select '${productNutritionProfile}'::uuid,nutrient_code,nutrient_code,case when nutrient_code='energy_kcal' then 'kcal' when nutrient_code='sodium_mg' then 'mg' else 'g' end,amount,'observed' from (values
        ('energy_kcal',200::numeric),('carbohydrate_g',40::numeric),('protein_g',20::numeric),
        ('fat_g',10::numeric),('sodium_mg',100::numeric)
      ) values(nutrient_code,amount);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);
    `);
  });

  test("fresh schema exposes only service-role RPC execution", () => {
    const result = psql(`select jsonb_build_object(
      'table',to_regclass('public.meal_log_entries') is not null,
      'rls',(select relrowsecurity from pg_class where oid='public.meal_log_entries'::regclass),
      'authenticated_insert',has_table_privilege('authenticated','public.meal_log_entries','INSERT'),
      'authenticated_update',has_table_privilege('authenticated','public.meal_log_entries','UPDATE'),
      'authenticated_delete',has_table_privilege('authenticated','public.meal_log_entries','DELETE'),
      'authenticated_rpc',has_function_privilege('authenticated','public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)','EXECUTE'),
      'service_rpc',has_function_privilege('service_role','public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)','EXECUTE')
    );`);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      table: true, rls: true, authenticated_insert: false, authenticated_update: false,
      authenticated_delete: false, authenticated_rpc: false, service_rpc: true,
    });
  });

  test("executes all three mutation sources with one compact nutrition contract", () => {
    const batch = mutation("create", "94000000-0000-4000-8000-000000000001", "94100000-0000-4000-8000-000000000001", payload({ type: "cooked_batch", id: batchA }, 100, "g"));
    const productResult = mutation("create", "94000000-0000-4000-8000-000000000002", "94100000-0000-4000-8000-000000000002", payload({ type: "food_product", id: product }, 50, "g"));
    const piece = mutation("create", "94000000-0000-4000-8000-000000000003", "94100000-0000-4000-8000-000000000003", payload({ type: "ingredient", id: ingredient }, 2, "piece"));
    const expectedKeys = ["calculation_status", "calories_kcal", "carbohydrate_g", "fat_g", "protein_g", "sodium_mg"].sort();
    for (const result of [batch, productResult, piece]) {
      expect(compactKeys(result.data.entry.nutrition)).toEqual(expectedKeys);
    }
    expect(batch.data.entry.nutrition).toMatchObject({ calculation_status: "complete", calories_kcal: 100 });
    expect(productResult.data.entry.nutrition).toMatchObject({ calculation_status: "complete", calories_kcal: 100 });
    expect(piece.data.entry.nutrition).toMatchObject({ calculation_status: "complete", calories_kcal: 100 });
    expect(psql(`select conversion_evidence_id from public.meal_log_entries where id='94000000-0000-4000-8000-000000000003';`).stdout.trim()).toBe(pieceEvidence);
  });

  test("preserves exact piece pins and rejects missing, rejected, or stale evidence", () => {
    const patch = mutation("patch", "94000000-0000-4000-8000-000000000003", "94100000-0000-4000-8000-000000000004", {
      ...payload({ type: "ingredient", id: ingredient }, 3, "piece"), expected_revision: 1,
    }, 1);
    expect(patch.data.entry.nutrition).toMatchObject({ calories_kcal: 150 });
    expect(psql(`select conversion_evidence_id from public.meal_log_entries where id='94000000-0000-4000-8000-000000000003';`).stdout.trim()).toBe(pieceEvidence);

    const missing = psql(mutationSql("create", "94000000-0000-4000-8000-000000000004", "94100000-0000-4000-8000-000000000005", payload({ type: "ingredient", id: ingredientMissingPiece }, 1, "piece")), false);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("UNIT_CONVERSION_MISSING");

    const rejected = psql(`begin;
      insert into public.measurement_source_evidence(
        id,source_id,evidence_kind,source_subject,preparation_state,size_code,source_observed_unit,
        source_observed_amount,observed_weight_g,source_url,source_accessed_at,evidence_fingerprint,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '93a00000-0000-4000-8000-000000000002','${measurementSource}','piece_weight','stage3 exact piece','raw','medium','piece',
        1,50,'https://example.test/rejected-piece','2026-08-10',repeat('b',64),
        'approved','stage3 rejected fixture source','${owner}',now(),1,true
      );
      insert into public.piece_unit_weights(
        id,ingredient_id,evidence_id,size_code,preparation_state,weight_g,review_status,
        decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '93b00000-0000-4000-8000-000000000002','${ingredientMissingPiece}','93a00000-0000-4000-8000-000000000002',
        'medium','raw',50,'rejected','stage3 rejected fixture','${owner}',now(),1,false
      );
      ${mutationSql("create", "94000000-0000-4000-8000-000000000005", "94100000-0000-4000-8000-000000000006", payload({ type: "ingredient", id: ingredientMissingPiece }, 1, "piece"))}
      rollback;`, false);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("UNIT_CONVERSION_MISSING");

    const stale = psql(`begin;
      insert into public.nutrition_sources(
        id,provider_code,dataset_name,source_kind,source_version,data_basis_date,fetched_at,
        freshness_checked_at,freshness_status,priority_rank,source_url,license_name,license_url,
        manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active
      ) values(
        '93900000-0000-4000-8000-000000000005','STAGE3S','stage3 stale piece','measurement_reference','1','2026-08-10',now(),now(),
        'current',1,'https://example.test/stale-piece','test-only','https://example.test/license',repeat('c',64),
        'approved','stage3 stale fixture','${owner}',now(),true
      );
      insert into public.measurement_source_evidence(
        id,source_id,evidence_kind,source_subject,preparation_state,size_code,source_observed_unit,
        source_observed_amount,observed_weight_g,source_url,source_accessed_at,evidence_fingerprint,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '93a00000-0000-4000-8000-000000000003','93900000-0000-4000-8000-000000000005','piece_weight','stage3 exact piece','raw','medium','piece',
        1,50,'https://example.test/stale-piece','2026-08-10',repeat('d',64),
        'approved','stage3 stale fixture','${owner}',now(),1,true
      );
      insert into public.piece_unit_weights(
        id,ingredient_id,evidence_id,size_code,preparation_state,weight_g,review_status,
        decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values(
        '93b00000-0000-4000-8000-000000000003','${ingredientMissingPiece}','93a00000-0000-4000-8000-000000000003',
        'medium','raw',50,'approved','stage3 stale fixture','${owner}',now(),1,true
      );
      update public.nutrition_sources
      set freshness_status='stale',review_status='superseded',is_active=false,
          decision_reason='stage3 stale fixture',reviewed_by='${owner}',reviewed_at=now()
      where id='93900000-0000-4000-8000-000000000005';
      ${mutationSql("create", "94000000-0000-4000-8000-000000000006", "94100000-0000-4000-8000-000000000007", payload({ type: "ingredient", id: ingredientMissingPiece }, 1, "piece"))}
      rollback;`, false);
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain("UNIT_CONVERSION_MISSING");
  });

  test("reselects exact evidence across piece, volume, and mass PATCH classes", () => {
    const conversionEntry = "94800000-0000-4000-8000-000000000010";
    mutation("create", conversionEntry, "94900000-0000-4000-8000-000000000010", payloadOnDate({ type: "ingredient", id: ingredient }, 1, "piece"));
    const pieceToVolume = mutation("patch", conversionEntry, "94100000-0000-4000-8000-000000000011", {
      ...payloadOnDate({ type: "ingredient", id: ingredient }, 1, "tbsp"), expected_revision: 1,
    }, 1);
    expect(pieceToVolume.data.entry.nutrition).toMatchObject({ calories_kcal: 10 });
    expect(psql(`select conversion_evidence_id from public.meal_log_entries where id='${conversionEntry}';`).stdout.trim()).toBe(volumeEvidence);

    const volumeToPiece = mutation("patch", conversionEntry, "94100000-0000-4000-8000-000000000012", {
      ...payloadOnDate({ type: "ingredient", id: ingredient }, 1, "piece"), expected_revision: 2,
    }, 2);
    expect(volumeToPiece.data.entry.nutrition).toMatchObject({ calories_kcal: 50 });
    expect(psql(`select conversion_evidence_id from public.meal_log_entries where id='${conversionEntry}';`).stdout.trim()).toBe(pieceEvidence);

    const pieceToVolumeAgain = mutation("patch", conversionEntry, "94100000-0000-4000-8000-000000000013", {
      ...payloadOnDate({ type: "ingredient", id: ingredient }, 2, "tbsp"), expected_revision: 3,
    }, 3);
    expect(pieceToVolumeAgain.data.entry.nutrition).toMatchObject({ calories_kcal: 20 });
    expect(psql(`select conversion_evidence_id from public.meal_log_entries where id='${conversionEntry}';`).stdout.trim()).toBe(volumeEvidence);

    const volumeToMass = mutation("patch", conversionEntry, "94100000-0000-4000-8000-000000000014", {
      ...payloadOnDate({ type: "ingredient", id: ingredient }, 25, "g"), expected_revision: 4,
    }, 4);
    expect(volumeToMass.data.entry.nutrition).toMatchObject({ calories_kcal: 25 });
    expect(psql(`select conversion_evidence_id is null from public.meal_log_entries where id='${conversionEntry}';`).stdout.trim()).toBe("t");
  });

  test("fails closed with rollback for missing or ambiguous requested conversion evidence", () => {
    const missingEntry = "94800000-0000-4000-8000-000000000001";
    mutation("create", missingEntry, "94900000-0000-4000-8000-000000000001", payloadOnDate({ type: "ingredient", id: ingredientMissingPiece }, 10, "g"));
    const missingBefore = entryStateDigest(missingEntry);
    const missing = psql(mutationSql("patch", missingEntry, "94900000-0000-4000-8000-000000000002", {
      ...payloadOnDate({ type: "ingredient", id: ingredientMissingPiece }, 1, "tbsp"), expected_revision: 1,
    }, 1), false);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("UNIT_CONVERSION_MISSING");
    expect(entryStateDigest(missingEntry)).toBe(missingBefore);

    const ambiguousEntry = "94800000-0000-4000-8000-000000000002";
    mutation("create", ambiguousEntry, "94900000-0000-4000-8000-000000000003", payloadOnDate({ type: "ingredient", id: ingredient }, 10, "g"));
    const ambiguousBefore = entryStateDigest(ambiguousEntry);
    const ambiguous = psql(`begin;
      drop index public.ingredient_conversion_assignments_active_idx;
      insert into public.measurement_source_evidence(
        id,source_id,evidence_kind,source_subject,preparation_state,source_observed_unit,
        source_observed_amount,observed_volume_ml,observed_weight_g,normalized_g_per_15ml,
        source_url,source_accessed_at,evidence_fingerprint,review_status,decision_reason,
        reviewed_by,reviewed_at,version,is_active
      ) values(
        '93a00000-0000-4000-8000-000000000011','${measurementSource}','volume_weight','stage3 exact piece','raw','tbsp',
        1,15,15,15,'https://example.test/ambiguous-volume','2026-08-10',repeat('f',64),
        'approved','stage3 ambiguous fixture','${owner}',now(),1,true
      );
      insert into public.ingredient_conversion_assignments(
        id,ingredient_id,conversion_profile_id,evidence_id,preparation_state,distance_g_per_15ml,
        candidate_rank,confidence_score,assignment_reason,review_status,reviewed_by,reviewed_at,version,is_active
      ) select
        '93b00000-0000-4000-8000-000000000011','${ingredient}',profile.id,
        '93a00000-0000-4000-8000-000000000011','raw',0,2,1,'stage3 ambiguous fixture',
        'approved','${owner}',now(),1,true
      from public.measurement_conversion_profiles profile where profile.code='VOLUME_G15' and profile.is_active;
      ${mutationSql("patch", ambiguousEntry, "94900000-0000-4000-8000-000000000004", {
        ...payloadOnDate({ type: "ingredient", id: ingredient }, 1, "tbsp"), expected_revision: 1,
      }, 1)}
      rollback;`, false);
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toContain("UNIT_CONVERSION_MISSING");
    expect(entryStateDigest(ambiguousEntry)).toBe(ambiguousBefore);
  });

  test("requires exactly one direct product basis relation in either direction", () => {
    const forward = mutation("create", "94800000-0000-4000-8000-000000000003", "94900000-0000-4000-8000-000000000005", payloadOnDate({ type: "food_product", id: productForward }, 1, "serving"));
    const reverse = mutation("create", "94800000-0000-4000-8000-000000000004", "94900000-0000-4000-8000-000000000006", payloadOnDate({ type: "food_product", id: productReverse }, 1, "serving"));
    expect(forward.data.entry.nutrition).toMatchObject({ calories_kcal: 100 });
    expect(reverse.data.entry.nutrition).toMatchObject({ calories_kcal: 100 });

    for (const [entryId, key, sourceId] of [
      ["94800000-0000-4000-8000-000000000005", "94900000-0000-4000-8000-000000000007", productMissing],
      ["94800000-0000-4000-8000-000000000006", "94900000-0000-4000-8000-000000000008", productDuplicate],
    ] as const) {
      const before = entryStateDigest(entryId);
      const result = psql(`begin; ${mutationSql("create", entryId, key, payloadOnDate({ type: "food_product", id: sourceId }, 1, "serving"))} rollback;`, false);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("UNIT_CONVERSION_MISSING");
      expect(entryStateDigest(entryId)).toBe(before);
    }
  });

  test("preserves complete, partial, unavailable slot and day folds with deleted history", () => {
    mutation("create", "94000000-0000-4000-8000-000000000007", "94100000-0000-4000-8000-000000000008", payload({ type: "cooked_batch", id: batchPartial }, 100, "g", columnPartial));
    mutation("create", "94000000-0000-4000-8000-000000000008", "94100000-0000-4000-8000-000000000009", payload({ type: "cooked_batch", id: batchUnavailable }, 100, "g", columnUnavailable));
    mutation("delete", "94000000-0000-4000-8000-000000000002", "94100000-0000-4000-8000-000000000010", { expected_revision: 1 }, 1);
    psql(`begin; select public.set_account_generation_internal_writer_marker('${cutover}',true); delete from public.meal_plan_columns where id='${columnUnavailable}'; select public.set_account_generation_internal_writer_marker('${cutover}',false); commit;`);
    const response = JSON.parse(psql(`begin; set local request.jwt.claim.role='service_role'; select public.get_meal_log_day('${owner}','${identity}','${sessionHash}',1,'${issued}','2026-08-10'); commit;`).stdout.trim().split("\n").find((line) => line.startsWith("{")) ?? "null") as {
      data: { active_sections: Array<Record<string, unknown>>; deleted_column_sections: Array<Record<string, unknown>>; day_total: Record<string, unknown>; entries: Array<Record<string, unknown>> };
    };
    const complete = response.data.active_sections.find((section) => section.slot_name_snapshot === "완전");
    const partial = response.data.active_sections.find((section) => section.slot_name_snapshot === "부분");
    const unavailable = response.data.deleted_column_sections.find((section) => section.slot_name_snapshot === "없음");
    expect((complete?.subtotal as Record<string, unknown>)?.calculation_status).toBe("complete");
    expect((complete?.subtotal as Record<string, unknown>)?.calories_kcal).toBe(250);
    expect((partial?.subtotal as Record<string, unknown>)?.calculation_status).toBe("partial");
    expect((unavailable?.subtotal as Record<string, unknown>)?.calculation_status).toBe("unavailable");
    expect(response.data.day_total.calculation_status).toBe("partial");
    expect(response.data.day_total.calories_kcal).toBe(300);
    expect(response.data.entries).toHaveLength(4);
    expect(psql(`select count(*) from public.meal_log_entries where id='94000000-0000-4000-8000-000000000002' and deleted_at is not null;`).stdout.trim()).toBe("1");
  });

  test.each([
    ["remaining", "remaining_weight_g=999"],
    ["revision", "revision=2"],
    ["checksum", "event_checksum='drift'"],
    ["status", "status='eaten',eaten_at=now(),auto_hide_at=now()+interval '30 days'"],
  ])("fails closed with zero writes for %s projection drift", (_kind, update) => {
    const before = stateDigest();
    const key = `94200000-0000-4000-8000-00000000000${String(_kind).length}`;
    const entry = `94300000-0000-4000-8000-00000000000${String(_kind).length}`;
    const result = psql(`begin; set local request.jwt.claim.role='service_role'; select public.set_account_generation_internal_writer_marker('${cutover}',true); select set_config('homecook.cooked_batch_writer','${batchDrift}',true); update public.leftover_dishes set ${update} where id='${batchDrift}'; ${mutationSql("create", entry, key, payload({ type: "cooked_batch", id: batchDrift }, 10, "g"))} rollback;`, false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CONFLICT");
    expect(stateDigest()).toBe(before);
  });

  test("avoids A-to-B and B-to-A deadlock with canonical batch locks", async () => {
    mutation("create", "94400000-0000-4000-8000-000000000001", "94500000-0000-4000-8000-000000000001", payload({ type: "cooked_batch", id: batchA }, 100, "g"));
    mutation("create", "94400000-0000-4000-8000-000000000002", "94500000-0000-4000-8000-000000000002", payload({ type: "cooked_batch", id: batchB }, 100, "g"));
    const first = `begin; select 1 from public.meal_log_entries where id='94400000-0000-4000-8000-000000000001' for update; select pg_sleep(0.2); ${mutationSql("patch", "94400000-0000-4000-8000-000000000001", "94500000-0000-4000-8000-000000000003", { ...payload({ type: "cooked_batch", id: batchB }, 100, "g"), expected_revision: 1 }, 1)} commit;`;
    const second = `begin; select 1 from public.meal_log_entries where id='94400000-0000-4000-8000-000000000002' for update; select pg_sleep(0.2); ${mutationSql("patch", "94400000-0000-4000-8000-000000000002", "94500000-0000-4000-8000-000000000004", { ...payload({ type: "cooked_batch", id: batchA }, 100, "g"), expected_revision: 1 }, 1)} commit;`;
    const [a, b] = await Promise.all([psqlAsync(first), psqlAsync(second)]);
    expect(a.status, a.stderr).toBe(0);
    expect(b.status, b.stderr).toBe(0);
    expect(psql(`select jsonb_object_agg(id,remaining_weight_g) from public.leftover_dishes where id in ('${batchA}','${batchB}');`).stdout).toContain("900");
  });

  test("preserves the full cached projection and accepts the next mutation after same-batch PATCH", () => {
    mutation("create", "94600000-0000-4000-8000-000000000001", "94700000-0000-4000-8000-000000000001", payload({ type: "cooked_batch", id: batchSame }, 100, "g"));
    mutation("create", "94600000-0000-4000-8000-000000000002", "94700000-0000-4000-8000-000000000002", payload({ type: "cooked_batch", id: batchSame }, 200, "g"));
    mutation("patch", "94600000-0000-4000-8000-000000000001", "94700000-0000-4000-8000-000000000003", { ...payload({ type: "cooked_batch", id: batchSame }, 150, "g"), expected_revision: 1 }, 1);
    expect(Number(psql(`select remaining_weight_g from public.leftover_dishes where id='${batchSame}';`).stdout.trim())).toBe(650);
    expect(psql(`select count(*) from public.cooked_batch_quantity_events e where e.cooked_batch_id='${batchSame}' and e.event_type='consumed' and not exists(select 1 from public.cooked_batch_quantity_events r where r.reverses_event_id=e.id);`).stdout.trim()).toBe("2");
    const invariant = psql(`select private.assert_cooked_batch_cached_projection('${batchSame}','${owner}');`, false);
    const next = psql(mutationSql("create", "94600000-0000-4000-8000-000000000003", "94700000-0000-4000-8000-000000000004", payload({ type: "cooked_batch", id: batchSame }, 10, "g")), false);
    expect.soft(invariant.status, invariant.stderr).toBe(0);
    expect.soft(next.status, next.stderr).toBe(0);
    expect(Number(psql(`select remaining_weight_g from public.leftover_dishes where id='${batchSame}';`).stdout.trim())).toBe(640);
  });

  test("credits only the owned reversal for same-batch capacity, rollback, and replay", () => {
    const changedEntry = "94a00000-0000-4000-8000-000000000001";
    const otherEntry = "94a00000-0000-4000-8000-000000000002";
    mutation("create", changedEntry, "94b00000-0000-4000-8000-000000000001", payload({ type: "cooked_batch", id: batchCapacity }, 300, "g"));
    mutation("create", otherEntry, "94b00000-0000-4000-8000-000000000002", payload({ type: "cooked_batch", id: batchCapacity }, 200, "g"));
    const otherEvent = psql(`select active_consumption_event_id from public.meal_log_entries where id='${otherEntry}';`).stdout.trim();

    const increase = mutation("patch", changedEntry, "94b00000-0000-4000-8000-000000000003", {
      ...payload({ type: "cooked_batch", id: batchCapacity }, 700, "g"), expected_revision: 1,
    }, 1);
    expect(increase.data.entry).toMatchObject({ revision: 2, quantity: { amount: 700, unit: "g" } });
    expect(Number(psql(`select remaining_weight_g from public.leftover_dishes where id='${batchCapacity}';`).stdout.trim())).toBe(100);
    expect(psql(`select active_consumption_event_id from public.meal_log_entries where id='${otherEntry}';`).stdout.trim()).toBe(otherEvent);

    const equalityBody = { ...payload({ type: "cooked_batch", id: batchCapacity }, 800, "g"), expected_revision: 2 };
    const equality = mutation("patch", changedEntry, "94b00000-0000-4000-8000-000000000004", equalityBody, 2);
    const eventCount = psql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batchCapacity}';`).stdout.trim();
    const replay = mutation("patch", changedEntry, "94b00000-0000-4000-8000-000000000004", equalityBody, 2);
    expect(replay).toEqual(equality);
    expect(psql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batchCapacity}';`).stdout.trim()).toBe(eventCount);
    expect(Number(psql(`select remaining_weight_g from public.leftover_dishes where id='${batchCapacity}';`).stdout.trim())).toBe(0);
    expect(psql(`select count(*) from public.meal_log_entries where cooked_batch_id='${batchCapacity}' and deleted_at is null;`).stdout.trim()).toBe("2");

    const before = stateDigest(batchCapacity);
    const overdraw = psql(mutationSql("patch", changedEntry, "94b00000-0000-4000-8000-000000000005", {
      ...payload({ type: "cooked_batch", id: batchCapacity }, 801, "g"), expected_revision: 3,
    }, 3), false);
    expect(overdraw.status).not.toBe(0);
    expect(overdraw.stderr).toContain("CONFLICT");
    expect(stateDigest(batchCapacity)).toBe(before);
  });
});
