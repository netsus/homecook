import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const sha = (c: string) => c.repeat(64), ref = (c: string) => c.repeat(40);
const temp = mkdtempSync(join(realpathSync("/tmp"), "nutrition-maintenance-owned-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const filename = "20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql";
const raw = Buffer.from("begin;\nCREATE OR REPLACE FUNCTION public.validate_recipe_nutrition_snapshot_payload(p_snapshot jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;\ncommit;\n");
const payload = raw.toString().replace(/^begin;\n/u, "").replace(/\ncommit;\n$/u, "");
let source = readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8");
source = source.replace(/^export const ([A-Z0-9_]+_PIN) = [\s\S]*?;(?=\r?\n)/gmu,
  (_text, name: string) => `export const ${name} = Object.freeze({ path: null, sha256: null });`);
for (const [name, value] of Object.entries({ NUTRITION_VALIDATOR_MIGRATION_SHA256: JSON.stringify(hash(raw)),
  NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("8")}" })`,
  COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("4")}" })` })) {
  source = source.replace(new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu"), () => `export const ${name} = ${value};`);
}
source = source.replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',
  () => `function prelaunchStateRoot() { return ${JSON.stringify(join(temp, "state"))}; }`);
const webPath = join(temp, "web.mjs"); writeFileSync(webPath, source, { mode: 0o600 });
const web: typeof import("../scripts/lib/prelaunch-web-deploy.mjs") = await import(pathToFileURL(webPath).href);
const dbPath = join(temp, "database.mjs");
writeFileSync(dbPath, readFileSync("scripts/lib/prelaunch-database.mjs", "utf8").replace(/from "(\.\/[^"\n]+)"/gu,
  (_text, relative: string) => `from "${pathToFileURL(relative === "./prelaunch-web-deploy.mjs" ? webPath : join(process.cwd(), "scripts/lib", relative)).href}"`), { mode: 0o600 });
const db: typeof import("../scripts/lib/prelaunch-database.mjs") = await import(pathToFileURL(dbPath).href);
const target = { fixture: true, containerId: "owned-no-prod" };

function fixture() {
  const before = Array.from({ length: 228 }, (_, i) => ({ filename: `${20250000000000 + i}_owned.sql`, sha256: sha("0") }));
  before[227] = { filename: web.COOKED_WEIGHT_ATTESTATION_MIGRATION, sha256: web.COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256 };
  const pointer = (name: string, c: string) => ({ path: join(temp, name), sha256: sha(c) });
  return { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: "recipe-nutrition-v4-validator", from: ref("a"), to: ref("b"),
    sourceReaderRef: ref("a"), migrationSourceRef: ref("b"), readerValidatorSha256: sha("1"),
    files: { [`supabase/migrations/${filename}`]: [null, hash(raw)] },
    predecessorBuildId: "owned-reader228", predecessorPlistSha256: sha("1"), closedArtifactSha256: sha("2"),
    closedReviewSha256: web.CLOSED_R2_REVIEW_PIN.sha256, controlSha256: sha("3"), consentGeneration: 1, historicalProofsSha256: sha("4"),
    testScript: "test:feedback-batch:web", approved: { database: true, reader: false, writerOn: false }, readerPrecedesDatabase: true, readerEnvironment: {},
    isolatedEvidenceSha256: sha("5"), readerFlowsSha256: sha("6"), isolatedEvidence: pointer("isolated", "5"), readerFlows: pointer("flows", "6"),
    platformInventory: pointer("platform", "7"), backupReadiness: pointer("backup", "8"),
    predecessorAttestation: { reviewSha256: sha("4"), databaseReceipt: pointer("personal-terminal", "9"), readerReceipt: pointer("personal-reader", "a"),
      writerReceipt: pointer("personal-writer", "b"), readerFloor: ref("c") },
    database: { before, after: [...before, { filename, sha256: hash(raw) }], migrations: [{ filename, rawSha256: hash(raw), payloadSha256: hash(payload) }],
      configPath: join(temp, "config"), configSha256: sha("0"), targetSha256: hash(JSON.stringify(target)), beforeCatalogSha256: sha("2"), afterCatalogSha256: sha("3"),
      immutableSha256: sha("4"), afterImmutableSha256: sha("4"), stableImmutableSha256: sha("5"),
      beforeScope: { outerSha256: sha("6"), aliasSha256: sha("7") }, afterScope: { outerSha256: sha("6"), aliasSha256: sha("7") },
      attestationScope: { beforeOuterSha256: sha("6"), afterOuterSha256: sha("6"), afterAliasSha256: sha("8") },
      normalProjectionSha256: web.QUANTITY_V4_PROTECTION.normalProjectionSha256, postimageRegistrySha256: web.QUANTITY_V4_PROTECTION.postimageRegistrySha256,
      attestationPostimageRegistrySha256: sha("9"), beforeColumnsSha256: sha("a"), afterColumnsSha256: sha("a"),
      workerCatalogBefore: web.QUANTITY_V4_WORKER_CATALOG_AFTER, workerCatalogAfter: web.QUANTITY_V4_WORKER_CATALOG_AFTER,
      workerBaseline: { credentialGeneration: 48, workerReleaseSha: web.QUANTITY_V4_RELEASE_SHA, schemaIdentity: web.QUANTITY_V4_WORKER_SCHEMA_IDENTITY,
        snapshotDigest: sha("b"), credentialRowSha256: sha("c"), policyRowSha256: sha("d"), policyStableSha256: sha("e"), workerPolicyEnabled: true },
      functionSignature: "public.validate_recipe_nutrition_snapshot_payload(jsonb)",
      functionBefore: { definitionSha256: sha("a"), sourceMd5: "b".repeat(32), metadataSha256: sha("c") },
      functionAfter: { definitionSha256: sha("d"), sourceMd5: "e".repeat(32), metadataSha256: sha("c") } } };
}

describe("exact nutrition validator maintenance authority", () => {
  it("accepts the new reader-first228/229 authority without relabeling personal227/228", () => {
    expect(() => web.assertProtectedRolloutReview(fixture())).not.toThrow();
  });
  it.each(["sourceReaderRef", "migrationSourceRef"] as const)("rejects a different %s", key => {
    expect(() => web.assertProtectedRolloutReview({ ...fixture(), [key]: ref("f") })).toThrow();
  });
  it.each(["functionSignature", "functionAfter", "after", "migrations"])("rejects foreign or incomplete exact %s", key => {
    const review = fixture(); Reflect.set(review.database, key, null);
    expect(() => web.assertProtectedRolloutReview(review)).toThrow();
  });
});


function observation(review: ReturnType<typeof fixture>, after = false) {
  const d = review.database;
  return { target, ledger: after ? d.after : d.before, catalogSha256: after ? d.afterCatalogSha256 : d.beforeCatalogSha256,
    immutableSha256: d.immutableSha256, stableImmutableSha256: d.stableImmutableSha256, ledgerAuthority: true, active: false,
    scope: d.afterScope, attestationScope: { outerSha256: d.attestationScope.afterOuterSha256, aliasSha256: d.attestationScope.afterAliasSha256 },
    normalColumnsSha256: d.afterColumnsSha256, normalProjectionSha256: d.normalProjectionSha256,
    postimageRegistrySha256: d.postimageRegistrySha256, attestationPostimageRegistrySha256: d.attestationPostimageRegistrySha256,
    nutritionValidator: after ? d.functionAfter : d.functionBefore,
    productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true, attestationWriterEnabled: true, writerEnabled: true,
    attestationTablesPresent: true, attestationRowsEmpty: false, metadataNull: false,
    normalDataSha256: sha("1"), preservedRowsSha256: sha("2"), attestationRowsSha256: sha("3"), controlsSha256: sha("4"),
    worker: { ...d.workerBaseline, catalogFingerprint: d.workerCatalogAfter, credentialActive: true,
      queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 } };
}
function engineFixture({ boundaryFailure = 0, commitAckLost = false, terminalLost = false } = {}) {
  const review = fixture(), queries: string[] = [];
  let state = observation(review), attempt: object | null = null, boundaries = 0;
  const pending = review.database.before.map(row => ({ ...row, bytes: Buffer.from("") }));
  const migrations = [...pending, { filename, sha256: hash(raw), bytes: raw }];
  const backup = { fullArchiveDecoded: true, sha256: sha("1"), rolesSha256: sha("2"), snapshot: "00000001-00000002-1", target };
  const session = { postgresContext: { searchPath: '"$user", public, extensions', timeZone: "UTC" },
    query: async (sql: string) => {
      queries.push(sql);
      if (sql === "SELECT session_user;" || sql === "SELECT current_user;" && queries.at(-2) === "RESET ROLE;") return "supabase_admin";
      if (sql === "SELECT current_user;") return "postgres";
      if (sql === "SELECT pg_export_snapshot();") return backup.snapshot;
      if (sql === payload) state = { ...state, nutritionValidator: review.database.functionAfter };
      if (sql.includes("INSERT INTO homecook_deploy.migrations")) state = { ...state, ledger: review.database.after, catalogSha256: review.database.afterCatalogSha256 };
      if (sql === "ROLLBACK;") state = observation(review);
      if (sql === "COMMIT;" && commitAckLost) throw new Error("owned COMMIT ACK lost");
      return "";
    }, close: async () => {}, stop: () => {} };
  const adapter = { observe: async () => structuredClone(state), migrationSession: () => session,
    backup: async () => backup, reloadSchema: async () => {} };
  let failTerminal = terminalLost;
  const journal = { read: async () => attempt, write: async (value: { status: string }) => {
    if (failTerminal && value.status === "committed") { failTerminal = false; throw new Error("owned terminal publication lost"); }
    attempt = structuredClone(value);
  } };
  const engine = db.createProtectedPrelaunchDatabaseEngine({ review, reviewSha256: sha("8"), operationId: "12345678-1234-4123-8123-123456789abc",
    adapter, journal, readMigrations: async () => migrations, assertBoundary: async () => {
      boundaries += 1; if (boundaries === boundaryFailure) throw new Error("owned reader changed");
    } });
  return { review, engine, queries, adapter, getAttempt: () => attempt, getState: () => state };
}

describe("reader-first maintenance transaction", () => {
  it("preserves all ON controls and nonempty facts while committing only the exact229 function/ledger", async () => {
    const f = engineFixture(); const result = await f.engine.apply();
    expect(result).toMatchObject({ status: "committed", feature: "recipe-nutrition-v4-validator", sourceReaderRef: f.review.from,
      readerFloor: f.review.from, productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true,
      attestationWriterEnabled: true, workerPolicyEnabled: true, controlsPreservedInTransaction: true,
      attestationRowsSha256: sha("3"), normalDataSha256: sha("1") });
    expect(f.queries.filter(q => q === payload)).toHaveLength(1);
    expect(f.queries.some(q => q.includes("lock_timeout='5s'"))).toBe(true);
    expect(f.queries.filter(q => /UPDATE .*control|UPDATE .*policy/u.test(q))).toEqual([]);
    expect(f.queries.indexOf(payload)).toBeLessThan(f.queries.findIndex(q => q.includes("INSERT INTO homecook_deploy.migrations")));
    expect(() => web.assertNutritionValidatorDatabaseReceipt(f.review, result)).not.toThrow();
  });
  it.each([1, 2])("rejects a missing/changed reader before SQL dispatch at boundary%s", async boundaryFailure => {
    const f = engineFixture({ boundaryFailure });
    await expect(f.engine.apply()).rejects.toThrow("reader changed");
    expect(f.queries).not.toContain(payload); expect(f.getState().ledger).toHaveLength(228);
  });
  it("rolls back when the exact reader changes before COMMIT", async () => {
    const f = engineFixture({ boundaryFailure: 3 });
    await expect(f.engine.apply()).rejects.toThrow("reader changed");
    expect(f.queries).toContain(payload); expect(f.queries).toContain("ROLLBACK;"); expect(f.queries).not.toContain("COMMIT;");
    expect(f.getState().ledger).toHaveLength(228);
  });
  it.each([{ commitAckLost: true }, { terminalLost: true }])("keeps unknown non-retriable and reconciles only its exact229 intent: %j", async mode => {
    const f = engineFixture(mode);
    await expect(f.engine.apply()).rejects.toMatchObject({ databaseState: { outcome: "unknown", automaticRetryAllowed: false } });
    expect(f.getAttempt()).toMatchObject({ status: "unknown", sourceReaderRef: f.review.from, controlsPreservedInTransaction: true });
    await expect(f.engine.apply()).rejects.toThrow("automatic retry");
    // Publication failure is transient in the isolated transport only.
    await expect(f.engine.reconcile()).resolves.toMatchObject({ status: "committed", feature: "recipe-nutrition-v4-validator" });
    expect(f.queries.filter(q => q === payload)).toHaveLength(1);
  });
});

async function committedMaintenance() {
  const f = engineFixture(), record = await f.engine.apply();
  const pointer = {path: join(temp, "terminal229.json"), sha256: hash(JSON.stringify(record))};
  return {review:f.review,record,pointer,guardPointer:pointer,
    predecessor:{record:{databasePlanSha256:hash(JSON.stringify({source:f.review.database.before,applied:f.review.database.before}))}}};
}
describe("current229 fences and exact full-source handoff", () => {
  it.each(["applying_precommit","commit_dispatch_guard","unknown","rolled_back_before_commit"])("never reports old228 normal deployment after %s", status => {
    const f=engineFixture();
    expect(web.nutritionValidatorPhaseStatus({review:f.review,record:{status}},true)).toMatchObject({appliedLedgerCount:null,databasePlanSha256:null,normalDeploymentAllowed:false});
  });
  it("keeps original228 marker plan while binding current229 separately", async () => {
    const maintenance=await committedMaintenance(), databaseMaintenance=web.nutritionValidatorMaintenanceBinding(maintenance);
    const marker={databasePlanSha256:maintenance.predecessor.record.databasePlanSha256,databaseMaintenance};
    expect(web.assertNutritionValidatorMarker(maintenance,marker)).toBe(marker);
    expect(()=>web.assertNutritionValidatorMarker(maintenance,{...marker,databasePlanSha256:maintenance.record.databasePlanSha256})).toThrow("Historical228");
    expect(()=>web.assertNutritionValidatorMarker(maintenance,{...marker,databaseMaintenance:null})).toThrow();
    expect(web.assertNutritionValidatorMarker(maintenance,{databasePlanSha256:marker.databasePlanSha256},true)).toBeTruthy();
  });
  it("hands off only exact A→B with all file bytes after the committed229 terminal", async () => {
    const maintenance=await committedMaintenance(), review=maintenance.review;
    const input={maintenance,from:review.from,to:review.to,live:{ref:review.from,buildId:review.predecessorBuildId,plistSha256:review.predecessorPlistSha256},
      files:Object.keys(review.files),digests:review.files};
    expect(web.assertNutritionValidatorSourceHandoff(input)).toBe(true);
    for(const changed of [
      {...input,from:review.to}, {...input,to:ref("f")}, {...input,live:{...input.live,buildId:"foreign"}},
      {...input,files:[]}, {...input,files:[...input.files,"tests/extra.test.ts"]}, {...input,files:[...input.files,"app/extra.ts"]},
      {...input,files:["supabase/migrations/20261014225100_foreign.sql"]},
      {...input,digests:{...input.digests,[input.files[0]]:[null,sha("f")]}},
      {...input,maintenance:{...maintenance,record:{...maintenance.record,status:"unknown"}}},
    ]) expect(()=>web.assertNutritionValidatorSourceHandoff(changed)).toThrow();
  });
  it("compensates failed B activation only to the captured compatible A, leaving DB229 unchanged", async () => {
    const maintenance=await committedMaintenance(), review=maintenance.review;
    const before={ref:review.from,buildId:review.predecessorBuildId,plistSha256:review.predecessorPlistSha256,validatorSha256:review.readerValidatorSha256};
    const calls:string[]=[];
    await expect(web.deployTransaction({prepare:async()=>{},activate:async()=>{throw new Error("B web failed");},verify:async()=>{},
      restore:async()=>{web.assertNutritionValidatorReaderCompensation(maintenance,before,review.to);calls.push("restore exactA");},verifyRestored:async()=>{calls.push("verify exactA");}})).rejects.toThrow();
    expect(calls).toEqual(["restore exactA","verify exactA"]);expect(maintenance.record.databasePlanSha256).toBe(hash(JSON.stringify({source:review.database.after,applied:review.database.after})));
    for(const changed of [{...before,ref:ref("0")},{...before,buildId:"old"},{...before,plistSha256:sha("0")},{...before,validatorSha256:sha("0")}])
      expect(()=>web.assertNutritionValidatorReaderCompensation(maintenance,changed,review.to)).toThrow();
  });
  it("denies unresolved writer admission and cross-boundary unknown recovery, retaining committed228 history", async () => {
    const maintenance=await committedMaintenance(), binding=web.nutritionValidatorMaintenanceBinding(maintenance);
    const base={schema:"homecook.prelaunch-protected-writer-attempt.v1",reviewSha256:sha("1"),approvalSha256:sha("2"),status:"committed"};
    const row={record:base,reviewSha256:sha("1"),approvalSha256:sha("2")};
    expect(web.assertNutritionValidatorWriterAttempts([row])).toHaveLength(1);
    for(const status of ["applying_precommit","commit_dispatch_guard","unknown"])
      expect(()=>web.assertNutritionValidatorWriterAttempts([{...row,record:{...base,status}}])).toThrow("unresolved");
    expect(()=>web.assertProtectedWriterDatabaseBoundary({...base,status:"unknown"},maintenance)).toThrow("228/229");
    expect(web.assertProtectedWriterDatabaseBoundary({...base,databaseMaintenance:binding},maintenance)).toBeTruthy();
    expect(()=>web.assertProtectedWriterDatabaseBoundary({...base,databaseMaintenance:{...binding,receipt:{path:"/owned",sha256:sha("f")}}},maintenance)).toThrow();
    expect(()=>web.assertProtectedWriterDatabaseBoundary({...base,databaseMaintenance:binding},null)).toThrow();
  });
  it("rejects the unbound nutrition template in an owned copy before any proof I/O", async () => {
    // The stage now has an approved production pin; null-template coverage belongs to this isolated source copy.
    let unboundSource=source;
    for(const [name,value] of Object.entries({NUTRITION_VALIDATOR_MIGRATION_SHA256:"null",
      NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN:"Object.freeze({ path: null, sha256: null })"})){
      const declaration=new RegExp(`^export const ${name} = [^\\r\\n]*;$`,"gmu");
      expect([...unboundSource.matchAll(declaration)]).toHaveLength(1);
      unboundSource=unboundSource.replace(declaration,()=>`export const ${name} = ${value};`);
    }
    const unboundPath=join(temp,"unbound-web.mjs");writeFileSync(unboundPath,unboundSource,{mode:0o600});
    const unbound:typeof import("../scripts/lib/prelaunch-web-deploy.mjs")=await import(pathToFileURL(unboundPath).href);
    expect(unbound.NUTRITION_VALIDATOR_MIGRATION_SHA256).toBeNull();
    expect(unbound.NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN).toEqual({path:null,sha256:null});
    expect(()=>unbound.assertNutritionValidatorReview(fixture())).toThrow("exact reader-first authority is unbound");
  });
  it("requires the reviewed fixed production authority and denies unbound fixture phase access", () => {
    const real=readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8");
    expect(real).toContain('export const NUTRITION_VALIDATOR_MIGRATION_SHA256 = "a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd";');
    expect(real).toContain('export const NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-nutrition-validator-20261015-uq1hcgt6/approved-nutrition-validator-review.json", sha256: "7260854b2b072543379cebc8e75c3159c81c4f043da1feeaafe6e445bc2e325a" });');
    for(const phase of ["nutrition-database","nutrition-database-retry","nutrition-reconcile"]){
      const options=web.parsePrelaunchOptions(["--reviewed-ref",ref("b"),"--reviewed-protected-rollout","--protected-phase",phase,"--db-config",join(temp,"unread"),"--test-script","test:feedback-batch:web"]);
      expect(options.protectedPhase).toBe(phase);
      expect(()=>web.loadProtectedRolloutReview(process.cwd(),{ref:ref("b"),phase})).toThrow("핀이 비어");
    }
    expect(()=>web.parsePrelaunchOptions(["--protected-phase","nutrition-writer-on"])).toThrow();
  });
});

it("uses the real CLI unresolved fence, while allowing only its read-only reconcile path", () => {
  const cli=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"), start=cli.indexOf("function requireClosedR2Mode("), end=cli.indexOf("\nasync function ",start);
  if(start<0 || end<=start) throw new Error("CLI closed mode boundary changed");
  const review=fixture(), attempt={review,record:{status:"unknown"}};
  const run=new Function("readNutritionValidatorAttempt","currentProtectedPhase","NUTRITION_VALIDATOR_FEATURE","repository","current","DeploymentError",
    "existsSync","recoveryPath","statePath","join","dirname","closedR2ArtifactName","loadProtectedRolloutReview","loadNutritionValidatorMaintenance",
    `${cli.slice(start,end)};return requireClosedR2Mode;`)(()=>attempt,()=>web.nutritionValidatorPhaseStatus(attempt,true),web.NUTRITION_VALIDATOR_FEATURE,
      process.cwd(),()=>({ref:review.from,cwd:temp}),web.DeploymentError,()=>false,"/owned/recovery","/owned/state",join,()=>temp,"marker",()=>review,
      ()=>{throw new Error("unresolved cannot load committed");});
  expect(()=>run({})).toThrow("unresolved");
  expect(()=>run({reviewedProtectedRollout:true,protectedFeature:web.NUTRITION_VALIDATOR_FEATURE,protectedPhase:"database"})).toThrow("unresolved");
  expect(run({reviewedProtectedRollout:true,protectedFeature:web.NUTRITION_VALIDATOR_FEATURE,protectedPhase:"reconcile"})).toBeNull();
});

it("verifies B's229 source before real CLI compensation to the original A plist", async () => {
  const maintenance=await committedMaintenance(), bytes=Buffer.from("owned original A plist"), validator=Buffer.from("owned reader JS");
  maintenance.review.predecessorPlistSha256=hash(bytes);maintenance.review.readerValidatorSha256=hash(validator);
  const cli=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"), start=cli.indexOf('        if (rollout && !protectedReader) {');
  const end=cli.indexOf('\n      }\n      await switchWeb',start);
  if(start<0 || end<=start) throw new Error("Exact compensation boundary changed");
  const calls:string[]=[];
  const build=(databaseFails=false)=>new Function("rollout","protectedReader","loadNutritionValidatorMaintenance","repository","state","live",
    "assertNutritionValidatorReaderCompensation","hash","readFileSync","join","verifyAppliedDatabase","options","verifyProtectedBaseline",
    "readClosedR2PrivateBytes","protectedReaderReceiptPath","git","spawnSync","assertProtectedReaderRollback",`return(async()=>{${cli.slice(start,end)}})();`)(
      {feature:web.COOKED_WEIGHT_ATTESTATION_FEATURE},false,()=>maintenance,process.cwd(),
      {ref:maintenance.review.to,checkout:"/owned/B229",closedR2:{from:maintenance.review.from}},
      {ref:maintenance.review.from,buildId:maintenance.review.predecessorBuildId,bytes,cwd:"/owned/A228"},
      web.assertNutritionValidatorReaderCompensation,hash,()=>validator,join,
      async (_options:object,checkout:string)=>{calls.push(checkout);if(databaseFails) throw new Error("DB229 guard rejected");return{source:maintenance.review.database.after};},
      {},async()=>{calls.push("guard229");},()=>JSON.stringify({readerFloor:maintenance.review.predecessorAttestation.readerFloor}),"/owned/readerReceipt",
      ()=>{},()=>({status:0}),()=>{});
  await build();expect(calls).toEqual(["/owned/B229","guard229"]);
  calls.splice(0);await expect(build(true)).rejects.toThrow("DB229 guard rejected");expect(calls).toEqual(["/owned/B229"]);
});

it("reads the real reconciled not-applied terminal's target SHA without inventing a missing target", () => {
  const code=readFileSync("scripts/lib/prelaunch-web-deploy.mjs","utf8"), start=code.indexOf("export function readNutritionValidatorAttempt("),end=code.indexOf("\nexport function nutritionValidatorPhaseStatus",start);
  if(start<0||end<=start) throw new Error("Attempt reader boundary changed");
  const review=fixture(),operationId="12345678-1234-4123-8123-123456789abc",operationRoot=join(temp,"operations");
  const record={schema:"homecook.prelaunch-protected-db-attempt.v1",feature:web.NUTRITION_VALIDATOR_FEATURE,reviewSha256:sha("8"),
    from:review.from,to:review.to,journalFile:"attempt.json",sourceReaderRef:review.from,operationId,operationDirectory:join(operationRoot,operationId),
    status:"not_applied",targetSha256:review.database.targetSha256};
  const read=new Function("protectedRolloutPaths","prelaunchStateRoot","NUTRITION_VALIDATOR_FEATURE","existsSync","loadProtectedRolloutReview",
    "readClosedR2PrivateBytes","closedR2Require","NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN","join","closedR2Hash",
    `${code.slice(start,end).replace("export function","function")};return readNutritionValidatorAttempt;`)(
      ()=>({operationRoot,databaseGuardPath:join(temp,"guard")}),()=>temp,web.NUTRITION_VALIDATOR_FEATURE,()=>true,()=>review,
      ()=>Buffer.from(JSON.stringify(record)),(value:unknown,message:string)=>{if(!value)throw new Error(message);},{sha256:sha("8")},join,hash);
  expect(read(process.cwd()).record).toEqual(record);
  expect(web.nutritionValidatorPhaseStatus({review,record},true)).toMatchObject({appliedLedgerCount:228,normalDeploymentAllowed:true});
});

it.each([true,false])("reports nutrition committed reader/writer readiness without changing older feature output (%s)", maintenance => {
  const source=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"),start=source.indexOf('  say(JSON.stringify({ status: receipt.status, phase: options.protectedPhase, readerReady:');
  const end=source.indexOf('\n}',start);
  if(start<0||end<=start)throw new Error("Database CLI result boundary changed");
  let output="";new Function("say","receipt","options","maintenance",source.slice(start,end))((v:string)=>{output=v;},
    {status:"committed",readerReady:true,writerEnabled:true},{protectedPhase:"database"},maintenance);
  expect(JSON.parse(output)).toMatchObject({status:"committed",readerReady:maintenance,writerEnabled:maintenance,automaticRetryAllowed:false});
});

it.each(["unknown","not_applied"])("does not fabricate OFF state for a nutrition %s result", status => {
  const source=readFileSync("scripts/deploy-prelaunch-web.mjs","utf8"),start=source.indexOf('  say(JSON.stringify({ status: receipt.status, phase: options.protectedPhase, readerReady:');
  const end=source.indexOf('\n}',start);if(start<0||end<=start)throw new Error("Database CLI result boundary changed");
  for(const maintenance of [true,false]){
    let output="";new Function("say","receipt","options","maintenance",source.slice(start,end))((v:string)=>{output=v;},
      {status},{protectedPhase:"reconcile"},maintenance);
    expect(JSON.parse(output)).toMatchObject({status,readerReady:maintenance?null:false,writerEnabled:maintenance?null:false,automaticRetryAllowed:false});
  }
});
