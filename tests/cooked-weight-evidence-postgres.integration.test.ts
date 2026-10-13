import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { predictCookedWeight, type CookedWeightFact, type CookedWeightRow } from "@/lib/server/cooked-weight-prediction";

const enabled = process.env.HOMECOOK_COOKED_WEIGHT_EVIDENCE_ISOLATED_PG === "1";
const container = process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER ?? "";
const tag = process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG ?? "";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
if (enabled && (!/^[a-f0-9]{64}$/.test(container) || !/^[a-f0-9]{32}$/.test(tag))) throw new Error("An exact owned offline rehearsal container is required");
const owner = "b1000000-0000-4000-8000-000000000001";
const other = "b1000000-0000-4000-8000-000000000002";
const recipe = "b2000000-0000-4000-8000-000000000001";
const pin = "b3000000-0000-4000-8000-000000000001";
const ingredient = "b8000000-0000-4000-8000-000000000001";
const nutritionPin = "b9000000-0000-4000-8000-000000000001";
const column = "b6000000-0000-4000-8000-000000000001";
const epoch = "2026-08-08T00:00:00Z";
const issued = "2026-08-08T01:00:00Z";
const cutover = "b5000000-0000-4000-8000-000000000001";
const hash = "e".repeat(64);
const args = `'${owner}','${epoch}','${hash}',1,'${issued}'`;
const functions = [
  "public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamptz)",
  "public.mutate_cooked_batch_weight_with_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,timestamptz)",
];

function sql(statement: string, succeeds = true, bootstrap = false) {
  const inspect = spawnSync("docker", ["inspect", container], { encoding: "utf8" });
  if (inspect.status !== 0) throw new Error("Owned rehearsal container is unavailable");
  const current = JSON.parse(inspect.stdout)[0];
  if (current.Config.Labels["homecook.cooked-weight-test"] !== tag || current.Config.Image !== image || current.HostConfig.NetworkMode !== "none") throw new Error("Refusing unowned or networked container");
  const result = spawnSync("docker", ["exec", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", `${bootstrap ? "" : "set session authorization postgres;"} ${statement}`],
  { encoding: "utf8", env: { ...process.env, PGPASSWORD: "" } });
  if (succeeds) expect(result.status, result.stderr).toBe(0);
  return result;
}
function service(statement: string, succeeds = true) {
  return sql(`begin; set local request.jwt.claim.role='service_role'; ${statement} commit;`, succeeds);
}
function id(n: number) { return `b4000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
function session(n: number) {
  sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);
    insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
    values('${id(n)}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${pin}',2,1);
    select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
  return id(n);
}
function prediction(total: number | null = null, inferred = false) {
  // Explicit local server fixture, not a claim that existing snapshots contain these confirmed conditions.
  const known = <T extends string | number>(value: T): CookedWeightFact<T> => ({ value, status: "confirmed", evidenceRef: "synthetic-fixture" });
  const row: CookedWeightRow = { rowKey: `${ingredient}:0`, sourceKind: "ingredient", sourceId: ingredient, sourceVersion: null,
    amount: total ?? 300, unit: "g", quantityKind: "quantitative", quantityOrigin: "planned", grams: total ?? 300,
    gramsEvidence: { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" },
    preparationState: known("raw"), foodIdentity: known(ingredient),
    role: total === null ? { value: null, status: "unknown", evidenceRef: null } : known("food") };
  const condition = <T extends string | number>(value: T): CookedWeightFact<T> => inferred ? { value, status: "inferred", evidenceRef: "synthetic-mix-tag" } : known(value);
  const estimate = predictCookedWeight({ recipeSnapshotId: pin, cookingServings: 2, rows: [row],
    segments: [{ id: "fixture-closed-mix", rowKeys: [row.rowKey], method: condition("no_heat"), boundary: condition("entire_edible"),
      drainage: condition("none"), addedMedia: known("none"), protocol: condition(inferred ? "snapshot-mix-only-v1" : "synthetic-closed"), transformation: { kind: inferred ? "inferred_closed_mix" : "closed_mix" } }] });
  return JSON.stringify({ schemaVersion: "cooked-weight-evidence-v1", inputVersion: "snapshot-weight-v2", catalogVersion: "usda-release2-2014", methodSteps: [],
    recipeSnapshotId: pin, baseServings: 2, cookingServings: 2, rawRows: [{ rowKey: row.rowKey, amount: 300, unit: "g", scalable: true }],
    prediction: estimate }).replaceAll("'", "''");
}
function complete(batch: string, key: string, payload = prediction(), weight = "null", source = "null", writes = "true") {
  return `select public.complete_snapshot_v2_cooking_session_with_weight_evidence(${args},'${batch}','${key}','{}'::uuid[],
    '${weight === "null" ? "weigh_later" : "set_finished_weight"}',${weight},${source},'${payload}'::jsonb,${writes},clock_timestamp());`;
}
function measure(batch: string, key: string, weight = 200, revision = 1, source = "'reported_measured'", writes = "true") {
  return `select public.mutate_cooked_batch_weight_with_evidence(${args},'${batch}','${key}','set_finished_weight',${weight},${revision},${source},${writes},clock_timestamp());`;
}
function meal(batch: string, entry: string, key: string, action = "create", amount = 100, revision = "null", date = "2026-10-13") {
  const payload = JSON.stringify({ source: { type: "cooked_batch", id: batch }, quantity: { amount, unit: "g" },
    consumed_local_date: date, timezone_name_snapshot: "Asia/Seoul", consumed_at: null, meal_plan_column_id: column });
  return `select public.mutate_meal_log_entry(${args},'${action}','${entry}','${key}',${revision},'${payload}'::jsonb,clock_timestamp());`;
}
function mealNutrition(entry: string) {
  return JSON.parse(sql(`select nutrition_evidence_json from public.meal_log_entries where id='${entry}';`).stdout.trim());
}
function digest(batch: string) {
  return sql(`select jsonb_build_object('session',(select to_jsonb(s) from public.cooking_sessions s where id='${batch}'),
    'batch',(select to_jsonb(b) from public.leftover_dishes b where id='${batch}'),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.cooked_batch_quantity_events e where cooked_batch_id='${batch}'),
    'meals',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.meal_log_entries m where cooked_batch_id='${batch}'),
    'history',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from private.cooked_batch_weight_evidence e where batch_id='${batch}'),
    'recipe',(select to_jsonb(r) from public.recipes r where id='${recipe}'),
    'snapshot',(select to_jsonb(s) from public.recipe_content_snapshots s where id='${pin}'));`).stdout;
}

describe.runIf(enabled)("personal cooked weight evidence PostgreSQL", () => {
  beforeAll(() => {
    expect(sql("select enabled from private.cooked_batch_weight_evidence_control where singleton;").stdout.trim()).toBe("f");
    sql(`set session_replication_role=replica;
      insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at)
      values(true,'local','https://auth.mumeok.kr/auth/v1',2,1,true,'${epoch}');
      insert into private.ingredient_ai_nutrition_settings(singleton,enabled) values(true,false);
      insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
      insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'${cutover}','${epoch}');
      set session_replication_role=origin;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into auth.users(id,created_at,email) values('${owner}','${epoch}','weight-owner@example.invalid'),('${other}','${epoch}','weight-other@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values('${owner}','weight-a','google','weight-a'),('${other}','weight-b','google','weight-b') on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
      values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
      values('${hash}',1,'${owner}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01'),
        ('${"f".repeat(64)}',1,'${other}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
      insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','fixture food','채소','g');
      insert into public.recipes(id,title,base_servings,created_by,source_type,visibility,revision,updated_at) values('${recipe}','fixture dish',2,'${owner}','manual','private',1,now());
      insert into public.recipe_nutrition_snapshots(id,recipe_id,base_servings,input_hash,calculation_version,scalable_values_json,fixed_values_json,nutrient_status_json,
        calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,missing_reasons,warnings_json,sources_json,is_current,calculated_at)
      values('${nutritionPin}','${recipe}',2,repeat('e',64),'fixture-pinned-v1','{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":50,"fat_g":20,"sodium_mg":1000}',
        '{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}',
        '{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":50,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":20,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"}}',
        'complete','direct',1,1,'{}','[]','[]',true,now());
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version,recipe_nutrition_snapshot_id)
      values('${pin}','${owner}','${recipe}','fixture dish',2,'[{"ingredient_id":"${ingredient}","amount":300,"unit":"g","scalable":true,"ingredient_type":"QUANT","food_product_id":null}]','[]',repeat('e',64),1,'${nutritionPin}');
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${column}','${owner}','fixture meal',0);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);`, true, true);
  });
  it("defaults OFF, denies fresh writes at either switch, and leaves completion atomic", () => {
    const batch = session(1); const before = digest(batch);
    expect(service(complete(batch, id(101)), false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(before);
    sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
    expect(service(complete(batch, id(101), prediction(), "null", "null", "false"), false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(before);
  });
  it("keeps owner, role, private ACL and exact scope fences", () => {
    for (const functionName of functions) {
      expect(sql(`select has_function_privilege('service_role','${functionName}','execute'),has_function_privilege('authenticated','${functionName}','execute'),has_function_privilege('anon','${functionName}','execute');`).stdout.trim()).toBe("t|f|f");
    }
    expect(sql("select has_table_privilege('service_role','private.cooked_batch_weight_evidence','select'),has_table_privilege('authenticated','private.cooked_batch_weight_evidence','insert');").stdout.trim()).toBe("f|f");
    const batch = session(2); const before = digest(batch);
    expect(service(complete(batch, id(102)).replace(args, `'${other}','${epoch}','${"f".repeat(64)}',1,'${issued}'`), false).stderr).toContain("RESOURCE_NOT_FOUND");
    expect(sql(`begin; set local role anon; ${complete(batch, id(102))} rollback;`, false).stderr).toContain("permission denied");
    expect(digest(batch)).toBe(before);
    for (const path of ["complete_snapshot_v2_cooking_session_with_weight_evidence", "mutate_cooked_batch_weight_with_evidence"]) {
      const verify = `set local request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}'; set local request.path='/rpc/${path}'; set local request.method='POST'; select private.verify_full_local_internal_scope();`;
      expect(service(verify).status).toBe(0);
      expect(service(verify.replace("'POST'", "'GET'"), false).status).not.toBe(0);
      expect(service(verify.replace("snapshot-v2-session", "recipe-meal-weight"), false).status).not.toBe(0);
    }
  });
  it("stores unknown once, leaves numeric weight missing, and replays the original model with no learning", () => {
    const batch = session(3); const key = id(103);
    const first = service(complete(batch, key)).stdout.split("\n").find(line => line.startsWith("{"));
    const replay = service(complete(batch, key, prediction(999))).stdout.split("\n").find(line => line.startsWith("{"));
    expect(replay).toBe(first);
    expect(sql(`select weight_status,finished_weight_g,remaining_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim()).toBe("missing||");
    expect(sql(`select count(*),bool_or((prediction_json->'prediction'->>'learningEligible')::boolean) from private.cooked_batch_weight_evidence where batch_id='${batch}';`).stdout.trim()).toBe("1|f");
    expect(sql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batch}';`).stdout.trim()).toBe("0");
  });
  it("keeps the original300 prediction after explicit200 and excludes manual/old paths", () => {
    const batch = session(4); service(complete(batch, id(104), prediction(300)));
    const measured = service(measure(batch, id(204))).stdout;
    expect(measured).toContain('"source": "reported_measured"');
    expect(sql(`select (prediction_json->'prediction'->>'totalGrams')::numeric from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='prediction';`).stdout.trim()).toBe("300");
    expect(sql(`select finished_weight_g,remaining_weight_g,revision from public.leftover_dishes where id='${batch}';`).stdout.trim()).toBe("200|200|2");
    expect(sql(`select original_revision from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='reported_measurement';`).stdout.trim()).toBe("2");
    const manual = session(5); service(complete(manual, id(105), prediction(), "300"));
    expect(sql(`select input_source from private.cooked_batch_weight_evidence where batch_id='${manual}' and event_kind='manual_entry';`).stdout.trim()).toBe("manual_estimate");
    expect(sql(`select count(*) from private.cooked_batch_weight_evidence where batch_id='${manual}' and event_kind='reported_measurement';`).stdout.trim()).toBe("0");
    const equal = session(6); service(complete(equal, id(106), prediction(300), "300", "'reported_measured'"));
    expect(sql(`select count(*) from private.cooked_batch_weight_evidence where batch_id='${equal}' and event_kind='reported_measurement';`).stdout.trim()).toBe("1");
  });
  it("rolls back completed state and all history on invalid prediction, without rewriting snapshots", () => {
    const batch = session(7); const before = digest(batch);
    const invalid = JSON.parse(prediction()); invalid.private_note = "not allowed";
    expect(service(complete(batch, id(107), JSON.stringify(invalid)), false).stderr).toContain("VALIDATION_ERROR");
    expect(digest(batch)).toBe(before);
    const fixture = JSON.parse(prediction()); fixture.prediction.scope = "test_fixture";
    expect(service(complete(batch, id(107), JSON.stringify(fixture)), false).stderr).toContain("VALIDATION_ERROR");
    expect(digest(batch)).toBe(before);
  });
  it("keeps idempotency payload/source, current revision and no-events unchanged", () => {
    const batch = session(8); service(complete(batch, id(108), prediction(300)));
    const before = digest(batch);
    expect(service(complete(batch, id(108), prediction(), "300", "'reported_measured'"), false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(service(measure(batch, id(208), 200, 2), false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(before);
    service(`select public.discard_cooked_batch(${args},'${batch}','${id(308)}',10,'fixture discard',1,clock_timestamp());`);
    const consumed = digest(batch);
    expect(service(measure(batch, id(208), 200, 2), false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(consumed);
  });
  it("does not backfill evidence on legacy successful completion replay", () => {
    const batch = session(9); const key = id(109);
    service(`select public.complete_snapshot_v2_cooking_session(${args},'${batch}','${key}','{}','estimate_from_ingredients',225,clock_timestamp());`);
    const before = digest(batch); service(complete(batch, key, prediction(999)));
    expect(digest(batch)).toBe(before);
    expect(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}')->>'source';`).stdout.trim()).toBe("historical_estimate");
  });
  it("freezes the reported denominator/source in the real preview and atomic meal writer", () => {
    const batch = session(11); service(complete(batch, id(111), prediction(300), "200", "'reported_measured'"));
    const before = digest(batch);
    const preview = JSON.parse(service(`select public.preview_meal_log_nutrition(${args},'cooked_batch','${batch}',100,'g');`).stdout.trim());
    expect(preview.calories_kcal).toBe(500);
    expect(preview.weight_basis).toMatchObject({ finished_weight_g: 200, source: "reported_measured", model_version: "bounded-weight-v2", batch_revision: 1 });
    expect(digest(batch)).toBe(before);
    const entry = id(411); service(meal(batch, entry, id(511)));
    const frozen = mealNutrition(entry);
    expect(frozen.calories_kcal).toBe(500);
    expect(frozen.weight_basis).toEqual(preview.weight_basis);
    expect(frozen.weight_basis.observation_id).not.toBeNull();
    const created = digest(batch);
    service(meal(batch, entry, id(511))); expect(digest(batch)).toBe(created);
    expect(service(meal(batch, entry, id(511), "create", 90), false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(service(meal(batch, entry, id(611), "patch", 300, "1"), false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(created);
    service(meal(batch, entry, id(711), "patch", 100, "1", "2026-10-14"));
    expect(mealNutrition(entry)).toEqual(frozen);
    service(`select public.adjust_cooked_batch(${args},'${batch}','${id(811)}',10,'fixture correction',(select revision from public.leftover_dishes where id='${batch}'),clock_timestamp());`);
    expect(mealNutrition(entry)).toEqual(frozen);
    expect(sql(`select finished_weight_g from public.leftover_dishes where id='${batch}';`).stdout.trim()).toBe("200");
  });
  it("keeps inferred assumptions frozen and excludes unknown-weight meals without partial writes", () => {
    const batch = session(12); service(complete(batch, id(112), prediction(300, true)));
    const entry = id(412); service(meal(batch, entry, id(512)));
    const frozen = mealNutrition(entry);
    expect(frozen.weight_basis.source).toBe("conditional_estimate");
    expect(frozen.weight_assumption_codes).toHaveLength(3);
    expect(frozen.calories_kcal).toBe(333.333333); // Existing compact nutrition contract rounds to six decimals.
    service(meal(batch, entry, id(612), "patch", 90, "1"));
    expect(mealNutrition(entry).weight_basis.finished_weight_g).toBe(300);
    expect(mealNutrition(entry).weight_assumption_codes).toEqual(frozen.weight_assumption_codes);
    const unknown = session(13); service(complete(unknown, id(113)));
    const before = digest(unknown);
    expect(service(meal(unknown, id(413), id(513)), false).stderr).toContain("CONFLICT");
    expect(digest(unknown)).toBe(before);
  });
  it("honestly reads an OFF legacy weight write without relabelling its original prediction", () => {
    for (const [n, total] of [[14, 300], [15, null]] as const) {
      const batch = session(n); service(complete(batch, id(100+n), prediction(total)));
      const original = sql(`select prediction_json from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='prediction';`).stdout;
      sql("update private.cooked_batch_weight_evidence_control set enabled=false where singleton;");
      service(`select public.mutate_cooked_batch_weight(${args},'${batch}','${id(200+n)}','set_finished_weight',200,1,clock_timestamp());`);
      const summary = JSON.parse(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}');`).stdout.trim());
      expect(summary.source).toBe("legacy_unknown"); expect(summary.model_version).toBeNull(); expect(summary.predicted_g).toBe(total);
      expect(sql(`select prediction_json from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='prediction';`).stdout).toBe(original);
      expect(sql(`select count(*) from private.cooked_batch_weight_evidence where batch_id='${batch}';`).stdout.trim()).toBe("1");
      const entry = id(400+n); service(meal(batch, entry, id(500+n), "create", 100));
      expect(mealNutrition(entry).weight_basis).toBeUndefined();
      sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
      service(meal(batch, entry, id(600+n), "patch", 100, "1", "2026-10-14"));
      expect(mealNutrition(entry).weight_basis).toBeUndefined();
    }
  });
  it("never promotes a legacy successful manual receipt into an explicit measured report", () => {
    const batch = session(16); const key = id(116);
    service(`select public.complete_snapshot_v2_cooking_session(${args},'${batch}','${key}','{}','set_finished_weight',200,clock_timestamp());`);
    const before = digest(batch);
    expect(service(complete(batch,key,prediction(300),"200","'reported_measured'"),false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(digest(batch)).toBe(before);
    const delayed = session(17); service(complete(delayed,id(117),prediction(300)));
    service(`select public.mutate_cooked_batch_weight(${args},'${delayed}','${id(217)}','set_finished_weight',200,1,clock_timestamp());`);
    const later = digest(delayed);
    expect(service(measure(delayed,id(217),200,1),false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(digest(delayed)).toBe(later);
  });
  it("accepts a new explicit observation on an old batch without inventing a prediction/model", () => {
    const batch = session(18);
    service(`select public.complete_snapshot_v2_cooking_session(${args},'${batch}','${id(118)}','{}','estimate_from_ingredients',225,clock_timestamp());`);
    service(measure(batch,id(218),200,1));
    const summary = JSON.parse(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}');`).stdout.trim());
    expect(summary).toMatchObject({ source: "reported_measured", predicted_g: null, model_version: null });
    expect(sql(`select count(*),count(*) filter(where event_kind='prediction') from private.cooked_batch_weight_evidence where batch_id='${batch}';`).stdout.trim()).toBe("1|0");
    service(meal(batch,id(418),id(518)));
    expect(mealNutrition(id(418)).weight_basis).toMatchObject({ finished_weight_g: 200, source: "reported_measured", model_version: null, prediction_id: null });
  });
  it("keeps immutable history/readers on OFF, replays successful writes, and prevents updates", () => {
    const batch = session(10); const key = id(110); service(complete(batch, key));
    const before = digest(batch);
    sql("update private.cooked_batch_weight_evidence_control set enabled=false where singleton;");
    expect(service(complete(batch, key, prediction(999), "null", "null", "false")).status).toBe(0);
    expect(digest(batch)).toBe(before);
    expect(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}')->>'source';`).stdout.trim()).toBe("unavailable");
    expect(sql(`update private.cooked_batch_weight_evidence set input_source='conditional_estimate' where batch_id='${batch}';`, false).stderr).toContain("CONFLICT");
    expect(digest(batch)).toBe(before);
  });
});
