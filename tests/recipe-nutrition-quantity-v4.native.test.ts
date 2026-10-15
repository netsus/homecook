import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRecipeNutritionSnapshotPayload, mapRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import { calculation, reasons } from "./fixtures/recipe-nutrition-quantity-v4";

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

const enabled = process.env.HOMECOOK_NUTRITION_V4_NATIVE === "1";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const label = "homecook.nutrition-v4-reasons-native";
const tag = randomUUID();
const owner = "78000000-0000-4000-8000-000000000001";
const milk = "78000000-0000-4000-8000-000000000002";
const flour = "78000000-0000-4000-8000-000000000050";
const method = "79000000-0000-4000-8000-000000000003";
const key = "78000000-0000-4000-8000-000000000060";
const output = "/tmp/mumeok-nutrition-v4-reasons-evidence";
const migration = "supabase/migrations/20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql";
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

describe.runIf(enabled)("228 to 229 exact quantity-warning contract on an owned offline schema", () => {
  beforeAll(async () => {
    mkdirSync(output, { recursive: true });
    const archive = readFileSync("/tmp/mumeok-weight-attestation-native-228-schema-only.dump");
    const roles = readFileSync("/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/mumeok-attestation-schema-only-9ow1xrnm/current-roles.sql", "utf8");
    expect(createHash("sha256").update(archive).digest("hex")).toBe("b92a1bc300f66f533c95fc3d05f09aa31e7d88a076cb62d56c4516c592e31ca0");
    expect(createHash("sha256").update(roles).digest("hex")).toBe("a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
    cid = command(["run", "--platform", "linux/arm64", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--label", `${label}=${tag}`,
      "--name", `mumeok-nutrition-v4-${tag}`, "--entrypoint", "bash", image, "-lc",
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
    const before = json(inventory);
    evidence.beforeFunctions = before;
    writeFileSync(`${output}/validator-228-preimage.sql`, Buffer.from(sql("select encode(convert_to(pg_get_functiondef('public.validate_recipe_nutrition_snapshot_payload(jsonb)'::regprocedure),'UTF8'),'base64');"), "base64"));
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
  it("reproduces the unmodified 228 SQL rejection through real create/prepare/payload/publication", async () => {
    const response = await save();
    expect(response.status, JSON.stringify({ response: await response.clone().json(), failures: evidence.rpcFailures })).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "RECIPE_PREPARATION_PENDING" } });
    expect(calls.some(call => call.kind === "rpc" && call.name === "publish_manual_recipe")).toBe(true);
    const state = json(`select jsonb_build_object('id',id,'visibility',visibility,'count',(select count(*) from public.recipe_nutrition_snapshots where recipe_id=r.id)) from public.recipes r where title=${literal(body.title)};`);
    expect(state).toMatchObject({ visibility: "private", count: 0 });
    recipeId = state.id;
    evidence.preMigrationFailure = state;
  }, 30000);
  async function legacyRoundTrip(idempotencyKey: string) {
    const response = await save({ ...body, title: `legacy 영양 계약 ${idempotencyKey}`, ingredients: [{ ingredient_id: flour,
      standard_name: "테스트 밀가루", amount: 100, unit: "g", ingredient_type: "QUANT", scalable: true, sort_order: 0 }] }, idempotencyKey);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    const id = (await response.json()).data.id;
    const row = json(`select to_jsonb(s) from public.recipe_nutrition_snapshots s where recipe_id='${id}' and is_current;`);
    expect(row).toMatchObject({ calculation_version: "recipe-nutrition-v3", calculation_status: "complete", warnings_json: [], missing_reasons: [] });
    expect(mapRecipeNutritionSnapshot(row)).toMatchObject({ calculation_status: "complete", warnings: [] });
    return { version: row.calculation_version, status: row.calculation_status, warnings: row.warnings_json };
  }
  it("keeps the reader-first release compatible with a real legacy save on DB228", async () => {
    evidence.legacy228RoundTrip = await legacyRoundTrip("78000000-0000-4000-8000-000000000072");
  }, 30000);
  it("changes only the existing validator while preserving its full authority metadata", () => {
    const criticalBefore = sql(criticalRows);
    sql("set session authorization postgres;" + readFileSync(migration, "utf8"));
    const after = json(inventory);
    const before = evidence.beforeFunctions as Array<Record<string, unknown>>;
    const changed = after.filter((row: Record<string, unknown>) => JSON.stringify(row) !== JSON.stringify(before.find(previous => previous.signature === row.signature)));
    expect(changed).toHaveLength(1);
    expect(changed[0].signature).toBe("validate_recipe_nutrition_snapshot_payload(jsonb)");
    const prior = before.find(row => row.signature === changed[0].signature)!;
    for (const field of ["owner", "acl", "configuration", "securityDefiner", "volatility"]) expect(changed[0][field]).toEqual(prior[field]);
    evidence.afterFunctions = after;
    evidence.changedFunctions = changed;
    evidence.migrationSha256 = createHash("sha256").update(readFileSync(migration)).digest("hex");
    evidence.criticalRowsBefore = criticalBefore;
    evidence.criticalRowsAfter = sql(criticalRows);
    expect(evidence.criticalRowsAfter).toBe(criticalBefore);
    writeFileSync(`${output}/validator-229-postimage.sql`, Buffer.from(sql("select encode(convert_to(pg_get_functiondef('public.validate_recipe_nutrition_snapshot_payload(jsonb)'::regprocedure),'UTF8'),'base64');"), "base64"));
  });
  it("retries the identical key into a public partial snapshot and reads the same reason without losing raw fractions", async () => {
    const before = json(`select jsonb_agg(to_jsonb(i) order by id) from public.recipe_ingredients i where recipe_id='${recipeId}';`);
    const response = await save();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    expect((await response.json()).data.id).toBe(recipeId);
    const row = json(`select to_jsonb(s) from public.recipe_nutrition_snapshots s where recipe_id='${recipeId}' and is_current;`);
    expect(row).toMatchObject({ calculation_version: "recipe-nutrition-v4", calculation_status: "partial", warnings_json: ["DENSITY_REQUIRED"], reflected_ingredient_count: 1, target_ingredient_count: 2 });
    expect(row.missing_reasons).toHaveLength(1);
    expect(row.missing_reasons[0]).toMatch(/^DENSITY_REQUIRED:/);
    expect(mapRecipeNutritionSnapshot(row)).toMatchObject({ warnings: ["DENSITY_REQUIRED"], calculation_status: "partial", values: row.nutrient_status_json });
    expect(json(`select jsonb_agg(to_jsonb(i) order by id) from public.recipe_ingredients i where recipe_id='${recipeId}';`)).toEqual(before);
    expect(json(`select count(*) from public.recipes where title=${literal(body.title)};`)).toBe(1);
    expect((await save()).status).toBe(201);
    expect(json(`select count(*) from public.recipe_nutrition_snapshots where recipe_id='${recipeId}';`)).toBe(1);
    evidence.published = { id: recipeId, calculation_status: row.calculation_status, warnings: row.warnings_json, rawFractions: before.map((item: { quantity_input: { raw_value: string } }) => item.quantity_input.raw_value) };
  }, 30000);
  it.each([...reasons, "UNIT_MEASUREMENT_ESTIMATE_USED"] as const)("keeps native SQL and JS version/quality decisions aligned for %s", reason => {
    const payload = createRecipeNutritionSnapshotPayload(calculation(reason));
    const validate = (value: unknown) => sql(transaction(`select public.validate_recipe_nutrition_snapshot_payload(${literal(JSON.stringify(value))}::jsonb)`));
    expect(() => validate(payload)).not.toThrow();
    for (const version of ["recipe-nutrition-v3", "snapshot-projection-v1", "recipe-nutrition-v4-future"]) {
      expect(() => validate({ ...payload, calculation_version: version })).toThrow("INVALID_SNAPSHOT_PAYLOAD");
    }
    expect(() => validate({ ...payload, warnings: [reason + "_EXTRA"] })).toThrow("INVALID_SNAPSHOT_PAYLOAD");
    if (reason === "UNIT_MEASUREMENT_ESTIMATE_USED") {
      expect(() => validate({ ...payload, calculation_quality: "direct" })).toThrow("INVALID_SNAPSHOT_STATUS");
      expect(() => validate({ ...payload, warnings: [] })).toThrow("INVALID_SNAPSHOT_STATUS");
    }
  }, 30000);
  it("keeps a real legacy manual save and stored read on the original v3 contract", async () => {
    evidence.legacy229RoundTrip = await legacyRoundTrip("78000000-0000-4000-8000-000000000071");
  }, 30000);
  it("rejects a changed or already applied validator preimage without further catalog mutations", () => {
    const before = json(inventory);
    expect(() => sql("set session authorization postgres;" + readFileSync(migration, "utf8"))).toThrow("RECIPE_QUANTITY_WARNING_VALIDATOR_ALREADY_CHANGED");
    expect(json(inventory)).toEqual(before);
  });
});
