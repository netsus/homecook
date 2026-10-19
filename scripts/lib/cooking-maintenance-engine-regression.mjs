// Disposable-fixture harness only. No operating adapter, config, credentials,
// launchctl, review publication or remote target arguments are accepted here.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openProtectedMigrationSession,backupRecordingSnapshot} from './marketing-round2-controlled-deploy.mjs';
import {DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS} from './youtube-extraction-worker-artifact.mjs';
import * as production from './cooking-experience-maintenance.mjs';
import {canonicalCookingCatalogSql,unchangedCookingCatalogSql,COOKING_CATALOG_SOURCE_URL} from './cooking-catalog-comparison.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const sha=value=>value.repeat(64),ref=value=>value.repeat(40);

// Test-only source seam: one exact declaration is replaced in an owned copy.
// Nothing writes or overrides the imported production module or its approval.
export function createOwnedCookingReviewModule(source) {
 const declaration=/^export const COOKING_EXPERIENCE_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu;
 assert.equal([...source.matchAll(declaration)].length,1,'Exactly one single-line production PIN declaration required');
 return source.replace(declaration,`export const COOKING_EXPERIENCE_REVIEW_PIN = Object.freeze({path:null,sha256:"${sha('8')}"});`);
}

export async function runCookingMaintenanceNativeRegression({container,tag,env,sql,own,settings,cookingBefore}) {
 const productionPin=structuredClone(production.COOKING_EXPERIENCE_REVIEW_PIN);
 assert(productionPin.path===null&&productionPin.sha256===null || isAbsolute(productionPin.path??'')&&/^[a-f0-9]{64}$/u.test(productionPin.sha256??''),'Production PIN shape differs');
 assert.match(container,/^[a-f0-9]{64}$/u);assert.match(tag,/^[a-f0-9]{32}$/u);own();
 const directory=mkdtempSync(join(realpathSync('/tmp'),'hc-cooking-engine-native-'));
 const report={schema:'homecook.cooking-maintenance-native.v1',status:'RUNNING',directory,productionConnections:0,productionPinPublished:false,productionPinInitiallyBound:productionPin.path!==null,syntheticRowsOnly:true,tests:[],cases:[]};
 const helper=join(directory,'fixture-cooking.mjs'),database=join(directory,'fixture-database.mjs');
 // This owned source copy is the same explicit test seam as the Node suite.
 // The imported production PIN is preserved and no real approval is written.
 writeFileSync(helper,createOwnedCookingReviewModule(readFileSync('scripts/lib/cooking-experience-maintenance.mjs','utf8')),{mode:0o600});
 const copied=readFileSync('scripts/lib/prelaunch-database.mjs','utf8').replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_quote,relative)=>`from "${pathToFileURL(relative==='./cooking-experience-maintenance.mjs'?helper:resolve('scripts/lib',relative)).href}"`);
 writeFileSync(database,copied,{mode:0o600});
 const db=await import(pathToFileURL(database).href),cooking=await import(pathToFileURL(helper).href);
 const canonicalBefore={catalog:cookingBefore.canonicalCatalogSha256,immutable:cookingBefore.canonicalImmutableSha256,stable:cookingBefore.canonicalStableImmutableSha256};
 report.canonicalLiveExpected={catalog:'e49d03ca5e78debf5e49fb192486aa0163558734855dafdba62635e251ef7421',immutable:'a10b9c123b74cb02f29d91364ebf6d1f48763641d9a9ad9bf70ddd12dfc4cc0b',stable:'e45076b6115ed4542f1508a4942d2f538a911cfc42743a08cff027b3967da3bf'};
 report.canonicalFixtureMatchesLiveExpected=JSON.stringify(canonicalBefore)===JSON.stringify(report.canonicalLiveExpected);
 report.canonicalOperatingAdoption=false;
 report.canonicalBefore=canonicalBefore;
 report.unchangedCatalogBefore=cookingBefore.unchangedCatalogSha256;
 report.rawBefore={catalog:cookingBefore.catalogSha256,immutable:cookingBefore.immutableSha256,stable:cookingBefore.stableImmutableSha256};
 const canonicalQuery=canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL);
 const differs=(beforeSql,afterSql)=>{
  const values=sql(`begin;${beforeSql}\n${canonicalQuery}\n${afterSql}\n${canonicalQuery}\nrollback;`,'supabase_admin').split('\n');
  assert.equal(values.length,2);assert.notEqual(values[0],values[1]);assert.equal(sql(canonicalQuery),canonicalBefore.catalog);
 };
 differs('create function public.cooking_catalog_fixture() returns integer language sql as $$select 1$$;', 'create or replace function public.cooking_catalog_fixture() returns integer language sql as $$select 2$$;');
 differs('grant select on public.recipes to anon;', 'grant select on public.recipes to anon with grant option;');
 differs('create policy cooking_catalog_fixture on public.recipes for select to anon using(true);', 'alter policy cooking_catalog_fixture on public.recipes using(false);');
 differs('', "alter table public.cooking_sessions drop constraint cooking_sessions_contract_namespace_check;alter table public.cooking_sessions add constraint cooking_sessions_contract_namespace_check check(session_kind in('planner','standalone','forbidden'));");
 report.tests.push('real function body, ACL grant option, RLS predicate and unregistered CHECK mutations all change fixture canonical hash and rollback; live equivalence remains separate');
 const remainderQuery=unchangedCookingCatalogSql(db.PROTECTED_CATALOG_SQL);
 report.catalogMutationChecks=[];
 const mutation=(name,query,setup,change,equal=false)=>{
  const baseline=sql(query);
  const values=sql(`begin;${setup}\n${query}\n${change}\n${query}\nrollback;`,'supabase_admin').split('\n');
  assert.equal(values.length,2,name);if(equal)assert.equal(values[0],values[1],name);else assert.notEqual(values[0],values[1],name);
  assert.equal(sql(query),baseline,`${name}: rollback restores baseline`);
  report.catalogMutationChecks.push({name,equal,rollbackRestored:true});
 };
 const rel="oid='private.auth_flow_attempts'::regclass";
 const grant=(grantor,option=false)=>`ARRAY[makeaclitem(0,(select oid from pg_roles where rolname='${grantor}'),'SELECT',${option})]`;
 mutation('allowlisted table NULL/default ACL equivalence',canonicalQuery,`update pg_class set relacl=null where ${rel};`,`update pg_class set relacl=acldefault('r',relowner) where ${rel};`,true);
 mutation('allowlisted schema NULL/default ACL equivalence',canonicalQuery,"update pg_namespace set nspacl=null where nspname='homecook_deploy';","update pg_namespace set nspacl=acldefault('n',nspowner) where nspname='homecook_deploy';",true);
 mutation('allowlisted NULL/empty ACL remain different',canonicalQuery,`update pg_class set relacl=null where ${rel};`,`update pg_class set relacl='{}'::aclitem[] where ${rel};`);
 mutation('nonallowlisted NULL/default ACL remain different',canonicalQuery,"update pg_class set relacl=null where oid='public.recipes'::regclass;","update pg_class set relacl=acldefault('r',relowner) where oid='public.recipes'::regclass;");
 mutation('ACL grantor preserved',canonicalQuery,`update pg_class set relacl=${grant('supabase_admin')} where ${rel};`,`update pg_class set relacl=${grant('postgres')} where ${rel};`);
 mutation('ACL grant option preserved',canonicalQuery,`update pg_class set relacl=${grant('supabase_admin')} where ${rel};`,`update pg_class set relacl=${grant('supabase_admin',true)} where ${rel};`);
 mutation('ACL entry deletion detected',canonicalQuery,`update pg_class set relacl=${grant('supabase_admin')} where ${rel};`,`update pg_class set relacl='{}'::aclitem[] where ${rel};`);
 const probeSetup='alter table auth.oauth_clients add column cooking_catalog_probe integer;alter table auth.oauth_clients add column cooking_catalog_probe_last text;';
 const probeGap='alter table auth.oauth_clients drop column cooking_catalog_probe_last;alter table auth.oauth_clients add column cooking_catalog_probe_last text;';
 mutation('known table physical attnum-only gap is canonical',canonicalQuery,probeSetup,probeGap,true);
 mutation('known table visible order preserved',canonicalQuery,probeSetup,'alter table auth.oauth_clients drop column cooking_catalog_probe;alter table auth.oauth_clients add column cooking_catalog_probe integer;');
 mutation('known table visible name preserved',canonicalQuery,probeSetup,'alter table auth.oauth_clients rename column cooking_catalog_probe to cooking_catalog_probe_renamed;');
 mutation('known table visible type preserved',canonicalQuery,probeSetup,'alter table auth.oauth_clients alter column cooking_catalog_probe type text;');
 mutation('remainder preserves unrelated function body',remainderQuery,'create function public.cooking_remainder_fixture() returns integer language sql as $$select 1$$;','create or replace function public.cooking_remainder_fixture() returns integer language sql as $$select 2$$;');
 mutation('remainder preserves ACL item order',remainderQuery,`update pg_class set relacl=ARRAY[makeaclitem(0,relowner,'SELECT',false),makeaclitem((select oid from pg_roles where rolname='anon'),relowner,'SELECT',false)] where ${rel};`,`update pg_class set relacl=ARRAY[relacl[2],relacl[1]] where ${rel};`);
 mutation('remainder preserves physical attnum',remainderQuery,probeSetup,probeGap);
 mutation('remainder preserves role attributes',remainderQuery,'','alter role anon connection limit 51;');
 mutation('remainder preserves schema ACL representation',remainderQuery,"update pg_namespace set nspacl=null where nspname='homecook_deploy';","update pg_namespace set nspacl=acldefault('n',nspowner) where nspname='homecook_deploy';");
 mutation('remainder excludes exact signature but keeps overload',remainderQuery,'create function private.resolve_execution_batch_nutrition(uuid,uuid) returns integer language sql as $$select 1$$;','create or replace function private.resolve_execution_batch_nutrition(uuid,uuid) returns integer language sql as $$select 2$$;',true);
 mutation('remainder rejects same-name different signature',remainderQuery,'create function private.resolve_execution_batch_nutrition(uuid) returns integer language sql as $$select 1$$;','create or replace function private.resolve_execution_batch_nutrition(uuid) returns integer language sql as $$select 2$$;');
 mutation('remainder excludes exact new table only',remainderQuery,'create table private.cooking_execution_quantities(id integer);','alter table private.cooking_execution_quantities add column fixture text;',true);
 mutation('remainder includes same-name other schema table',remainderQuery,'create table public.cooking_execution_quantities(id integer);','alter table public.cooking_execution_quantities add column fixture text;');
 report.tests.push('20 owned transactional canonical/raw remainder mutation checks; effective defaults, grantor/option/deletion, visible order/type/name, physical attnum and exact signatures');

 const beforeLedger=settings.ledger.map(({filename,sha256})=>({filename,sha256}));assert.equal(beforeLedger.length,232);
 const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort().map(filename=>{const bytes=readFileSync(join('supabase/migrations',filename));return {filename,sha256:hash(bytes),bytes};});
 assert.equal(migrations.length,235);assert.deepEqual(migrations.slice(0,232).map(({filename,sha256})=>({filename,sha256})),beforeLedger);
 const afterLedger=migrations.map(({filename,sha256})=>({filename,sha256}));
 const images=JSON.parse(readFileSync('tests/fixtures/cooking-experience-maintenance-postimages.json','utf8'));
 assert.equal(images.archiveSha256,'8b5fb24afc4f6635ff1640d33d73ffb3883af49b0554dad6f81735a6a7a6587b');
 assert.deepEqual(images.before.cookingFunctions,cookingBefore.cookingFunctions);
 const payloads=cooking.COOKING_EXPERIENCE_MIGRATIONS.map((row,index)=>{
  const bytes=migrations[232+index].bytes;assert.equal(hash(bytes),row.sha256);assert(bytes.toString().startsWith(row.prefix));
  return bytes.toString().slice(row.prefix.length).replace(/^begin;\n/iu,'').replace(/\ncommit;\n$/iu,'');
 });
 const canonicalAfterValues=sql(`begin;set local role postgres;${payloads.join('\n')}\n${canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL)}\n${canonicalCookingCatalogSql(db.PROTECTED_IMMUTABLE_CATALOG_SQL)}\n${canonicalCookingCatalogSql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)}\nrollback;`,'supabase_admin').split('\n');
 assert.equal(canonicalAfterValues.length,3);
 const isolatedCanonicalAfter={catalogSha256:canonicalAfterValues[0],immutableSha256:canonicalAfterValues[1],stableImmutableSha256:canonicalAfterValues[2]};
 const target={fixture:true,containerId:container,tag,systemIdentifier:sql('select (pg_control_system()).system_identifier::text;','supabase_admin'),database:'postgres'};
 const options=JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS);
 sql(`insert into homecook_deploy.migrations(filename,sha256) values ${beforeLedger.map(row=>`(${literal(row.filename)},${literal(row.sha256)})`).join(',')};
  insert into private.recipe_product_only_write_control values(true,true);
  insert into private.cooked_batch_weight_evidence_control values(true,true);
  insert into private.quantity_input_v4_policy values(true,true);
  insert into private.cooked_weight_user_attestation_control values(true,false);
  insert into private.youtube_extraction_current_policy values('primary',3,'codex_cli',repeat('a',64),${literal(options)},'1',null,null,true,'2026-01-01T00:00:00Z');
  insert into private.youtube_extraction_worker_credentials values('primary',50,repeat('b',64),'2099-01-01T00:00:00Z',repeat('a',40),'youtube-extraction-worker-schema-v2',
   private.youtube_extraction_policy_snapshot_digest('codex_cli',repeat('a',64),${literal(options)},3),'2026-01-01T00:00:00Z');`,'supabase_admin');
 const workerBaseline=JSON.parse(sql(db.QUANTITY_V4_WORKER_STATE_SQL));
 for(const key of ['credentialActive','queued','processing','permitHeld','activeEnqueueSessions'])delete workerBaseline[key];
 const pointer=name=>({path:join(directory,name),sha256:sha('1')});
 const review={schema:'homecook.prelaunch-protected-rollout-review.v1',feature:cooking.COOKING_EXPERIENCE_FEATURE,from:ref('a'),to:ref('b'),
  approved:{database:true,reader:false,writerOn:false},databasePrecedesReader:true,readerPrecedesDatabase:false,legacyReaderCompatible:true,
  files:Object.fromEntries(cooking.COOKING_EXPERIENCE_MIGRATIONS.map(row=>[`supabase/migrations/${row.filename}`,[null,row.sha256]])),
  isolatedEvidence:pointer('isolated'),isolatedEvidenceSha256:sha('1'),legacyReaderEvidence:pointer('old-reader'),postimages:pointer('images'),platformInventory:pointer('platform'),backupReadiness:pointer('readiness'),
  closedArtifactSha256:sha('2'),historicalProofsSha256:sha('3'),controlSha256:sha('4'),closedReviewSha256:sha('5'),consentGeneration:1,legacyMarkerDatabasePlanSha256:sha('6'),
  legacyReader:{ref:ref('a'),buildId:'synthetic-not-a-web-build',plistSha256:sha('7')},predecessorMaintenance:{schema:'homecook.recipe-request-role-maintenance.v1',ledgerCount:232,reviewSha256:sha('9'),receipt:pointer('synthetic232')},
  database:{before:beforeLedger,after:afterLedger,migrations:cooking.COOKING_EXPERIENCE_MIGRATIONS.map((row,index)=>({filename:row.filename,rawSha256:row.sha256,payloadSha256:hash(payloads[index])})),
   configPath:join(directory,'unused-config'),configSha256:sha('0'),targetSha256:hash(JSON.stringify(target)),beforeCatalogSha256:cookingBefore.catalogSha256,afterCatalogSha256:images.after.catalogSha256,
   catalogMode:cooking.COOKING_CATALOG_MODE,canonicalCatalog:{before:{catalogSha256:cookingBefore.canonicalCatalogSha256,immutableSha256:cookingBefore.canonicalImmutableSha256,stableImmutableSha256:cookingBefore.canonicalStableImmutableSha256},after:isolatedCanonicalAfter},
   unchangedCatalogSha256:cookingBefore.unchangedCatalogSha256,
   catalogComparison:{helperSha256:hash(readFileSync(new URL(COOKING_CATALOG_SOURCE_URL))),catalogQuerySha256:hash(db.PROTECTED_CATALOG_SQL),immutableQuerySha256:hash(db.PROTECTED_IMMUTABLE_CATALOG_SQL),stableImmutableQuerySha256:hash(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),unchangedQuerySha256:hash(unchangedCookingCatalogSql(db.PROTECTED_CATALOG_SQL))},
   immutableSha256:cookingBefore.immutableSha256,afterImmutableSha256:images.after.immutableSha256,stableImmutableSha256:cookingBefore.stableImmutableSha256,
   normalProjectionSha256:hash(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL),executionTableAfterSha256:hash(JSON.stringify(images.after.executionTable)),
   cookingFunctionsBefore:cookingBefore.cookingFunctions,cookingFunctionsAfter:images.after.cookingFunctions,workerBaseline}};
 cooking.assertCookingExperienceReview(review);
 sql('create database cooking_engine_template template postgres;','supabase_admin','template1');
 const runDocker=(args,options={})=>{own();const result=spawnSync('docker',args,{env,encoding:'utf8',timeout:60_000,maxBuffer:8*1024*1024,...options});assert.equal(result.status,0,'Owned fixture backup command failed');return result.stdout?.trim();};
 const readOnly=statement=>sql(`begin read only;set local statement_timeout='30s';${statement}\ncommit;`);
 for(const scenario of ['commit','error-after233','error-after234','error-after235','commit-ack-unknown']) {
  own();sql('drop database postgres;create database postgres template cooking_engine_template;','supabase_admin','template1');
  const operationId=randomUUID(),operationDirectory=join(directory,scenario);mkdirSync(operationDirectory,{mode:0o700});
  const backupDirectory=join(operationDirectory,'backup');mkdirSync(backupDirectory,{mode:0o700});
  const queries=[],observations=[];let dispatches=0,reloads=0,backupCount=0,backupTicks=0,asyncBackupCommands=0;
  const runBackup=(args,options={})=>new Promise((resolveBackup,reject)=>{
    own();asyncBackupCommands++;
    const timer=setInterval(()=>{backupTicks++;},10);
    const child=spawn('docker',args,{env,...options});
    child.stderr?.resume();
    child.once('error',()=>{clearInterval(timer);reject(new Error('Owned fixture async backup command failed; output withheld'));});
    child.once('close',code=>{clearInterval(timer);if(code!==0)return reject(new Error('Owned fixture async backup command failed; output withheld'));try{own();resolveBackup();}catch(error){reject(error);}});
  });
  const base={inspect:async()=>{own();return target;},query:async statement=>readOnly(statement),
   migrationSession:applicationName=>{
    own();const session=openProtectedMigrationSession(container,env,applicationName);
    const context=JSON.parse(readOnly("select jsonb_build_object('searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));"));
    return {...session,postgresContext:context,query:async statement=>{
     queries.push(statement);
     if(payloads.includes(statement)) {
      const index=payloads.indexOf(statement);dispatches++;
      if(scenario===`error-after${233+index}`)return session.query(`${statement}\nselect 1/0;`);
     }
     if(statement==='COMMIT;'&&scenario==='commit-ack-unknown')return session.query('COMMIT; SELECT pg_terminate_backend(pg_backend_pid());');
     return session.query(statement);
    }};
   },backup:async options=>{backupCount++;return backupRecordingSnapshot({...options,run:runBackup,container,directory:backupDirectory});},
   reloadSchema:async()=>{reloads++;sql("notify pgrst,'reload schema';");}};
  const realAdapter=db.createCookingExperienceAdapter(base,review);
  const adapter={...realAdapter,observe:async(...args)=>{const value=await realAdapter.observe(...args);observations.push(value);return value;}};
  const journal=db.createProtectedPrelaunchJournal({repositoryRoot:process.cwd(),operationDirectory,operationId,guardPath:join(directory,`${scenario}-guard.json`)});
  const engine=db.createProtectedPrelaunchDatabaseEngine({review,reviewSha256:sha('8'),operationId,adapter,journal,readMigrations:async()=>migrations,assertBoundary:async()=>own()});
  let firstError=null,result;
  try{result=await engine.apply();}catch(error){firstError=error;}
  const originalDispatches=dispatches;
  if(scenario==='commit')assert.equal(firstError,null,firstError?.message);
  else {
   assert(firstError,`${scenario} must fail before reconciliation`);
   const attempt=await journal.read();assert.equal(attempt.status,'unknown');assert.equal(attempt.commitDispatched,scenario==='commit-ack-unknown');
   // A real connection termination, not a fabricated throw after receiving ACK.
   if(scenario==='commit-ack-unknown')assert.match(firstError.message,/session closed/u);
   result=await engine.reconcile();assert.equal(dispatches,originalDispatches,'Reconciliation must not redispatch DDL');
  }
  const committed=scenario==='commit'||scenario==='commit-ack-unknown';
  assert.equal(result.status,committed?'committed':'not_applied');assert.equal(backupCount,1);assert.equal(asyncBackupCommands,4);assert(backupTicks>0,'Dump/roles/decode must keep the admission monitor event loop responsive');
  assert.equal(JSON.parse(readOnly('select json_agg(filename order by filename) from homecook_deploy.migrations;')).length,committed?235:232);
  assert.equal(readOnly("select to_regclass('private.cooking_execution_quantities') is not null;"),committed?'t':'f');
  const final=await realAdapter.observe(undefined,`post-${operationId}`);
  cooking.assertCookingExperienceObservation(review,final,committed?'after':'before');
  const initial=observations[0];for(const key of ['unchangedCatalogSha256','preservedRowsSha256','normalDataSha256','attestationRowsSha256','controlsSha256'])assert.equal(final[key],initial[key]);
  assert.deepEqual(final.worker,initial.worker);
  if(committed){cooking.assertCookingExperienceDatabaseReceipt(review,result);assert.equal(final.scopeLink.aliasOid,initial.scopeLink.outerOid);}
  const persisted=await journal.read();assert.equal(persisted.status,result.status);assert.equal(persisted.backup.fullArchiveDecoded,true);
  assert.equal(hash(readFileSync(join(operationDirectory,'receipt.json'))),hash(readFileSync(join(directory,`${scenario}-guard.json`))));
  const backupRows=runDocker(['exec','-i',container,'pg_restore','--list'],{input:readFileSync(result.backup.path)});
  assert.match(backupRows,/TABLE DATA/u);
  report.cases.push({scenario,status:result.status,originalDispatches,redispatchedDuringReconcile:dispatches-originalDispatches,realSnapshot:result.backup.snapshot,
   asyncBackupCommands,backupMonitorTimerTicks:backupTicks,fullArchiveDecoded:true,backupSha256:result.backup.sha256,rolesSha256:result.backup.rolesSha256,schemaReloads:reloads,allExistingRowsAndControlsPreserved:true,
   unchangedCatalogSha256:final.unchangedCatalogSha256,rawRemainderUnchanged:true,originalScopeOidPreserved:committed?true:null,actualConnectionTermination:scenario==='commit-ack-unknown',guardReceiptBytesMatch:true});
  process.stdout.write(`PASS owned-native ${scenario}\n`);
  report.tests.push(`${scenario}: real protected session/exported snapshot/full dump decode/ordered DDL+ledger transaction/closed receipt`);
 }
 assert.deepEqual(production.COOKING_EXPERIENCE_REVIEW_PIN,productionPin,'Production authority changed during the fixture run');
 report.unchangedCatalogAfter=sql(unchangedCookingCatalogSql(db.PROTECTED_CATALOG_SQL));
 assert.equal(report.unchangedCatalogAfter,report.unchangedCatalogBefore);
 report.catalogComparison=review.database.catalogComparison;
 report.canonicalAfter={catalog:sql(canonicalCookingCatalogSql(db.PROTECTED_CATALOG_SQL)),immutable:sql(canonicalCookingCatalogSql(db.PROTECTED_IMMUTABLE_CATALOG_SQL)),stable:sql(canonicalCookingCatalogSql(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL))};
 report.status='PASS';report.limitations=['Test-only owned module copy has a synthetic PIN; the imported production authority remains exactly unchanged.','Schema/roles fixture and synthetic control/gen50/ledger rows only; no operating user rows or worker JWT/service.','Full dumps remain private in the owned temporary evidence directory; no off-Mac transfer.','Commit reconciliation observes read-only state and may emit the existing schema-reload NOTIFY after committed classification; it does not redispatch DDL.'];
 return report;
}
