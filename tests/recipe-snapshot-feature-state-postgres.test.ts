import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assertFeatureStateManagementRole, buildFeatureStateMutation, FEATURE_STATE_MANAGEMENT_SELECT, FEATURE_STATE_SELECT } from "../scripts/lib/recipe-snapshot-feature-state.mjs";

// This test owns a fresh /tmp cluster. It never accepts a database URL or an
// existing data directory and does not use the user's Supabase installation.
let root: string;
let bin: string;
let started = false;
function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { input, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" } });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
  return result.stdout.trim();
}
function sql(query: string, role = "postgres") {
  return run(join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", root, "-p", "55439", "-U", role, "-d", "postgres"], query);
}
const read = () => JSON.parse(sql(`${FEATURE_STATE_SELECT};`));
beforeAll(() => {
  bin = run("pg_config", ["--bindir"]);
  root = mkdtempSync("/tmp/homecook-feature-state-");
  run(join(bin, "initdb"), ["-D", join(root, "data"), "-U", "postgres", "-A", "trust", "--no-locale"]);
  // Unique Unix socket directory; TCP disabled, so the port cannot target another DB.
  run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-o", `-h '' -k ${root} -p 55439`, "-l", join(root, "postgres.log"), "-w", "start"]);
  started = true;
  sql(`
create schema storage;
create table public.account_generation_capability_state(singleton boolean, state text);
insert into public.account_generation_capability_state values(true,'generation_active');
create table public.meals(id int, status text, recipe_id int, recipe_content_snapshot_id int, recipe_nutrition_snapshot_id int);
create table public.recipe_content_snapshots(id int, recipe_id int, recipe_nutrition_snapshot_id int);
create table public.recipes(id int, visibility text, created_by int);
create table public.recipe_image_objects(id int, bucket_id text, object_path text, visibility text, owner_uuid int, state text);
create table public.recipe_image_object_references(image_object_id int, reference_type text, consumer_id int);
create table storage.objects(bucket_id text, name text);
create table public.cooking_sessions(id int, status text);
insert into public.cooking_sessions values(1,'in_progress');
create function public.read_recipe_snapshot_ui_mode() returns text language sql as $$
 select case when current_setting('homecook.personal_recipe_v2',true)='on' and current_setting('homecook.snapshot_v2_creation',true)='on'
 then 'snapshot_v2' else 'legacy_v1' end $$;
`);
}, 30000);
afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
  if (root) rmSync(root, { recursive: true, force: true });
});
describe("atomic feature defaults on an owned PostgreSQL cluster", () => {
  it("enables both defaults for fresh connections, preserves existing session records when disabled", () => {
    expect(read().database_pair).toEqual([null, null]);
    sql(buildFeatureStateMutation(true, [null, null]));
    expect(read()).toMatchObject({ database_pair: ["on", "on"], effective_pair: ["on", "on"], mode: "snapshot_v2" });
    sql(buildFeatureStateMutation(false, ["on", "on"]));
    expect(read()).toMatchObject({ database_pair: ["off", "off"], effective_pair: ["off", "off"], mode: "legacy_v1" });
    expect(sql("select status from public.cooking_sessions where id=1;")).toBe("in_progress");
  });
  it("rejects stale default observations before changing either default", () => {
    expect(() => sql(buildFeatureStateMutation(true, [null, null]))).toThrow();
    expect(read().database_pair).toEqual(["off", "off"]);
  });
  it("rejects newly missing pins but preserves unmanaged orphan storage", () => {
    sql("insert into public.meals values(1,'registered',1,null,null);");
    expect(() => sql(buildFeatureStateMutation(true, ["off", "off"]))).toThrow();
    expect(read().database_pair).toEqual(["off", "off"]);
    sql("delete from public.meals; insert into storage.objects values('recipe-images','old.jpg');");
    sql(buildFeatureStateMutation(true, ["off", "off"]));
    expect(read().database_pair).toEqual(["on", "on"]);
    expect(sql("select count(*) from storage.objects;")).toBe("1");
    sql(buildFeatureStateMutation(false, ["on", "on"]));
    sql("delete from storage.objects;");
  });
  it("fails closed for a login-role override instead of reporting a globally working pair", () => {
    sql("create role feature_test_login login; alter role feature_test_login set homecook.personal_recipe_v2='off';");
    expect(() => sql(buildFeatureStateMutation(true, ["off", "off"]))).toThrow();
    expect(read().database_pair).toEqual(["off", "off"]);
    sql("alter role feature_test_login reset homecook.personal_recipe_v2;");
  });
  it("uses existing management authority for protected settings without granting the ordinary database owner access", () => {
    // Vanilla PostgreSQL lacks Supabase's custom-setting restriction. These
    // built-in superuser boolean settings reproduce its SQLSTATE 42501 boundary.
    const protectedSettings = (value: string) => value
      .replaceAll("homecook.personal_recipe_v2", "log_duration")
      .replaceAll("homecook.snapshot_v2_creation", "log_lock_waits");
    const protectedRead = () => JSON.parse(sql(`${protectedSettings(FEATURE_STATE_SELECT)};`, "feature_test_owner"));
    const ownerPrivileges = () => sql("select jsonb_build_array(has_parameter_privilege('feature_test_owner','log_duration','SET'), has_parameter_privilege('feature_test_owner','log_lock_waits','SET')); ");
    sql(`create role supabase_admin login superuser;
create role feature_test_owner login nosuperuser createdb bypassrls;
grant usage on schema public, storage to feature_test_owner;
grant all privileges on all tables in schema public, storage to feature_test_owner;
alter database postgres owner to feature_test_owner;`);
    try {
      expect(() => assertFeatureStateManagementRole(JSON.parse(sql(`${FEATURE_STATE_MANAGEMENT_SELECT};`, "feature_test_owner")))).not.toThrow();
      expect(ownerPrivileges()).toBe("[false, false]");
      expect(protectedRead().database_pair).toEqual([null, null]);
      expect(() => sql(protectedSettings(buildFeatureStateMutation(true, [null, null])), "feature_test_owner")).toThrow(/42501:.*permission denied to set parameter/);
      expect(protectedRead().database_pair).toEqual([null, null]);
      sql(protectedSettings(buildFeatureStateMutation(true, [null, null])), "supabase_admin");
      expect(protectedRead()).toMatchObject({ database_pair: ["on", "on"], effective_pair: ["on", "on"] });
      sql(protectedSettings(buildFeatureStateMutation(false, ["on", "on"])).replace("commit;", "rollback;"), "supabase_admin");
      expect(protectedRead().database_pair).toEqual(["on", "on"]);
      expect(ownerPrivileges()).toBe("[false, false]");
    } finally {
      sql(`alter database postgres reset log_duration;
alter database postgres reset log_lock_waits;
alter database postgres owner to postgres;
drop owned by feature_test_owner;
drop role feature_test_owner;
drop role supabase_admin;`);
    }
  });
});
