// Owned network-none fixture only. No operating connection/path argument.
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import * as production from "./saved-recipe-nutrition-maintenance.mjs";
import {unchangedSavedRecipeNutritionCatalogSql,SAVED_RECIPE_NUTRITION_CATALOG_SOURCE_URL} from "./saved-recipe-nutrition-catalog.mjs";
import {canonicalCookingCatalogSql} from "./cooking-catalog-comparison.mjs";
import {COOKING_EXPERIENCE_REVIEW_PIN} from "./cooking-experience-maintenance.mjs";
import {DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS} from "./youtube-extraction-worker-artifact.mjs";
import {openProtectedMigrationSession,backupRecordingSnapshot} from "./marketing-round2-controlled-deploy.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const sha=value=>value.repeat(64);
const image=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=="oid")));
const ownedImports=(text,helper)=>text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_quote,relative)=>`from "${pathToFileURL(relative==="./saved-recipe-nutrition-maintenance.mjs"?helper:resolve("scripts/lib",relative)).href}"`);

export async function runSavedRecipeNutritionNativeRegression({container,tag,env,sql,own,settings}){
 own();assert.match(container,/^[a-f0-9]{64}$/u);assert.match(tag,/^[a-f0-9]{32}$/u);
 const originalPin=structuredClone(production.SAVED_RECIPE_NUTRITION_REVIEW_PIN);
 const directory=mkdtempSync("/private/tmp/hc-saved-nutrition-native-");
 const report={sourceSha256:Object.fromEntries(["scripts/lib/saved-recipe-nutrition-native-regression.mjs","scripts/lib/saved-recipe-nutrition-maintenance.mjs","scripts/lib/saved-recipe-nutrition-catalog.mjs","scripts/lib/prelaunch-database.mjs"].map(file=>[file,hash(readFileSync(file))])),directory,syntheticRowsOnly:true,productionConnections:0,productionPinPublished:false,cases:[],negativeChecks:[]};
 const helper=join(directory,"owned-maintenance.mjs"),database=join(directory,"owned-database.mjs");
 const source=readFileSync("scripts/lib/saved-recipe-nutrition-maintenance.mjs","utf8");
 const pinDeclaration=/^export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu;
 assert.equal([...source.matchAll(pinDeclaration)].length,1);
 writeFileSync(helper,ownedImports(source.replace(pinDeclaration,`export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object.freeze({path:${JSON.stringify(join(directory,"synthetic-review.json"))},sha256:"${sha("8")}"});`)),{mode:0o600});
 writeFileSync(database,ownedImports(readFileSync("scripts/lib/prelaunch-database.mjs","utf8"),helper),{mode:0o600});
 const feature=await import(pathToFileURL(helper).href),db=await import(pathToFileURL(database).href);
 const migrations=readdirSync("supabase/migrations").filter(name=>name.endsWith(".sql")).sort().map(filename=>{const bytes=readFileSync(join("supabase/migrations",filename));return {filename,bytes,sha256:hash(bytes)};});
 assert.equal(migrations.length,238);
 assert.deepEqual(migrations.slice(0,232).map(({filename,sha256})=>({filename,sha256})),settings.ledger.map(({filename,sha256})=>({filename,sha256})));
 for(const row of migrations.slice(232,235))sql(row.bytes.toString());
 // Seed all established synthetic authority/execution fixtures, including
 // nonempty execution rows that the new DDL must preserve byte-for-byte.
 const testEnv={...env,HOMECOOK_COOKING_SCHEMA232_PG:"1",HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER:container,HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG:tag};
 const established=spawnSync(process.execPath,[resolve("node_modules/vitest/vitest.mjs"),"run","tests/cooking-experience-schema232-postgres.integration.test.ts"],{env:testEnv,encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
 writeFileSync(join(directory,"established-tests.log"),established.stdout+established.stderr,{mode:0o600});
 assert.equal(established.status,0,"Established26 fixtures failed");assert.match(established.stdout,/26 passed/u);
 const beforeLedger=migrations.slice(0,235).map(({filename,sha256})=>({filename,sha256})),afterLedger=migrations.map(({filename,sha256})=>({filename,sha256}));
 sql(`insert into homecook_deploy.migrations(filename,sha256)values ${beforeLedger.map(row=>`(${literal(row.filename)},${literal(row.sha256)})`).join(",")};
 insert into private.youtube_extraction_current_policy values('primary',3,'codex_cli',repeat('a',64),${literal(JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS))},'1',null,null,true,'2026-01-01T00:00:00Z');
 insert into private.youtube_extraction_worker_credentials values('primary',50,repeat('b',64),'2099-01-01T00:00:00Z','1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa','youtube-extraction-worker-schema-v2',
 private.youtube_extraction_policy_snapshot_digest('codex_cli',repeat('a',64),${literal(JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS))},3),'2026-01-01T00:00:00Z');`,"supabase_admin");
 assert(Number(sql("select count(*) from private.cooking_execution_quantities;"))>0);
 const payloads=feature.SAVED_RECIPE_NUTRITION_MIGRATIONS.map((spec,i)=>{
  const row=migrations[235+i];assert.equal(row.filename,spec.filename);assert.equal(row.sha256,spec.sha256);
  assert(row.bytes.toString().startsWith(spec.prefix));return row.bytes.toString().slice(spec.prefix.length).replace(/^begin;\n/iu,"").replace(/\ncommit;\n$/iu,"");
 });
 const {COOKING_EXECUTION_TABLE_SQL}=await import("./cooking-experience-maintenance.mjs");
 const captureImages=()=>{const result=captureWithoutTable();return {...result,executionTableSha256:hash(JSON.stringify(JSON.parse(sql(COOKING_EXECUTION_TABLE_SQL))))};};
 function captureWithoutTable(){return {catalogSha256:sql(db.PROTECTED_CATALOG_SQL),immutableSha256:sql(db.PROTECTED_IMMUTABLE_CATALOG_SQL),stableImmutableSha256:sql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),
  canonicalCatalog:{catalogSha256:sql(canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL)),immutableSha256:sql(canonicalCookingCatalogSql(db.PROTECTED_IMMUTABLE_CATALOG_SQL)),stableImmutableSha256:sql(canonicalCookingCatalogSql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL))},
  unchangedCatalogSha256:sql(unchangedSavedRecipeNutritionCatalogSql(db.PROTECTED_CATALOG_SQL)),functions:JSON.parse(sql(feature.SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL))};}
 const before=captureImages();
 const post=JSON.parse(sql(`begin;${payloads.join("\n")}select jsonb_build_object('catalogSha256',(${db.PROTECTED_CATALOG_SQL.replace(/;$/u,"")}), 'immutableSha256',(${db.PROTECTED_IMMUTABLE_CATALOG_SQL.replace(/;$/u,"")}), 'stableImmutableSha256',(${db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL.replace(/;$/u,"")}),
 'canonicalCatalog',jsonb_build_object('catalogSha256',(${canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL).replace(/;$/u,"")}), 'immutableSha256',(${canonicalCookingCatalogSql(db.PROTECTED_IMMUTABLE_CATALOG_SQL).replace(/;$/u,"")}), 'stableImmutableSha256',(${canonicalCookingCatalogSql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL).replace(/;$/u,"")})),
 'functions',(${feature.SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL.replace(/;$/u,"")}));rollback;`));
 const target={fixture:true,containerId:container,tag,systemIdentifier:sql("select (pg_control_system()).system_identifier::text;","supabase_admin"),database:"postgres"};
 const workerBaseline=JSON.parse(sql(db.QUANTITY_V4_WORKER_STATE_SQL));
 for(const key of ["credentialActive","queued","processing","permitHeld","activeEnqueueSessions"])delete workerBaseline[key];
 const pointer=name=>({path:join(directory,name),sha256:sha("1")});
 const predecessor={schema:"homecook.cooking-experience-maintenance.v1",ledgerCount:235,reviewSha256:COOKING_EXPERIENCE_REVIEW_PIN.sha256,receipt:pointer("original235"),databasePlanSha256:hash(JSON.stringify({source:beforeLedger,applied:beforeLedger})),targetSha256:hash(JSON.stringify(target))};
 const review={schema:"homecook.prelaunch-protected-rollout-review.v1",feature:feature.SAVED_RECIPE_NUTRITION_FEATURE,from:"196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6",to:"b".repeat(40),approved:{database:true,reader:false,writerOn:false},databasePrecedesReader:true,readerPrecedesDatabase:false,legacyReaderCompatible:true,
  files:Object.fromEntries(feature.SAVED_RECIPE_NUTRITION_MIGRATIONS.map(spec=>[`supabase/migrations/${spec.filename}`,[null,spec.sha256]])),isolatedEvidence:pointer("isolated"),isolatedEvidenceSha256:sha("1"),legacyReaderEvidence:pointer("legacy"),postimages:pointer("postimages"),platformInventory:pointer("platform"),backupReadiness:pointer("readiness"),
  closedArtifactSha256:sha("2"),historicalProofsSha256:sha("3"),controlSha256:sha("4"),closedReviewSha256:sha("5"),consentGeneration:1,legacyMarkerDatabasePlanSha256:sha("6"),legacyReader:{ref:"196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6",buildId:"synthetic-no-web",plistSha256:sha("7")},predecessorMaintenance:predecessor,
  database:{before:beforeLedger,after:afterLedger,migrations:feature.SAVED_RECIPE_NUTRITION_MIGRATIONS.map((spec,i)=>({filename:spec.filename,rawSha256:spec.sha256,payloadSha256:hash(payloads[i])})),configPath:join(directory,"unused-config"),configSha256:sha("0"),targetSha256:hash(JSON.stringify(target)),beforeCatalogSha256:before.catalogSha256,immutableSha256:before.immutableSha256,stableImmutableSha256:before.stableImmutableSha256,
   afterCatalogSha256:post.catalogSha256,afterImmutableSha256:post.immutableSha256,catalogMode:feature.SAVED_RECIPE_NUTRITION_CATALOG_MODE,canonicalCatalog:{before:before.canonicalCatalog,after:post.canonicalCatalog},unchangedCatalogSha256:before.unchangedCatalogSha256,normalProjectionSha256:hash(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL),executionTableAfterSha256:before.executionTableSha256,
   savedRecipeNutritionFunctionsBefore:image(before.functions),savedRecipeNutritionFunctionsAfter:image(post.functions),workerBaseline,
   catalogComparison:{helperSha256:hash(readFileSync(new URL(SAVED_RECIPE_NUTRITION_CATALOG_SOURCE_URL))),catalogQuerySha256:hash(db.PROTECTED_CATALOG_SQL),immutableQuerySha256:hash(db.PROTECTED_IMMUTABLE_CATALOG_SQL),stableImmutableQuerySha256:hash(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),canonicalCatalogQuerySha256:hash(canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL)),canonicalImmutableQuerySha256:hash(canonicalCookingCatalogSql(db.PROTECTED_IMMUTABLE_CATALOG_SQL)),canonicalStableImmutableQuerySha256:hash(canonicalCookingCatalogSql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)),unchangedQuerySha256:hash(unchangedSavedRecipeNutritionCatalogSql(db.PROTECTED_CATALOG_SQL))}}};
 feature.assertSavedRecipeNutritionReview(review);
 const observedBefore=await db.createSavedRecipeNutritionAdapter({inspect:async()=>target,query:async statement=>sql(`begin read only;${statement}commit;`)},review).observe(undefined,"owned-negative-probe");
 const observedAfter={...structuredClone(observedBefore),ledger:afterLedger,catalogSha256:post.catalogSha256,immutableSha256:post.immutableSha256,stableImmutableSha256:post.stableImmutableSha256,
   canonicalCatalogSha256:post.canonicalCatalog.catalogSha256,canonicalImmutableSha256:post.canonicalCatalog.immutableSha256,canonicalStableImmutableSha256:post.canonicalCatalog.stableImmutableSha256,savedRecipeNutritionFunctions:post.functions};
 feature.assertSavedRecipeNutritionObservation(review,observedBefore,"before");feature.assertSavedRecipeNutritionObservation(review,observedAfter,"after");feature.assertSavedRecipeNutritionTransition(observedBefore,observedAfter);
 for(const [name,change]of [
   ["migration order",r=>r.database.migrations.reverse()],
   ["unrelated SQL",r=>r.files["supabase/migrations/20261019150000_foreign.sql"]=[null,sha("f")]],
   ["foreign source",r=>r.from="a".repeat(40)],
   ["writer permission",r=>r.approved.writerOn=true],
   ["helper config",r=>r.database.savedRecipeNutritionFunctionsAfter[0].config=["search_path=public"]],
   ["helper public grant",r=>r.database.savedRecipeNutritionFunctionsAfter[0].noCallerGrants=false],
   ["worker generation",r=>r.database.workerBaseline.credentialGeneration=51],
   ["existing metadata",r=>r.database.savedRecipeNutritionFunctionsAfter[1].metadataSha256=sha("f")]
 ]){const bad=structuredClone(review);change(bad);assert.throws(()=>feature.assertSavedRecipeNutritionReview(bad));report.negativeChecks.push(name);}
 for(const key of ["unchangedCatalogSha256","executionRowsSha256","ledgerPreservedRowsSha256","normalDataSha256","controlsSha256"]){const bad=structuredClone(observedAfter);bad[key]=sha("f");assert.throws(()=>feature.assertSavedRecipeNutritionTransition(observedBefore,bad));report.negativeChecks.push(`${key} mutation`);}
 const badOid=structuredClone(observedAfter);badOid.savedRecipeNutritionFunctions[1].oid++;assert.throws(()=>feature.assertSavedRecipeNutritionTransition(observedBefore,badOid));report.negativeChecks.push("existing function OID mutation");
 const badScope=structuredClone(observedAfter);badScope.scopeLink.outerOid++;assert.throws(()=>feature.assertSavedRecipeNutritionTransition(observedBefore,badScope));report.negativeChecks.push("scope OID mutation");
 const remainder=unchangedSavedRecipeNutritionCatalogSql(db.PROTECTED_CATALOG_SQL);
 for(const [name,mutation]of [
  ["table metadata","alter table private.cooking_execution_quantities add column forbidden integer;"],
  ["scope function",`do $m$declare d text;begin select pg_get_functiondef('private.verify_full_local_internal_scope()'::regprocedure)into d;if position(chr(10)||'begin'||chr(10) in d)=0 then raise exception 'scope fixture anchor absent';end if;execute replace(d,chr(10)||'begin'||chr(10),chr(10)||'begin /* forbidden */'||chr(10));end;$m$;`],
  ["role metadata","alter role anon connection limit 51;"],
  ["other overload","create function private.cooking_quantity_json_echo(text)returns text language sql as $$select $1$$;"]
 ]){const changed=sql(`begin;${mutation}${remainder}rollback;`,"supabase_admin");assert.notEqual(changed,before.unchangedCatalogSha256,name);assert.equal(sql(remainder),before.unchangedCatalogSha256);report.negativeChecks.push(`native remainder ${name}`);}

 writeFileSync("/tmp/homecook-saved-nutrition-isolated-postimages.json",JSON.stringify({before,after:post,reviewDatabase:review.database,operatingApproval:false},null,2),{mode:0o600});
 sql("create database saved_nutrition_template template postgres;","supabase_admin","template1");
 const readOnly=statement=>sql(`begin read only;set local statement_timeout='30s';${statement}\ncommit;`);
 for(const scenario of ["commit","error-after236","error-after237","error-after238","commit-ack-unknown","fence-lost-during-backup","commit-ack-oid-drift"]){
  own();sql("drop database postgres;create database postgres template saved_nutrition_template;","supabase_admin","template1");
  const operationId=randomUUID(),operationDirectory=join(directory,scenario);mkdirSync(operationDirectory,{mode:0o700});const backupDirectory=join(operationDirectory,"backup");mkdirSync(backupDirectory,{mode:0o700});
  let dispatches=0,backupTicks=0,backupCommands=0,fenceLost=false;const observations=[];
  const runBackup=(args,options={})=>new Promise((resolveBackup,reject)=>{own();backupCommands++;if(scenario==="fence-lost-during-backup"&&backupCommands===2)fenceLost=true;const timer=setInterval(()=>backupTicks++,10);const child=spawn("docker",args,{env,...options});child.stderr?.resume();child.once("error",()=>{clearInterval(timer);reject(new Error("Owned backup failed"));});child.once("close",code=>{clearInterval(timer);if(code!==0)return reject(new Error("Owned backup failed"));try{own();resolveBackup();}catch(error){reject(error);}});});
  const base={inspect:async()=>{own();return target;},query:async statement=>readOnly(statement),migrationSession:applicationName=>{
   const session=openProtectedMigrationSession(container,env,applicationName),postgresContext=JSON.parse(readOnly("select jsonb_build_object('searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));"));
   return {...session,postgresContext,query:async statement=>{if(payloads.includes(statement)){const i=payloads.indexOf(statement);dispatches++;if(scenario===`error-after${236+i}`)return session.query(`${statement}\nselect 1/0;`);}if(statement==="COMMIT;"&&["commit-ack-unknown","commit-ack-oid-drift"].includes(scenario))return session.query("COMMIT;select pg_terminate_backend(pg_backend_pid());");return session.query(statement);}};
  },backup:options=>backupRecordingSnapshot({...options,run:runBackup,container,directory:backupDirectory}),reloadSchema:async()=>sql("notify pgrst,'reload schema';")};
  const real=db.createSavedRecipeNutritionAdapter(base,review),adapter={...real,observe:async(...args)=>{const value=await real.observe(...args);observations.push(value);return value;}};
  const journal=db.createProtectedPrelaunchJournal({repositoryRoot:process.cwd(),operationDirectory,operationId,guardPath:join(directory,`${scenario}-guard.json`)});
  const engine=db.createProtectedPrelaunchDatabaseEngine({review,reviewSha256:sha("8"),operationId,adapter,journal,readMigrations:async()=>migrations,assertBoundary:async()=>{own();if(fenceLost)throw new Error("Owned admission fence lost");}});
  let firstError,result;try{result=await engine.apply();}catch(error){firstError=error;}
  const originalDispatches=dispatches;
  if(scenario==="commit-ack-oid-drift"){
   assert(firstError);assert.match(firstError.message,/session closed/u);assert.equal(dispatches,3);
   const intent=await journal.read();assert.equal(intent.status,"unknown");assert.equal(intent.commitDispatched,true);
   sql(`begin;set local role postgres;do $m$declare d text;begin select pg_get_functiondef('public.read_public_youtube_saved_recipe_detail(uuid)'::regprocedure)into d;
     execute 'drop function public.read_public_youtube_saved_recipe_detail(uuid)';execute d;end;$m$;
     revoke all on function public.read_public_youtube_saved_recipe_detail(uuid) from public,anon,authenticated,service_role;
     grant execute on function public.read_public_youtube_saved_recipe_detail(uuid) to service_role;commit;`,"supabase_admin");
   const drifted=await real.observe(undefined,`oid-drift-${operationId}`);
   feature.assertSavedRecipeNutritionObservation(review,drifted,"after");
   for(const key of ["catalogSha256","immutableSha256","stableImmutableSha256"])assert.equal(drifted[key],intent.cookingPostCatalog[key],"The negative must differ only in unrepresented OID");
   await assert.rejects(engine.reconcile(),/OID identity/u);assert.equal(dispatches,originalDispatches);assert.equal((await journal.read()).status,"unknown");
   assert.throws(()=>db.assertProtectedPrelaunchObservation(review,drifted,"after",{databaseMaintenance:{review,record:{savedRecipeNutritionFunctionOids:intent.savedNutritionTransactionRows.functionOids,savedRecipeNutritionScopeLink:intent.savedNutritionTransactionRows.scopeLink}}}),/OID identity/u);
   report.cases.push({scenario,status:"unknown-rejected",dispatches,redispatchedDuringReconcile:0,rawCatalogAndPortableImagesStillMatch:true,functionOidChanged:true,originalIntentPreserved:true,backupCommands,backupTicks,fullArchiveDecoded:intent.backup.fullArchiveDecoded});
   report.negativeChecks.push("actual identical-definition function drop/recreate after COMMIT ACK loss rejected by original OID intent");
   process.stdout.write(`PASS owned-native ${scenario} rejected\n`);continue;
  }

  if(scenario==="commit")assert.equal(firstError,undefined,firstError?.message);
  else{
   assert(firstError);
   if(scenario==="commit-ack-unknown")assert.match(firstError.message,/session closed/u);
   if(scenario==="fence-lost-during-backup"){assert.match(firstError.message,/fence lost/u);assert.equal(dispatches,0);fenceLost=false;}
   else assert.equal(dispatches,scenario.startsWith("error-after")?Number(scenario.slice(-3))-235:3);
   result=await engine.reconcile();assert.equal(dispatches,originalDispatches);
  }
  const committed=scenario==="commit"||scenario==="commit-ack-unknown";assert.equal(result.status,committed?"committed":"not_applied");assert.equal(backupCommands,4);assert(backupTicks>0);
  assert.equal(JSON.parse(readOnly("select json_agg(filename order by filename)from homecook_deploy.migrations;")).length,committed?238:235);
  const final=await real.observe(undefined,`post-${operationId}`);feature.assertSavedRecipeNutritionObservation(review,final,committed?"after":"before");
  for(const key of ["unchangedCatalogSha256","normalDataSha256","preservedRowsSha256","executionRowsSha256","ledgerPreservedRowsSha256","controlsSha256","attestationRowsSha256"])assert.equal(final[key],observations[0][key]);
  assert.deepEqual(final.worker,observations[0].worker);assert.deepEqual(final.scopeLink,observations[0].scopeLink);
  if(committed)feature.assertSavedRecipeNutritionDatabaseReceipt(review,result);
  assert.equal(hash(readFileSync(join(operationDirectory,"receipt.json"))),hash(readFileSync(join(directory,`${scenario}-guard.json`))));
  report.cases.push({scenario,status:result.status,dispatches,redispatchedDuringReconcile:dispatches-originalDispatches,backupCommands,backupTicks,fullArchiveDecoded:result.backup.fullArchiveDecoded,allRowsAndControlsPreserved:true,scopeOidsUnchanged:true,actualConnectionTermination:scenario==="commit-ack-unknown"});
  process.stdout.write(`PASS owned-native ${scenario}\n`);
 }
 assert.deepEqual(production.SAVED_RECIPE_NUTRITION_REVIEW_PIN,originalPin);
 report.postimagesPath="/tmp/homecook-saved-nutrition-isolated-postimages.json";report.postimagesSha256=hash(readFileSync(report.postimagesPath));report.status="PASS";return report;
}
