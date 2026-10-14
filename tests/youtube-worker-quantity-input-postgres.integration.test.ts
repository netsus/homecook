import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { isQuantityInputSnapshot } from "@/lib/quantity-input";
import { I031_EXACT_IDENTITY } from "@/lib/server/youtube-i031-runtime";
import { finalizeResolvedSourceBoundQuantities, prepareSourceBoundQuantitiesForResolution } from "../scripts/lib/youtube-extraction-worker-runtime.mjs";

const contextPath = process.env.HOMECOOK_YOUTUBE_QUANTITY_ISOLATED_CONTEXT;
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const seed = readFileSync("tests/sql/recipe-product-only-fixture.sql", "utf8");
function baselineFunction(path: string, name: string, temporaryName: string) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(`create or replace function ${name}(`);
  if (start < 0) throw Error("Legacy quantity fixture source drifted");
  const end = source.indexOf("$function$;", start);
  if (end < 0) throw Error("Legacy quantity fixture body drifted");
  return source.slice(start, end + "$function$;".length).replace(`function ${name}(`, `function pg_temp.${temporaryName}(`);
}
const owner = "78000000-0000-4000-8000-000000000001";
const ingredientId = "78000000-0000-4000-8000-000000000002";
const sourceId = "c0400000-0000-4000-8000-000000000001";
const extractionId = "c0400000-0000-4000-8000-000000000002";
const jobId = "c0400000-0000-4000-8000-000000000005";
const args = `'${owner}','2026-01-01',repeat('7',64),1,'2026-01-02'`;
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let container = "";
let tag = "";
const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
delete env.DOCKER_CONTEXT; delete env.DOCKER_TLS_VERIFY; delete env.DOCKER_CERT_PATH;

function sql(statement: string) {
  const inspect = spawnSync("docker", ["inspect", container], { env, encoding: "utf8", timeout: 10000 });
  expect(inspect.status, inspect.stderr).toBe(0);
  const [state] = JSON.parse(inspect.stdout);
  expect(state.Config.Labels["homecook.quantity-v4-test"]).toBe(tag);
  expect(state.Config.Image).toBe(image);
  expect(state.HostConfig.NetworkMode).toBe("none");
  expect(state.HostConfig.PortBindings ?? {}).toEqual({});
  expect(state.HostConfig.Binds ?? []).toEqual([]);
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"],
    { env, input: statement, encoding: "utf8", timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function runtime(amount: string, unit: string) {
  return prepareSourceBoundQuantitiesForResolution({ recipe: { ingredients: [{ name: "영양 제품 검증 재료", amount, unit,
    quantityState: "explicit", amountBasis: "stated", evidenceRefs: [{ source_method: "description", source_provider: "youtube", snippet: `${amount}${unit}` }] }] } })
    .runtimeResult.recipe.ingredients[0];
}
function resolved(amount: number, unit: string) {
  return { draft_ingredient_id: sourceId, ingredient_id: ingredientId, standard_name: "영양 제품 검증 재료", amount, unit,
    ingredient_type: "QUANT", quantity_state: "explicit", resolution_status: "resolved", quantity_source: "text_explicit",
    quantity_review_required: false, display_text: `${amount}${unit}`, quantity_raw_text: `${amount}${unit}`, scalable: true };
}
function quantity(raw: string, unit: string, amount: number) {
  return `(private.youtube_worker_quantity_input_v4(${literal(runtime(raw, unit))},${literal(resolved(amount, unit))})->'snapshot')`;
}
function savedFractionFixture(reviewedProfile = "") {
  return `${seed} update private.quantity_input_v4_policy set enabled=true; ${reviewedProfile}
    create temp table source_quantity as select private.youtube_worker_quantity_input_v4(
      ${literal(runtime("1/3", "g"))},${literal(resolved(1 / 3, "g"))}) value;
    insert into public.youtube_extraction_sessions(id,user_id,youtube_url,youtube_video_id,video_title,provider_version,source_providers,classification_status,
      classification_reasons,extraction_meta_json,draft_json,extraction_methods,status,expires_at)
    select '${extractionId}','${owner}','https://www.youtube.com/watch?v=fixture0001','fixture0001','원문 분수','fixture-only','{}','recipe','{}','{}',
      jsonb_build_object('title','원문 분수','base_servings',2,'tags','[]'::jsonb,
        'ingredients',jsonb_build_array(${literal(resolved(1 / 3, "g"))}||jsonb_build_object('amount',value#>'{snapshot,display_quantity,amount}',
          'quantity_input',value->'snapshot','quantity_context_fingerprint',value->'context_fingerprint')),
        'steps',jsonb_build_array(jsonb_build_object('instruction','소금을 넣습니다.'))),'{}','draft',now()+interval '1 day' from source_quantity;
    select public.ensure_youtube_saved_recipe_result(${args},'${extractionId}','c0400000-0000-4000-8000-000000000003');
    create temp table initial as select * from public.youtube_saved_recipe_results where extraction_session_id='${extractionId}';`;
}
const editKey = "c0400000-0000-4000-8000-000000000007";
function rawEdit(raw: string, amount: number, unit = "g", stamp = "value->>'context_fingerprint'") {
  return `jsonb_set(initial.editable_content_json,'{ingredients,0}',(initial.editable_content_json#>'{ingredients,0}')-'quantity_context_fingerprint'
    ||jsonb_build_object('amount',${amount},'unit','${unit}','quantity_input',jsonb_build_object('schema_version','quantity-v4',
      'raw_value','${raw}','raw_unit','g','expected_context_fingerprint',${stamp})))`;
}

async function expectPolicyOffWaits(statement: string, shouldWait = true) {
  sql("update private.quantity_input_v4_policy set enabled=true;");
  expect(statement).not.toContain("update private.quantity_input_v4_policy");
  const command = ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"];
  const holding = spawn("docker", command, { env });
  let stdout = ""; let stderr = "";
  const complete = new Promise<void>((resolve, reject) => {
    holding.stderr.on("data", value => { stderr += value.toString(); });
    holding.once("error", reject);
    holding.once("close", code => code === 0 ? resolve() : reject(Error(stderr)));
  });
  const ready = new Promise<void>((resolve, reject) => {
    holding.stdout.on("data", value => { stdout += value.toString(); if (stdout.includes("QUANTITY_MUTATION_READY")) resolve(); });
    holding.once("error", reject);
    holding.once("close", () => { if (!stdout.includes("QUANTITY_MUTATION_READY")) reject(Error(stderr || "No mutation marker")); });
  });
  holding.stdin.write(`${statement} select 'QUANTITY_MUTATION_READY';\n`);
  try {
    await ready;
    const off = spawnSync("docker", command, { env, encoding: "utf8", timeout: 3000,
      input: "set statement_timeout='200ms'; update private.quantity_input_v4_policy set enabled=false;" });
    if (shouldWait) {
      expect(off.status, off.stderr).not.toBe(0);
      expect(off.stderr).toContain("statement timeout");
    } else expect(off.status, off.stderr).toBe(0);
    expect(sql("select enabled from private.quantity_input_v4_policy where singleton;")).toBe(shouldWait ? "t" : "f");
  } finally { holding.stdin.end("rollback;\n"); await complete; }
  sql("update private.quantity_input_v4_policy set enabled=false;");
}

describe.skipIf(!contextPath)("YouTube quantity bridge on owned schema-only PostgreSQL", () => {
  beforeAll(() => {
    const context = JSON.parse(readFileSync(contextPath!, "utf8"));
    expect(context.container_id).toMatch(/^[a-f0-9]{64}$/u);
    expect(context.tag).toMatch(/^[a-f0-9]{32}$/u);
    container = context.container_id; tag = context.tag;
  });

  it("matches every registered native function source, permission and execution context", () => {
    const manifest = JSON.parse(readFileSync("docs/security/youtube-worker-quantity-function-postimages.json", "utf8"));
    const signatures = manifest.functions.map(({ postimage }: { postimage: { signature: string } }) => `('${postimage.signature}')`).join(",");
    const actual = JSON.parse(sql(`set search_path=''; with signatures(signature) as(values ${signatures})
      select jsonb_agg(jsonb_build_object('signature',signature,'source_md5',md5(btrim(p.prosrc,chr(10))),
        'definition_sha256',encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex'),
        'owner',r.rolname,'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'volatility',p.provolatile) order by signature)
      from signatures join pg_proc p on p.oid=signature::regprocedure join pg_roles r on r.oid=p.proowner;`));
    expect(actual).toEqual(manifest.functions.map(({ postimage }: { postimage: Record<string, unknown> }) => postimage));
  });

  it("keeps new worker/OFF and old worker/ON metadata absent", () => {
    expect(sql(`${seed} select ${quantity("1/3", "g", 1 / 3)} is null; rollback;`)).toBe("t");
    const legacy = runtime("1/3", "g"); delete legacy.quantity_input;
    expect(sql(`${seed} update private.quantity_input_v4_policy set enabled=true;
      select private.youtube_worker_quantity_input_v4(${literal(legacy)},${literal(resolved(1 / 3, "g"))}) is null; rollback;`)).toBe("t");
  });

  it.each([["1/3", 1 / 3], ["0.125", 0.125]])("preserves raw %s and uses the existing native parser under the actual restricted owner", (raw, amount) => {
    const result = JSON.parse(sql(`${seed} update private.quantity_input_v4_policy set enabled=true;
      set local role youtube_extraction_worker_rpc_owner; select ${quantity(raw, "g", amount)}; rollback;`));
    expect(result).toMatchObject({ raw_value: raw, raw_unit: "g", normalized: { amount, unit: "g" }, quality: "direct", source_versions: [], evidence_ids: [] });
    expect(isQuantityInputSnapshot(result, { amount, unit: "g" })).toBe(true);
    if (raw === "1/3") expect(result).toMatchObject({ numerator: "1", denominator: "3" });
  });

  it.each([["200", "mL", "DENSITY_REQUIRED"], ["1", "T", "UNIT_DEFINITION_REQUIRED"], ["1", "t", "UNIT_DEFINITION_REQUIRED"],
    ["1", "cup", "UNIT_DEFINITION_REQUIRED"], ["1", "통", "PIECE_IDENTITY_REQUIRED"], ["1", "알", "PIECE_IDENTITY_REQUIRED"]])
    ("retains %s %s with unavailable conversion when evidence is absent", (raw, unit, reason) => {
      const result = JSON.parse(sql(`${seed} update private.quantity_input_v4_policy set enabled=true; select ${quantity(raw, unit, Number(raw))}; rollback;`));
      expect(result).toMatchObject({ raw_value: raw, raw_unit: unit, normalized: null, quality: "unavailable", reason, evidence_ids: [], source_versions: [] });
    });

  it("does not grant the wrapper or shared hydration to user, service or worker login roles", () => {
    const result = JSON.parse(sql(`select jsonb_object_agg(role,has_function_privilege(role,'private.youtube_worker_quantity_input_v4(jsonb,jsonb)','EXECUTE'))
      from unnest(array['anon','authenticated','service_role','youtube_extraction_worker','authenticator','youtube_extraction_worker_rpc_owner']) role;`));
    expect(result).toEqual({ anon: false, authenticated: false, service_role: false, youtube_extraction_worker: false, authenticator: false, youtube_extraction_worker_rpc_owner: true });
    expect(JSON.parse(sql(`select jsonb_object_agg(role,has_function_privilege(role,'private.youtube_worker_quantity_write_admission_v4()','EXECUTE'))
      from unnest(array['anon','authenticated','service_role','youtube_extraction_worker','authenticator','youtube_extraction_worker_rpc_owner']) role;`)))
      .toEqual(result);
    expect(sql("select has_function_privilege('youtube_extraction_worker_rpc_owner','private.ingredient_quantity_v4_input(uuid,uuid)','EXECUTE');")).toBe("f");
  });

  it("rejects source raw/numeric disagreement and cannot promote unknown identity or model unit context", () => {
    expect(sql(`${seed} update private.quantity_input_v4_policy set enabled=true;
      do $$ begin begin perform ${quantity("1/3", "g", 0.33)}; raise exception 'ROUNDING_ACCEPTED';
        exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end; end $$;
      select private.youtube_worker_quantity_input_v4(${literal({ ...runtime("1", "cup"), unit_context: { volume_definitions: [{ volume_ml: 240 }] } })},${literal(resolved(1, "cup"))}) is null
        and private.youtube_worker_quantity_input_v4(${literal(runtime("1", "g"))},${literal({ ...resolved(1, "g"), resolution_status: "unresolved", quantity_state: "unknown" })}) is null;
      rollback;`)).toBe("t");
  });

  it("stores the source-owned fraction through the real saved-result writer and canonical snapshot, including an older editor retry", () => {
    const result = JSON.parse(sql(`${seed} update private.quantity_input_v4_policy set enabled=true;
      create temp table bridge_draft as select jsonb_build_object('title','원문 분수','base_servings',2,'tags','[]'::jsonb,
        'ingredients',jsonb_build_array(${literal(resolved(1 / 3, "g"))}||jsonb_build_object('quantity_input',${quantity("1/3", "g", 1 / 3)})),
        'steps',jsonb_build_array(jsonb_build_object('instruction','소금을 넣습니다.'))) value;
      insert into public.youtube_extraction_sessions(id,user_id,youtube_url,youtube_video_id,video_title,provider_version,source_providers,classification_status,
        classification_reasons,extraction_meta_json,draft_json,extraction_methods,status,expires_at)
      select '${extractionId}','${owner}','https://www.youtube.com/watch?v=fixture0001','fixture0001','원문 분수','fixture-only','{}','recipe','{}','{}',value,'{}','draft',now()+interval '1 day' from bridge_draft;
      select public.ensure_youtube_saved_recipe_result(${args},'${extractionId}','c0400000-0000-4000-8000-000000000003');
      create temp table initial as select * from public.youtube_saved_recipe_results where extraction_session_id='${extractionId}';
      update private.quantity_input_v4_policy set enabled=false;
      select public.write_youtube_saved_recipe_result(${args},'update',id,null,revision,
        jsonb_set(editable_content_json,'{ingredients}',(select jsonb_agg(row-'quantity_input') from jsonb_array_elements(editable_content_json->'ingredients') row)),
        'c0400000-0000-4000-8000-000000000004') from initial;
      select jsonb_build_object('editable',saved.editable_content_json#>'{ingredients,0,quantity_input}',
        'snapshot',snapshot.ingredients_json#>'{0,quantity_input}',
        'source_unchanged',saved.source_snapshot_json=initial.source_snapshot_json,
        'editable_hash_unchanged',saved.editable_content_hash=initial.editable_content_hash,
        'canonical_id_unchanged',saved.canonical_recipe_id=initial.canonical_recipe_id)
      from initial join public.youtube_saved_recipe_results saved using(id),
        lateral public.build_recipe_content_snapshot_input(saved.canonical_recipe_id) snapshot; rollback;`));
    expect(result.editable).toMatchObject({ raw_value: "1/3", numerator: "1", denominator: "3", quality: "direct" });
    expect(result.snapshot).toEqual(result.editable);
    expect(result).toMatchObject({ source_unchanged: true, editable_hash_unchanged: true, canonical_id_unchanged: true });
  });

  it("keeps legacy editable JSON and canonical hash exactly equal to both committed predecessor functions", () => {
    const oldValidator = baselineFunction("supabase/migrations/20261008180000_youtube_saved_recipe_results.sql",
      "private.validate_youtube_saved_recipe_editable_content", "before_quantity_validator");
    const oldSnapshot = baselineFunction("supabase/migrations/20261012120000_youtube_saved_recipe_canonical_bridge.sql",
      "public.build_recipe_content_snapshot_input", "before_quantity_snapshot");
    expect(sql(`${seed} ${oldValidator} ${oldSnapshot}
      insert into public.youtube_extraction_sessions(id,user_id,youtube_url,youtube_video_id,video_title,provider_version,source_providers,classification_status,
        classification_reasons,extraction_meta_json,draft_json,extraction_methods,status,expires_at)
      values('${extractionId}','${owner}','https://www.youtube.com/watch?v=fixture0001','fixture0001','이전 원문','fixture-only','{}','recipe','{}','{}',
        jsonb_build_object('title','이전 원문','base_servings',2,'tags','[]'::jsonb,'ingredients',jsonb_build_array(${literal(resolved(1 / 3, "g"))}),
          'steps',jsonb_build_array(jsonb_build_object('instruction','섞습니다.'))),'{}','draft',now()+interval '1 day');
      select public.ensure_youtube_saved_recipe_result(${args},'${extractionId}','c0400000-0000-4000-8000-000000000003');
      select saved.editable_content_json=pg_temp.before_quantity_validator(saved.editable_content_json,saved.source_snapshot_json)
        and saved.editable_content_hash=encode(extensions.digest(convert_to(pg_temp.before_quantity_validator(saved.editable_content_json,saved.source_snapshot_json)::text,'UTF8'),'sha256'),'hex')
        and current.ingredients_json=prior.ingredients_json and current.steps_json=prior.steps_json and current.content_hash=prior.content_hash
        and not(current.ingredients_json->0 ? 'quantity_input')
      from public.youtube_saved_recipe_results saved,
        lateral public.build_recipe_content_snapshot_input(saved.canonical_recipe_id) current,
        lateral pg_temp.before_quantity_snapshot(saved.canonical_recipe_id) prior where saved.extraction_session_id='${extractionId}'; rollback;`)).toBe("t");
  });

  it("reopens stored raw fractions while OFF and restores the old editor's exact floating view without reinterpreting history", () => {
    const result = JSON.parse(sql(`${savedFractionFixture()}
      update private.quantity_input_v4_policy set enabled=false;
      create temp table reopened as select public.read_youtube_saved_recipe_results(${args},id) value from initial;
      select public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        jsonb_set(jsonb_set(initial.editable_content_json,'{title}','"제목만 수정"'),'{ingredients,0}',
          (initial.editable_content_json#>'{ingredients,0}')-'quantity_input'-'quantity_context_fingerprint'||jsonb_build_object('amount',${1 / 3})),
        '${editKey}') from initial;
      select jsonb_build_object('policy',reopened.value#>'{data,quantity_policy}',
        'raw',reopened.value#>>'{data,content,ingredients,0,quantity_input,raw_value}',
        'options',(select context->'options' from jsonb_each(reopened.value#>'{data,quantity_contexts}') contexts(key,context) limit 1),
        'quantity_unchanged',saved.editable_content_json#>'{ingredients,0}'=initial.editable_content_json#>'{ingredients,0}',
        'source_unchanged',saved.source_snapshot_json=initial.source_snapshot_json)
      from initial join public.youtube_saved_recipe_results saved using(id),reopened; rollback;`));
    expect(result).toEqual({ policy: null, raw: "1/3", options: null, quantity_unchanged: true, source_unchanged: true });
  });

  it.each([{ raw: "1/2", amount: 0.5, unit: "g", numerator: "1", denominator: "2" },
    { raw: "1/3", amount: 1 / 3000, unit: "kg", numerator: "1", denominator: "3" }])
    ("revalidates owner $raw g edits displayed as $unit and preserves the immutable extraction", ({ raw, amount, unit, numerator, denominator }) => {
      const result = JSON.parse(sql(`${savedFractionFixture()}
        select public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
          ${rawEdit(raw, amount, unit)},'${editKey}') from initial,source_quantity;
        select jsonb_build_object('row',saved.editable_content_json#>'{ingredients,0}',
          'source_unchanged',saved.source_snapshot_json=initial.source_snapshot_json,
          'snapshot',snapshot.ingredients_json#>'{0,quantity_input}')
        from initial join public.youtube_saved_recipe_results saved using(id),
          lateral public.build_recipe_content_snapshot_input(saved.canonical_recipe_id) snapshot; rollback;`));
      expect(result.row).toMatchObject({ amount, unit, quantity_input: { raw_value: raw, raw_unit: "g", numerator, denominator,
        normalized: { amount: raw === "1/2" ? 0.5 : 1 / 3, unit: "g" } } });
      expect(result.source_unchanged).toBe(true);
      expect(result.snapshot).toEqual(result.row.quantity_input);
      expect(isQuantityInputSnapshot(result.row.quantity_input, { amount, unit })).toBe(true);
    });

  it.each([{ error: "QUANTITY_CONTEXT_CHANGED", code: "40001", unit: "g", stamp: "repeat('a',64)" },
    { error: "UNIT_CONVERSION_MISSING", code: "22023", unit: "mL", stamp: "value->>'context_fingerprint'" }])
    ("rejects $error atomically instead of trusting client facts", ({ error, code, unit, stamp }) => {
      expect(sql(`${savedFractionFixture()}
        create temp table before_mutation as select to_jsonb(saved) value from public.youtube_saved_recipe_results saved where id=(select id from initial);
        create temp table receipts_before as select count(*) value from private.youtube_saved_recipe_result_mutations;
        do $$ begin begin perform public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
          ${rawEdit("1/2", 0.5, unit, stamp)},'${editKey}') from initial,source_quantity;
          raise exception 'UNSAFE_QUANTITY_ACCEPTED'; exception when sqlstate '${code}' then if sqlerrm<>'${error}' then raise; end if; end; end $$;
        select before_mutation.value=to_jsonb(saved) and receipts_before.value=(select count(*) from private.youtube_saved_recipe_result_mutations)
        from before_mutation,receipts_before,public.youtube_saved_recipe_results saved where saved.id=(select id from initial); rollback;`)).toBe("t");
    });

  it("distinguishes an omitted old key from an explicit clear and prevents a forged snapshot", () => {
    expect(sql(`${savedFractionFixture()}
      do $$ begin begin perform public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        jsonb_set(initial.editable_content_json,'{ingredients,0,quantity_input,normalized,amount}','999'),'${editKey}') from initial;
        raise exception 'FORGED_SNAPSHOT_ACCEPTED'; exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end; end $$;
      select public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        jsonb_set(initial.editable_content_json#-'{ingredients,0,quantity_context_fingerprint}','{ingredients,0,quantity_input}','null'),'${editKey}') from initial;
      select not(editable_content_json#>'{ingredients,0}' ? 'quantity_input') and source_snapshot_json=(select source_snapshot_json from initial)
        from public.youtube_saved_recipe_results where id=(select id from initial); rollback;`)).toBe("t");
  });

  it("replays the exact quantity request after a later edit without consulting a newer context or duplicating a receipt", () => {
    const result = JSON.parse(sql(`${savedFractionFixture()}
      create temp table request_content as select ${rawEdit("1/2", 0.5)} value from initial,source_quantity;
      create temp table first_response as select public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        request_content.value,'${editKey}') value from initial,request_content;
      select public.write_youtube_saved_recipe_result(${args},'update',saved.id,null,saved.revision,
        jsonb_set(saved.editable_content_json,'{title}','"나중 제목"'),'c0400000-0000-4000-8000-000000000008') from public.youtube_saved_recipe_results saved where saved.id=(select id from initial);
      update private.quantity_input_v4_policy set enabled=false;
      select jsonb_build_object('replay_equal',public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        request_content.value,'${editKey}')=first_response.value,
        'receipt_count',(select count(*) from private.youtube_saved_recipe_result_mutations where idempotency_key='${editKey}'),
        'title',(select editable_content_json->>'title' from public.youtube_saved_recipe_results where id=initial.id))
      from initial,request_content,first_response; rollback;`));
    expect(result).toEqual({ replay_equal: true, receipt_count: 1, title: "나중 제목" });
  });

  it("changes the live stamp when a new reviewed profile is selected while preserving immutable source facts", () => {
    const profile = `insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,
      edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
      values('c0400000-0000-4000-8000-000000000012','78000000-0000-4000-8000-000000000006','worker-ingredient-fixture',
        '영양 제품 검증 재료','raw',100,repeat('f',64),'approved','fixture','${owner}',now());
      insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,
      review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by)
      values('c0400000-0000-4000-8000-000000000011','c0400000-0000-4000-8000-000000000012','ingredient_source','mass_100g',100,'g',1,
        'approved','fixture','${owner}',now(),true,'${owner}');
      insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
      values('c0400000-0000-4000-8000-000000000010','${ingredientId}','c0400000-0000-4000-8000-000000000011','raw','exact_standard_name',true,
        'approved','fixture','${owner}',now(),1,true,'{"edible_portion_basis":"edible"}');`;
    const result = JSON.parse(sql(`${savedFractionFixture(profile)}
      create temp table old_read as select public.read_youtube_saved_recipe_results(${args},id) value from initial;
      update public.ingredient_nutrition_profiles set is_active=false,is_primary=false,review_status='superseded'
        where id='c0400000-0000-4000-8000-000000000010';
      insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,quantity_v4_metadata)
      values('c0400000-0000-4000-8000-000000000013','${ingredientId}','c0400000-0000-4000-8000-000000000011','raw','exact_standard_name',true,
        'approved','fixture','${owner}',now(),2,true,'{"edible_portion_basis":"edible"}');
      do $$ begin begin perform public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        ${rawEdit("1/2", 0.5)},'${editKey}') from initial,source_quantity;
        raise exception 'STALE_REVIEWED_VERSION_ACCEPTED'; exception when sqlstate '40001' then if sqlerrm<>'QUANTITY_CONTEXT_CHANGED' then raise; end if; end; end $$;
      select jsonb_build_object('stamp_changed',(public.read_youtube_saved_recipe_results(${args},initial.id)#>'{data,quantity_contexts}')
          is distinct from old_read.value#>'{data,quantity_contexts}',
        'stored_unchanged',saved.editable_content_json=initial.editable_content_json and saved.source_snapshot_json=initial.source_snapshot_json,
        'receipts',(select count(*) from private.youtube_saved_recipe_result_mutations where idempotency_key='${editKey}'))
      from initial join public.youtube_saved_recipe_results saved using(id),old_read; rollback;`));
    expect(result).toEqual({ stamp_changed: true, stored_unchanged: true, receipts: 0 });
  });

  it.each([true, false])("rejects a changed old-editor quantity with policy enabled=%s and leaves the original row intact", enabled => {
    const message = enabled ? "QUANTITY_INPUT_REQUIRED" : "UNIT_POLICY_INACTIVE";
    expect(sql(`${savedFractionFixture()} update private.quantity_input_v4_policy set enabled=${enabled};
      do $$ begin begin perform public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,
        jsonb_set(initial.editable_content_json,'{ingredients,0}',
          (initial.editable_content_json#>'{ingredients,0}')-'quantity_input'-'quantity_context_fingerprint'||jsonb_build_object('amount',0.5)),
        '${editKey}') from initial; raise exception 'OLD_QUANTITY_EDIT_ACCEPTED';
        exception when sqlstate '55000' then if sqlerrm<>'${message}' then raise; end if; end; end $$;
      select saved.editable_content_json=initial.editable_content_json and saved.source_snapshot_json=initial.source_snapshot_json
        and not exists(select 1 from private.youtube_saved_recipe_result_mutations where idempotency_key='${editKey}')
      from initial join public.youtube_saved_recipe_results saved using(id); rollback;`)).toBe("t");
  });

  it("keeps the real owner and session authority before quantity projection or mutation", () => {
    const other = "79000000-0000-4000-8000-000000000002";
    expect(sql(`${savedFractionFixture()}
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,
        session_issued_at,last_token_issued_at,binding_expires_at)
      values(repeat('8',64),1,'${other}',1,'2026-01-01','active','local','https://auth.product-only.invalid/auth/v1',now(),2,
        '2026-01-02','2026-01-02','2099-01-01');
      do $$ begin
        begin perform public.read_youtube_saved_recipe_results('${other}','2026-01-01',repeat('8',64),1,'2026-01-02',id) from initial;
          raise exception 'OTHER_OWNER_READ_ACCEPTED'; exception when sqlstate 'P0002' then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
        begin perform public.write_youtube_saved_recipe_result('${owner}','2026-01-01',repeat('8',64),1,'2026-01-02','update',initial.id,null,
          initial.revision,${rawEdit("1/2", 0.5)},'${editKey}') from initial,source_quantity;
          raise exception 'OTHER_SESSION_WRITE_ACCEPTED'; exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise; end if; end;
      end $$;
      select saved.editable_content_json=initial.editable_content_json and saved.source_snapshot_json=initial.source_snapshot_json
        and not exists(select 1 from private.youtube_saved_recipe_result_mutations where idempotency_key='${editKey}')
      from initial join public.youtube_saved_recipe_results saved using(id); rollback;`)).toBe("t");
  });

  it.each(["edit", "clear"])("holds mutation admission until transaction end before policy OFF: %s", async action => {
    // The policy change is committed before session A starts. Updating it in
    // the fixture transaction would accidentally hide a missing SHARE lock.
    sql("update private.quantity_input_v4_policy set enabled=true;");
    const fixture = savedFractionFixture().replace("update private.quantity_input_v4_policy set enabled=true;", "");
    const content = action === "edit" ? rawEdit("1/2", 0.5) :
      "jsonb_set(initial.editable_content_json#-'{ingredients,0,quantity_context_fingerprint}','{ingredients,0,quantity_input}','null')";
    await expectPolicyOffWaits(`${fixture}
      select public.write_youtube_saved_recipe_result(${args},'update',initial.id,null,initial.revision,${content},'${editKey}') from initial,source_quantity;`);
  });

  it("keeps owner read-only projection free of policy admission locks", async () => {
    await expectPolicyOffWaits(`${savedFractionFixture().replace("update private.quantity_input_v4_policy set enabled=true;", "")}
      select public.read_youtube_saved_recipe_results(${args},id) from initial;`, false);
  });

  it.each([
    { label: "new worker/ON 1/3", raw: "1/3", amount: 1 / 3, numerator: "1", denominator: "3", enabled: true, newWorker: true },
    { label: "new worker/ON .125", raw: ".125", amount: 0.125, numerator: "125", denominator: "1000", enabled: true, newWorker: true },
    { label: "old worker/ON 1/3", raw: "1/3", amount: 1 / 3, enabled: true, newWorker: false },
    { label: "new worker/OFF 1/3", raw: "1/3", amount: 1 / 3, enabled: false, newWorker: true },
  ])("runs $label through the actual worker resolver/finalizer and saved canonical result", async ({ raw, amount, numerator, denominator, enabled, newWorker }) => {
    // A processing job and fake credential are transaction-local fixture facts.
    // All production authority/fence functions run unchanged; no HTTP/model is used.
    const fixture = `${seed}
      update private.quantity_input_v4_policy set enabled=${enabled};
      update private.youtube_extraction_worker_credentials set current_generation=7,current_jti_hash=repeat('a',64),
        expires_at=now()+interval '1 day',release_sha=repeat('1',40),schema_identity='youtube-extraction-worker-schema-v2',
        allowed_snapshot_digest=(select private.youtube_extraction_policy_snapshot_digest(extractor_mode,pipeline_identity,result_affecting_options,policy_version)
          from private.youtube_extraction_current_policy where policy_key='primary');
      insert into public.youtube_extraction_jobs(id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,
        release_policy_key,policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,submission_mode,
        status,lease_owner,lease_generation,lease_expires_at)
      select '${jobId}','${owner}','fixture0001',repeat('b',64),fingerprint_key_version,policy_key,policy_version,
        private.youtube_extraction_policy_snapshot_digest(extractor_mode,pipeline_identity,result_affecting_options,policy_version),
        extractor_mode,pipeline_identity,result_affecting_options,'background_notify','processing','fixture-worker',1,now()+interval '1 hour'
      from private.youtube_extraction_current_policy where policy_key='primary';
      update public.youtube_extractor_permits set owner_id='fixture-worker',permit_generation=1,expires_at=now()+interval '1 hour';
      select set_config('request.jwt.claims',(select jsonb_build_object('role','youtube_extraction_worker','scope','youtube-extraction-worker',
        'iss','https://worker.mumeok.kr','aud','youtube-extraction','jti_hash',current_jti_hash,'generation',current_generation,
        'release_sha',release_sha,'schema_identity',schema_identity,'allowed_snapshot_digest',allowed_snapshot_digest,
        'exp',floor(extract(epoch from now()+interval '1 hour')))::text from private.youtube_extraction_worker_credentials),true);
      set local role youtube_extraction_worker;`;
    const value = runtime(raw, "g");
    if (!newWorker) delete value.quantity_input;
    const output = { identity: I031_EXACT_IDENTITY, recipe: { title: "원천 결속 분수", ingredients: [value], steps: ["재료를 섞습니다."] },
      meta: { sourceAvailability: { description: true, authorComment: false, transcript: false, onscreen: false } } };
    const rpc = `public.resolve_youtube_extraction_job_draft('${jobId}','fixture-worker',1,1,'fixture0001',${literal(output)})`;
    const result = JSON.parse(sql(`${fixture} select ${rpc}; rollback;`));
    const final = finalizeResolvedSourceBoundQuantities(result, [0]);
    expect(final.draft.ingredients[0].amount).toBe(amount);
    if (enabled && newWorker) expect(final.draft.ingredients[0].quantity_input).toMatchObject({ raw_value: raw, numerator, denominator });
    else expect(final.draft.ingredients[0]).not.toHaveProperty("quantity_input");
    if (enabled && newWorker) {
      expect(sql(`${fixture.replace("update private.quantity_input_v4_policy set enabled=true", "update private.quantity_input_v4_policy set enabled=false")}
        do $$ begin begin perform public.finalize_youtube_extraction_job('${jobId}','fixture-worker',1,${literal({ ...final, worker_permit_generation: 1 })});
          raise exception 'LATE_NEW_QUANTITY_ACCEPTED'; exception when sqlstate '55000' then if sqlerrm<>'UNIT_POLICY_INACTIVE' then raise; end if; end; end $$;
        reset role; select not exists(select 1 from public.youtube_extraction_sessions where source_job_id='${jobId}')
          and (select status='processing' from public.youtube_extraction_jobs where id='${jobId}'); rollback;`)).toBe("t");
    }
    if (enabled && newWorker) await expectPolicyOffWaits(`${fixture.replace("update private.quantity_input_v4_policy set enabled=true;", "")}
      select public.finalize_youtube_extraction_job('${jobId}','fixture-worker',1,${literal({ ...final, worker_permit_generation: 1 })});`);
    const saved = JSON.parse(sql(`${fixture}
      select public.finalize_youtube_extraction_job('${jobId}','fixture-worker',1,${literal({ ...final, worker_permit_generation: 1 })});
      reset role; update private.quantity_input_v4_policy set enabled=false; set local role youtube_extraction_worker;
      select public.finalize_youtube_extraction_job('${jobId}','fixture-worker',1,${literal({ ...final, worker_permit_generation: 1 })});
      reset role; set local request.jwt.claims='{"role":"service_role"}';
      select public.ensure_youtube_saved_recipe_result(${args},extraction_session_id,'c0400000-0000-4000-8000-000000000006')
        from public.youtube_extraction_jobs where id='${jobId}';
      select coalesce(snapshot.ingredients_json#>'{0,quantity_input}','null'::jsonb) from public.youtube_extraction_jobs job
        join public.youtube_saved_recipe_results saved on saved.extraction_session_id=job.extraction_session_id,
        lateral public.build_recipe_content_snapshot_input(saved.canonical_recipe_id) snapshot where job.id='${jobId}'; rollback;`));
    expect(saved).toEqual(final.draft.ingredients[0].quantity_input ?? null);
    // A stale lease is rejected before quantity hydration and no finalization is possible.
    expect(sql(`${fixture} do $$ begin begin perform public.resolve_youtube_extraction_job_draft('${jobId}','fixture-worker',2,1,'fixture0001',${literal(output)});
      raise exception 'STALE_LEASE_ACCEPTED'; exception when sqlstate '55000' then if sqlerrm<>'YOUTUBE_EXTRACTION_JOB_STALE' then raise; end if; end; end $$;
      select true; rollback;`)).toBe("t");
  });
});
