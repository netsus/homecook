#!/usr/bin/env node
// Restores an existing, hash-pinned schema-only native fixture. No live DB input.
import assert from "node:assert/strict";
import {canonicalCookingSchemaDump} from "./lib/cooking-schema-restore-comparison.mjs";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "./lib/full-local-security-inventory.mjs";
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS } from "./lib/youtube-extraction-worker-artifact.mjs";
import { readPinnedLocalDockerTarget } from "./lib/local-supabase-isolated-runtime.mjs";

const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const hash = value => createHash("sha256").update(value).digest("hex");
const tag = randomBytes(16).toString("hex");
const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const run = (file, args, input) => spawnSync(file, args, { env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
const required = (args, input) => { const r = run("docker", args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let container;
const runnerSha256=hash(readFileSync(new URL(import.meta.url)));
const report = { runnerSha256, schema: "homecook.saved-catalog-postgres.v1", runId: tag, status: "RUNNING", network: "none", productionConnections: 0, applicationDataRestored: false, migrations: [], tests: [] };
const publicationMode=process.argv[2]==="--publication-regression";
const reportPath=publicationMode?"/tmp/homecook-saved-publication-postgres-report.json":"/tmp/homecook-saved-catalog-postgres-report.json";
writeFileSync(reportPath, JSON.stringify(report, null, 2));
const catalogSql = `select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'schema',n.nspname,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'catalog_attributes',to_jsonb(p)-'provolatile','body',md5(btrim(p.prosrc,chr(10))),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'security',p.prosecdef,'volatility',p.provolatile,'configuration',p.proconfig,
 'acl',coalesce((select string_agg((case when a.grantee=0 then 'public' else r.rolname end)||':'||a.privilege_type||':'||a.is_grantable::text,',' order by a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>p.proowner),'')) order by n.nspname,p.proname,p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');`;
try {
  assert(process.argv.length===2||(process.argv.length===3&&publicationMode),"Only --publication-regression; no target/connection arguments accepted");
  const fixtureDirectory="/private/tmp/hc-cooking-current232-2vr7HH";
  const archive=readFileSync(`${fixtureDirectory}/schema232.dump`);
  const roleBytes=readFileSync(`${fixtureDirectory}/roles-attributes.json`);
  const settingBytes=readFileSync(`${fixtureDirectory}/nonsecret-settings.json`);
  assert.equal(hash(roleBytes),"65f7df0c1d1ac3b815b3b53592eb7f88a6eb823b9ae87b1e0a8ee70ce98b890c");
  assert.equal(hash(settingBytes),"4c0a8aac57fe17b0f6f370270f6d5a8bda9f2a038d9ed2e5992cf3b2e810901b");
  const roleModel=JSON.parse(roleBytes),settings=JSON.parse(settingBytes);
  const identifier=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/u);return `"${value}"`;};
  const literal=value=>`'${String(value).replaceAll("'","''")}'`;
  assert.equal(hash(archive), "8b5fb24afc4f6635ff1640d33d73ffb3883af49b0554dad6f81735a6a7a6587b");
  report.archiveSha256 = hash(archive);
  env.DOCKER_HOST = readPinnedLocalDockerTarget().docker_host;
  const expectedImage = required(["image", "inspect", "--format", "{{.Id}}", image]);
  container = required(["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--name", `hc-saved-catalog-${tag}`, "--label", `homecook.cooked-weight-test=${tag}`, "--entrypoint", "/bin/sh", image, "-c", "exec sleep infinity"]);
  report.ownedContainerId = container;
  assert.match(container, /^[a-f0-9]{64}$/u);
  const own = () => assert.equal(required(["inspect", "--format", '{{.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.cooked-weight-test"}}', container]), `${expectedImage}|none|0|0|${tag}`);
  own();
  const exec = (args, input) => { own(); return required(["exec", "-i", container, ...args], input); };
  exec(["mkdir", "-m", "700", "-p", "/tmp/pgsocket", "/var/run/postgresql"]);
  exec(["initdb", "-D", "/tmp/cooking-pg", "-U", "supabase_admin", "--auth-local=trust", "--auth-host=trust", "--locale-provider=icu", "--icu-locale=en-US", "--locale=en_US.UTF-8"]);
  exec(["pg_ctl", "-D", "/tmp/cooking-pg", "-o", "-h 127.0.0.1 -k /tmp/pgsocket,/var/run/postgresql -c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault", "-l", "/tmp/cooking-pg.log", "-w", "start"]);
  const contextBytes=readFileSync("/private/tmp/homecook-cooking-pg-context-live-20261019.json");
  assert.equal(hash(contextBytes),"569b5da16f96c5f00a564cbe52925d6c1f73878b90ea026999c5d480c249a846");
  const context=JSON.parse(contextBytes);assert.equal(context.timeZone,"UTC");
  const contextPrefix=`do $observation_context$ begin perform set_config('search_path',${literal(context.searchPath)},false);perform set_config('TimeZone',${literal(context.timeZone)},false);end;$observation_context$;\n`;
  report.observationContext={sha256:hash(contextBytes),searchPath:context.searchPath,timeZone:context.timeZone,mode:"explicit per-query context; original role/schema unchanged"};
  const sql = (input, user = "postgres", database = "postgres") => exec(["psql", "-h", "/tmp/pgsocket", "-U", user, "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1"], contextPrefix+input);
  const toc = exec(["pg_restore", "--list"], archive);
  assert.doesNotMatch(toc, /\b(?:TABLE DATA|SEQUENCE SET|BLOB DATA)\b/u);
  for(const role of roleModel.roles.filter(role=>!role.name.startsWith("pg_"))) {
    const name=identifier(role.name);
    if(role.name!=="supabase_admin")sql(`create role ${name};`,"supabase_admin");
    const flags=Object.entries({superuser:"SUPERUSER",inherit:"INHERIT",createrole:"CREATEROLE",createdb:"CREATEDB",login:"LOGIN",replication:"REPLICATION",bypassrls:"BYPASSRLS"}).map(([key,flag])=>`${role[key]?"":"NO"}${flag}`);
    sql(`alter role ${name} ${flags.join(" ")} connection limit ${role.connection_limit}${role.valid_until?` valid until ${literal(role.valid_until)}`:""};`,"supabase_admin");
  }
  for(const member of roleModel.memberships)sql(`grant ${identifier(member.role)} to ${identifier(member.member)} with admin ${member.admin},inherit ${member.inherit},set ${member.set} granted by ${identifier(member.grantor)};`,"supabase_admin");
  for(const setting of settings.role_settings) {
    assert.equal(setting.database,"*");const at=setting.setting.indexOf("="),key=setting.setting.slice(0,at),value=setting.setting.slice(at+1);
    assert.match(key,/^(?:pgrst\.[a-z_]+|search_path|statement_timeout|lock_timeout|default_transaction_read_only)$/u);
    assert.doesNotMatch(value,/[;'\n\r]/u);
    sql(`alter role ${identifier(setting.role)} set ${key} to ${key==="search_path"?value:literal(value)};`,"supabase_admin");
  }
  report.roleModel={source:"current20261019 read-only catalog",roleCount:roleModel.roles.length,memberships:roleModel.memberships.length,passwordsCopied:false,operatingDataCopied:false};
  exec(["pg_restore", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--clean", "--if-exists", "--exit-on-error"], archive);
  const sourceSchema=exec(["pg_restore","--schema-only","--file=-"],archive);
  const restoredSchema=exec(["pg_dump","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","--schema-only","--no-comments"]);
  writeFileSync(`/tmp/homecook-saved-catalog-${tag}-source.sql`,sourceSchema,{mode:0o600});
  writeFileSync(`/tmp/homecook-saved-catalog-${tag}-restored.sql`,restoredSchema,{mode:0o600});
  assert.equal(hash(canonicalCookingSchemaDump(restoredSchema)),hash(canonicalCookingSchemaDump(sourceSchema)),"Restored schema SQL differs beyond reviewed deparse/set ordering");
  report.restoredSchemaSqlMatches={sourceSqlSha256:hash(sourceSchema),restoredSqlSha256:hash(restoredSchema),rawExactMatch:sourceSchema===restoredSchema,canonicalSha256:hash(canonicalCookingSchemaDump(sourceSchema)),commentsExcluded:true,normalizations:"dump headers/restrict tokens; five reviewed varchar-array checks; policy role set order; consecutive GRANT order within ACL blocks; REVOKE/context order preserved",tableData:false};
  const counts = JSON.parse(sql(`create temp table counts(n bigint);do $$ declare t record;n bigint;begin for t in select ns.nspname,c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where c.relkind in('r','p') and ns.nspname not like 'pg_%' and ns.nspname<>'information_schema' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') loop execute format('select count(*) from %I.%I',t.nspname,t.relname) into n;insert into counts values(n);end loop;end$$;select jsonb_build_object('tables',count(*),'rows',sum(n)) from counts;`, "supabase_admin"));
  assert(counts.tables>=153); assert.equal(counts.rows, 0); report.beforeSeed = counts;
  report.databaseContext=JSON.parse(sql("select jsonb_build_object('provider',datlocprovider,'collate',datcollate,'ctype',datctype,'icuLocale',to_jsonb(pg_database)->>'datlocale','searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone')) from pg_database where datname=current_database();"));
  const restoredRoleModel=JSON.parse(sql(`select jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassrls',rolbypassrls,'connection_limit',rolconnlimit,'valid_until',rolvaliduntil) order by rolname) from pg_roles),'memberships',(select jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,'admin',am.admin_option,'inherit',am.inherit_option,'set',am.set_option) order by r.rolname,m.rolname,g.rolname) from pg_auth_members am join pg_roles r on r.oid=am.roleid join pg_roles m on m.oid=am.member join pg_roles g on g.oid=am.grantor));`));
  assert.deepEqual(restoredRoleModel,roleModel);report.roleAttributesAndMembershipsMatch=true;
  assert.equal(sql("select to_regprocedure('public.verify_full_local_postgrest_request_authority()') is not null;"),"t");
  const restoredSettings=JSON.parse(sql("select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'database',coalesce(d.datname,'*'),'setting',s.setting) order by r.rolname,d.datname,s.setting),'[]'::jsonb) from pg_db_role_setting rs left join pg_roles r on r.oid=rs.setrole left join pg_database d on d.oid=rs.setdatabase cross join lateral unnest(rs.setconfig) s(setting) where split_part(s.setting,'=',1) in ('pgrst.db_pre_request','pgrst.db_pre_config','pgrst.db_schemas','pgrst.db_anon_role','pgrst.db_extra_search_path','pgrst.db_tx_end','pgrst.db_hoisted_tx_settings','pgrst.db_prepared_statements','search_path','statement_timeout','lock_timeout','default_transaction_read_only');"));
  assert.deepEqual(restoredSettings,settings.role_settings);report.nonsecretSettingsMatch=true;
  const flags = { includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true, includeCookedWeightAttestationFunctions: true, includeRecipeSaveRecoveryFunctions: true, includeRecipeRequestRoleFunctions: true };
  report.pre232SourceInventory = assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql(flags))), flags);
  // Schema-only fixture, synthetic rows inside a rolled-back transaction. These
  // are the unchanged real readiness SQL and expected-schema contract, not a
  // simulated fingerprint or an operating worker/JWT authentication test.
  const syntheticOptions=JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS).replaceAll("'","''");
  const workerReadiness = () => JSON.parse(sql(`begin;
    insert into private.youtube_extraction_current_policy values('primary',3,'codex_cli',repeat('a',64),'${syntheticOptions}','1',null,null,true,'2026-01-01T00:00:00Z');
    insert into private.youtube_extraction_worker_credentials values('primary',50,repeat('b',64),'2099-01-01T00:00:00Z',repeat('a',40),'youtube-extraction-worker-schema-v2',
      private.youtube_extraction_policy_snapshot_digest('codex_cli',repeat('a',64),'${syntheticOptions}',3),'2026-01-01T00:00:00Z');
    set local role postgres;set local request.jwt.claims='{"role":"youtube_extraction_worker"}';
    select public.read_youtube_extraction_enqueue_readiness();rollback;`,"supabase_admin"));
  for (const [filename,expected] of [
    ["20261017210000_cooked_weight_mass_fallback.sql","9709397e9031ca28a1ae6dbb934502ef9092ca7bc0d6ba96d568121672ac7f2e"],
    ["20261017220000_cooking_execution_quantities.sql","34b2947952f4eedb55234ddf330ca0029c080d7c8d887542e8880a56106cbaa6"],
    ["20261019090000_cooking_execution_reader_transaction.sql","a24a54518783f89018645a7f9b827f97510f64e38a1ff68c2c2cd045cc213d32"]]) {
    const bytes=readFileSync(path.join("supabase/migrations",filename));assert.equal(hash(bytes),expected);sql(bytes.toString());report.migrations.push({filename,sha256:hash(bytes)});
  }
  const before=JSON.parse(sql(catalogSql)),readinessBefore=workerReadiness();
  const migration="supabase/migrations/20261019120000_youtube_saved_catalog_selection.sql",bytes=readFileSync(migration);
  sql(bytes.toString());report.migrations.push({filename:migration,sha256:hash(bytes)});
  const after=JSON.parse(sql(catalogSql));
  const exactNames=["validate_youtube_saved_recipe_editable_content","project_youtube_saved_recipe_ingredient_links","project_youtube_saved_recipe_result","read_public_youtube_saved_recipe_detail","sync_youtube_saved_recipe_canonical"];
  const changed=after.filter(row=>row.body!==before.find(old=>old.oid===row.oid)?.body);
  assert.deepEqual(changed.map(row=>row.name).sort(),exactNames.sort());
  assert.equal(after.length,before.length);
  for(const row of after){const old=before.find(item=>item.oid===row.oid);assert(old);if(exactNames.includes(row.name)){
    // Only function source/definition changes; every other pg_proc attribute,
    // owner, ACL, OID, volatility, security and search path stays identical.
    const strip=item=>({...Object.fromEntries(Object.entries(item).filter(([key])=>!["body","definition","catalog_attributes"].includes(key))),catalog_attributes:Object.fromEntries(Object.entries(item.catalog_attributes).filter(([key])=>key!=="prosrc"))});
    assert.deepEqual(strip(row),strip(old));
  }else assert.deepEqual(row,old);}
  assert.deepEqual(workerReadiness(),readinessBefore);assert.equal(readinessBefore.ready,true);
  if(publicationMode){
    const publicationBefore=JSON.parse(sql(catalogSql));
    const publicationFile="supabase/migrations/20261019130000_youtube_saved_nutrition_publication.sql",publicationBytes=readFileSync(publicationFile);
    sql(publicationBytes.toString());report.migrations.push({filename:publicationFile,sha256:hash(publicationBytes)});
    const publicationAfter=JSON.parse(sql(catalogSql));
    const changed=publicationAfter.filter(row=>row.body!==publicationBefore.find(old=>old.oid===row.oid)?.body);
    assert.deepEqual(changed.map(row=>row.name).sort(),["build_recipe_nutrition_input_guard","start_snapshot_v2_cooking_session","write_recipe_nutrition_snapshot"]);
    for(const row of publicationAfter){const old=publicationBefore.find(item=>item.oid===row.oid);assert(old);
      if(changed.some(item=>item.oid===row.oid)){
        const clean=item=>({...Object.fromEntries(Object.entries(item).filter(([key])=>!["body","definition","catalog_attributes"].includes(key))),
          catalog_attributes:Object.fromEntries(Object.entries(item.catalog_attributes).filter(([key])=>key!=="prosrc"&&(row.name!=="build_recipe_nutrition_input_guard"||key!=="prolang")))});
        assert.deepEqual(clean(row),clean(old));
      }else assert.deepEqual(row,old);
    }
    assert.deepEqual(workerReadiness(),readinessBefore);
    report.publicationFunctionDelta={changed:3,onlyPublicFunctions:true,guardLanguage:"sql-to-plpgsql",oidOwnerAclConfigSecurityVolatilityUnchanged:true,privateFunctionsUnchanged:true,workerReadinessUnchanged:true};
    const frozenFile="supabase/migrations/20261022120000_youtube_saved_nutrition_frozen_quantity.sql",frozenBytes=readFileSync(frozenFile);
    const frozenBefore=JSON.parse(sql(catalogSql));
    sql(frozenBytes.toString());report.migrations.push({filename:frozenFile,sha256:hash(frozenBytes)});
    const frozenAfter=JSON.parse(sql(catalogSql));
    assert.equal(frozenAfter.length,frozenBefore.length,"Frozen migration changed function inventory");
    const frozenChanged=frozenAfter.filter(row=>row.body!==frozenBefore.find(old=>old.oid===row.oid)?.body);
    assert.deepEqual(frozenChanged.map(row=>row.name),["build_recipe_nutrition_input_guard"]);
    for(const row of frozenAfter){const old=frozenBefore.find(item=>item.oid===row.oid);assert(old);
      if(row.name!=="build_recipe_nutrition_input_guard")assert.deepEqual(row,old);
      else assert.deepEqual({...row,body:old.body,definition:old.definition,
        catalog_attributes:Object.fromEntries(Object.entries(row.catalog_attributes).map(([key,value])=>[key,key==="prosrc"?old.catalog_attributes.prosrc:value]))},old);
    }
    assert.deepEqual(workerReadiness(),readinessBefore);
    report.frozenQuantityFunctionDelta={changed:1,onlyPublicGuard:true,oidOwnerAclConfigSecurityVolatilityUnchanged:true,workerReadinessUnchanged:true};
  }
  // Same synthetic account/session seed as the existing 235 fixture. Execute
  // only its three beforeAll SQL calls; no production rows or model requests.
  const fixturePath="tests/cooking-experience-schema232-postgres.integration.test.ts",fixture=readFileSync(fixturePath,"utf8");
  assert.equal(hash(fixture),"2a1d51a328205296c87aceecc0e443815dae23f8228a451b0dcd29d48102c0d2");
  const ast=ts.createSourceFile(fixturePath,fixture,ts.ScriptTarget.Latest,true);let seed;
  const find=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==="beforeAll"){assert.equal(seed,undefined);seed=node.arguments[0].body;}ts.forEachChild(node,find);};find(ast);assert(seed);
  const constants={owner:"b1000000-0000-4000-8000-000000000001",other:"b1000000-0000-4000-8000-000000000002",recipe:"b2000000-0000-4000-8000-000000000001",pin:"b3000000-0000-4000-8000-000000000001",ingredient:"b8000000-0000-4000-8000-000000000001",nutritionPin:"b9000000-0000-4000-8000-000000000001",column:"b6000000-0000-4000-8000-000000000001",cutover:"b5000000-0000-4000-8000-000000000001",epoch:"2026-08-08T00:00:00Z",issued:"2026-08-08T01:00:00Z",hash:"e".repeat(64)};
  let calls=0;const collect=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==="sql"){
    const literalNode=node.arguments[0];assert(ts.isStringLiteral(literalNode)||ts.isTemplateExpression(literalNode)||ts.isNoSubstitutionTemplateLiteral(literalNode));
    const statement=Function(...Object.keys(constants),`return (${literalNode.getText(ast)});`)(...Object.values(constants));
    sql(`begin;${statement}commit;`,node.arguments[2]?.kind===ts.SyntaxKind.TrueKeyword?"supabase_admin":"postgres");calls++;
  }ts.forEachChild(node,collect);};collect(seed);assert.equal(calls,3);
  env.HOMECOOK_SAVED_CATALOG_PG="1";env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER=container;env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG=tag;
  const suitePath=publicationMode?"tests/youtube-saved-publication-postgres.integration.test.ts":"tests/youtube-saved-catalog-postgres.integration.test.ts";
  const suiteSha256=hash(readFileSync(suitePath));
  // The publication suite includes full save/publish/meal lifecycles. Other owned commands retain the 60s limit.
  const result=spawnSync(process.execPath,[path.resolve("node_modules/vitest/vitest.mjs"),"run",suitePath],{env,encoding:"utf8",timeout:120_000,maxBuffer:64*1024*1024});
  assert.equal(hash(readFileSync(suitePath)),suiteSha256,"Suite source changed during verification");
  writeFileSync(publicationMode?"/tmp/homecook-saved-publication-vitest.log":"/tmp/homecook-saved-catalog-vitest.log",result.stdout+result.stderr);
  assert.equal(result.status,0,"SQL tests failed; see the matching saved catalog/publication Vitest log");
  report.suite={path:suitePath,sha256:suiteSha256,stdout:result.stdout};
  report.functionDelta={changed:5,otherFunctionsUnchanged:true,oidOwnerAclAndConfigurationUnchanged:true,workerReadinessUnchanged:true};
  report.status="PASS";
}catch(error){report.status="FAIL";report.error=error.message;process.exitCode=1;
}finally{
  try{if(container){assert.match(container,/^[a-f0-9]{64}$/u);required(["rm","-f",container]);const probe=run("docker",["inspect",container]);assert.notEqual(probe.status,0);report.cleanup=true;}}
  catch(error){report.cleanup=false;report.status="FAIL";report.cleanupError=error.message;process.exitCode=1;}
  writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");console.warn(JSON.stringify({status:report.status,reportPath,cleanup:report.cleanup,error:report.error}));
}
