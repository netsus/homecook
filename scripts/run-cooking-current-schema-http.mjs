#!/usr/bin/env node
// Restores an existing, hash-pinned schema-only native fixture. No live DB input.
import assert from "node:assert/strict";
import {canonicalCookingSchemaDump} from "./lib/cooking-schema-restore-comparison.mjs";
import {canonicalCookingCatalogSql,unchangedCookingCatalogSql} from "./lib/cooking-catalog-comparison.mjs";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "./lib/full-local-security-inventory.mjs";
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS } from "./lib/youtube-extraction-worker-artifact.mjs";
import { readPinnedLocalDockerTarget } from "./lib/local-supabase-isolated-runtime.mjs";
import { COOKING_FUNCTIONS_SQL, COOKING_EXECUTION_TABLE_SQL, COOKING_SCOPE_LINK_SQL } from "./lib/cooking-experience-maintenance.mjs";
import { PROTECTED_CATALOG_SQL, PROTECTED_IMMUTABLE_CATALOG_SQL, COOKED_WEIGHT_STABLE_IMMUTABLE_SQL, RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL } from "./lib/prelaunch-database.mjs";

const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const hash = value => createHash("sha256").update(value).digest("hex");
const tag = randomBytes(16).toString("hex");
const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const run = (file, args, input) => spawnSync(file, args, { env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
const required = (args, input) => { const r = run("docker", args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let container, httpContainer, secretDirectory;
const report = { schema: "homecook.cooking-current-schema-http.v1", runId: tag, status: "RUNNING", network: "none", productionConnections: 0, applicationDataRestored: false, migrations: [], tests: [] };
const sqlMode=process.argv[2]==="--sql-regression",maintenanceMode=process.argv[2]==="--maintenance-regression";
const reportPath=maintenanceMode?"/tmp/homecook-cooking-maintenance-native-report.json":sqlMode?"/tmp/homecook-cooking-current-sql-report.json":"/tmp/homecook-cooking-current-http-report.json";
writeFileSync(reportPath, JSON.stringify(report, null, 2));
const catalogSql = `select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'schema',n.nspname,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'catalog_attributes',to_jsonb(p)-'provolatile','body',md5(btrim(p.prosrc,chr(10))),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'security',p.prosecdef,'volatility',p.provolatile,'configuration',p.proconfig,
 'acl',coalesce((select string_agg((case when a.grantee=0 then 'public' else r.rolname end)||':'||a.privilege_type||':'||a.is_grantable::text,',' order by a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>p.proowner),'')) order by n.nspname,p.proname,p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');`;
try {
  assert(process.argv.length===2||(process.argv.length===3&&(sqlMode||maintenanceMode)),"Only --sql-regression/--maintenance-regression accepted; no target/connection arguments");
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
  container = required(["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--name", `hc-execution-http-${tag}`, "--label", `homecook.cooked-weight-test=${tag}`, "--entrypoint", "/bin/sh", image, "-c", "exec sleep infinity"]);
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
  writeFileSync("/tmp/homecook-current-schema-source.sql",sourceSchema,{mode:0o600});
  writeFileSync("/tmp/homecook-current-schema-restored.sql",restoredSchema,{mode:0o600});
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
  const cookingImage = () => ({unchangedCatalogSha256:sql(unchangedCookingCatalogSql(PROTECTED_CATALOG_SQL)),catalogSha256:sql(PROTECTED_CATALOG_SQL),immutableSha256:sql(PROTECTED_IMMUTABLE_CATALOG_SQL),
    stableImmutableSha256:sql(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),normalProjectionSha256:hash(RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL),
    canonicalCatalogSha256:sql(canonicalCookingCatalogSql(PROTECTED_CATALOG_SQL)),canonicalImmutableSha256:sql(canonicalCookingCatalogSql(PROTECTED_IMMUTABLE_CATALOG_SQL)),
    canonicalStableImmutableSha256:sql(canonicalCookingCatalogSql(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)),
    cookingFunctions:JSON.parse(sql(COOKING_FUNCTIONS_SQL)),scopeLink:JSON.parse(sql(COOKING_SCOPE_LINK_SQL)),
    executionTable:JSON.parse(sql(`select coalesce((${COOKING_EXECUTION_TABLE_SQL.replace(/;$/u,"")}), 'null'::jsonb);`)),workerReadiness:workerReadiness()});
  const cookingBefore=cookingImage();
  const catalogPrefix="SELECT encode(sha256(convert_to((",catalogSuffix=")::text,'UTF8')),'hex');";
  assert(PROTECTED_CATALOG_SQL.startsWith(catalogPrefix)&&PROTECTED_CATALOG_SQL.endsWith(catalogSuffix),"Fixed catalog digest envelope differs");
  const catalogExpression=PROTECTED_CATALOG_SQL.slice(catalogPrefix.length,-catalogSuffix.length);
  const catalogBytes=JSON.stringify(JSON.parse(sql(`SELECT ${catalogExpression};`)))+"\n";
  const catalogPath="/private/tmp/homecook-cooking-fixture-catalog232-20261019.json";
  const {existsSync:catalogExists}=await import("node:fs");
  if(catalogExists(catalogPath))assert.equal(hash(readFileSync(catalogPath)),hash(catalogBytes),"Existing private catalog export differs; preserve it for review");
  else writeFileSync(catalogPath,catalogBytes,{mode:0o600,flag:"wx"});
  report.fixtureCatalogExport={path:catalogPath,sha256:hash(catalogBytes),privateMetadataOnly:true,applicationRows:0};
  const exportCookingImages=()=>{
    const after=cookingImage();
    assert.equal(after.unchangedCatalogSha256,cookingBefore.unchangedCatalogSha256,"Raw non-cooking catalog remainder changed");
    const expected=JSON.parse(readFileSync("scripts/manifests/youtube-extraction-expected-schema.json","utf8"));
    assert.equal(cookingBefore.workerReadiness.catalog_fingerprint,expected.catalog_fingerprint);
    assert.equal(after.workerReadiness.catalog_fingerprint,expected.catalog_fingerprint);
    assert.equal(cookingBefore.workerReadiness.ready,true);assert.deepEqual(after.workerReadiness,cookingBefore.workerReadiness);
    const evidence={schema:"homecook.cooking-current232-to235-postimages.v1",status:"isolated-candidate-not-operating-approval",archiveSha256:hash(archive),
      roleSha256:hash(roleBytes),settingsSha256:hash(settingBytes),before:cookingBefore,after,
      expectedSchemaSha256:hash(readFileSync("scripts/manifests/youtube-extraction-expected-schema.json")),
      workerReadinessScope:"unchanged SQL with synthetic rolled-back gen50/policy rows; no operating worker/JWT/service health",productionConnections:0};
    const bytes=JSON.stringify(evidence,null,2)+"\n";writeFileSync("/tmp/homecook-cooking-current232-to235-postimages.json",bytes,{mode:0o600});
    report.cookingPostimages={path:"/tmp/homecook-cooking-current232-to235-postimages.json",sha256:hash(bytes),workerCatalogUnchanged:true,syntheticReadiness:true};
  };
  if(maintenanceMode) {
    const {runCookingMaintenanceNativeRegression}=await import("./lib/cooking-maintenance-engine-regression.mjs");
    report.maintenance=await runCookingMaintenanceNativeRegression({container,tag,env,sql,own,settings,cookingBefore});
    report.tests.push(...report.maintenance.tests);
  } else {
  for (const filename of ["20261017210000_cooked_weight_mass_fallback.sql", "20261017220000_cooking_execution_quantities.sql"]) {
    const bytes = readFileSync(path.join("supabase/migrations", filename));
    const expected = filename.includes("210000") ? "9709397e9031ca28a1ae6dbb934502ef9092ca7bc0d6ba96d568121672ac7f2e" : "34b2947952f4eedb55234ddf330ca0029c080d7c8d887542e8880a56106cbaa6";
    assert.equal(hash(bytes), expected); sql(bytes.toString()); report.migrations.push({ filename, sha256: hash(bytes) });
  }
  const fixPath="supabase/migrations/20261019090000_cooking_execution_reader_transaction.sql";
  report.fix={path:fixPath,sha256:hash(readFileSync(fixPath))};
  assert.equal(report.fix.sha256,"a24a54518783f89018645a7f9b827f97510f64e38a1ff68c2c2cd045cc213d32");
  report.sqlSuiteSha256=hash(readFileSync("tests/cooking-experience-schema232-postgres.integration.test.ts"));
  if(sqlMode) {
    sql(readFileSync(fixPath,"utf8"));
    exportCookingImages();
    env.HOMECOOK_COOKING_SCHEMA232_PG="1";env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER=container;env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG=tag;
    const suite=run(process.execPath,[path.resolve("node_modules/vitest/vitest.mjs"),"run","tests/cooking-experience-schema232-postgres.integration.test.ts"]);
    writeFileSync("/tmp/homecook-cooking-current-sql-vitest.log",suite.stdout+suite.stderr);
    assert.equal(suite.status,0,"Current-schema SQL regression failed; see local log");assert.match(suite.stdout,/26 passed/u);
    report.tests.push("existing26 SQL regression PASS on current schema232+original233234+reader forward");
  } else {
  // Reuse only the synthetic beforeAll SQL from the existing schema232 suite.
  // Its application data is generated test data, never a production snapshot.
  const fixturePath = "tests/cooking-experience-schema232-postgres.integration.test.ts";
  const fixture = readFileSync(fixturePath, "utf8");
  assert.equal(hash(fixture),"220c027ae0534486fe407a41848b2c3049139f81606e8e6c53f437b71a977a13");
  const ast = ts.createSourceFile(fixturePath, fixture, ts.ScriptTarget.Latest, true);
  let seed;
  const findSeed = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === "beforeAll") { assert.equal(seed, undefined); seed = node.arguments[0].body; } ts.forEachChild(node, findSeed); };
  findSeed(ast); assert(seed);
  const constants = { owner:"b1000000-0000-4000-8000-000000000001", other:"b1000000-0000-4000-8000-000000000002", recipe:"b2000000-0000-4000-8000-000000000001", pin:"b3000000-0000-4000-8000-000000000001", ingredient:"b8000000-0000-4000-8000-000000000001", nutritionPin:"b9000000-0000-4000-8000-000000000001", column:"b6000000-0000-4000-8000-000000000001", cutover:"b5000000-0000-4000-8000-000000000001", epoch:"2026-08-08T00:00:00Z", issued:"2026-08-08T01:00:00Z", hash:"e".repeat(64) };
  const seedCalls = [];
  const collect = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === "sql") {
    assert(ts.isStringLiteral(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]));
    const statement = Function(...Object.keys(constants), `return (${node.arguments[0].getText(ast)});`)(...Object.values(constants));
    seedCalls.push({ statement, bootstrap: node.arguments[2]?.kind === ts.SyntaxKind.TrueKeyword });
  } ts.forEachChild(node, collect); };
  collect(seed); assert.equal(seedCalls.length, 3);
  for (const entry of seedCalls) sql(`begin;${entry.statement}commit;`, entry.bootstrap ? "supabase_admin" : "postgres");
  report.fixture = { path: fixturePath, sha256: hash(fixture), seededSqlCalls: 3, realApplicationRows: 0 };
  const session = "d4000000-0000-4000-8000-000000000001";
  sql(`begin;select public.set_account_generation_internal_writer_marker('${constants.cutover}',true);
    insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)
    values('${session}','${constants.owner}','in_progress','snapshot_v2','standalone','${constants.recipe}','${constants.pin}',4,1);
    select public.set_account_generation_internal_writer_marker('${constants.cutover}',false);
    commit;`);
  const pgrstImage = "postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805";
  const pgrstId = required(["image","inspect","--format","{{.Id}}",pgrstImage]);
  const secret = randomBytes(48).toString("base64url");
  secretDirectory = mkdtempSync(path.join(tmpdir(), "hc-execution-http-")); chmodSync(secretDirectory, 0o700);
  const configuration = path.join(secretDirectory,"postgrest.env");
  writeFileSync(configuration, `PGRST_DB_URI=postgres://authenticator@127.0.0.1:5432/postgres\nPGRST_DB_SCHEMAS=public,storage\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${secret}\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT=3000\nPGRST_DB_POOL=2\n`, {mode:0o600});
  httpContainer = required(["run","--detach","--pull=never","--network",`container:${container}`,"--env-file",configuration,"--label",`homecook.execution-http-test=${tag}`,pgrstImage]);
  const ownHttp = () => assert.equal(required(["inspect","--format",'{{.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.execution-http-test"}}',httpContainer]),`${pgrstId}|container:${container}|0|0|${tag}`);
  ownHttp(); report.httpIsolation = { image:pgrstImage, postgresNetwork:"none", postgrestNetwork:"owned-PG-network-namespace", mounts:0, publishedPorts:0, externalRequests:0, syntheticJwtOnly:true, preRequest:"public.verify_full_local_postgrest_request_authority via exact authenticator role setting", scope:"snapshot-v2-session", operatingEquivalence:"schema/role/settings fixture only; no operating user/JWT/web equivalence" };
  exec(["curl","--version"]);
  let ready = false;
  for (let n=0;n<40;n++) { ownHttp(); const probe=run("docker",["exec",container,"curl","-sS","--max-time","1","-o","/dev/null","-w","%{http_code}","http://127.0.0.1:3000/"]); if(probe.status===0&&/^[245]\d{2}$/u.test(probe.stdout)&&probe.stdout!=="503"){ready=true;break;} await new Promise(resolve=>setTimeout(resolve,100)); }
  assert(ready,"Owned PostgREST did not become ready");
  const token = role => { const part = value => Buffer.from(JSON.stringify(value)).toString("base64url"); const payload=`${part({alg:"HS256",typ:"JWT"})}.${part({role,sub:constants.owner,exp:Math.floor(Date.now()/1000)+3600})}`; return `${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`; };
  const body = { p_owner_uuid:constants.owner,p_auth_identity_created_at_snapshot:constants.epoch,p_session_key_hash:constants.hash,p_hmac_key_version:1,p_session_issued_at:constants.issued,p_session_id:session };
  const request = (payload=body,role="service_role",scope="snapshot-v2-session") => {
    ownHttp();
    // Header/token and JSON go via stdin, never process arguments or report.
    const config = `url = "http://127.0.0.1:3000/rpc/read_cooking_execution_quantities"\nrequest = "POST"\nheader = "Content-Type: application/json"\nheader = "X-Homecook-Internal-Scope: ${scope}"\nheader = "Authorization: Bearer ${token(role)}"\ndata = ${JSON.stringify(JSON.stringify(payload))}\n`;
    const raw = exec(["curl","--silent","--show-error","--max-time","10","--config","-","--write-out","\n%{http_code}"],config);
    const at=raw.lastIndexOf("\n"); return {status:Number(raw.slice(at+1)),body:JSON.parse(raw.slice(0,at))};
  };
    const tableGuards = () => sql("select jsonb_build_object('rls',relrowsecurity,'forced',relforcerowsecurity,'acl',relacl) from pg_class where oid='private.cooking_execution_quantities'::regclass;");
    const tableBefore = tableGuards();
    assert.equal(JSON.parse(tableBefore).rls,true);
  const before = JSON.parse(sql(catalogSql));
  report.before = request();
  const { existsSync } = await import("node:fs");
  if (!existsSync(fixPath)) { assert.equal(report.before.status,200,`Expected owner HTTP200; actual${report.before.status}/${report.before.body.code}: ${report.before.body.message}`); }
  else {
    assert.equal(report.before.status,405); assert.equal(report.before.body.code,"25006");
    sql(readFileSync(fixPath,"utf8")); report.fix = { path:fixPath,sha256:hash(readFileSync(fixPath)) };
    exportCookingImages();
    assert.equal(tableGuards(),tableBefore);
    const after = JSON.parse(sql(catalogSql)); const a = after.map(row=> {
      const old = before.find(previous=>previous.signature===row.signature);
      return row.name === "read_cooking_execution_quantities" ? {...row,volatility:old.volatility,definition:old.definition} : row;
    });
    assert.deepEqual(a,before);
    const changed = after.filter(row=>row.volatility!==before.find(old=>old.signature===row.signature)?.volatility);
    assert.equal(changed.length,1); assert.equal(changed[0].name,"read_cooking_execution_quantities"); assert.equal(changed[0].volatility,"v");
    report.functionDelta={changed:1,onlyAttribute:"volatility",before:"s",after:"v",bodyOwnerAclOidConfigSecurityAndOtherFunctionsUnchanged:true};
    sql("notify pgrst,'reload schema';");
    let result;
    for(let n=0;n<40;n++){result=request();if(result.status===200)break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.revision,0);assert.equal(result.body.rows[0].amount,300);report.tests.push("owner baseline reader HTTP200");
    for(const scope of ["","recipe-future-propagation"]) { const denied=request(body,"service_role",scope);assert.equal(denied.status,500,JSON.stringify(denied));assert.equal(denied.body.code,"55000");assert.equal(denied.body.message,"ACCOUNT_SESSION_STALE"); }
    report.tests.push("actual pre-request rejects missing or wrong internal scope over HTTP");
    const baselineRows=sql(`select md5(to_jsonb(s)::text) from public.cooking_sessions s where id='${session}';`);
    for(const role of ["authenticated","anon"]){const denied=request(body,role);assert(denied.status===403&&denied.body.code==="42501"||denied.status===500&&denied.body.code==="55000"&&denied.body.message==="ACCOUNT_SESSION_STALE",JSON.stringify(denied));assert.equal(sql(`select has_function_privilege('${role}','public.read_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)','EXECUTE');`),"f");report.tests.push(`${role} cannot execute reader`);}
    const other=request({...body,p_owner_uuid:constants.other,p_session_key_hash:"f".repeat(64)});assert.equal(other.status,500,JSON.stringify(other));assert.equal(other.body.code,"P0002");assert.equal(other.body.message,"RESOURCE_NOT_FOUND");report.tests.push("foreign owner denied");
    const stale=request({...body,p_session_key_hash:"0".repeat(64)});assert.equal(stale.status,500,JSON.stringify(stale));assert.equal(stale.body.code,"55000");assert.equal(stale.body.message,"ACCOUNT_SESSION_STALE");report.tests.push("stale session denied");
    const retry=request();assert.equal(retry.status,200);assert.deepEqual(retry.body,result.body);report.tests.push("repeat owner read identical");
    assert.equal(sql(`select md5(to_jsonb(s)::text) from public.cooking_sessions s where id='${session}';`),baselineRows);assert.equal(sql("select count(*) from private.cooking_execution_quantities;"),"0");report.tests.push("reads do not mutate session or create execution rows");
    assert.equal(sql("select has_table_privilege('service_role','private.cooking_execution_quantities','SELECT');"),"f"); report.tests.push("private direct-read ACL unchanged");
    // Reader projection fixture only: these marker payloads do not assert nutrition/weight semantics.
    sql(`insert into private.cooking_execution_quantities
      select '${session}','${constants.owner}','${constants.pin}',1,
        jsonb_set(jsonb_set(ingredients_json,'{0,amount}','190'),'{0,scalable}','false'),
        '{"synthetic_reader_marker":"nutrition"}','{"synthetic_reader_marker":"weight"}',clock_timestamp()
      from public.recipe_content_snapshots where id='${constants.pin}';`);
    const persistedBefore=sql(`select md5(to_jsonb(e)::text) from private.cooking_execution_quantities e where session_id='${session}';`);
    const revisionOne=request();assert.equal(revisionOne.status,200);assert.equal(revisionOne.body.revision,1);
    assert.equal(revisionOne.body.rows[0].amount,190);assert.equal(revisionOne.body.rows[0].scalable,false);
    assert.equal(revisionOne.body.original_rows[0].amount,300);assert.equal(revisionOne.body.original_rows[0].scalable,true);
    assert.deepEqual(revisionOne.body.nutrition_snapshot,{synthetic_reader_marker:"nutrition"});
    assert.deepEqual(revisionOne.body.prediction,{synthetic_reader_marker:"weight"});report.tests.push("revision1 projects saved execution rows and frozen payloads without changing original rows");
    assert.deepEqual(request(),revisionOne);assert.equal(sql(`select md5(to_jsonb(e)::text) from private.cooking_execution_quantities e where session_id='${session}';`),persistedBefore);
    assert.equal(sql(`select md5(to_jsonb(s)::text) from public.cooking_sessions s where id='${session}';`),baselineRows);report.tests.push("revision1 repeated reads preserve execution and session rows");
    for(const [name,mutation,restore] of [
      ["revoked binding",`update public.user_session_generation_bindings set binding_state='revoked',revoked_at=clock_timestamp() where session_key_hash='${constants.hash}';`,`update public.user_session_generation_bindings set binding_state='active',revoked_at=null where session_key_hash='${constants.hash}';`],
      ["deleting account",`update public.user_account_lifecycles set status='deleting' where owner_uuid='${constants.owner}';`,`update public.user_account_lifecycles set status='active' where owner_uuid='${constants.owner}';update public.user_session_generation_bindings set binding_state='active',revoked_at=null where session_key_hash='${constants.hash}';`]
    ]) {
      sql(mutation);
      try { const denied=request();assert.equal(denied.status,500,JSON.stringify(denied));assert.equal(denied.body.code,"55000");assert.equal(denied.body.message,name==="deleting account"?"ACCOUNT_DELETING":"ACCOUNT_SESSION_STALE");report.tests.push(`${name} denied`); }
      finally { sql(restore); }
      const recovered=request();assert.equal(recovered.status,200,JSON.stringify(recovered));
    }
    const wrongVersion=request({...body,p_hmac_key_version:2});assert.equal(wrongVersion.status,500);assert.equal(wrongVersion.body.code,"55000");assert.equal(wrongVersion.body.message,"ACCOUNT_SESSION_STALE");report.tests.push("wrong binding key version denied");
    const scopeSql=(scope,method)=>`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}';set local request.headers='{"x-homecook-internal-scope":"${scope}"}';set local request.path='/rpc/read_cooking_execution_quantities';set local request.method='${method}';select private.verify_full_local_internal_scope();rollback;`;
    sql(scopeSql("snapshot-v2-session","POST"));
    for(const [scope,method] of [["recipe-future-propagation","POST"],["snapshot-v2-session","GET"]]) {
      const denied=run("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],scopeSql(scope,method));
      assert.notEqual(denied.status,0);assert.match(denied.stderr,/ACCOUNT_SESSION_STALE/u);
    }
    report.tests.push("unchanged scope dispatcher accepts exact POST path and rejects wrong scope or GET (SQL boundary)");
    const readOnly=run("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],`begin read only;set local role service_role;set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}';select public.read_cooking_execution_quantities('${constants.owner}','${constants.epoch}','${constants.hash}',1,'${constants.issued}','${session}');rollback;`);
    assert.notEqual(readOnly.status,0);assert.match(readOnly.stderr,/cannot execute SELECT FOR SHARE in a read-only transaction/u);report.tests.push("explicit read-only transaction still forbids authority row locking");
    sql(readFileSync(fixPath,"utf8"));assert.deepEqual(JSON.parse(sql(catalogSql)),after);assert.equal(tableGuards(),tableBefore);report.tests.push("forward ALTER reapply is idempotent and private table ACL/RLS unchanged");
  }
  }
  }
  report.status="PASS";
} catch(error) { report.status="FAIL";report.error=String(error.message).slice(0,1500);process.exitCode=1; }
finally {
  const cleanupErrors = [];
  for (const [id, label] of [[httpContainer,"homecook.execution-http-test"],[container,"homecook.cooked-weight-test"]]) {
    if (!id) continue;
    try {
      assert.equal(required(["inspect","--format",`{{index .Config.Labels "${label}"}}`,id]),tag);
      required(["rm","-f",id]);
      assert.equal(required(["ps","--all","--quiet","--no-trunc","--filter",`id=${id}`]),"");
    } catch(error) { cleanupErrors.push(String(error.message).slice(0,300)); }
  }
  if(secretDirectory) {
    try { rmSync(secretDirectory,{recursive:true}); }
    catch(error) { cleanupErrors.push(String(error.message).slice(0,300)); }
  }
  report.cleanupCompleted=cleanupErrors.length===0;
  if(cleanupErrors.length) { report.status="FAIL";report.cleanupErrors=cleanupErrors;process.exitCode=1; }
  writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
}
process.stdout.write(JSON.stringify(report)+"\n");
