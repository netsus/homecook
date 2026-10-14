import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createC05OwnedSchemaHarness } from "./fixtures/c05-owned-schema-harness.mjs";
import { sourceNativeBootstrap, sourceNativeDocument, owner, other, cutover, epoch, issued } from "./fixtures/weight-improvement-source-native";
import { decodeWeightImprovementSource } from "@/lib/server/weight-improvement-source-repository";
import { predictCookedWeight } from "@/lib/server/cooked-weight-prediction";
import { buildWeightImprovementSourceReadFunctionInventorySql, assertWeightImprovementSourceReadFunctionInventoryResult,
  buildWeightImprovementParticipationSourceFunctionInventorySql, assertWeightImprovementParticipationSourceFunctionInventoryResult,
  buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "@/scripts/lib/full-local-security-inventory.mjs";
const enabled = process.env.HOMECOOK_C05_SOURCE_NATIVE === "1";
const harness = createC05OwnedSchemaHarness();
const id = (n: number) => `d4000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const recipe = id(1), snapshot = id(2), ingredient = id(3), batch = id(4), nutrition = id(5);
const args = `'${owner}','${epoch}',repeat('b',64),1,'${issued}'`;
const migration = "supabase/migrations/20261014231000_weight_improvement_source_read.sql";
const signatures = ["private.project_weight_improvement_sample_source(uuid,bigint,uuid,uuid,bigint)",
  "public.read_weight_improvement_sample_source(uuid,timestamptz,text,integer,timestamptz,bigint,bigint,text,text,uuid,uuid,bigint)",
  "private.verify_scope_pre_weight_source_read_20261014()","private.verify_full_local_internal_scope()"];
const inventoryFlags = { includeCookedWeightEvidenceFunctions: true, includeWeightImprovementParticipationFunctions: true,
  includeWeightImprovementSourceReadFunctions: true };
let beforeScope = ""; let migrationSha = ""; let preRequestInvoked = false;
const service = (path: string, scope = "weight-improvement", method = "POST") => `set session authorization service_role;
  set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';
  set request.headers='{"x-homecook-internal-scope":"${scope}"}';set request.method='${method}';set request.path='/rpc/${path}';`;
const call = (generation = 1, revision = "1") =>
  `public.read_weight_improvement_sample_source(${args},${generation},${revision},'native-fixture-v1',
   current_setting('homecook.source_fixture.document'),'${batch}',
   current_setting('homecook.source_fixture.observation')::uuid,
   current_setting('homecook.source_fixture.revision')::bigint)`;
const known = <T extends string>(value: T) => ({ value, status: "confirmed" as const, evidenceRef: "synthetic-fixture" });
const prediction = predictCookedWeight({ recipeSnapshotId: snapshot, cookingServings: 2,
  rows: [{ rowKey: ingredient, sourceKind: "ingredient", sourceId: ingredient, sourceVersion: null, amount: 300, unit: "g",
    grams: 300, quantityKind: "quantitative", quantityOrigin: "planned",
    gramsEvidence: { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" },
    preparationState: known("raw"), role: { value: null, status: "unknown", evidenceRef: null }, foodIdentity: known(ingredient) }],
  segments: [{ id: "fixture", rowKeys: [ingredient], method: known("no_heat"), boundary: known("entire_edible"),
    drainage: known("none"), addedMedia: known("none"), protocol: known("fixture"), transformation: { kind: "closed_mix" } }] });
const payload = JSON.stringify({ schemaVersion: "cooked-weight-evidence-v1", inputVersion: "snapshot-weight-v2", catalogVersion: "usda-release2-2014",
  recipeSnapshotId: snapshot, baseServings: 2, cookingServings: 2, rawRows: [{ rowKey: ingredient, amount: 300, unit: "g", scalable: true }], methodSteps: [], prediction }).replaceAll("'","''");
const recipeSeed = `insert into private.ingredient_ai_nutrition_settings(singleton,enabled) values(true,false);
  select public.set_account_generation_internal_writer_marker('${cutover}',true);
  insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','source fixture','채소','g');
  insert into public.recipes(id,title,base_servings,created_by,source_type,visibility,revision) values('${recipe}','private fixture',2,'${owner}','manual','private',1);
      insert into public.recipe_nutrition_snapshots(id,recipe_id,base_servings,input_hash,calculation_version,scalable_values_json,fixed_values_json,nutrient_status_json,
        calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,missing_reasons,warnings_json,sources_json,is_current,calculated_at)
      values('${nutrition}','${recipe}',2,repeat('e',64),'fixture-pinned-v1','{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":50,"fat_g":20,"sodium_mg":1000}',
        '{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}',
        '{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":50,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":20,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"}}',
        'complete','direct',1,1,'{}','[]','[]',true,now());
  insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version,recipe_nutrition_snapshot_id)
  values('${snapshot}','${owner}','${recipe}','private fixture',2,'[{"ingredient_id":"${ingredient}","amount":300,"unit":"g","ingredient_type":"QUANT","scalable":true}]','[]',repeat('e',64),1,'${nutrition}');
  insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
  values('${batch}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${snapshot}',2,1);
  select public.set_account_generation_internal_writer_marker('${cutover}',false);`;
const optIn = `select public.mutate_weight_improvement_participation(${args},1,'opt_in',0,'settings_desktop','${id(9)}',
  'native-fixture-v1',current_setting('homecook.source_fixture.document'),true);`;
function setup(late = false) {
  return `${sourceNativeBootstrap}${sourceNativeDocument}
    select set_config('homecook.source_fixture.document',(select document_hash from private.weight_improvement_documents where version='native-fixture-v1'),true);${recipeSeed}${service("mutate_weight_improvement_participation")}${optIn}
    set session authorization postgres;update private.cooked_batch_weight_evidence_control set enabled=true;
    ${service("complete_snapshot_v2_cooking_session_with_weight_evidence","snapshot-v2-session")}
    select public.complete_snapshot_v2_cooking_session_with_weight_evidence(${args},'${batch}','${id(10)}','{}',
      '${late ? "weigh_later" : "set_finished_weight"}',${late ? "null" : "200"},${late ? "null" : "'reported_measured'"},'${payload}',true,clock_timestamp());
    ${late ? service("mutate_cooked_batch_weight_with_evidence","snapshot-v2-session")+`select public.mutate_cooked_batch_weight_with_evidence(${args},'${batch}','${id(11)}','set_finished_weight',200,1,'reported_measured',true,clock_timestamp());` : ""}
    set session authorization postgres;
    select set_config('homecook.source_fixture.observation',(select id::text from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='reported_measurement'),true);
    select set_config('homecook.source_fixture.revision',(select original_revision::text from private.cooked_batch_weight_evidence where batch_id='${batch}' and event_kind='reported_measurement'),true);`;
}
function transaction(body: string, late = false, succeeds = true) {
  if (body.includes(sourceConfiguredPreRequest)) preRequestInvoked = true;
  return harness.sql(`${setup(late)}${body}\nrollback;`, { admin: true, succeeds });
}
function lastJson(result: { stdout: string }) { return JSON.parse(result.stdout.trim().split("\n").at(-1)!); }
const sourceConfiguredPreRequest = `do $configured$ declare hook text; begin
  select substring(setting from length('pgrst.db_pre_request=')+1) into hook
  from pg_roles cross join lateral unnest(coalesce(rolconfig,'{}'::text[])) setting
  where rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if hook is distinct from 'public.verify_full_local_postgrest_request_authority' then raise exception 'Configured hook changed';end if;
  execute format('select %I.%I()',split_part(hook,'.',1),split_part(hook,'.',2));
end $configured$;`;
const scopedCall = () => `${service("read_weight_improvement_sample_source")}${sourceConfiguredPreRequest}select ${call()};`;
describe.runIf(enabled)("D3 receipt-bound read on own schema-only C03/C01/C05", () => {
  beforeAll(async () => {
    const schemaArchive = process.env.HOMECOOK_C05_NATIVE_SCHEMA_ARCHIVE, rolesArchive = process.env.HOMECOOK_C05_NATIVE_ROLES_ARCHIVE,
      ledgerEvidence = process.env.HOMECOOK_C05_NATIVE_LEDGER_EVIDENCE;
    if (!schemaArchive || !rolesArchive || !ledgerEvidence) throw new Error("Explicit authorized schema-only paths required");
    await harness.restore({ schemaArchive, rolesArchive, ledgerEvidence });
    harness.applyMigration(0);harness.applyMigration(1);harness.applyMigration(2);
    beforeScope = harness.sql("select md5(prosrc),proconfig,proacl from pg_proc where oid='private.verify_full_local_internal_scope()'::regprocedure;").stdout.trim();
    const sql = readFileSync(migration,"utf8");migrationSha=createHash("sha256").update(sql).digest("hex");harness.sql(sql);
  },60000);
  afterAll(() => {
    if (!enabled) return;
    const functions = lastJson(harness.sql(`select jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'body_md5',md5(btrim(prosrc,chr(10))),
      'raw_body_md5',md5(prosrc),'owner',pg_get_userbyid(proowner),'acl',proacl,'configuration',proconfig,'security_definer',prosecdef,'volatility',provolatile) order by oid::regprocedure::text)
      from pg_proc where oid=any(array[${signatures.map(s=>`'${s}'::regprocedure::oid`).join(",")}]);`));
    harness.close();writeFileSync(process.env.HOMECOOK_C05_SOURCE_REPORT ?? "/tmp/mumeok-c05-source-read-native-report.json",
      JSON.stringify({ ...harness.evidence,migration_sha256:migrationSha,functions,configured_pre_request_invoked:preRequestInvoked,production_access:false,collection_enabled:false },null,2)+"\n");
  });
  it.each([false,true])("reads a causal %s path and preserves unconfirmed/planned facts", late => {
    const output=lastJson(transaction(scopedCall(),late));expect(output.status).toBe("source");
    const decoded=decodeWeightImprovementSource(output);expect(decoded).not.toBeNull();
    expect(decoded?.current_relation?.state).toBe("current");expect(decoded?.observation.original_revision).toBe(late ? 2:1);
    expect(decoded?.prediction.prediction_json.prediction.input?.rows[0].quantityOrigin).toBe("planned");
    expect(JSON.stringify(output)).not.toContain("private fixture");expect(output.source).not.toHaveProperty("receipt");
  });
  it("retains the original scope predecessor and grants only the exact service read", () => {
    expect(harness.sql("select md5(prosrc),proconfig,proacl from pg_proc where oid='private.verify_scope_pre_weight_source_read_20261014()'::regprocedure;").stdout.trim()).toBe(beforeScope);
    const result=lastJson(harness.sql(`select jsonb_build_object('authenticated',has_function_privilege('authenticated','${signatures[1]}','EXECUTE'),
      'anon',has_function_privilege('anon','${signatures[1]}','EXECUTE'),'service',has_function_privilege('service_role','${signatures[1]}','EXECUTE'),
      'private',has_function_privilege('service_role','${signatures[0]}','EXECUTE'),'table',has_table_privilege('service_role','private.cooked_batch_weight_evidence','SELECT'));`));
    expect(result).toEqual({authenticated:false,anon:false,service:true,private:false,table:false});
  });
  it("checks the source-derived 4/8/48 contracts without changing any other C01/C05 function", () => {
    expect(assertWeightImprovementSourceReadFunctionInventoryResult(lastJson(harness.sql(buildWeightImprovementSourceReadFunctionInventorySql()))))
      .toMatchObject({required_functions:4,body:0,owner:0,acl:0,configuration:0});
    expect(assertWeightImprovementParticipationSourceFunctionInventoryResult(lastJson(harness.sql(
      buildWeightImprovementParticipationSourceFunctionInventorySql({includeWeightImprovementSourceReadFunctions:true})))))
      .toMatchObject({required_functions:8,body:0,owner:0,acl:0,configuration:0});
    expect(assertRecipeProductSourceFunctionInventoryResult(lastJson(harness.sql(buildRecipeProductSourceFunctionInventorySql(inventoryFlags))),inventoryFlags))
      .toMatchObject({required_functions:48,body:0,owner:0,acl:0,configuration:0});
  });
  it("rejects function configuration, public grant and unrelated C01 source drift", () => {
    const cases = [
      `alter function ${signatures[1]} set statement_timeout='1s';`,
      `grant execute on function ${signatures[0]} to authenticated;`,
      `do $drift$ declare definition text;begin
        select pg_get_functiondef('private.project_cooked_weight_evidence(uuid,uuid)'::regprocedure) into definition;
        execute replace(definition,'legacy_unknown','fixture_drift');end $drift$;`,
    ];
    for (const changed of cases) {
      const result=lastJson(harness.sql(`begin;${changed}${buildRecipeProductSourceFunctionInventorySql(inventoryFlags)}rollback;`));
      expect(()=>assertRecipeProductSourceFunctionInventoryResult(result,inventoryFlags)).toThrow("failed closed");
    }
  });
  it("keeps OFF, stale consent, withdrawal, old document and old cooking dates source-free", () => {
    for (const change of ["update private.weight_improvement_control set participation_enabled=false;",
      "update private.weight_improvement_participation set decision='withdrawn',withdrawn_at=clock_timestamp();",
      "update private.weight_improvement_participation set revision=revision+1;",
      "update private.weight_improvement_control set current_document_version=null,participation_enabled=false;"]) {
      const output=lastJson(transaction(`${change}${service("read_weight_improvement_sample_source")}select ${call(1,"1")};`));
      expect(output).toMatchObject({status:"disabled",source:null});
    }
    const output=lastJson(transaction(`update private.weight_improvement_participation set opted_in_at='2090-01-01';${scopedCall()}`));
    expect(output).toMatchObject({status:"unavailable",source:null});
  });
  it("rejects anonymous, wrong scope/method/path, foreign owner and stale generation", () => {
    for (const prefix of [service("read_weight_improvement_sample_source","snapshot-v2-session"),service("read_weight_improvement_sample_source","weight-improvement","GET"),
      service("other_rpc"),"set session authorization authenticated;set request.jwt.claim.role='authenticated';"]) {
      expect(transaction(`${prefix}select ${call()};`,false,false).status).not.toBe(0);
    }
    expect(transaction(`${service("read_weight_improvement_sample_source")}select ${call(2)};`,false,false).stderr).toContain("PARTICIPATION_SUBJECT_CHANGED");
    expect(transaction(`${service("read_weight_improvement_sample_source")}select ${call().replace(args,`'${other}','${epoch}',repeat('b',64),1,'${issued}'`)};`,false,false).status).not.toBe(0);
  });
  it("does not rewrite any original source or create a receipt while reading", () => {
    const output=lastJson(transaction(`create temp table source_before as select jsonb_agg(to_jsonb(r) order by id) data from public.mutation_idempotency_keys r;
      ${scopedCall()}set session authorization postgres;
      select jsonb_build_object('unchanged',(select data from source_before)=(select jsonb_agg(to_jsonb(r) order by id) from public.mutation_idempotency_keys r));`));
    expect(output).toEqual({unchanged:true});
  });
  it("preserves an original whole-weight relation after quantity events change the batch revision", () => {
    const output=lastJson(transaction(`${service("adjust_cooked_batch","snapshot-v2-session")}
      select public.adjust_cooked_batch(${args},'${batch}','${id(13)}',-10,'fixture adjustment',2,clock_timestamp());
      set session authorization postgres;${scopedCall()}`,true));
    expect(output.status).toBe("source");expect(output.source.batch.revision).toBe(3);
    expect(output.source.observation.original_revision).toBe(2);expect(output.source.observation.measured_g).toBe(200);
  });
  it("proves that the reviewed core rejects resetting a measured whole weight", () => {
    const output=lastJson(transaction(`${service("mutate_cooked_batch_weight_with_evidence","snapshot-v2-session")}
      do $guard$ begin
        perform public.mutate_cooked_batch_weight_with_evidence(${args},'${batch}','${id(14)}','set_finished_weight',200,2,'reported_measured',true,clock_timestamp());
        raise exception 'RESET_MEASURED_ACCEPTED';
      exception when sqlstate '55000' then if sqlerrm<>'CONFLICT' then raise;end if;end $guard$;
      set session authorization postgres;${scopedCall()}`,true));
    expect(output.status).toBe("source");expect(output.source.observation.original_revision).toBe(2);
  });
  it("returns unknown for nonterminal or malformed causal receipts even when numeric weights still match", () => {
    for (const assignment of ["state='in_progress',attempt_token=extensions.gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes'", "terminal_result=null", "operation_scope='snapshot_v2_complete'",
      "result_reference='"+id(20)+"'", "durable_result=jsonb_set(durable_result,'{success}','false')",
      "durable_result=jsonb_set(durable_result,'{data,batch,finished_weight_g}','199')",
      "durable_result=jsonb_set(durable_result,'{data,batch,revision}','3')",
      "durable_result=jsonb_set(durable_result,'{data,batch,weight_source}','\"estimated\"')"]) {
      const output=lastJson(transaction(`select public.set_account_generation_internal_writer_marker('${cutover}',true);
        update public.mutation_idempotency_keys set ${assignment} where id=(select operation_receipt_id from private.cooked_batch_weight_evidence
          where batch_id='${batch}' and event_kind='reported_measurement');
        select public.set_account_generation_internal_writer_marker('${cutover}',false);${scopedCall()}`,true));
      expect(output).toMatchObject({status:"unknown",source:null});
    }
  });
  it("requires the original completion core behind a later measurement to match its successful wrapper", () => {
    for (const assignment of [
      "state='in_progress',attempt_token=extensions.gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes'",
      "terminal_result=null", "operation_scope='cooked_batch_set_finished_weight'", "key_hash=repeat('1',64)",
      "result_reference='"+id(20)+"'", "durable_result=jsonb_set(durable_result,'{success}','false')",
      "durable_result=jsonb_set(durable_result,'{data,cooked_batch,revision}','2')",
    ]) {
      const output=lastJson(transaction(`select public.set_account_generation_internal_writer_marker('${cutover}',true);
        update public.mutation_idempotency_keys set ${assignment} where owner_uuid='${owner}' and account_generation=1
          and result_reference='${batch}' and operation_scope='snapshot_v2_complete';
        select public.set_account_generation_internal_writer_marker('${cutover}',false);${scopedCall()}`,true));
      expect(output).toMatchObject({status:"unknown",source:null});
    }
  });
});
