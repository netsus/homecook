import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PARTICIPATION_DOCUMENT, PARTICIPATION_OTHER_OWNER, PARTICIPATION_OWNER } from "./fixtures/weight-improvement-participation";

const enabled = process.env.HOMECOOK_WEIGHT_IMPROVEMENT_PG === "1";
const run = enabled ? describe.sequential : describe.skip;
const container = `homecook-weight-participation-fixture-${randomUUID()}`;
let started = false;
function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { input, encoding: "utf8", timeout: 20000 });
}
function psql(sql: string, success = true) {
  const result = docker(["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql);
  if (success) expect(result.status, result.stderr).toBe(0);
  return result;
}
function sqlString(value: string) { return `'${value.replaceAll("'", "''")}'`; }
const authority = `${sqlString(PARTICIPATION_OWNER)},'2026-10-13T00:00:00Z',${sqlString("b".repeat(64))},1,'2026-10-13T01:00:00Z'`;
function scope(path: string, role = "service_role", method = "POST", owner = PARTICIPATION_OWNER, generation = 3) {
  return `set role ${role}; set request.jwt.claim.role='${role}'; set request.method='${method}'; set request.path='/rpc/${path}';
    set request.headers='{"x-homecook-internal-scope":"weight-improvement"}'; set fixture.owner=${sqlString(owner)}; set fixture.generation='${generation}';`;
}
function readStatus(generation = 3) {
  const output = psql(`${scope("read_weight_improvement_participation", "service_role", "POST", PARTICIPATION_OWNER, generation)}
    select public.read_weight_improvement_participation(${authority});`).stdout.trim().split("\n").at(-1);
  return JSON.parse(output ?? "null");
}
function mutateSql(action: string, revision: number, key = randomUUID(), hash?: string, owner = PARTICIPATION_OWNER, expectedGeneration = 3) {
  return `select public.mutate_weight_improvement_participation(${authority.replace(sqlString(PARTICIPATION_OWNER),sqlString(owner))},
    ${expectedGeneration},'${action}',${revision},'settings_desktop','${key}',${action === "opt_in" ? "'fixture-consent-v1'" : "null"},
    ${action === "opt_in" ? hash ? sqlString(hash) : "(select document_hash from private.weight_improvement_documents where version='fixture-consent-v1')" : "null"},${action === "opt_in"});`;
}
function mutate(action: string, revision: number, key = randomUUID(), success = true, hash?: string) {
  // The service principal has no direct private-table access; its hash is obtained by the fixture operator.
  const documentHash = hash ?? psql("select document_hash from private.weight_improvement_documents where version='fixture-consent-v1';").stdout.trim();
  return psql(`${scope("mutate_weight_improvement_participation")}${mutateSql(action,revision,key,documentHash)}`,success);
}
function enableFixturePolicy() {
  const document = { ...PARTICIPATION_DOCUMENT };
  Reflect.deleteProperty(document,"version");Reflect.deleteProperty(document,"hash");
  const json = sqlString(JSON.stringify(document));
  psql(`insert into private.weight_improvement_documents(version,document_json,document_hash)
    values('fixture-consent-v1',${json}::jsonb,encode(extensions.digest(convert_to((${json}::jsonb)::text,'UTF8'),'sha256'),'hex')) on conflict do nothing;
    update private.weight_improvement_control set participation_enabled=true,current_document_version='fixture-consent-v1';`);
}
run("weight participation fresh isolated PostgreSQL 17 fixture", () => {
  beforeAll(async () => {
    const launch = docker(["run", "--detach", "--rm", "--pull=never", "--network", "none", "--name", container,
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
    expect(launch.status,launch.stderr).toBe(0); started = true;
    for (let attempt=0;attempt<100;attempt+=1) {
      const initialized = docker(["logs", container]).stdout.includes("PostgreSQL init process complete");
      if (initialized && docker(["exec",container,"pg_isready","-U","postgres"]).status===0) break;
      await new Promise((resolve) => setTimeout(resolve,100));
    }
    psql(readFileSync(join(process.cwd(),"tests/sql/weight-improvement-participation-fixture.sql"),"utf8"));
    const existing=readFileSync(join(process.cwd(),"supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql"),"utf8");
    for (const name of ["claim_cooked_batch_operation","finish_cooked_batch_operation"]) {
      const definition=existing.match(new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\$function\\$;`))?.[0];
      expect(definition).toBeTruthy(); psql(definition!);
    }
    psql(readFileSync(join(process.cwd(),"supabase/migrations/20261014230000_weight_improvement_participation.sql"),"utf8"));
  },30000);
  afterAll(() => { if (started) docker(["rm","--force",container]); });
  beforeEach(() => {
    psql("truncate private.weight_improvement_consent_events,private.weight_improvement_participation,public.mutation_idempotency_keys; update private.weight_improvement_control set participation_enabled=false,current_document_version=null;");
  });
  it("defaults OFF/null, performs no participation write on read, and locks collection OFF", () => {
    expect(readStatus()).toMatchObject({ decision:"unanswered",revision:0,participation_enabled:false,collection_enabled:false,document:null });
    expect(psql("select count(*) from private.weight_improvement_participation;").stdout.trim()).toBe("0");
    expect(psql("update private.weight_improvement_control set collection_enabled=true;",false).status).not.toBe(0);
    expect(mutate("opt_in",0,randomUUID(),false,"a".repeat(64)).stderr).toContain("PARTICIPATION_DISABLED");
  });
  it("records the immutable current document and idempotent explicit opt-in evidence", () => {
    enableFixturePolicy(); const key=randomUUID();
    expect(mutate("opt_in",0,randomUUID(),false,"c".repeat(64)).stderr).toContain("PARTICIPATION_DOCUMENT_CHANGED");
    expect(mutate("opt_in",0,key).status).toBe(0); expect(mutate("opt_in",0,key).status).toBe(0);
    expect(readStatus()).toMatchObject({ decision:"opted_in",revision:1,consent_document_version:"fixture-consent-v1",collection_enabled:false });
    expect(psql("select count(*) from private.weight_improvement_consent_events;").stdout.trim()).toBe("1");
    expect(psql("select action||':'||surface||':'||length(document_hash)::text from private.weight_improvement_consent_events;").stdout.trim()).toBe("opt_in:settings_desktop:64");
    expect(psql("delete from private.weight_improvement_consent_events;",false).stderr).toContain("IMMUTABLE");
    expect(psql("update private.weight_improvement_documents set document_json='{}';",false).stderr).toContain("IMMUTABLE");
  });
  it("keeps close/seen separate from consent and creates no endless seen/decline events", () => {
    enableFixturePolicy(); mutate("notice_seen",0); mutate("notice_seen",1);
    expect(readStatus()).toMatchObject({ decision:"unanswered",revision:1 });
    expect(readStatus().notice_seen_at).not.toBeNull();
    expect(psql("select count(*) from private.weight_improvement_consent_events;").stdout.trim()).toBe("0");
    mutate("decline",1); mutate("decline",2);
    expect(readStatus()).toMatchObject({ decision:"declined",revision:2 });
    expect(psql("select count(*) from private.weight_improvement_consent_events;").stdout.trim()).toBe("1");
  });
  it("rejects stale ON, projects current withdrawn state on successful old-key replay, and never marks cleanup completed", () => {
    enableFixturePolicy(); const onKey=randomUUID(); mutate("opt_in",0,onKey); mutate("withdraw",1);
    expect(readStatus()).toMatchObject({ decision:"withdrawn",revision:2,cleanup_status:"pending",collection_enabled:false });
    expect(mutate("opt_in",1,randomUUID(),false).stderr).toContain("PARTICIPATION_REVISION_CONFLICT");
    expect(JSON.parse(mutate("opt_in",0,onKey).stdout.trim())).toMatchObject({ decision:"withdrawn",revision:2,cleanup_status:"pending" });
    expect(psql("select count(*) from private.weight_improvement_consent_events;").stdout.trim()).toBe("2");
    expect(mutate("withdraw",2,onKey,false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
  });
  it("allows withdrawal after policy is disabled without inventing deletion completion", () => {
    enableFixturePolicy(); mutate("opt_in",0);
    psql("update private.weight_improvement_control set participation_enabled=false,current_document_version=null;");
    mutate("withdraw",1);
    expect(readStatus()).toMatchObject({ decision:"withdrawn",cleanup_status:"pending",document:null,participation_enabled:false });
  });
  it("binds the owner/generation to existing verified authority and does not revive old generations", () => {
    enableFixturePolicy(); mutate("opt_in",0);
    const wrongOwner=psql(`${scope("mutate_weight_improvement_participation")}${mutateSql("withdraw",1,randomUUID(),undefined,PARTICIPATION_OTHER_OWNER)}`,false);
    expect(wrongOwner.stderr).toContain("ACCOUNT_SESSION_STALE");
    expect(readStatus(4)).toMatchObject({ decision:"unanswered",revision:0,subject:{ account_generation:4 } });
  });
  it("rejects old-generation expected subjects before receipt lookup, even for the same successful UUID", () => {
    enableFixturePolicy(); const key = randomUUID(); mutate("opt_in",0,key);
    const before = psql("select count(*) from private.weight_improvement_participation; select count(*) from private.weight_improvement_consent_events; select count(*) from public.mutation_idempotency_keys;").stdout;
    const hash = readStatus().document.hash;
    const stale = psql(`${scope("mutate_weight_improvement_participation", "service_role", "POST", PARTICIPATION_OWNER, 4)}${mutateSql("opt_in",0,key,hash,PARTICIPATION_OWNER,3)}`,false);
    expect(stale.stderr).toContain("PARTICIPATION_SUBJECT_CHANGED");
    expect(psql("select count(*) from private.weight_improvement_participation; select count(*) from private.weight_improvement_consent_events; select count(*) from public.mutation_idempotency_keys;").stdout).toBe(before);
    expect(readStatus(4)).toMatchObject({ decision:"unanswered",revision:0,subject:{ account_generation:4 } });
  });
  it("permits only service-role exact POST RPC paths and preserves the predecessor scope", () => {
    for (const role of ["anon","authenticated"]) expect(psql(`${scope("read_weight_improvement_participation",role)}select public.read_weight_improvement_participation(${authority});`,false).status).not.toBe(0);
    expect(psql(`${scope("read_weight_improvement_participation","service_role","GET")}select public.read_weight_improvement_participation(${authority});`,false).stderr).toContain("PARTICIPATION_UNAUTHORIZED");
    expect(psql(`${scope("other_rpc")}select public.read_weight_improvement_participation(${authority});`,false).stderr).toContain("PARTICIPATION_UNAUTHORIZED");
    for (const role of ["anon","authenticated","service_role"]) expect(psql(`set role ${role}; select * from private.weight_improvement_participation;`,false).status).not.toBe(0);
    expect(psql(`begin; set request.headers='{"x-homecook-internal-scope":"fixture-existing-scope"}'; set request.method='POST'; set request.path='/rpc/fixture_existing_rpc'; select private.verify_full_local_internal_scope(); select current_setting('fixture.predecessor_called'); rollback;`).stdout).toContain("true");
  });
  it("serializes a real concurrent withdrawal before a stale ON request", async () => {
    enableFixturePolicy(); mutate("opt_in",0);
    const hash=readStatus().document.hash;
    const args=["exec","-i",container,"psql","-U","postgres","-d","postgres","-Atq","-v","ON_ERROR_STOP=1"];
    const first=spawn("docker",args); let output=""; let errors="";
    first.stdout.on("data",(data)=>{ output+=String(data); }); first.stderr.on("data",(data)=>{errors+=String(data);});
    const completed=new Promise<number|null>((resolve)=>first.on("close",resolve));
    first.stdin.end(`${scope("mutate_weight_improvement_participation")} begin; ${mutateSql("withdraw",1)} select 'withdraw-locked'; select pg_sleep(0.4); commit;`);
    await new Promise<void>((resolve,reject)=>{ const check=()=>output.includes("withdraw-locked")?resolve():setTimeout(check,10); check();setTimeout(()=>reject(new Error("withdrawal fixture did not obtain lock")),5000); });
    const stale=psql(`${scope("mutate_weight_improvement_participation")}${mutateSql("opt_in",1,randomUUID(),hash)}`,false);
    expect(await completed,errors).toBe(0); expect(stale.stderr).toContain("PARTICIPATION_REVISION_CONFLICT");
    expect(readStatus()).toMatchObject({ decision:"withdrawn",cleanup_status:"pending" });
  });
});
