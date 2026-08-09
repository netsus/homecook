import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ?? "";
const port = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ?? "";
const database = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ?? "";

const ownerA = "a1000000-0000-4000-8000-000000000001";
const ownerB = "a1000000-0000-4000-8000-000000000002";
const ownerRefresh = "a1000000-0000-4000-8000-000000000003";
const ownerGeneration = "a1000000-0000-4000-8000-000000000004";
const recipeA = "a2000000-0000-4000-8000-000000000001";
const recipeB = "a2000000-0000-4000-8000-000000000002";
const recipeRefresh = "a2000000-0000-4000-8000-000000000003";
const recipeGeneration = "a2000000-0000-4000-8000-000000000004";
const contentA = "a3000000-0000-4000-8000-000000000001";
const contentB = "a3000000-0000-4000-8000-000000000002";
const batchA = "a4000000-0000-4000-8000-000000000001";
const batchB = "a4000000-0000-4000-8000-000000000002";
const legacyBatch = "a4000000-0000-4000-8000-000000000009";
const legacyAtomicBatch = "a4000000-0000-4000-8000-000000000010";
const legacyRefreshBatch = "a4000000-0000-4000-8000-000000000011";
const legacyGenerationBatch = "a4000000-0000-4000-8000-000000000012";
const completeSession = "a4000000-0000-4000-8000-000000000003";
const plannerSession = "a4000000-0000-4000-8000-000000000004";
const plannerMeal = "a4000000-0000-4000-8000-000000000005";
const plannerColumn = "a4000000-0000-4000-8000-000000000006";
const ingredient = "a8000000-0000-4000-8000-000000000001";
const pantryA = "a9000000-0000-4000-8000-000000000001";
const pantryB = "a9000000-0000-4000-8000-000000000002";
const identityA = "2026-08-08T00:00:00.000Z";
const identityB = "2026-08-08T00:01:00.000Z";
const identityRefresh = "2026-08-08T00:02:00.000Z";
const identityGeneration = "2026-08-08T00:03:00.000Z";
const issuedA = "2026-08-08T01:00:00.000Z";
const issuedB = "2026-08-08T01:01:00.000Z";
const issuedGeneration = "2026-08-08T01:03:00.000Z";
const sessionHashA = "a".repeat(64);
const sessionHashB = "b".repeat(64);
const sessionHashRefresh = "c".repeat(64);
const sessionHashGeneration = "d".repeat(64);
const sessionIdRefresh = "c1000000-0000-4000-8000-000000000001";
const differentSessionId = "c1000000-0000-4000-8000-000000000002";
const cutoverAttempt = "a5000000-0000-4000-8000-000000000001";
const localIssuer = "https://auth.mumeok.kr/auth/v1";
const refreshT0Sql = `(select session_issued_at from public.user_session_generation_bindings where session_key_hash='${sessionHashRefresh}')`;
const refreshT1Sql = `(${refreshT0Sql} + interval '10 minutes')`;
const refreshT2Sql = `(${refreshT0Sql} + interval '15 minutes')`;

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

function psqlAsync(sql: string) {
  return new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn("psql", [
      "-h", host, "-p", port, "-U", "postgres", "-d", database,
      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { env: { ...process.env, PGPASSWORD: "" } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `psql exited ${code}`));
    });
  });
}

interface PgPlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  "Actual Rows"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Index Cond"?: string;
  "Recheck Cond"?: string;
  Filter?: string;
  Output?: string[];
  "Sort Key"?: string[];
  Plans?: PgPlanNode[];
}

interface PgExplainDocument {
  Plan: PgPlanNode;
  "Execution Time": number;
}

function extractMarkedJson<T>(stdout: string, marker: string): T {
  const lines = stdout.trim().split("\n").map((line) => line.trim());
  const start = lines.indexOf(`__${marker}_START__`);
  const end = lines.indexOf(`__${marker}_END__`);

  expect(start, `${marker} start marker`).toBeGreaterThanOrEqual(0);
  expect(end, `${marker} end marker`).toBeGreaterThan(start);

  return JSON.parse(lines.slice(start + 1, end).join("\n")) as T;
}

function collectPlanNodes(root: PgPlanNode): PgPlanNode[] {
  return [root, ...(root.Plans ?? []).flatMap(collectPlanNodes)];
}

function planConditions(nodes: PgPlanNode[]) {
  return nodes.flatMap((node) => [node["Index Cond"], node["Recheck Cond"], node.Filter])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function rootSharedBlocks(document: PgExplainDocument) {
  return (document.Plan["Shared Hit Blocks"] ?? 0)
    + (document.Plan["Shared Read Blocks"] ?? 0);
}

function expectSelectiveIndexPlan(
  document: PgExplainDocument,
  indexName: string,
  conditionFragments: string[],
) {
  const nodes = collectPlanNodes(document.Plan);
  const indexNode = nodes.find((node) => node["Index Name"] === indexName);

  expect(indexNode, `${indexName} plan node`).toBeDefined();
  expect(["Index Scan", "Index Only Scan", "Bitmap Index Scan"]).toContain(
    indexNode?.["Node Type"],
  );
  expect(indexNode?.["Actual Rows"] ?? 0).toBeGreaterThan(0);
  const conditions = planConditions(nodes);
  for (const fragment of conditionFragments) {
    expect(conditions).toContain(fragment);
  }
  expect(rootSharedBlocks(document)).toBeLessThanOrEqual(320);
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
      'bindings', (select coalesce(jsonb_agg(jsonb_build_array(session_key_hash,expected_account_generation,binding_state,revoked_at,session_issued_at,last_token_issued_at,session_identity_hash) order by session_key_hash),'[]'::jsonb) from public.user_session_generation_bindings where owner_uuid='${owner}'),
      'progress', (select coalesce(jsonb_agg(jsonb_build_array(event_type,source_key,xp_delta,source_meta_json) order by id),'[]'::jsonb) from public.user_progress_events where user_id='${owner}'),
      'progress_summary', (select coalesce(jsonb_agg(jsonb_build_array(total_xp,current_level,level_curve_version,event_counts,last_event_at,last_updated_at) order by user_id),'[]'::jsonb) from public.user_progress_summary where user_id='${owner}'),
      'growth_activity', (select coalesce(jsonb_agg(jsonb_build_array(activity_type,category,source_key,source_meta_json) order by id),'[]'::jsonb) from public.user_growth_activity_events where user_id='${owner}')
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
        ('${ownerB}','${identityB}','batch-b@example.invalid'),
        ('${ownerRefresh}','${identityRefresh}','batch-refresh@example.invalid'),
        ('${ownerGeneration}','${identityGeneration}','batch-generation@example.invalid');
      create table if not exists auth.sessions(
        id uuid primary key,
        user_id uuid not null references auth.users(id) on delete cascade
      );
      insert into auth.sessions(id,user_id) values
        ('${sessionIdRefresh}','${ownerRefresh}'),
        ('${differentSessionId}','${ownerRefresh}')
      on conflict(id) do nothing;
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
        ('${ownerA}','owner-a','test','owner-a'),('${ownerB}','owner-b','test','owner-b'),
        ('${ownerRefresh}','owner-refresh','test','owner-refresh'),
        ('${ownerGeneration}','owner-generation','test','owner-generation')
      on conflict(id) do nothing;
      insert into public.meal_plan_columns(id,user_id)
      values('a4000000-0000-4000-8000-000000000099','${ownerB}')
      on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation)
      values('${ownerA}',1),('${ownerB}',1),('${ownerRefresh}',1),('${ownerGeneration}',2);
      insert into public.user_account_lifecycles(
        owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
      ) values
        ('${ownerA}',1,'${identityA}','runtime','active',now()),
        ('${ownerB}',1,'${identityB}','runtime','active',now()),
        ('${ownerRefresh}',1,'${identityRefresh}','runtime','active',now()),
        ('${ownerGeneration}',1,'${identityGeneration}','runtime','quarantined',now()),
        ('${ownerGeneration}',2,'${identityGeneration}','runtime','active',now());
      insert into public.user_session_generation_bindings(
        session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,
        local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at
      ) values
        ('${sessionHashA}',1,'${ownerA}',1,'${identityA}','active','local','${localIssuer}','${issuedA}',2,'${issuedA}','2099-01-01T00:00:00Z'),
        ('${sessionHashB}',1,'${ownerB}',1,'${identityB}','active','local','${localIssuer}','${issuedB}',2,'${issuedB}','2099-01-01T00:00:00Z'),
        ('${sessionHashRefresh}',1,'${ownerRefresh}',1,'${identityRefresh}','active','local','${localIssuer}',clock_timestamp()-interval '19 minutes',2,clock_timestamp()-interval '20 minutes',clock_timestamp()+interval '20 minutes'),
        ('${sessionHashGeneration}',1,'${ownerGeneration}',1,'${identityGeneration}','active','local','${localIssuer}','${issuedGeneration}',2,'${issuedGeneration}','2099-01-01T00:00:00Z');
      insert into public.ingredients(id,name) values('${ingredient}','공통 재료');
      insert into public.recipes(id,title,base_servings,created_by,visibility,revision,updated_at) values
        ('${recipeA}','owner A soup',2,'${ownerA}','private',1,now()),
        ('${recipeB}','owner B soup',2,'${ownerB}','private',1,now()),
        ('${recipeRefresh}','refresh soup',2,'${ownerRefresh}','private',1,now()),
        ('${recipeGeneration}','generation soup',2,'${ownerGeneration}','private',1,now())
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
        ('${legacyBatch}','${ownerA}','${recipeA}',null,'leftover',now(),2,null,null,null,null,null,null,null),
        ('${legacyAtomicBatch}','${ownerA}','${recipeA}',null,'leftover',now(),2,null,null,null,null,null,null,null),
        ('${legacyRefreshBatch}','${ownerRefresh}','${recipeRefresh}',null,'leftover',now(),2,null,null,null,null,null,null,null),
        ('${legacyGenerationBatch}','${ownerGeneration}','${recipeGeneration}',null,'leftover',now(),2,null,null,null,null,null,null,null)
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

  it("resolves batch nutrition from the content-pinned snapshot with exact serving and fixed semantics", () => {
    const result = psql(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      insert into public.recipe_nutrition_snapshots (
        id,owner_user_id,recipe_id,base_servings,input_hash,calculation_version,
        scalable_values_json,fixed_values_json,nutrient_status_json,
        calculation_status,calculation_quality,reflected_ingredient_count,
        target_ingredient_count,missing_reasons,warnings_json,sources_json,
        is_current,calculated_at
      ) values
        (
          'a3100000-0000-4000-8000-000000000001','${ownerA}','${recipeA}',2,
          repeat('1',64),'batch-nutrition-v1',
          '{"energy_kcal":200,"carbohydrate_g":20,"protein_g":11,"fat_g":6,"sodium_mg":400}',
          '{"energy_kcal":20,"carbohydrate_g":2,"protein_g":2,"fat_g":1,"sodium_mg":100}',
          '{
            "energy_kcal":{"amount":220,"known_amount":null,"status":"complete","display_mode":"total"},
            "carbohydrate_g":{"amount":22,"known_amount":null,"status":"complete","display_mode":"total"},
            "protein_g":{"amount":13,"known_amount":null,"status":"complete","display_mode":"total"},
            "fat_g":{"amount":7,"known_amount":null,"status":"complete","display_mode":"total"},
            "sodium_mg":{"amount":500,"known_amount":null,"status":"complete","display_mode":"total"}
          }',
          'complete','direct',5,5,'{}','["OLD_WARNING"]',
          '[{"provider":"fixture","dataset":"nutrition","source_version":"old-v1","data_basis_date":null,"license":"test","source_url":"https://example.invalid/old"}]',
          false,'2026-08-01T00:00:00Z'
        ),
        (
          'a3100000-0000-4000-8000-000000000002','${ownerA}','${recipeA}',2,
          repeat('2',64),'batch-nutrition-v1',
          '{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":100,"fat_g":100,"sodium_mg":1000}',
          '{"energy_kcal":20,"carbohydrate_g":2,"protein_g":2,"fat_g":1,"sodium_mg":100}',
          '{
            "energy_kcal":{"amount":1020,"known_amount":null,"status":"complete","display_mode":"total"},
            "carbohydrate_g":{"amount":102,"known_amount":null,"status":"complete","display_mode":"total"},
            "protein_g":{"amount":102,"known_amount":null,"status":"complete","display_mode":"total"},
            "fat_g":{"amount":101,"known_amount":null,"status":"complete","display_mode":"total"},
            "sodium_mg":{"amount":1100,"known_amount":null,"status":"complete","display_mode":"total"}
          }',
          'complete','direct',5,5,'{}','["LATEST_WARNING"]',
          '[{"provider":"fixture","dataset":"nutrition","source_version":"latest-v2","data_basis_date":null,"license":"test","source_url":"https://example.invalid/latest"}]',
          true,'2026-08-02T00:00:00Z'
        ),
        (
          'a3100000-0000-4000-8000-000000000003','${ownerA}','${recipeA}',2,
          repeat('3',64),'batch-nutrition-v1',
          '{"energy_kcal":100,"carbohydrate_g":20,"fat_g":6,"sodium_mg":400}',
          '{"energy_kcal":10,"carbohydrate_g":2,"fat_g":1,"sodium_mg":100}',
          '{
            "energy_kcal":{"amount":null,"known_amount":110,"status":"partial","display_mode":"minimum"},
            "carbohydrate_g":{"amount":22,"known_amount":null,"status":"complete","display_mode":"total"},
            "protein_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
            "fat_g":{"amount":null,"known_amount":7,"status":"partial","display_mode":"minimum"},
            "sodium_mg":{"amount":500,"known_amount":null,"status":"complete","display_mode":"total"}
          }',
          'partial','mixed',4,5,'{"PROTEIN_MISSING"}',
          '["UNIT_CONVERSION_MISSING"]',
          '[{"provider":"fixture","dataset":"nutrition","source_version":"partial-v1","data_basis_date":"2026-07-01","license":"test","source_url":"https://example.invalid/partial"}]',
          false,'2026-08-03T00:00:00Z'
        ),
        (
          'a3100000-0000-4000-8000-000000000004','${ownerA}','${recipeA}',2,
          repeat('4',64),'batch-nutrition-v1','{}','{}',
          '{
            "energy_kcal":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
            "carbohydrate_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
            "protein_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
            "fat_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
            "sodium_mg":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null}
          }',
          'unavailable',null,0,5,'{"ALL_INPUTS_MISSING"}',
          '["RECIPE_NUTRITION_UNAVAILABLE"]','[]',false,'2026-08-04T00:00:00Z'
        );
      insert into public.recipe_content_snapshots (
        id,owner_user_id,recipe_id,recipe_nutrition_snapshot_id,title,
        base_servings,ingredients_json,steps_json,content_hash,schema_version
      ) values
        ('a3200000-0000-4000-8000-000000000001','${ownerA}','${recipeA}',
          'a3100000-0000-4000-8000-000000000001','old pinned',2,'[]','[]',repeat('5',64),1),
        ('a3200000-0000-4000-8000-000000000002','${ownerA}','${recipeA}',
          'a3100000-0000-4000-8000-000000000003','partial pinned',2,'[]','[]',repeat('6',64),1),
        ('a3200000-0000-4000-8000-000000000003','${ownerA}','${recipeA}',
          'a3100000-0000-4000-8000-000000000004','unavailable pinned',2,'[]','[]',repeat('7',64),1),
        ('a3200000-0000-4000-8000-000000000004','${ownerA}','${recipeA}',
          null,'missing nutrition pin',2,'[]','[]',repeat('8',64),1);
      insert into public.leftover_dishes (
        id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        finished_weight_g,remaining_weight_g,weight_status,batch_status,depleted_reason,
        revision,event_checksum
      ) values
        ('a4100000-0000-4000-8000-000000000001','${ownerA}','${recipeA}',
          'a3200000-0000-4000-8000-000000000001','leftover',now(),3,1000,1000,
          'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('a4100000-0000-4000-8000-000000000002','${ownerA}','${recipeA}',
          'a3200000-0000-4000-8000-000000000002','leftover',now(),4,1000,1000,
          'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('a4100000-0000-4000-8000-000000000003','${ownerA}','${recipeA}',
          'a3200000-0000-4000-8000-000000000003','leftover',now(),2,1000,1000,
          'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')),
        ('a4100000-0000-4000-8000-000000000004','${ownerA}','${recipeA}',
          'a3200000-0000-4000-8000-000000000004','leftover',now(),2,1000,1000,
          'known','available',null,1,encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex'));
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
      select jsonb_build_object(
        'old',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000001','${ownerA}'
        ),
        'old_replay_equal',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000001','${ownerA}'
        ) = private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000001','${ownerA}'
        ),
        'partial',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000002','${ownerA}'
        ),
        'unavailable',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000003','${ownerA}'
        ),
        'missing',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000004','${ownerA}'
        ),
        'legacy',private.resolve_cooked_batch_nutrition('${legacyBatch}','${ownerA}'),
        'other_owner',private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-000000000001','${ownerB}'
        )
      );
      rollback;
    `);
    const payload = extractJson(result.stdout) as TestRpcEnvelope & {
      legacy: unknown;
      missing: Record<string, unknown>;
      old: Record<string, unknown>;
      old_replay_equal: boolean;
      other_owner: unknown;
      partial: Record<string, unknown>;
      unavailable: Record<string, unknown>;
    };

    expect(payload.old_replay_equal).toBe(true);
    expect(payload.old).toMatchObject({
      recipe_content_snapshot_id: "a3200000-0000-4000-8000-000000000001",
      recipe_nutrition_snapshot_id: "a3100000-0000-4000-8000-000000000001",
      basis: { amount: 3, unit: "serving" },
      base_servings: 2,
      calculation_status: "complete",
      calculation_quality: "direct",
      warnings: ["OLD_WARNING"],
      sources: [{ source_version: "old-v1" }],
      values: {
        energy_kcal: { amount: 320, known_amount: null, status: "complete", display_mode: "total" },
        carbohydrate_g: { amount: 32, known_amount: null, status: "complete", display_mode: "total" },
        protein_g: { amount: 18.5, known_amount: null, status: "complete", display_mode: "total" },
        fat_g: { amount: 10, known_amount: null, status: "complete", display_mode: "total" },
        sodium_mg: { amount: 700, known_amount: null, status: "complete", display_mode: "total" },
      },
    });
    expect(payload.partial).toMatchObject({
      calculation_status: "partial",
      calculation_quality: "mixed",
      missing_reasons: ["PROTEIN_MISSING"],
      warnings: ["UNIT_CONVERSION_MISSING"],
      sources: [{ source_version: "partial-v1", data_basis_date: "2026-07-01" }],
      values: {
        energy_kcal: { amount: null, known_amount: 210, status: "partial", display_mode: "minimum" },
        carbohydrate_g: { amount: 42, known_amount: null, status: "complete", display_mode: "total" },
        protein_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
        fat_g: { amount: null, known_amount: 13, status: "partial", display_mode: "minimum" },
        sodium_mg: { amount: 900, known_amount: null, status: "complete", display_mode: "total" },
      },
    });
    expect(payload.unavailable).toMatchObject({
      calculation_status: "unavailable",
      calculation_quality: null,
      missing_reasons: ["ALL_INPUTS_MISSING"],
      warnings: ["RECIPE_NUTRITION_UNAVAILABLE"],
      sources: [],
      values: {
        energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      },
    });
    expect(payload.missing).toMatchObject({
      recipe_nutrition_snapshot_id: null,
      base_servings: null,
      calculation_status: "unavailable",
      calculation_quality: null,
      missing_reasons: [],
      warnings: [],
      sources: [],
    });
    expect(payload.legacy).toBeNull();
    expect(payload.other_owner).toBeNull();
  });

  it("fails closed for invalid or missing pinned base servings", () => {
    for (const [baseMutation, baseValue, suffix] of [
      ["drop constraint recipe_nutrition_snapshots_base_servings_check", "0", "5"],
      ["alter column base_servings drop not null", "null", "6"],
    ] as const) {
      const invalid = psql(`
        begin;
        alter table public.recipe_nutrition_snapshots ${baseMutation};
        select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        insert into public.recipe_nutrition_snapshots (
          id,owner_user_id,recipe_id,base_servings,input_hash,calculation_version,
          scalable_values_json,fixed_values_json,nutrient_status_json,
          calculation_status,calculation_quality,reflected_ingredient_count,
          target_ingredient_count,is_current,calculated_at
        ) values (
          'a3100000-0000-4000-8000-00000000000${suffix}','${ownerA}','${recipeA}',
          ${baseValue},repeat('${suffix}',64),'batch-nutrition-v1',
          '{"energy_kcal":100}','{}',
          '{"energy_kcal":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"}}',
          'complete','direct',1,1,false,now()
        );
        insert into public.recipe_content_snapshots (
          id,owner_user_id,recipe_id,recipe_nutrition_snapshot_id,title,
          base_servings,ingredients_json,steps_json,content_hash,schema_version
        ) values (
          'a3200000-0000-4000-8000-00000000000${suffix}','${ownerA}','${recipeA}',
          'a3100000-0000-4000-8000-00000000000${suffix}','invalid base',2,
          '[]','[]',repeat('${suffix}',64),1
        );
        insert into public.leftover_dishes (
          id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
          finished_weight_g,remaining_weight_g,weight_status,batch_status,revision,event_checksum
        ) values (
          'a4100000-0000-4000-8000-00000000000${suffix}','${ownerA}','${recipeA}',
          'a3200000-0000-4000-8000-00000000000${suffix}','leftover',now(),2,
          100,100,'known','available',1,
          encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex')
        );
        select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        select private.resolve_cooked_batch_nutrition(
          'a4100000-0000-4000-8000-00000000000${suffix}','${ownerA}'
        );
        rollback;
      `, false);
      expect(invalid.stderr).toContain("CONFLICT");
    }
  });

  it("keeps the batch nutrition resolver private and owner-bound", () => {
    const observation = extractJson(psql(`
      select jsonb_build_object(
        'owner',owner.rolname,
        'security_definer',procedure.prosecdef,
        'search_path',(select config from unnest(procedure.proconfig) as config
          where config like 'search_path=%'),
        'public_execute',pg_catalog.has_function_privilege(
          'public','private.resolve_cooked_batch_nutrition(uuid,uuid)','EXECUTE'
        ),
        'anon_execute',pg_catalog.has_function_privilege(
          'anon','private.resolve_cooked_batch_nutrition(uuid,uuid)','EXECUTE'
        ),
        'authenticated_execute',pg_catalog.has_function_privilege(
          'authenticated','private.resolve_cooked_batch_nutrition(uuid,uuid)','EXECUTE'
        ),
        'service_role_execute',pg_catalog.has_function_privilege(
          'service_role','private.resolve_cooked_batch_nutrition(uuid,uuid)','EXECUTE'
        )
      )
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_roles as owner on owner.oid=procedure.proowner
      where procedure.oid='private.resolve_cooked_batch_nutrition(uuid,uuid)'::regprocedure;
    `).stdout);
    expect(observation).toEqual({
      owner: "postgres",
      security_definer: true,
      search_path: "search_path=pg_catalog, public, private, pg_temp",
      public_execute: false,
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: false,
    });
    const denied = psql(`
      begin;
      set local role service_role;
      select private.resolve_cooked_batch_nutrition('${batchA}','${ownerA}');
      rollback;
    `, false);
    expect(denied.status).not.toBe(0);
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

  it("keeps event_checksum private while preserving safe owner columns", () => {
    const hiddenChecksum = psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      select event_checksum from public.leftover_dishes where id='${batchA}';
      rollback;
    `, false);
    expect(hiddenChecksum.stderr).toContain("permission denied");

    const safeProjection = psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${ownerA}',true);
      select id,status,revision from public.leftover_dishes where id='${batchA}';
      rollback;
    `);
    expect(safeProjection.stdout).toContain(batchA);
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

  it("mutates legacy leftovers only through a verified current-generation session", () => {
    const eaten = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','eat','2026-08-08T01:10:00Z'
      );
    `);
    expect(extractJson(eaten.stdout)).toMatchObject({ status: "eaten", transitioned: true });
    const duplicateBefore = ownerDigest(ownerA);
    const duplicate = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','eat','2026-08-08T01:10:30Z'
      );
    `);
    expect(extractJson(duplicate.stdout)).toMatchObject({ status: "eaten", transitioned: false });
    expect(ownerDigest(ownerA)).toBe(duplicateBefore);
    expect(extractJson(psql(`
      select jsonb_build_object(
        'progress_meta',(select source_meta_json from public.user_progress_events
          where user_id='${ownerA}' and event_type='leftover_eaten' and source_id='${legacyBatch}'),
        'summary',(select jsonb_build_object('total_xp',total_xp,'event_counts',event_counts,'level_curve_version',level_curve_version)
          from public.user_progress_summary where user_id='${ownerA}'),
        'activity',(select jsonb_build_object('category',category,'source_meta_json',source_meta_json)
          from public.user_growth_activity_events where user_id='${ownerA}' and activity_type='leftover_eaten' and source_id='${legacyBatch}')
      );
    `).stdout)).toMatchObject({
      progress_meta: { xp_kind: "first", level_curve_version: "v2" },
      summary: { total_xp: 15, level_curve_version: "v2", event_counts: { leftover_eaten: 1 } },
      activity: { category: "leftovers", source_meta_json: {} },
    });
    const uneaten = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','uneat','2026-08-08T01:11:00Z'
      );
    `);
    expect(extractJson(uneaten.stdout)).toMatchObject({ status: "leftover", transitioned: true });
  });

  it("accepts a newer JWT for the same active stable session and rejects the prior token", () => {
    const renewed = serviceRpc(`
      select public.assert_and_renew_full_local_session_authority_v2(
        '${localIssuer}','${ownerRefresh}','${identityRefresh}',
        '${sessionIdRefresh}','${sessionHashRefresh}',1,2,
        ${refreshT1Sql},${refreshT1Sql},${refreshT1Sql}+interval '1 minute',
        ${refreshT1Sql}+interval '1 hour',${refreshT1Sql}+interval '45 minutes'
      );
    `);
    expect(extractJson(renewed.stdout)).toMatchObject({ binding_state: "active" });

    const refreshed = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        '${ownerRefresh}','${identityRefresh}','${sessionHashRefresh}',1,
        ${refreshT1Sql},'${legacyRefreshBatch}','keep','2026-08-08T01:23:00Z'
      );
    `);
    expect(extractJson(refreshed.stdout)).toMatchObject({ status: "leftover", transitioned: true });

    const afterRefresh = ownerDigest(ownerRefresh);
    const stale = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        '${ownerRefresh}','${identityRefresh}','${sessionHashRefresh}',1,
        ${refreshT0Sql},'${legacyRefreshBatch}','keep','2026-08-08T01:24:00Z'
      );
    `, false);
    expect(stale.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(ownerDigest(ownerRefresh)).toBe(afterRefresh);
  });

  it("keeps old, different-session, and revoked authority zero-write", () => {
    const recorded = serviceRpc(`
      select public.assert_and_renew_full_local_session_authority_v2(
        '${localIssuer}','${ownerRefresh}','${identityRefresh}',
        '${sessionIdRefresh}','${sessionHashRefresh}',1,2,
        ${refreshT2Sql},${refreshT2Sql},${refreshT2Sql}+interval '1 minute',
        ${refreshT2Sql}+interval '1 hour',${refreshT2Sql}+interval '50 minutes'
      );
    `);
    expect(extractJson(recorded.stdout)).toMatchObject({ binding_state: "active" });
    expect(psql(`
      select session_issued_at=${refreshT0Sql}
        and last_token_issued_at=${refreshT2Sql}
      from public.user_session_generation_bindings
      where session_key_hash='${sessionHashRefresh}';
    `).stdout.trim()).toBe("t");

    const before = ownerDigest(ownerRefresh);
    const older = serviceRpc(`
      select public.assert_and_renew_full_local_session_authority_v2(
        '${localIssuer}','${ownerRefresh}','${identityRefresh}',
        '${sessionIdRefresh}','${sessionHashRefresh}',1,2,
        ${refreshT1Sql},${refreshT1Sql},${refreshT1Sql}+interval '1 minute',
        ${refreshT1Sql}+interval '1 hour',${refreshT1Sql}+interval '45 minutes'
      );
    `, false);
    expect(older.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(ownerDigest(ownerRefresh)).toBe(before);

    const differentSession = serviceRpc(`
      select public.assert_and_renew_full_local_session_authority_v2(
        '${localIssuer}','${ownerRefresh}','${identityRefresh}',
        '${differentSessionId}','${sessionHashRefresh}',1,2,
        ${refreshT2Sql},${refreshT2Sql},${refreshT2Sql}+interval '1 minute',
        ${refreshT2Sql}+interval '1 hour',${refreshT2Sql}+interval '50 minutes'
      );
    `, false);
    expect(differentSession.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(ownerDigest(ownerRefresh)).toBe(before);

    psql(`
      update public.user_session_generation_bindings
      set binding_state='revoked', revoked_at=clock_timestamp()
      where session_key_hash='${sessionHashRefresh}';
    `);
    const revokedBefore = ownerDigest(ownerRefresh);
    const revoked = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        '${ownerRefresh}','${identityRefresh}','${sessionHashRefresh}',1,
        ${refreshT2Sql},'${legacyRefreshBatch}','keep','2026-08-08T01:34:00Z'
      );
    `, false);
    expect(revoked.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(ownerDigest(ownerRefresh)).toBe(revokedBefore);
  });

  it("keeps a binding from a different account generation zero-write", () => {
    const before = ownerDigest(ownerGeneration);
    const staleGeneration = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        '${ownerGeneration}','${identityGeneration}','${sessionHashGeneration}',1,
        '${issuedGeneration}','${legacyGenerationBatch}','keep','2026-08-08T01:33:00Z'
      );
    `, false);
    expect(staleGeneration.stderr).toMatch(
      /ACCOUNT_(?:GENERATION|SESSION)_STALE/,
    );
    expect(ownerDigest(ownerGeneration)).toBe(before);
  });

  it("serializes legacy and ledger first-XP awards on one owner authority", async () => {
    const sourceV1 = "a4000000-0000-4000-8000-000000000020";
    const sourceV2 = "a4000000-0000-4000-8000-000000000021";
    const [ledgerWriter, legacyWriter] = await Promise.all([
        psqlAsync(`
          begin;
          select private.project_cooked_batch_progress_activity(
            '${ownerRefresh}','cooking_completed','${sourceV2}','2026-08-08T01:25:00Z'
          );
          select pg_sleep(0.5);
          commit;
        `),
        psqlAsync(`
          begin;
          insert into public.user_progress_events(
            user_id,event_type,source_key,source_table,source_id,xp_delta,occurred_at,source_meta_json
          ) values(
            '${ownerRefresh}','cooking_completed','cooking_completed:${sourceV1}',
            'meals','${sourceV1}',60,'2026-08-08T01:25:00Z',
            '{"xp_kind":"first","level_curve_version":"v2"}'::jsonb
          );
          commit;
        `),
    ]);
    expect(ledgerWriter.stderr).toBe("");
    expect(legacyWriter.stderr).toBe("");
    expect(extractJson(psql(`
      select jsonb_build_object(
        'total',sum(xp_delta),
        'kinds',jsonb_agg(source_meta_json->>'xp_kind' order by xp_delta desc)
      )::text
      from public.user_progress_events
      where user_id='${ownerRefresh}' and event_type='cooking_completed';
    `).stdout)).toMatchObject({ total: 105, kinds: ["first", "repeat"] });
  });

  it("rolls legacy status and canonical side effects back together", () => {
    const before = ownerDigest(ownerA);
    const failed = serviceRpc(`
      create function pg_temp.reject_leftover_activity() returns trigger
      language plpgsql as $$ begin raise exception 'forced activity failure'; end $$;
      create trigger reject_leftover_activity before insert on public.user_growth_activity_events
      for each row when (new.source_id='${legacyAtomicBatch}'::uuid)
      execute function pg_temp.reject_leftover_activity();
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyAtomicBatch}','eat','2026-08-08T01:11:30Z'
      );
    `, false);
    expect(failed.stderr).toContain("forced activity failure");
    expect(ownerDigest(ownerA)).toBe(before);
    expect(psql(`select status from public.leftover_dishes where id='${legacyAtomicBatch}';`).stdout.trim())
      .toBe("leftover");
  });

  it("fails stale session and generation bindings closed with zero leftover writes", () => {
    const before = psql(`
      select jsonb_build_array(status,eaten_at,auto_hide_at,stale_reviewed_at)::text
      from public.leftover_dishes where id='${legacyBatch}';
    `).stdout.trim().split("\n").at(-1);

    const staleSession = serviceRpc(`
      update public.user_session_generation_bindings
      set binding_state='revoked', revoked_at=clock_timestamp()
      where session_key_hash='${sessionHashA}';
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','eat','2026-08-08T01:12:00Z'
      );
    `, false);
    expect(staleSession.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(psql(`
      select jsonb_build_array(status,eaten_at,auto_hide_at,stale_reviewed_at)::text
      from public.leftover_dishes where id='${legacyBatch}';
    `).stdout.trim().split("\n").at(-1)).toBe(before);

    const staleGeneration = serviceRpc(`
      update public.user_account_lifecycles
      set status='complete', updated_at=clock_timestamp()
      where owner_uuid='${ownerA}' and account_generation=1;
      insert into public.user_account_lifecycles(
        owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
      ) values('${ownerA}',2,'${identityA}','runtime','active',clock_timestamp());
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','eat','2026-08-08T01:13:00Z'
      );
    `, false);
    expect(staleGeneration.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(psql(`
      select jsonb_build_array(status,eaten_at,auto_hide_at,stale_reviewed_at)::text
      from public.leftover_dishes where id='${legacyBatch}';
    `).stdout.trim().split("\n").at(-1)).toBe(before);
  });

  it("keeps an owned leftover by changing stale_reviewed_at only", () => {
    const before = psql(`
      select jsonb_build_array(status,eaten_at,auto_hide_at,recipe_content_snapshot_id)::text
      from public.leftover_dishes where id='${legacyBatch}';
    `).stdout.trim().split("\n").at(-1);
    const kept = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${legacyBatch}','keep','2026-08-08T01:14:00Z'
      );
    `);
    const keptData = extractJson(kept.stdout);
    expect(keptData).toMatchObject({ status: "leftover" });
    expect(new Date(String(keptData.stale_reviewed_at)).toISOString())
      .toBe("2026-08-08T01:14:00.000Z");
    expect(psql(`
      select jsonb_build_array(status,eaten_at,auto_hide_at,recipe_content_snapshot_id)::text
      from public.leftover_dishes where id='${legacyBatch}';
    `).stdout.trim().split("\n").at(-1)).toBe(before);
    expect(psql(`
      select to_char(
        stale_reviewed_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      )
      from public.leftover_dishes
      where id='${legacyBatch}';
    `).stdout).toContain("2026-08-08T01:14:00Z");
  });

  it("denies another owner's keep and keeps v2 status mutations read-only", () => {
    const ownerBBefore = ownerDigest(ownerB);
    const denied = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${batchB}','keep','2026-08-08T01:15:00Z'
      );
    `);
    expect(extractJson(denied.stdout)).toMatchObject({ error_code: "FORBIDDEN" });
    expect(ownerDigest(ownerB)).toBe(ownerBBefore);

    const v2Status = serviceRpc(`
      select public.mutate_legacy_leftover_status(
        ${authArgs(ownerA)},'${batchA}','eat','2026-08-08T01:16:00Z'
      );
    `);
    expect(extractJson(v2Status.stdout)).toMatchObject({ error_code: "CONFLICT" });
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

  it("rejects a NULL pantry selection while preserving an explicit empty array", () => {
    const before = ownerDigest(ownerA);
    const nullSelection = psql(`
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}',
        'aa000000-0000-4000-8000-000000000000',null::uuid[],
        'weigh_later',null,'2026-08-08T01:29:00Z'
      );
      rollback;
    `, false);
    expect(nullSelection.status).not.toBe(0);
    expect(nullSelection.stderr).toContain("VALIDATION_ERROR");
    expect(ownerDigest(ownerA)).toBe(before);

    const emptySelection = psql(`
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.complete_snapshot_v2_cooking_session(
        ${authArgs(ownerA)},'${completeSession}',
        'aa000000-0000-4000-8000-000000000000',array[]::uuid[],
        'weigh_later',null,'2026-08-08T01:29:00Z'
      );
      rollback;
    `);
    expect(extractJson(emptySelection.stdout)).toMatchObject({
      data: { pantry_removed: 0 },
    });
    expect(ownerDigest(ownerA)).toBe(before);
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
    expect(extractJson(psql(`
      select jsonb_build_object(
        'source_meta_json',(select source_meta_json from public.user_progress_events
          where user_id='${ownerA}' and event_type='cooking_completed' and source_id='${completeSession}'),
        'summary',(select jsonb_build_object('total_xp',total_xp,'event_counts',event_counts,'level_curve_version',level_curve_version)
          from public.user_progress_summary where user_id='${ownerA}')
      );
    `).stdout)).toMatchObject({
      source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
      summary: {
        total_xp: 75,
        level_curve_version: "v2",
        event_counts: { cooking_completed: 1, leftover_eaten: 1 },
      },
    });

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

  it("serializes two-connection complete and cancel without deadlock and leaves one valid terminal outcome", async () => {
    const raceSession = "a4000000-0000-4000-8000-000000000030";
    const raceMeal = "a4000000-0000-4000-8000-000000000031";
    const completeKey = "aa000000-0000-4000-8000-000000000030";
    const cancelKey = "aa000000-0000-4000-8000-000000000031";

    psql(`
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      insert into public.meals(
        id,user_id,recipe_id,plan_date,column_id,planned_servings,status,revision
      ) values(
        '${raceMeal}','${ownerB}','${recipeB}',current_date + 2,'a4000000-0000-4000-8000-000000000099',2,
        'shopping_done',1
      );
      insert into public.cooking_sessions(
        id,user_id,status,contract_version,session_kind,recipe_id,
        recipe_content_snapshot_id,cooking_servings,base_recipe_revision
      ) select
        '${raceSession}','${ownerB}','in_progress','snapshot_v2','planner',
        '${recipeB}',recipe_content_snapshot_id,2,null
      from public.meals where id='${raceMeal}';
      insert into public.cooking_session_meals(
        session_id,meal_id,recipe_id,cooking_servings,meal_revision_snapshot
      ) values('${raceSession}','${raceMeal}','${recipeB}',2,1);
      insert into public.cooking_session_meal_claims(meal_id,session_id,owner_user_id)
      values('${raceMeal}','${raceSession}','${ownerB}');
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
      create or replace function private.test_pause_complete_receipt()
      returns trigger language plpgsql set search_path=pg_catalog,public,private,pg_temp
      as $$ begin perform pg_sleep(0.5); return new; end $$;
      create trigger test_pause_complete_receipt
      after insert on public.mutation_idempotency_keys
      for each row when (new.operation_scope='snapshot_v2_complete')
      execute function private.test_pause_complete_receipt();
    `);

    const outcomes = await Promise.allSettled([
      psqlAsync(`
        begin;
        set local request.jwt.claim.role='service_role';
        select public.complete_snapshot_v2_cooking_session(
          ${authArgs(ownerB)},'${raceSession}','${completeKey}',array[]::uuid[],
          'weigh_later',null,'2026-08-08T01:38:00Z'
        );
        commit;
      `),
      psqlAsync(`
        begin;
        set local request.jwt.claim.role='service_role';
        select pg_sleep(0.1);
        select public.cancel_snapshot_v2_cooking_session(
          ${authArgs(ownerB)},'${raceSession}','${cancelKey}',
          '2026-08-08T01:38:01Z'
        );
        commit;
      `),
    ]);

    psql(`
      drop trigger if exists test_pause_complete_receipt
        on public.mutation_idempotency_keys;
      drop function if exists private.test_pause_complete_receipt();
    `);

    const failures = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(failures.map((outcome) => String(outcome.reason))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/deadlock detected/i)]),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(String(failures[0]?.reason)).toContain("CONFLICT");

    const terminal = extractJson(psql(`
      select jsonb_build_object(
        'session_status',(select status from public.cooking_sessions where id='${raceSession}'),
        'meal_status',(select status from public.meals where id='${raceMeal}'),
        'claim_count',(select count(*) from public.cooking_session_meal_claims where session_id='${raceSession}'),
        'batch_count',(select count(*) from public.leftover_dishes where id='${raceSession}')
      );
    `).stdout);
    expect(terminal).toEqual(
      terminal.session_status === "completed"
        ? { session_status: "completed", meal_status: "cook_done", claim_count: 0, batch_count: 1 }
        : { session_status: "cancelled", meal_status: "shopping_done", claim_count: 0, batch_count: 0 },
    );

    psql(`
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      delete from public.user_progress_events
      where user_id='${ownerB}' and source_id='${raceSession}';
      delete from public.user_progress_summary as summary
      where summary.user_id='${ownerB}' and not exists (
        select 1 from public.user_progress_events as event
        where event.user_id=summary.user_id
      );
      delete from public.leftover_dishes where id='${raceSession}';
      delete from public.cooking_sessions where id='${raceSession}';
      delete from public.meals where id='${raceMeal}';
      update public.recipes set cook_count=greatest(coalesce(cook_count,0)-1,0)
      where id='${recipeB}' and '${terminal.session_status}'='completed';
      delete from public.mutation_idempotency_keys
      where owner_uuid='${ownerB}' and operation_scope in ('snapshot_v2_complete','snapshot_v2_cancel')
        and key_hash in (
          encode(extensions.digest(convert_to('${completeKey}','UTF8'),'sha256'),'hex'),
          encode(extensions.digest(convert_to('${cancelKey}','UTF8'),'sha256'),'hex')
        );
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
    const invalidPayloads = [
      `select public.discard_cooked_batch(${authArgs(ownerA)},'${batchA}','a6000000-0000-4000-8000-000000000090',null,'상함',1,'2026-08-08T01:59:00Z');`,
      `select public.discard_cooked_batch(${authArgs(ownerA)},'${batchA}','a6000000-0000-4000-8000-000000000091',10,'',1,'2026-08-08T01:59:00Z');`,
      `select public.adjust_cooked_batch(${authArgs(ownerA)},'${batchA}','a6000000-0000-4000-8000-000000000092',null,'보정',1,'2026-08-08T01:59:00Z');`,
      `select public.adjust_cooked_batch(${authArgs(ownerA)},'${batchA}','a6000000-0000-4000-8000-000000000093',10,'   ',1,'2026-08-08T01:59:00Z');`,
    ];
    for (const statement of invalidPayloads) {
      const before = ownerDigest(ownerA);
      const invalid = serviceRpc(statement, false);
      expect(invalid.stderr, statement).toContain("VALIDATION_ERROR");
      expect(ownerDigest(ownerA), statement).toBe(before);
    }

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

    const cachedBefore = ownerDigest(ownerA);
    const cachedCorruptions = [
      "remaining_weight_g=850",
      "revision=99",
      "event_checksum=repeat('f',64)",
      "remaining_weight_g=0,status='eaten',eaten_at=clock_timestamp(),auto_hide_at=clock_timestamp(),batch_status='depleted',depleted_reason='discarded'",
    ];
    for (const [ordinal, corruption] of cachedCorruptions.entries()) {
      const operationId = `a6000000-0000-4000-8000-${String(100 + ordinal).padStart(12, "0")}`;
      const cachedMismatch = serviceRpc(`
        select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        update public.leftover_dishes set ${corruption} where id='${batchA}';
        select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        select public.adjust_cooked_batch(
          ${authArgs(ownerA)},'${batchA}',
          '${operationId}',10,'tampered cache',2,
          '2026-08-08T02:01:30Z'
        );
      `, false);
      expect(cachedMismatch.stderr, corruption).toContain("CONFLICT");
      expect(ownerDigest(ownerA), corruption).toBe(cachedBefore);
    }

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
    const replayBefore = ownerDigest(ownerB);
    const replay = extractJson(serviceRpc(`
      select public.close_unweighed_cooked_batch(
        ${authArgs(ownerB)},'${batchB}',
        'a7000000-0000-4000-8000-000000000005','close','consumed',null,4,
        '2026-08-08T03:05:00Z'
      );
    `).stdout);
    expect(replay).toEqual(reclosed);
    expect(ownerDigest(ownerB)).toBe(replayBefore);
    expect(psql(`select count(*) from public.user_progress_events where user_id='${ownerB}' and event_type='leftover_eaten';`).stdout.trim()).toBe("1");
    expect(extractJson(psql(`
      select jsonb_build_object(
        'source_meta_json',(select source_meta_json from public.user_progress_events
          where user_id='${ownerB}' and event_type='leftover_eaten'),
        'summary',(select jsonb_build_object('total_xp',total_xp,'event_counts',event_counts,'level_curve_version',level_curve_version)
          from public.user_progress_summary where user_id='${ownerB}'),
        'activity_count',(select count(*) from public.user_growth_activity_events
          where user_id='${ownerB}' and activity_type='leftover_eaten' and source_id='${batchB}')
      );
    `).stdout)).toMatchObject({
      source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
      summary: { total_xp: 15, level_curve_version: "v2", event_counts: { leftover_eaten: 1 } },
      activity_count: 1,
    });
  });

  it("separates exact limit-free LEFTOVERS route plans from selective index proofs", () => {
    const evidence = psql(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      insert into public.leftover_dishes(
        id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        finished_weight_g,remaining_weight_g,weight_status,batch_status,depleted_reason,revision,
        event_checksum,eaten_at,auto_hide_at
      )
      select md5('compat-'||series)::uuid,'${ownerB}','${recipeB}','${contentB}',
        case when series % 100 = 0 then 'leftover' else 'eaten' end::public.leftover_dish_status_type,
        timestamptz '2027-01-01T00:00:00Z'-(series||' seconds')::interval,1,100,
        case when series % 100 = 0 then 100 else 0 end,'known',
        case when series % 100 = 0 then 'available' else 'depleted' end,
        case when series % 100 = 0 then null else 'consumed' end,1,
        encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex'),
        case when series % 100 = 0 then null
          else timestamptz '2027-01-02T00:00:00Z'-(series||' seconds')::interval end,
        case when series % 100 = 0 then null
          else timestamptz '2027-02-01T00:00:00Z'+((series % 30)||' days')::interval end
      from generate_series(1,4000) as series;
      insert into public.leftover_dishes(
        id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,cooking_servings,
        eaten_at,auto_hide_at
      )
      select md5('legacy-compat-'||series)::uuid,'${ownerB}','${recipeB}',null,
        case when series % 2 = 0 then 'leftover' else 'eaten' end::public.leftover_dish_status_type,
        timestamptz '2027-01-01T00:00:00Z'-(series||' seconds')::interval,1,
        case when series % 2 = 0 then null
          else timestamptz '2027-01-02T00:00:00Z'-(series||' seconds')::interval end,
        case when series % 2 = 0 then null
          else timestamptz '2027-02-01T00:00:00Z'+((series % 30)||' days')::interval end
      from generate_series(1,4000) as series;
      analyze public.leftover_dishes;

      select '__LEFTOVERS_EXACT_START__';
      explain (analyze, buffers, verbose, format json)
      select id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,eaten_at,
        auto_hide_at,stale_reviewed_at,cooking_servings,weight_status,batch_status,
        depleted_reason
      from public.leftover_dishes
      where user_id='${ownerB}'
        and (
          (recipe_content_snapshot_id is null and status='leftover')
          or (recipe_content_snapshot_id is not null and batch_status='available')
          or (recipe_content_snapshot_id is not null and batch_status='depleted'
            and depleted_reason in ('discarded','mixed','discarded_unweighed','mixed_unweighed'))
        )
      order by cooked_at desc,id desc;
      select '__LEFTOVERS_EXACT_END__';

      select '__EATEN_EXACT_START__';
      explain (analyze, buffers, verbose, format json)
      select id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,eaten_at,
        auto_hide_at,stale_reviewed_at,cooking_servings,weight_status,batch_status,
        depleted_reason
      from public.leftover_dishes
      where user_id='${ownerB}'
        and (
          (recipe_content_snapshot_id is null and status='eaten')
          or (recipe_content_snapshot_id is not null and batch_status='depleted'
            and depleted_reason in ('consumed','consumed_unweighed'))
        )
        and auto_hide_at > '2026-08-08T04:00:00Z'
      order by eaten_at desc,id desc;
      select '__EATEN_EXACT_END__';

      select '__SNAPSHOT_LOOKUP_START__';
      explain (analyze, buffers, verbose, format json)
      select id,recipe_id,title
      from public.recipe_content_snapshots
      where id in ('${contentB}');
      select '__SNAPSHOT_LOOKUP_END__';

      select '__LEGACY_LEFTOVER_INDEX_START__';
      explain (analyze, buffers, verbose, format json)
      select id
      from public.leftover_dishes
      where user_id='${ownerB}'
        and recipe_content_snapshot_id is null
        and status='leftover'
        and cooked_at > '2026-12-31T23:58:00Z'
      order by cooked_at desc,id desc;
      select '__LEGACY_LEFTOVER_INDEX_END__';

      select '__V2_LEFTOVER_INDEX_START__';
      explain (analyze, buffers, verbose, format json)
      select id
      from public.leftover_dishes
      where user_id='${ownerB}'
        and recipe_content_snapshot_id is not null
        and batch_status='available'
      order by cooked_at desc,id desc;
      select '__V2_LEFTOVER_INDEX_END__';

      select '__LEGACY_EATEN_INDEX_START__';
      explain (analyze, buffers, verbose, format json)
      select id
      from public.leftover_dishes
      where user_id='${ownerB}'
        and recipe_content_snapshot_id is null
        and status='eaten'
        and auto_hide_at > '2027-02-28T00:00:00Z'
      order by eaten_at desc,id desc;
      select '__LEGACY_EATEN_INDEX_END__';

      select '__V2_EATEN_INDEX_START__';
      explain (analyze, buffers, verbose, format json)
      select id
      from public.leftover_dishes
      where user_id='${ownerB}'
        and recipe_content_snapshot_id is not null
        and batch_status='depleted'
        and depleted_reason in ('consumed','consumed_unweighed')
        and auto_hide_at > '2027-02-28T00:00:00Z'
      order by eaten_at desc,id desc;
      select '__V2_EATEN_INDEX_END__';

      select '__INDEX_DEFINITIONS_START__';
      select jsonb_object_agg(indexname,indexdef order by indexname)
      from pg_catalog.pg_indexes
      where schemaname='public' and indexname in (
        'cooked_batches_owner_leftovers_compat_idx',
        'leftover_dishes_owner_legacy_leftover_idx',
        'leftover_dishes_owner_legacy_eaten_idx',
        'cooked_batches_owner_eaten_compat_idx'
      );
      select '__INDEX_DEFINITIONS_END__';
      rollback;
    `).stdout;

    const leftoversExact = extractMarkedJson<PgExplainDocument[]>(
      evidence,
      "LEFTOVERS_EXACT",
    )[0];
    const eatenExact = extractMarkedJson<PgExplainDocument[]>(evidence, "EATEN_EXACT")[0];
    const snapshotLookup = extractMarkedJson<PgExplainDocument[]>(
      evidence,
      "SNAPSHOT_LOOKUP",
    )[0];

    for (const [document, minRows, maxRows, orderColumn] of [
      [leftoversExact, 2_000, 2_100, "cooked_at"],
      [eatenExact, 5_900, 6_100, "eaten_at"],
    ] as const) {
      const nodes = collectPlanNodes(document.Plan);
      const scanNode = nodes.find((node) => node["Relation Name"] === "leftover_dishes");
      const conditions = planConditions(nodes);
      expect(document.Plan["Actual Rows"] ?? 0).toBeGreaterThanOrEqual(minRows);
      expect(document.Plan["Actual Rows"] ?? 0).toBeLessThanOrEqual(maxRows);
      expect(rootSharedBlocks(document)).toBeLessThanOrEqual(2_000);
      expect(nodes.some((node) => node["Node Type"] === "Limit")).toBe(false);
      expect(["Seq Scan", "Bitmap Heap Scan", "Index Scan", "Index Only Scan"])
        .toContain(scanNode?.["Node Type"]);
      expect(conditions).toContain(ownerB);
      expect(conditions).toContain("recipe_content_snapshot_id");
      expect(conditions).toContain("batch_status");
      expect(conditions).toContain("depleted_reason");
      const sortKey = nodes.flatMap((node) => node["Sort Key"] ?? []).join(" ");
      expect(sortKey).toContain(orderColumn);
      expect(sortKey).toContain("id");
      expect(Math.max(...nodes.map((node) => node["Actual Rows"] ?? 0))).toBeLessThanOrEqual(8_100);
      expect(document.Plan.Output).toEqual([
        "id", "user_id", "recipe_id", "recipe_content_snapshot_id", "status", "cooked_at",
        "eaten_at", "auto_hide_at", "stale_reviewed_at", "cooking_servings", "weight_status",
        "batch_status", "depleted_reason",
      ]);
    }

    const snapshotNodes = collectPlanNodes(snapshotLookup.Plan);
    expect(snapshotLookup.Plan["Actual Rows"]).toBe(1);
    expect(rootSharedBlocks(snapshotLookup)).toBeLessThanOrEqual(16);
    expect(snapshotNodes.some((node) => node["Relation Name"] === "recipe_content_snapshots"))
      .toBe(true);
    expect(planConditions(snapshotNodes)).toContain(contentB);
    expect(snapshotLookup.Plan.Output).toEqual(["id", "recipe_id", "title"]);

    expectSelectiveIndexPlan(
      extractMarkedJson<PgExplainDocument[]>(evidence, "LEGACY_LEFTOVER_INDEX")[0],
      "leftover_dishes_owner_legacy_leftover_idx",
      ["user_id", "cooked_at"],
    );
    expectSelectiveIndexPlan(
      extractMarkedJson<PgExplainDocument[]>(evidence, "V2_LEFTOVER_INDEX")[0],
      "cooked_batches_owner_leftovers_compat_idx",
      ["user_id", "batch_status"],
    );
    expectSelectiveIndexPlan(
      extractMarkedJson<PgExplainDocument[]>(evidence, "LEGACY_EATEN_INDEX")[0],
      "leftover_dishes_owner_legacy_eaten_idx",
      ["user_id", "auto_hide_at"],
    );
    expectSelectiveIndexPlan(
      extractMarkedJson<PgExplainDocument[]>(evidence, "V2_EATEN_INDEX")[0],
      "cooked_batches_owner_eaten_compat_idx",
      ["user_id", "auto_hide_at"],
    );

    expect(extractMarkedJson<Record<string, string>>(evidence, "INDEX_DEFINITIONS"))
      .toEqual({
        cooked_batches_owner_eaten_compat_idx:
          "CREATE INDEX cooked_batches_owner_eaten_compat_idx ON public.leftover_dishes USING btree (user_id, auto_hide_at, eaten_at DESC, id DESC) WHERE ((recipe_content_snapshot_id IS NOT NULL) AND (batch_status = 'depleted'::text) AND (depleted_reason = ANY (ARRAY['consumed'::text, 'consumed_unweighed'::text])))",
        cooked_batches_owner_leftovers_compat_idx:
          "CREATE INDEX cooked_batches_owner_leftovers_compat_idx ON public.leftover_dishes USING btree (user_id, batch_status, depleted_reason, cooked_at DESC, id DESC) WHERE (recipe_content_snapshot_id IS NOT NULL)",
        leftover_dishes_owner_legacy_eaten_idx:
          "CREATE INDEX leftover_dishes_owner_legacy_eaten_idx ON public.leftover_dishes USING btree (user_id, auto_hide_at, eaten_at DESC, id DESC) WHERE ((recipe_content_snapshot_id IS NULL) AND (status = 'eaten'::leftover_dish_status_type))",
        leftover_dishes_owner_legacy_leftover_idx:
          "CREATE INDEX leftover_dishes_owner_legacy_leftover_idx ON public.leftover_dishes USING btree (user_id, cooked_at DESC, id DESC) WHERE ((recipe_content_snapshot_id IS NULL) AND (status = 'leftover'::leftover_dish_status_type))",
      });
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
