import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const sha = (c: string) => c.repeat(64), ref = (c: string) => c.repeat(40);
const temp = mkdtempSync(join(realpathSync("/tmp"), "recipe-save-owned-"));
afterAll(() => rmSync(temp, {recursive:true,force:true}));
let source = readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8")
  .replace(/from "(\.\/[^"\n]+)"/gu,(_text,relative:string)=>`from "${pathToFileURL(join(process.cwd(),"scripts/lib",relative)).href}"`)
  .replace(/^export const ([A-Z0-9_]+_PIN) = [\s\S]*?;(?=\r?\n)/gmu,
  (_text,name:string)=>`export const ${name} = Object.freeze({path:null,sha256:null});`);
source=source.replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',()=>`function prelaunchStateRoot() { return ${JSON.stringify(join(temp,"state"))}; }`);
source=source.replace(/^export const RECIPE_SAVE_RECOVERY_RELEASE_SHA = [^\r\n]*;$/gmu,()=>`export const RECIPE_SAVE_RECOVERY_RELEASE_SHA = "${ref("b")}";`)
  .replace('export const RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN = Object.freeze({path:null,sha256:null});',()=>`export const RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN = Object.freeze({path:null,sha256:"${sha("8")}"});`);
const raw = [Buffer.from("begin;\nSELECT 1;\ncommit;\n"),Buffer.from("begin;\nSELECT 2;\ncommit;\n")];
const fixedMigrations=[{filename:"20261014225200_recipe_snapshot_reason_identity.sql",sha256:hash(raw[0])},{filename:"20261014225300_recipe_future_patch_http_replay.sql",sha256:hash(raw[1])}];
source=source.replace(/export const RECIPE_SAVE_RECOVERY_MIGRATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/u,()=>`export const RECIPE_SAVE_RECOVERY_MIGRATIONS = Object.freeze(${JSON.stringify(fixedMigrations)});`);
source=source.replace(/^export const RECIPE_SAVE_RECOVERY_READER_SOURCES = [^\r\n]*;$/gmu,()=>`export const RECIPE_SAVE_RECOVERY_READER_SOURCES = Object.freeze(${JSON.stringify(Object.fromEntries(["lib/nutrition/recipe-nutrition-calculator.ts","lib/server/recipe-nutrition-snapshot.ts","lib/server/planner-nutrition-summary.ts","lib/server/recipe-snapshot-entrypoint.ts"].map(path=>[path,sha("1")])))});`);
const webPath=join(temp,"web.mjs");writeFileSync(webPath,source.replace(/from "(\.\/[^"\n]+)"/gu,
  (_text,relative:string)=>`from "${pathToFileURL(join(process.cwd(),"scripts/lib",relative)).href}"`),{mode:0o600});
const web:typeof import("../scripts/lib/prelaunch-web-deploy.mjs")=await import(pathToFileURL(webPath).href);
const dbPath=join(temp,"database.mjs");writeFileSync(dbPath,readFileSync("scripts/lib/prelaunch-database.mjs","utf8").replace(/from "(\.\/[^"\n]+)"/gu,
  (_text,relative:string)=>`from "${pathToFileURL(relative==="./prelaunch-web-deploy.mjs"?webPath:join(process.cwd(),"scripts/lib",relative)).href}"`),{mode:0o600});
const db:typeof import("../scripts/lib/prelaunch-database.mjs")=await import(pathToFileURL(dbPath).href);

describe("exact recipe-save229/231 boundary",()=>{
  it("has its own unbound authority and leaves the original229 authority separate",()=>{
    expect(web.RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN).toEqual({path:null,sha256:sha("8")});
    expect(web.RECIPE_SAVE_RECOVERY_MIGRATIONS).toEqual(fixedMigrations);
    expect(()=>web.loadProtectedRolloutReview(temp,{feature:"recipe-save-recovery",ref:ref("a")})).toThrow(/unbound|비어/u);
  });
  it("separates exactly the new receipt column, preserving the original18 columns",()=>{
    expect(db.RECIPE_SAVE_RECEIPT_COLUMNS).toHaveLength(18);
    expect(new Set(db.RECIPE_SAVE_RECEIPT_COLUMNS).size).toBe(18);
    expect(db.RECIPE_SAVE_NORMAL_DATA_SQL).toContain(`SELECT ${db.RECIPE_SAVE_RECEIPT_COLUMNS.join(",")} FROM public.mutation_idempotency_keys`);
    expect(db.QUANTITY_V4_NORMAL_DATA_SQL).not.toContain("recipe_future_http_request_fingerprint");
    expect(db.RECIPE_SAVE_NORMAL_DATA_SQL).not.toContain("recipe_future_http_request_fingerprint");
    expect(hash(db.RECIPE_SAVE_NORMAL_DATA_SQL)).not.toBe(hash(db.QUANTITY_V4_NORMAL_DATA_SQL));
  });
  it("does not accept a partial/foreign review or unknown ledger as an old229 success",()=>{
    expect(()=>web.assertRecipeSaveRecoveryReview({feature:"recipe-save-recovery"})).toThrow();
    expect(()=>db.assertRecipeSaveRecoveryObservation({}, {ledger:Array(230)},"after")).toThrow();
  });
});


const runtimePostimages:Readonly<Record<string,string>>=web.RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES;
const target={fixture:true,containerId:"owned-no-production"};
const pointer=(name:string,c:string)=>({path:join(temp,name),sha256:sha(c)});
function fixture() {
  const before=Array.from({length:229},(_,i)=>({filename:`${20250000000000+i}_owned.sql`,sha256:sha("0")}));
  before[228]={filename:web.NUTRITION_VALIDATOR_MIGRATION,sha256:web.NUTRITION_VALIDATOR_MIGRATION_SHA256};
  const signatures=[...db.RECIPE_SAVE_FUNCTION_SIGNATURES];
  const image=(signature:string,i:number)=>({signature,definitionSha256:sha(i%2?"a":"b"),metadataSha256:sha("c"),sourceMd5:"d".repeat(32)});
  const functionBefore={definitionSha256:sha("a"),metadataSha256:sha("c"),sourceMd5:"b".repeat(32)};
  const functionAfter={definitionSha256:sha("b"),metadataSha256:sha("c"),sourceMd5:"d".repeat(32)};
  const readers=["lib/nutrition/recipe-nutrition-calculator.ts","lib/server/recipe-nutrition-snapshot.ts","lib/server/planner-nutrition-summary.ts","lib/server/recipe-snapshot-entrypoint.ts"];
  return {schema:"homecook.prelaunch-protected-rollout-review.v1",feature:web.RECIPE_SAVE_RECOVERY_FEATURE,from:ref("a"),to:ref("b"),sourceReaderRef:ref("a"),migrationSourceRef:ref("b"),
    files:{...Object.fromEntries(fixedMigrations.map(row=>[`supabase/migrations/${row.filename}`,[null,row.sha256]])),...Object.fromEntries(web.RECIPE_SAVE_RECOVERY_RUNTIME_PATHS.map(path=>[path,[sha("1"),runtimePostimages[path]]]))},
    readerSources:Object.fromEntries(readers.map(path=>[path,sha("1")])),predecessorBuildId:"owned229",predecessorPlistSha256:sha("1"),closedArtifactSha256:sha("2"),closedReviewSha256:web.CLOSED_R2_REVIEW_PIN.sha256,
    controlSha256:sha("3"),consentGeneration:1,historicalProofsSha256:sha("4"),isolatedEvidenceSha256:sha("5"),readerFlowsSha256:sha("6"),
    isolatedEvidence:pointer("isolated","5"),readerFlows:pointer("flows","6"),platformInventory:pointer("inventory","7"),backupReadiness:pointer("readiness","8"),
    approved:{database:true,reader:false,writerOn:false},readerPrecedesDatabase:true,testScript:"test:feedback-batch:web",readerEnvironment:{},
    predecessorNutrition:{reviewSha256:web.NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256,databaseReceipt:pointer("original229","9"),readerFloor:ref("c")},
    database:{before,after:[...before,...fixedMigrations],migrations:fixedMigrations.map((row,i)=>({filename:row.filename,rawSha256:row.sha256,payloadSha256:hash(`SELECT ${i+1};`)})),
      configPath:join(temp,"config"),configSha256:sha("0"),targetSha256:hash(JSON.stringify(target)),beforeCatalogSha256:sha("1"),afterCatalogSha256:sha("2"),immutableSha256:sha("3"),afterImmutableSha256:sha("4"),stableImmutableSha256:sha("5"),
      beforeScope:{outerSha256:sha("6"),aliasSha256:sha("7")},afterScope:{outerSha256:sha("8"),aliasSha256:sha("7")},
      attestationScope:{beforeOuterSha256:sha("6"),afterOuterSha256:sha("8"),afterAliasSha256:sha("9")},recipeScope:{beforeOuterSha256:sha("6"),afterOuterSha256:sha("8"),afterAliasSha256:sha("6")},
      normalProjectionSha256:hash(db.RECIPE_SAVE_NORMAL_DATA_SQL),postimageRegistrySha256:web.QUANTITY_V4_PROTECTION.postimageRegistrySha256,attestationPostimageRegistrySha256:sha("a"),recipePostimageRegistrySha256:web.RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256,
      beforeColumnsSha256:sha("a"),afterColumnsSha256:sha("a"),receiptColumnsBeforeSha256:sha("b"),receiptColumnsAfterSha256:sha("c"),recipeFunctionsBefore:[...web.RECIPE_SAVE_RECOVERY_FUNCTIONS_BEFORE].map((signature,i)=>signature==="public.validate_recipe_nutrition_snapshot_payload(jsonb)"?{signature,...functionBefore}:image(signature,i)),recipeFunctionsAfter:signatures.map((signature,i)=>signature==="public.validate_recipe_nutrition_snapshot_payload(jsonb)"?{signature,...functionAfter}:image(signature,i)),functionBefore,functionAfter,
      workerCatalogBefore:web.QUANTITY_V4_WORKER_CATALOG_AFTER,workerCatalogAfter:web.QUANTITY_V4_WORKER_CATALOG_AFTER,
      workerBaseline:{credentialGeneration:48,workerReleaseSha:web.QUANTITY_V4_RELEASE_SHA,schemaIdentity:web.QUANTITY_V4_WORKER_SCHEMA_IDENTITY,workerPolicyEnabled:true,credentialRowSha256:sha("a"),policyRowSha256:sha("b"),policyStableSha256:sha("c"),snapshotDigest:sha("d")}}};
}
function observation(review:ReturnType<typeof fixture>,after=false) {
 const d=review.database;
 return {target,ledger:after?d.after:d.before,catalogSha256:after?d.afterCatalogSha256:d.beforeCatalogSha256,immutableSha256:after?d.afterImmutableSha256:d.immutableSha256,stableImmutableSha256:d.stableImmutableSha256,
   scope:after?d.afterScope:d.beforeScope,attestationScope:{outerSha256:after?d.afterScope.outerSha256:d.beforeScope.outerSha256,aliasSha256:d.attestationScope.afterAliasSha256},recipeScope:{outerSha256:d.recipeScope.afterOuterSha256,aliasSha256:d.recipeScope.afterAliasSha256},
   ledgerAuthority:true,active:false,normalColumnsSha256:d.afterColumnsSha256,normalProjectionSha256:d.normalProjectionSha256,postimageRegistrySha256:d.postimageRegistrySha256,attestationPostimageRegistrySha256:d.attestationPostimageRegistrySha256,recipePostimageRegistrySha256:d.recipePostimageRegistrySha256,
   recipeFunctions:after?d.recipeFunctionsAfter:d.recipeFunctionsBefore,receiptColumnsSha256:after?d.receiptColumnsAfterSha256:d.receiptColumnsBeforeSha256,receiptColumnInitiallyNull:after?true:null,nutritionValidator:after?d.functionAfter:d.functionBefore,
   productWriterEnabled:true,cookedWeightWriterEnabled:true,quantityWriterEnabled:true,attestationWriterEnabled:true,writerEnabled:true,attestationTablesPresent:true,attestationRowsEmpty:false,metadataNull:false,
   normalDataSha256:sha("1"),preservedRowsSha256:sha("2"),attestationRowsSha256:sha("3"),controlsSha256:sha("4"),worker:{...d.workerBaseline,catalogFingerprint:d.workerCatalogAfter,credentialActive:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0}};
}
function engineFixture({ackLost=false,failAtBoundary=0,secondSqlFails=false}={}) {
 const review=fixture(),queries:string[]=[];let state=observation(review),attempt:object|null=null,boundaries=0,sqls=0;
 const backup={fullArchiveDecoded:true,sha256:sha("1"),rolesSha256:sha("2"),snapshot:"00000001-00000002-1",target};
 const session={postgresContext:{searchPath:'"$user", public, extensions',timeZone:"UTC"},query:async(sql:string)=>{
   queries.push(sql);
   if(sql==="SELECT session_user;" || sql==="SELECT current_user;" && queries.at(-2)==="RESET ROLE;")return "supabase_admin";
   if(sql==="SELECT current_user;")return "postgres";
   if(sql==="SELECT pg_export_snapshot();")return backup.snapshot;
   if(sql==="SELECT 1;"||sql==="SELECT 2;"){sqls++;if(secondSqlFails&&sqls===2)throw Error("owned second SQL failed");}
   if(sql.includes("INSERT INTO homecook_deploy.migrations")&&sqls===2)state=observation(review,true);
   if(sql==="ROLLBACK;")state=observation(review);
   if(sql==="COMMIT;"&&ackLost)throw Error("owned ACK lost");return "";
 },close:async()=>{},stop:()=>{}};
 const adapter={observe:async()=>structuredClone(state),migrationSession:()=>session,backup:async()=>backup,reloadSchema:async()=>{}};
 const journal={read:async()=>attempt,write:async(value:object)=>{attempt=structuredClone(value);}};
 const migrations=[...review.database.before.map(row=>({...row,bytes:Buffer.alloc(0)})),...fixedMigrations.map((row,i)=>({...row,bytes:raw[i]}))];
 const engine=db.createProtectedPrelaunchDatabaseEngine({review,reviewSha256:sha("8"),operationId:"12345678-1234-4123-8123-123456789abc",adapter,journal,readMigrations:async()=>migrations,
   assertBoundary:async()=>{boundaries++;if(boundaries===failAtBoundary)throw Error("owned reader boundary changed");}});
 return {review,queries,engine,adapter,journal,migrations,getState:()=>state,getAttempt:()=>attempt};
}
describe("atomic exact A+B maintenance",()=>{
 it("accepts the reviewed existing reader and rejects changed build/module bytes",()=>{
   const r=fixture(),live={ref:r.from,buildId:r.predecessorBuildId,plistSha256:r.predecessorPlistSha256,readerSources:r.readerSources,healthy:true};
   expect(()=>web.assertRecipeSaveRecoveryReview(r)).not.toThrow();expect(web.assertRecipeSaveRecoveryReader(r,live)).toEqual(live);
   expect(()=>web.assertRecipeSaveRecoveryReader(r,{...live,buildId:"foreign"})).toThrow();
   expect(()=>web.assertRecipeSaveRecoveryReader(r,{...live,readerSources:{...r.readerSources,"lib/server/recipe-nutrition-snapshot.ts":sha("f")}})).toThrow();
 });
 it("commits two exact payloads in order with all controls/facts preserved",async()=>{
   const f=engineFixture(),result=await f.engine.apply();expect(result).toMatchObject({status:"committed",feature:"recipe-save-recovery",receiptColumnInitiallyNull:true,readerReady:true,writerEnabled:true,controlsPreservedInTransaction:true});
   expect(f.queries.filter(q=>q==="SELECT 1;"||q==="SELECT 2;")).toEqual(["SELECT 1;","SELECT 2;"]);
   expect(f.queries.filter(q=>/UPDATE .*control|UPDATE .*policy/u.test(q))).toEqual([]);
   expect(f.getState().ledger).toHaveLength(231);expect(()=>web.assertRecipeSaveRecoveryDatabaseReceipt(f.review,result)).not.toThrow();
 });
 it.each([1,2,3])("reader loss at boundary%d prevents commit",async failAtBoundary=>{
   const f=engineFixture({failAtBoundary});await expect(f.engine.apply()).rejects.toThrow("reader boundary");expect(f.queries).not.toContain("COMMIT;");expect(f.getState().ledger).toHaveLength(229);
 });
 it("second SQL failure rolls back the first and never publishes a partial230 terminal",async()=>{
   const f=engineFixture({secondSqlFails:true});await expect(f.engine.apply()).rejects.toThrow("second SQL");expect(f.queries).toContain("ROLLBACK;");expect(f.getState().ledger).toHaveLength(229);
 });
 it("ACK loss remains unknown, cannot retry, and reconciles only its same two-SQL intent",async()=>{
   const f=engineFixture({ackLost:true});await expect(f.engine.apply()).rejects.toMatchObject({databaseState:{outcome:"unknown",automaticRetryAllowed:false}});
   await expect(f.engine.apply()).rejects.toThrow("automatic retry");await expect(f.engine.reconcile()).resolves.toMatchObject({status:"committed",feature:"recipe-save-recovery"});expect(f.queries.filter(q=>q==="SELECT 2;")).toHaveLength(1);
 });
 it.each(["unknown","applying_precommit","commit_dispatch_guard","rolled_back_before_commit"])("new %s never falls back to the old229 success",status=>{
   expect(web.recipeSaveRecoveryPhaseStatus({review:fixture(),record:{status}},true)).toMatchObject({appliedLedgerCount:null,databasePlanSha256:null,normalDeploymentAllowed:false});
 });
 it("rejects unreceipted function/column drift and an intermediate230 state",()=>{
   const r=fixture(),after=observation(r,true);expect(db.assertRecipeSaveRecoveryObservation(r,after,"after")).toBe(after);
   for(const bad of [{...after,receiptColumnsSha256:sha("f")},{...after,receiptColumnInitiallyNull:false},{...after,ledger:r.database.after.slice(0,230)},{...after,recipeFunctions:[]}])expect(()=>db.assertRecipeSaveRecoveryObservation(r,bad,"after")).toThrow();
 });
});

function nutritionPredecessor(review:ReturnType<typeof fixture>) {
 const db=review.database,before=db.before.slice(0,228),file=`supabase/migrations/${web.NUTRITION_VALIDATOR_MIGRATION}`;
 before[227]={filename:web.COOKED_WEIGHT_ATTESTATION_MIGRATION,sha256:web.COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256};
 const previous={...review,feature:web.NUTRITION_VALIDATOR_FEATURE,from:ref("c"),to:ref("d"),sourceReaderRef:ref("c"),migrationSourceRef:ref("d"),readerValidatorSha256:sha("1"),
  files:{[file]:[null,web.NUTRITION_VALIDATOR_MIGRATION_SHA256]},predecessorAttestation:{reviewSha256:web.COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256,readerFloor:ref("e"),databaseReceipt:pointer("personal-db","9"),readerReceipt:pointer("personal-reader","a"),writerReceipt:pointer("personal-writer","b")},
  database:{...db,before,after:[...before,{filename:web.NUTRITION_VALIDATOR_MIGRATION,sha256:web.NUTRITION_VALIDATOR_MIGRATION_SHA256}],migrations:[{filename:web.NUTRITION_VALIDATOR_MIGRATION,rawSha256:web.NUTRITION_VALIDATOR_MIGRATION_SHA256,payloadSha256:sha("1")}],
   immutableSha256:db.immutableSha256,afterImmutableSha256:db.immutableSha256,afterScope:db.beforeScope,
   attestationScope:{beforeOuterSha256:db.beforeScope.outerSha256,afterOuterSha256:db.beforeScope.outerSha256,afterAliasSha256:sha("9")},normalProjectionSha256:web.QUANTITY_V4_PROTECTION.normalProjectionSha256,functionSignature:"public.validate_recipe_nutrition_snapshot_payload(jsonb)"}};
 const record={schema:"homecook.prelaunch-protected-db-attempt.v1",feature:web.NUTRITION_VALIDATOR_FEATURE,status:"committed",reviewSha256:web.NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256,
  from:previous.from,to:previous.to,sourceReaderRef:previous.from,readerFloor:previous.from,targetSha256:db.targetSha256,
  databasePlanSha256:hash(JSON.stringify({source:previous.database.after,applied:previous.database.after})),catalogSha256:previous.database.afterCatalogSha256,immutableSha256:previous.database.immutableSha256,
  rowsPreservedInTransaction:true,controlsPreservedInTransaction:true,productWriterEnabled:true,cookedWeightWriterEnabled:true,quantityWriterEnabled:true,attestationWriterEnabled:true,workerPolicyEnabled:true,backwardCompatible:false,
  normalDataSha256:sha("1"),preservedRowsSha256:sha("2"),attestationRowsSha256:sha("3"),backup:{fullArchiveDecoded:true,sha256:sha("4"),rolesSha256:sha("5"),target},predecessorAttestation:previous.predecessorAttestation};
 return {review:previous,record,pointer:pointer("original229","9"),guardPointer:pointer("old229-guard","9"),predecessor:{record:{databasePlanSha256:sha("9")}}};
}
async function committedMaintenance() {
 const f=engineFixture(),record=await f.engine.apply(),nutrition=nutritionPredecessor(f.review),p=pointer("new231-terminal","a");
 return {...f,maintenance:{review:f.review,record,pointer:p,guardPointer:p,nutritionPredecessor:nutrition,predecessor:nutrition.predecessor}};
}
it("binds231 separately while preserving the original229 receipt and228 marker plan",async()=>{
 const {maintenance}=await committedMaintenance(),binding=web.recipeSaveRecoveryBinding(maintenance),old=web.nutritionValidatorMaintenanceBinding(maintenance.nutritionPredecessor);
 expect(binding).toMatchObject({ledgerCount:231,predecessorDatabaseReceiptSha256:old?.receipt.sha256,predecessorMaintenance:old});
 const marker={databasePlanSha256:sha("9"),databaseMaintenance:binding};
 expect(web.assertRecipeSaveRecoveryMarker(maintenance,marker)).toBe(marker);
 expect(()=>web.assertRecipeSaveRecoveryMarker(maintenance,{...marker,databasePlanSha256:maintenance.record.databasePlanSha256})).toThrow();
 expect(()=>web.assertProtectedWriterDatabaseBoundary({databaseMaintenance:old},maintenance)).toThrow();
 expect(()=>web.assertProtectedWriterDatabaseBoundary({databaseMaintenance:binding},maintenance)).not.toThrow();
});
it("accepts later legitimate HTTP fingerprints in current231 reads but not in the DDL snapshot",async()=>{
 const {maintenance,review}=await committedMaintenance(),after={...observation(review,true),receiptColumnInitiallyNull:false};
 expect(()=>db.assertRecipeSaveRecoveryObservation(review,after,"after")).toThrow();
 expect(()=>db.assertRecipeSaveRecoveryCurrentFields(review,after)).not.toThrow();
 expect(()=>db.assertRecipeSaveRecoveryCurrentFields(review,{...after,recipeFunctions:[]})).toThrow();
 expect(maintenance.record).toMatchObject({receiptColumnInitiallyNull:true});
});
it("uses the real deploy prebuild entry for only the committed exact231 full-source handoff",async()=>{
 const {maintenance,review}=await committedMaintenance(),cli=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8");
 const start=cli.indexOf("async function deploy(options) {"),end=cli.indexOf("  const release = mkdtempSync",start);
 if(start<0||end<=start)throw Error("Actual deploy entry boundary moved");
 const selection={target:review.to,files:Object.keys(review.files),scope:{database:fixedMigrations.map(row=>`supabase/migrations/${row.filename}`)}};
 const live={ref:review.from,buildId:review.predecessorBuildId,plistSha256:review.predecessorPlistSha256};
 const run=(changes:object={},handoff=maintenance,chosen=selection)=>{
  const invoke=new Function("current","requireClosedR2Mode","join","root","repository","existsSync","recoveryPath","plan","readEnvironmentPatch","DeploymentError","nutritionSourceHandoff","assertNutritionValidatorSourceHandoff",
   `${cli.slice(start,end)}return {readOnlyDatabase,files:selection.files};}\nreturn deploy;`)(()=>live,()=>({review:{closed:true}}),join,temp,process.cwd(),()=>false,join(temp,"no-recovery"),()=>chosen,()=>({}),web.DeploymentError,
   ()=>({maintenance:handoff,from:live.ref,to:chosen.target,live,files:chosen.files,digests:review.files}),web.assertNutritionValidatorSourceHandoff);
  return invoke({ref:chosen.target,alreadyAppliedDb:true,dbConfig:join(temp,"unread-config"),...changes});
 };
 await expect(run()).resolves.toMatchObject({readOnlyDatabase:true});
 await expect(run({alreadyAppliedDb:false})).rejects.toThrow();
 await expect(run({},maintenance,{...selection,target:ref("f")})).rejects.toThrow();
 await expect(run({},maintenance,{...selection,files:[...selection.files,"supabase/migrations/20261014225400_foreign.sql"]})).rejects.toThrow();
 expect(()=>web.assertNutritionValidatorReaderCompensation(maintenance,{},review.to)).toThrow("forward repair");
});

it("accepts the actual reviewed A+B operator payloads, not merely synthetic SQL",async()=>{
 const realWebPath=join(temp,"exact-source-web.mjs"),realDbPath=join(temp,"exact-source-database.mjs");
 let realSource=source.replace(/export const RECIPE_SAVE_RECOVERY_MIGRATIONS = Object.freeze\([^\n]*\);/u,
   ()=>readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8").match(/export const RECIPE_SAVE_RECOVERY_MIGRATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/u)![0]);
 realSource=realSource.replace(webPath,realWebPath);
 writeFileSync(realWebPath,realSource,{mode:0o600});
 writeFileSync(realDbPath,readFileSync("scripts/lib/prelaunch-database.mjs","utf8").replace(/from "(\.\/[^"\n]+)"/gu,
   (_text,relative:string)=>`from "${pathToFileURL(relative==="./prelaunch-web-deploy.mjs"?realWebPath:join(process.cwd(),"scripts/lib",relative)).href}"`),{mode:0o600});
 const exact:typeof import("../scripts/lib/prelaunch-database.mjs")=await import(pathToFileURL(realDbPath).href),r=fixture();
 const migrations=readdirSync("supabase/migrations").filter(name=>name.endsWith(".sql")).sort().slice(0,231).map(filename=>{const bytes=readFileSync(join("supabase/migrations",filename));return{filename,sha256:hash(bytes),bytes};});
 r.database.before=migrations.slice(0,229).map(({filename,sha256})=>({filename,sha256}));r.database.after=migrations.map(({filename,sha256})=>({filename,sha256}));
 r.database.migrations=migrations.slice(229).map(row=>({filename:row.filename,rawSha256:row.sha256,payloadSha256:hash(row.bytes.toString().replace(/^begin;\r?\n/iu,"").replace(/\r?\ncommit;\r?\n$/iu,""))}));
 for(const row of migrations.slice(229))r.files[`supabase/migrations/${row.filename}`]=[null,row.sha256];
 const plan=exact.planProtectedPrelaunchMigrations(r,migrations);
 expect(plan.pending.map((row:{filename:string})=>row.filename)).toEqual(fixedMigrations.map(row=>row.filename));
 expect(plan.pending.every((row:{actor?:string})=>row.actor==="postgres")).toBe(true);
 expect(()=>exact.planProtectedPrelaunchMigrations(r,[...migrations,{filename:"20261014225400_unreviewed.sql",sha256:sha("f"),bytes:Buffer.from("SELECT 1;")}])).toThrow();
});

it("never falls back to229 if the new durable loader reports an unresolved231 guard",()=>{
 const text=readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8"),start=text.indexOf("export function loadCurrentDatabaseMaintenance("),end=text.indexOf("\nexport function recipeSaveRecoveryPhaseStatus",start);
 if(start<0||end<=start)throw Error("Current maintenance loader boundary moved");let oldCalls=0;
 const load=new Function("loadRecipeRequestRoleMaintenance","loadRecipeSaveRecoveryMaintenance","loadNutritionValidatorMaintenance",text.slice(start,end).replace("export function","function")+";return loadCurrentDatabaseMaintenance;")(
   ()=>null,()=>{throw Error("owned231 outcome unresolved");},()=>{oldCalls++;return {ledgerCount:229};});
 expect(()=>load(temp)).toThrow("231 outcome unresolved");expect(oldCalls).toBe(0);
});
it("does not reconcile a foreign229 predecessor intent as a committed231 operation",async()=>{
 const f=engineFixture({ackLost:true});await expect(f.engine.apply()).rejects.toThrow();const attempt=f.getAttempt();if(!attempt)throw Error("Missing owned intent");
 await f.journal.write({...attempt,predecessorNutrition:{...f.review.predecessorNutrition,databaseReceipt:pointer("foreign229","f")}});
 await expect(f.engine.reconcile()).rejects.toThrow("intent differs");expect(f.getAttempt()).toMatchObject({status:"unknown"});expect(f.queries.filter(q=>q==="SELECT 2;")).toHaveLength(1);
});

it("recognizes the two fixed new runtime contracts even with unreviewed whitespace/comments",()=>{
 const path="lib/server/recipe-content-snapshot-future-propagation.ts",route="app/api/v1/recipes/[id]/route.ts";
 expect(web.recipeSaveRecoveryRuntimeContract(path,Buffer.from('calculation_version: quantityV4 ? "recipe-nutrition-v5" : oldVersion // added comment'))).toBe(true);
 expect(web.recipeSaveRecoveryRuntimeContract(route,Buffer.from('callFuturePropagationRpc(client, /* comment */ "write_recipe_future_plan_change_recoverable", args)'))).toBe(true);
 expect(web.recipeSaveRecoveryRuntimeContract(route,Buffer.from('callFuturePropagationRpc(client,"write_recipe_future_plan_change",args)'))).toBe(false);
 expect(web.recipeSaveRecoveryRuntimeContract("lib/server/other.ts",Buffer.from('"recipe-nutrition-v5"'))).toBe(false);
});
it("the actual source helper sends partial runtime-only variants to the exact231 guard",async()=>{
 const {maintenance,review}=await committedMaintenance(),cli=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"),start=cli.indexOf("function nutritionSourceHandoff("),end=cli.indexOf("\nasync function stageRound2Readiness",start);
 if(start<0||end<=start)throw Error("Actual source helper moved");
 const route="app/api/v1/recipes/[id]/route.ts",serializer="lib/server/recipe-content-snapshot-future-propagation.ts";
 let current:typeof maintenance|null=maintenance,fullAlreadyLive=false;
 const invoke=new Function("recipeSaveRecoveryRuntimeContract","RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES","RECIPE_SAVE_RECOVERY_FEATURE","RECIPE_SAVE_RECOVERY_MIGRATIONS","NUTRITION_VALIDATOR_MIGRATION","loadCurrentDatabaseMaintenance","repository","DeploymentError","hash","git","execFileSync","spawnSync","RECIPE_REQUEST_ROLE_MIGRATION","RECIPE_REQUEST_ROLE_FEATURE","V74_WEB_PREDECESSOR",cli.slice(start,end)+";return nutritionSourceHandoff;")(
   web.recipeSaveRecoveryRuntimeContract,web.RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES,web.RECIPE_SAVE_RECOVERY_FEATURE,web.RECIPE_SAVE_RECOVERY_MIGRATIONS,web.NUTRITION_VALIDATOR_MIGRATION,()=>current,temp,web.DeploymentError,hash,()=>"owned blob",
   (_program:string,args:string[])=>args.at(-1)!.endsWith(serializer)?Buffer.from('"recipe-nutrition-v5" // whitespace-only variant'):Buffer.from('"read_recipe_future_patch_result" // comment'),()=>({status:fullAlreadyLive?0:1}),web.RECIPE_REQUEST_ROLE_MIGRATION,web.RECIPE_REQUEST_ROLE_FEATURE,"0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7");
 const live={ref:review.from,buildId:review.predecessorBuildId,plistSha256:review.predecessorPlistSha256,bytes:Buffer.from("owned plist")};
 for(const files of [[route],[serializer],[route,serializer],[route,`supabase/migrations/${fixedMigrations[0].filename}`]]){
   const handoff=invoke(live,{target:review.to,files});expect(handoff).toBeTruthy();expect(()=>web.assertRecipeSaveRecoverySourceHandoff(handoff)).toThrow();
 }
 current=null;expect(()=>invoke(live,{target:review.to,files:[route]})).toThrow("not already committed");
 current=maintenance;fullAlreadyLive=true;expect(invoke(live,{target:ref("f"),files:[route]})).toBeUndefined();
});

function databaseCliFixture(phase:string,denyWorker=false) {
 const review=fixture(),source=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"),start=source.indexOf("async function runProtectedDatabasePhase("),end=source.indexOf("\nasync function runProtectedWriterPhase(",start);
 if(start<0||end<=start)throw Error("Actual database CLI entry moved");
 const admission=vi.fn<(review:object,repositoryRoot:string,operationId?:string)=>void>(()=>{if(denyWorker)throw Error("owned pending worker journal");}),observe=vi.fn(async()=>observation(review));
 const verifyReader=vi.fn(),writerAdmission=vi.fn(),createDatabase=vi.fn(async({assertBoundary}:{assertBoundary:()=>Promise<void>})=>({
  apply:async()=>{await assertBoundary();await assertBoundary();return {status:"not_applied"};},
  reconcile:async()=>{await assertBoundary();return {status:"not_applied"};}}));
 const guard={operationId:"12345678-1234-4123-8123-123456789abc",operationDirectory:join(temp,"operations","12345678-1234-4123-8123-123456789abc"),status:phase==="reconcile"?"unknown":"not_applied",
  reviewSha256:sha("8"),from:review.from,to:review.to,targetSha256:review.database.targetSha256};
 const deps={root:temp,repository:temp,RECIPE_REQUEST_ROLE_FEATURE:web.RECIPE_REQUEST_ROLE_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE:web.RECIPE_SAVE_RECOVERY_FEATURE,NUTRITION_VALIDATOR_FEATURE:web.NUTRITION_VALIDATOR_FEATURE,QUANTITY_V4_FEATURE:web.QUANTITY_V4_FEATURE,
  current:()=>({ref:review.from,cwd:temp,buildId:review.predecessorBuildId,bytes:Buffer.from("owned plist")}),requireClosedR2Mode:()=>({}),smoke:vi.fn(async()=>{}),
  assertRecipeSaveRecoveryReader:verifyReader,verifyRecipeSaveRecoveryPredecessor:()=>({predecessor:{}}),verifyNutritionValidatorWriterAdmission:writerAdmission,nutritionValidatorMaintenanceBinding:()=>({ledgerCount:229}),
  verifyRecipeSaveRecoveryWorkerAdmission:admission,protectedRolloutPaths:()=>({databaseGuardPath:join(temp,"guard.json"),operationRoot:join(temp,"operations")}),
  verifyQuantityV4WorkerBoundary:()=>{throw Error("Unexpected C04 mutation");},plan:vi.fn(),openProtectedPrelaunchTarget:async()=>({observe}),assertProtectedPrelaunchObservation:vi.fn(),say:vi.fn(),
  hash,readFileSync:()=>Buffer.from("owned reader"),readClosedR2PrivateBytes:()=>Buffer.from(JSON.stringify(guard)),join,mkdirSync:vi.fn(),randomUUID:()=>guard.operationId,
  protectedRolloutPins:()=>({rollout:{sha256:sha("8")}}),createProtectedPrelaunchDatabase:createDatabase,protectedMigrationsAt:()=>[],
  acquireClosedR2ControlLease:async()=>({verify:vi.fn(),release:vi.fn(async()=>{})}),loadClosedR2Review:()=>({}),verifyProtectedBoundary:vi.fn(),cancellation:{check:vi.fn()},DeploymentError:web.DeploymentError};
 const run=new Function(...Object.keys(deps),source.slice(start,end)+";return runProtectedDatabasePhase;")(...Object.values(deps));
 return {admission,observe,verifyReader,writerAdmission,createDatabase,run:(action="apply")=>run({ref:review.to,protectedPhase:phase},action,review)};
}

it.each(["database","database-retry"])("actual %s CLI rechecks journal admission with its operation before SQL and COMMIT",async phase=>{
 const f=databaseCliFixture(phase);await f.run();
 expect(f.admission).toHaveBeenCalledTimes(3);expect(f.admission.mock.calls[0]?.[2]).toBeUndefined();
 expect(f.admission.mock.calls.slice(1).every(call=>call[2]==="12345678-1234-4123-8123-123456789abc")).toBe(true);
 expect(f.createDatabase).toHaveBeenCalledOnce();expect(f.writerAdmission).toHaveBeenCalledTimes(3);
});
it("actual DB plan rejects pending worker before target observation or engine creation",async()=>{
 const f=databaseCliFixture("database",true);await expect(f.run("plan")).rejects.toThrow("pending worker journal");
 expect(f.observe).not.toHaveBeenCalled();expect(f.createDatabase).not.toHaveBeenCalled();
});
it("actual unknown DB read-only reconcile retains reader/writer checks without gaining new SQL admission",async()=>{
 const f=databaseCliFixture("reconcile",true);await expect(f.run()).resolves.toBeUndefined();
 expect(f.admission).not.toHaveBeenCalled();expect(f.verifyReader).toHaveBeenCalledTimes(2);expect(f.writerAdmission).toHaveBeenCalledTimes(2);
 expect(f.createDatabase).toHaveBeenCalledOnce();
});
