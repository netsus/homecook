import {test,after}from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync}from "node:fs";
import {join,resolve}from "node:path";
import {pathToFileURL}from "node:url";
import {randomUUID}from "node:crypto";
import {review,observation,sha}from "./fixtures/cooked-weight-mass-proxy-maintenance-fixture.mjs";
import * as production from "../scripts/lib/cooked-weight-mass-proxy-maintenance.mjs";

const root=mkdtempSync("/tmp/hc-mass-proxy-engine-"),helper=join(root,"helper.mjs"),webPath=join(root,"web.mjs"),dbPath=join(root,"db.mjs");
const originalPin=structuredClone(production.MASS_PROXY_REVIEW_PIN);
after(()=>{assert.deepEqual(production.MASS_PROXY_REVIEW_PIN,originalPin);rmSync(root,{recursive:true,force:true});});
const imports=text=>text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_quote,relative)=>`from "${pathToFileURL(relative==="./cooked-weight-mass-proxy-maintenance.mjs"?helper:relative==="./prelaunch-web-deploy.mjs"?webPath:resolve("scripts/lib",relative)).href}"`);
const declaration=/^export const MASS_PROXY_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu;
let code=readFileSync("scripts/lib/cooked-weight-mass-proxy-maintenance.mjs","utf8");assert.equal([...code.matchAll(declaration)].length,1);
code=code.replace(declaration,`export const MASS_PROXY_REVIEW_PIN = Object.freeze({path:${JSON.stringify(join(root,"not-an-operating-review.json"))},sha256:"${sha("8")}"});`)
 .replace('new URL("./cooked-weight-mass-proxy-source.json", import.meta.url)',`new URL(${JSON.stringify(pathToFileURL(resolve("scripts/lib/cooked-weight-mass-proxy-source.json")).href)})`);
writeFileSync(helper,imports(code),{mode:0o600});writeFileSync(webPath,imports(readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8")),{mode:0o600});writeFileSync(dbPath,imports(readFileSync("scripts/lib/prelaunch-database.mjs","utf8")),{mode:0o600});
const feature=await import(pathToFileURL(helper).href),db=await import(pathToFileURL(dbPath).href),web=await import(pathToFileURL(webPath).href);
const migrations=review().database.after.map(row=>({...row,bytes:readFileSync(`supabase/migrations/${row.filename}`)}));
const payload=production.planMassProxyMigration(review(),migrations).pending[0].payload;
function harness(mode="commit"){
 const r=review(),operationId=randomUUID(),queries=[];let attempt=null,applied=false,inTransaction=false,committed=false,actor="postgres",backups=0,reloads=0,dispatches=0,stopped=false;
 const adapter={observe:async()=>{const value=observation(r,applied);if(mode==="row-drift"&&applied)value.normalDataSha256=sha("f");if(mode==="oid-drift"&&applied)value.functions[0].oid++;return value;},
  migrationSession:()=>({postgresContext:{searchPath:"public",timeZone:"UTC"},query:async sql=>{
   queries.push(sql);if(sql.startsWith("BEGIN ISOLATION"))inTransaction=true;
   if(sql==="SELECT session_user;")return "supabase_admin";
   if(sql==="RESET ROLE;")actor="supabase_admin";
   if(sql.includes("SET LOCAL ROLE postgres"))actor="postgres";
   if(sql==="SELECT current_user;")return actor;
   if(sql==="SELECT pg_export_snapshot();")return "00000003-0000001B-1";
   if(sql===payload){dispatches++;if(mode==="sql-error")throw Error("SYNTHETIC_SQL_FAILURE");}
   if(sql.includes("INSERT INTO homecook_deploy.migrations"))applied=true;
   if(sql==="ROLLBACK;"){applied=false;inTransaction=false;}
   if(sql==="COMMIT;"){committed=true;inTransaction=false;if(mode==="commit-ack-unknown")throw Error("SYNTHETIC_ACK_LOST");}
   return "";
  },close:async()=>{},stop:()=>{stopped=true;}}),
  backup:async args=>{backups++;assert(inTransaction);assert.equal(args.snapshot,"00000003-0000001B-1");if(mode==="backup-error")throw Error("SYNTHETIC_BACKUP_FAILURE");return{...args,sha256:sha("a"),rolesSha256:sha("b"),fullArchiveDecoded:true};},reloadSchema:async()=>{reloads++;}};
 const journal={read:async()=>structuredClone(attempt),write:async(value,create)=>{if(create)assert.equal(attempt,null);attempt=structuredClone(value);}};
 const engine=db.createProtectedPrelaunchDatabaseEngine({review:r,reviewSha256:sha("8"),operationId,readMigrations:async()=>migrations,adapter,journal,assertBoundary:async()=>{}});
 return{r,engine,queries,journal,adapter,state:()=>({attempt,applied,committed,backups,reloads,dispatches,stopped}),setAttempt:value=>attempt=structuredClone(value)};
}
test("actual engine applies one exact payload with snapshot backup, original actor/locks and239 receipt",async()=>{
 const f=harness();const plan=await f.engine.plan();assert.deepEqual(plan.pending,[production.MASS_PROXY_MIGRATION.filename]);assert.equal(f.state().backups,0);
 const receipt=await f.engine.apply();feature.assertMassProxyDatabaseReceipt(f.r,receipt,sha("8"));
 assert.deepEqual(f.state().attempt,receipt);assert.equal(f.state().dispatches,1);assert.equal(f.state().backups,1);assert.equal(f.state().reloads,1);
 assert(f.queries.some(sql=>sql.includes("SERIALIZABLE")&&sql.includes("LOCK TABLE homecook_deploy.migrations")));
 assert(f.queries.some(sql=>sql.includes("LOCK TABLE private.youtube_extraction_current_policy IN SHARE MODE")));
 await assert.rejects(f.engine.apply(),/automatic retry is prohibited/);
});
for(const mode of ["sql-error","row-drift","oid-drift","backup-error"]){
 test(`actual engine ${mode} rolls back before COMMIT and only reconciles to not-applied`,async()=>{
  const f=harness(mode);await assert.rejects(f.engine.apply());assert.equal(f.state().committed,false);assert.equal(f.state().applied,false);
  assert.equal(f.state().attempt.status,"rolled_back_before_commit");assert.equal(f.state().attempt.commitDispatched,false);
  const receipt=await f.engine.reconcile();assert.equal(receipt.status,"not_applied");assert.equal(receipt.automaticRetryAllowed,false);assert.equal(f.state().reloads,0);
 });
}
test("actual commit ACK loss retains239 intent and read-only reconcile does not dispatch another SQL",async()=>{
 const f=harness("commit-ack-unknown");await assert.rejects(f.engine.apply(),/ACK_LOST/);assert.equal(f.state().committed,true);assert.equal(f.state().attempt.status,"unknown");
 const before=f.state().dispatches;const receipt=await f.engine.reconcile();feature.assertMassProxyDatabaseReceipt(f.r,receipt,sha("8"));assert.equal(f.state().dispatches,before);assert.equal(receipt.status,"committed");
});
for(const change of [a=>delete a.massProxyTransactionRows,a=>a.massProxyTransactionRows.functionOids[0][1]++,a=>a.cookingPostCatalog.catalogSha256=sha("f"),a=>a.predecessorMaintenance.receipt.sha256=sha("f")]){
 test("committed reconcile rejects missing/foreign original239 intent instead of adopting runtime images",async()=>{
  const f=harness("commit-ack-unknown");await assert.rejects(f.engine.apply());const attempt=structuredClone(f.state().attempt);change(attempt);f.setAttempt(attempt);
  await assert.rejects(f.engine.reconcile());assert.equal(f.state().dispatches,1);assert.equal(f.state().attempt.status,"unknown");
 });
}
test("operator bytes and query bindings reject before adapter target observations",()=>{
 const r=review();production.assertMassProxyOperatorSource(r,process.cwd());r.operator.files["scripts/lib/prelaunch-database.mjs"]=sha("f");assert.throws(()=>production.assertMassProxyOperatorSource(r,process.cwd()),/operator bytes differ/);
 for(const key of ["functionQuerySha256","unchangedQuerySha256","normalProjectionSha256"]){const altered=review();altered.database[key]=sha("f");let reads=0;assert.throws(()=>db.createMassProxyAdapter({inspect:()=>{reads++;}},altered));assert.equal(reads,0);}
});
test("operator root cannot be switched to a different checkout by repository selection",()=>{
 assert.throws(()=>production.assertMassProxyOperatorSource(review(),root),/executed operator root differs/);
});
test("PIN canonicalization only masks static JSON values and never executable expressions",()=>{
 const line=literal=>`export const MASS_PROXY_REVIEW_PIN = Object.freeze(${literal});`;
 const empty=line("{ path: null, sha256: null }");
 assert.equal(production.canonicalMassProxyOperatorText(empty),empty);
 assert.equal(production.canonicalMassProxyOperatorText(line(JSON.stringify({path:join(root,"review.json"),sha256:sha("a")}))),empty);
 for(const literal of ['{path:(()=>{return "/tmp/r"})(),sha256:"'+sha("a")+'"}','{...other}',JSON.stringify({path:"/tmp/r",sha256:sha("a"),extra:true}),'{["path"]:"/tmp/r",sha256:"'+sha("a")+'"}','{/* comment */ "path":"/tmp/r","sha256":"'+sha("a")+'"}']) {
  assert.throws(()=>production.canonicalMassProxyOperatorText(line(literal)),/static/);
 }
});
test("worker maintenance ancestry allows only the fixed239→238→235→232 schema edges",()=>{
 const role={schema:"homecook.recipe-request-role-maintenance.v1",ledgerCount:232,receipt:{sha256:sha("1")}},cooking={schema:"homecook.cooking-experience-maintenance.v1",ledgerCount:235,predecessorMaintenance:role},saved={schema:"homecook.saved-recipe-nutrition-maintenance.v1",ledgerCount:238,predecessorMaintenance:cooking},mass={schema:"homecook.cooked-weight-mass-proxy-maintenance.v1",ledgerCount:239,predecessorMaintenance:saved};
 for(const value of [mass,saved,cooking,role])assert.equal(web.matchesDatabaseMaintenanceBinding(value,mass),true);
 assert.equal(web.matchesDatabaseMaintenanceBinding({...role,receipt:{sha256:sha("f")}},mass),false);
 assert.equal(web.matchesDatabaseMaintenanceBinding(role,{...mass,predecessorMaintenance:{...saved,schema:"foreign"}}),false);
});
test("actual selector denies a new239 reader/writer activation path",()=>{
 for(const phase of ["reader","writer-on","writer-off","mass-proxy-reader","mass-proxy-writer-on"])assert.throws(()=>web.loadProtectedRolloutReview(process.cwd(),{feature:production.MASS_PROXY_FEATURE,phase}),/reader\/writer activation prohibited/);
});
