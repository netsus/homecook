import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readRecipeSnapshotForkContext } from "@/lib/server/recipe-snapshot-entrypoint";
import { projectSnapshotV2CookModeData } from "@/lib/server/recipe-content-snapshot-future-propagation";

const project = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID;
const db = `supabase_db_${project}`;
const runId = randomBytes(5).toString("hex");
const sessionHash = randomBytes(32).toString("hex");
const owner = `8b000000-0000-4000-8000-${runId}01`;
const other = `8b000000-0000-4000-8000-${runId}02`;
const ingredient = `8b000000-0000-4000-8000-${runId}03`;
const recipe = `8b000000-0000-4000-8000-${runId}04`;
const snapshot = `8b000000-0000-4000-8000-${runId}05`;
const session = `8b000000-0000-4000-8000-${runId}06`;
const cutover = `8b000000-0000-4000-8000-${runId}07`;
const epoch = "2026-01-01T00:00:00Z";
const issued = "2026-01-02T00:00:00Z";
const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260922030000_recipe_snapshot_activation_repairs.sql"), "utf8");
const payload = migration.replace(/^begin;\n/, "").replace(/commit;\s*$/, "");
const forkSignature = "public.read_recipe_snapshot_entrypoint_context(uuid,timestamptz,text,integer,timestamptz,uuid)";
const cookSignature = "public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)";
const coreSignature = "public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)";
const guardSignature = "public.build_recipe_nutrition_input_guard(uuid)";
const oldFile = readFileSync(join(process.cwd(), "supabase/migrations/20260804100000_recipe_snapshot_entrypoint_projection.sql"), "utf8");
const oldStart = oldFile.indexOf("create or replace function public.read_recipe_snapshot_entrypoint_context(");
const oldFork = oldFile.slice(oldStart, oldFile.indexOf("$function$;", oldStart) + "$function$;".length);

function psql(sql: string, allowFailure = false) {
  const result = spawnSync("docker", ["exec", "-i", db, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", timeout: 30_000 });
  if (!allowFailure) expect(result.status, result.stderr).toBe(0);
  return result;
}
const output = (sql: string) => psql(sql).stdout.trim().split("\n").filter(Boolean).at(-1)!;
const authority = { authIdentityCreatedAt: epoch, hmacKeyVersion: 1, ownerUuid: owner, sessionIssuedAt: issued, sessionKeyHash: sessionHash };
const rpcArgs = { p_owner_uuid: owner, p_auth_identity_created_at_snapshot: epoch, p_session_key_hash: sessionHash, p_hmac_key_version: 1, p_session_issued_at: issued, p_session_id: session };
const forkCall = (id = recipe) => `public.read_recipe_snapshot_entrypoint_context('${owner}','${epoch}','${sessionHash}',1,'${issued}','${id}')`;
const fixture = `
  set local request.jwt.claim.role='service_role';
  set local request.jwt.claims='{"role":"service_role","sub":"${owner}"}';
  do $existing_fixture_authority$
  declare v_cutover uuid;
  begin
    select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton;
    if v_cutover is not null then perform public.set_account_generation_internal_writer_marker(v_cutover,true); end if;
  end $existing_fixture_authority$;
  insert into auth.users(id,created_at,email) values ('${owner}','${epoch}','reader-a-${runId}@example.invalid'),('${other}','${epoch}','reader-b-${runId}@example.invalid');
  insert into public.users(id,nickname,social_provider,social_id) values ('${owner}','reader A','google','reader-a-${runId}'),('${other}','reader B','google','reader-b-${runId}');
  insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values ('${owner}',1),('${other}',1);
  insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
    values ('${owner}',1,'${epoch}','runtime','active','${epoch}'),('${other}',1,'${epoch}','runtime','active','${epoch}');
  insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
    values('${sessionHash}',1,'${owner}',1,'${epoch}','active','local','https://auth.reader.test/auth/v1',now(),2,'${issued}','2099-01-01');
  insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
  update public.account_generation_capability_state set state='generation_active',revision=revision+1,current_cutover_attempt_id='${cutover}',activated_at='${epoch}' where singleton;
  update private.full_local_auth_control set authority='local',local_issuer='https://auth.reader.test/auth/v1',cutover_epoch=2,hmac_key_version=1,flows_open=true,local_activated_at='${epoch}' where singleton;
  select public.set_account_generation_internal_writer_marker('${cutover}',true);
  insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','reader ingredient ${runId}','유제품','g');
  insert into public.recipes(id,title,source_type,base_servings,created_by,visibility) values('${recipe}','reader recipe','system',2,'${other}','public');
  insert into public.recipe_ingredients(recipe_id,ingredient_id,amount,unit,ingredient_type,scalable,sort_order)
    values('${recipe}','${ingredient}',100,'g','QUANT',true,0);
  insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash)
    values('${snapshot}',null,'${recipe}','reader recipe',2,
      '[{"ingredient_id":"${ingredient}","amount":100,"unit":"g","ingredient_type":"QUANT","scalable":true,"food_product_id":null,"food_product_nutrition_version_id":null}]','[]',repeat('c',64));
  insert into public.cooking_sessions(id,user_id,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
    values('${session}','${owner}','snapshot_v2','standalone','${recipe}','${snapshot}',2,1);
`;

let postgrestName: string | undefined;
let privateDir: string | undefined;
let origin = "";
let token = "";
let originalCookDefinition = "";
let initialAuthenticatorPassword: string | null | undefined;


async function rpc(body: Record<string, unknown>) {
  const response = await fetch(`${origin}/rpc/read_snapshot_v2_cook_mode`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-homecook-internal-scope": "snapshot-v2-session" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  return { status: response.status, value: await response.json() };
}

// Only the catalog runner's unique disposable DB is accepted. No production URL
// or config is read; the additional PostgREST belongs to this same test project.
describe.skipIf(!project).sequential("snapshot readers through current PostgREST", () => {
  beforeAll(async () => {
    expect(project).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    const inspected = spawnSync("docker", ["inspect", db], { encoding: "utf8" });
    expect(inspected.status).toBe(0);
    const [state] = JSON.parse(inspected.stdout);
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(project);
    expect(state.Name).toBe(`/${db}`);
    const networks = Object.keys(state.NetworkSettings.Networks);
    expect(networks).toHaveLength(1);
    originalCookDefinition = output(`select replace(pg_get_functiondef('${cookSignature}'::regprocedure),chr(10),chr(1));`).replaceAll("\u0001", "\n");
    initialAuthenticatorPassword = JSON.parse(output("select to_json(rolpassword) from pg_authid where rolname='authenticator';"));
    const secret = randomBytes(32).toString("hex");
    const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const jwtBody = Buffer.from(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now()/1000)+900 })).toString("base64url");
    token = `${jwtHeader}.${jwtBody}.${createHmac("sha256", secret).update(`${jwtHeader}.${jwtBody}`).digest("base64url")}`;
    privateDir = mkdtempSync(join(tmpdir(), "hcg-reader-postgrest-"));
    const pgPassword = randomBytes(24).toString("hex");
    psql(`alter role authenticator password '${pgPassword}';`);
    psql("alter role authenticator in database postgres set homecook.personal_recipe_v2='on'; alter role authenticator in database postgres set homecook.snapshot_v2_creation='on';");
    const envPath = join(privateDir, "postgrest.env");
    writeFileSync(envPath, [
      `PGRST_DB_URI=postgresql://authenticator:${encodeURIComponent(pgPassword)}@${db}:5432/postgres`,
      "PGRST_DB_ANON_ROLE=anon", "PGRST_DB_SCHEMAS=public", `PGRST_JWT_SECRET=${secret}`,
      "PGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request",
      "PGRST_DB_CONFIG=false", "PGRST_LOG_LEVEL=info", "PGRST_SERVER_HOST=0.0.0.0", "PGRST_SERVER_PORT=3000",
    ].join("\n"), { mode: 0o600 });
    postgrestName = `hcg-reader-rest-${project}`;
    const started = spawnSync("docker", ["run", "--platform", "linux/arm64", "--detach", "--name", postgrestName, "--label", `homecook.test.project=${project}`, "--network", networks[0], "--publish", "127.0.0.1::3000", "--env-file", envPath, "postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805"], { encoding: "utf8", timeout: 30000 });
    expect(started.status, started.stderr).toBe(0);
    const [rest] = JSON.parse(spawnSync("docker", ["inspect", postgrestName], { encoding: "utf8" }).stdout);
    expect(rest.Config.Labels["homecook.test.project"]).toBe(project);
    origin = `http://127.0.0.1:${rest.NetworkSettings.Ports["3000/tcp"][0].HostPort}`;
    let ready = false;
    for (let index=0; index<40; index+=1) {
      try { await fetch(origin, { signal: AbortSignal.timeout(500) }); ready = true; break; } catch { await new Promise(resolve=>setTimeout(resolve,250)); }
    }
    if (!ready) {
      const logs = spawnSync("docker", ["logs", postgrestName], {encoding:"utf8"});
      throw new Error((logs.stderr + logs.stdout).replaceAll(secret,"[redacted]").replaceAll(pgPassword,"[redacted]").slice(-1200));
    }
  }, 40000);

  afterAll(() => {
    if (postgrestName) spawnSync("docker", ["rm", "--force", postgrestName], { encoding: "utf8" });
    // HTTP uses another connection, so its fixture must commit. Promotion is
    // intentionally irreversible: the runner invokes this suite last and then
    // destroys the whole owned DB. Never disable its transition protection.
    if (originalCookDefinition) {
      psql(`begin; ${originalCookDefinition};
        alter role authenticator password ${initialAuthenticatorPassword === null ? "null" : `'${initialAuthenticatorPassword?.replaceAll("'", "''")}'`};
        commit;`);
    }
    if (privateDir) rmSync(privateDir, { recursive: true, force: true });
  });

  it("restores only the exact historical fork reader and preserves canonical content and privileges", () => {
    const before = output(`select jsonb_agg(jsonb_build_object('name',proname,'owner',proowner::regrole::text,'acl',proacl,'security',prosecdef,'config',proconfig) order by proname) from pg_proc where oid in ('${forkSignature}'::regprocedure,'${cookSignature}'::regprocedure);`);
    const after = output(`begin; ${oldFork} ${payload}
      select jsonb_agg(jsonb_build_object('name',proname,'owner',proowner::regrole::text,'acl',proacl,'security',prosecdef,'config',proconfig) order by proname) from pg_proc where oid in ('${forkSignature}'::regprocedure,'${cookSignature}'::regprocedure); rollback;`);
    expect(JSON.parse(after)).toEqual(JSON.parse(before));
    expect(output(`begin; ${payload} ${payload} select bool_and(provolatile='v') from pg_proc where oid in ('${forkSignature}'::regprocedure,'${cookSignature}'::regprocedure); rollback;`)).toBe("t");
  });

  it("rejects unknown function-body and ACL drift before any reader mutation", () => {
    const changed = oldFork.replace("v_result jsonb;", "v_result jsonb; -- unreviewed");
    for (const drift of [changed, `grant execute on function ${forkSignature} to authenticated;`]) {
      const result = psql(`begin; ${drift} ${payload} rollback;`, true);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SNAPSHOT_ACTIVATION_CATALOG_DRIFT");
    }
  });

  it("repairs the observed old writer and broad nutrition ACL exactly and rejects unknown writer changes", () => {
    const canonical = JSON.parse(output(`select to_json(pg_get_functiondef('${coreSignature}'::regprocedure));`)) as string;
    let historical = canonical;
    const pairs = [...migration.matchAll(/v_old := \$core_old_(\d+)\$([\s\S]*?)\$core_old_\1\$;\s*v_new := \$core_new_\1\$([\s\S]*?)\$core_new_\1\$;/gu)];
    expect(pairs).toHaveLength(9);
    for (const pair of pairs) {
      expect(historical.split(pair[3])).toHaveLength(2);
      historical = historical.replace(pair[3], pair[2]);
    }
    const readback = JSON.parse(output(`begin; ${historical};
      grant execute on function ${guardSignature} to anon,authenticated,service_role;
      ${payload}
      select jsonb_build_object('writer_hash',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='${coreSignature}'::regprocedure),
        'guard_acl',(select proacl from pg_proc where oid='${guardSignature}'::regprocedure)); rollback;`));
    expect(readback.writer_hash).toBe("18c1b5c135d0f5b64cd8fbde722399a86abf79b31bd6b23011e876580448c4d8");
    expect(readback.guard_acl).toEqual(["postgres=X/postgres"]);
    for (const unknown of [
      historical.replace("v_capability_state text;", "v_capability_state text; -- unreviewed"),
      `grant execute on function ${coreSignature} to authenticated;`,
      `grant execute on function ${guardSignature} to public;`,
    ]) {
      const result = psql(`begin; ${unknown}; ${payload} rollback;`, true);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SNAPSHOT_ACTIVATION_CATALOG_DRIFT");
    }
  });

  it("preserves fork revision checks, inherited tags, original identity and private save-as-new", () => {
    const unavailable = { status:"unavailable", amount:null, known_amount:null, display_mode:null };
    const nutrition = JSON.stringify({
      calculation_version:"personal-recipe-v2", scalable_values:{}, fixed_values:{},
      nutrient_status:Object.fromEntries(["energy_kcal","carbohydrate_g","protein_g","fat_g","sodium_mg"].map(key=>[key,unavailable])),
      calculation_status:"unavailable", calculation_quality:null, reflected_ingredient_count:0, target_ingredient_count:1,
      missing_reasons:[`PREDECESSOR_NOT_APPROVED:${ingredient}`],warnings:["PREDECESSOR_NOT_APPROVED"],sources:[],
    });
    psql(`begin; ${fixture} ${payload} set local homecook.personal_recipe_v2='on';
      select public.set_recipe_tags('${recipe}', '[{"normalized_key":"reader-tag","label":"reader tag","kind":"user","is_system":false,"theme_eligible":false,"source":"system_suggested","visibility":"public","review_status":"approved"}]','${other}','system_suggested');
      do $regression$
      declare v_draft jsonb; v_nutrition jsonb := '${nutrition}'::jsonb; v_first jsonb; v_copy jsonb; v_private uuid;
      begin
        v_draft := jsonb_build_object('title','reader copy','base_servings',2,
          'ingredients',jsonb_build_array(jsonb_build_object('ingredient_id','${ingredient}','amount',100,'unit','g','ingredient_type','QUANT','scalable',true)),
          'steps',jsonb_build_array(jsonb_build_object('step_number',1,'instruction','mix','cooking_method_id',(select id from public.cooking_methods order by id limit 1),'ingredients_used','[]'::jsonb)));
        begin
          perform public.write_personal_recipe_core('${owner}','${epoch}','${sessionHash}',1,'${issued}','fork',null,'${recipe}',999,v_draft,v_nutrition,null,null,0,gen_random_uuid());
          raise exception 'stale fork accepted';
        exception when serialization_failure then if sqlerrm <> 'RECIPE_REVISION_CONFLICT' then raise; end if; end;
        v_first := public.write_personal_recipe_core('${owner}','${epoch}','${sessionHash}',1,'${issued}','fork',null,'${recipe}',1,v_draft,v_nutrition,null,null,0,gen_random_uuid());
        v_private := (v_first->'data'->>'id')::uuid;
        if v_first->'data'->>'origin_recipe_id' <> '${recipe}' or v_private is null then raise exception 'fork origin mismatch'; end if;
        begin
          perform public.write_personal_recipe_core('${owner}','${epoch}','${sessionHash}',1,'${issued}','save_as_new',null,v_private,999,v_draft,v_nutrition,null,null,0,gen_random_uuid());
          raise exception 'stale copy accepted';
        exception when serialization_failure then if sqlerrm <> 'RECIPE_REVISION_CONFLICT' then raise; end if; end;
        v_copy := public.write_personal_recipe_core('${owner}','${epoch}','${sessionHash}',1,'${issued}','fork',null,v_private,1,v_draft,v_nutrition,null,null,0,gen_random_uuid());
        if v_copy->'data'->>'id'=v_private::text or v_copy->'data'->>'origin_recipe_id'<>'${recipe}' then raise exception 'private save-as-new mismatch'; end if;
        if (select count(*) from public.recipe_tags rt join public.tags t on t.id=rt.tag_id where rt.recipe_id in(v_private,(v_copy->'data'->>'id')::uuid) and t.normalized_key='reader-tag') <> 2 then raise exception 'inherited tags missing'; end if;
        if (select revision from public.recipes where id='${recipe}') <> 1 then raise exception 'public source changed'; end if;
      end $regression$; rollback;`);
  });

  it("returns a public fork draft accepted by the actual parser and rejects private/deleted sources and stale sessions", async () => {
    const json = output(`begin; ${fixture} ${oldFork} ${payload}
      set local homecook.personal_recipe_v2='on'; set local homecook.snapshot_v2_creation='on';
      select ${forkCall()}; rollback;`);
    const data = JSON.parse(json);
    await expect(readRecipeSnapshotForkContext({ recipeId: recipe, sessionAuthority: authority, client: { rpc: async()=>({ data, error:null }) } })).resolves.toMatchObject({ image_object_id:null, draft:{ title:"reader recipe", base_servings:2 } });
    for (const change of [
      `update public.recipes set visibility='private' where id='${recipe}';`,
      `update public.recipes set deleted_at=clock_timestamp() where id='${recipe}';`,
      `update public.user_session_generation_bindings set binding_state='revoked' where owner_uuid='${owner}';`,
    ]) {
      const result = psql(`begin; ${fixture} ${payload} set local homecook.personal_recipe_v2='on'; set local homecook.snapshot_v2_creation='on'; ${change} select ${forkCall()}; rollback;`, true);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/RESOURCE_NOT_FOUND|ACCOUNT_SESSION_STALE/);
    }
  });

  it("fails through PostgREST while STABLE and succeeds after VOLATILE without weakening owner/session checks", async () => {
    psql(`begin; ${fixture} select public.set_account_generation_internal_writer_marker('${cutover}',false); alter function ${cookSignature} stable; notify pgrst,'reload schema'; commit;`);
    await new Promise(resolve=>setTimeout(resolve,700));
    const red = await rpc(rpcArgs);
    expect(red.status).not.toBe(200);
    expect(JSON.stringify(red.value)).toMatch(/read-only|25006|FOR SHARE/);
    psql(migration);
    await new Promise(resolve=>setTimeout(resolve,700));
    const green = await rpc(rpcArgs);
    expect(green.status, JSON.stringify(green.value)).toBe(200);
    expect(projectSnapshotV2CookModeData(green.value.data)?.recipe).toMatchObject({ id:recipe, cooking_servings:2 });
    expect(green.value.data.recipe.ingredients[0].standard_name).toBe(`reader ingredient ${runId}`);
    const denied = await rpc({ ...rpcArgs, p_owner_uuid:other });
    expect(denied.status).not.toBe(200);
    const stale = await rpc({ ...rpcArgs, p_session_key_hash:"9".repeat(64) });
    expect(stale.status).not.toBe(200);
  });

  it("sends the real derived-create route's named arguments through PostgREST and preserves the public source", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const methodId = output("select id from public.cooking_methods order by id limit 1;");
    const sourceBefore = output(`select md5(to_jsonb(r)::text) from public.recipes r where id='${recipe}';`);
    let legacyProbe: { status: number; code?: string } | undefined;
    const calls: Array<Record<string, unknown>> = [];
    const nutritionTables = new Set<string>();
    const serviceClient = createClient(origin, token, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { "x-homecook-internal-scope": "recipe-future-propagation" },
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const target = new URL(request.url);
          expect(target.origin).toBe(origin);
          expect(target.pathname.startsWith("/rest/v1/")).toBe(true);
          target.pathname = target.pathname.slice("/rest/v1".length);
          if (request.method === "GET") nutritionTables.add(target.pathname);
          if (target.pathname === "/rpc/write_personal_recipe_core") {
            const args = await request.clone().json() as Record<string, unknown>;
            calls.push(args);
            if (!legacyProbe) {
              // Reproduce the old wire shape against the real named-argument
              // resolver. The rejected request must never enter the writer.
              const legacy = await fetch(target, {
                method: "POST", headers: request.headers,
                body: JSON.stringify({ ...args, p_nutrition_predecessor_guard: { recipe_ingredients: [] } }),
                signal: AbortSignal.timeout(5000),
              });
              const failure = await legacy.json();
              legacyProbe = { status: legacy.status, code: failure.code };
              expect(legacyProbe).toEqual({ status: 404, code: "PGRST202" });
              expect(output(`select count(*) from public.recipes where created_by='${owner}' and visibility='private';`)).toBe("0");
            }
          }
          return fetch(new Request(target, request));
        },
      },
    });
    // Cookie authentication and initial user bootstrap are supplied by this
    // isolated fixture. Nutrition selects/calculation, RPC resolution and the
    // writer's own session/owner/version checks use real code and PostgreSQL.
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createRouteHandlerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: owner, created_at: epoch } } }) } }),
      createRecipeFuturePropagationInternalClient: () => serviceClient,
      createRemoteCompatibilityServiceRoleClient: () => null,
    }));
    vi.doMock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: async () => ({ ok: true, sessionAuthority: authority }) }));
    vi.doMock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: async () => undefined, ensureUserBootstrapState: async () => undefined, formatBootstrapErrorMessage: (_error: unknown, fallback: string) => fallback }));
    vi.doMock("@/lib/server/user-growth-activity", async () => ({
      ...await vi.importActual<object>("@/lib/server/user-growth-activity"),
      recordUserGrowthActivityEvent: async () => ({ recorded: false, duplicate: false, error: null }),
    }));
    try {
      const { POST } = await import("@/app/api/v1/recipes/route");
      const requestBody = { origin_recipe_id: recipe, base_recipe_revision: 1, image_object_id: null, draft: {
        title: "실제 명명인자 복제", description: null, base_servings: 2,
        ingredients: [{ ingredient_id: ingredient, amount: 100, unit: "g", ingredient_type: "QUANT", scalable: true }],
        steps: [{ step_number: 1, instruction: "섞어요", cooking_method_id: methodId, cooking_method_ids: [methodId], ingredients_used: [] }],
      } };
      const requestKey = `8b000000-0000-4000-8000-${runId}08`;
      const createRequest = () => new Request("http://localhost/api/v1/recipes", {
        method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify(requestBody),
      });
      const response = await POST(createRequest());
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(201);
      expect(result.success).toBe(true);
      expect(legacyProbe).toEqual({ status: 404, code: "PGRST202" });
      const declaredArguments = JSON.parse(output(`select to_json(proargnames) from pg_proc where oid='${coreSignature}'::regprocedure;`)) as string[];
      expect(Object.keys(calls[0]).sort()).toEqual(declaredArguments.filter(name => name !== "p_now").sort());
      expect(calls[0]).not.toHaveProperty("p_nutrition_predecessor_guard");
      expect(nutritionTables).toEqual(new Set(["/ingredient_nutrition_profiles", "/ingredient_conversion_assignments", "/piece_unit_weights"]));
      expect(output(`select md5(to_jsonb(r)::text) from public.recipes r where id='${recipe}';`)).toBe(sourceBefore);
      expect(output(`select concat(visibility,':',origin_recipe_id,':',revision) from public.recipes where id='${result.data.id}';`)).toBe(`private:${recipe}:1`);
      const replay = await POST(createRequest());
      expect(replay.status).toBe(201);
      expect((await replay.json()).data.id).toBe(result.data.id);
      expect(output(`select count(*) from public.recipes where created_by='${owner}' and visibility='private';`)).toBe("1");
    } finally {
      for (const modulePath of ["@/lib/supabase/server", "@/lib/server/account-generation/session-authority", "@/lib/server/user-bootstrap", "@/lib/server/user-growth-activity"]) vi.doUnmock(modulePath);
    }
  });
});
