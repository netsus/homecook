import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";

import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS, DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE, buildYoutubeExtractionCurrentPolicy } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

import { createYoutubeExtractionWorkerRuntime } from "../scripts/lib/youtube-extraction-worker-runtime.mjs";

const WEB_AUTHORITY_DEFAULTS = {
  QUANTITY_V4_RELEASE_SHA: "null", QUANTITY_V4_PROTECTION: "null",
  QUANTITY_V4_CONSUMERS_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WRITER_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_BEFORE_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_AFTER_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_OPERATION_ROOT: "null",
};

const WORKER_AUTHORITY_DEFAULTS = {
  YOUTUBE_C04_CUTOVER_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  YOUTUBE_C04_RELEASE_SHA: "null", YOUTUBE_C04_ARTIFACT_SHA256: "null", YOUTUBE_C04_OPERATION_ROOT: "null",
};
function nullC04Source(source: string, kind: "web" | "worker") {
  const declarations = kind === "web" ? WEB_AUTHORITY_DEFAULTS : WORKER_AUTHORITY_DEFAULTS;
  for (const [name, value] of Object.entries(declarations)) {
    const pattern = new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu");
    if ([...source.matchAll(pattern)].length !== 1) throw new Error(`Expected exactly one fixture declaration: ${name}`);
    source = source.replace(pattern, () => `export const ${name} = ${value};`);
    const checked = source.match(pattern);
    if (checked?.length !== 1 || checked[0] !== `export const ${name} = ${value};`) throw new Error("Fixture authority was not isolated");
  }
  return source;
}
function workerFixtureGraph(directory: string, inputs = {
  web: readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8"),
  worker: readFileSync("scripts/lib/youtube-v71-controlled-cutover.mjs", "utf8"),
}) {
  const repository = resolve("."), webPath = join(directory, "web.mjs"), databasePath = join(directory, "database.mjs"),
    workerPath = join(directory, "worker.mjs"), cliPath = join(directory, "cli.mjs");
  const stateDeclaration = 'function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }';
  let web = nullC04Source(inputs.web, "web");
  if (web.split(stateDeclaration).length !== 2) throw new Error("Fixture state-root declaration changed");
  web = web.replace(stateDeclaration, () => `function prelaunchStateRoot() { return ${JSON.stringify(join(directory, "state"))}; }`);
  const worker = nullC04Source(inputs.worker, "worker").replace(/from "(\.\/[^"\n]+)"/gu,
    (_, name: string) => `from "${pathToFileURL(join(repository, "scripts/lib", name)).href}"`);
  let dbImports = 0;
  const database = readFileSync("scripts/lib/prelaunch-database.mjs", "utf8").replace(/from "(\.\/[^"\n]+)"/gu, (_, name: string) => {
    if (name === "./prelaunch-web-deploy.mjs") dbImports++;
    return `from "${pathToFileURL(name === "./prelaunch-web-deploy.mjs" ? webPath : join(repository, "scripts/lib", name)).href}"`;
  });
  if (dbImports !== 2) throw new Error("Fixture DB authority imports changed");
  const targets = new Map([
    ["./lib/youtube-v71-controlled-cutover.mjs", { path: workerPath, expected: 2, count: 0 }],
    ["./lib/prelaunch-web-deploy.mjs", { path: webPath, expected: 1, count: 0 }],
    ["./lib/prelaunch-database.mjs", { path: databasePath, expected: 1, count: 0 }],
  ]);
  let cli = readFileSync("scripts/youtube-v71-controlled-cutover.mjs", "utf8").replace(/from "(\.\/[^"\n]+)"/gu, (_, name: string) => {
    const target = targets.get(name); if (target) target.count++;
    return `from "${pathToFileURL(target?.path ?? join(repository, "scripts", name)).href}"`;
  });
  for (const [name, target] of targets) {
    if (target.count !== target.expected || cli.includes(`from "${name}"`)
      || cli.split(`from "${pathToFileURL(target.path).href}"`).length !== target.expected + 1) throw new Error("Fixture CLI authority imports changed");
  }
  for (const [old, replacement] of [
    ['const ROOT = realpathSync(resolve(HERE, ".."));', `const ROOT = ${JSON.stringify(repository)};`],
    ["const HOME = homedir();", `const HOME = ${JSON.stringify(directory)};`],
  ]) {
    if (cli.split(old).length !== 2) throw new Error("Fixture CLI root declaration changed");
    cli = cli.replace(old, () => replacement);
  }
  // No module is imported or spawned until every authority and graph edge is checked.
  for (const [path, source] of [[webPath, web], [databasePath, database], [workerPath, worker], [cliPath, cli]]) writeFileSync(path, source, { mode: 0o600 });
  return { webPath, databasePath, workerPath, cliPath, cliSource: cli };
}
const nullGraphDirectory = mkdtempSync(join(tmpdir(), "c04-worker-null-graph-"));
afterAll(() => rmSync(nullGraphDirectory, { recursive: true, force: true }));
async function nullWorkerGraph() {
  try { const graph = workerFixtureGraph(nullGraphDirectory); return { graph, module: await import(pathToFileURL(graph.workerPath).href) }; }
  catch (error) { rmSync(nullGraphDirectory, { recursive: true, force: true }); throw error; }
}
const isolated = await nullWorkerGraph();
const {
  assertC04QuantityCheckpoint, assertC04QuantityCheckpointOrigin, assertC04QuantityControlReview,
  buildC04QuantityCredentialTransitionSql, createC04QuantityWorkerCutover, parseC04QuantityCutoverArguments,
  YOUTUBE_C04_ACTIVATE_CONFIRMATION, YOUTUBE_C04_REPAIR_CONFIRMATION, YOUTUBE_C04_ARTIFACT_SHA256, YOUTUBE_C04_CATALOG_AFTER, YOUTUBE_C04_CATALOG_BEFORE,
  YOUTUBE_C04_CUTOVER_CONFIRMATION, YOUTUBE_C04_CUTOVER_REVIEW_PIN, YOUTUBE_C04_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_C04_OPERATION_ROOT, YOUTUBE_C04_QUIESCE_CONFIRMATION, YOUTUBE_C04_RELEASE_SHA,
}: typeof import("../scripts/lib/youtube-v71-controlled-cutover.mjs") = isolated.module;

const sha = (n: string) => n.repeat(64);
const now = new Date("2026-10-14T00:00:00Z");
const bindings = { releaseSha: "d".repeat(40), artifactSha256: sha("a"), operationRoot: "/private/tmp/c04-owned-fixture" };
function fixture() {
  const review = { schema: "homecook.youtube-c04-controlled-cutover-review.v1", releaseSha: bindings.releaseSha,
    targetSha256: sha("b"), operationId: "12345678-1234-4234-8234-123456789abc", operationRoot: bindings.operationRoot,
    generationBefore: 47, generationAfter: 48, ledgerBefore: 226, ledgerAfter: 227,
    catalogBefore: YOUTUBE_C04_CATALOG_BEFORE, catalogAfter: YOUTUBE_C04_CATALOG_AFTER,
    migrationSha256: "f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750",
    schemaIdentity: "youtube-extraction-worker-schema-v2", artifactSha256: sha("a"), descriptorSha256: sha("c"),
    expectedSchemaSha256: YOUTUBE_C04_EXPECTED_SCHEMA_SHA256,
    snapshotDigest: "17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7",
    preReceiptSha256: null, postReceiptSha256: null };
  const record = { schema: "homecook.prelaunch-quantity-worker-before.v1", status: "committed", feature: "ingredient-quantity-v4",
    releaseSha: review.releaseSha, targetSha256: review.targetSha256, consumersReceiptSha256: sha("e"), ledgerCount: 226,
    catalogFingerprint: review.catalogBefore, normalDataSha256: sha("f"), quantityPolicyEnabled: false,
    productWriterEnabled: true, weightWriterEnabled: true, workerPolicyEnabled: false, queued: 0, processing: 0,
    permitHeld: false, activeEnqueueSessions: 0, credentialGeneration: 47,
    workerReleaseSha: "8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4", schemaIdentity: review.schemaIdentity,
    snapshotDigest: review.snapshotDigest, credentialRowSha256: sha("1"), policyRowSha256: sha("2"),
    artifactSha256: review.artifactSha256, descriptorSha256: review.descriptorSha256,
    credentialMetadataSha256: sha("3"), plistSha256: sha("4"), serviceState: "stopped", pid: null,
    workerDatabaseReceiptSha256: null, workerOperationId: review.operationId, workerReviewSha256: sha("5"), zeroActualAI: true };
  const receiptPath = `${review.operationRoot}/${review.operationId}/pre-worker-checkpoint.json`;
  const journal = { schema: "homecook.youtube-c04-controlled-cutover-journal.v1", reviewSha256: record.workerReviewSha256,
    operationId: review.operationId, operationDirectory: `${review.operationRoot}/${review.operationId}`,
    releaseSha: review.releaseSha, targetSha256: review.targetSha256, state: "quiesced", workerDatabaseReceiptSha256: null,
    preWorkerCheckpoint: { path: receiptPath, sha256: sha("6") } };
  return { review, record, journal };
}

it("neutralizes already-bound web and worker authority before importing or spawning the fixture graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "c04-bound-input-graph-"));
  try {
    const marker = "/synthetic-unreadable-c04-authority/never-open";
    const bound = (source: string, kind: "web" | "worker") => source.replace(/^export const ([A-Z0-9_]+) = [^\r\n]*;$/gmu, (line, name: string) => {
      if (!Object.hasOwn(kind === "web" ? WEB_AUTHORITY_DEFAULTS : WORKER_AUTHORITY_DEFAULTS, name)) return line;
      const value = name.endsWith("_RELEASE_SHA") ? JSON.stringify("d".repeat(40))
        : name === "YOUTUBE_C04_ARTIFACT_SHA256" ? JSON.stringify(sha("7"))
        : name === "QUANTITY_V4_PROTECTION" ? JSON.stringify({ normalProjectionSha256: sha("7"), postimageRegistrySha256: sha("8") })
        : name.endsWith("_OPERATION_ROOT") ? JSON.stringify(`${marker}/operations`)
        : `Object.freeze(${JSON.stringify({ path: `${marker}/review.json`, sha256: sha("7") })})`;
      return `export const ${name} = ${value};`;
    });
    const inputs = { web: bound(readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8"), "web"),
      worker: bound(readFileSync("scripts/lib/youtube-v71-controlled-cutover.mjs", "utf8"), "worker") };
    expect(inputs.web).toContain(marker); expect(inputs.worker).toContain(marker);
    const graph = workerFixtureGraph(directory, inputs);
    for (const path of [graph.webPath, graph.databasePath, graph.workerPath, graph.cliPath]) expect(readFileSync(path, "utf8")).not.toContain(marker);
    const web = await import(pathToFileURL(graph.webPath).href), worker = await import(pathToFileURL(graph.workerPath).href);
    expect(web.QUANTITY_V4_WORKER_OPERATION_ROOT).toBeNull(); expect(web.QUANTITY_V4_PROTECTION).toBeNull();
    expect(worker.YOUTUBE_C04_CUTOVER_REVIEW_PIN).toEqual({ path: null, sha256: null });
    const denied = spawnSync(process.execPath, [graph.cliPath, "--profile", "c04-quantity-v4", "--prepare"], { encoding: "utf8" });
    expect(denied.status).toBe(1); expect(denied.stderr).toContain("unbound C04");
    expect(() => nullC04Source(inputs.worker.replace(/^export const YOUTUBE_C04_OPERATION_ROOT = .*;$/mu, ""), "worker")).toThrow("exactly one");
    expect(() => nullC04Source(`${inputs.worker}\nexport const YOUTUBE_C04_OPERATION_ROOT = null;`, "worker")).toThrow("exactly one");
    expect(() => nullC04Source(inputs.worker.replace(/^export const YOUTUBE_C04_OPERATION_ROOT = .*;$/mu, "export const YOUTUBE_C04_OPERATION_ROOT =\n null;"), "worker")).toThrow("exactly one");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

describe("C04 T1 transaction evidence and later business activity", () => {
  function preflightFixture() {
    const { review } = fixture();
    const record: Record<string, unknown> = { status: "committed", to: review.releaseSha,
      normalDataSha256: sha("a"), rowsPreservedInTransaction: true, interstageDataContinuityAsserted: false };
    const consumers = { review: { to: review.releaseSha, database: { targetSha256: review.targetSha256 } },
      record, pointer: { path: "/owned-fixture/T1.json", sha256: sha("c") } };
    const worker = { ...consumers, pointer: { path: "/owned-fixture/DB2.json", sha256: sha("d") } };
    const observation = { target: { fixture: true }, normalDataSha256: sha("b") }, adapter = { fixture: true };
    const observe = vi.fn(async ({ stage }: { stage: string }) => ({
      authority: stage === "consumers" ? consumers : worker, observation, adapter,
    }));
    const load = vi.fn(() => consumers);
    const source = readFileSync("scripts/youtube-v71-controlled-cutover.mjs", "utf8");
    const start = source.indexOf('  async function preflight(stage, quantityWriterState = "off") {');
    const end = source.indexOf("  async function observation(context, query) {", start);
    if (start < 0 || end <= start) throw new Error("Exact C04 preflight boundary missing");
    const call = new Function("c04Database", "c04Authority", "review", "ROOT", "check",
      source.slice(start, end) + ";return preflight;")(
      { observeQuantityV4WorkerBoundary: observe }, { loadQuantityV4DatabaseReceipt: load }, review,
      "/owned-fixture", (ok: boolean, message: string) => { if (!ok) throw new Error(message); },
    );
    return { call, consumers, observation, observe, load, adapter };
  }
  it("preserves the original T1 receipt while accepting a separately verified current snapshot", async () => {
    const f = preflightFixture(), original = structuredClone(f.consumers);
    const context = await f.call("consumers");
    expect(f.observe).toHaveBeenCalledExactlyOnceWith({ repositoryRoot: "/owned-fixture", stage: "consumers", quantityWriterState: "off" });
    expect(context.consumersReceiptSha256).toBe(f.consumers.pointer.sha256);
    expect(context.databaseReceiptSha256).toBeNull(); expect(context.adapter).toBe(f.adapter);
    expect(f.observation.normalDataSha256).not.toBe(f.consumers.record.normalDataSha256);
    expect(f.consumers).toEqual(original); expect(f.load).not.toHaveBeenCalled();
  });
  it.each([
    { status: "unknown" }, { to: "f".repeat(40) }, { rowsPreservedInTransaction: false },
    { rowsPreservedInTransaction: "true" }, { normalDataSha256: "not-a-sha" },
    { interstageDataContinuityAsserted: true }, { interstageDataContinuityAsserted: undefined },
  ])("rejects missing or invalid original transaction evidence: %j", async change => {
    const f = preflightFixture(); f.observation.normalDataSha256 = sha("a");
    Object.assign(f.consumers.record, change);
    await expect(f.call("consumers")).rejects.toThrow("T1");
  });
  it("retains the separate T1 and DB2 pointers for the worker stage", async () => {
    const f = preflightFixture(), result = await f.call("worker");
    expect(f.load).toHaveBeenCalledExactlyOnceWith("/owned-fixture", "consumers");
    expect(result.consumersReceiptSha256).toBe(sha("c")); expect(result.databaseReceiptSha256).toBe(sha("d"));
  });
});

describe("fixed C04 worker cutover boundaries", () => {
  it("denies an unbound source/artifact/review before private operational I/O", () => {
    expect(YOUTUBE_C04_CUTOVER_REVIEW_PIN).toEqual({ path: null, sha256: null });
    expect([YOUTUBE_C04_RELEASE_SHA, YOUTUBE_C04_ARTIFACT_SHA256, YOUTUBE_C04_OPERATION_ROOT]).toEqual([null, null, null]);
    expect(() => assertC04QuantityControlReview(fixture().review, { releaseSha: null, artifactSha256: null, operationRoot: null })).toThrow("unbound");
    for (const tail of [["--prepare"], ["--quiesce", YOUTUBE_C04_QUIESCE_CONFIRMATION], ["--execute", YOUTUBE_C04_CUTOVER_CONFIRMATION],
      ["--resume", YOUTUBE_C04_CUTOVER_CONFIRMATION], ["--activate", YOUTUBE_C04_ACTIVATE_CONFIRMATION], ["--pause-for-repair", YOUTUBE_C04_REPAIR_CONFIRMATION]]) {
      const result = spawnSync(process.execPath, [isolated.graph.cliPath, "--profile", "c04-quantity-v4", ...tail], { encoding: "utf8" });
      expect(result.status).toBe(1); expect(result.stderr).toContain("unbound C04");
    }
    const invalid = spawnSync(process.execPath, [isolated.graph.cliPath, "--profile", "c04-quantity-v4", "--execute", YOUTUBE_C04_CUTOVER_CONFIRMATION, "--generation", "49"], { encoding: "utf8" });
    expect(invalid.status).toBe(1); expect(invalid.stderr).toContain("exact phase/confirmation"); expect(invalid.stderr).not.toContain("unbound C04");
  });

  it("accepts only the named phases and fixed confirmations without arbitrary options", () => {
    expect(parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", "--prepare"])).toEqual({ command: "--prepare", confirmation: undefined });
    expect(parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", "--quiesce", YOUTUBE_C04_QUIESCE_CONFIRMATION]).command).toBe("--quiesce");
    for (const tail of [["--execute"], ["--prepare", "--generation", "49"], ["--execute", YOUTUBE_C04_CUTOVER_CONFIRMATION, "--sql", "select 1"], ["--quiesce", YOUTUBE_C04_CUTOVER_CONFIRMATION]]) {
      expect(() => parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", ...tail])).toThrow();
    }
    expect(() => parseC04QuantityCutoverArguments(["--profile", "other", "--prepare"])).toThrow();
    expect(parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", "--activate", YOUTUBE_C04_ACTIVATE_CONFIRMATION]).command).toBe("--activate");
    expect(parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", "--pause-for-repair", YOUTUBE_C04_REPAIR_CONFIRMATION]).command).toBe("--pause-for-repair");
    expect(() => parseC04QuantityCutoverArguments(["--profile", "c04-quantity-v4", "--activate", YOUTUBE_C04_CUTOVER_CONFIRMATION])).toThrow();
  });

  it("pins the complete source/CAS/226-to227/schema review with conditional hashes", () => {
    expect(assertC04QuantityControlReview(fixture().review, bindings)).toEqual(fixture().review);
    for (const change of [{ generationAfter: 49 }, { ledgerBefore: 221 }, { catalogAfter: YOUTUBE_C04_CATALOG_BEFORE },
      { expectedSchemaSha256: sha("0") }, { artifactSha256: sha("9") }, { arbitrarySql: "select" }]) {
      expect(() => assertC04QuantityControlReview({ ...fixture().review, ...change }, bindings)).toThrow();
    }
  });

  it("requires original controlled origin even when the receipt hash is conditional null", () => {
    const { review, record, journal } = fixture();
    const context = { phase: "before", reviewSha256: record.workerReviewSha256, receiptSha256: sha("6") };
    expect(assertC04QuantityCheckpointOrigin(review, record, journal, context)).toBe(record);
    for (const change of [{ reviewSha256: sha("9") }, { state: "unknown" }, { operationId: "foreign" },
      { preWorkerCheckpoint: { path: "/private/tmp/foreign.json", sha256: sha("6") } }]) {
      expect(() => assertC04QuantityCheckpointOrigin(review, record, { ...journal, ...change }, context)).toThrow();
    }
    expect(() => assertC04QuantityCheckpointOrigin({ ...review, preReceiptSha256: sha("8") }, record, journal, context)).toThrow();
  });

  it("rejects nonquiescent or ON states and requires exact DB2 bytes on the final running receipt", () => {
    const { review, record } = fixture();
    for (const change of [{ queued: 1 }, { permitHeld: true }, { workerPolicyEnabled: true }, { weightWriterEnabled: false }, { zeroActualAI: false }, { pid: 100 }]) {
      expect(() => assertC04QuantityCheckpoint(review, { ...record, ...change }, "before", record.workerReviewSha256)).toThrow();
    }
    const after = { ...record, schema: "homecook.prelaunch-quantity-worker-after.v1", ledgerCount: 227,
      catalogFingerprint: review.catalogAfter, credentialGeneration: 48, workerReleaseSha: review.releaseSha,
      serviceState: "running", pid: 123, workerDatabaseReceiptSha256: sha("7") };
    expect(assertC04QuantityCheckpoint(review, after, "after", record.workerReviewSha256)).toBe(after);
    expect(() => assertC04QuantityCheckpoint(review, { ...after, workerDatabaseReceiptSha256: null }, "after", record.workerReviewSha256)).toThrow();
  });

  it("builds only the restricted fixed CAS without resetting the unchanged policy/key lifetime", () => {
    const { review } = fixture();
    const iat = Math.floor(now.getTime() / 1000);
    const managerClaims = { role: "youtube_extraction_credential_manager", scope: "youtube-extraction-credential-manager",
      iss: "https://worker.mumeok.kr", aud: "youtube-extraction", jti_hash: sha("a"), iat, exp: iat + 300 };
    const credentialMetadata = { generation: 48, jti_sha256: sha("b"), expires_at: new Date(now.getTime() + 518400000).toISOString(),
      release_sha: review.releaseSha, schema_identity: review.schemaIdentity, allowed_snapshot_digest: review.snapshotDigest };
    const sql = buildC04QuantityCredentialTransitionSql({ managerClaims, credentialMetadata, review }, now);
    expect(sql).toContain("rotate_youtube_extraction_worker_credential(47,48,");
    expect(sql).toContain("SET LOCAL ROLE youtube_extraction_credential_manager;");
    expect(sql).not.toMatch(/UPDATE|fingerprint_key|pipeline_identity|result_affecting_options|enabled=true/u);
    expect(() => buildC04QuantityCredentialTransitionSql({ managerClaims: { ...managerClaims, exp: iat + 301 }, credentialMetadata, review }, now)).toThrow();
  });
});


// Trusted transports are simulated: no Docker, database, launchctl, issuer or model is contacted.
function simulated() {
  const { review, record, journal: originalJournal } = fixture();
  let journal = { ...originalJournal, state: "prepared" } as typeof originalJournal & { credentials?: { metadataSha256: string }; activationVerification?: { path: string; sha256: string }; installationRepairBasis?: { path: string; sha256: string } | null; activationReceipt?: { sha256: string } | null; activationReconciliation?: { sha256: string } | null; repairPause?: { sha256: string }; repairBeforeObservation?: { policyStableSha256: string; credentialRowSha256: string } };
  let current = { ...record, policyStableSha256: sha("6"), workerPolicyEnabled: true, jtiHash: sha("1"),
    policy: { version: 3, extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE, pipelineIdentity: "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd",
      snapshotDigest: review.snapshotDigest, resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
      fingerprintKeyVersion: "key-kept", previousFingerprintKeyVersion: "old-kept", previousFingerprintValidUntil: "2099-01-01T00:00:00Z", enabled: true } };
  let service = { loaded: true, state: "running", pid: 47 as number | null, plistSha256: record.plistSha256, metadataSha256: record.credentialMetadataSha256, jtiHash: current.jtiHash };
  let pre = record, post: typeof record | null = null;
  let pause: { beforeObservation: typeof current; observation: typeof current; service: typeof service; status: string; post: typeof record } | null = null;
  let activation: { observation: typeof current; service: typeof service; post: typeof record; authority: { readerReceiptSha256: string; writerReceiptSha256: string } } | null = null;
  const calls: string[] = [];
  const credentials = { metadata: { generation: 48, jti_sha256: sha("8") }, metadataSha256: sha("9") };
  const adapters = {
    verifyCandidate: vi.fn(async () => { calls.push("candidate"); }), verifyPreparation: vi.fn(async () => {}),
    publishPreparation: vi.fn(async () => ({ prepared: true })), readJournal: async () => journal,
    readJournalIfPresent: async () => journal,
    journal: async (state: string, fields = {}) => { journal = { ...journal, ...fields, state }; calls.push(state); },
    preflight: vi.fn(async (stage: string, quantityWriterState = "off") => {
      current.ledgerCount = stage === "consumers" ? 226 : 227;
      current.catalogFingerprint = stage === "consumers" ? review.catalogBefore : review.catalogAfter;
      if (quantityWriterState === "on") expect(current.quantityPolicyEnabled).toBe(true);
      return { consumersReceiptSha256: record.consumersReceiptSha256, databaseReceiptSha256: stage === "consumers" ? null : sha("7") };
    }),
    observe: vi.fn(async () => structuredClone(current)), predecessorService: vi.fn(async () => ({ ...service })),
    transaction: vi.fn(async (_context, callback) => {
      calls.push("transaction"); const before = structuredClone(current);
      try { await callback({ observe: async () => structuredClone(current),
        closePolicy: async () => { calls.push("OFF"); if (current.workerPolicyEnabled) current.policyRowSha256 = current.policyRowSha256 === sha("a") ? sha("b") : sha("2"); current.workerPolicyEnabled = false; current.policy.enabled = false; },
        rotate: async () => { calls.push("CAS48"); current.credentialGeneration = 48; current.workerReleaseSha = review.releaseSha;
          current.credentialRowSha256 = sha("8"); current.jtiHash = credentials.metadata.jti_sha256; },
        enablePolicy: async () => { calls.push("ON"); current.workerPolicyEnabled = true; current.policy.enabled = true; current.policyRowSha256 = sha("a"); },
      }); } catch (error) { current = before; throw error; }
    }),
    stopPredecessor: vi.fn(async () => { calls.push("stop47"); service.loaded = false; service.pid = null; }),
    assertStoppedPredecessor: vi.fn(async () => { expect(service.loaded).toBe(false); }),
    publishCheckpoint: vi.fn(async (phase: string, value) => {
      if (phase === "before") { pre = value; journal.state = "quiesced"; }
      else { post = value; journal.state = "verified-policy-disabled"; }
      calls.push(`${phase}receipt`); return value;
    }),
    readCheckpoint: async (phase: string) => phase === "before" ? pre : post,
    issueCredentials: vi.fn(async () => { calls.push("issue48"); return credentials; }),
    existingCredentials: vi.fn(async () => credentials), credentialProof: (value: typeof credentials) => ({ metadataSha256: value.metadataSha256 }),
    issueManager: vi.fn(async () => ({ token: "simulated-manager" })), authenticateManager: vi.fn(async () => {}), removeManager: vi.fn(async () => {}),
    installAndVerify: vi.fn(async () => { calls.push("install48"); service = { ...service, loaded: true, state: "running", pid: 48, plistSha256: sha("a"), metadataSha256: credentials.metadataSha256, jtiHash: current.jtiHash };
      return { authenticatedStatus: 200, emptyClaimDenied: true, health: { ok: true, ready: true }, stableObservations: 2 }; }),
    currentService: vi.fn(async () => ({ ...service })),
    readerWriterAuthority: vi.fn(async () => ({ readerReceiptSha256: sha("b"), writerReceiptSha256: sha("c") })),
    verifyInstalled: vi.fn(async () => ({ authenticatedStatus: 200, emptyClaimDenied: true, health: { ok: true, ready: true }, stableObservations: 2, service: { ...service } })),
    publishActivationVerification: vi.fn(async value => { calls.push("durableActivationProof"); activation = value; journal.activationVerification = { path: `${review.operationRoot}/${review.operationId}/activation-verification.json`, sha256: sha("d") }; journal.installationRepairBasis = null; journal.activationReceipt = null; journal.activationReconciliation = null; journal.state = "activation-verified-policy-disabled"; return journal.activationVerification; }),
    assertStableInstalled: vi.fn(async () => {}), publishActivationReceipt: vi.fn(async () => { calls.push("activationReceipt"); journal.activationReceipt = { sha256: sha("a") }; journal.state = "activation-committed"; return { status: "committed" }; }),
    verifyActivationReceipt: vi.fn(async () => ({ status: "committed" })), finalizeActivation: vi.fn(async () => ({ status: "committed" })),
    activationOrigin: vi.fn(async () => activation), reconcileActivation: vi.fn(async () => ({ path: "owned-reconciliation", sha256: sha("e") })),
    publishRepairPause: vi.fn(async value => { pause = value; journal.repairPause = { sha256: sha("e") }; journal.state = value.status === "quiesced" ? "repair-quiesced" : "repair-drain-pending"; return value; }),
    readRepairPause: vi.fn(async () => pause),
    stopInstalled: vi.fn(async () => { calls.push("stop48"); service.loaded = false; service.pid = null; }),
  };
  const engine = createC04QuantityWorkerCutover({ review, reviewSha256: record.workerReviewSha256, bindings, adapters });
  return { engine, adapters, calls, review, get current() { return current; }, get journal() { return journal; },
    get pre() { return pre; }, get post() { return post; }, get service() { return service; } };
}

describe("C04 simulated controlled phases", () => {
  it("keeps prepare free of policy/service/CAS effects, and closes busy policy before reporting pending quiescence", async () => {
    const f = simulated(); await f.engine.prepare();
    expect(f.adapters.transaction).not.toHaveBeenCalled(); expect(f.adapters.stopPredecessor).not.toHaveBeenCalled();
    f.current.queued = 1;
    await expect(f.engine.quiesce()).rejects.toThrow("quiescence");
    expect(f.current.workerPolicyEnabled).toBe(false); expect(f.calls).toContain("OFF");
    expect(f.adapters.stopPredecessor).not.toHaveBeenCalled(); expect(f.adapters.issueCredentials).not.toHaveBeenCalled();
    expect(f.adapters.publishCheckpoint).not.toHaveBeenCalled();
  });

  it("quiesces exact47 then CAS48 and publishes OFF health; explicit activation alone enables worker", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute();
    expect(f.post?.credentialGeneration).toBe(48); expect(f.post?.workerPolicyEnabled).toBe(false);
    expect(f.calls.indexOf("OFF")).toBeLessThan(f.calls.indexOf("stop47"));
    expect(f.calls.indexOf("beforereceipt")).toBeLessThan(f.calls.indexOf("CAS48"));
    expect(f.calls).not.toContain("ON"); expect(f.adapters.removeManager).toHaveBeenCalledOnce();
    expect(f.current.policy.previousFingerprintKeyVersion).toBe("old-kept");
    const originalPost = structuredClone(f.post); f.current.quantityPolicyEnabled = true;
    await f.engine.activate();
    expect(f.calls.indexOf("durableActivationProof")).toBeLessThan(f.calls.indexOf("ON"));
    expect(f.current.workerPolicyEnabled).toBe(true); expect(f.post).toEqual(originalPost);
    expect(f.adapters.issueCredentials).toHaveBeenCalledOnce();
    await f.engine.activate(); expect(f.adapters.publishActivationReceipt).toHaveBeenCalledOnce();
  });

  it("never compensates a committed48 install failure with old47, and resumes without another issuance or CAS", async () => {
    const f = simulated(); await f.engine.quiesce();
    f.adapters.installAndVerify.mockRejectedValueOnce(new Error("unhealthy"));
    await expect(f.engine.execute()).rejects.toThrow("unhealthy");
    expect(f.current.credentialGeneration).toBe(48); expect(f.current.workerPolicyEnabled).toBe(false);
    expect(f.journal.state).toBe("install-repair-required"); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
    await f.engine.resume(); expect(f.adapters.issueCredentials).toHaveBeenCalledOnce();
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1); expect(f.post?.credentialGeneration).toBe(48);
  });

  it("requires exactDB2/ON receipts and fresh healthy PID before any activation", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true;
    f.adapters.readerWriterAuthority.mockRejectedValueOnce(new Error("missing reader/writer"));
    await expect(f.engine.activate()).rejects.toThrow("missing reader/writer"); expect(f.calls).not.toContain("ON");
    f.adapters.verifyInstalled.mockResolvedValueOnce({ authenticatedStatus: 200, emptyClaimDenied: false, health: { ok: true, ready: true }, stableObservations: 2, service: f.service });
    await expect(f.engine.activate()).rejects.toThrow("verification incomplete"); expect(f.calls).not.toContain("ON");
  });

  it("pauses the exact activated48 despite busy/expired/unhealthy state and records drain_pending without killing jobs", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true; await f.engine.activate();
    f.current.quantityPolicyEnabled = false; f.current.queued = 2;
    f.adapters.existingCredentials.mockRejectedValue(new Error("expired")); f.adapters.verifyInstalled.mockRejectedValue(new Error("unhealthy"));
    const pause = await f.engine.pauseForRepair();
    expect(pause.status).toBe("drain_pending"); expect(f.current.workerPolicyEnabled).toBe(false); expect(f.current.queued).toBe(2);
    expect(f.adapters.stopInstalled).not.toHaveBeenCalled(); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
    f.current.queued = 0; const drained = await f.engine.pauseForRepair(); expect(drained.status).toBe("quiesced");
    expect(drained.beforeObservation.policyRowSha256).toBe(sha("a")); expect(drained.observation.policyRowSha256).toBe(sha("b"));
    expect(f.adapters.stopInstalled).toHaveBeenCalledOnce();
  });

  it("repairs same48 from an immutable pause using current data hashes, without relabeling the original post", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true; await f.engine.activate();
    const historical = structuredClone(f.post); f.current.quantityPolicyEnabled = false; f.current.normalDataSha256 = sha("0");
    await f.engine.pauseForRepair();
    f.adapters.installAndVerify.mockRejectedValueOnce(new Error("repair health failed"));
    await expect(f.engine.resume()).rejects.toThrow("repair health failed");
    expect(f.journal.state).toBe("install-repair-required"); await f.engine.resume();
    expect(historical?.normalDataSha256).toBe(sha("f")); expect(f.post?.normalDataSha256).toBe(sha("0"));
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1); expect(f.adapters.issueCredentials).toHaveBeenCalledOnce();
    expect(historical?.policyRowSha256).toBe(sha("2")); expect(f.post?.policyRowSha256).toBe(sha("b"));
    expect(f.current.workerPolicyEnabled).toBe(false);
    // Fresh reader/quantity ON authority is simulated only after P2 publication.
    f.current.quantityPolicyEnabled = true; await f.engine.activate();
    expect(f.adapters.publishActivationVerification).toHaveBeenCalledTimes(2);
    expect(f.adapters.publishActivationReceipt).toHaveBeenCalledTimes(2);
    expect(f.current.workerPolicyEnabled).toBe(true);
    expect(historical?.workerPolicyEnabled).toBe(false); expect(historical?.policyRowSha256).toBe(sha("2"));
  });

  it("rejects foreign source/control/unknown journal without a policy change or restart", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true; await f.engine.activate();
    f.current.quantityPolicyEnabled = false; f.current.workerReleaseSha = "e".repeat(40);
    const before = f.calls.length; await expect(f.engine.pauseForRepair()).rejects.toThrow("identity");
    expect(f.calls.slice(before)).not.toContain("OFF"); expect(f.adapters.stopInstalled).not.toHaveBeenCalled();
    f.current.workerReleaseSha = f.review.releaseSha; f.journal.state = "credential-outcome-unknown";
    await expect(f.engine.resume()).rejects.toThrow("resume origin");
  });

  it("resumes a confirmed CAS commit once, but denies an unknown outcome rather than issuing again", async () => {
    const f = simulated(); await f.engine.quiesce();
    const transaction = f.adapters.transaction.getMockImplementation()!;
    f.adapters.transaction.mockImplementationOnce(async (...args) => { await transaction(...args); throw new Error("commit response lost"); });
    await expect(f.engine.execute()).rejects.toThrow("commit response lost");
    expect(f.journal.state).toBe("credential-48-committed-policy-disabled"); await f.engine.resume();
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1); expect(f.adapters.issueCredentials).toHaveBeenCalledOnce();
    const unknown = simulated(); await unknown.engine.quiesce();
    const unknownTransaction = unknown.adapters.transaction.getMockImplementation()!;
    unknown.adapters.transaction.mockImplementationOnce(async (...args) => {
      await unknownTransaction(...args); unknown.adapters.observe.mockRejectedValueOnce(new Error("readback lost")); throw new Error("commit unknown");
    });
    await expect(unknown.engine.execute()).rejects.toThrow("commit unknown");
    expect(unknown.journal.state).toBe("credential-outcome-unknown");
    await expect(unknown.engine.resume()).rejects.toThrow("resume origin");
    expect(unknown.adapters.issueCredentials).toHaveBeenCalledOnce();
  });

  it("can close exact48 after an activation commit with a lost acknowledgement using its durable original intent", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true;
    const transaction = f.adapters.transaction.getMockImplementation()!;
    f.adapters.transaction.mockImplementationOnce(async (...args) => { await transaction(...args); throw new Error("activation ack lost"); });
    await expect(f.engine.activate()).rejects.toThrow("activation ack lost");
    expect(f.journal.state).toBe("activation-outcome-unknown"); expect(f.current.workerPolicyEnabled).toBe(true);
    expect(f.adapters.publishActivationReceipt).not.toHaveBeenCalled(); f.current.quantityPolicyEnabled = false;
    f.adapters.verifyInstalled.mockRejectedValue(new Error("unhealthy"));
    const paused = await f.engine.pauseForRepair(); expect(paused.status).toBe("quiesced");
    expect(f.current.workerPolicyEnabled).toBe(false); expect(f.adapters.stopInstalled).toHaveBeenCalledOnce();
    expect(f.adapters.reconcileActivation).toHaveBeenCalledOnce(); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
  });

  it("does not mix a previous activation receipt into the second lifetime when its ON acknowledgement is lost", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true; await f.engine.activate();
    expect(f.journal.activationReceipt).not.toBeNull(); f.current.quantityPolicyEnabled = false;
    await f.engine.pauseForRepair(); await f.engine.resume();
    f.current.quantityPolicyEnabled = true;
    const transaction = f.adapters.transaction.getMockImplementation()!;
    f.adapters.transaction.mockImplementationOnce(async (...args) => { await transaction(...args); throw new Error("second ON acknowledgement lost"); });
    await expect(f.engine.activate()).rejects.toThrow("second ON acknowledgement lost");
    expect(f.journal.activationReceipt).toBeNull(); expect(f.journal.activationReconciliation).toBeNull();
    f.current.quantityPolicyEnabled = false; const secondPause = await f.engine.pauseForRepair();
    expect(secondPause.status).toBe("quiesced"); expect(f.adapters.reconcileActivation).toHaveBeenCalledOnce();
    expect(f.current.workerPolicyEnabled).toBe(false); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
  });

  it.each(["activation-verified-policy-disabled", "activation-not-applied"])("repairs exact48 after %s only when fresh quantity/worker are both OFF", async state => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute(); f.current.quantityPolicyEnabled = true;
    f.current.normalDataSha256 = sha("0");
    f.adapters.assertStableInstalled.mockRejectedValueOnce(new Error("PID changed before ON"));
    await expect(f.engine.activate()).rejects.toThrow("PID changed before ON");
    expect(f.current.workerPolicyEnabled).toBe(false); f.journal.state = state;
    f.service.loaded = false; f.service.pid = null;
    await expect(f.engine.resume()).rejects.toThrow("OFF/control");
    expect(f.adapters.installAndVerify).toHaveBeenCalledOnce();
    f.current.quantityPolicyEnabled = false;
    f.adapters.installAndVerify.mockRejectedValueOnce(new Error("interrupted repair health failed"));
    await expect(f.engine.resume()).rejects.toThrow("interrupted repair health failed");
    expect(f.journal.state).toBe("install-repair-required");
    const basis = f.journal.installationRepairBasis!;
    expect(basis).toEqual(f.journal.activationVerification);
    f.journal.installationRepairBasis = { ...basis, sha256: sha("9") };
    await expect(f.engine.resume()).rejects.toThrow("foreign installation repair basis");
    f.journal.installationRepairBasis = basis; await f.engine.resume();
    expect(f.post?.normalDataSha256).toBe(sha("0"));
    expect(f.current.workerPolicyEnabled).toBe(false); expect(f.post?.quantityPolicyEnabled).toBe(false);
    expect(f.adapters.issueCredentials).toHaveBeenCalledOnce(); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
    expect(f.calls).not.toContain("ON");
  });

  it("does not use health attestation as permission to claim work while the actual policy is OFF", async () => {
    const f = simulated(); await f.engine.quiesce(); await f.engine.execute();
    expect(f.current.workerPolicyEnabled).toBe(false); expect(f.current.queued).toBe(0);
    expect(f.calls).not.toContain("ON");
    // There is no extraction/job/model callback in this adapter contract.
    expect(Object.keys(f.adapters)).not.toEqual(expect.arrayContaining(["extract", "enqueue", "claim", "model"]));
  });
});


it("uses the actual CLI persistence adapters to preserve immutable origins and publish repair pointers last", () => {
  const directory = mkdtempSync(join(tmpdir(), "c04-cutover-owned-"));
  try {
    const graph = workerFixtureGraph(directory);
    const entrypoint = "const [command, confirmation] = process.argv.slice(2);";
    if (graph.cliSource.split(entrypoint).length !== 2) throw new Error("Fixture CLI entrypoint changed");
    // Preserve exact persistence methods; no operational adapter is invoked.
    const fixtureSource = graph.cliSource.slice(0, graph.cliSource.indexOf(entrypoint)) + "\nexport { createC04Adapters };\n";
    const modulePath = join(directory, "controlled-copy.mjs"); writeFileSync(modulePath, fixtureSource, { mode: 0o600 });
    const { review, record } = fixture(); review.operationRoot = join(directory, "operations");
    const operationDirectory = join(review.operationRoot, review.operationId); mkdirSync(operationDirectory, { recursive: true, mode: 0o700 });
    const input = join(directory, "input.json"); writeFileSync(input, JSON.stringify({ review, record }), { mode: 0o600 });
    const harness = `import { createC04Adapters } from ${JSON.stringify(modulePath)};
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const { review, record } = JSON.parse(readFileSync(${JSON.stringify(input)}, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const adapters = await createC04Adapters(review, record.workerReviewSha256);
await adapters.journal('policy-disabled-awaiting-quiescence', { workerDatabaseReceiptSha256: null });
await adapters.publishCheckpoint('before', record, { policyStableSha256: '${sha("6")}' });
const root = review.operationRoot + '/' + review.operationId;
const originalPre = readFileSync(root + '/pre-worker-checkpoint.json');
const originalPreOrigin = readFileSync(root + '/pre-worker-origin.json');
await adapters.journal('credential-commit-intent', { workerDatabaseReceiptSha256: '${sha("7")}' });
const restoredPre = adapters.readCheckpoint('before', adapters.readJournal());
const post = { ...record, schema: 'homecook.prelaunch-quantity-worker-after.v1', ledgerCount: 227, catalogFingerprint: review.catalogAfter,
  credentialGeneration: 48, workerReleaseSha: review.releaseSha, serviceState: 'running', pid: 48, workerDatabaseReceiptSha256: '${sha("7")}' };
await adapters.publishCheckpoint('after', post, { policyStableSha256: '${sha("6")}' });
const originalPost = readFileSync(root + '/post-worker-terminal.json');
const originalPostOrigin = readFileSync(root + '/post-worker-origin.json');
const off = { ...post, policyStableSha256: '${sha("6")}', jtiHash: '${sha("8")}', policy: { enabled: false } };
await adapters.publishActivationVerification({ observation: off, service: { loaded: true, pid: 48, plistSha256: post.plistSha256 }, post,
 authority: { readerReceiptSha256: '${sha("b")}', writerReceiptSha256: '${sha("c")}' } });
await adapters.journal('activation-commit-intent');
const on = { ...off, workerPolicyEnabled: true, policyRowSha256: '${sha("a")}', policy: { enabled: true } };
await adapters.reconcileActivation(adapters.readJournal(), on, post);
const closed = { ...off, policyRowSha256: '${sha("b")}' };
await adapters.publishRepairPause({ beforeObservation: on, observation: closed, service: { loaded: false, pid: null, plistSha256: post.plistSha256 }, status: 'quiesced', post });
const pauseRecord = adapters.readRepairPause(adapters.readJournal());
await adapters.publishCheckpoint('after', { ...post, pid: 49, policyRowSha256: '${sha("b")}' }, { repair: true, policyStableSha256: '${sha("6")}' });
const current = adapters.readJournal(), repaired = adapters.readCheckpoint('after', current);
await adapters.publishCheckpoint('after', { ...post, pid: 49, policyRowSha256: '${sha("b")}' }, { repair: true, policyStableSha256: '${sha("6")}' });
const reused = adapters.readJournal().postWorkerTerminal.path === current.postWorkerTerminal.path;
const repairOrigin = JSON.parse(readFileSync(current.postWorkerOrigin.path));
const reconciliation = JSON.parse(readFileSync(repairOrigin.activationReconciliation.path));
const chain = repairOrigin.policyStableSha256 === '${sha("6")}' && reconciliation.status === 'committed'
 && reconciliation.beforeObservation.policyRowSha256 === post.policyRowSha256 && reconciliation.expectedAfter.policyStableSha256 === '${sha("6")}'
 && reconciliation.observation.policyRowSha256 === '${sha("a")}' && pauseRecord.beforeObservation.policyRowSha256 === '${sha("a")}'
 && pauseRecord.observation.policyRowSha256 === '${sha("b")}' && repairOrigin.repairPause.sha256 === current.repairPause.sha256
 && repairOrigin.previousPostWorkerTerminal.path === root + '/post-worker-terminal.json';
const p2Bytes = readFileSync(current.postWorkerTerminal.path), p2OriginBytes = readFileSync(current.postWorkerOrigin.path);
await adapters.publishCheckpoint('after', { ...post, pid: 50, policyRowSha256: '${sha("b")}' }, { repair: true, policyStableSha256: '${sha("6")}' });
const p3 = adapters.readJournal(), p3Origin = JSON.parse(readFileSync(p3.postWorkerOrigin.path));
const samePauseBasis = p3Origin.previousPostWorkerTerminal.path === pauseRecord.previousPostWorkerTerminal.path
 && p3Origin.previousPostWorkerTerminal.sha256 === pauseRecord.previousPostWorkerTerminal.sha256
 && p3Origin.previousPostWorkerOrigin.path === pauseRecord.previousPostWorkerOrigin.path;
await adapters.journal('install-repair-required');
await adapters.publishCheckpoint('after', { ...post, pid: 50, policyRowSha256: '${sha("b")}' }, { repair: true, policyStableSha256: '${sha("6")}' });
const retryReused = adapters.readJournal().postWorkerTerminal.path === p3.postWorkerTerminal.path;
const p2Preserved = hash(p2Bytes) === hash(readFileSync(current.postWorkerTerminal.path))
 && hash(p2OriginBytes) === hash(readFileSync(current.postWorkerOrigin.path));
const oldReceiptFile = root + '/activation-receipt.json';
writeFileSync(oldReceiptFile, JSON.stringify({ immutable: 'old-activation' }) + String.fromCharCode(10), { mode: 0o600 });
const oldReceiptBytes = readFileSync(oldReceiptFile), oldReconciliation = readFileSync(current.activationReconciliation.path);
await adapters.journal('activation-committed', { activationReceipt: { path: oldReceiptFile, sha256: hash(oldReceiptBytes) }, installationRepairBasis: adapters.readJournal().activationVerification });
await adapters.publishActivationVerification({ observation: closed, service: { loaded: true, pid: 50, plistSha256: post.plistSha256 },
 post: { ...post, pid: 50, policyRowSha256: '${sha("b")}' }, authority: { readerReceiptSha256: '${sha("b")}', writerReceiptSha256: '${sha("c")}' } });
const newVerification = adapters.readJournal();
const cleanLifetime = newVerification.activationReceipt === null && newVerification.activationReconciliation === null && newVerification.installationRepairBasis === null
 && hash(oldReceiptBytes) === hash(readFileSync(oldReceiptFile)) && hash(oldReconciliation) === hash(readFileSync(current.activationReconciliation.path));
const unchanged = samePauseBasis && retryReused && p2Preserved && cleanLifetime && chain && reused && hash(originalPre) === hash(readFileSync(root + '/pre-worker-checkpoint.json'))
  && hash(originalPreOrigin) === hash(readFileSync(root + '/pre-worker-origin.json'))
  && hash(originalPost) === hash(readFileSync(root + '/post-worker-terminal.json'))
  && hash(originalPostOrigin) === hash(readFileSync(root + '/post-worker-origin.json'));
let blocked = false;
const pinned = await createC04Adapters({ ...review, postReceiptSha256: hash(originalPost) }, record.workerReviewSha256);
try { await pinned.publishCheckpoint('after', { ...post, pid: 50 }, { repair: true, policyStableSha256: '${sha("6")}' }); } catch { blocked = true; }
writeFileSync(${JSON.stringify(join(directory, "result.json"))}, JSON.stringify({ unchanged, blocked, restoredGeneration: restoredPre.credentialGeneration,
  repairedPid: repaired.pid, repairPath: current.postWorkerTerminal.path.startsWith(root + '/verifications/'),
  matchingOrigin: current.postWorkerOrigin.path === current.postWorkerTerminal.path.replace('post-worker-terminal.json', 'post-worker-origin.json') }), { mode: 0o600 });`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", harness], { encoding: "utf8" });
    expect(run.stderr).toBe(""); expect(run.status).toBe(0);
    expect(JSON.parse(readFileSync(join(directory, "result.json"), "utf8"))).toEqual({ unchanged: true, blocked: true, restoredGeneration: 47, repairedPid: 49, repairPath: true, matchingOrigin: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


it("keeps local startup attestation separate from an OFF database claim fence without extracting", async () => {
  const { review } = fixture();
  const policy = buildYoutubeExtractionCurrentPolicy({ policySnapshotDigest: review.snapshotDigest, policyVersion: 3,
    pipelineIdentity: "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd", extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE, enabled: true });
  expect(policy.enabled).toBe(true);
  const extract = vi.fn(), rpc = vi.fn(async (name: string) => {
    expect(name).toBe("claim_youtube_extraction_job");
    // Simulates the reviewed SQL OFF branch; this is not an operational database observation.
    return { data: { applied: false, status: "empty" }, error: null };
  });
  const runtime = createYoutubeExtractionWorkerRuntime({ workerId: "owned-c04-no-job", allowedSnapshotDigest: review.snapshotDigest, rpc, extractor: { extract } });
  expect(await runtime.runOnce()).toBe("idle"); expect(rpc).toHaveBeenCalledOnce(); expect(extract).not.toHaveBeenCalled();
});
