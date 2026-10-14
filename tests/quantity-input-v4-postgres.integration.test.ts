import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { isQuantityInputSnapshot } from "@/lib/quantity-input";

const enabled = process.env.HOMECOOK_QUANTITY_V4_ISOLATED_PG === "1";
const container = process.env.HOMECOOK_QUANTITY_V4_TEST_CONTAINER ?? "";
const tag = process.env.HOMECOOK_QUANTITY_V4_TEST_TAG ?? "";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
if (enabled && (!/^[a-f0-9]{64}$/u.test(container) || !/^[a-f0-9]{32}$/u.test(tag))) throw Error("An exact owned offline quantity fixture is required");
const owner = "c1000000-0000-4000-8000-000000000001";
const other = "c1000000-0000-4000-8000-000000000002";
const ingredient = "c2000000-0000-4000-8000-000000000001";
const profile = "c3000000-0000-4000-8000-000000000001";
const nutrition = "c4000000-0000-4000-8000-000000000001";
const column = "c5000000-0000-4000-8000-000000000001";
const cutover = "c6000000-0000-4000-8000-000000000001";
const source = "c7000000-0000-4000-8000-000000000001";
const recipe = "c9000000-0000-4000-8000-000000000001";
const content = "c9000000-0000-4000-8000-000000000002";
const recipeNutrition = "c9000000-0000-4000-8000-000000000003";
const batch = "c9000000-0000-4000-8000-000000000004";
const epoch = "2026-08-10T00:00:00Z";
const issued = "2026-08-10T01:00:00Z";
const hash = "d".repeat(64);
const args = `'${owner}','${epoch}','${hash}',1,'${issued}'`;
function id(n: number) { return `c8000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
function sql(statement: string, succeeds = true, bootstrap = false) {
  const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
  delete env.DOCKER_CONTEXT; delete env.DOCKER_TLS_VERIFY; delete env.DOCKER_CERT_PATH;
  const inspect = spawnSync("docker", ["inspect", container], { encoding: "utf8", env });
  if (inspect.status !== 0) throw Error("Owned offline fixture is unavailable");
  const current = JSON.parse(inspect.stdout)[0];
  if (current.Config.Labels["homecook.quantity-v4-test"] !== tag || current.Config.Image !== image || current.HostConfig.NetworkMode !== "none") throw Error("Refusing unowned or networked fixture");
  const result = spawnSync("docker", ["exec", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1", "-c", `${bootstrap ? "" : "set session authorization postgres;"} ${statement}`], { encoding: "utf8", env });
  if (succeeds) expect(result.status, result.stderr).toBe(0);
  return result;
}
function json(statement: string) {
  return JSON.parse(sql(statement).stdout.trim().split("\n").find(line => line.startsWith("{")) ?? "null");
}
function body(amount: number, unit: string, rawValue = String(amount)) {
  return { consumed_local_date: "2026-10-14", timezone_name_snapshot: "Asia/Seoul", consumed_at: null,
    meal_plan_column_id: column, source: { type: "ingredient", id: ingredient }, quantity: { amount, unit },
    quantity_input: { schema_version: "quantity-v4", raw_value: rawValue, raw_unit: unit } };
}
function mutation(n: number, payload: unknown = body(200, "mL"), action = "create", revision = "null") {
  return `begin; set local request.jwt.claim.role='service_role'; select public.mutate_meal_log_entry(${args},'${action}','${id(n)}','${id(n + (action === "create" ? 100 : 200))}',${revision},'${JSON.stringify(payload)}',clock_timestamp()); commit;`;
}
function preview(amount = 200, unit = "mL", rawValue = String(amount)) {
  return `begin; set local request.jwt.claim.role='service_role'; select public.preview_meal_log_nutrition(${args},'ingredient','${ingredient}',${amount},'${unit}','${JSON.stringify(body(amount, unit, rawValue).quantity_input)}'); commit;`;
}
function seedMeasuredIngredient(n: number, name: string, unit: string, piece: boolean) {
  sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);
    insert into public.ingredients(id,standard_name,category,default_unit) values('${id(n)}','${name}','fixture','${unit}');
    insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
    values('${id(n + 1)}','${source}','fixture-${n}','${name}','raw',100,'fixture-${n}','approved','fixture','${owner}',now());
    insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
    values('${id(n + 2)}','${id(n + 1)}','ingredient_source','mass_100g',100,'g',1,'approved','fixture','${owner}',now(),true,'${owner}');
    insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
    values('${id(n + 3)}','${id(n)}','${id(n + 2)}','raw','exact_standard_name',true,'approved','fixture','${owner}',now(),1,true,'{"edible_portion_basis":"edible","size_code":"medium"}');
    insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
    values('${id(n + 2)}','energy_kcal','energy_kcal','kcal',100,'observed');
    insert into public.measurement_source_evidence(id,source_id,evidence_kind,source_subject,preparation_state,size_code,source_observed_unit,source_observed_amount,observed_volume_ml,observed_weight_g,normalized_g_per_15ml,source_url,source_accessed_at,evidence_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
    values('${id(n + 4)}','${id(700)}','${piece ? "piece_weight" : "volume_weight"}','${name}','raw',${piece ? "'medium'" : "null"},'${piece ? "알" : "mL"}',${piece ? 1 : 100},${piece ? "null" : 100},${piece ? 3 : 103},${piece ? "null" : 15.45},'https://example.invalid','2026-10-14','fixture-${n}','approved','fixture','${owner}',now(),1,true,
      '{"edible_portion_basis":"edible","quality":"${piece ? "average" : "measured"}","physical_unit":"알"}');
    ${piece ? `insert into public.piece_unit_weights(id,ingredient_id,evidence_id,size_code,preparation_state,weight_g,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active)
      values('${id(n + 5)}','${id(n)}','${id(n + 4)}','medium','raw',3,'approved','fixture','${owner}',now(),1,true);`
      : `insert into public.ingredient_conversion_assignments(id,ingredient_id,conversion_profile_id,evidence_id,preparation_state,distance_g_per_15ml,candidate_rank,confidence_score,assignment_reason,review_status,reviewed_by,reviewed_at,version,is_active)
      values('${id(n + 5)}','${id(n)}','${id(701)}','${id(n + 4)}','raw',0.45,1,1,'fixture','approved','${owner}',now(),1,true);`}
    select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
}

describe.runIf(enabled)("quantity v4 on owned schema-only PostgreSQL", () => {
  beforeAll(() => {
    sql(`set session_replication_role=replica;
      insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at)
      values(true,'local','https://auth.mumeok.kr/auth/v1',2,1,true,'${epoch}');
      insert into private.ingredient_ai_nutrition_settings(singleton,enabled) values(true,false);
      insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
      insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'${cutover}','${epoch}');
      set session_replication_role=origin; set session authorization postgres;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into auth.users(id,created_at,email) values('${owner}','${epoch}','quantity-owner@example.invalid'),('${other}','${epoch}','quantity-other@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values('${owner}','quantity-a','google','quantity-a'),('${other}','quantity-b','google','quantity-b') on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
      values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
      values('${hash}',1,'${owner}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${column}','${owner}','fixture meal',0);
      insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','fixture canonical milk','유제품','ml');
      insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,source_version,fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
      values('${source}','C04','fixture nutrition','nutrition_dataset','fixture-v1',now(),now(),'current','https://example.invalid','fixture',repeat('d',64),'approved','fixture','${owner}',now(),true);
      insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
      values('${source}','${source}','fixture-milk','fixture canonical milk','raw',100,repeat('c',64),'approved','fixture','${owner}',now());
      insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
      values('${nutrition}','${source}','ingredient_source','mass_100g',100,'g',1,'approved','fixture','${owner}',now(),true,'${owner}');
      insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active)
      values('${profile}','${ingredient}','${nutrition}','raw','exact_standard_name',true,'approved','fixture','${owner}',now(),1,true);
      insert into public.nutrient_definitions(code,label,unit,display_order,is_core) values('energy_kcal','열량','kcal',1,true);
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status) values('${nutrition}','energy_kcal','energy_kcal','kcal',100,'observed');
      insert into public.recipes(id,title,base_servings,created_by,source_type,visibility,revision,updated_at)
      values('${recipe}','fixture batch',4,'${owner}','manual','private',1,now());
      insert into public.recipe_nutrition_snapshots(id,recipe_id,owner_user_id,base_servings,input_hash,calculation_version,scalable_values_json,fixed_values_json,nutrient_status_json,
        calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,missing_reasons,warnings_json,sources_json,is_current,calculated_at)
      values('${recipeNutrition}','${recipe}','${owner}',4,repeat('a',64),'fixture-v1','{"energy_kcal":1000}','{"energy_kcal":0}',
        '{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"protein_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"fat_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},"sodium_mg":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null}}',
        'partial','direct',1,1,'{}','[]','[]',true,now());
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version,recipe_nutrition_snapshot_id)
      values('${content}','${owner}','${recipe}','fixture batch',4,'[]','[]',repeat('a',64),1,'${recipeNutrition}');
      insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
      values('${batch}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${content}',4,1);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);`, true, true);
    sql(`begin; set local request.jwt.claim.role='service_role'; select public.complete_snapshot_v2_cooking_session(${args},'${batch}','${id(900)}','{}','estimate_from_ingredients',1000,clock_timestamp()); commit;`);
  });
  it("defaults OFF and keeps legacy g writes and null metadata", () => {
    expect(sql("select private.quantity_input_v4_enabled();").stdout.trim()).toBe("f");
    expect(sql(mutation(1), false).stderr).toContain("UNIT_POLICY_INACTIVE");
    expect(sql(preview(), false).stderr).toContain("UNIT_POLICY_INACTIVE");
    const legacy = { ...body(50, "g") } as Partial<ReturnType<typeof body>>; delete legacy.quantity_input;
    const entry = json(mutation(1, legacy as ReturnType<typeof body>)).data.entry;
    expect(entry.quantity).toEqual({ amount: 50, unit: "g" });
    expect(entry.quantity_input).toBeNull();
    sql("update private.quantity_input_v4_policy set enabled=true;");
  });
  it("keeps milk mL preference independent of missing density and saves unknown nutrition", () => {
    const options = json(`select private.ingredient_quantity_v4_options('${ingredient}');`);
    expect(options.default_unit).toBe("mL");
    expect(options.choices.find((choice: { unit: string }) => choice.unit === "mL")).toMatchObject({ normalized: null, reason: "DENSITY_REQUIRED" });
    const entry = json(mutation(2)).data.entry;
    expect(entry.quantity).toEqual({ amount: 200, unit: "mL" });
    expect(entry.nutrition).toMatchObject({ calculation_status: "unavailable", calories_kcal: null, protein_g: null });
    expect(json(preview())).toEqual(entry.nutrition);
    expect(entry.quantity_input).toMatchObject({ raw_value: "200", raw_unit: "mL", normalized: null, reason: "DENSITY_REQUIRED" });
    expect(isQuantityInputSnapshot(entry.quantity_input)).toBe(true);
  });
  it("stores fraction text and exact rational metadata without display rounding", () => {
    const entry = json(mutation(3, body(1 / 3, "g", "1/3"))).data.entry;
    expect(entry.quantity.amount).toBeCloseTo(1 / 3, 14);
    expect(entry.quantity_input).toMatchObject({ raw_value: "1/3", numerator: "1", denominator: "3" });
    expect(isQuantityInputSnapshot(entry.quantity_input)).toBe(true);
    expect(json(preview(1 / 3, "g", "1/3"))).toEqual(entry.nutrition);
    expect(sql(mutation(4, body(0.33, "g", "1/3")), false).stderr).toContain("VALIDATION_ERROR");
    expect(sql(mutation(4, body(1, "通")), false).stderr).toContain("UNIT_CONVERSION_MISSING");
    expect(sql("select count(*) from public.meal_log_entries;").stdout.trim()).toBe("3");
  });
  it("keeps200mL original while storing0.2L and rejects an unequal or unsupported display conversion", () => {
    const converted = { ...body(0.2, "L"), quantity_input: body(200, "mL").quantity_input };
    const entry = json(mutation(20, converted)).data.entry;
    expect(entry.quantity).toEqual({ amount: 0.2, unit: "L" });
    expect(entry.quantity_input).toMatchObject({ raw_value: "200", raw_unit: "mL", numerator: "200", denominator: "1", display_quantity: { amount: 0.2, unit: "L" } });
    expect(isQuantityInputSnapshot(entry.quantity_input)).toBe(true);
    const wrong = { ...converted, quantity: { amount: 0.3, unit: "L" } };
    expect(sql(mutation(21, wrong), false).stderr).toContain("VALIDATION_ERROR");
    expect(sql(mutation(21, { ...converted, quantity: { amount: 200, unit: "g" } }), false).stderr).toContain("UNIT_CONVERSION_MISSING");
    expect(json(`begin;set local request.jwt.claim.role='service_role';select public.preview_meal_log_nutrition(${args},'ingredient','${ingredient}',0.2,'L','${JSON.stringify(converted.quantity_input)}');commit;`)).toEqual(entry.nutrition);
  });
  it("preserves date-only legacy/null metadata and successful receipts after OFF", () => {
    const entry = json(mutation(2)).data.entry;
    const changed = { ...body(200, "mL"), consumed_local_date: "2026-10-15", expected_revision: 1 };
    const moved = json(mutation(2, changed, "patch", "1")).data.entry;
    expect(moved.quantity_input).toEqual(entry.quantity_input);
    expect(moved.nutrition).toEqual(entry.nutrition);
    const legacy = { ...body(50, "g") } as Partial<ReturnType<typeof body>>;
    delete legacy.quantity_input;
    const originalLegacy = json(mutation(1, legacy)).data.entry;
    const movedLegacy = json(mutation(1, { ...legacy, consumed_local_date: "2026-10-15" }, "patch", "1")).data.entry;
    expect(movedLegacy.quantity_input).toBeNull(); expect(movedLegacy.quantity).toEqual(originalLegacy.quantity);
    expect(movedLegacy.nutrition).toEqual(originalLegacy.nutrition); expect(movedLegacy.revision).toBe(2);
    sql("update private.quantity_input_v4_policy set enabled=false;");
    expect(json(mutation(2))).toEqual({ success: true, data: { entry }, error: null });
    expect(json(mutation(1, legacy)).data.entry).toEqual(originalLegacy);
    expect(sql(mutation(5), false).stderr).toContain("UNIT_POLICY_INACTIVE");
    expect(sql("select count(*) from public.meal_log_entries;").stdout.trim()).toBe("4");
  });
  it("converts fixed batch half serving to125g in preview and the real atomic ledger", () => {
    sql("update private.quantity_input_v4_policy set enabled=true;");
    const currentRevision = Number(sql(`select revision from public.leftover_dishes where id='${batch}';`).stdout.trim());
    const payload = { ...body(0.5, "인분", "1/2"), source: { type: "cooked_batch", id: batch },
      quantity_input: { ...body(0.5, "인분", "1/2").quantity_input, expected_batch_revision: currentRevision } };
    const nutritionPreview = json(`begin; set local request.jwt.claim.role='service_role'; select public.preview_meal_log_nutrition(${args},'cooked_batch','${batch}',0.5,'인분','${JSON.stringify(payload.quantity_input)}'); commit;`);
    expect(sql(`select remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim()).toBe("1000");
    const entry = json(mutation(6, payload)).data.entry;
    expect(entry.quantity).toEqual({ amount: 125, unit: "g" });
    const { weight_basis: previewWeightBasis, ...previewValues } = nutritionPreview;
    expect(previewWeightBasis).toEqual({ schema_version: "cooked-weight-basis-v1", batch_id: batch,
      recipe_content_snapshot_id: content, finished_weight_g: 1000, source: "historical_estimate", model_version: null,
      prediction_id: null, observation_id: null, batch_revision: currentRevision });
    expect(entry.nutrition).toEqual(previewValues);
    expect(entry.nutrition.weight_basis).toBeUndefined();
    expect(entry.quantity_input).toMatchObject({ raw_value: "1/2", raw_unit: "인분", numerator: "1", denominator: "2",
      normalized: { amount: 125, unit: "g" }, batch_basis: { batch_id: batch, revision: currentRevision, cooking_servings: 4, finished_weight_g: 1000 } });
    expect(isQuantityInputSnapshot(entry.quantity_input)).toBe(true);
    expect(Number(sql(`select remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim())).toBe(875);
    expect(sql(`select count(*),sum(delta_g) from public.cooked_batch_quantity_events where cooked_batch_id='${batch}' and event_type='consumed';`).stdout.trim().split("|").map(Number)).toEqual([1, -125]);
    expect(json(mutation(6, payload)).data.entry).toEqual(entry);
    expect(sql(mutation(7, payload), false).stderr).toContain("CONFLICT");
    const missingRevision = { ...payload, quantity_input: body(0.5, "인분", "1/2").quantity_input };
    expect(sql(mutation(7, missingRevision), false).stderr).toContain("CONFLICT");
    expect(Number(sql(`select remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim())).toBe(875);
    const deleted = json(mutation(6, {} as ReturnType<typeof body>, "delete", "1")).data.entry;
    expect(deleted.quantity_input).toEqual(entry.quantity_input);
    expect(Number(sql(`select remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim())).toBe(1000);
  });
  it("preserves both frozen bases and historic snapshots through OFF date moves and receipt replay", () => {
    sql("update private.quantity_input_v4_policy set enabled=true; update private.cooked_batch_weight_evidence_control set enabled=true;");
    const historic = () => sql(`select md5(jsonb_build_object('recipe',(select to_jsonb(r) from public.recipes r where id='${recipe}'),
      'content',(select to_jsonb(r) from public.recipe_content_snapshots r where id='${content}'))::text);`).stdout.trim();
    const before = historic();
    const revision = Number(sql(`select revision from public.leftover_dishes where id='${batch}';`).stdout.trim());
    const payload = { ...body(0.5, "인분", "1/2"), source: { type: "cooked_batch", id: batch },
      quantity_input: { ...body(0.5, "인분", "1/2").quantity_input, expected_batch_revision: revision } };
    const previewNutrition = json(`begin; set local request.jwt.claim.role='service_role'; select public.preview_meal_log_nutrition(${args},'cooked_batch','${batch}',0.5,'인분','${JSON.stringify(payload.quantity_input)}'); commit;`);
    const entry = json(mutation(41, payload)).data.entry;
    expect(entry.quantity).toEqual({ amount: 125, unit: "g" });
    expect(entry.nutrition).toEqual(previewNutrition);
    expect(entry.nutrition.weight_basis).toMatchObject({ finished_weight_g: 1000, source: "historical_estimate", batch_revision: revision });
    expect(entry.quantity_input).toMatchObject({ raw_value: "1/2", raw_unit: "인분", numerator: "1", denominator: "2",
      normalized: { amount: 125, unit: "g" }, batch_basis: { batch_id: batch, revision, cooking_servings: 4, finished_weight_g: 1000 } });
    sql("update private.quantity_input_v4_policy set enabled=false; update private.cooked_batch_weight_evidence_control set enabled=false;");
    const movedPayload: Record<string, unknown> = { ...payload, consumed_local_date: "2026-10-15", quantity: entry.quantity };
    delete movedPayload.quantity_input;
    const moved = json(mutation(41, movedPayload, "patch", "1")).data.entry;
    expect(moved.nutrition).toEqual(entry.nutrition);
    expect(moved.quantity).toEqual(entry.quantity);
    expect(moved.quantity_input).toEqual(entry.quantity_input);
    expect(json(mutation(41, payload))).toEqual({ success: true, data: { entry }, error: null });
    expect(sql(`select remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim()).toBe("875");
    expect(historic()).toBe(before);
    sql("update private.quantity_input_v4_policy set enabled=true;");
  });
  it("hydrates only reviewed physical count/density rows and shares preview and writer conversions", () => {
    sql(`insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,source_version,fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
      values('${id(700)}','C04M','fixture measurement','measurement_reference','fixture-measure-v1',now(),now(),'current','https://example.invalid','fixture',repeat('b',64),'approved','fixture','${owner}',now(),true);
      insert into public.measurement_conversion_profiles(id,code,representative_weight_g,version,is_active) values('${id(701)}','VOLUME_G15',15,1,true);`);
    seedMeasuredIngredient(710, "fixture garlic", "알", true);
    seedMeasuredIngredient(720, "fixture density beverage", "ml", false);
    const piece = { ...body(0.5, "알", "1/2"), source: { type: "ingredient", id: id(710) } };
    const entry = json(mutation(10, piece)).data.entry;
    expect(entry.quantity_input).toMatchObject({ raw_value: "1/2", raw_unit: "알", normalized: { amount: 1.5, unit: "g" }, quality: "estimated",
      evidence_ids: [id(714)], source_versions: ["fixture-measure-v1"] });
    const options = json(`select private.ingredient_quantity_v4_options('${id(710)}');`);
    expect(options.default_unit).toBe("알");
    expect(options.choices.some((choice: { unit: string }) => choice.unit === "통")).toBe(false);
    expect(sql(mutation(11, { ...piece, quantity: { amount: 0.5, unit: "통" }, quantity_input: { ...piece.quantity_input, raw_unit: "통" } }), false).stderr).toContain("UNIT_CONVERSION_MISSING");
    const density = { ...body(200, "mL"), source: { type: "ingredient", id: id(720) } };
    const beverage = json(mutation(12, density)).data.entry;
    expect(beverage.quantity_input).toMatchObject({ normalized: { amount: 206, unit: "g" }, quality: "direct", evidence_ids: [id(724)] });
    expect(beverage.nutrition.calories_kcal).toBe(206);
    expect(json(preview().replace(ingredient, id(720)))).toEqual(beverage.nutrition);
    expect(json(preview(0.5, "알", "1/2").replace(ingredient, id(710)))).toEqual(entry.nutrition);
  });
  it("uses the exact product version for raw fractions, display conversions and planner reload", () => {
    sql(`begin; select public.set_account_generation_internal_writer_marker('${cutover}',true); set constraints food_products_current_version_fk deferred;
      insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at,source_basis_amount,source_basis_unit)
      values('${id(803)}','${source}','C04-FAKE-PACK','fixture public pack','raw',100,'fixture-pack','approved','fixture','${owner}',now(),100,'g');
      insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
      values('${id(802)}','${id(803)}','product_label','as_labeled',100,'g',1,'approved','fixture','${owner}',now(),true,null);
      insert into public.nutrient_definitions(code,label,unit,display_order,is_core)
      values('carbohydrate_g','fixture carbohydrate','g',2,true),('protein_g','fixture protein','g',3,true),('fat_g','fixture fat','g',4,true),('sodium_mg','fixture sodium','mg',5,true);
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
      values('${id(802)}','energy_kcal','energy_kcal','kcal',240,'observed'),('${id(802)}','carbohydrate_g','carbohydrate_g','g',30,'observed'),
        ('${id(802)}','protein_g','protein_g','g',10,'observed'),('${id(802)}','fat_g','fat_g','g',5,'observed'),('${id(802)}','sodium_mg','sodium_mg','mg',100,'observed');
      insert into public.food_products(id,owner_user_id,visibility,source_type,name,brand,external_product_key,current_nutrition_version_id,moderation_status)
      values('${id(800)}',null,'public','public_dataset','fixture public pack','fixture company','C04-FAKE-PACK','${id(801)}','visible');
      insert into public.food_product_nutrition_versions(id,product_id,nutrition_profile_id,version,source_item_id,created_by,basis_relations_json)
      values('${id(801)}','${id(800)}','${id(802)}',1,'${id(803)}',null,
        '[{"from":{"amount":1,"unit":"package"},"to":{"amount":120,"unit":"g"}},{"from":{"amount":1,"unit":"serving"},"to":{"amount":60,"unit":"g"}}]');
      select public.set_account_generation_internal_writer_marker('${cutover}',false); commit;`);
    const input = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: id(801) };
    const encoded = JSON.stringify(input);
    const create = `begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${owner}';select public.set_account_generation_internal_writer_marker('${cutover}',true);select public.create_product_planner_entry('${owner}','${id(800)}','2026-10-14','${column}',40,'g','${id(801)}','${encoded}');select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`;
    const entry = json(create);
    expect(entry.quantity).toEqual({ amount: 40, unit: "g" });
    expect(entry.quantity_input).toMatchObject({ raw_value: "1/3", raw_unit: "package", numerator: "1", denominator: "3",
      display_quantity: { amount: 40, unit: "g" }, normalized: { amount: 40, unit: "g" }, source_versions: [id(801)] });
    expect(entry.nutrition.values.energy_kcal.amount).toBe(96);
    expect(isQuantityInputSnapshot(entry.quantity_input)).toBe(true);
    const list = JSON.parse(sql(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${owner}';select public.list_product_planner_entries('${owner}','2026-10-14','2026-10-14','${column}');commit;`).stdout.trim().split("\n").find(line => line.startsWith("["))!);
    expect(list).toEqual([entry]);
    const stale = create.replace(encoded, JSON.stringify({ ...input, expected_product_nutrition_version_id: id(899) }));
    expect(sql(stale, false).stderr).toContain("NUTRITION_VERSION_CONFLICT");
    expect(sql(create.replace("40,'g'", "41,'g'"), false).stderr).toContain("VALIDATION_ERROR");
    expect(sql("select count(*) from public.product_planner_entries;").stdout.trim()).toBe("1");
    const meal = { ...body(40, "g"), source: { type: "food_product", id: id(800) }, quantity_input: input };
    const logged = json(mutation(30, meal)).data.entry;
    expect(logged.quantity_input.raw_value).toBe("1/3");
    expect(logged.quantity_input.raw_unit).toBe("package");
    expect(logged.nutrition.calories_kcal).toBe(96);
    const productPreview = `begin;set local request.jwt.claim.role='service_role';select public.preview_meal_log_nutrition(${args},'food_product','${id(800)}',40,'g','${encoded}');commit;`;
    expect(json(productPreview)).toEqual(logged.nutrition);
    expect(sql(mutation(31, { ...meal, quantity_input: { ...input, expected_product_nutrition_version_id: id(899) } }), false).stderr).toContain("NUTRITION_VERSION_CONFLICT");
    sql("update private.quantity_input_v4_policy set enabled=false;");
    expect(json(`begin;set local request.jwt.claim.role='service_role';select public.product_planner_entry_payload('${entry.id}','${owner}');commit;`)).toEqual({ ...entry, quantity_policy: null });
    expect(sql(create, false).stderr).toContain("UNIT_POLICY_INACTIVE");
  });
  it("reads current policy independently from saved metadata without admitting another owner", () => {
    const entryId = sql("select id from public.product_planner_entries;").stdout.trim();
    const read = (user: string) => `begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${user}';select public.product_planner_entry_payload('${entryId}','${user}');commit;`;
    const saved = json(read(owner)); expect(saved.quantity_policy).toBeNull(); expect(saved.quantity_input.raw_value).toBe("1/3");
    expect(json(read(other))).toBeNull();
    expect(sql(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${other}';select public.list_product_planner_entries('${other}','2026-10-14','2026-10-14',null);commit;`).stdout.trim()).toBe("[]");
    sql("update private.quantity_input_v4_policy set enabled=true;"); const on = json(read(owner));
    expect(on).toEqual({ ...saved, quantity_policy: "quantity-v4" });
  });
  it("edits only the saved version's quantities and leaves metadata unchanged on same-quantity retry", () => {
    const entryId = sql("select id from public.product_planner_entries;").stdout.trim();
    sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,source_version,fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
      select '${id(807)}',provider_code,'fixture nutrition v2',source_kind,'fixture-v2',fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active from public.nutrition_sources where id='${source}';
      insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at,source_basis_amount,source_basis_unit)
      select '${id(806)}','${id(807)}',external_item_key,external_name,preparation_state,edible_portion_percent,'fixture-product-v2',review_status,decision_reason,reviewed_by,reviewed_at,source_basis_amount,source_basis_unit from public.nutrition_source_items where id='${id(803)}';
      insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
      select '${id(805)}','${id(806)}',profile_kind,normalization_method,basis_amount,basis_unit,2,review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by from public.nutrition_profiles where id='${id(802)}';
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
      select '${id(805)}',nutrient_code,source_nutrient_code,source_unit,amount,value_status from public.nutrition_values where profile_id='${id(802)}';
      insert into public.food_product_nutrition_versions(id,product_id,nutrition_profile_id,version,source_item_id,created_by,basis_relations_json)
      values('${id(804)}','${id(800)}','${id(805)}',2,'${id(806)}',null,'[{"from":{"amount":1,"unit":"package"},"to":{"amount":150,"unit":"g"}}]');
      update public.food_products set current_nutrition_version_id='${id(804)}' where id='${id(800)}';
      select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
    const input = { schema_version: "quantity-v4", raw_value: "1/4", raw_unit: "package", expected_product_nutrition_version_id: id(801) };
    const patch = (user = owner, raw = input) => `begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${user}';select public.set_account_generation_internal_writer_marker('${cutover}',true);select public.update_product_planner_entry_quantity('${user}','${entryId}',30,'g','${JSON.stringify(raw)}');select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`;
    const updated = json(patch()); expect(updated.quantity).toEqual({ amount: 30, unit: "g" });
    expect(updated.product_nutrition_version_id).toBe(id(801)); expect(updated.nutrition.values.energy_kcal.amount).toBe(72);
    expect(updated.quantity_input).toMatchObject({ raw_value: "1/4", raw_unit: "package", numerator: "1", denominator: "4", source_versions: [id(801)] });
    expect(json(patch())).toEqual(updated);
    expect(sql(patch(owner, { ...input, expected_product_nutrition_version_id: id(804) }), false).stderr).toContain("NUTRITION_VERSION_CONFLICT");
    expect(sql(patch(other), false).stderr).toContain("FORBIDDEN");
    sql("update private.quantity_input_v4_policy set enabled=false;");
    const before = json(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${owner}';select public.product_planner_entry_payload('${entryId}','${owner}');commit;`);
    expect(sql(patch(), false).stderr).toContain("UNIT_POLICY_INACTIVE");
    expect(json(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='${owner}';select public.product_planner_entry_payload('${entryId}','${owner}');commit;`)).toEqual(before);
    expect(before.quantity_input).toEqual(updated.quantity_input); expect(before.quantity_policy).toBeNull();
  });
  it("keeps role, private metadata, ownership and revoked session boundaries", () => {
    const signature = "public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text,jsonb)";
    expect(sql(`select has_function_privilege('service_role','${signature}','execute'),has_function_privilege('authenticated','${signature}','execute'),has_function_privilege('anon','${signature}','execute');`).stdout.trim()).toBe("t|f|f");
    expect(sql("select has_table_privilege('service_role','private.quantity_input_v4_policy','update'),has_column_privilege('authenticated','public.meal_log_entries','quantity_input','select');").stdout.trim()).toBe("f|f");
    expect(sql(preview().replace(hash, "e".repeat(64)), false).stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(sql(mutation(9).replace(args, `'${other}','${epoch}','${hash}',1,'${issued}'`), false).stderr).toContain("ACCOUNT_SESSION_STALE");
  });
});
