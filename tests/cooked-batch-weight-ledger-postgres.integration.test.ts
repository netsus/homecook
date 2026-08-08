import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ?? "";
const port = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ?? "";
const database = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ?? "";

const ownerA = "a1000000-0000-4000-8000-000000000001";
const ownerB = "a1000000-0000-4000-8000-000000000002";
const recipeA = "a2000000-0000-4000-8000-000000000001";
const recipeB = "a2000000-0000-4000-8000-000000000002";
const contentA = "a3000000-0000-4000-8000-000000000001";
const contentB = "a3000000-0000-4000-8000-000000000002";
const batchA = "a4000000-0000-4000-8000-000000000001";
const batchB = "a4000000-0000-4000-8000-000000000002";
const legacyBatch = "a4000000-0000-4000-8000-000000000009";
const completeSession = "a4000000-0000-4000-8000-000000000003";
const plannerSession = "a4000000-0000-4000-8000-000000000004";
const plannerMeal = "a4000000-0000-4000-8000-000000000005";
const plannerColumn = "a4000000-0000-4000-8000-000000000006";
const ingredient = "a8000000-0000-4000-8000-000000000001";
const pantryA = "a9000000-0000-4000-8000-000000000001";
const pantryB = "a9000000-0000-4000-8000-000000000002";
const identityA = "2026-08-08T00:00:00.000Z";
const identityB = "2026-08-08T00:01:00.000Z";
const issuedA = "2026-08-08T01:00:00.000Z";
const issuedB = "2026-08-08T01:01:00.000Z";
const sessionHashA = "a".repeat(64);
const sessionHashB = "b".repeat(64);
const cutoverAttempt = "a5000000-0000-4000-8000-000000000001";
const localIssuer = "https://auth.mumeok.kr/auth/v1";

function authArgs(owner: string) {
  return owner === ownerA
    ? `'${ownerA}'::uuid,'${identityA}'::timestamptz,'${sessionHashA}'::text,1,'${issuedA}'::timestamptz`
    : `'${ownerB}'::uuid,'${identityB}'::timestamptz,'${sessionHashB}'::text,1,'${issuedB}'::timestamptz`;
}

interface TestRpcEnvelope {
  data: {
    action?: string;
    batch?: Record<string, unknown>;
    event_id?: string;
    [key: string]: unknown;
  };
  deleted?: boolean;
  [key: string]: unknown;
}

function extractJson(stdout: string): TestRpcEnvelope {
  const line = stdout.trim().split("\n").map((value) => value.trim())
    .findLast((value) => value.startsWith("{"));
  return JSON.parse(line ?? "null") as TestRpcEnvelope;
}

function serviceRpc(sql: string, expectSuccess = true) {
  return psql(`
    begin;
    set local request.jwt.claim.role = 'service_role';
    ${sql}
    commit;
  `, expectSuccess);
}

function psql(sql: string, expectSuccess = true) {
  const result = spawnSync("psql", [
    "-h", host, "-p", port, "-U", "postgres", "-d", database,
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "" } });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  return result;
}

function ownerDigest(owner: string) {
  return psql(`
    select encode(extensions.digest(convert_to(jsonb_build_object(
      'pantry', (select coalesce(jsonb_agg(jsonb_build_array(id,ingredient_id,food_product_id) order by id),'[]'::jsonb) from public.pantry_items where user_id='${owner}'),
      'batches', (select coalesce(jsonb_agg(jsonb_build_array(id,status,remaining_weight_g,weight_status,batch_status,depleted_reason,revision,event_checksum) order by id),'[]'::jsonb) from public.leftover_dishes where user_id='${owner}'),
      'events', (select coalesce(jsonb_agg(jsonb_build_array(id,cooked_batch_id,event_type,delta_g,reason,reverses_event_id) order by id),'[]'::jsonb) from public.cooked_batch_quantity_events where owner_user_id='${owner}'),
      'sessions', (select coalesce(jsonb_agg(jsonb_build_array(id,status,completed_at) order by id),'[]'::jsonb) from public.cooking_sessions where user_id='${owner}'),
      'claims', (select coalesce(jsonb_agg(jsonb_build_array(meal_id,session_id) order by meal_id),'[]'::jsonb) from public.cooking_session_meal_claims where owner_user_id='${owner}'),
      'meals', (select coalesce(jsonb_agg(jsonb_build_array(id,status,revision,is_leftover,leftover_dish_id) order by id),'[]'::jsonb) from public.meals where user_id='${owner}'),
      'recipes', (select coalesce(jsonb_agg(jsonb_build_array(id,cook_count) order by id),'[]'::jsonb) from public.recipes where created_by='${owner}'),
      'progress', (select coalesce(jsonb_agg(jsonb_build_array(event_type,source_key,xp_delta) order by id),'[]'::jsonb) from public.user_progress_events where user_id='${owner}')
    )::text,'UTF8'),'sha256'),'hex');
  `).stdout.trim().split("\n").at(-1);
}

describe.runIf(enabled)("cooked batch weight ledger PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      create table if not exists public.meal_plan_columns(
        id uuid primary key,
        user_id uuid not null
      );
      insert into auth.users(id,created_at,email) values
        ('${ownerA}','${identityA}','batch-a@example.invalid'),
        ('${ownerB}','${identityB}','batch-b@example.invalid');
      update private.full_local_auth_control
      set authority='local',local_issuer='${localIssuer}',cutover_epoch=2,
          hmac_key_version=1,flows_open=true,
          local_activated_at='2026-08-08T00:00:00Z',updated_at=now()
      where singleton;
      insert into public.account_generation_cutover_attempts(
        id,state,capability_revision,result_json
      ) values('${cutoverAttempt}','promoted',2,'{}'::jsonb);
      update public.account_generation_capability_state
      set state='generation_active',revision=revision+1,
          current_cutover_attempt_id='${cutoverAttempt}',
          activated_at='2026-08-08T00:30:00Z'
      where singleton;
      select public.set_account_generation_internal_writer_marker(
        (select current_cutover_attempt_id
         from public.account_generation_capability_state where singleton),
        true
      );
      insert into public.users(id,nickname,social_provider,social_id) values
        ('${ownerA}','owner-a','test','owner-a'),('${ownerB}','owner-b','test','owner-b')
      on conflict(id) do nothing;
      insert into public.meal_plan_columns(id,user_id)
      values('a4000000-0000-4000-8000-000000000099','${ownerB}')
      on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation)
      values('${ownerA}',1),('${ownerB}',1);
      insert into public.user_account_lifecycles(
        owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
      ) values
        ('${ownerA}',1,'${identityA}','runtime','active',now()),
        ('${ownerB}',1,'${identityB}','runtime','active',now());
      insert into public.user_session_generation_bindings(
        session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,
        local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at
      ) values
        ('${sessionHashA}',1,'${ownerA}',1,'${identityA}','active','local','${localIssuer}','${issuedA}',2,'${issuedA}','2099-01-01T00:00:00Z'),
        ('${sessionHashB}',1,'${ownerB}',1,'${identityB}','active','local','${localIssuer}','${issuedB}',2,'${issuedB}','2099-01-01T00:00:00Z');
      insert into public.ingredients(id,name) values('${ingredient}','공통 재료');
      insert into public.recipes(id,title,base_servings,created_by,visibility,revision,updated_at) values
        ('${recipeA}','owner A soup',2,'${ownerA}','private',1,now()),
        ('${recipeB}','owner B soup',2,'${ownerB}','private',1,now())
      on conflict(id) do nothing;
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version) values
        ('${contentA}','${ownerA}','${recipeA}','owner A soup',2,
          '[{"ingredient_id":"${ingredient}","food_product_id":null}]','[]',repeat('a',64),1),
        ('${contentB}','${ownerB}','${recipeB}','owner B soup',2,'[]','[]',repeat('b',64),1)
      on conflict(id) do nothing;
      insert into public.leftover_dishes(
        id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        finished_weight_g,remaining_weight_g,weight_status,batch_status,depleted_reason,revision,event_checksum
      ) values
        ('${batchA}','${ownerA}','${recipeA}','${contentA}','leftover',now(),2,1000,1000,'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${batchB}','${ownerB}','${recipeB}','${contentB}','leftover',now(),2,null,null,'missing','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('${legacyBatch}','${ownerA}','${recipeA}',null,'leftover',now(),2,null,null,null,null,null,null,null)
      on conflict(id) do nothing;
      insert into public.pantry_items(id,user_id,ingredient_id) values
        ('${pantryA}','${ownerA}','${ingredient}'),
        ('${pantryB}','${ownerB}','${ingredient}');
      insert into public.cooking_sessions(
        id,user_id,status,contract_version,session_kind,recipe_id,
        recipe_content_snapshot_id,cooking_servings,base_recipe_revision
      ) values(
        '${completeSession}','${ownerA}','in_progress','snapshot_v2','standalone',
        '${recipeA}','${contentA}',2,1
      );
      insert into public.meals(
        id,user_id,recipe_id,plan_date,column_id,planned_servings,status,revision
      ) values(
        '${plannerMeal}','${ownerA}','${recipeA}',current_date + 1,'${plannerColumn}',2,
        'shopping_done',1
      );
      insert into public.cooking_sessions(
        id,user_id,status,contract_version,session_kind,recipe_id,
        recipe_content_snapshot_id,cooking_servings,base_recipe_revision
      ) select
        '${plannerSession}','${ownerA}','in_progress','snapshot_v2','planner',
        '${recipeA}',recipe_content_snapshot_id,2,null
      from public.meals where id='${plannerMeal}';
      insert into public.cooking_session_meals(
        session_id,meal_id,recipe_id,cooking_servings,meal_revision_snapshot
      ) values('${plannerSession}','${plannerMeal}','${recipeA}',2,1);
      insert into public.cooking_session_meal_claims(
        meal_id,session_id,owner_user_id
      ) values('${plannerMeal}','${plannerSession}','${ownerA}');
      select public.set_account_generation_internal_writer_marker(
        (select current_cutover_attempt_id
         from public.account_generation_capability_state where singleton),
        false
      );
    `);
  });

  it("matches the exact function owner, ACL, security mode and search-path manifest", () => {
    const manifest = JSON.parse(readFileSync(
      "docs/security/cooked-batch-weight-ledger-security-function-authorization-manifest.json",
      "utf8",
    )) as {
      functions: Array<{
        allowed_principals: string[];
        owner: string;
        safe_search_path: string[];
        security_mode: "definer" | "invoker";
        signature: string;
      }>;
    };

    for (const entry of manifest.functions) {
      const observation = extractJson(psql(`
        select jsonb_build_object(
          'owner', owner.rolname,
          'security_definer', procedure.prosecdef,
          'search_path', (
            select config from unnest(procedure.proconfig) as config
            where config like 'search_path=%'
          ),
          'public_execute', exists (
            select 1 from pg_catalog.aclexplode(
              coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
            ) as acl where acl.grantee=0 and acl.privilege_type='EXECUTE'
          ),
          'anon_execute', pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE'),
          'authenticated_execute', pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE'),
          'service_role_execute', pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE')
        )
        from pg_catalog.pg_proc as procedure
        join pg_catalog.pg_roles as owner on owner.oid=procedure.proowner
        where procedure.oid='${entry.signature}'::regprocedure;
      `).stdout);
      expect(observation.owner).toBe(entry.owner);
      expect(observation.security_definer).toBe(entry.security_mode === "definer");
      expect(observation.search_path).toBe(`search_path=${entry.safe_search_path.join(", ")}`);
      expect(observation.public_execute).toBe(false);
      for (const principal of ["anon", "authenticated", "service_role"]) {
        expect(observation[`${principal}_execute`]).toBe(
          entry.allowed_principals.includes(principal),
        );
      }
    }
  });

  it("allows only the exact cooked-batch and meal-wrapper internal scope paths", () => {
    const allowed = psql(`
      begin;
      select set_config('request.headers','{"x-homecook-internal-scope":"future-meal-write"}',true);
      select set_config('request.method','POST',true);
      select set_config('request.path','/rpc/write_future_meal_with_snapshot_authority',true);
      select private.verify_full_local_internal_scope();
      rollback;
    `);
    expect(allowed.status).toBe(0);
    const denied = psql(`
      begin;
      select set_config('request.headers','{"x-homecook-internal-scope":"future-meal-write"}',true);
      select set_config('request.method','POST',true);
      select set_config('request.path','/rpc/unclassified_cooked_batch_write',true);
      select private.verify_full_local_internal_scope();
      rollback;
    `, false);
    expect(denied.stderr).toContain("ACCOUNT_SESSION_STALE");
  });

  it("denies direct event-table reads and hides the other owner projection", () => {
    const result = psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      select count(*) from public.cooked_batch_quantity_events where owner_user_id='${ownerB}';
      rollback;
    `, false);
    expect(result.status).not.toBe(0);
    const projected = psql(
      `select private.project_cooked_batch('${batchB}','${ownerA}');`,
    );
    expect(projected.stdout.trim()).toBe("");
  });

  it("rejects direct protected updates and event inserts for authenticated callers", () => {
    const update = psql(`
      begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      update public.leftover_dishes set remaining_weight_g=1 where id='${batchA}';
      rollback;
    `, false);
    expect(update.status).not.toBe(0);
    const legacyProjection = psql(`
      begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      update public.leftover_dishes set status='eaten',eaten_at=now() where id='${batchA}';
      rollback;
    `, false);
    expect(legacyProjection.status).not.toBe(0);
    const insert = psql(`
      begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      insert into public.cooked_batch_quantity_events(owner_user_id,cooked_batch_id,event_type,delta_g,reason,operation_id,ordinal,payload_hash)
      values('${ownerA}','${batchA}','discarded',-1,'x',gen_random_uuid(),1,repeat('a',64));
      rollback;
    `, false);
    expect(insert.status).not.toBe(0);
    const forgedBatch = psql(`
      begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      insert into public.leftover_dishes(
        user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        finished_weight_g,remaining_weight_g,weight_status,batch_status,revision,event_checksum
      ) values(
        '${ownerA}','${recipeA}','${contentB}','leftover',now(),1,
        10,10,'known','available',1,repeat('a',64)
      );
      rollback;
    `, false);
    expect(forgedBatch.status).not.toBe(0);
  });

  it("mutates legacy leftovers through the owner-locked RPC while generation is active", () => {
    const eaten = psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      select public.mutate_legacy_leftover_status(
        '${legacyBatch}','eat','2026-08-08T01:10:00Z'
      );
      commit;
    `);
    expect(extractJson(eaten.stdout)).toMatchObject({ status: "eaten", transitioned: true });
    const uneaten = psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      select public.mutate_legacy_leftover_status(
        '${legacyBatch}','uneat','2026-08-08T01:11:00Z'
      );
      commit;
    `);
    expect(extractJson(uneaten.stdout)).toMatchObject({ status: "leftover", transitioned: true });
  });

  it("preserves explicit v2 state bounds and public projection keys", () => {
    const invalid = psql(`
      update public.leftover_dishes set remaining_weight_g=1001 where id='${batchA}';
    `, false);
    expect(invalid.status).not.toBe(0);
    const projected = psql(`select private.project_cooked_batch('${batchA}','${ownerA}')::text;`);
    const value = JSON.parse(projected.stdout.trim().split("\n").at(-1) ?? "null");
    expect(Object.keys(value)).toHaveLength(15);
    expect(value.weight_status).toBe("known");
    expect(value.status).toBe("leftover");
    expect(value.nutrition_calculation_status).toBe("unavailable");
    const legacy = JSON.parse(psql(
      `select private.project_cooked_batch('${legacyBatch}','${ownerA}')::text;`,
    ).stdout.trim().split("\n").at(-1) ?? "null");
    expect(legacy.nutrition_calculation_status).toBeNull();
  });

  it("completes one standalone snapshot atomically and replays its exact result", () => {
    const hiddenKey = "aa000000-0000-4000-8000-000000000001";
    const deniedBefore = [ownerDigest(ownerA), ownerDigest(ownerB)];
    const hiddenPantry = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}','${hiddenKey}',
        array['${pantryB}'::uuid],'set_finished_weight',700,
        '2026-08-08T01:30:00Z'
      );
    `, false);
    expect(hiddenPantry.stderr).toContain("RESOURCE_NOT_FOUND");
    expect([ownerDigest(ownerA), ownerDigest(ownerB)]).toEqual(deniedBefore);
    expect(psql(`select status from public.cooking_sessions where id='${completeSession}';`).stdout.trim()).toBe("in_progress");

    const key = "aa000000-0000-4000-8000-000000000002";
    const first = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}','${key}',
        array['${pantryA}'::uuid],'set_finished_weight',700,
        '2026-08-08T01:31:00Z'
      );
    `);
    const replayBefore = [ownerDigest(ownerA), ownerDigest(ownerB)];
    const replay = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}','${key}',
        array['${pantryA}'::uuid],'set_finished_weight',700,
        '2026-08-08T01:32:00Z'
      );
    `);
    expect([ownerDigest(ownerA), ownerDigest(ownerB)]).toEqual(replayBefore);
    const data = extractJson(first.stdout).data;
    expect(extractJson(replay.stdout)).toEqual(extractJson(first.stdout));
    expect(Object.keys(data).sort()).toEqual([
      "session_id", "contract_version", "mode", "status", "cooked_batch",
      "meals_updated", "pantry_removed", "cook_count",
    ].sort());
    expect(data).toMatchObject({
      session_id: completeSession,
      contract_version: "snapshot_v2",
      mode: "standalone",
      status: "completed",
      meals_updated: 0,
      pantry_removed: 1,
      cooked_batch: {
        finished_weight_g: 700,
        remaining_weight_g: 700,
        weight_status: "known",
        revision: 1,
      },
    });
    expect(psql(`select count(*) from public.pantry_items where id='${pantryA}';`).stdout.trim()).toBe("0");
    expect(psql(`select count(*) from public.pantry_items where id='${pantryB}';`).stdout.trim()).toBe("1");
    expect(psql(`select count(*) from public.user_progress_events where user_id='${ownerA}' and event_type='cooking_completed' and source_id='${completeSession}';`).stdout.trim()).toBe("1");

    const reused = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}','${key}',
        array[]::uuid[],'weigh_later',null,
        '2026-08-08T01:33:00Z'
      );
    `, false);
    expect(reused.stderr).toContain("IDEMPOTENCY_KEY_REUSED");
  });

  it("rolls planner completion back when its exact owner claim is missing or mismatched", () => {
    psql(`
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      delete from public.cooking_session_meal_claims where meal_id='${plannerMeal}';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
    `);
    const missingBefore = ownerDigest(ownerA);
    const missing = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${plannerSession}',
        'aa000000-0000-4000-8000-000000000010',array[]::uuid[],
        'weigh_later',null,'2026-08-08T01:35:00Z'
      );
    `, false);
    expect(missing.stderr).toContain("CONFLICT");
    expect(ownerDigest(ownerA)).toBe(missingBefore);

    psql(`
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      alter table public.cooking_session_meal_claims
        disable trigger cooking_session_meal_claim_validate;
      insert into public.cooking_session_meal_claims(meal_id,session_id,owner_user_id)
      values('${plannerMeal}','${plannerSession}','${ownerB}');
      alter table public.cooking_session_meal_claims
        enable trigger cooking_session_meal_claim_validate;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
    `);
    const mismatchedBefore = [ownerDigest(ownerA), ownerDigest(ownerB)];
    const mismatched = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${plannerSession}',
        'aa000000-0000-4000-8000-000000000011',array[]::uuid[],
        'weigh_later',null,'2026-08-08T01:36:00Z'
      );
    `, false);
    expect(mismatched.stderr).toContain("CONFLICT");
    expect([ownerDigest(ownerA), ownerDigest(ownerB)]).toEqual(mismatchedBefore);

    psql(`
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      update public.cooking_session_meal_claims
      set owner_user_id='${ownerA}' where meal_id='${plannerMeal}';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
    `);
  });

  it("completes planner meals atomically without turning them into leftover-origin meals", () => {
    const key = "aa000000-0000-4000-8000-000000000003";
    const first = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${plannerSession}','${key}',
        array[]::uuid[],'weigh_later',null,
        '2026-08-08T01:40:00Z'
      );
    `);
    const replay = serviceRpc(`
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${plannerSession}','${key}',
        array[]::uuid[],'weigh_later',null,
        '2026-08-08T01:41:00Z'
      );
    `);

    expect(extractJson(replay.stdout)).toEqual(extractJson(first.stdout));
    expect(extractJson(first.stdout).data).toMatchObject({
      session_id: plannerSession,
      mode: "planner",
      status: "completed",
      meals_updated: 1,
      pantry_removed: 0,
      cook_count: 2,
      cooked_batch: {
        weight_status: "missing",
        batch_status: "available",
        revision: 1,
      },
    });
    expect(psql(`
      select status || ':' || is_leftover::text || ':' ||
        coalesce(leftover_dish_id::text,'null') || ':' || (cooked_at is not null)::text
      from public.meals where id='${plannerMeal}';
    `).stdout.trim()).toBe("cook_done:false:null:true");
    expect(psql(`
      select is_cooked::text || ':' || (cooked_at is not null)::text
      from public.cooking_session_meals where session_id='${plannerSession}';
    `).stdout.trim()).toBe("true:true");
    expect(psql(`
      select count(*) from public.cooking_session_meal_claims
      where session_id='${plannerSession}';
    `).stdout.trim()).toBe("0");
  });

  it("keeps owner-only event mutations idempotent and rejects stale or invalid transitions", () => {
    const key = "a6000000-0000-4000-8000-000000000001";
    const first = serviceRpc(`
      select public.discard_cooked_batch(
        ${authArgs(ownerA)},'${batchA}','${key}',100,'상함',1,
        '2026-08-08T02:00:00Z'
      );
    `);
    const replay = serviceRpc(`
      select public.discard_cooked_batch(
        ${authArgs(ownerA)},'${batchA}','${key}',100,'상함',1,
        '2026-08-08T02:01:00Z'
      );
    `);
    expect(extractJson(replay.stdout)).toEqual(extractJson(first.stdout));
    expect(extractJson(first.stdout).data).toMatchObject({
      action: "discard",
      batch: { remaining_weight_g: 900, revision: 2, status: "leftover" },
    });
    expect(psql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batchA}';`).stdout.trim()).toBe("1");
    expect(psql(`
      select batch.event_checksum = encode(extensions.digest(convert_to((
        select string_agg(
          event.id::text || ':' || event.event_type || ':' ||
          coalesce(event.delta_g::text,'') || ':' || coalesce(event.reason,'') || ':' ||
          coalesce(event.reverses_event_id::text,''),
          '|' order by event.created_at,event.id
        ) from public.cooked_batch_quantity_events as event
        where event.cooked_batch_id=batch.id and event.event_type<>'reversal'
      ),'UTF8'),'sha256'),'hex')
      from public.leftover_dishes as batch where batch.id='${batchA}';
    `).stdout.trim()).toBe("t");

    const reused = serviceRpc(`
      select public.discard_cooked_batch(
        ${authArgs(ownerA)},'${batchA}','${key}',90,'상함',1,
        '2026-08-08T02:02:00Z'
      );
    `, false);
    expect(reused.stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    const invalidAdjustment = serviceRpc(`
      select public.adjust_cooked_batch(
        ${authArgs(ownerA)},'${batchA}',
        'a6000000-0000-4000-8000-000000000002',-900,'잘못된 소진',2,
        '2026-08-08T02:03:00Z'
      );
    `, false);
    expect(invalidAdjustment.stderr).toContain("BATCH_ADJUSTMENT_INVALID");
    const hidden = serviceRpc(`
      select public.mutate_cooked_batch_weight(
        ${authArgs(ownerA)},'${batchB}',
        'a6000000-0000-4000-8000-000000000003','set_finished_weight',500,1,
        '2026-08-08T02:04:00Z'
      );
    `, false);
    expect(hidden.stderr).toContain("RESOURCE_NOT_FOUND");
  });

  it("makes unrecoverable irreversible and awards consumed-unweighed XP once across reversal", () => {
    const marked = extractJson(serviceRpc(`
      select public.mutate_cooked_batch_weight(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000001','mark_unrecoverable',null,1,
        '2026-08-08T03:00:00Z'
      );
    `).stdout);
    expect(marked.data).toMatchObject({
      action: "mark_unrecoverable",
      batch: { weight_status: "unrecoverable", revision: 2 },
    });
    const restore = serviceRpc(`
      select public.mutate_cooked_batch_weight(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000002','set_finished_weight',500,2,
        '2026-08-08T03:01:00Z'
      );
    `, false);
    expect(restore.stderr).toContain("WEIGHT_UNRECOVERABLE");

    const closed = extractJson(serviceRpc(`
      select public.close_unweighed_cooked_batch(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000003','close','consumed',null,2,
        '2026-08-08T03:02:00Z'
      );
    `).stdout);
    expect(closed.data.batch).toMatchObject({
      status: "eaten",
      batch_status: "depleted",
      depleted_reason: "consumed_unweighed",
      revision: 3,
    });
    const closeEvent = closed.data.event_id as string;
    const cancelled = extractJson(serviceRpc(`
      select public.close_unweighed_cooked_batch(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000004','cancel_current',null,
        '${closeEvent}',3,'2026-08-08T03:03:00Z'
      );
    `).stdout);
    expect(cancelled.data.batch).toMatchObject({
      status: "leftover",
      batch_status: "available",
      revision: 4,
    });
    const reclosed = extractJson(serviceRpc(`
      select public.close_unweighed_cooked_batch(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000005','close','consumed',null,4,
        '2026-08-08T03:04:00Z'
      );
    `).stdout);
    expect(reclosed.data.batch?.status).toBe("eaten");
    expect(psql(`select count(*) from public.user_progress_events where user_id='${ownerB}' and event_type='leftover_eaten';`).stdout.trim()).toBe("1");
  });

  it("rejects a depleted v2 leftover in the final meal-write wrapper with zero effect", () => {
    const before = ownerDigest(ownerB);
    const result = serviceRpc(`
      select public.write_future_meal_with_snapshot_authority(
        ${authArgs(ownerB)},'create',null,'${recipeB}',current_date + 2,
        'a4000000-0000-4000-8000-000000000099',1,'${batchB}',clock_timestamp()
      );
    `, false);
    expect(result.stderr).toContain("CONFLICT");
    expect(ownerDigest(ownerB)).toBe(before);
  });

  it("cleans meal links then events before deleting an owned batch", () => {
    const wrongOwnerMarker = psql(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      select set_config('homecook.account_delete_user_id','${ownerB}',true);
      delete from public.leftover_dishes where id='${batchA}';
      rollback;
    `, false);
    expect(wrongOwnerMarker.stderr).toContain("CONFLICT");
    expect(psql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batchA}';`).stdout.trim()).not.toBe("0");
    const deleted = serviceRpc(`
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',true
      );
      select public.delete_user_private_data('${ownerB}');
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',false
      );
    `);
    expect(extractJson(deleted.stdout).deleted).toBe(true);
    expect(psql(`select count(*) from public.cooked_batch_quantity_events where cooked_batch_id='${batchB}';`).stdout.trim()).toBe("0");
    expect(psql(`select count(*) from public.leftover_dishes where id='${batchB}';`).stdout.trim()).toBe("0");
  });
});
