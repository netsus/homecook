import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { openRecordingSession } from "@/scripts/lib/marketing-round2-controlled-deploy.mjs";
import { predictCookedWeight, type CookedWeightFact, type CookedWeightRow } from "@/lib/server/cooked-weight-prediction";
import { readSnapshotWeightPrediction } from "@/lib/server/cooked-batch-weight-evidence";
import { assertCookedWeightEvidenceSourceFunctionInventoryResult, buildCookedWeightEvidenceSourceFunctionInventorySql,
  assertRecipeProductSourceFunctionInventoryResult, buildRecipeProductSourceFunctionInventorySql } from "@/scripts/lib/full-local-security-inventory.mjs";

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
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.mutation_idempotency_keys r where owner_uuid='${owner}'),
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
    expect(service(complete(batch, id(101)), false).stderr).toContain("COOKED_WEIGHT_EVIDENCE_DISABLED");
    expect(digest(batch)).toBe(before);
    sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
    expect(service(complete(batch, id(101), prediction(), "null", "null", "false"), false).stderr).toContain("COOKED_WEIGHT_EVIDENCE_DISABLED");
    expect(digest(batch)).toBe(before);
  });
  it("holds only the mutation control row until commit so operator OFF waits while plain capability reads continue", async () => {
    sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
    const batch = session(900), key = id(901);
    // The sql() ownership/image/network guard runs before opening the same exact owned transport.
    sql("select 1;");
    const writer = openRecordingSession(container, process.env, `c01-accepted-write-${tag}`);
    try {
      await writer.query("begin; set local request.jwt.claim.role='service_role';");
      await writer.query(complete(batch, key));
      expect(sql("select enabled from private.cooked_batch_weight_evidence_control where singleton;").stdout.trim()).toBe("t");
      const off = sql("begin; set local lock_timeout='200ms'; update private.cooked_batch_weight_evidence_control set enabled=false where singleton; commit;", false);
      expect(off.status).not.toBe(0); expect(off.stderr).toContain("lock timeout");
      expect(sql("begin read only; select enabled from private.cooked_batch_weight_evidence_control where singleton; commit;").stdout.trim()).toBe("t");
      await writer.query("commit;"); await writer.close();
      sql("update private.cooked_batch_weight_evidence_control set enabled=false where singleton;");
      expect(sql(`select count(*) from private.cooked_batch_weight_evidence where batch_id='${batch}';`).stdout.trim()).toBe("1");
      const original = digest(batch);
      expect(service(complete(batch, key, prediction(), "null", "null", "false")).status).toBe(0);
      expect(digest(batch)).toBe(original); // Successful receipt replay remains unchanged after OFF.
      const fresh = session(902), before = digest(fresh);
      expect(service(complete(fresh, id(903)), false).stderr).toContain("COOKED_WEIGHT_EVIDENCE_DISABLED");
      expect(digest(fresh)).toBe(before); // Failed wrapper leaves no receipt/batch/evidence writes.
      const legacy = service(`select public.complete_snapshot_v2_cooking_session(${args},'${fresh}','${id(903)}','{}'::uuid[],'estimate_from_ingredients',225,clock_timestamp());`);
      expect(legacy.status).toBe(0);
      expect(sql(`select count(*) from private.cooked_batch_weight_evidence where batch_id='${fresh}';`).stdout.trim()).toBe("0");
      expect(sql(`select count(*),min(operation_scope) from public.mutation_idempotency_keys where owner_uuid='${owner}' and key_hash=encode(extensions.digest('${id(903)}','sha256'),'hex');`).stdout.trim()).toBe("1|snapshot_v2_complete");
      for (const mutation of [measure(batch, id(904)), meal(batch, id(905), id(906))]) {
        sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
        const pending = openRecordingSession(container, process.env, `c01-accepted-write-${tag}`);
        try {
          await pending.query("begin; set local request.jwt.claim.role='service_role';");
          await pending.query(mutation);
          const stop = sql("begin; set local lock_timeout='200ms'; update private.cooked_batch_weight_evidence_control set enabled=false where singleton; commit;", false);
          expect(stop.status).not.toBe(0); expect(stop.stderr).toContain("lock timeout");
          expect(sql(`begin read only; select private.project_cooked_batch('${batch}','${owner}')->>'weight_evidence_enabled'; commit;`).stdout.trim()).toBe("true");
          await pending.query("commit;"); await pending.close();
          sql("update private.cooked_batch_weight_evidence_control set enabled=false where singleton;");
        } finally { pending.stop(); }
      }
      expect(mealNutrition(id(905)).weight_basis.finished_weight_g).toBe(200);
      sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
    } finally {
      writer.stop();
    }
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
  it("checks reviewed C03 to C01 function bodies and rejects a changed execution context", () => {
    const inventory = buildCookedWeightEvidenceSourceFunctionInventorySql();
    expect(assertCookedWeightEvidenceSourceFunctionInventoryResult(JSON.parse(sql(inventory).stdout))).toEqual({ required_functions: 15, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0 });
    expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true })).stdout), { includeCookedWeightEvidenceFunctions: true }).required_functions).toBe(38);
    const changed = JSON.parse(sql(`begin; alter function private.project_cooked_weight_evidence(uuid,uuid) set search_path=pg_catalog,public,pg_temp; ${inventory} rollback;`).stdout);
    expect(changed.search_path).toBe(1);
    expect(() => assertCookedWeightEvidenceSourceFunctionInventoryResult(changed)).toThrow("failed closed");
    expect(assertCookedWeightEvidenceSourceFunctionInventoryResult(JSON.parse(sql(inventory).stdout)).search_path).toBe(0);
  });
  it("rejects revoked, deleting and replaced-generation authority before evidence, receipts or completion writes", () => {
    const batch = session(30); const before = digest(batch);
    const mutations = [
      { error: "ACCOUNT_SESSION_STALE", sql: `update public.user_session_generation_bindings set binding_state='revoked',revoked_at=clock_timestamp() where session_key_hash='${hash}';` },
      { error: "ACCOUNT_DELETING", sql: `update public.user_account_lifecycles set status='deleting' where owner_uuid='${owner}' and account_generation=1;` },
      { error: "ACCOUNT_GENERATION_STALE", sql: `update public.user_account_lifecycles set status='complete' where owner_uuid='${owner}' and account_generation=1;
       insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
       values('${owner}',2,'${epoch}','runtime','active',clock_timestamp());` },
    ];
    for (const mutation of mutations) {
      const result = sql(`begin; set local session_replication_role=replica; ${mutation.sql} set local session_replication_role=origin;
        set session authorization postgres; set local request.jwt.claim.role='service_role'; ${complete(batch, id(130))} rollback;`, false, true);
      expect(result.stderr).toContain(`ERROR:  ${mutation.error}`);
      expect(digest(batch)).toBe(before);
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
    const before = JSON.parse(digest(batch)); service(complete(batch, key, prediction(999)));
    const after = JSON.parse(digest(batch));
    // The new operation scope records one replay alias, never a prediction/backfill.
    const { receipts: beforeReceipts, ...beforeState } = before;
    const { receipts: afterReceipts, ...afterState } = after;
    expect(afterState).toEqual(beforeState);
    expect(afterReceipts).toHaveLength(beforeReceipts.length + 1);
    for (const receipt of beforeReceipts) expect(afterReceipts.find((entry: { id: string }) => entry.id === receipt.id)).toEqual(receipt);
    expect(afterReceipts.filter((entry: { result_reference: string; operation_scope: string }) => entry.result_reference === batch
      && entry.operation_scope === "snapshot_v2_complete_weight_evidence")).toHaveLength(1);
    service(complete(batch, key, prediction(123))); expect(JSON.parse(digest(batch))).toEqual(after);
    expect(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}')->>'source';`).stdout.trim()).toBe("historical_estimate");
  });
  it("freezes the reported denominator/source in the real preview and atomic meal writer", () => {
    const batch = session(11); service(complete(batch, id(111), prediction(300), "200", "'reported_measured'"));
    const before = digest(batch);
    const preview = JSON.parse(service(`select public.preview_meal_log_nutrition(${args},'cooked_batch','${batch}',100,'g');`).stdout.trim());
    expect(preview.calories_kcal).toBe(500);
    expect(preview.weight_basis).toMatchObject({ finished_weight_g: 200, source: "reported_measured", model_version: "bounded-weight-v2", batch_revision: 1 });
    expect(Object.keys(preview.weight_basis).sort()).toEqual(["schema_version", "batch_id", "recipe_content_snapshot_id", "finished_weight_g", "source", "model_version", "prediction_id", "observation_id", "batch_revision"].sort());
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
  it.each(["food_product", "ingredient"])("carries actual C03 %s frozen MIX into C01 completion without changing the snapshot", async kind => {
    const productOwner = "78000000-0000-4000-8000-000000000001";
    const productRecipe = "78000000-0000-4000-8000-000000000010";
    const productRow = "78000000-0000-4000-8000-000000000011";
    const productPin = "c3000000-0000-4000-8000-000000000001";
    const productSession = "c4000000-0000-4000-8000-000000000001";
    const productOnly = kind === "food_product";
    const amount = productOnly ? .125 : 300;
    const unit = productOnly ? "package" : "g";
    const grams = productOnly ? 25 : 300;
    const ingredientIdentity = productOnly ? null : "78000000-0000-4000-8000-000000000002";
    const instruction = productOnly ? "0.125팩을 섞습니다. 원문 그대로" : "300g을 섞습니다. 원문 그대로";
    const reference = JSON.stringify([{ ingredient_id: ingredientIdentity, row_key: productRow, amount, unit, cut_size: null }]);
    const authority = `'${productOwner}','2026-01-01',repeat('7',64),1,'2026-01-02'`;
    const fixture = readFileSync("tests/sql/recipe-product-only-fixture.sql", "utf8").replace("'product-mix'", "'MIX'")
      .replace("set local session_replication_role=origin;", "update public.account_generation_capability_state set activated_at='2026-01-01' where singleton; set local session_replication_role=origin;") + `
      update private.full_local_auth_control set local_activated_at='2026-01-01' where singleton;
      update private.cooked_batch_weight_evidence_control set enabled=true where singleton;
      update public.recipe_ingredients set amount=${amount},unit='${unit}'${productOnly ? "" : `,ingredient_id='${ingredientIdentity}',food_product_id=null,food_product_nutrition_version_id=null,source_kind='ingredient'`} where id='${productRow}';
      insert into public.recipe_steps(recipe_id,step_number,instruction,cooking_method_id,ingredients_used,heat_level)
      values('${productRecipe}',1,'${instruction}','79000000-0000-4000-8000-000000000003','${reference}',null);
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version)
      select '${productPin}',owner_user_id,'${productRecipe}',title,base_servings,ingredients_json,steps_json,content_hash,1
      from public.build_recipe_content_snapshot_input('${productRecipe}');
      update public.cooking_methods set code='BOIL' where id='79000000-0000-4000-8000-000000000003';
      insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
      values('${productSession}','${productOwner}','in_progress','snapshot_v2','standalone','${productRecipe}','${productPin}',2,1);
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);`;
    const data = JSON.parse(sql(`${fixture}
      select jsonb_build_object('session',to_jsonb(s)||jsonb_build_object('recipe_content_snapshots',to_jsonb(p)),
        'mode',public.read_snapshot_v2_cook_mode(${authority},'${productSession}'),
        'predecessors',public.read_recipe_product_nutrition_predecessors('${productOwner}',(select jsonb_agg(jsonb_build_object('id',item->'row_key',
          'ingredient_id',item->'ingredient_id','food_product_id',item->'food_product_id','food_product_nutrition_version_id',item->'food_product_nutrition_version_id')) from jsonb_array_elements(p.ingredients_json) item)))
      from public.cooking_sessions s join public.recipe_content_snapshots p on p.id=s.recipe_content_snapshot_id where s.id='${productSession}'; rollback;`, true, true).stdout.trim().split("\n").find(line => line.startsWith("{"))!);
    const query = { eq: () => query, maybeSingle: async () => ({ data: data.session, error: null }) };
    const actual = await readSnapshotWeightPrediction({ client: { from: () => ({ select: () => query }),
      rpc: async (name) => ({ data: name === "read_recipe_product_nutrition_predecessors" ? data.predecessors : null, error: null }) },
      weightClient: null, ownerId: productOwner, sessionId: productSession, cookingSteps: data.mode.data.recipe.steps });
    expect(actual?.prediction.totalGrams).toBe(grams); // Pinned V1=200g/package; current V2=300g is never borrowed.
    expect(actual?.rawRows).toEqual([{ rowKey: productRow, amount, unit, scalable: true }]);
    expect(actual?.prediction.input?.rows[0].sourceVersion).toBe(productOnly ? "78000000-0000-4000-8000-000000000004" : null);
    expect(data.mode.data.recipe.ingredients[0].amount).toBe(amount);
    expect(data.mode.data.recipe.steps[0].instruction).toBe(instruction);
    expect(data.session.recipe_content_snapshots.steps_json[0].cooking_methods).toEqual(data.mode.data.recipe.steps[0].cooking_methods);
    expect(data.mode.data.recipe.steps[0].cooking_methods[0].code).toBe("MIX"); // The real builder froze this before catalog BOIL.
    expect(actual?.methodSteps[0].methodIds).toEqual([]);
    expect(actual?.methodSteps[0].status).toBe("inferred");
    expect(actual?.prediction.assumptions).toHaveLength(3);
    const payload = JSON.stringify(actual).replaceAll("'", "''");
    const completeProduct = `public.complete_snapshot_v2_cooking_session_with_weight_evidence(${authority},'${productSession}',
      'c5000000-0000-4000-8000-000000000001','{}','weigh_later',null,null,'${payload}'::jsonb,true)`;
    expect(sql(`${fixture} do $verify$ declare before_snapshot jsonb; first_result jsonb; begin
      select to_jsonb(s) into before_snapshot from public.recipe_content_snapshots s where id='${productPin}';
      first_result:=${completeProduct};
      if first_result is distinct from ${completeProduct}
        or before_snapshot is distinct from (select to_jsonb(s) from public.recipe_content_snapshots s where id='${productPin}')
        or (select (prediction_json->'rawRows'->0->>'amount')::numeric from private.cooked_batch_weight_evidence where batch_id='${productSession}')<>${amount}
        or (select finished_weight_g from public.leftover_dishes where id='${productSession}')<>${grams}
        then raise exception 'C03_C01_PRODUCT_SNAPSHOT_CHANGED'; end if;
      end $verify$; rollback;`, true, true).status).toBe(0);
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
