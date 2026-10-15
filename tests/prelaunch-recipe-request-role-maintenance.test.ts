import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as inventory from "../scripts/lib/full-local-security-inventory.mjs";
const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex");
const sha=(c:string)=>c.repeat(64),ref=(c:string)=>c.repeat(40);
const temp=mkdtempSync(join(realpathSync("/tmp"),"recipe-request-role-owned-"));
afterAll(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8")
  .replace(/^export const ([A-Z0-9_]+_PIN) = [\s\S]*?;(?=\r?\n)/gmu,(_text,name:string)=>`export const ${name} = Object.freeze({path:null,sha256:"${sha(name==="RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN"?"8":"1")}"});`)
  .replace(/^export const RECIPE_REQUEST_ROLE_RELEASE_SHA = [^\r\n]*;$/gmu,()=>`export const RECIPE_REQUEST_ROLE_RELEASE_SHA = "${ref("b")}";`)
  .replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',()=>`function prelaunchStateRoot() { return ${JSON.stringify(join(temp,"state"))}; }`);
const webPath=join(temp,"web.mjs");writeFileSync(webPath,source,{mode:0o600});
const web:typeof import("../scripts/lib/prelaunch-web-deploy.mjs")=await import(pathToFileURL(webPath).href);
const dbPath=join(temp,"database.mjs");writeFileSync(dbPath,readFileSync("scripts/lib/prelaunch-database.mjs","utf8").replace(/from "(\.\/[^"\n]+)"/gu,
  (_text,relative:string)=>`from "${pathToFileURL(relative==="./prelaunch-web-deploy.mjs"?webPath:join(process.cwd(),"scripts/lib",relative)).href}"`),{mode:0o600});
const db:typeof import("../scripts/lib/prelaunch-database.mjs")=await import(pathToFileURL(dbPath).href);
const raw=readFileSync(`supabase/migrations/${web.RECIPE_REQUEST_ROLE_MIGRATION.filename}`),payload=raw.toString().replace(/^begin;\n/u,"").replace(/\ncommit;\n$/u,"");
const target={fixture:true,containerId:"owned-no-production"};
function fixture() {
  const previous=JSON.parse(readFileSync("docs/security/recipe-save-recovery-source-function-postimages.json","utf8"));
  const delta=JSON.parse(readFileSync("docs/security/recipe-future-request-role-source-function-postimage.json","utf8"));
  const contracts=[...previous.functions.map((row:{postimage:{lookupSignature:string;definitionSha256:string;sourceHash:string}})=>row.postimage),previous.preserved_writer];
  const recipeFunctionsBefore=web.RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER.map(signature=>{const entry=contracts.find(row=>row.lookupSignature===signature)!;
    return {signature,definitionSha256:entry.definitionSha256,metadataSha256:sha("a"),sourceMd5:entry.sourceHash};});
  const recipeFunctionsAfter=recipeFunctionsBefore.map(row=>row.signature===delta.preimage.lookupSignature?{...row,definitionSha256:delta.postimage.definitionSha256,sourceMd5:delta.postimage.sourceHash}:{...row});
  const validator=recipeFunctionsBefore.find(row=>row.signature==="public.validate_recipe_nutrition_snapshot_payload(jsonb)")!;
  const functionBefore={definitionSha256:validator.definitionSha256,metadataSha256:validator.metadataSha256,sourceMd5:validator.sourceMd5};
  const before=Array.from({length:229},(_,i)=>({filename:`${20250000000000+i}_owned.sql`,sha256:sha("0")})).concat([...web.RECIPE_SAVE_RECOVERY_MIGRATIONS]);
  const pointer=(file:string,c:string)=>({path:join(temp,file),sha256:sha(c)});
  return {schema:"homecook.prelaunch-protected-rollout-review.v1",feature:web.RECIPE_REQUEST_ROLE_FEATURE,from:web.RECIPE_SAVE_RECOVERY_RELEASE_SHA,to:ref("b"),sourceReaderRef:web.RECIPE_SAVE_RECOVERY_RELEASE_SHA,migrationSourceRef:ref("b"),
    files:{[`supabase/migrations/${web.RECIPE_REQUEST_ROLE_MIGRATION.filename}`]:[null,hash(raw)]},readerSources:web.RECIPE_SAVE_RECOVERY_READER_SOURCES,
    predecessorBuildId:"owned-existing231",predecessorPlistSha256:sha("1"),closedArtifactSha256:sha("2"),closedReviewSha256:web.CLOSED_R2_REVIEW_PIN.sha256,
    controlSha256:sha("3"),consentGeneration:1,historicalProofsSha256:sha("4"),isolatedEvidenceSha256:sha("5"),readerFlowsSha256:sha("6"),
    isolatedEvidence:pointer("isolated","5"),readerFlows:pointer("flows","6"),platformInventory:pointer("inventory","7"),backupReadiness:pointer("readiness","8"),
    approved:{database:true,reader:false,writerOn:false},readerPrecedesDatabase:true,testScript:"test:feedback-batch:web",readerEnvironment:{},
    predecessorRecipeSave:{reviewSha256:web.RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256,databaseReceipt:pointer("original231","9"),readerFloor:ref("c")},
    database:{before,after:[...before,web.RECIPE_REQUEST_ROLE_MIGRATION],migrations:[{filename:web.RECIPE_REQUEST_ROLE_MIGRATION.filename,rawSha256:hash(raw),payloadSha256:hash(payload)}],
      configPath:join(temp,"config"),configSha256:sha("0"),targetSha256:hash(JSON.stringify(target)),beforeCatalogSha256:sha("1"),afterCatalogSha256:sha("2"),immutableSha256:sha("3"),afterImmutableSha256:sha("4"),stableImmutableSha256:sha("5"),
      beforeScope:{outerSha256:sha("6"),aliasSha256:sha("7")},afterScope:{outerSha256:sha("8"),aliasSha256:sha("7")},
      attestationScope:{beforeOuterSha256:sha("6"),afterOuterSha256:sha("8"),afterAliasSha256:sha("9")},recipeScope:{beforeOuterSha256:sha("6"),afterOuterSha256:sha("8"),afterAliasSha256:sha("6")},
      normalProjectionSha256:hash(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL),postimageRegistrySha256:web.QUANTITY_V4_PROTECTION.postimageRegistrySha256,attestationPostimageRegistrySha256:sha("a"),recipePostimageRegistrySha256:web.RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256,requestRolePostimageRegistrySha256:web.RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256,
      beforeColumnsSha256:sha("a"),afterColumnsSha256:sha("a"),receiptColumnsBeforeSha256:sha("b"),receiptColumnsAfterSha256:sha("b"),recipeFunctionsBefore,recipeFunctionsAfter,functionBefore,functionAfter:functionBefore,
      workerCatalogBefore:web.QUANTITY_V4_WORKER_CATALOG_AFTER,workerCatalogAfter:web.QUANTITY_V4_WORKER_CATALOG_AFTER,
      workerBaseline:{credentialGeneration:48,workerReleaseSha:web.QUANTITY_V4_RELEASE_SHA,schemaIdentity:web.QUANTITY_V4_WORKER_SCHEMA_IDENTITY,workerPolicyEnabled:true,credentialRowSha256:sha("a"),policyRowSha256:sha("b"),policyStableSha256:sha("c"),snapshotDigest:sha("d")}}};
}
function observation(review:ReturnType<typeof fixture>,after=false) {
  const d=review.database;
  return {target,ledger:after?d.after:d.before,catalogSha256:after?d.afterCatalogSha256:d.beforeCatalogSha256,immutableSha256:after?d.afterImmutableSha256:d.immutableSha256,stableImmutableSha256:d.stableImmutableSha256,
    scope:after?d.afterScope:d.beforeScope,attestationScope:{outerSha256:after?d.afterScope.outerSha256:d.beforeScope.outerSha256,aliasSha256:d.attestationScope.afterAliasSha256},recipeScope:{outerSha256:after?d.afterScope.outerSha256:d.beforeScope.outerSha256,aliasSha256:d.recipeScope.afterAliasSha256},
    ledgerAuthority:true,active:false,normalColumnsSha256:d.afterColumnsSha256,normalProjectionSha256:d.normalProjectionSha256,postimageRegistrySha256:d.postimageRegistrySha256,attestationPostimageRegistrySha256:d.attestationPostimageRegistrySha256,recipePostimageRegistrySha256:d.recipePostimageRegistrySha256,requestRolePostimageRegistrySha256:d.requestRolePostimageRegistrySha256,
    recipeFunctions:after?d.recipeFunctionsAfter:d.recipeFunctionsBefore,receiptColumnsSha256:d.receiptColumnsAfterSha256,receiptColumnInitiallyNull:false,nutritionValidator:d.functionAfter,
    productWriterEnabled:true,cookedWeightWriterEnabled:true,quantityWriterEnabled:true,attestationWriterEnabled:true,writerEnabled:true,attestationTablesPresent:true,attestationRowsEmpty:false,metadataNull:false,
    normalDataSha256:sha("1"),preservedRowsSha256:sha("2"),attestationRowsSha256:sha("3"),controlsSha256:sha("4"),worker:{...d.workerBaseline,catalogFingerprint:d.workerCatalogAfter,credentialActive:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0}};
}
function engineFixture({ackLost=false,sqlFails=false,drift=false}={}) {
  const review=fixture(),queries:string[]=[];let state=observation(review),attempt:Record<string,unknown>|null=null,dispatched=0;
  const backup={fullArchiveDecoded:true,sha256:sha("1"),rolesSha256:sha("2"),snapshot:"00000001-00000002-1",target};
  const session={postgresContext:{searchPath:'"$user", public, extensions',timeZone:"UTC"},query:async(sql:string)=>{
    queries.push(sql);
    if(sql==="SELECT session_user;" || sql==="SELECT current_user;" && queries.at(-2)==="RESET ROLE;")return "supabase_admin";
    if(sql==="SELECT current_user;")return "postgres";
    if(sql==="SELECT pg_export_snapshot();")return backup.snapshot;
    if(sql===payload){dispatched++;if(sqlFails)throw Error("owned SQL failed");}
    if(sql.includes("INSERT INTO homecook_deploy.migrations")){state=observation(review,true);if(drift)state.normalDataSha256=sha("f");}
    if(sql==="ROLLBACK;")state=observation(review);
    if(sql==="COMMIT;"&&ackLost)throw Error("owned ACK lost");return "";
  },close:async()=>{},stop:()=>{}};
  const adapter={observe:async()=>structuredClone(state),migrationSession:()=>session,backup:async()=>backup,reloadSchema:async(operationId:string)=>{expect(operationId).toBe("12345678-1234-4123-8123-123456789abc");}};
  const journal={read:async()=>attempt,write:async(value:Record<string,unknown>)=>{attempt=structuredClone(value);}};
  const migrations=[...review.database.before.map(row=>({...row,bytes:Buffer.alloc(0)})),{...web.RECIPE_REQUEST_ROLE_MIGRATION,bytes:raw}];
  const engine=db.createProtectedPrelaunchDatabaseEngine({review,reviewSha256:sha("8"),operationId:"12345678-1234-4123-8123-123456789abc",adapter,journal,readMigrations:async()=>migrations,assertBoundary:async()=>{}});
  return {review,queries,engine,migrations,getState:()=>state,getAttempt:()=>attempt,dispatched:()=>dispatched};
}

describe("fixed metadata-only231 to232 maintenance",()=>{
  it("denies an unbound owned copy before private authority I/O and preserves current whole rows including receipt19",async()=>{
    const unboundSource=source
      .replace(/^export const RECIPE_REQUEST_ROLE_RELEASE_SHA = [^\r\n]*;$/gmu,()=>"export const RECIPE_REQUEST_ROLE_RELEASE_SHA = null;")
      .replace(/^export const RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN = [^\r\n]*;$/gmu,()=>"export const RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN = Object.freeze({path:null,sha256:null});");
    const unboundPath=join(temp,"unbound-web.mjs");writeFileSync(unboundPath,unboundSource,{mode:0o600});
    const unbound:typeof import("../scripts/lib/prelaunch-web-deploy.mjs")=await import(pathToFileURL(unboundPath).href);
    expect(unbound.RECIPE_REQUEST_ROLE_RELEASE_SHA).toBeNull();expect(unbound.RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN).toEqual({path:null,sha256:null});
    expect(()=>unbound.loadProtectedRolloutReview(temp,{feature:web.RECIPE_REQUEST_ROLE_FEATURE})).toThrow(/비어/u);
    expect(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL).toContain("FROM public.mutation_idempotency_keys");
    expect(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL).not.toContain(db.RECIPE_SAVE_RECEIPT_COLUMNS.join(","));
  });
  it("requires exact single SQL and unchanged ten functions, validator, receipt metadata and reader",()=>{
    const r=fixture();expect(()=>web.assertRecipeRequestRoleReview(r)).not.toThrow();
    for(const change of [()=>{r.database.after.push(r.database.after[231]);},()=>{r.database.recipeFunctionsAfter[0].sourceMd5="f".repeat(32);},()=>{r.database.receiptColumnsAfterSha256=sha("f");},()=>{r.files["lib/server/foreign.ts"]=[sha("1"),sha("2")];}]){
      const original=structuredClone(r);change();expect(()=>web.assertRecipeRequestRoleReview(r)).toThrow();Object.assign(r,original);
    }
    const live={ref:r.from,buildId:r.predecessorBuildId,plistSha256:r.predecessorPlistSha256,readerSources:r.readerSources,healthy:true};
    expect(()=>web.assertRecipeRequestRoleReader(r,live)).not.toThrow();expect(()=>web.assertRecipeRequestRoleReader(r,{...live,ref:ref("c")})).toThrow();
  });
  it("applies only the real232 payload and ledger atomically with original full-data proof",async()=>{
    const f=engineFixture(),record=await f.engine.apply();expect(record).toMatchObject({feature:web.RECIPE_REQUEST_ROLE_FEATURE,status:"committed",requestRoleCorrected:true,rowsPreservedInTransaction:true,controlsPreservedInTransaction:true});
    expect(f.getState().ledger).toHaveLength(232);expect(f.dispatched()).toBe(1);expect(()=>web.assertRecipeRequestRoleDatabaseReceipt(f.review,record)).not.toThrow();
    expect(f.queries.filter(q=>/UPDATE .*control|UPDATE .*policy/u.test(q))).toEqual([]);
  });
  it.each([{sqlFails:true},{drift:true}])("rolls back SQL or nonnull receipt/data drift without a232 terminal",async options=>{
    const f=engineFixture(options);await expect(f.engine.apply()).rejects.toThrow();expect(f.getState().ledger).toHaveLength(231);expect(f.queries).not.toContain("COMMIT;");
  });
  it("keeps ACK unknown closed and reconciles the same intent read-only without rerunning SQL",async()=>{
    const f=engineFixture({ackLost:true});await expect(f.engine.apply()).rejects.toMatchObject({databaseState:{outcome:"unknown",automaticRetryAllowed:false}});
    await expect(f.engine.apply()).rejects.toThrow("automatic retry");await expect(f.engine.reconcile()).resolves.toMatchObject({status:"committed",requestRoleCorrected:true});expect(f.dispatched()).toBe(1);
  });
  it.each(["unknown","applying_precommit","commit_dispatch_guard","rolled_back_before_commit"])("never treats %s as old committed231",status=>{
    expect(web.recipeRequestRolePhaseStatus({review:fixture(),record:{status}},true)).toMatchObject({appliedLedgerCount:null,databasePlanSha256:null,normalDeploymentAllowed:false});
  });
  it("selects outer232 only explicitly while retaining the original109 and11 contracts",()=>{
    const base={includeCookedWeightEvidenceFunctions:true,includeQuantityInputV4Functions:true,includeCookedWeightAttestationFunctions:true,includeRecipeSaveRecoveryFunctions:true};
    const old=inventory.buildRecipeProductSourceFunctionInventorySql(base),next=inventory.buildRecipeProductSourceFunctionInventorySql({...base,includeRecipeRequestRoleFunctions:true});
    expect(old).toContain("cdba05648213ef145555dfc02fd234c8");expect(next).toContain("e6eb35af2e77538b72d655b16f408967");
    expect(inventory.buildRecipeSaveRecoverySourceFunctionInventorySql({includeRecipeRequestRoleFunctions:true})).toContain("3b5f09838ffee6b4a2844bc3eebe86cd6eb75601b8ab7fc4703feb8ddeae1320");
    expect(()=>inventory.buildRecipeProductSourceFunctionInventorySql({includeRecipeRequestRoleFunctions:true})).toThrow(/predecessor/u);
  });
});

function databaseCliFixture(phase:string,denyWorker=false) {
 const review=fixture(),cli=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"),start=cli.indexOf("async function runProtectedDatabasePhase("),end=cli.indexOf("\nasync function runProtectedWriterPhase(",start);
 const admission=vi.fn<(review:object,repositoryRoot:string,operationId?:string)=>void>(()=>{if(denyWorker)throw Error("owned pending worker journal");}),observe=vi.fn(async()=>observation(review));
 const reader=vi.fn(),writer=vi.fn(),createDatabase=vi.fn(async({assertBoundary}:{assertBoundary:()=>Promise<void>})=>({
  apply:async()=>{await assertBoundary();await assertBoundary();return {status:"not_applied"};},reconcile:async()=>{await assertBoundary();return {status:"not_applied"};}}));
 const guard={operationId:"12345678-1234-4123-8123-123456789abc",operationDirectory:join(temp,"operations","12345678-1234-4123-8123-123456789abc"),status:phase==="reconcile"?"unknown":"not_applied",
  reviewSha256:sha("8"),from:review.from,to:review.to,targetSha256:review.database.targetSha256};
 const deps={root:temp,repository:temp,RECIPE_REQUEST_ROLE_FEATURE:web.RECIPE_REQUEST_ROLE_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE:web.RECIPE_SAVE_RECOVERY_FEATURE,NUTRITION_VALIDATOR_FEATURE:web.NUTRITION_VALIDATOR_FEATURE,QUANTITY_V4_FEATURE:web.QUANTITY_V4_FEATURE,
  current:()=>({ref:review.from,cwd:temp,buildId:review.predecessorBuildId,bytes:Buffer.from("owned plist")}),requireClosedR2Mode:()=>({}),smoke:vi.fn(async()=>{}),
  assertRecipeRequestRoleReader:reader,verifyRecipeRequestRolePredecessor:()=>({predecessor:{}}),verifyNutritionValidatorWriterAdmission:writer,nutritionValidatorMaintenanceBinding:()=>({ledgerCount:231}),
  verifyRecipeRequestRoleWorkerAdmission:admission,protectedRolloutPaths:()=>({databaseGuardPath:join(temp,"guard.json"),operationRoot:join(temp,"operations")}),
  verifyQuantityV4WorkerBoundary:()=>{throw Error("Unexpected C04 mutation");},plan:vi.fn(),openProtectedPrelaunchTarget:async()=>({observe}),assertProtectedPrelaunchObservation:vi.fn(),say:vi.fn(),
  hash,readFileSync:()=>Buffer.from("owned reader"),readClosedR2PrivateBytes:()=>Buffer.from(JSON.stringify(guard)),join,mkdirSync:vi.fn(),randomUUID:()=>guard.operationId,
  protectedRolloutPins:()=>({rollout:{sha256:sha("8")}}),createProtectedPrelaunchDatabase:createDatabase,protectedMigrationsAt:()=>[],
  acquireClosedR2ControlLease:async()=>({verify:vi.fn(),release:vi.fn(async()=>{})}),loadClosedR2Review:()=>({}),verifyProtectedBoundary:vi.fn(),cancellation:{check:vi.fn()},DeploymentError:web.DeploymentError};
 const run=new Function(...Object.keys(deps),cli.slice(start,end)+";return runProtectedDatabasePhase;")(...Object.values(deps));
 return {admission,observe,reader,writer,createDatabase,run:(action="apply")=>run({ref:review.to,protectedPhase:phase},action,review)};
}
it.each(["database","database-retry"])("actual232 %s entry checks worker journal at SQL and COMMIT boundaries",async phase=>{
 const f=databaseCliFixture(phase);await f.run();expect(f.admission).toHaveBeenCalledTimes(3);
 expect(f.admission.mock.calls[1][2]).toBe("12345678-1234-4123-8123-123456789abc");
});
it("actual232 plan denies pending worker before target reads",async()=>{
 const f=databaseCliFixture("database",true);await expect(f.run("plan")).rejects.toThrow("pending worker");expect(f.observe).not.toHaveBeenCalled();expect(f.createDatabase).not.toHaveBeenCalled();
});
it("actual unknown232 reconcile checks reader/writer while never gaining new SQL admission",async()=>{
 const f=databaseCliFixture("reconcile",true);await expect(f.run()).resolves.toBeUndefined();expect(f.admission).not.toHaveBeenCalled();expect(f.reader).toHaveBeenCalledTimes(2);expect(f.writer).toHaveBeenCalledTimes(2);
});
