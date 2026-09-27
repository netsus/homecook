import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let root: string;
let bin: string;
let started = false;
const isolatedEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" };
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
const target = "44444444-4444-4444-8444-444444444444";
const image = "55555555-5555-4555-8555-555555555555";
function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command,args,{input,encoding:"utf8",env:isolatedEnv});
  if(result.status!==0) throw Error(result.stderr);
  return result.stdout.trim();
}
const args=()=>["-XqAt","-h",root,"-p","55442","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"];
const sql=(query:string)=>run(join(bin,"psql"),args(),query);
const inherit=()=>sql(`select private.inherit_personal_recipe_source_image('${owner}','${source}','${target}',now());`);
const projection=()=>JSON.parse(sql(`select row_to_json(p) from public.read_recipe_image_projections(array['${target}'::uuid]) p;`));
function fixture(options: { url?: string; sourceVisibility?: string; managed?: "public" | "private" }={}) {
  sql(`truncate public.recipe_image_object_references, public.recipe_image_objects, public.recipes;
    insert into public.recipes(id,created_by,visibility,thumbnail_url) values('${source}','${other}','${options.sourceVisibility??"public"}',${options.url?`'${options.url}'`:"null"});
    insert into public.recipes(id,created_by,visibility,origin_recipe_id) values('${target}','${owner}','private','${source}');`);
  if(options.managed) sql(`insert into public.recipe_image_objects values('${image}',${options.managed==="private"?`'${other}',2,'recipe-images-private','${other}/2/${image}.webp','private','attached_private'`:`null,null,'recipe-images','shared/${image}.webp','public_shared','attached_public_shared'`});
    insert into public.recipe_image_object_references(image_object_id,reference_type,consumer_id) values('${image}','recipe_thumbnail','${source}');`);
}

beforeAll(()=>{
  bin=run("pg_config",["--bindir"]);root=mkdtempSync("/tmp/homecook-fork-image-");
  run(join(bin,"initdb"),["-D",join(root,"data"),"-U","postgres","-A","trust","--no-locale"]);
  run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-o",`-h '' -k ${root} -p 55442`,"-l",join(root,"postgres.log"),"-w","start"]);started=true;
  sql(`create role anon;create role authenticated;create role service_role;
    create schema private;create schema recipe_visibility_guard;
    create function recipe_visibility_guard.is_owner_publicly_visible(uuid) returns boolean language sql as $$select true$$;
    create table public.recipes(id uuid primary key,created_by uuid,visibility text,deleted_at timestamptz,thumbnail_url text,origin_recipe_id uuid);
    create table public.recipe_image_objects(id uuid primary key,owner_uuid uuid,account_generation bigint,bucket_id text,object_path text,visibility text,state text);
    create table public.recipe_image_object_references(id bigint generated always as identity primary key,image_object_id uuid,reference_type text,consumer_id uuid,created_at timestamptz default now(),unique(reference_type,consumer_id));`);
  const migration=readFileSync(join(process.cwd(),"supabase/migrations/20260927120100_recipe_fork_image_preservation.sql"),"utf8");
  sql(migration.slice(0,migration.indexOf("do $migration$"))+"commit;");
},30000);
afterAll(()=>{if(started)run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-m","fast","-w","stop"]);if(root)rmSync(root,{recursive:true,force:true});});

describe("fork source images in an isolated PostgreSQL cluster",()=>{
  it("copies the public thumbnail and preserves the copy after a source change",()=>{
    fixture({url:"https://i.ytimg.com/vi/video/hqdefault.jpg"});inherit();
    sql(`update public.recipes set thumbnail_url='https://example.test/new.jpg' where id='${source}';`);
    expect(projection().legacy_thumbnail_url).toBe("https://i.ytimg.com/vi/video/hqdefault.jpg");
  });
  it("adds an independent reference to a public shared image without changing its lifecycle",()=>{
    fixture({managed:"public"});inherit();
    expect(sql("select count(*) from public.recipe_image_object_references")).toBe("2");
    expect(projection().image_object_id).toBe(image);
    expect(sql("select state from public.recipe_image_objects")).toBe("attached_public_shared");
  });
  it("recovers an old imageless fork only while its origin is publicly readable",()=>{
    fixture({url:"https://example.test/original.jpg"});
    expect(projection().legacy_thumbnail_url).toBe("https://example.test/original.jpg");
    expect(sql(`select thumbnail_url is null from public.recipes where id='${target}'`)).toBe("t");
    sql(`update public.recipes set visibility='private' where id='${source}'`);
    expect(projection().legacy_thumbnail_url).toBeNull();
  });
  it("projects an old fork's shared image without backfill and hides a deleted origin",()=>{
    fixture({managed:"public"});
    expect(projection().image_object_id).toBe(image);
    expect(sql("select count(*) from public.recipe_image_object_references")).toBe("1");
    sql(`update public.recipes set deleted_at=now() where id='${source}'`);
    expect(projection().image_object_id).toBeNull();
  });
  it("does not expose a private image attached to a public recipe or copy signed legacy URLs",()=>{
    fixture({managed:"private"});inherit();expect(projection().image_object_id).toBeNull();
    expect(sql("select count(*) from public.recipe_image_object_references")).toBe("1");
    fixture({url:"https://storage.test/storage/v1/object/sign/recipe-images-private/hidden?token=test"});inherit();
    expect(projection().legacy_thumbnail_url).toBeNull();
  });
  it("denies copying another owner's private recipe and direct service-role helper calls",()=>{
    fixture({sourceVisibility:"private",url:"https://example.test/private.jpg"});
    expect(()=>inherit()).toThrow("RESOURCE_NOT_FOUND");
    expect(sql("select has_function_privilege('service_role','private.inherit_personal_recipe_source_image(uuid,uuid,uuid,timestamptz)','EXECUTE')")).toBe("f");
  });
});
