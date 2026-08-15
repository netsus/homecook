import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL ?? "";
const enabled = databaseUrl.length > 0;

const ownerA = "d1000000-0000-4000-8000-000000000001";
const ownerB = "d1000000-0000-4000-8000-000000000002";
const identityA = "2026-08-15T00:00:00.000Z";
const identityB = "2026-08-15T00:01:00.000Z";
const issuedA = "2026-08-15T01:00:00.000Z";
const issuedB = "2026-08-15T01:01:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const cutover = "d2000000-0000-4000-8000-000000000001";
const recipeA = "d3000000-0000-4000-8000-000000000001";
const recipeConcurrent = "d3000000-0000-4000-8000-000000000002";
const ingredient = "d4000000-0000-4000-8000-000000000001";
const plannerColumn = "d5000000-0000-4000-8000-000000000001";
const plannerMeal = "d6000000-0000-4000-8000-000000000001";
const plannerSession = "d7000000-0000-4000-8000-000000000001";
const otherSession = "d7000000-0000-4000-8000-000000000002";
const plannerKey = "d8000000-0000-4000-8000-000000000001";
const concurrentKey = "d8000000-0000-4000-8000-000000000002";

function psql(sql: string, expectSuccess = true) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  if (expectSuccess) {
    expect(result.status, result.stderr).toBe(0);
  }
  return result;
}

function psqlAsync(sql: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "psql",
      [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(jsonLine(stdout));
      else reject(new Error(stderr || `psql exited ${code}`));
    });
  });
}

function lastLine(output: string) {
  return output.trim().split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

function jsonLine(output: string) {
  const lines = output.trim().split("\n").map((line) => line.trim());
  const marked = lines.find((line) => line.includes("JSON:"));
  return marked?.slice((marked.indexOf("JSON:")) + "JSON:".length)
    ?? lines.find((line) => line.startsWith("{"))
    ?? "null";
}

function serviceSql(statement: string) {
  return `
    set request.jwt.claim.role = 'service_role';
    ${statement}
  `;
}

function authority(owner: string) {
  return owner === ownerA
    ? `'${ownerA}'::uuid,'${identityA}'::timestamptz,'${hashA}'::text,1,'${issuedA}'::timestamptz`
    : `'${ownerB}'::uuid,'${identityB}'::timestamptz,'${hashB}'::text,1,'${issuedB}'::timestamptz`;
}

function plannerCall({
  consumed = true,
  key = plannerKey,
  owner = ownerA,
  session = plannerSession,
}: {
  consumed?: boolean;
  key?: string | null;
  owner?: string;
  session?: string;
} = {}) {
  return serviceSql(`
    select 'JSON:' || public.complete_cooking_session(
      ${authority(owner)},
      '${session}'::uuid,
      ${consumed ? `array['${ingredient}'::uuid]` : "'{}'::uuid[]"},
      ${key ? `'${key}'::uuid` : "null::uuid"},
      '2026-08-15T02:00:00.000Z'::timestamptz
    )::text;
  `);
}

function standaloneCall(recipe: string, key: string | null) {
  return serviceSql(`
    select 'JSON:' || public.complete_standalone_cooking(
      ${authority(ownerA)},
      '${recipe}'::uuid,
      2,
      '{}'::uuid[],
      ${key ? `'${key}'::uuid` : "null::uuid"},
      '2026-08-15T02:10:00.000Z'::timestamptz
    )::text;
  `);
}

function ownerDigest(owner: string) {
  return lastLine(psql(`
    select encode(extensions.digest(convert_to(jsonb_build_object(
      'users', (select coalesce(jsonb_agg(jsonb_build_array(id,settings_json,updated_at) order by id),'[]'::jsonb) from public.users where id='${owner}'),
      'books', (select coalesce(jsonb_agg(jsonb_build_array(id,book_type,sort_order) order by id),'[]'::jsonb) from public.recipe_books where user_id='${owner}'),
      'columns', (select coalesce(jsonb_agg(jsonb_build_array(id,name,sort_order) order by id),'[]'::jsonb) from public.meal_plan_columns where user_id='${owner}'),
      'receipts', (select coalesce(jsonb_agg(jsonb_build_array(id,operation_scope,key_hash,payload_hash,state,durable_result) order by id),'[]'::jsonb) from public.mutation_idempotency_keys where owner_uuid='${owner}'),
      'leftovers', (select coalesce(jsonb_agg(jsonb_build_array(id,recipe_id,cooked_at) order by id),'[]'::jsonb) from public.leftover_dishes where user_id='${owner}'),
      'sessions', (select coalesce(jsonb_agg(jsonb_build_array(id,status,completed_at) order by id),'[]'::jsonb) from public.cooking_sessions where user_id='${owner}'),
      'meals', (select coalesce(jsonb_agg(jsonb_build_array(id,status,cooked_at) order by id),'[]'::jsonb) from public.meals where user_id='${owner}'),
      'progress', (select coalesce(jsonb_agg(jsonb_build_array(event_type,source_key,xp_delta,occurred_at) order by id),'[]'::jsonb) from public.user_progress_events where user_id='${owner}'),
      'summary', (select coalesce(jsonb_agg(jsonb_build_array(total_xp,current_level,event_counts,last_updated_at) order by user_id),'[]'::jsonb) from public.user_progress_summary where user_id='${owner}')
    )::text,'UTF8'),'sha256'),'hex');
  `).stdout);
}

describe.runIf(enabled)("legacy product compatibility PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      update private.full_local_auth_control
      set authority='local',local_issuer='https://auth.mumeok.kr/auth/v1',
          cutover_epoch=2,hmac_key_version=1,flows_open=true,
          local_activated_at='2026-08-14T00:00:00Z',updated_at=clock_timestamp()
      where singleton;
      insert into public.account_generation_cutover_attempts(
        id,state,capability_revision,result_json
      ) values('${cutover}','promoted',2,'{}'::jsonb);
      update public.account_generation_capability_state
      set state='generation_active',revision=revision+1,
          current_cutover_attempt_id='${cutover}',activated_at='2026-08-14T00:00:00Z'
      where singleton;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);

      insert into auth.users(id,created_at,email,raw_app_meta_data,raw_user_meta_data) values
        ('${ownerA}','${identityA}','legacy-a@example.invalid','{"provider":"google"}','{"sub":"legacy-a"}'),
        ('${ownerB}','${identityB}','legacy-b@example.invalid','{"provider":"google"}','{"sub":"legacy-b"}');
      insert into public.users(id,nickname,email,social_provider,social_id,settings_json) values
        ('${ownerA}','legacy-a','legacy-a@example.invalid','google','legacy-a','{}'),
        ('${ownerB}','legacy-b','legacy-b@example.invalid','google','legacy-b','{}');
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation)
      values('${ownerA}',1),('${ownerB}',1);
      insert into public.user_account_lifecycles(
        owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
      ) values
        ('${ownerA}',1,'${identityA}','runtime','active','2026-08-15T00:30:00Z'),
        ('${ownerB}',1,'${identityB}','runtime','active','2026-08-15T00:31:00Z');
      insert into public.user_session_generation_bindings(
        session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,
        local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at
      ) values
        ('${hashA}',1,'${ownerA}',1,'${identityA}','active','local','https://auth.mumeok.kr/auth/v1','${issuedA}',2,'${issuedA}','2099-01-01T00:00:00Z'),
        ('${hashB}',1,'${ownerB}',1,'${identityB}','active','local','https://auth.mumeok.kr/auth/v1','${issuedB}',2,'${issuedB}','2099-01-01T00:00:00Z');

      insert into public.ingredients(id,standard_name,category,default_unit)
      values('${ingredient}','호환 재료','other','g');
      insert into public.recipes(id,title,base_servings,source_type,created_by)
      values
        ('${recipeA}','호환 플래너 레시피',2,'manual','${ownerA}'),
        ('${recipeConcurrent}','호환 독립 레시피',2,'manual','${ownerA}');
      insert into public.recipe_ingredients(
        recipe_id,ingredient_id,amount,unit,ingredient_type,sort_order,scalable
      ) values('${recipeA}','${ingredient}',100,'g','QUANT',0,true);
      insert into public.meal_plan_columns(id,user_id,name,sort_order)
      values('${plannerColumn}','${ownerA}','기존 열',10);
      insert into public.meals(
        id,user_id,recipe_id,plan_date,column_id,planned_servings,status
      ) values('${plannerMeal}','${ownerA}','${recipeA}','2026-08-16','${plannerColumn}',2,'shopping_done');
      insert into public.cooking_sessions(id,user_id,status,contract_version)
      values
        ('${plannerSession}','${ownerA}','in_progress','legacy_v1'),
        ('${otherSession}','${ownerB}','in_progress','legacy_v1');
      insert into public.cooking_session_meals(
        session_id,meal_id,recipe_id,cooking_servings
      ) values('${plannerSession}','${plannerMeal}','${recipeA}',2);
      insert into public.pantry_items(user_id,ingredient_id)
      values('${ownerA}','${ingredient}');
      select public.set_account_generation_internal_writer_marker('${cutover}',false);
    `);
  });

  it("exposes only the two new exact service-role signatures", () => {
    for (const signature of [
      "public.complete_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid[],uuid,timestamp with time zone)",
      "public.complete_standalone_cooking(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,integer,uuid[],uuid,timestamp with time zone)",
    ]) {
      const row = JSON.parse(lastLine(psql(`
        select jsonb_build_object(
          'owner', owner.rolname,
          'definer', procedure.prosecdef,
          'public', pg_catalog.has_function_privilege('public',procedure.oid,'execute'),
          'anon', pg_catalog.has_function_privilege('anon',procedure.oid,'execute'),
          'authenticated', pg_catalog.has_function_privilege('authenticated',procedure.oid,'execute'),
          'service_role', pg_catalog.has_function_privilege('service_role',procedure.oid,'execute')
        )
        from pg_catalog.pg_proc as procedure
        join pg_catalog.pg_roles as owner on owner.oid=procedure.proowner
        where procedure.oid='${signature}'::regprocedure;
      `).stdout));
      expect(row).toEqual({
        owner: "postgres",
        definer: true,
        public: false,
        anon: false,
        authenticated: false,
        service_role: true,
      });
    }
  });

  it("atomically completes planner cooking and replays without any additional mutation", () => {
    const first = JSON.parse(jsonLine(psql(plannerCall()).stdout));
    expect(first).toMatchObject({
      session_id: plannerSession,
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: plannerSession,
      pantry_removed: 1,
    });
    const afterFirst = ownerDigest(ownerA);

    const replay = JSON.parse(jsonLine(psql(plannerCall()).stdout));
    expect(replay).toEqual(first);
    expect(ownerDigest(ownerA)).toBe(afterFirst);

    const mismatch = psql(plannerCall({ consumed: false }), false);
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(ownerDigest(ownerA)).toBe(afterFirst);
  });

  it("rejects another owner's legacy session before bootstrap, receipt, completion, or progress writes", () => {
    const beforeA = ownerDigest(ownerA);
    const beforeB = ownerDigest(ownerB);

    const result = psql(plannerCall({ session: otherSession }), false);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FORBIDDEN");
    expect(ownerDigest(ownerA)).toBe(beforeA);
    expect(ownerDigest(ownerB)).toBe(beforeB);
  });

  it("keeps no-key standalone compatibility and serializes concurrent same-key completion", async () => {
    const noKey = JSON.parse(jsonLine(psql(standaloneCall(recipeA, null)).stdout));
    expect(noKey).toMatchObject({ pantry_removed: 0 });

    const [left, right] = await Promise.all([
      psqlAsync(standaloneCall(recipeConcurrent, concurrentKey)),
      psqlAsync(standaloneCall(recipeConcurrent, concurrentKey)),
    ]);
    expect(JSON.parse(left)).toEqual(JSON.parse(right));
    const counts = lastLine(psql(`
      select concat_ws(':',
        (select count(*) from public.leftover_dishes where user_id='${ownerA}' and recipe_id='${recipeConcurrent}'),
        (select count(*) from public.mutation_idempotency_keys where owner_uuid='${ownerA}' and operation_scope='legacy_standalone_complete'),
        (select count(*) from public.user_progress_events where user_id='${ownerA}' and event_type='cooking_completed' and source_key like 'cooking_completed:%')
      );
    `).stdout);
    expect(counts.split(":").slice(0, 2)).toEqual(["1", "1"]);
  });
});
