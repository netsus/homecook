import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calculateRecipeDraftNutrition, parseRecipeFuturePatchRequest, buildSessionAuthorityRpcArgs, type RecipeDraft } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { readRecipeQuantityMode } from "@/lib/server/recipe-snapshot-entrypoint";

const hooks = vi.hoisted(() => ({ route: vi.fn(), internal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: hooks.route,
  createRecipeFuturePropagationInternalClient: hooks.internal, createRecipeImageInternalClient: () => ({ storage: {} }) }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: vi.fn(), ensureUserBootstrapState: vi.fn(),
  formatBootstrapErrorMessage: (_error: unknown, fallback: string) => fallback }));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: vi.fn() }));
vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability: async () => ({ ok: true, state: "generation_active", revision: 2 }) }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession: async () => ({ ok: true, sessionAuthority: {
    ownerUuid: "78000000-0000-4000-8000-000000000001", authIdentityCreatedAt: "2026-01-01T00:00:00Z",
    sessionIssuedAt: "2026-01-02T00:00:00Z", sessionKeyHash: "7".repeat(64), hmacKeyVersion: 1 } }) }));

const enabled = process.env.HOMECOOK_RECIPE_PATCH_REPLAY_NATIVE === "1";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const label = "homecook.recipe-patch-replay-native";
const tag = randomUUID();
const owner = "78000000-0000-4000-8000-000000000001";
const milk = "78000000-0000-4000-8000-000000000002";
const flour = "78000000-0000-4000-8000-000000000050";
const method = "79000000-0000-4000-8000-000000000003";
const key = "78000000-0000-4000-8000-000000000060";
const output = `/tmp/mumeok-recipe-http-replay-native-${tag}`;
const migration = "supabase/migrations/20261014225300_recipe_future_patch_http_replay.sql";
const baselineMigration = "supabase/migrations/20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql";
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", DOCKER_HOST: "unix:///var/run/docker.sock" };
let cid = "";
let body: Record<string, unknown>;
let recipeId = "";
const calls: Array<{ kind: string; name: string }> = [];
const evidence: Record<string, unknown> = { application_data: "synthetic-only", image, tag, label };
const literal = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";
function command(args: string[], input?: string | Buffer) {
  const result = spawnSync("docker", args, { input, env, encoding: "utf8", maxBuffer: 40 * 1024 * 1024, timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function own() {
  if (!/^[a-f0-9]{64}$/.test(cid)) throw Error("Missing owned native fixture");
  const state = JSON.parse(command(["inspect", cid]))[0];
  if (state.Config.Labels?.[label] !== tag || state.Config.Image !== image || state.HostConfig.NetworkMode !== "none"
    || state.Mounts.length || Object.keys(state.HostConfig.PortBindings ?? {}).length) throw Error("Native fixture identity changed");
}
function sql(statement: string) {
  own();
  return command(["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], statement);
}
function json(statement: string) { return JSON.parse(sql(statement).split("\n").filter(Boolean).at(-1)!); }
function transaction(statement: string, role = "service_role", path?: string) {
  return `begin;set local homecook.personal_recipe_v2='on';set local homecook.snapshot_v2_creation='on';
    set local request.jwt.claim.role=${literal(role)};set local request.jwt.claims=${literal(JSON.stringify({ role, sub: owner }))};
    ${path ? `set local request.headers='{"x-homecook-internal-scope":"recipe-future-propagation"}';set local request.method=${literal(path.startsWith("/rpc/") ? "POST" : "GET")};set local request.path=${literal(path)};select private.verify_full_local_internal_scope();` : ""}
    set local role ${role};${statement};commit;`;
}
const inventory = `select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'acl',p.proacl,'configuration',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
  'sourceHash',md5(btrim(p.prosrc,chr(10))),'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))
  order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private');`;
class NativeQuery {
  private columns = "";
  private filters: string[] = [];
  private orderBy = "";
  private paging = "";
  private single = false;
  constructor(private table: string, private role: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push(`${column}=${literal(value)}`); return this; }
  in(column: string, values: string[]) { this.filters.push(`${column}=any(array[${values.map(literal).join(",")} ]::uuid[])`); return this; }
  order(column: string, options: { ascending: boolean }) { this.orderBy = `order by ${column} ${options.ascending ? "asc" : "desc"}`; return this; }
  range(from: number, to: number) { this.paging = `offset ${from} limit ${to - from + 1}`; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve: (result: { data: unknown; error: unknown }) => unknown, reject?: (error: unknown) => unknown) {
    try {
      calls.push({ kind: "select", name: this.table });
      let projection = this.columns;
      if (this.table === "ingredient_nutrition_profiles") {
        const checked = readFileSync("scripts/lib/recipe-nutrition-predecessor.mjs", "utf8").match(/const NUTRITION_LINK_SELECT = `([\s\S]*?)`;/)![1];
        expect(this.columns.replace(/\s/g, "")).toBe(checked.replace(/\s/g, ""));
        projection = `link.*, (select to_jsonb(p)||jsonb_build_object('nutrition_values',(select jsonb_agg(v) from public.nutrition_values v where v.profile_id=p.id),
          'nutrition_source_items',(select to_jsonb(i)||jsonb_build_object('nutrition_sources',(select to_jsonb(s) from public.nutrition_sources s where s.id=i.source_id))
            from public.nutrition_source_items i where i.id=p.source_item_id)) from public.nutrition_profiles p where p.id=link.nutrition_profile_id) nutrition_profiles`;
      }
      if (["ingredient_conversion_assignments", "piece_unit_weights"].includes(this.table)) {
        const selector = this.table === "piece_unit_weights" ? "PIECE_WEIGHT_SELECT" : "CONVERSION_ASSIGNMENT_SELECT";
        const checked = readFileSync("scripts/lib/recipe-nutrition-predecessor.mjs", "utf8").match(new RegExp("const " + selector + " = `([\\s\\S]*?)`;"))![1];
        expect(this.columns.replace(/\s/g, "")).toBe(checked.replace(/\s/g, ""));
        projection = `link.*, (select to_jsonb(e)||jsonb_build_object('nutrition_sources',(select to_jsonb(s) from public.nutrition_sources s where s.id=e.source_id))
          from public.measurement_source_evidence e where e.id=link.evidence_id) measurement_source_evidence`;
        if (this.table === "ingredient_conversion_assignments") projection += `, (select to_jsonb(p) from public.measurement_conversion_profiles p where p.id=link.conversion_profile_id) measurement_conversion_profiles`;
      }
      const query = `select coalesce(jsonb_agg(row),'[]') from (select ${projection} from public.${this.table}${["ingredient_nutrition_profiles", "ingredient_conversion_assignments", "piece_unit_weights"].includes(this.table) ? " link" : ""}
        ${this.filters.length ? `where ${this.filters.join(" and ")}` : ""} ${this.orderBy} ${this.paging}) row`;
      const data = json(transaction(query, this.role, this.role === "service_role" ? `/${this.table}` : undefined));
      return Promise.resolve(resolve({ data: this.single ? data[0] ?? null : data, error: null }));
    } catch (error) { return reject ? Promise.resolve(reject(error)) : Promise.reject(error); }
  }
}
function rpc(name: string, args: Record<string, unknown>) {
  calls.push({ kind: "rpc", name });
  const params = Object.entries(args).map(([field, value]) => `${field}=>${value === null ? "null" : typeof value === "object" ? literal(JSON.stringify(value)) + "::jsonb" : typeof value === "number" ? value : literal(value)}`).join(",");
  try { return Promise.resolve({ data: json(transaction(`select to_jsonb(public.${name}(${params}))`, "service_role", `/rpc/${name}`)), error: null }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Native RPC failed";
    evidence.rpcFailures = [...(evidence.rpcFailures as unknown[] ?? []), { name, message }];
    return Promise.resolve({ data: null, error: { message } });
  }
}


const authority = { ownerUuid: owner, authIdentityCreatedAt: "2026-01-01T00:00:00Z", sessionIssuedAt: "2026-01-02T00:00:00Z", sessionKeyHash: "7".repeat(64), hmacKeyVersion: 1 };
const authArgs = buildSessionAuthorityRpcArgs(authority);
const nativeClient = { from: (table: string) => new NativeQuery(table, "service_role"), rpc };
let nativeDraft: RecipeDraft;
let firstRequest: Record<string, unknown>;
let legacyPrepared: Record<string, unknown>;
let legacyResult: unknown;
let oldReceipts: Array<Record<string, unknown>>;
let receiptBefore: unknown;
function unwrap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw Error("Malformed fixture result");
  if ("success" in value) {
    if (value.success !== true || !("data" in value)) throw Error(JSON.stringify(value));
    return unwrap(value.data);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function checkedRpc(name: string, args: Record<string, unknown>) {
  const response = await rpc(name, args);
  if (response.error) throw Error(response.error.message);
  return response.data;
}
async function freshRecipe() {
  const base: RecipeDraft = { ...nativeDraft, title: `base-${randomUUID()}`, ingredients: nativeDraft.ingredients.map(value => {
    const row: Record<string, unknown> = { ...unwrap(value), amount: 100, unit: "g" };
    delete row.quantity_input; delete row.row_key; delete row.source_kind;
    delete row.standard_name; delete row.sort_order;
    return row;
  }) };
  const nutrition = await calculateRecipeDraftNutrition(nativeClient, { recipeId: randomUUID(), ownerUserId: owner, baseRecipeRevision: 1, draft: base, quantityMode: false });
  const created = unwrap(await checkedRpc("write_personal_recipe_core", { ...authArgs, p_operation: "create", p_recipe_id: null, p_source_recipe_id: null,
    p_base_recipe_revision: null, p_draft: base, p_nutrition_snapshot: nutrition.nutritionSnapshot, p_tags: [], p_image_object_id: null,
    p_expected_cleanup_generation: null, p_idempotency_key: randomUUID() }));
  expect(typeof created.id).toBe("string"); return String(created.id);
}
async function prepared(id: string, title = "정확 재시도", revision = 1) {
  const draft = { ...nativeDraft, title };
  const quantityMode = await readRecipeQuantityMode({ client: nativeClient, sessionAuthority: authority, recipeId: id, expectedRevision: revision });
  const nutrition = await calculateRecipeDraftNutrition(nativeClient, { recipeId: id, ownerUserId: owner, baseRecipeRevision: revision, draft, quantityMode });
  const preview = unwrap(await checkedRpc("preview_recipe_future_plan_impact", { ...authArgs, p_recipe_id: id, p_base_recipe_revision: revision, p_draft: draft }));
  const request = { base_recipe_revision: revision, draft: { ...draft, description: draft.description ?? null },
    future_plan_strategy: "replace_all", impact_token: preview.impact_token, image_object_id: null };
  return { request, nutrition, preview, originalArgs: { ...authArgs, p_recipe_id: id, p_base_recipe_revision: revision, p_draft: request.draft,
    p_nutrition_snapshot: nutrition.nutritionSnapshot, p_nutrition_predecessor_guard: nutrition.predecessorGuard,
    p_future_plan_strategy: request.future_plan_strategy, p_impact_token: request.impact_token, p_image_object_id: null, p_idempotency_key: randomUUID() } };
}
const receiptMetadata = `select jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,
  'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from pg_policies p where schemaname='public' and tablename='mutation_idempotency_keys'),
  'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) from pg_class c where c.oid='public.mutation_idempotency_keys'::regclass;`;
async function establishReplayFixtures() {
  const parsed = parseRecipeFuturePatchRequest({ base_recipe_revision: 1, draft: body, future_plan_strategy: "keep", impact_token: "fixture" });
  if (!parsed.ok) throw Error(JSON.stringify(parsed.fields));
  nativeDraft = { ...parsed.value.draft, ingredients: parsed.value.draft.ingredients.map((value, index) => {
    const row: Record<string, unknown> = { ...unwrap(value), source_kind: "ingredient", row_key: `78000000-0000-4000-8000-00000000008${index}` };
    delete row.standard_name; delete row.sort_order;
    return row;
  }) };
  receiptBefore = json(receiptMetadata); evidence.actualReceiptMetadata = receiptBefore;
  const legacyId = await freshRecipe(); const old = await prepared(legacyId, "구 writer 성공");
  legacyPrepared = old.originalArgs; legacyResult = await checkedRpc("write_recipe_future_plan_change", legacyPrepared);
  oldReceipts = json("select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.mutation_idempotency_keys r;");
  const preimageGuard = readFileSync(migration,"utf8").match(/do \$preimage\$[\s\S]*?\$preimage\$;/)?.[0];
  if (!preimageGuard) throw Error("Exact predecessor guard missing");
  sql(`begin;${preimageGuard}rollback;`);
  expect(() => sql(`begin;alter function private.verify_full_local_internal_scope() set search_path=pg_catalog;${preimageGuard}`))
    .toThrow(/RECIPE_FUTURE_HTTP_PREIMAGE_MISMATCH/);
  evidence.predecessorGuard = { exactPreimageAccepted:true, changedConfigurationRejected:true };
  sql("set session authorization postgres;" + readFileSync(migration, "utf8"));
  recipeId = await freshRecipe();
  sql(`begin; select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
    insert into public.meal_plan_columns(id,user_id,name,sort_order) values('79000000-0000-4000-8000-000000000080','${owner}','검증 끼니',0);
    insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status) values('79000000-0000-4000-8000-000000000081','${owner}','${recipeId}','2090-01-01','79000000-0000-4000-8000-000000000080',2,'registered');
    select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
  firstRequest = (await prepared(recipeId)).request;
}
function readerArgs(request = firstRequest, idempotencyKey = key, id = recipeId) {
  return { ...authArgs, p_recipe_id: id, p_request_body: request, p_quantity_contract: "quantity-v4", p_idempotency_key: idempotencyKey };
}
function rpcStatement(name: string, args: Record<string, unknown>) {
  return `select to_jsonb(public.${name}(${Object.entries(args).map(([field, value]) => `${field}=>${value === null ? "null" : typeof value === "object"
    ? literal(JSON.stringify(value)) + "::jsonb" : typeof value === "number" ? value : literal(value)}`).join(",")}));`;
}
async function httpPatch(request = firstRequest, requestKey = key, pathId = recipeId) {
  const { PATCH } = await import("@/app/api/v1/recipes/[id]/route");
  return PATCH(new Request(`http://fixture.invalid/api/v1/recipes/${pathId}`, { method: "PATCH", headers: {
    "content-type": "application/json", "Idempotency-Key": requestKey, "X-Homecook-Quantity-Contract": "quantity-v4" }, body: JSON.stringify(request) }),
    { params: Promise.resolve({ id: pathId }) });
}
const domainRows = () => sql(`select jsonb_build_object(
  'recipes',(select jsonb_agg(to_jsonb(r) order by id) from public.recipes r),
  'ingredients',(select jsonb_agg(to_jsonb(r) order by id) from public.recipe_ingredients r),
  'steps',(select jsonb_agg(to_jsonb(r) order by id) from public.recipe_steps r),
  'meals',(select jsonb_agg(to_jsonb(r) order by id) from public.meals r),
  'nutrition',(select jsonb_agg(to_jsonb(r) order by id) from public.recipe_nutrition_snapshots r),
  'contents',(select jsonb_agg(to_jsonb(r) order by id) from public.recipe_content_snapshots r),
  'previews',(select jsonb_agg(to_jsonb(r) order by id) from public.recipe_change_previews r),
  'receipts',(select jsonb_agg(to_jsonb(r) order by id) from public.mutation_idempotency_keys r));`);
function concurrentSql(statement: string) {
  own();
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve,reject) => {
    const child=spawn("docker",["exec","-i",cid,"psql","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],{ env });
    let stdout="",stderr="";child.stdout.on("data",x=>{stdout+=x;});child.stderr.on("data",x=>{stderr+=x;});
    child.once("error",reject);child.once("close",code=>resolve({code,stdout,stderr}));child.stdin.end(statement);
  });
}

describe.runIf(enabled)("exact HTTP replay on an owned schema228 plus229", () => {
  beforeAll(async () => {
    mkdirSync(output, { recursive: true });
    const archive = readFileSync("/tmp/mumeok-weight-attestation-native-228-schema-only.dump");
    const roles = readFileSync("/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/mumeok-attestation-schema-only-9ow1xrnm/current-roles.sql", "utf8");
    expect(createHash("sha256").update(archive).digest("hex")).toBe("b92a1bc300f66f533c95fc3d05f09aa31e7d88a076cb62d56c4516c592e31ca0");
    expect(createHash("sha256").update(roles).digest("hex")).toBe("a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
    cid = command(["run", "--platform", "linux/arm64", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--label", `${label}=${tag}`,
      "--name", `mumeok-patch-replay-${tag}`, "--entrypoint", "bash", image, "-lc",
      "mkdir -p /tmp/pgsocket /tmp/quantity-pg; initdb -D /tmp/quantity-pg -U supabase_admin --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 --auth-local=trust --auth-host=reject >/tmp/quantity-init.log; exec postgres -D /tmp/quantity-pg -c listen_addresses= -c unix_socket_directories=/tmp/pgsocket -c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault"]);
    evidence.cid = cid;
    for (let attempt = 0; ; attempt++) {
      try { sql("select 1;"); break; } catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    sql(roles.replace(/^CREATE ROLE supabase_admin;\n/m, ""));
    own(); command(["exec", "-i", cid, "pg_restore", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--clean", "--if-exists", "--exit-on-error"], archive);
    evidence.beforeSeed = json(`create temporary table row_counts(n bigint);do $count$ declare t record;n bigint;begin
      for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p')
        and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%'
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') loop
        execute format('select count(*) from %I.%I',t.nspname,t.relname) into n;insert into row_counts values(n);end loop;end $count$;
      select jsonb_build_object('tables',count(*),'rows',sum(n)) from row_counts;`);
    expect(evidence.beforeSeed).toMatchObject({ rows: 0 });
    sql("set session authorization postgres;" + readFileSync(baselineMigration, "utf8"));
    const before = json(inventory);
    evidence.beforeFunctions = before;
    const fixture = readFileSync("tests/sql/recipe-product-only-fixture.sql", "utf8");
    sql("insert into private.recipe_product_only_write_control values(true,true);insert into private.quantity_input_v4_policy values(true,true);");
    sql(fixture + `
      update private.quantity_input_v4_policy set enabled=true;
      update public.ingredients set standard_name='제품 라벨' where id='${milk}';
      insert into public.ingredients(id,standard_name,category,default_unit) values('${flour}','테스트 밀가루','곡류','g');
      insert into public.nutrition_source_items select (jsonb_populate_record(null::public.nutrition_source_items,to_jsonb(item)||jsonb_build_object(
        'id','78000000-0000-4000-8000-000000000054','external_item_key','flour-fixture','external_name','테스트 밀가루','stable_fingerprint',repeat('f',64)))).*
        from public.nutrition_source_items item where id='78000000-0000-4000-8000-000000000007';
      insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
        values('78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000007','ingredient_source','mass_100g',100,'g',1,'approved','fixture','${owner}',now(),true),
        ('78000000-0000-4000-8000-000000000055','78000000-0000-4000-8000-000000000054','ingredient_source','mass_100g',100,'g',1,'approved','fixture','${owner}',now(),true);
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
        select profile,code,code,case when code='energy_kcal' then 'kcal' when code='sodium_mg' then 'mg' else 'g' end,100,'observed'
          from unnest(array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg']) code,
            unnest(array['78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000055']::uuid[]) profile;
      insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
        values('78000000-0000-4000-8000-000000000052','${milk}','78000000-0000-4000-8000-000000000051','raw-edible','exact_standard_name',true,'approved','fixture','${owner}',now(),1,true,'{"edible_portion_basis":"edible"}'),
        ('78000000-0000-4000-8000-000000000053','${flour}','78000000-0000-4000-8000-000000000055','raw-edible','exact_standard_name',true,'approved','fixture','${owner}',now(),1,true,'{"edible_portion_basis":"edible"}');
      insert into public.nutrition_sources select (jsonb_populate_record(null::public.nutrition_sources,to_jsonb(source)||jsonb_build_object(
        'id','78000000-0000-4000-8000-000000000056','provider_code','nutrition-fixture','dataset_name','Nutrition synthetic','source_version','1',
        'data_basis_date',null,'license_name','test','source_url','https://example.test/nutrition'))).*
        from public.nutrition_sources source where id='78000000-0000-4000-8000-000000000006';
      insert into public.nutrition_sources select (jsonb_populate_record(null::public.nutrition_sources,to_jsonb(source)||jsonb_build_object(
        'id','78000000-0000-4000-8000-000000000057','provider_code','fixture','dataset_name','synthetic','source_version','1','source_kind','measurement_reference',
        'data_basis_date',null,'license_name','test','source_url','https://example.test/unit'))).*
        from public.nutrition_sources source where id='78000000-0000-4000-8000-000000000006';
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
    const sources = [{ ingredient_id: milk, amount: 1 / 3, unit: "L", raw: "1/3" }, { ingredient_id: flour, amount: 1 / 7, unit: "kg", raw: "1/7" }];
    body = { title: "분수 영양 계약 fixture", base_servings: 2, ingredients: sources.map((row, index) => ({
      ingredient_id: row.ingredient_id, standard_name: index === 0 ? "테스트 우유" : "테스트 밀가루", amount: row.amount, unit: row.unit,
      ingredient_type: "QUANT", scalable: true, sort_order: index, quantity_input: { schema_version: "quantity-v4", raw_value: row.raw, raw_unit: row.unit,
        expected_context_sha256: json(`select to_jsonb(private.recipe_quantity_context_hash_v4('${row.ingredient_id}',null,null));`) } })),
      steps: [{ step_number: 1, instruction: "분수를 유지하고 섞어요.", cooking_method_id: method, ingredients_used: [] }] };
    hooks.route.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner, created_at: "2026-01-01T00:00:00Z" } } }) }, from: (table: string) => new NativeQuery(table, "authenticated") });
    hooks.internal.mockReturnValue({ from: (table: string) => new NativeQuery(table, "service_role"), rpc });
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    await establishReplayFixtures();
  }, 120000);

  afterAll(() => {
    vi.unstubAllEnvs();
    if (cid) { own(); command(["rm", "-f", "-v", cid]); evidence.cleanedOwnFixture = true; }
    if (enabled) writeFileSync(`${output}/native-evidence.json`, JSON.stringify({ ...evidence, calls }, null, 2));
  });

  it("preserves actual receipt RLS/ACL/triggers and old columns, adds only nullable unbound metadata", async () => {
    expect(json(receiptMetadata)).toEqual(receiptBefore);
    expect(receiptBefore).toMatchObject({ rls: true, owner: "postgres", policies: [], triggers: [] });
    const ids = oldReceipts.map(r => literal(r.id)).join(",");
    expect(json(`select jsonb_agg(to_jsonb(r)-'recipe_future_http_request_fingerprint' order by id) from public.mutation_idempotency_keys r where id=any(array[${ids}]::uuid[]);`)).toEqual(oldReceipts);
    expect(json(`select count(*) from public.mutation_idempotency_keys where id=any(array[${ids}]::uuid[]) and recipe_future_http_request_fingerprint is not null;`)).toBe(0);
    expect(json(`select jsonb_build_object('nullable',not attnotnull,'hasDefault',atthasdef,'type',format_type(atttypid,atttypmod)) from pg_attribute where attrelid='public.mutation_idempotency_keys'::regclass and attname='recipe_future_http_request_fingerprint';`)).toEqual({ nullable: true, hasDefault: false, type: "text" });
    expect(await checkedRpc("write_recipe_future_plan_change", legacyPrepared)).toEqual(legacyResult);
    const denied = await rpc("read_recipe_future_patch_result", { ...readerArgs(), p_recipe_id: legacyPrepared.p_recipe_id,
      p_request_body: { base_recipe_revision: legacyPrepared.p_base_recipe_revision, draft: legacyPrepared.p_draft, future_plan_strategy: legacyPrepared.p_future_plan_strategy,
        impact_token: legacyPrepared.p_impact_token, image_object_id: null }, p_idempotency_key: legacyPrepared.p_idempotency_key });
    expect(denied.error?.message).toContain("IDEMPOTENCY_KEY_REUSED");
  });

  it("preserves the exact original writer and predecessor alias metadata without new overloads", () => {
    const after = json(inventory) as Array<Record<string, unknown>>;
    const before = evidence.beforeFunctions as Array<Record<string, unknown>>;
    const old = before.find(x => String(x.signature).startsWith("write_recipe_future_plan_change("));
    expect(after.find(x => x.signature === old?.signature)).toEqual(old);
    const outer = before.find(x => x.signature === "private.verify_full_local_internal_scope()");
    const alias = after.find(x => x.signature === "private.verify_scope_pre_recipe_future_http_replay_20261014()");
    for (const key of ["owner", "acl", "configuration", "securityDefiner", "volatility", "sourceHash"]) expect(alias?.[key]).toEqual(outer?.[key]);
    for (const existing of before.filter(x => x !== outer)) expect(after.find(x => x.signature === existing.signature)).toEqual(existing);
    expect(after.filter(x => String(x.signature).startsWith("write_recipe_future_plan_change("))).toHaveLength(1);
    for (const prefix of ["read_recipe_future_patch_result(","write_recipe_future_plan_change_recoverable("]) {
      const functions = after.filter(x => String(x.signature).startsWith(prefix));
      expect(functions).toHaveLength(1);
      expect(functions[0]).toMatchObject({ owner:"postgres",acl:["postgres=X/postgres","service_role=X/postgres"],
        configuration:["search_path=pg_catalog, public, private, extensions, pg_temp"],securityDefiner:true,volatility:"v" });
    }
    expect(after.find(x => x.signature === "private.recipe_future_http_request_fingerprint(uuid,jsonb,text)"))
      .toMatchObject({ owner:"postgres",acl:["postgres=X/postgres"],
        configuration:["search_path=pg_catalog, public, private, extensions, pg_temp"],securityDefiner:true,volatility:"i" });
    evidence.afterFunctions = after;
  });

  it("executes actual HTTP prepare/writer once, then returns the exact result after revision/preview consumption", async () => {
    const planBefore=json("select to_jsonb(m) from public.meals m where id='79000000-0000-4000-8000-000000000081';");
    const first = await httpPatch(); expect(first.status, JSON.stringify(await first.clone().json())).toBe(200);
    const value = await first.json(); const stable = domainRows(); const before = calls.length;
    const replay = await httpPatch(); expect(replay.status, JSON.stringify(await replay.clone().json())).toBe(200); expect(await replay.json()).toEqual(value);
    expect(domainRows()).toBe(stable); expect(calls.slice(before).filter(x => x.kind === "rpc").map(x => x.name)).toEqual(["read_recipe_future_patch_result"]);
    expect(json(`select revision from public.recipes where id='${recipeId}';`)).toBe(2);
    const planAfter=json("select to_jsonb(m) from public.meals m where id='79000000-0000-4000-8000-000000000081';");
    expect(planAfter.recipe_content_snapshot_id).not.toBe(planBefore.recipe_content_snapshot_id);
    expect(planAfter.revision).toBe(planBefore.revision+1);
    expect(json(`select to_jsonb(calculation_version) from public.recipe_nutrition_snapshots where recipe_id='${recipeId}' and is_current;`)).toBe("recipe-nutrition-v4");
    expect(json(`select count(*) from public.mutation_idempotency_keys where operation_scope='recipe_future_patch' and recipe_future_http_request_fingerprint is not null;`)).toBe(1);
    evidence.httpSuccess = value;
  }, 30000);

  it("keeps succeeded attempts/leases absent and bound request identity exact", async () => {
    for (const assignment of ["attempt_token=gen_random_uuid()", "lease_expires_at=clock_timestamp()+interval '1 minute'", "terminal_result=null", "durable_result='{}'::jsonb",
      "recipe_future_http_request_fingerprint=null", "result_reference=gen_random_uuid()", "state='cancelled'",
      "state='in_progress',attempt_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '1 minute'",
      "durable_result=jsonb_set(durable_result,'{data,revision}','0')", "durable_result=jsonb_set(durable_result,'{data,id}',to_jsonb(gen_random_uuid()))"]) {
      expect(() => sql(`begin;update public.mutation_idempotency_keys set ${assignment} where operation_scope='recipe_future_patch' and recipe_future_http_request_fingerprint is not null;
        ${transaction(rpcStatement("read_recipe_future_patch_result",readerArgs()),"service_role","/rpc/read_recipe_future_patch_result").replace(/^begin;/, "")}`)).toThrow(/IDEMPOTENCY_KEY_REUSED/);
    }
  });

  it("preserves original prepared-hash rejection and does not rebind legacy NULL receipts", async () => {
    const prior = domainRows();
    const changed = await rpc("write_recipe_future_plan_change", { ...legacyPrepared, p_nutrition_snapshot: {
      ...unwrap(legacyPrepared.p_nutrition_snapshot), warnings: ["changed-prepared-only"] } });
    expect(changed.error?.message).toContain("IDEMPOTENCY_KEY_REUSED"); expect(domainRows()).toBe(prior);
  });

  it.each(["base_recipe_revision", "title", "description", "base_servings", "amount", "raw_value", "expected_context_sha256", "row_key", "source_kind",
    "food_product_nutrition_version_id", "unit", "instruction", "ingredients_used", "ingredient_order", "future_plan_strategy", "impact_token", "image_object_id"])(
    "rejects same-key changed original field %s before preparing/writing", async field => {
      const changed = structuredClone(firstRequest); const draft = unwrap(changed.draft);
      const ingredients = draft.ingredients; const steps = draft.steps;
      if (!Array.isArray(ingredients) || !Array.isArray(steps)) throw Error("Fixture draft arrays missing");
      const row = unwrap(ingredients[0]); const step = unwrap(steps[0]);
      if (field === "base_recipe_revision") changed[field] = 2;
      else if (["title","description"].includes(field)) draft[field] = "changed";
      else if (field === "base_servings") draft[field] = 3;
      else if (field === "amount") row[field] = .5;
      else if (["raw_value","expected_context_sha256"].includes(field)) unwrap(row.quantity_input)[field] = field === "raw_value" ? "2/6" : "f".repeat(64);
      else if (field === "row_key" || field === "food_product_nutrition_version_id") row[field] = randomUUID();
      else if (field === "source_kind") row[field] = "food_product";
      else if (field === "unit") row[field] = "g";
      else if (field === "instruction") step[field] = "원문 변경";
      else if (field === "ingredients_used") step[field] = [String(row.row_key)];
      else if (field === "ingredient_order") draft.ingredients = [...ingredients].reverse();
      else if (field === "future_plan_strategy") changed[field] = "keep";
      else if (field === "impact_token") changed[field] = "other-preview";
      else changed[field] = randomUUID();
      const stable = domainRows(); const response = await rpc("read_recipe_future_patch_result",readerArgs(changed));
      expect(response.error?.message).toContain("IDEMPOTENCY_KEY_REUSED"); expect(domainRows()).toBe(stable);
    });

  it("keeps quantity header identity distinct and normalizes JSON object order/numeric scale only", async () => {
    expect((await rpc("read_recipe_future_patch_result",{ ...readerArgs(),p_quantity_contract:null })).error?.message).toContain("IDEMPOTENCY_KEY_REUSED");
    const original = literal(JSON.stringify(firstRequest));
    const reordered = { ...Object.fromEntries(Object.entries(firstRequest).reverse()), draft: Object.fromEntries(Object.entries(unwrap(firstRequest.draft)).reverse()) };
    expect(await checkedRpc("read_recipe_future_patch_result",readerArgs(reordered))).toMatchObject({ state:"succeeded" });
    expect(json(`select to_jsonb(private.recipe_future_http_request_fingerprint('${recipeId}',${original}::jsonb,'quantity-v4')=
      private.recipe_future_http_request_fingerprint('${recipeId}',jsonb_set(${original}::jsonb,'{draft,base_servings}','2.000'::jsonb),'quantity-v4'));`)).toBe(true);
  });

  it("uses current authority/resource and keeps the existing capability singleton protection", () => {
    for (const [mutation,expected] of [
      ["update public.user_session_generation_bindings set binding_state='revoked' where session_key_hash=repeat('7',64)",/ACCOUNT_SESSION_STALE/],
      ["delete from public.account_generation_capability_state",/account generation capability singleton cannot be deleted/],
      [`update public.recipes set deleted_at=clock_timestamp() where id='${recipeId}'`,/RESOURCE_NOT_FOUND/],
      [`update public.recipes set visibility='public' where id='${recipeId}'`,/RESOURCE_NOT_FOUND/],
    ] as const) {
      expect(() => sql(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);${mutation};
        ${transaction(rpcStatement("read_recipe_future_patch_result",readerArgs()),"service_role","/rpc/read_recipe_future_patch_result").replace(/^begin;/,"")}`)).toThrow(expected);
    }
  });

  it("keeps current owner, session and generation required and hides another owner's recipe", async () => {
    const other = { ...readerArgs(), p_owner_uuid:"79000000-0000-4000-8000-000000000002",p_session_key_hash:"8".repeat(64) };
    expect((await rpc("read_recipe_future_patch_result",other)).error?.message).toContain("RESOURCE_NOT_FOUND");
    expect((await rpc("read_recipe_future_patch_result",{ ...readerArgs(),p_session_key_hash:"invalid-current-session" })).error?.message).toMatch(/ACCOUNT_SESSION_STALE|VALIDATION_ERROR/);
  });

  it("preserves real RLS rows and denies helper/RPC execute to ordinary roles", () => {
    for (const role of ["anon","authenticated"]) {
      expect(json(transaction("select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.mutation_idempotency_keys r;",role))).toEqual([]);
      expect(() => sql(transaction(rpcStatement("read_recipe_future_patch_result",readerArgs()),role))).toThrow(/permission denied/);
      expect(() => sql(transaction(rpcStatement("write_recipe_future_plan_change_recoverable",{ ...readerArgs(),p_nutrition_snapshot:{},p_nutrition_predecessor_guard:{} }),role))).toThrow(/permission denied/);
    }
    expect(() => sql(transaction(`select private.recipe_future_http_request_fingerprint('${recipeId}',${literal(JSON.stringify(firstRequest))}::jsonb,'quantity-v4');`))).toThrow(/permission denied/);
    evidence.receiptRoleMetadata = json(`select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypass',rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role');`);
  });

  it("requires exactly the two POST scope paths without widening existing RPCs", () => {
    const statement = rpcStatement("read_recipe_future_patch_result",readerArgs());
    for (const [scope,method,path] of [["recipe-other","POST","/rpc/read_recipe_future_patch_result"],
      ["recipe-future-propagation","GET","/rpc/read_recipe_future_patch_result"],
      ["recipe-future-propagation","POST","/rpc/read_manual_recipe_create_result"],
      ["recipe-future-propagation","POST","/rpc/read_recipe_future_patch_result_extra"]]) {
      const wrapped = transaction(statement,"service_role",path).replace('"recipe-future-propagation"',JSON.stringify(scope)).replace("request.method='POST'",`request.method=${literal(method)}`);
      expect(() => sql(wrapped)).toThrow(path === "/rpc/read_manual_recipe_create_result" ? /FORBIDDEN/ : /ACCOUNT_SESSION_STALE/);
    }
  });

  it("rolls the real recipe, plans, snapshots and receipts back if binding is suppressed", async () => {
    const id = await freshRecipe();
    sql(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status) values('${randomUUID()}','${owner}','${id}','2090-01-01','79000000-0000-4000-8000-000000000080',2,'registered');
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
    const data = await prepared(id,"binding rollback"); expect(data.preview.future_meal_count).toBe(1);
    const requestKey = randomUUID(); const stable = domainRows();
    const args = { ...readerArgs(data.request,requestKey,id),p_nutrition_snapshot:data.nutrition.nutritionSnapshot,p_nutrition_predecessor_guard:data.nutrition.predecessorGuard };
    expect(() => sql(`begin;create function pg_temp.suppress_binding() returns trigger language plpgsql as $test$ begin return old;end $test$;
      create trigger fixture_suppress_binding before update of recipe_future_http_request_fingerprint on public.mutation_idempotency_keys for each row execute function pg_temp.suppress_binding();
      ${transaction(rpcStatement("write_recipe_future_plan_change_recoverable",args),"service_role","/rpc/write_recipe_future_plan_change_recoverable").replace(/^begin;/,"")}`)).toThrow(/IDEMPOTENCY_KEY_REUSED/);
    expect(domainRows()).toBe(stable);
    expect(await checkedRpc("read_recipe_future_patch_result",readerArgs(data.request,requestKey,id))).toEqual({ state:"absent",result:null });
  },30000);

  it("rechecks a missing read in the wrapper and ignores fresh prepared values only for exact committed success", async () => {
    const id = await freshRecipe(); const data = await prepared(id,"read/write race"); const requestKey = randomUUID(); const args = readerArgs(data.request,requestKey,id);
    expect(await checkedRpc("read_recipe_future_patch_result",args)).toEqual({ state:"absent",result:null });
    const saved = await checkedRpc("write_recipe_future_plan_change_recoverable",{ ...args,p_nutrition_snapshot:data.nutrition.nutritionSnapshot,p_nutrition_predecessor_guard:data.nutrition.predecessorGuard });
    const stable = domainRows();
    expect(await checkedRpc("write_recipe_future_plan_change_recoverable",{ ...args,p_nutrition_snapshot:{ changed:"after commit" },p_nutrition_predecessor_guard:{} })).toEqual(saved);
    expect(domainRows()).toBe(stable);
  },30000);

  it.each([false,true])("serializes concurrent same-key writes, different body=%s", async different => {
    const id=await freshRecipe();const a=await prepared(id,"concurrent-A");const b=different?await prepared(id,"concurrent-B"):a;const requestKey=randomUUID();
    const run=(data:typeof a)=>concurrentSql(transaction(rpcStatement("write_recipe_future_plan_change_recoverable",{
      ...readerArgs(data.request,requestKey,id),p_nutrition_snapshot:data.nutrition.nutritionSnapshot,p_nutrition_predecessor_guard:data.nutrition.predecessorGuard,
    }),"service_role","/rpc/write_recipe_future_plan_change_recoverable"));
    const responses=await Promise.all([run(a),run(b)]);expect(responses.map(r=>r.code).sort()).toEqual(different?[0,3]:[0,0]);
    if(different)expect(responses.find(r=>r.code!==0)?.stderr).toContain("IDEMPOTENCY_KEY_REUSED");
    else expect(responses[0].stdout.trim()).toBe(responses[1].stdout.trim());
    expect(json(`select revision from public.recipes where id='${id}';`)).toBe(2);
    expect(json(`select count(*) from public.mutation_idempotency_keys where operation_scope='recipe_future_patch' and result_reference='${id}';`)).toBe(1);
    evidence[`concurrent_${different?"different":"same"}`]={codes:responses.map(r=>r.code),revision:2,receipts:1};
  },30000);

  it("allows an exact success read from another currently valid session of the same generation", async () => {
    sql(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      insert into public.user_session_generation_bindings select (jsonb_populate_record(null::public.user_session_generation_bindings,to_jsonb(b)||jsonb_build_object(
        'session_key_hash',repeat('9',64),'session_issued_at','2026-01-03T00:00:00Z','last_token_issued_at','2026-01-03T00:00:00Z'))).*
        from public.user_session_generation_bindings b where session_key_hash=repeat('7',64);
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
    expect(await checkedRpc("read_recipe_future_patch_result",{...readerArgs(),p_session_key_hash:"9".repeat(64),p_session_issued_at:"2026-01-03T00:00:00Z"})).toMatchObject({state:"succeeded",result:evidence.httpSuccess});
  });

  it("accepts exact predecessor metadata and rejects its unknown replacement before migration", () => {
    expect(evidence.predecessorGuard).toEqual({ exactPreimageAccepted:true, changedConfigurationRejected:true });
  });

  it("reads exact success after source change and env/DB OFF while denying new writes", async () => {
    const pendingId = await freshRecipe(); const pending = await prepared(pendingId,"OFF new request");
    sql("update private.quantity_input_v4_policy set enabled=false where singleton;");
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED","false");const stable=domainRows();const before=calls.length;
    const replay=await httpPatch();expect(replay.status,JSON.stringify(await replay.clone().json())).toBe(200);expect(await replay.json()).toEqual(evidence.httpSuccess);
    expect(calls.slice(before).map(x=>x.name)).toEqual(["read_recipe_future_patch_result"]);expect(domainRows()).toBe(stable);
    expect((await httpPatch(firstRequest,randomUUID())).status).toBe(422);
    const response=await rpc("write_recipe_future_plan_change_recoverable",{ ...readerArgs(pending.request,randomUUID(),pendingId),p_nutrition_snapshot:pending.nutrition.nutritionSnapshot,p_nutrition_predecessor_guard:pending.nutrition.predecessorGuard });
    expect(response.error?.message).toMatch(/UNIT_POLICY_INACTIVE|RECIPE_IMPACT_STALE/);expect(domainRows()).toBe(stable);
    sql("update private.quantity_input_v4_policy set enabled=true where singleton;");vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED","true");
    sql("update public.ingredient_nutrition_profiles set review_status='revoked',is_active=false;");
    const afterSource = domainRows(); const sourceReplay = await httpPatch();
    expect(sourceReplay.status).toBe(200);expect(await sourceReplay.json()).toEqual(evidence.httpSuccess);expect(domainRows()).toBe(afterSource);
  },30000);
});
