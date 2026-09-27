import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let root: string;
let bin: string;
let started = false;
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" };
const owner = "11111111-1111-4111-8111-111111111111";
const recipe = "22222222-2222-4222-8222-222222222222";
const image = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-09-27T00:00:00+00";
function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { input, encoding: "utf8", env });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function sql(query: string) {
  return run(join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55447", "-U", "postgres"], query);
}
function publish(verified = "null", customOwner = owner, expected = timestamp) {
  return `select public.publish_manual_recipe('${customOwner}','${timestamp}','${"a".repeat(64)}',1,'${timestamp}','${key}','${recipe}','${expected}','{}','{}',${verified});`;
}
const migration = readFileSync("supabase/migrations/20260927120500_manual_recipe_publication.sql", "utf8");
beforeAll(() => {
  bin = run("pg_config", ["--bindir"]);
  root = mkdtempSync("/tmp/hc-manual-publish-");
  run(join(bin, "initdb"), ["-D", join(root, "data"), "-U", "postgres", "-A", "trust", "--no-locale"]);
  run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-o", `-h '' -k ${root} -p 55447`, "-l", join(root, "log"), "-w", "start"]);
  started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.users(id uuid primary key);
    insert into public.users values('${owner}');
    create table public.recipes(id uuid primary key,created_by uuid,deleted_at timestamptz,source_type text,origin_recipe_id uuid,visibility text,thumbnail_url text,updated_at timestamptz);
    create table private.manual_recipe_create_receipts(owner_uuid uuid,account_generation bigint,idempotency_key uuid,response_body jsonb);
    create table public.recipe_nutrition_snapshots(recipe_id uuid,owner_user_id uuid,is_current boolean,id uuid default gen_random_uuid());
    create table public.recipe_content_snapshots(recipe_id uuid,recipe_nutrition_snapshot_id uuid,owner_user_id uuid,content_hash text,schema_version integer);
    create table public.recipe_tags(recipe_id uuid,visibility text,review_status text);
    create function public.build_recipe_content_snapshot_input(uuid) returns table(content_hash text) language sql as $$ select 'hash'::text $$;
    create table private.runtime_calls(recipe_id uuid);
    create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language sql as $$ select '{"account_generation":1,"cutover_attempt_id":"${key}"}'::jsonb $$;
    create function public.set_account_generation_internal_writer_marker(uuid,boolean) returns void language sql as $$ select $$;
    create function private.complete_manual_recipe_runtime(uuid,uuid,timestamptz,jsonb,jsonb) returns jsonb language plpgsql as $$ begin
      if not exists(select 1 from public.recipes where id=$2 and visibility='public' and updated_at=$3) then raise exception 'invalid runtime'; end if;
      if current_setting('test.fail_runtime',true)='on' then raise exception 'runtime failed'; end if;
      insert into private.runtime_calls values($2);
      insert into public.recipe_nutrition_snapshots(recipe_id,owner_user_id,is_current) values($2,null,true);
      insert into public.recipe_content_snapshots select $2,id,null,'hash',1 from public.recipe_nutrition_snapshots where recipe_id=$2 and owner_user_id is null and is_current; return '{}'; end $$;
    create function private.verify_full_local_internal_scope() returns void language plpgsql as $$ begin raise exception 'old scope'; end $$;
  `);
  sql(readFileSync("supabase/migrations/20260724110000_recipe_managed_image_registry_foundation.sql", "utf8"));
  sql(`create schema recipe_visibility_guard;
    create function recipe_visibility_guard.is_owner_publicly_visible(uuid) returns boolean language sql as $$select true$$;
    create function public.read_owned_manual_recipe_publication_context(uuid,timestamptz,text,integer,timestamptz,uuid) returns jsonb language plpgsql as $$
    declare result jsonb; begin select jsonb_build_object('runtime_ready',exists (select 1 from private.runtime_calls where recipe_id=recipe.id)) into result from public.recipes recipe where recipe.id=$6; return result; end $$;`);
  const projectionSource=readFileSync("supabase/migrations/20260927120100_recipe_fork_image_preservation.sql","utf8");
  const projectionStart=projectionSource.indexOf("create or replace function public.read_recipe_image_projections(");
  sql(projectionSource.slice(projectionStart,projectionSource.indexOf("$function$;",projectionStart)+"$function$;".length));
  sql(migration);
  sql(readFileSync("supabase/migrations/20260927120501_manual_recipe_publication_scope.sql", "utf8"));
}, 20_000);
afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
  if (root) rmSync(root, { recursive: true, force: true });
});
function seed(withImage = true) {
  sql(`truncate private.manual_recipe_publication_images,public.recipe_image_object_references,public.recipe_image_objects,public.recipes,private.manual_recipe_create_receipts,public.recipe_nutrition_snapshots,public.recipe_content_snapshots,public.recipe_tags,private.runtime_calls cascade;
    insert into public.recipes values('${recipe}','${owner}',null,'manual',null,'private',null,'${timestamp}');
    insert into private.manual_recipe_create_receipts values('${owner}',1,'${key}','{"id":"${recipe}","visibility":"private"}');
    insert into public.recipe_nutrition_snapshots(recipe_id,owner_user_id,is_current) values('${recipe}','${owner}',true);
    insert into public.recipe_tags values('${recipe}','private','approved'),('${recipe}','private','pending');
    ${withImage ? `insert into public.recipe_image_objects(id,owner_uuid,account_generation,bucket_id,object_path,raw_sha256,byte_size,actual_mime_type,visibility,state)
      values('${image}','${owner}',1,'recipe-images-private','${owner}/1/${image}.png','${"a".repeat(64)}',68,'image/png','private','attached_private');
      insert into public.recipe_image_object_references(image_object_id,reference_type,consumer_id) values('${image}','recipe_thumbnail','${recipe}');` : ""}`);
}
describe("isolated manual publication transaction", () => {
  it("commits the public asset first, hides its pending photo, and acknowledges copy readiness idempotently", () => {
    seed();
    const plan = JSON.parse(sql(publish()));
    expect(plan.status).toBe("copy_required");
    expect(JSON.parse(sql(publish())).target_object_id).toBe(plan.target_object_id);
    expect(sql(`select visibility from recipes`)).toBe("private");
    const verified = `'${JSON.stringify({ target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type })}'`;
    expect(JSON.parse(sql(publish(verified))).phase).toBe("upload");
    expect(JSON.parse(sql(publish())).phase).toBe("upload");
    expect(sql(`select state from recipe_image_objects where id='${image}'`)).toBe("attached_private");
    expect(sql(`select image_object_id is null from read_recipe_image_projections(array['${recipe}'::uuid])`)).toBe("t");
    expect(sql(`select public.read_owned_manual_recipe_publication_context('${owner}',now(),'session',1,now(),'${recipe}')->>'runtime_ready'`)).toBe("false");
    const ready = `'${JSON.stringify({ target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type, copy_verified: true })}'`;
    expect(JSON.parse(sql(publish(ready))).recipe.visibility).toBe("public");
    expect(sql(`select image_object_id from read_recipe_image_projections(array['${recipe}'::uuid])`)).toBe(plan.target_object_id);
    expect(sql(`select public.read_owned_manual_recipe_publication_context('${owner}',now(),'session',1,now(),'${recipe}')->>'runtime_ready'`)).toBe("true");
    expect(sql(`select visibility||':'||state from recipe_image_objects where id='${plan.target_object_id}'`)).toBe("public_shared:attached_public_shared");
    expect(sql(`select state from recipe_image_objects where id='${image}'`)).toBe("uploaded_unlinked");
    expect(sql(`select is_current from recipe_nutrition_snapshots where owner_user_id is not null`)).toBe("f");
    expect(JSON.parse(sql(publish())).status).toBe("published");
    expect(sql(`select count(*) from private.runtime_calls`)).toBe("1");
  });
  it("retains pending public identity and source metadata across owner/source deletion", () => {
    seed(); const plan=JSON.parse(sql(publish()));
    const verified = `'${JSON.stringify({ target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type })}'`;
    expect(JSON.parse(sql(publish(verified))).phase).toBe("upload");
    sql(`delete from public.users where id='${owner}'; delete from public.recipe_image_objects where id='${image}';`);
    expect(sql(`select publication_committed from private.manual_recipe_publication_images`)).toBe("t");
    expect(sql(`select copy_plan->>'source_object_path' from private.manual_recipe_publication_images`)).toBe(`${owner}/1/${image}.png`);
    expect(sql(`select image_object_id from recipe_image_object_references where consumer_id='${recipe}'`)).toBe(plan.target_object_id);
    expect(sql(`select image_object_id is null from read_recipe_image_projections(array['${recipe}'::uuid])`)).toBe("t");
    sql(`insert into public.users values('${owner}')`);
  });
  it("never reopens pending state or detaches an image after another request confirms readiness", () => {
    seed(); const plan=JSON.parse(sql(publish()));
    const evidence = { target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type };
    sql(publish(`'${JSON.stringify(evidence)}'`));
    expect(() => sql(publish(`'${JSON.stringify({ ...evidence, target_object_id: key, copy_verified: true })}'`))).toThrow("MANAGED_IMAGE_REFERENCE_REQUIRED");
    expect(sql("select count(*) from private.manual_recipe_publication_images")).toBe("1");
    expect(JSON.parse(sql(publish(`'${JSON.stringify({ ...evidence, copy_verified: true })}'`))).status).toBe("published");
    // An older successful source-verification callback arrives after B's ready ACK.
    expect(JSON.parse(sql(publish(`'${JSON.stringify(evidence)}'`))).status).toBe("published");
    expect(sql("select count(*) from private.manual_recipe_publication_images")).toBe("0");
    expect(sql(`select image_object_id from recipe_image_object_references`)).toBe(plan.target_object_id);
  });
  it("can remove the photo after an uncommitted failed attempt", () => {
    seed(); sql(publish());
    sql("delete from recipe_image_object_references");
    expect(JSON.parse(sql(publish())).status).toBe("published");
    expect(sql("select count(*) from private.manual_recipe_publication_images")).toBe("0");
  });
  it("publishes without a photo using the same atomic runtime completion", () => {
    seed(false);
    expect(JSON.parse(sql(publish())).status).toBe("published");
    expect(sql(`select count(*) from private.runtime_calls`)).toBe("1");
  });
  it("refreshes an interrupted copy after image replacement and rejects late evidence for the previous image", () => {
    seed();
    const first = JSON.parse(sql(publish()));
    const replacement = "55555555-5555-4555-8555-555555555555";
    const changedAt = "2026-09-27T00:00:01+00";
    sql(`insert into public.recipe_image_objects(id,owner_uuid,account_generation,bucket_id,object_path,raw_sha256,byte_size,actual_mime_type,visibility,state)
      values('${replacement}','${owner}',1,'recipe-images-private','${owner}/1/${replacement}.png','${"b".repeat(64)}',68,'image/png','private','attached_private');
      update public.recipe_image_object_references set image_object_id='${replacement}' where consumer_id='${recipe}';
      update public.recipes set updated_at='${changedAt}' where id='${recipe}';`);
    const evidence = (plan: Record<string, unknown>) => `'${JSON.stringify({ target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type })}'`;
    expect(() => sql(publish("null"))).toThrow("RECIPE_REVISION_CONFLICT");
    expect(() => sql(publish(evidence(first), owner, changedAt))).toThrow("RECIPE_REVISION_CONFLICT");
    const refreshed = JSON.parse(sql(publish("null", owner, changedAt)));
    expect(refreshed.source_object_id).toBe(replacement);
    expect(refreshed.target_object_id).not.toBe(first.target_object_id);
    expect(JSON.parse(sql(publish("null", owner, changedAt))).target_object_id).toBe(refreshed.target_object_id);
    expect(() => sql(publish(evidence(first), owner, changedAt))).toThrow("MANAGED_IMAGE_REFERENCE_REQUIRED");
    expect(sql(`select visibility from recipes where id='${recipe}'`)).toBe("private");
    expect(JSON.parse(sql(publish(evidence(refreshed), owner, changedAt))).phase).toBe("upload");
    expect(sql(`select count(*) from recipe_image_objects where id='${first.target_object_id}'`)).toBe("0");
  });
  it("rejects foreign owners, forks, stale draft revisions and altered copy evidence", () => {
    seed();
    expect(() => sql(publish("null", key))).toThrow("RESOURCE_NOT_FOUND");
    expect(() => sql(publish("null", owner, "2026-09-26T00:00:00Z"))).toThrow("RECIPE_REVISION_CONFLICT");
    expect(() => sql(publish("'{}'"))).toThrow("MANAGED_IMAGE_REFERENCE_REQUIRED");
    sql(`update recipes set origin_recipe_id='${image}'`);
    expect(() => sql(publish())).toThrow("RESOURCE_NOT_FOUND");
    expect(sql(`select visibility from recipes`)).toBe("private");
  });
  it("rolls visibility, image references, nutrition retirement and receipt back together if runtime fails", () => {
    seed();
    const plan = JSON.parse(sql(publish()));
    const verified = `'${JSON.stringify({ target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type })}'`;
    expect(() => sql(`set test.fail_runtime='on';${publish(verified)}`)).toThrow("runtime failed");
    expect(sql(`select visibility from recipes`)).toBe("private");
    expect(sql(`select image_object_id from recipe_image_object_references`)).toBe(image);
    expect(sql(`select is_current from recipe_nutrition_snapshots where owner_user_id is not null`)).toBe("t");
    expect(sql(`select response_body->>'visibility' from private.manual_recipe_create_receipts`)).toBe("private");
  });
  it("repairs a public recipe with missing runtime without hiding failures", () => {
    seed(false);
    sql(`update recipes set visibility='public'`);
    expect(() => sql(`set test.fail_runtime='on';${publish()}`)).toThrow("runtime failed");
    expect(sql(`select count(*) from private.runtime_calls`)).toBe("0");
    expect(JSON.parse(sql(publish())).status).toBe("published");
    expect(sql(`select count(*) from private.runtime_calls`)).toBe("1");
  });
  it("publishes only approved tags", () => {
    seed(false);
    sql(publish());
    expect(sql(`select review_status||':'||visibility from recipe_tags order by review_status`)).toBe("approved:public\npending:private");
  });
  it("adds only the two exact POST scope paths and preserves all predecessor decisions", () => {
    const headers = `set request.headers='{"x-homecook-internal-scope":"recipe-future-propagation"}'; set request.method='POST';`;
    for (const path of ["publish_manual_recipe", "read_owned_manual_recipe_publication_context"]) {
      expect(() => sql(`${headers}set request.path='/rpc/${path}'; select private.verify_full_local_internal_scope();`)).not.toThrow();
    }
    expect(() => sql(`${headers}set request.path='/rpc/unrelated'; select private.verify_full_local_internal_scope();`)).toThrow("old scope");
    expect(() => sql(`${headers}set request.method='GET';set request.path='/rpc/publish_manual_recipe'; select private.verify_full_local_internal_scope();`)).toThrow("old scope");
    expect(sql(`select has_function_privilege('service_role','private.verify_full_local_internal_scope_pre_manual_publish_20260927()','execute')`)).toBe("f");
  });
  it("does not grant direct execution to browser roles", () => {
    const signature = "public.publish_manual_recipe(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz,jsonb,jsonb,jsonb)";
    expect(sql(`select has_function_privilege('anon','${signature}','execute'),has_function_privilege('authenticated','${signature}','execute'),has_function_privilege('service_role','${signature}','execute')`)).toBe("f|f|t");
  });
});
