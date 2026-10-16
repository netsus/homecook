import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mapRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import * as engine from "@/lib/nutrition/recipe-nutrition-calculator";
import { calculateRecipeDraftNutrition, type RecipeDraft, type RecipeDraftNutritionClient } from "@/lib/server/recipe-content-snapshot-future-propagation";

const calculations = vi.spyOn(engine, "calculateRecipeNutrition");
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

vi.mock("@/lib/server/account-generation/profile-subject", () => ({ readProfileAccountGeneration: async () => 1 }));
const enabled = process.env.HOMECOOK_REASON_IDENTITY_NATIVE === "1";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const label = "homecook.recipe-reason-identity-native";
const tag = randomUUID();
const owner = "78000000-0000-4000-8000-000000000001";
const milk = "78000000-0000-4000-8000-000000000002";
const flour = "78000000-0000-4000-8000-000000000050";
const method = "79000000-0000-4000-8000-000000000003";
const key = "78000000-0000-4000-8000-000000000060";
const output = process.env.HOMECOOK_REASON_IDENTITY_OUTPUT ?? "/tmp/mumeok-recipe-reason-identity-evidence";
const migration = "supabase/migrations/20261014225200_recipe_snapshot_reason_identity.sql";
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", DOCKER_HOST: "unix:///var/run/docker.sock" };
let cid = "";
let body: Record<string, unknown>;
let recipeId = "";
let privateId = "";
const requests: Array<{ name: string; args: Record<string, unknown> }> = [];
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
const tables = `select jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,
  'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'columns',(select jsonb_agg(to_jsonb(a) order by attnum) from pg_attribute a where attrelid=c.oid and attnum>0),
  'constraints',(select jsonb_agg(to_jsonb(k) order by oid) from pg_constraint k where conrelid=c.oid),
  'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname))
  order by c.oid::regclass::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth') and c.relkind in ('r','p');`;
const criticalRows = `select encode(sha256(convert_to(jsonb_build_array(
  (select jsonb_agg(to_jsonb(r)) from private.recipe_product_only_write_control r),
  (select jsonb_agg(to_jsonb(r)) from private.cooked_batch_weight_evidence_control r),
  (select jsonb_agg(to_jsonb(r)) from private.quantity_input_v4_policy r),
  (select jsonb_agg(to_jsonb(r)) from private.cooked_weight_user_attestation_control r),
  (select jsonb_agg(to_jsonb(r)) from private.youtube_extraction_current_policy r),
  (select jsonb_agg(to_jsonb(r)) from private.youtube_extraction_worker_credentials r)
  )::text,'UTF8')),'hex');`;

class NativeQuery {
  private columns = "";
  private filters: string[] = [];
  private orderBy: string[] = [];
  private paging = "";
  private single = false;
  constructor(private table: string, private role: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push(`${column}=${literal(value)}`); return this; }
  in(column: string, values: string[]) { this.filters.push(`${column}=any(array[${values.map(literal).join(",")} ]::uuid[])`); return this; }
  order(column: string, options: { ascending: boolean }) { this.orderBy.push(`${column} ${options.ascending ? "asc" : "desc"}`); return this; }
  gte(column: string, value: unknown) { this.filters.push(`${column}>=${literal(value)}`); return this; }
  lte(column: string, value: unknown) { this.filters.push(`${column}<=${literal(value)}`); return this; }
  range(from: number, to: number) { this.paging = `offset ${from} limit ${to - from + 1}`; return this; }
  maybeSingle() { this.single = true; return this; }
  // SELECTs run against the pinned schema; JSON.parse is the psql transport.
  then<TResult1 = { data: ReturnType<typeof JSON.parse>; error: null }, TResult2 = never>(
    resolve?: ((result: { data: ReturnType<typeof JSON.parse>; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((error: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
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
      if (this.table === "meals") {
        expect(this.columns).toBe("id, recipe_id, plan_date, column_id, planned_servings, recipe_content_snapshot_id, recipe_nutrition_snapshot_id, recipe_content_snapshots(recipe_nutrition_snapshot_id,base_servings,ingredients_json)");
        projection = "m.*, (select jsonb_build_object('recipe_nutrition_snapshot_id',s.recipe_nutrition_snapshot_id,'base_servings',s.base_servings,'ingredients_json',s.ingredients_json) from public.recipe_content_snapshots s where s.id=m.recipe_content_snapshot_id) recipe_content_snapshots";
      }
      const query = `select coalesce(jsonb_agg(row),'[]') from (select ${projection} from public.${this.table}${this.table === "meals" ? " m" : ["ingredient_nutrition_profiles", "ingredient_conversion_assignments", "piece_unit_weights"].includes(this.table) ? " link" : ""}
        ${this.filters.length ? `where ${this.filters.join(" and ")}` : ""} ${this.orderBy.length ? `order by ${this.orderBy.join(",")}` : ""} ${this.paging}) row`;
      const data = json(transaction(query, this.role, this.role === "service_role" ? `/${this.table}` : undefined));
      return Promise.resolve({ data: this.single ? data[0] ?? null : data, error: null }).then(resolve, reject);
    } catch (error) { return Promise.reject(error).then(resolve, reject); }
  }
}
function rpc(name: string, args: Record<string, unknown>) {
  calls.push({ kind: "rpc", name });
  requests.push({ name, args: structuredClone(args) });
  const params = Object.entries(args).map(([field, value]) => `${field}=>${value === null ? "null" : typeof value === "object" ? literal(JSON.stringify(value)) + "::jsonb" : typeof value === "number" ? value : literal(value)}`).join(",");
  try { return Promise.resolve({ data: json(transaction(`select to_jsonb(public.${name}(${params}))`, "service_role", `/rpc/${name}`)), error: null }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Native RPC failed";
    evidence.rpcFailures = [...(evidence.rpcFailures as unknown[] ?? []), { name, message }];
    return Promise.resolve({ data: null, error: { message } });
  }
}

describe.runIf(enabled)("personal semantic reason identity on an owned offline DB229 schema", () => {
  beforeAll(async () => {
    mkdirSync(output, { recursive: true });
    const archive = readFileSync("/tmp/mumeok-weight-attestation-native-228-schema-only.dump");
    const roles = readFileSync("/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/mumeok-attestation-schema-only-9ow1xrnm/current-roles.sql", "utf8");
    expect(createHash("sha256").update(archive).digest("hex")).toBe("b92a1bc300f66f533c95fc3d05f09aa31e7d88a076cb62d56c4516c592e31ca0");
    expect(createHash("sha256").update(roles).digest("hex")).toBe("a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
    cid = command(["run", "--platform", "linux/arm64", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--label", `${label}=${tag}`, "--label", `homecook.c04-recipe-schema-probe=${tag.replaceAll("-", "")}`,
      "--name", `mumeok-reason-identity-${tag}`, "--entrypoint", "bash", image, "-lc",
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
    sql("set session authorization postgres;" + readFileSync("supabase/migrations/20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql", "utf8"));
    sql("insert into private.recipe_product_only_write_control values(true,true);insert into private.quantity_input_v4_policy values(true,true);");
    // Run the original rollback-only C04 native suite on the same empty DB229.
    // Its explicit v4 payloads preserve that historical contract independently.
    const legacy = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.product.config.ts", "tests/recipe-quantity-input-postgres.integration.test.ts"], {
      env: { ...env, HOMECOOK_RECIPE_QUANTITY_ISOLATED_PG: "1", HOMECOOK_RECIPE_QUANTITY_TEST_CONTAINER: cid, HOMECOOK_RECIPE_QUANTITY_TEST_TAG: tag.replaceAll("-", "") },
      encoding: "utf8", timeout: 120000,
    });
    writeFileSync(`${output}/legacy-v4-native.log`, legacy.stdout + legacy.stderr);
    expect(legacy.status, legacy.stdout + legacy.stderr).toBe(0);
    expect(json("select count(*) from public.recipes;")).toBe(0);
    evidence.legacyNative = { exitCode: legacy.status, preservedEmptyRecipes: true };
    const before = json(inventory);
    evidence.beforeFunctions = before;
    evidence.criticalBefore = sql(criticalRows);
    for (const name of ["private.recipe_quantity_mode_metadata_v4(uuid)", "public.validate_recipe_nutrition_snapshot_payload(jsonb)", "public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)", "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)"]) {
      writeFileSync(`${output}/before-${name.split("(")[0]}.sql`, Buffer.from(sql(`select encode(convert_to(pg_get_functiondef(${literal(name)}::regprocedure),'UTF8'),'base64');`), "base64"));
    }
    const fixture = readFileSync("tests/sql/recipe-product-only-fixture.sql", "utf8");
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
      update public.ingredients set default_unit='mL' where id='${milk}';
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
    const sources = [{ ingredient_id: milk, amount: 1 / 3, unit: "L", raw: "1/3" }, { ingredient_id: flour, amount: 1 / 7, unit: "kg", raw: "1/7" }];
    body = { title: "분수 영양 계약 fixture", base_servings: 2, ingredients: sources.map((row, index) => ({
      row_key: `78000000-0000-4000-8000-00000000010${index}`, source_kind: "ingredient", ingredient_id: row.ingredient_id, standard_name: index === 0 ? "테스트 우유" : "테스트 밀가루", amount: row.amount, unit: row.unit,
      ingredient_type: "QUANT", scalable: true, sort_order: index, quantity_input: { schema_version: "quantity-v4", raw_value: row.raw, raw_unit: row.unit,
        expected_context_sha256: json(`select to_jsonb(private.recipe_quantity_context_hash_v4('${row.ingredient_id}',null,null));`) } })),
      steps: [{ step_number: 1, instruction: "분수를 유지하고 섞어요.", cooking_method_id: method, ingredients_used: [] }] };
    hooks.route.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, from: (table: string) => new NativeQuery(table, "authenticated") });
    hooks.internal.mockReturnValue({ from: (table: string) => new NativeQuery(table, "service_role"), rpc });
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
  }, 120000);
  afterAll(() => {
    vi.unstubAllEnvs();
    if (cid) { own(); command(["rm", "-f", "-v", cid]); evidence.cleanedOwnFixture = true; }
    if (enabled) writeFileSync(`${output}/native-evidence.json`, JSON.stringify({ ...evidence, calls }, null, 2));
  });

  async function save(requestBody = body, idempotencyKey = key) {
    const { POST } = await import("@/app/api/v1/recipes/route");
    return POST(new Request("http://fixture.invalid/api/v1/recipes", { method: "POST", headers: {
      "content-type": "application/json", "Idempotency-Key": idempotencyKey, "X-Homecook-Draft-Owner": owner, "X-Homecook-Quantity-Contract": "quantity-v4",
    }, body: JSON.stringify(requestBody) }));
  }

  function record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid synthetic ingredient");
    return value as Record<string, unknown>;
  }
  const authority = { p_owner_uuid: owner, p_auth_identity_created_at_snapshot: "2026-01-01T00:00:00Z", p_session_key_hash: "7".repeat(64), p_hmac_key_version: 1, p_session_issued_at: "2026-01-02T00:00:00Z" };
  const client = { from: (table: string) => new NativeQuery(table, "service_role"), rpc } as RecipeDraftNutritionClient;
  async function context(id: string) {
    const result = await rpc("read_recipe_snapshot_entrypoint_context", { ...authority, p_recipe_id: id });
    expect(result.error).toBeNull();
    return result.data.edit_context ?? result.data.fork_context;
  }
  async function clone(id: string, draft?: RecipeDraft) {
    const current = await context(id);
    const response = await save({ origin_recipe_id: id, base_recipe_revision: current.base_recipe_revision, draft: draft ?? current.draft, image_object_id: null }, randomUUID());
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    return (await response.json()).data.id as string;
  }
  async function patch(id: string, draft?: RecipeDraft) {
    const current = await context(id);
    const value = draft ?? current.draft;
    const preview = await rpc("preview_recipe_future_plan_impact", { ...authority, p_recipe_id: id, p_base_recipe_revision: current.base_recipe_revision, p_draft: value });
    expect(preview.error).toBeNull();
    const { PATCH } = await import("@/app/api/v1/recipes/[id]/route");
    return PATCH(new Request(`http://fixture.invalid/api/v1/recipes/${id}`, { method: "PATCH", headers: {
      "content-type": "application/json", "Idempotency-Key": randomUUID(), "X-Homecook-Quantity-Contract": "quantity-v4",
    }, body: JSON.stringify({ base_recipe_revision: current.base_recipe_revision, draft: value, future_plan_strategy: "keep", impact_token: preview.data.data.impact_token, image_object_id: null }) }), { params: Promise.resolve({ id }) });
  }
  async function readFloor(id: string, date: string) {
    const snapshot = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`);
    const mapped = mapRecipeNutritionSnapshot(snapshot);
    expect(mapped).toMatchObject({ calculation_status: "partial", warnings: ["DENSITY_REQUIRED"] });
    const { readRecipeQuantityMode } = await import("@/lib/server/recipe-snapshot-entrypoint");
    const mode = await readRecipeQuantityMode({ client: { rpc }, sessionAuthority: {
      ownerUuid: owner, authIdentityCreatedAt: authority.p_auth_identity_created_at_snapshot, sessionKeyHash: authority.p_session_key_hash,
      hmacKeyVersion: 1, sessionIssuedAt: authority.p_session_issued_at,
    }, recipeId: id, expectedRevision: (await context(id)).base_recipe_revision });
    expect(mode).toBe(true);
    const column = randomUUID();
    sql(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${column}','${owner}','snapshot reader fixture',(select coalesce(max(sort_order),-1)+1 from public.meal_plan_columns where user_id='${owner}'));
      insert into public.meals(id,user_id,recipe_id,column_id,plan_date,planned_servings) values('${randomUUID()}','${owner}','${id}','${column}','${date}',2);
      select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',false);commit;`);
    const { readPlannerRecipeNutritionEntries } = await import("@/lib/server/planner-nutrition-summary");
    const entries = await readPlannerRecipeNutritionEntries({ from: (table: string) => new NativeQuery(table, "authenticated") }, owner, { startDate: date, endDate: date });
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.warnings).toEqual(["DENSITY_REQUIRED"]);
    expect(entries[0].entry.values.energy_kcal.status).toBe("partial");
    return { snapshot, mapped, mode, entries };
  }
  it("reads recipe/planner nutrition and quantity mode on DB229 before applying the exact successor", async () => {
    const created = await save();
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);
    const id = (await created.json()).data.id;
    const floor = await readFloor(id, "2026-10-16");
    evidence.readerFloor229 = floor;
    expect(floor.snapshot.calculation_version).toBe("recipe-nutrition-v4");
    const oldSnapshots = json(`select jsonb_agg(to_jsonb(n) order by id) from public.recipe_nutrition_snapshots n;`);
    evidence.criticalBefore = sql(criticalRows);
    evidence.tablesBefore = json(tables);
    sql("set session authorization postgres;" + readFileSync(migration, "utf8"));
    evidence.afterFunctions = json(inventory);
    evidence.criticalAfter = sql(criticalRows);
    expect(json(tables)).toEqual(evidence.tablesBefore);
    evidence.tablesUnchanged = true;
    evidence.migrationSha256 = createHash("sha256").update(readFileSync(migration)).digest("hex");
    for (const name of ["private.recipe_quantity_mode_metadata_v4(uuid)", "private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb)", "public.validate_recipe_nutrition_snapshot_payload(jsonb)", "public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)", "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)"]) {
      writeFileSync(`${output}/after-${name.split("(")[0]}.sql`, Buffer.from(sql(`select encode(convert_to(pg_get_functiondef(${literal(name)}::regprocedure),'UTF8'),'base64');`), "base64"));
    }
    expect(json(`select jsonb_agg(to_jsonb(n) order by id) from public.recipe_nutrition_snapshots n;`)).toEqual(oldSnapshots);
  }, 30000);
  it("saves manual fractions, publishes, forks, and accepts a same-body PATCH with a new key", async () => {
    const created = await save();
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);
    recipeId = (await created.json()).data.id;
    const fork = await clone(recipeId);
    privateId = fork;
    const prior = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${fork}' and is_current;`);
    const response = await patch(fork);
    const responseBody = await response.json();
    evidence.sameBody = { status: response.status, response: responseBody, prior, calls: requests.filter(item => ["write_personal_recipe_core", "write_recipe_future_plan_change"].includes(item.name)) };
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    expect(json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${fork}' and is_current;`)).toEqual(prior);
    const rowsBefore = json(`select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.recipe_ingredients i where recipe_id='${fork}';`);
    expect((await patch(fork)).status).toBe(200);
    expect(json(`select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.recipe_ingredients i where recipe_id='${fork}';`)).toEqual(rowsBefore);
    const calculation = await calculateRecipeDraftNutrition(client, { recipeId: fork, baseRecipeRevision: (await context(fork)).base_recipe_revision, draft: (await context(fork)).draft, ownerUserId: owner, quantityMode: true });
    const calculated = calculations.mock.results.at(-1)!.value;
    expect(calculated.calculation_version).toBe("recipe-nutrition-v4");
    expect(calculation.nutritionSnapshot).toEqual({ calculation_version: "recipe-nutrition-v5", scalable_values: calculated.scalable_values,
      fixed_values: calculated.fixed_values, nutrient_status: calculated.values, calculation_status: calculated.calculation_status,
      calculation_quality: calculated.calculation_quality, reflected_ingredient_count: calculated.reflected_ingredient_count,
      target_ingredient_count: calculated.target_ingredient_count, missing_reasons: calculated.missing_reasons, warnings: calculated.warnings, sources: calculated.sources });
    expect(calculation.nutritionSnapshot).not.toHaveProperty("input_hash");
    expect(calculation.nutritionSnapshot.nutrient_status).toEqual(prior.nutrient_status_json);
    expect(calculation.nutritionSnapshot.warnings).toEqual(prior.warnings_json);
    expect(prior.missing_reasons).toEqual([expect.stringMatching(/^DENSITY_REQUIRED:row-v1-[a-f0-9]{64}$/)]);
    expect(json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${recipeId}' and is_current;`).calculation_version).toBe("recipe-nutrition-v4");
  }, 30000);
  it("changes four exact definitions, adds one inaccessible helper and preserves every existing authority/critical setting", () => {
    const before = evidence.beforeFunctions as Array<Record<string, unknown>>;
    const after = evidence.afterFunctions as Array<Record<string, unknown>>;
    const changes = after.filter(row => JSON.stringify(row) !== JSON.stringify(before.find(prior => prior.signature === row.signature)));
    expect(changes.map(row => String(row.signature).split("(")[0]).sort()).toEqual([
      "private.map_recipe_nutrition_reasons_v5", "private.recipe_quantity_mode_metadata_v4", "validate_recipe_nutrition_snapshot_payload", "write_personal_recipe_core", "write_recipe_nutrition_snapshot",
    ]);
    for (const row of changes) {
      const prior = before.find(item => item.signature === row.signature);
      if (prior) for (const field of ["owner", "acl", "configuration", "securityDefiner", "volatility"]) expect(row[field]).toEqual(prior[field]);
    }
    expect(evidence.criticalAfter).toBe(evidence.criticalBefore);
    expect(json(`select to_jsonb(bool_and(not has_function_privilege(role,'private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb)','EXECUTE'))) from unnest(array['anon','authenticated','service_role']) role;`)).toBe(true);
    expect(() => sql("set session authorization postgres;" + readFileSync(migration, "utf8"))).toThrow();
    expect(json(inventory)).toEqual(after);
    evidence.changedFunctions = changes;
  });
  it("uses the unchanged recipe/planner readers and signed quantity-mode reader on v5 rows", async () => {
    evidence.readerFloor230 = await readFloor(privateId, "2026-10-17");
  }, 30000);
  it("retains v5 quantity lineage after the last raw quantity is explicitly retired", async () => {
    const id = await clone(recipeId);
    const current = await context(id);
    const draft = current.draft as RecipeDraft;
    draft.ingredients = draft.ingredients.map(row => ({ ...record(row), amount: null, unit: null, ingredient_type: "TO_TASTE", scalable: false, quantity_input: null }));
    const beforeIds = json(`select jsonb_agg(id order by sort_order,id) from public.recipe_ingredients where recipe_id='${id}';`);
    const response = await patch(id, draft);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(json(`select count(*) from public.recipe_ingredients where recipe_id='${id}' and quantity_input is not null;`)).toBe(0);
    expect(json(`select jsonb_agg(id order by sort_order,id) from public.recipe_ingredients where recipe_id='${id}';`)).toEqual(beforeIds);
    expect(await context(id)).toHaveProperty("draft");
    expect(json(`select private.recipe_quantity_mode_metadata_v4('${id}');`).quantity_policy_version).toBe("quantity-v4");
    expect((await patch(id)).status).toBe(200);
    const snapshot = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`);
    expect(snapshot).toMatchObject({ calculation_version: "recipe-nutrition-v5", calculation_status: "unavailable", target_ingredient_count: 0 });
    expect(snapshot.missing_reasons).toHaveLength(2);
    evidence.lastRawRemoval = { beforeIds, snapshot };
  }, 30000);
  it("reuses the original semantic snapshot after deleting and readding an unmarked legacy generic row", async () => {
    const original = (await context(recipeId)).draft as RecipeDraft;
    const legacy = { ...original, ingredients: original.ingredients.map(row => {
      const value = { ...record(row) };if (value.unit === "L") value.unit = "l";delete value.row_key;delete value.source_kind;delete value.quantity_input;return value;
    }) };
    const id = await clone(recipeId);
    const retired = (await context(id)).draft as RecipeDraft;
    retired.ingredients = retired.ingredients.map(row => ({ ...record(row), amount: null, unit: null, ingredient_type: "TO_TASTE", scalable: false, quantity_input: null }));
    expect((await patch(id, retired)).status).toBe(200);
    const toLegacy = await patch(id, legacy);
    expect(toLegacy.status, JSON.stringify(await toLegacy.clone().json())).toBe(200);
    const prior = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`);
    const priorRows = json(`select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.recipe_ingredients i where recipe_id='${id}';`);
    expect(priorRows.every((row: { source_kind: string | null; quantity_input: unknown }) => row.source_kind === null && row.quantity_input === null)).toBe(true);
    const contentBefore = json(`select jsonb_agg(to_jsonb(s) order by id) from public.recipe_content_snapshots s where recipe_id='${id}';`);
    const removed = { ...legacy, ingredients: legacy.ingredients.slice(1) };
    expect((await patch(id, removed)).status).toBe(200);
    expect(json(`select count(*) from public.recipe_ingredients where recipe_id='${id}' and ingredient_id='${milk}';`)).toBe(0);
    const response = await patch(id, legacy);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const final = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`);
    expect(final).toEqual(prior);
    const afterRows = json(`select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.recipe_ingredients i where recipe_id='${id}';`);
    expect(afterRows[0].id).not.toBe(priorRows[0].id);
    expect(afterRows[1].id).toBe(priorRows[1].id);
    for (const old of contentBefore) expect(json(`select to_jsonb(s) from public.recipe_content_snapshots s where id='${old.id}';`)).toEqual(old);
    evidence.deletionReadd = { prior, final, priorRows, afterRows, contentBefore };
  }, 30000);
  function mapRows(rows: Array<Record<string, unknown>>, reasons: string[], mutateWritten = "") {
    const id = randomUUID();
    return json(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      insert into public.recipes(id,title,source_type,visibility,created_by,base_servings) values('${id}','semantic mapping fixture','manual','private','${owner}',2);
      insert into public.ingredients(id,standard_name,category,default_unit) values('ab000000-0000-4000-8000-000000000002','case fixture','기타','g') on conflict do nothing;
      insert into public.food_product_ingredient_links(product_id,ingredient_id,relation,review_status,is_primary,is_active,source,decision_reason,reviewed_at)
        values('78000000-0000-4000-8000-000000000003','${milk}','represents','approved',true,true,'manual_review','synthetic',now()) on conflict do nothing;
      do $mapping$ declare requested jsonb:=${literal(JSON.stringify(rows))}::jsonb;written jsonb;result jsonb;begin
        written:=private.write_recipe_source_rows('${id}','${owner}',requested,'[]',false);
        ${mutateWritten}
        result:=private.map_recipe_nutrition_reasons_v5('${id}',requested,written,${literal(JSON.stringify(reasons))}::jsonb);
        perform set_config('homecook.mapping_result',jsonb_build_object('reasons',result,'written',written)::text,true);
      end $mapping$;select current_setting('homecook.mapping_result')::jsonb;rollback;`);
  }
  const generic = (component: string, extra: Record<string, unknown> = {}) => ({ ingredient_id: milk, amount: 1, unit: "g", ingredient_type: "QUANT", scalable: true, component_label: component, ...extra });
  const token = (kind: string, source: string, version: string | null, component: string | null) => "row-v1-" + createHash("sha256")
    .update("[" + [kind, source.toLowerCase(), version?.toLowerCase() ?? null, component].map(value => JSON.stringify(value)).join(", ") + "]").digest("hex");
  it("reproduces keyed/fallback aliases from whole-request counts and array indices without changing semantic identity", () => {
    const keyed = "AB000000-0000-4000-8000-000000000001";
    const rows = [generic("소스", { row_key: keyed, sort_order: 50 }), generic("반죽", { sort_order: 88 }), generic("끝", { ingredient_type: "TO_TASTE", amount: null, unit: null, scalable: false })];
    const expected = [`DENSITY_REQUIRED:${token("ingredient", milk, null, "소스")}`, `UNIT_CONVERSION_MISSING:${token("ingredient", milk, null, "반죽")}`, `TO_TASTE_EXCLUDED:${token("ingredient", milk, null, "끝")}`].sort();
    const mapped = mapRows(rows, [`DENSITY_REQUIRED:${keyed}`, `UNIT_CONVERSION_MISSING:${milk}-row-1`, `TO_TASTE_EXCLUDED:${milk}-row-2`]);
    expect(mapped.reasons).toEqual(expected);
    const reverse = rows.toReversed().map(row => ({ ...row }));
    const reordered = mapRows(reverse, [`TO_TASTE_EXCLUDED:${milk}-row-0`, `UNIT_CONVERSION_MISSING:${milk}-row-1`, `DENSITY_REQUIRED:${keyed}`]);
    expect(reordered.reasons).toEqual(expected);
    const changedQuantity = mapRows([generic(" 소스 ", { amount: 3, unit: "kg", row_key: randomUUID() })], []);
    expect(changedQuantity.reasons).toEqual([]);
    const single = mapRows([generic(" 소스 ", { amount: 3, unit: "kg" })], [`DENSITY_REQUIRED:${milk}`]);
    expect(single.reasons).toEqual([`DENSITY_REQUIRED:${token("ingredient", milk, null, "소스")}`]);
    const sourceUpper = "AB000000-0000-4000-8000-000000000002";
    const sourceLower = sourceUpper.toLowerCase();
    const cases = mapRows([generic("upper", { ingredient_id: sourceUpper }), generic("lower", { ingredient_id: sourceLower })], [`DENSITY_REQUIRED:${sourceUpper}`, `DENSITY_REQUIRED:${sourceLower}`]);
    expect(cases.reasons).toEqual([`DENSITY_REQUIRED:${token("ingredient", sourceLower, null, "upper")}`, `DENSITY_REQUIRED:${token("ingredient", sourceLower, null, "lower")}`].sort());
    const many = Array.from({ length: 12 }, (_, index) => generic(`component-${index}`, { sort_order: 100 - index }));
    expect(mapRows(many, [`DENSITY_REQUIRED:${milk}-row-10`]).reasons).toEqual([`DENSITY_REQUIRED:${token("ingredient", milk, null, "component-10")}`]);
    evidence.aliasMapping = { requested: rows, mapped, reordered, expected, cases };
  }, 30000);
  it("distinguishes generic/product/pinned versions/components, including linked products sharing ingredient count keys", () => {
    const product = "78000000-0000-4000-8000-000000000003";
    const version1 = "78000000-0000-4000-8000-000000000004";
    const version2 = "78000000-0000-4000-8000-000000000005";
    const rows = [generic("generic"), generic("linked", { food_product_id: product, food_product_nutrition_version_id: version1 }),
      generic("product-only", { ingredient_id: null, source_kind: "food_product", food_product_id: product, food_product_nutrition_version_id: version2 })];
    const value = mapRows(rows, [`DENSITY_REQUIRED:${milk}-row-0`, `PIECE_WEIGHT_REQUIRED:${milk}-row-1`, `NUTRIENT_VALUE_MISSING:${product}:fiber_g`]);
    expect(value.reasons).toEqual([`DENSITY_REQUIRED:${token("ingredient", milk, null, "generic")}`, `PIECE_WEIGHT_REQUIRED:${token("food_product", product, version1, "linked")}`, `NUTRIENT_VALUE_MISSING:${token("food_product", product, version2, "product-only")}:fiber_g`].sort());
    const oldPin = mapRows([rows[2]], [`NUTRIENT_VALUE_MISSING:${product}:fiber_g`]);
    const newPin = mapRows([{ ...rows[2], food_product_nutrition_version_id: version1 }], [`NUTRIENT_VALUE_MISSING:${product}:fiber_g`]);
    expect(oldPin.reasons).not.toEqual(newPin.reasons);
    evidence.productMapping = value;
  }, 30000);
  it("maps every exact reason and nutrient suffix, rejects malformed/unknown reasons and alias collisions", () => {
    const codes = ["TO_TASTE_EXCLUDED", "PREDECESSOR_NOT_APPROVED", "NUTRITION_PROFILE_MISSING", "INVALID_QUANTITY", "UNIT_CONVERSION_MISSING", "PIECE_WEIGHT_REQUIRED", "UNIT_DEFINITION_REQUIRED", "UNIT_DEFINITION_CONFLICT", "PIECE_IDENTITY_REQUIRED", "DENSITY_REQUIRED", "AMBIGUOUS_EVIDENCE"];
    const nutrients = ["energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg", "sugars_g", "saturated_fat_g", "fiber_g"];
    const all = [...codes.map(code => `${code}:${milk}`), ...nutrients.map(code => `NUTRIENT_VALUE_MISSING:${milk}:${code}`)];
    expect(mapRows([generic("all")], all).reasons).toEqual(all.map(reason => reason.replace(milk, token("ingredient", milk, null, "all"))).sort());
    for (const bad of ["DENSITY_REQUIRED", "UNKNOWN:" + milk, "DENSITY_REQUIRED:", "DENSITY_REQUIRED:" + flour, "DENSITY_REQUIRED:" + milk + ":extra", "NUTRIENT_VALUE_MISSING:" + milk + ":unknown", "UNIT_MEASUREMENT_ESTIMATE_USED:" + milk]) {
      expect(() => mapRows([generic("bad")], [bad]), bad).toThrow("INVALID_SNAPSHOT_REASON_IDENTITY");
    }
    expect(() => mapRows([generic("duplicate")], [`DENSITY_REQUIRED:${milk}`, `DENSITY_REQUIRED:${milk}`])).toThrow("INVALID_SNAPSHOT_REASON_IDENTITY");
    expect(() => mapRows([generic("key", { row_key: flour }), { ...generic("fallback"), ingredient_id: flour }], [`DENSITY_REQUIRED:${flour}`])).toThrow("INVALID_SNAPSHOT_REASON_IDENTITY");
  }, 30000);
  it("rejects missing/duplicate/foreign/reordered written rows and altered source/version/value mappings", () => {
    const rows = [generic("one"), { ...generic("two"), ingredient_id: flour }];
    for (const mutate of [
      "written:=jsonb_set(written,'{ingredients}',written->'ingredients'->0||'[]'::jsonb);",
      "written:=jsonb_set(written,'{ingredients,1}',written->'ingredients'->0);",
      `written:=jsonb_set(written,'{ingredients,0,row_key}',to_jsonb('${randomUUID()}'::text));`,
      "written:=jsonb_set(written,'{ingredients,0,row_key}',to_jsonb('78000000-0000-4000-8000-000000000011'::text));",
      "written:=jsonb_set(written,'{ingredients}',jsonb_build_array(written->'ingredients'->1,written->'ingredients'->0));",
      `written:=jsonb_set(written,'{ingredients,0,ingredient_id}',to_jsonb('${flour}'::text));`,
      "written:=jsonb_set(written,'{ingredients,0,amount}','2');",
      `written:=jsonb_set(written,'{ingredients,0,unit}','"L"');`,
      `written:=jsonb_set(written,'{ingredients,0,component_label}','"wrong"');`,
      `written:=jsonb_set(written,'{ingredients,0,food_product_nutrition_version_id}',to_jsonb('${randomUUID()}'::text));`,
    ]) expect(() => mapRows(rows, [`DENSITY_REQUIRED:${milk}`], mutate), mutate).toThrow("INVALID_SNAPSHOT_REASON_IDENTITY");
  }, 30000);
  it("keeps legacy v4 writes unchanged, including their original strict same-content identity rejection", async () => {
    const current = await context(recipeId);
    const prepared = await calculateRecipeDraftNutrition(client, { recipeId, baseRecipeRevision: current.base_recipe_revision, draft: current.draft, ownerUserId: owner, quantityMode: true });
    const fork = await rpc("write_personal_recipe_core", { ...authority, p_operation: "fork", p_recipe_id: null, p_source_recipe_id: recipeId,
      p_base_recipe_revision: current.base_recipe_revision, p_draft: current.draft, p_nutrition_snapshot: { ...prepared.nutritionSnapshot, calculation_version: "recipe-nutrition-v4" }, p_tags: [], p_image_object_id: null, p_expected_cleanup_generation: null, p_idempotency_key: randomUUID() });
    expect(fork.error).toBeNull();
    const id = fork.data.data.id;
    const next = await context(id);
    const preparedNext = await calculateRecipeDraftNutrition(client, { recipeId: id, baseRecipeRevision: next.base_recipe_revision, draft: next.draft, ownerUserId: owner, quantityMode: true });
    const before = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`);
    const result = await rpc("write_personal_recipe_core", { ...authority, p_operation: "update", p_recipe_id: id, p_source_recipe_id: null,
      p_base_recipe_revision: next.base_recipe_revision, p_draft: next.draft, p_nutrition_snapshot: { ...preparedNext.nutritionSnapshot, calculation_version: "recipe-nutrition-v4" }, p_tags: [], p_image_object_id: null, p_expected_cleanup_generation: null, p_idempotency_key: randomUUID() });
    expect(result.error?.message).toContain("SNAPSHOT_IDENTITY_COLLISION");
    expect(json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${id}' and is_current;`)).toEqual(before);
    evidence.legacyV4 = { before, error: result.error };
  }, 30000);
  it("enforces semantic refs at the direct snapshot writer and keeps immutable comparisons strict", () => {
    const row = json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where recipe_id='${privateId}' and is_current;`);
    const payload = { base_servings: row.base_servings, input_hash: row.input_hash, calculation_version: row.calculation_version,
      scalable_values: row.scalable_values_json, fixed_values: row.fixed_values_json, nutrient_status: row.nutrient_status_json,
      calculation_status: row.calculation_status, calculation_quality: row.calculation_quality,
      reflected_ingredient_count: row.reflected_ingredient_count, target_ingredient_count: row.target_ingredient_count,
      missing_reasons: row.missing_reasons, warnings: row.warnings_json, sources: row.sources_json, calculated_at: row.calculated_at };
    const write = (value: typeof payload) => sql(transaction(`select public.write_recipe_nutrition_snapshot('${privateId}',${literal(JSON.stringify(value))}::jsonb,
      (select updated_at from public.recipes where id='${privateId}'),private.recipe_quantity_guard_v4(public.build_recipe_nutrition_input_guard('${privateId}'),'${privateId}'))`, "postgres"));
    expect(() => write(payload)).not.toThrow();
    const valid = payload.missing_reasons[0] as string;
    for (const reasons of [[`DENSITY_REQUIRED:${milk}`], [valid, valid], [valid.toUpperCase()], [valid.slice(0, -1)], [valid + ":extra"]]) {
      expect(() => write({ ...payload, missing_reasons: reasons })).toThrow("INVALID_SNAPSHOT_PAYLOAD");
      expect(json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where id='${row.id}';`)).toEqual(row);
    }
    const changed = structuredClone(payload);
    changed.scalable_values.energy_kcal += 1;
    changed.nutrient_status.energy_kcal.known_amount += 1;
    expect(() => write(changed)).toThrow("SNAPSHOT_IDENTITY_COLLISION");
    expect(json(`select to_jsonb(n) from public.recipe_nutrition_snapshots n where id='${row.id}';`)).toEqual(row);
  }, 30000);
  it("preserves every legacy UUID report version alongside exact v5 semantic causes without running the operational entrypoint", () => {
    const source = readFileSync("scripts/generate-nutrition-review-html.mjs", "utf8");
    const match = source.match(/const REVIEW_SQL = `([\s\S]*?)`;/);
    expect(match).not.toBeNull();
    const fixtures = ["recipe-nutrition-v1", "recipe-nutrition-v2", "recipe-nutrition-v3", "recipe-nutrition-v4", "legacy-reviewed-contract"].map(version => ({
      version, recipe: randomUUID(), ingredient: randomUUID(), row: randomUUID(),
      ...(version === "recipe-nutrition-v4" ? { source_recipe: randomUUID(), source_row: randomUUID() } : {}),
    }));
    // Each historical version crosses the real current validator/writer. This
    // synthetic transaction supplies only missing-profile facts and rolls back.
    const result = json(`begin;select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
      do $legacy_report$ declare item jsonb;unknown_values jsonb:='{}';code text;guard jsonb;h text;payload jsonb;begin
        foreach code in array array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg'] loop
          unknown_values:=unknown_values||jsonb_build_object(code,jsonb_build_object('amount',null,'known_amount',null,'status','unavailable','display_mode',null));
        end loop;
        for item in select value from jsonb_array_elements(${literal(JSON.stringify(fixtures))}::jsonb) loop
          insert into public.ingredients(id,standard_name,category,default_unit) values((item->>'ingredient')::uuid,'legacy report '||(item->>'version'),'기타','g');
          insert into public.recipes(id,title,source_type,visibility,created_by,base_servings) values((item->>'recipe')::uuid,'legacy report','manual','private','${owner}',1);
          insert into public.recipe_ingredients(id,recipe_id,ingredient_id,amount,unit,ingredient_type,scalable,sort_order)
            values((item->>'row')::uuid,(item->>'recipe')::uuid,(item->>'ingredient')::uuid,1,'g','QUANT',true,0);
          if item ? 'source_recipe' then
            insert into public.recipes(id,title,source_type,visibility,created_by,base_servings) values((item->>'source_recipe')::uuid,'legacy source row','manual','private','${owner}',1);
            insert into public.recipe_ingredients(id,recipe_id,ingredient_id,amount,unit,ingredient_type,scalable,sort_order)
              values((item->>'source_row')::uuid,(item->>'source_recipe')::uuid,(item->>'ingredient')::uuid,1,'g','QUANT',true,0);
          end if;
          guard:=public.build_recipe_nutrition_input_guard((item->>'recipe')::uuid);
          if item->>'version'='recipe-nutrition-v4' then guard:=private.recipe_quantity_guard_v4(guard,(item->>'recipe')::uuid);end if;
          select content_hash into h from public.build_recipe_content_snapshot_input((item->>'recipe')::uuid);
          payload:=jsonb_build_object('base_servings',1,'input_hash',h,'calculation_version',item->>'version',
            'calculation_status','unavailable','calculation_quality',null,'scalable_values','{}'::jsonb,'fixed_values','{}'::jsonb,
            'nutrient_status',unknown_values,'target_ingredient_count',1,'reflected_ingredient_count',0,
            'missing_reasons',jsonb_build_array('NUTRITION_PROFILE_MISSING:'||coalesce(item->>'source_row',item->>'row')),
            'warnings',jsonb_build_array('NUTRITION_PROFILE_MISSING'),'sources','[]'::jsonb,'calculated_at',now());
          perform public.write_recipe_nutrition_snapshot((item->>'recipe')::uuid,payload,
            (select updated_at from public.recipes where id=(item->>'recipe')::uuid),guard);
        end loop;
      end $legacy_report$;${match![1]};rollback;`);
    expect(result.rows.find((row: { ingredient_id: string }) => row.ingredient_id === milk)?.issue_codes).toContain("DENSITY_REQUIRED");
    for (const fixture of fixtures) expect(result.rows.find((row: { ingredient_id: string }) => row.ingredient_id === fixture.ingredient)?.issue_codes, fixture.version).toContain("NUTRITION_PROFILE_MISSING");
    evidence.reviewSelect = { result, legacyVersions: fixtures.map(row => row.version), legacyCrossRecipe: fixtures.find(row => row.version === "recipe-nutrition-v4") };
  });
  it("preserves exact core receipt replay and owner/revision fences", async () => {
    const original = requests.find(item => item.name === "write_personal_recipe_core")!;
    const before = json(`select jsonb_build_object('recipes',(select count(*) from public.recipes),'snapshots',(select count(*) from public.recipe_nutrition_snapshots));`);
    const replay = await rpc(original.name, original.args);
    expect(replay.error).toBeNull();
    const repeated = await rpc(original.name, original.args);
    expect(repeated).toEqual(replay);
    const wrongOwner = await rpc(original.name, { ...original.args, p_owner_uuid: "79000000-0000-4000-8000-000000000002", p_idempotency_key: randomUUID() });
    expect(wrongOwner.error).not.toBeNull();
    expect(json(`select jsonb_build_object('recipes',(select count(*) from public.recipes),'snapshots',(select count(*) from public.recipe_nutrition_snapshots));`)).toEqual(before);
    evidence.coreReplay = { result: replay.data, wrongOwnerRejected: true };
  }, 30000);
  it("serializes concurrent identical v5 core writes through the existing owner/recipe locks", async () => {
    const current = await context(privateId);
    const prepared = await calculateRecipeDraftNutrition(client, { recipeId: privateId, baseRecipeRevision: current.base_recipe_revision, draft: current.draft, ownerUserId: owner, quantityMode: true });
    const args = { ...authority, p_operation: "update", p_recipe_id: privateId, p_source_recipe_id: null, p_base_recipe_revision: current.base_recipe_revision,
      p_draft: current.draft, p_nutrition_snapshot: prepared.nutritionSnapshot, p_tags: [], p_image_object_id: null, p_expected_cleanup_generation: null, p_idempotency_key: randomUUID() };
    const params = Object.entries(args).map(([name, value]) => `${name}=>${value === null ? "null" : typeof value === "object" ? literal(JSON.stringify(value)) + "::jsonb" : typeof value === "number" ? value : literal(value)}`).join(",");
    const statement = transaction(`select to_jsonb(public.write_personal_recipe_core(${params}))`, "service_role", "/rpc/write_personal_recipe_core");
    const run = () => new Promise<string>((resolve, reject) => {
      own();
      const child = spawn("docker", ["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], { env });
      let stdout = "";let stderr = "";
      child.stdout.on("data", value => { stdout += value; });child.stderr.on("data", value => { stderr += value; });
      child.on("error", reject);child.on("close", status => status === 0 ? resolve(stdout.trim().split("\n").filter(Boolean).at(-1)!) : reject(new Error(stderr)));
      child.stdin.end(statement);
    });
    const [a, b] = await Promise.all([run(), run()]);
    expect(JSON.parse(a)).toEqual(JSON.parse(b));
    expect((await context(privateId)).base_recipe_revision).toBe(current.base_recipe_revision + 1);
    evidence.concurrent = { resultsEqual: true, revisionBefore: current.base_recipe_revision, revisionAfter: current.base_recipe_revision + 1 };
  }, 30000);
  it("preserves a NULL written marker when the existing step mapper promotes the actual generic target row", () => {
    const keyA = randomUUID();const keyB = randomUUID();
    const rows = [generic("one", { row_key: keyA }), generic("two", { row_key: keyB })];
    const steps = [{ step_number: 1, instruction: "component fixture", ingredients_used: [{ ingredient_id: milk, row_key: keyA, amount: 1, unit: "g", cut_size: null }] }];
    const value = mapRows(rows, [`DENSITY_REQUIRED:${keyA}`, `DENSITY_REQUIRED:${keyB}`],
      `perform private.map_recipe_step_source_rows(${literal(JSON.stringify(steps))}::jsonb,requested,written,'[]','[]');
        if (select source_kind from public.recipe_ingredients where id=(written#>>'{ingredients,0,row_key}')::uuid)<>'ingredient' then raise exception 'STEP_MARKER_NOT_PROMOTED';end if;`);
    expect(value.written.ingredients[0].source_kind).toBeNull();
    expect(value.reasons).toEqual([`DENSITY_REQUIRED:${token("ingredient", milk, null, "one")}`, `DENSITY_REQUIRED:${token("ingredient", milk, null, "two")}`].sort());
  }, 30000);
});
