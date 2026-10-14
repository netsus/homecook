import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildCookedWeightAttestationSourceFunctionInventorySql, assertCookedWeightAttestationSourceFunctionInventoryResult,
  buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "@/scripts/lib/full-local-security-inventory.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import { WEIGHT_ATTESTATION_STATEMENT, type WeightAttestationContext } from "@/types/cooked-weight-attestation";

const enabled = process.env.HOMECOOK_WEIGHT_ATTESTATION_ISOLATED_PG === "1";
const cid = process.env.HOMECOOK_WEIGHT_ATTESTATION_TEST_CONTAINER ?? "";
const tag = process.env.HOMECOOK_WEIGHT_ATTESTATION_TEST_TAG ?? "";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const owner = "b1000000-0000-4000-8000-000000000001", other = "b1000000-0000-4000-8000-000000000002";
const recipe = "b2000000-0000-4000-8000-000000000001", pin = "b3000000-0000-4000-8000-000000000001", nutrition = "b9000000-0000-4000-8000-000000000001";
const column = "b6000000-0000-4000-8000-000000000001";
const ingredient = "b8000000-0000-4000-8000-000000000001", cutover = "b5000000-0000-4000-8000-000000000001";
const epoch = "2026-08-08T00:00:00Z", issued = "2026-08-08T01:00:00Z", hash = "e".repeat(64);
const args = `'${owner}','${epoch}','${hash}',1,'${issued}'`;
const children = new Set<ChildProcessWithoutNullStreams>();
function literal(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function own() {
  if (!/^[a-f0-9]{64}$/u.test(cid) || !/^[a-f0-9-]{36}$/u.test(tag)) throw new Error("An exact owned fixture is required");
  const r = spawnSync("docker", ["inspect", cid], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("Owned fixture unavailable");
  const x = JSON.parse(r.stdout)[0];
  if (x.Config.Labels["homecook.weight-attestation-native"] !== tag || x.Config.Image !== image
    || x.HostConfig.NetworkMode !== "none" || x.Mounts.length !== 0 || Object.keys(x.HostConfig.PortBindings ?? {}).length !== 0) throw new Error("Refusing unowned fixture");
}
function sql(statement: string, succeeds = true, admin = false, database = "postgres") {
  own();
  const r = spawnSync("docker", ["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: `${admin ? "" : "set session authorization postgres;"}\n${statement}`, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });
  if (succeeds) expect(r.status, r.stderr).toBe(0);
  return r;
}
function rpc(name: string, statement: string, succeeds = true, scope = "snapshot-v2-session", path = `/rpc/${name}`) {
  return sql(`begin;set local role service_role;set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}';
    set local request.headers=${literal(JSON.stringify({ "x-homecook-internal-scope": scope }))};set local request.method='POST';set local request.path=${literal(path)};
    ${statement} commit;`, succeeds);
}
function id(n: number) { return `b4000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
const prediction = JSON.stringify(predictSnapshotWeight({ snapshotId: pin, baseServings: 2, cookingServings: 4,
  ingredients: [{ id: ingredient, ingredient_id: ingredient, amount: 100, unit: "g", scalable: true, ingredient_type: "QUANT", preparation_state: null }] }));
function session(n: number, serving = 4) {
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
    values('${id(n)}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${pin}',${serving},1);select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  return id(n);
}
function context(kind: "session" | "batch", target: string, who = args): WeightAttestationContext {
  return JSON.parse(rpc("read_cooked_weight_attestation", `select public.read_cooked_weight_attestation(${who},'${kind}','${target}');`).stdout.trim());
}
function complete(target: string, key: string, ctx: WeightAttestationContext, grams = 180, expectedGeneration = 1) {
  return `select public.complete_snapshot_v2_cooking_session_with_attestation(${args},'${target}','${key}','{}','set_finished_weight',${grams},'reported_measured',${literal(prediction)}::jsonb,true,${expectedGeneration},'${WEIGHT_ATTESTATION_STATEMENT}','${ctx.context_fingerprint}',true);`;
}
function legacyComplete(target: string, key: string, measured = false) {
  return `select public.complete_snapshot_v2_cooking_session_with_weight_evidence(${args},'${target}','${key}','{}','${measured ? "set_finished_weight" : "weigh_later"}',${measured ? 180 : "null"},${measured ? "'reported_measured'" : "null"},${literal(prediction)}::jsonb,true);`;
}
function measure(target: string, key: string, ctx: WeightAttestationContext) {
  return `select public.mutate_cooked_batch_weight_with_attestation(${args},'${target}','${key}','set_finished_weight',180,1,'reported_measured',true,1,'${WEIGHT_ATTESTATION_STATEMENT}','${ctx.context_fingerprint}',true);`;
}
function retract(target: string, key: string, ctx: WeightAttestationContext) {
  if (!ctx.record) throw new Error("Record required");
  return `select public.retract_cooked_weight_attestation(${args},'${target}','${key}',1,'${ctx.record.id}',${ctx.record.revision},'${ctx.record.context_fingerprint}');`;
}
function originalDigest(target: string) {
  return sql(`select jsonb_build_object('session',(select to_jsonb(s) from public.cooking_sessions s where id='${target}'),
    'batch',(select to_jsonb(b) from public.leftover_dishes b where id='${target}'),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from private.cooked_batch_weight_evidence e where batch_id='${target}'),
    'snapshot',(select to_jsonb(s) from public.recipe_content_snapshots s where id='${pin}'),
    'meals',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.meal_log_entries m where cooked_batch_id='${target}'),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.cooked_batch_quantity_events e where cooked_batch_id='${target}'),
    'original_receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.mutation_idempotency_keys r where result_reference='${target}' and operation_scope not like 'weight_attestation_%'));`).stdout.trim();
}
function allAttemptDigest(target: string) {
  return sql(`select jsonb_build_object('data',${literal(originalDigest(target))},'assertions',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from private.cooked_weight_user_attestations a where batch_id='${target}'),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.mutation_idempotency_keys r where owner_uuid='${owner}'));`).stdout.trim();
}
function tableRows(table: string, database = "postgres") { return sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t;`, true, true, database).stdout.trim(); }
async function interactive() {
  own();
  const child = spawn("docker", ["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], { stdio: "pipe" });
  children.add(child);
  let output = "", errors = "";
  child.stdout.on("data", data => { output += data.toString(); });child.stderr.on("data", data => { errors += data.toString(); });
  return {
    query: async (statement: string) => {
      own();const start = output.length, token = randomUUID();child.stdin.write(`${statement}\nselect '${token}';\n`);
      const deadline = Date.now() + 5_000;
      while (!output.slice(start).includes(token)) {
        if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) throw new Error(`Owned session failed: ${errors}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return output.slice(start).split(token)[0].trim();
    },
    close: () => { child.stdin.end("\\q\n");children.delete(child); },
  };
}

describe.runIf(enabled)("personal user attestation on original C01 authority", () => {
  beforeAll(() => {
    expect(sql("select current_user||':'||rolsuper::text from pg_roles where rolname=current_user;").stdout.trim()).toBe("postgres:false");
    expect(sql("select enabled from private.cooked_weight_user_attestation_control where singleton;").stdout.trim()).toBe("f");
    sql(`begin;set session_replication_role=replica;
      insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at) values(true,'local','https://fixture.invalid/auth/v1',2,1,true,'${epoch}');
      insert into private.ingredient_ai_nutrition_settings(singleton,enabled) values(true,false);
      insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
      insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'${cutover}','${epoch}');set session_replication_role=origin;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into auth.users(id,created_at,email) values('${owner}','${epoch}','attestation-a@example.invalid'),('${other}','${epoch}','attestation-b@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values('${owner}','attestation-a','google','attestation-a'),('${other}','attestation-b','google','attestation-b') on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at) values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
      values('${hash}',1,'${owner}',1,'${epoch}','active','local','https://fixture.invalid/auth/v1','${issued}',2,'${issued}','2099-01-01'),('${"f".repeat(64)}',1,'${other}',1,'${epoch}','active','local','https://fixture.invalid/auth/v1','${issued}',2,'${issued}','2099-01-01');
      insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','합성 재료','채소','g');
      insert into public.recipes(id,title,base_servings,created_by,source_type,visibility,revision,updated_at) values('${recipe}','합성 음식',2,'${owner}','manual','private',1,now());
      insert into public.recipe_nutrition_snapshots(id,recipe_id,base_servings,input_hash,calculation_version,scalable_values_json,fixed_values_json,nutrient_status_json,calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,missing_reasons,warnings_json,sources_json,is_current,calculated_at)
      values('${nutrition}','${recipe}',2,repeat('e',64),'fixture-pinned-v1','{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":50,"fat_g":20,"sodium_mg":1000}','{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}','{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":50,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":20,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"}}','complete','direct',1,1,'{}','[]','[]',true,now());
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version,recipe_nutrition_snapshot_id)
      values('${pin}','${owner}','${recipe}','합성 음식',2,'[{"ingredient_id":"${ingredient}","amount":100,"unit":"g","scalable":true,"ingredient_type":"QUANT","food_product_id":null}]','[]',repeat('e',64),1,'${nutrition}');
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${column}','${owner}','합성 식사',0);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`, true, true);
    sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");
  });
  afterAll(() => { for (const child of children) child.kill(); });
  it("keeps default OFF, owner read and original unchecked completion independent", () => {
    const target = session(100);const ctx = context("session", target);
    expect(ctx.can_attest).toBe(false);expect(ctx.record).toBeNull();
    const before = allAttemptDigest(target);
    const denied = rpc("complete_snapshot_v2_cooking_session_with_attestation", complete(target,id(1100),ctx), false);
    expect(denied.status).not.toBe(0);expect(denied.stderr).toContain("WEIGHT_ATTESTATION_DISABLED");expect(allAttemptDigest(target)).toBe(before);
    rpc("complete_snapshot_v2_cooking_session_with_weight_evidence",legacyComplete(target,id(1101)));
    expect(context("batch", target).record).toBeNull();
    expect(sql("select count(*) from private.cooked_weight_user_attestations;").stdout.trim()).toBe("0");
  });
  it("atomically reuses real C01 nested authorization and stores frozen planned rows as user statements", () => {
    sql("update private.cooked_weight_user_attestation_control set enabled=true where singleton;");const target=session(101),ctx=context("session",target);
    expect(ctx.can_attest).toBe(true);
    const result=JSON.parse(rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1102),ctx)).stdout.trim());
    expect(result.success).toBe(true);expect(result.data.weight_attestation).toMatchObject({ status:"attested",measured_g:180,measurement_original_revision:1,provenance:"user_attested",physical_verification:"not_verified",record_usage:"qa_personal_record" });
    const stored=JSON.parse(sql(`select assertion_json from private.cooked_weight_user_attestations where batch_id='${target}';`).stdout.trim());
    expect(stored.payload.rows[0]).toMatchObject({snapshot_amount:100,declared_batch_amount:200,quantity_origin:"planned",claim:"matches_pinned_quantities",provenance:"user_attested"});
    expect(context("batch",target).record?.measured_g).toBe(180);
    const receipt=sql(`select count(*) from public.mutation_idempotency_keys where result_reference='${target}' and state='succeeded';`).stdout.trim();expect(receipt).toBe("3");
  });
  it("replays the original own receipt while OFF without reviving a later retraction or changing C01 history", () => {
    const target=id(101),original=context("batch",target),ctx=context("session",target),before=originalDigest(target);
    sql("update private.cooked_weight_user_attestation_control set enabled=false where singleton;");
    const r=JSON.parse(rpc("retract_cooked_weight_attestation",retract(target,id(1103),original)).stdout.trim());expect(r.record.status).toBe("retracted");expect(r.record.measured_g).toBe(180);
    expect(JSON.parse(rpc("retract_cooked_weight_attestation",retract(target,id(1103),original)).stdout.trim())).toEqual(r);
    expect(originalDigest(target)).toBe(before);
    expect(JSON.parse(rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1102),ctx)).stdout.trim()).data.weight_attestation.status).toBe("attested");
    expect(context("batch",target).record?.status).toBe("retracted");expect(sql(`select count(*) from private.cooked_weight_user_attestations where batch_id='${target}';`).stdout.trim()).toBe("2");
  });
  it("rejects stale context/generation, foreign owner and direct table/scope access without partial writes", () => {
    sql("update private.cooked_weight_user_attestation_control set enabled=true where singleton;");const target=session(102),ctx=context("session",target),before=allAttemptDigest(target);
    for(const [statement,code] of [[complete(target,id(1104),{...ctx,context_fingerprint:"a".repeat(64)}),"WEIGHT_ATTESTATION_CONTEXT_CHANGED"],[complete(target,id(1105),ctx,180,2),"WEIGHT_ATTESTATION_SUBJECT_CHANGED"]]) {
      const r=rpc("complete_snapshot_v2_cooking_session_with_attestation",statement,false);expect(r.status).not.toBe(0);expect(r.stderr).toContain(code);expect(allAttemptDigest(target)).toBe(before);
    }
    const foreign=`'${other}','${epoch}','${"f".repeat(64)}',1,'${issued}'`;
    const f=rpc("read_cooked_weight_attestation",`select public.read_cooked_weight_attestation(${foreign},'session','${target}');`,false);expect(f.stderr).toContain("RESOURCE_NOT_FOUND");
    const missing=rpc("read_cooked_weight_attestation",`select public.read_cooked_weight_attestation(${args},'session','${target}');`,false,"wrong-scope");expect(missing.stderr).toContain("FORBIDDEN");
    for(const role of ["anon","authenticated","service_role"])expect(sql(`set role ${role};select count(*) from private.cooked_weight_user_attestations;`,false).stderr).toContain("permission denied");
  });
  it("does not attach to an old C01 receipt or an existing manual measurement", () => {
    const target=session(103),ctx=context("session",target);rpc("complete_snapshot_v2_cooking_session_with_weight_evidence",legacyComplete(target,id(1106),true));const before=allAttemptDigest(target);
    const r=rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1106),ctx),false);expect(r.stderr).toContain("WEIGHT_ATTESTATION_OLD_RECEIPT");expect(allAttemptDigest(target)).toBe(before);
    expect(context("batch",target).can_attest).toBe(false);expect(context("batch",target).record).toBeNull();
  });
  it("rolls back the original completion/measurement/receipts if the new append fails", () => {
    const target=session(104),ctx=context("session",target),before=allAttemptDigest(target);
    sql("create function private.attestation_fixture_fail() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_APPEND_FAILURE';end;$$;create trigger attestation_fixture_fail before insert on private.cooked_weight_user_attestations for each row execute function private.attestation_fixture_fail();");
    try { const r=rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1107),ctx),false);expect(r.stderr).toContain("SYNTHETIC_APPEND_FAILURE");expect(allAttemptDigest(target)).toBe(before); }
    finally { sql("drop trigger attestation_fixture_fail on private.cooked_weight_user_attestations;drop function private.attestation_fixture_fail();"); }
  });
  it("supports later measurement with its original evidence revision, separate from current balance revision", () => {
    sql("update private.cooked_weight_user_attestation_control set enabled=true where singleton;");
    const target=session(105);rpc("complete_snapshot_v2_cooking_session_with_weight_evidence",legacyComplete(target,id(1108)));const ctx=context("batch",target);
    expect(ctx.can_attest).toBe(true);const result=JSON.parse(rpc("mutate_cooked_batch_weight_with_attestation",measure(target,id(1109),ctx)).stdout.trim());
    expect(result.data.weight_attestation).toMatchObject({measured_g:180,measurement_original_revision:2,revision:1});
    // Use a real nonempty meal and its frozen original C01 denominator.
    const body=JSON.stringify({source:{type:"cooked_batch",id:target},quantity:{amount:30,unit:"g"},
      consumed_local_date:"2026-10-15",timezone_name_snapshot:"Asia/Seoul",consumed_at:null,meal_plan_column_id:column});
    rpc("mutate_meal_log_entry",`select public.mutate_meal_log_entry(${args},'create','${id(2110)}','${id(1110)}',null,${literal(body)}::jsonb);`,true,"meal-log-write");
    const basis=JSON.parse(sql(`select nutrition_evidence_json->'weight_basis' from public.meal_log_entries where id='${id(2110)}';`).stdout.trim());
    expect(basis).toMatchObject({finished_weight_g:180,source:"reported_measured",observation_id:result.data.weight_attestation.measurement_evidence_id});
    const current=context("batch",target);expect(current.record?.measurement_original_revision).toBe(2);expect(current.record?.measured_g).toBe(180);
    expect(sql(`select revision||':'||remaining_weight_g from public.leftover_dishes where id='${target}';`).stdout.trim()).toBe("3:150");
    const before=originalDigest(target);rpc("retract_cooked_weight_attestation",retract(target,id(1111),current));expect(originalDigest(target)).toBe(before);
  });
  it("rejects changed payload under a committed own key without altering the original receipts", () => {
    const target=id(101),ctx=context("session",target),before=allAttemptDigest(target);
    const r=rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1102),ctx,181),false);
    expect(r.stderr).toContain("IDEMPOTENCY_KEY_REUSED");expect(allAttemptDigest(target)).toBe(before);
  });
  it("keeps read/retract available when the original C01 writer is OFF", () => {
    const target=session(107),ctx=context("session",target);rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1113),ctx));
    const current=context("batch",target),before=originalDigest(target);sql("update private.cooked_batch_weight_evidence_control set enabled=false where singleton;");
    try {expect(context("batch",target).record?.status).toBe("attested");rpc("retract_cooked_weight_attestation",retract(target,id(1114),current));expect(originalDigest(target)).toBe(before);}
    finally {sql("update private.cooked_batch_weight_evidence_control set enabled=true where singleton;");}
  });
  it("rolls back a later weight mutation and supports the exact same-key retry after append failure", () => {
    const target=session(108);rpc("complete_snapshot_v2_cooking_session_with_weight_evidence",legacyComplete(target,id(1115)));
    const ctx=context("batch",target),before=allAttemptDigest(target);
    sql("create function private.attestation_fixture_fail() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_APPEND_FAILURE';end;$$;create trigger attestation_fixture_fail before insert on private.cooked_weight_user_attestations for each row execute function private.attestation_fixture_fail();");
    try {const r=rpc("mutate_cooked_batch_weight_with_attestation",measure(target,id(1116),ctx),false);expect(r.stderr).toContain("SYNTHETIC_APPEND_FAILURE");expect(allAttemptDigest(target)).toBe(before);}
    finally {sql("drop trigger attestation_fixture_fail on private.cooked_weight_user_attestations;drop function private.attestation_fixture_fail();");}
    expect(JSON.parse(rpc("mutate_cooked_batch_weight_with_attestation",measure(target,id(1116),ctx)).stdout.trim()).data.weight_attestation.measured_g).toBe(180);
  });
  it("serializes emergency OFF against a fresh writer and allows OFF read/retract", async () => {
    const target=session(106),ctx=context("session",target),before=allAttemptDigest(target);
    const held=await interactive();try {
      await held.query(`set session authorization postgres;begin;set local role service_role;
        set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}';
        set local request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}';set local request.method='POST';
        set local request.path='/rpc/complete_snapshot_v2_cooking_session_with_attestation';${complete(target,id(1112),ctx)}`);
      const blocked=sql("begin;set local lock_timeout='150ms';update private.cooked_weight_user_attestation_control set enabled=false where singleton;commit;",false);
      expect(blocked.status).not.toBe(0);expect(blocked.stderr).toContain("lock timeout");expect(blocked.stderr).not.toContain("permission denied");
      await held.query("rollback;");sql("update private.cooked_weight_user_attestation_control set enabled=false where singleton;");
      expect(context("session",target).can_attest).toBe(false);expect(allAttemptDigest(target)).toBe(before);
      const r=rpc("complete_snapshot_v2_cooking_session_with_attestation",complete(target,id(1112),ctx),false);expect(r.stderr).toContain("WEIGHT_ATTESTATION_DISABLED");
      expect(sql("select enabled from private.cooked_batch_weight_evidence_control where singleton;").stdout.trim()).toBe("t");
    } finally {held.close();}
  });
  it("preserves two new tables and their measurement/snapshot FKs through actual owned dump/restore", () => {
    own();const dump=spawnSync("docker",["exec",cid,"pg_dump","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-Fc"],{maxBuffer:20*1024*1024,timeout:30_000});expect(dump.status,String(dump.stderr)).toBe(0);
    const db=`attestation_restore_${randomUUID().replaceAll("-","")}`;sql(`create database ${db};`,true,true);
    own();const r=spawnSync("docker",["exec","-i",cid,"pg_restore","-h","/tmp/pgsocket","-U","supabase_admin","-d",db,"--exit-on-error"],{input:dump.stdout,encoding:"utf8",maxBuffer:20*1024*1024,timeout:30_000});expect(r.status,r.stderr).toBe(0);
    try {
      for(const table of ["private.cooked_weight_user_attestations","private.cooked_weight_user_attestation_control","private.cooked_batch_weight_evidence","public.leftover_dishes","public.recipe_content_snapshots"])expect(tableRows(table,db)).toBe(tableRows(table));
      expect(sql("select count(*) from pg_constraint where conrelid='private.cooked_weight_user_attestations'::regclass and contype='f';",true,true,db).stdout.trim()).toBe("5");
      sql("update private.cooked_weight_user_attestation_control set enabled=true where singleton;",true,true,db);expect(sql("select enabled from private.cooked_weight_user_attestation_control;",true,true,db).stdout.trim()).toBe("t");
      sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);select set_config('homecook.account_delete_user_id','${owner}',true);delete from public.leftover_dishes where id='${id(101)}';select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`,true,true,db);expect(sql(`select count(*) from private.cooked_weight_user_attestations where batch_id='${id(101)}';`,true,true,db).stdout.trim()).toBe("0");
      sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);select set_config('homecook.account_delete_user_id','${owner}',true);delete from public.users where id='${owner}';select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`,true,true,db);expect(sql(`select count(*) from private.cooked_weight_user_attestations where owner_uuid='${owner}';`,true,true,db).stdout.trim()).toBe("0");
    } finally {sql(`drop database ${db};`,true,true);}
  }, 30_000);
  it("verifies exact source/default arguments/owner/ACL/config and rejects a new helper grant drift", () => {
    const source=()=>JSON.parse(sql(buildCookedWeightAttestationSourceFunctionInventorySql()).stdout.trim());
    expect(assertCookedWeightAttestationSourceFunctionInventoryResult(source()).required_functions).toBe(10);
    const options={includeCookedWeightEvidenceFunctions:true,includeQuantityInputV4Functions:true,includeCookedWeightAttestationFunctions:true};
    expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql(options)).stdout.trim()),options).missing).toBe(0);
    sql("grant execute on function private.require_cooked_weight_attestation_scope(text) to anon;");
    try {expect(source().acl).toBe(1);expect(()=>assertCookedWeightAttestationSourceFunctionInventoryResult(source())).toThrow("failed closed");}
    finally {sql("revoke execute on function private.require_cooked_weight_attestation_scope(text) from anon;");}
    expect(assertCookedWeightAttestationSourceFunctionInventoryResult(source()).acl).toBe(0);
    const immutable=sql(`update private.cooked_weight_user_attestations set statement_version='pinned-quantities-whole-net-weight-v1' where batch_id='${id(101)}';`,false);
    expect(immutable.stderr).toContain("CONFLICT");
  });
  it("keeps every original worker RPC, authority function, role and synthetic credential unchanged", () => {
    const before=JSON.parse(readFileSync('/tmp/mumeok-weight-attestation-native-functions-before.json','utf8'));
    const after=JSON.parse(readFileSync('/tmp/mumeok-weight-attestation-native-functions-after.json','utf8'));
    expect(before).toHaveLength(453);for(const entry of before)if(entry.name!=="verify_full_local_internal_scope")expect(after.find((a:{lookupSignature:string})=>a.lookupSignature===entry.lookupSignature)).toEqual(entry);
    const readiness=JSON.parse(sql("begin;set local request.jwt.claims='{\"role\":\"youtube_extraction_worker\"}';select public.read_youtube_extraction_enqueue_readiness();commit;",true,true).stdout.trim());expect(readiness.catalog_fingerprint).toBe("de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05");
    expect(sql("select current_generation||':'||current_jti_hash||':'||release_sha from private.youtube_extraction_worker_credentials where credential_name='primary';",true,true).stdout.trim()).toBe(`47:${"a".repeat(64)}:${"5".repeat(40)}`);
  });
});
