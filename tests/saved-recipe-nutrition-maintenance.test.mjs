import {after,test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import * as production from "../scripts/lib/saved-recipe-nutrition-maintenance.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex"),sha=value=>value.repeat(64);
const root=mkdtempSync("/private/tmp/hc-saved-nutrition-contract-");
const helper=join(root,"helper.mjs"),webPath=join(root,"web.mjs"),dbPath=join(root,"db.mjs");
const originalPin=structuredClone(production.SAVED_RECIPE_NUTRITION_REVIEW_PIN);
after(()=>{assert.deepEqual(production.SAVED_RECIPE_NUTRITION_REVIEW_PIN,originalPin);rmSync(root,{recursive:true,force:true});});
function imports(text,helperPath=helper){return text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_quote,relative)=>`from "${pathToFileURL(relative==="./saved-recipe-nutrition-maintenance.mjs"?helperPath:relative==="./prelaunch-web-deploy.mjs"?webPath:resolve("scripts/lib",relative)).href}"`);}
const source=readFileSync("scripts/lib/saved-recipe-nutrition-maintenance.mjs","utf8");
const declaration=/^export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu;
assert.equal([...source.matchAll(declaration)].length,1);
writeFileSync(helper,imports(source.replace(declaration,`export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object.freeze({path:${JSON.stringify(join(root,"unused-review.json"))},sha256:"${sha("8")}"});`)),{mode:0o600});
writeFileSync(webPath,imports(readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8")),{mode:0o600});
writeFileSync(dbPath,imports(readFileSync("scripts/lib/prelaunch-database.mjs","utf8")),{mode:0o600});
const feature=await import(pathToFileURL(helper).href),web=await import(pathToFileURL(webPath).href),db=await import(pathToFileURL(dbPath).href);
const fixture=JSON.parse(readFileSync("tests/fixtures/saved-recipe-nutrition-maintenance-postimages.json","utf8"));
const target={owned:true,synthetic:true};
function review(){
 const database=structuredClone(fixture.reviewDatabase);database.targetSha256=hash(JSON.stringify(target));
 const pointer=name=>({path:join(root,name),sha256:sha("1")});
 return {schema:"homecook.prelaunch-protected-rollout-review.v1",feature:feature.SAVED_RECIPE_NUTRITION_FEATURE,from:"196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6",to:"b".repeat(40),approved:{database:true,reader:false,writerOn:false},databasePrecedesReader:true,readerPrecedesDatabase:false,legacyReaderCompatible:true,
  files:Object.fromEntries(feature.SAVED_RECIPE_NUTRITION_MIGRATIONS.map(row=>[`supabase/migrations/${row.filename}`,[null,row.sha256]])),database,
  isolatedEvidence:pointer("isolated"),isolatedEvidenceSha256:sha("1"),legacyReaderEvidence:pointer("legacy"),postimages:pointer("images"),platformInventory:pointer("platform"),backupReadiness:pointer("readiness"),
  closedArtifactSha256:sha("2"),legacyMarkerDatabasePlanSha256:sha("3"),historicalProofsSha256:sha("4"),controlSha256:sha("5"),closedReviewSha256:sha("6"),consentGeneration:1,
  legacyReader:{ref:"196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6",buildId:"synthetic-no-web",plistSha256:sha("7")},
  predecessorMaintenance:{schema:"homecook.cooking-experience-maintenance.v1",ledgerCount:235,reviewSha256:"13a4fbeca9d5dfb392bef017f8bb28f85479aecdd2ba60f941e1f3b57855cdaf",receipt:pointer("original235"),targetSha256:database.targetSha256,databasePlanSha256:sha("9")}};
}
function receipt(r){return {schema:"homecook.prelaunch-protected-db-attempt.v1",feature:r.feature,status:"committed",reviewSha256:sha("8"),from:r.from,to:r.to,targetSha256:r.database.targetSha256,predecessorMaintenance:r.predecessorMaintenance,
 databasePlanSha256:hash(JSON.stringify({source:r.database.after,applied:r.database.after})),unchangedCatalogSha256:r.database.unchangedCatalogSha256,catalogComparison:r.database.catalogComparison,catalogMode:r.database.catalogMode,canonicalCatalog:r.database.canonicalCatalog.after,
 catalogSha256:fixture.after.catalogSha256,immutableSha256:fixture.after.immutableSha256,stableImmutableSha256:fixture.after.stableImmutableSha256,savedRecipeNutritionPostCatalog:{catalogSha256:fixture.after.catalogSha256,immutableSha256:fixture.after.immutableSha256,stableImmutableSha256:fixture.after.stableImmutableSha256},
 savedRecipeNutritionFunctionOids:fixture.after.functions.map(row=>[row.signature,row.oid]),savedRecipeNutritionScopeLink:{outerOid:101,aliasOid:100},
 rowsPreservedInTransaction:true,controlsPreservedInTransaction:true,featureMetadataPreservedInTransaction:true,scopeAliasOidPreservedInTransaction:true,readerReady:false,writerEnabled:false,readerFloor:r.to,legacyReaderCompatible:true,
 normalDataSha256:sha("1"),preservedRowsSha256:sha("2"),attestationRowsSha256:sha("3"),controlsSha256:sha("4"),executionRowsSha256:sha("5"),ledgerPreservedRowsSha256:sha("6"),backup:{fullArchiveDecoded:true,sha256:sha("7"),rolesSha256:sha("8"),target}};}

test("an unbound PIN rejects before config/target I/O while production authority stays unchanged",async()=>{
 assert(originalPin.path===null&&originalPin.sha256===null||typeof originalPin.path==="string"&&/^[a-f0-9]{64}$/u.test(originalPin.sha256));
 const unboundHelper=join(root,"unbound-helper.mjs"),unboundDatabase=join(root,"unbound-db.mjs");
 writeFileSync(unboundHelper,imports(source.replace(declaration,'export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object.freeze({path:null,sha256:null});')),{mode:0o600});
 writeFileSync(unboundDatabase,imports(readFileSync("scripts/lib/prelaunch-database.mjs","utf8"),unboundHelper),{mode:0o600});
 const real=await import(pathToFileURL(unboundDatabase).href);
 await assert.rejects(real.openProtectedPrelaunchTarget({repositoryRoot:process.cwd(),configPath:"/does-not-exist",backupDirectory:root,review:review()}),/PIN is unbound/);
});

test("exact235 to238 source and ordinary scanner cannot accept a different migration",()=>{
 const r=review();feature.assertSavedRecipeNutritionReview(r);
 const migrations=r.database.after.map(row=>({...row,bytes:readFileSync(`supabase/migrations/${row.filename}`)}));
 const plan=db.planProtectedPrelaunchMigrations(r,migrations);assert.equal(plan.pending.length,3);assert(plan.pending.every(row=>row.actor==="postgres"));
 for(const bytes of migrations.slice(235).map(row=>row.bytes))assert.throws(()=>db.validatePrelaunchMigrationSql(bytes.toString()));
 const changed=structuredClone(migrations);changed[235].bytes=Buffer.from("begin;\nselect 1;\ncommit;\n");assert.throws(()=>db.planProtectedPrelaunchMigrations(r,changed));
 const reordered=structuredClone(r);reordered.database.migrations.reverse();assert.throws(()=>feature.assertSavedRecipeNutritionReview(reordered));
});
test("catalog helper, generated canonical queries and full normal projection are bound before target I/O",()=>{
 for(const key of Object.keys(review().database.catalogComparison)){
  const r=review();r.database.catalogComparison[key]=sha("f");let reads=0;
  assert.throws(()=>db.createSavedRecipeNutritionAdapter({inspect:()=>{reads++;}},r),/bytes differ/);assert.equal(reads,0);
 }
 const r=review();r.database.normalProjectionSha256=sha("f");assert.throws(()=>db.createSavedRecipeNutritionAdapter({},r),/projection differs/);
});
test("separate receipt binds original235, transaction row proofs and native postimage",()=>{
 const r=review(),record=receipt(r);feature.assertSavedRecipeNutritionDatabaseReceipt(r,record);
 for(const change of [x=>x.featureMetadataPreservedInTransaction=false,x=>x.savedRecipeNutritionFunctionOids=null,x=>x.savedRecipeNutritionScopeLink=null,x=>x.executionRowsSha256=null,x=>x.ledgerPreservedRowsSha256=null,x=>x.savedRecipeNutritionPostCatalog.catalogSha256=sha("f"),x=>x.predecessorMaintenance.receipt.sha256=sha("f")]){
  const bad=structuredClone(record);change(bad);assert.throws(()=>feature.assertSavedRecipeNutritionDatabaseReceipt(r,bad));
 }
});
test("original committed OIDs reject recreation even when portable images are unchanged",()=>{
 const r=review(),record=receipt(r),intent={functionOids:record.savedRecipeNutritionFunctionOids,scopeLink:record.savedRecipeNutritionScopeLink};
 const observation={savedRecipeNutritionFunctions:structuredClone(fixture.after.functions),scopeLink:structuredClone(intent.scopeLink)};
 feature.assertSavedRecipeNutritionCommittedIdentity(intent,observation);
 observation.savedRecipeNutritionFunctions[1].oid++;
 assert.throws(()=>feature.assertSavedRecipeNutritionCommittedIdentity(intent,observation),/OID identity/);
});

test("source handoff checks every exact blob and current196 build",()=>{
 const r=review(),record=receipt(r),pointer={path:join(root,"receipt.json"),sha256:sha("1")};
 const maintenance={review:r,record,pointer,guardPointer:{...pointer}},handoff={maintenance,from:r.from,to:r.to,live:{...r.legacyReader},files:Object.keys(r.files),digests:r.files,reviewedSourceAncestor:true};
 feature.assertSavedRecipeNutritionSourceHandoff(handoff);
 for(const mutate of [x=>x.to="e".repeat(40),x=>x.live.buildId="foreign",x=>x.files.push("app/foreign.ts"),x=>x.digests[Object.keys(x.digests)[0]][1]=sha("f"),x=>x.reviewedSourceAncestor=false]){const bad=structuredClone(handoff);mutate(bad);assert.throws(()=>feature.assertSavedRecipeNutritionSourceHandoff(bad));}
 assert.throws(()=>web.assertCookingWriterStatePreserved(maintenance));
 assert.equal(web.savedRecipeNutritionPhaseStatus({review:r,record},false,false).normalDeploymentAllowed,false);
 assert.equal(web.savedRecipeNutritionPhaseStatus({review:r,record},false,true).normalDeploymentAllowed,true);
});
test("unknown or foreign238 guard cannot fall back to235; exact not-applied remains distinct",async()=>{
 const r=review(),bytes="{}\n",evidence=join(root,"evidence.json");writeFileSync(evidence,bytes,{mode:0o600});
 for(const key of ["isolatedEvidence","legacyReaderEvidence","postimages","platformInventory","backupReadiness"])r[key]={path:evidence,sha256:hash(bytes)};
 r.isolatedEvidenceSha256=r.isolatedEvidence.sha256;
 const reviewPath=join(root,"approved.json"),reviewBytes=JSON.stringify(r);writeFileSync(reviewPath,reviewBytes,{mode:0o600});
 const guardHelper=join(root,"guard-helper.mjs"),guardWeb=join(root,"guard-web.mjs"),state=join(root,"state");mkdirSync(state,{mode:0o700});
 writeFileSync(guardHelper,imports(source.replace(declaration,`export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object.freeze(${JSON.stringify({path:reviewPath,sha256:hash(reviewBytes)})});`)),{mode:0o600});
 writeFileSync(guardWeb,imports(readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8"),guardHelper).replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',`function prelaunchStateRoot() { return ${JSON.stringify(state)}; }`),{mode:0o600});
 const scoped=await import(pathToFileURL(guardWeb).href),paths=scoped.protectedRolloutPaths(state,r),id="12345678-1234-4123-8123-123456789abc";
 const guard={schema:"homecook.prelaunch-protected-db-attempt.v1",feature:r.feature,reviewSha256:hash(reviewBytes),from:r.from,to:r.to,journalFile:"attempt.json",readerFloor:r.to,predecessorMaintenance:r.predecessorMaintenance,operationId:id,operationDirectory:join(paths.operationRoot,id),status:"unknown",target};
 writeFileSync(paths.databaseGuardPath,JSON.stringify(guard),{mode:0o600});assert.equal(scoped.readSavedRecipeNutritionAttempt(process.cwd()).record.status,"unknown");assert.throws(()=>scoped.loadCurrentDatabaseMaintenance(process.cwd()),/unresolved/);
 const foreign=structuredClone(guard);foreign.predecessorMaintenance.receipt.sha256=sha("f");writeFileSync(paths.databaseGuardPath,JSON.stringify(foreign),{mode:0o600});assert.throws(()=>scoped.loadCurrentDatabaseMaintenance(process.cwd()),/foreign/);
 const terminal={...guard,status:"not_applied",targetSha256:r.database.targetSha256};delete terminal.target;mkdirSync(terminal.operationDirectory,{recursive:true,mode:0o700});const terminalBytes=JSON.stringify(terminal);writeFileSync(paths.databaseGuardPath,terminalBytes,{mode:0o600});writeFileSync(join(terminal.operationDirectory,"receipt.json"),terminalBytes,{mode:0o600});
 assert.equal(scoped.loadSavedRecipeNutritionMaintenance(process.cwd()),null);
});
