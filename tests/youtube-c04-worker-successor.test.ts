import { createHash } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS, DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import { createC04QuantityWorkerCutover, assertC04QuantityCheckpoint, assertC04QuantityCheckpointOrigin, assertC04QuantityJournal, assertC04SuccessorCheckpoint, assertC04WorkerSuccessorBinding,
  YOUTUBE_C04_CATALOG_AFTER, YOUTUBE_C04_CATALOG_BEFORE, YOUTUBE_C04_EXPECTED_SCHEMA_SHA256 } from "../scripts/lib/youtube-v71-controlled-cutover.mjs";
const sha = (n: string) => n.repeat(64);
type MaintenanceBinding = { schema: string; reviewSha256: string; receipt: {path: string; sha256: string}; predecessorDatabaseReceiptSha256: string; targetSha256: string; ledgerCount: number; migrationSha256: string; sourceReaderRef: string; databasePlanSha256: string };
const bindings = { releaseSha: "d".repeat(40), artifactSha256: sha("a"), operationRoot: "/private/tmp/c04-successor-fixture" };
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
function simulated() {
  const { review, record, journal: originalJournal } = fixture();
  let journal = { ...originalJournal, state: "prepared" } as typeof originalJournal & { credentials?: { metadataSha256: string }; activationVerification?: { path: string; sha256: string }; installationRepairBasis?: { path: string; sha256: string } | null; activationReceipt?: { sha256: string } | null; activationReconciliation?: { sha256: string } | null; repairPause?: { sha256: string }; repairBeforeObservation?: { policyStableSha256: string; credentialRowSha256: string } };
  let current = { ...record, databaseMaintenance: undefined as MaintenanceBinding | undefined, databaseSuccessor: undefined as ReturnType<typeof successorBinding> | undefined, policyStableSha256: sha("6"), workerPolicyEnabled: true, jtiHash: sha("1"),
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
      return { consumersReceiptSha256: record.consumersReceiptSha256, databaseReceiptSha256: stage === "consumers" ? null : sha("7"), successor: undefined as ReturnType<typeof successorBinding> | undefined };
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

function successorBinding() {
  return { schema: "homecook.cooked-weight-attestation-successor.v1", reviewSha256: sha("a"),
    receipt: { path: "/owned-fixture/attestation228.json", sha256: sha("b") }, predecessorDatabaseReceiptSha256: sha("7"),
    targetSha256: sha("b"), ledgerCount: 228, migrationSha256: sha("c") };
}
async function active228() {
  const f = simulated(); await f.engine.quiesce(); await f.engine.execute();
  f.current.quantityPolicyEnabled = true; await f.engine.activate();
  const original = structuredClone(f.post), originalPre = structuredClone(f.pre), binding = successorBinding();
  f.adapters.preflight.mockImplementation(async (stage: string, quantityWriterState = "off") => {
    if (stage !== "worker") throw new Error("successor cannot authorize consumers");
    f.current.ledgerCount = 228; f.current.catalogFingerprint = f.review.catalogAfter; f.current.databaseSuccessor = binding;
    if (quantityWriterState === "on") expect(f.current.quantityPolicyEnabled).toBe(true);
    return { consumersReceiptSha256: f.pre.consumersReceiptSha256, databaseReceiptSha256: sha("7"), successor: binding };
  });
  return Object.assign(f, { original, originalPre, binding });
}
function maintenanceBinding(binding: ReturnType<typeof successorBinding>): MaintenanceBinding {
  return { schema: "homecook.recipe-nutrition-validator-maintenance.v1", reviewSha256: sha("1"),
    receipt: { path: "/owned-fixture/validator229.json", sha256: sha("2") }, predecessorDatabaseReceiptSha256: binding.receipt.sha256,
    targetSha256: binding.targetSha256, ledgerCount: 229, migrationSha256: sha("3"), sourceReaderRef: "e".repeat(40), databasePlanSha256: sha("4") };
}
async function active229() {
  const f = await active228(), maintenance = maintenanceBinding(f.binding);
  const preflight = f.adapters.preflight.getMockImplementation()!;
  f.adapters.preflight.mockImplementation(async (...args) => {
    const context = await preflight(...args); f.current.ledgerCount = 229; f.current.databaseMaintenance = maintenance;
    return { ...context, databaseMaintenance: maintenance };
  });
  return Object.assign(f, { maintenance });
}
describe("fixed validator229 worker maintenance", () => {
  it("retains same48/CAS1 across committed readback, pause, install repair and fresh activation", async () => {
    const f = await active229(); await f.engine.activate();
    f.current.quantityPolicyEnabled = false;
    const paused = await f.engine.pauseForRepair(); expect(paused.observation.ledgerCount).toBe(229);
    const repaired = await f.engine.resume(); expect(repaired.ledgerCount).toBe(229);
    expect(repaired.databaseMaintenance).toEqual(f.maintenance);
    expect(() => assertC04SuccessorCheckpoint(f.review, repaired, sha("5"))).not.toThrow();
    f.current.quantityPolicyEnabled = true; await f.engine.activate();
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1); expect(f.adapters.issueCredentials).toHaveBeenCalledTimes(1);
    expect(f.original?.ledgerCount).toBe(227); expect(f.originalPre.ledgerCount).toBe(226);
  });
  it.each(["activation-commit-intent", "activation-outcome-unknown"])("does not adopt old228 %s at229", async state => {
    const f = await active228(); f.current.quantityPolicyEnabled = false; await f.engine.pauseForRepair(); await f.engine.resume();
    f.current.quantityPolicyEnabled = true;
    f.adapters.transaction.mockImplementationOnce(async () => { throw new Error("old228 before commit"); });
    await expect(f.engine.activate()).rejects.toThrow(); f.journal.state = state;
    const maintenance = maintenanceBinding(f.binding), old = f.adapters.preflight.getMockImplementation()!;
    f.adapters.preflight.mockImplementation(async (...args) => {
      const context = await old(...args); f.current.ledgerCount = 229; f.current.databaseMaintenance = maintenance;
      return { ...context, databaseMaintenance: maintenance };
    });
    const count = f.calls.filter(x => x === "ON").length;
    await expect(f.engine.activate()).rejects.toThrow(); expect(f.calls.filter(x => x === "ON")).toHaveLength(count);
    expect(f.adapters.finalizeActivation).not.toHaveBeenCalled();
  });
  it("rejects changed locked maintenance binding before policy writes", async () => {
    const f = await active229(); await f.engine.activate(); f.current.quantityPolicyEnabled = false;
    await f.engine.pauseForRepair(); await f.engine.resume(); f.current.quantityPolicyEnabled = true;
    const transaction = f.adapters.transaction.getMockImplementation()!;
    f.adapters.transaction.mockImplementationOnce(async (ctx, callback) => transaction(ctx, async (tx: { observe: () => Promise<typeof f.current> }) => callback({ ...tx,
      observe: async () => ({ ...await tx.observe(), databaseMaintenance: { ...f.maintenance, receipt: { ...f.maintenance.receipt, sha256: sha("f") } } }) })));
    const count = f.calls.filter(x => x === "ON").length;
    await expect(f.engine.activate()).rejects.toThrow(); expect(f.calls.filter(x => x === "ON")).toHaveLength(count);
  });
});

describe("fixed attestation228 worker successor", () => {
  it("keeps historical227 validators exact and verifies current228 separately", async () => {
    const f = await active228();
    expect(() => assertC04QuantityCheckpoint(f.review, f.original, "after", sha("5"))).not.toThrow();
    expect(() => assertC04QuantityCheckpoint(f.review, { ...f.original, ledgerCount: 228 }, "after", sha("5"))).toThrow();
    expect(() => assertC04WorkerSuccessorBinding(f.review, f.binding, sha("7"))).not.toThrow();
    await f.engine.activate();
    expect(f.adapters.verifyActivationReceipt).toHaveBeenCalled();
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
  });
  it("pauses/resumes same48 with a new228 checkpoint while preserving original227 and226 records", async () => {
    const f = await active228(); f.current.quantityPolicyEnabled = false;
    const paused = await f.engine.pauseForRepair(); expect(paused.observation.ledgerCount).toBe(228);
    const resumed = await f.engine.resume();
    expect(resumed.ledgerCount).toBe(228); expect(resumed.databaseSuccessor).toEqual(f.binding);
    expect(resumed.predecessorRecord).toEqual(f.original);
    expect(() => assertC04SuccessorCheckpoint(f.review, resumed, sha("5"))).not.toThrow();
    expect(f.original?.ledgerCount).toBe(227); expect(f.originalPre.ledgerCount).toBe(226);
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1); expect(f.adapters.issueCredentials).toHaveBeenCalledTimes(1);
    expect(f.adapters.installAndVerify).toHaveBeenLastCalledWith(expect.anything(), f.original, { resume: true, successor: f.binding });
  });
  it("does not use original226/gen47 as successor repair authority", async () => {
    const f = await active228(); f.current.quantityPolicyEnabled = false;
    f.journal.state = "verified-policy-disabled";
    await expect(f.engine.resume()).rejects.toThrow("original48 current repair/activation origin");
    expect(f.adapters.issueCredentials).toHaveBeenCalledTimes(1);
  });
  it.each(["migrationSha256", "reviewSha256", "predecessorDatabaseReceiptSha256", "targetSha256"])("rejects malformed or foreign %s before a current action", async field => {
    const f = await active228(); Object.assign(f.binding, { [field]: field === "migrationSha256" || field === "reviewSha256" ? "bad" : sha("f") });
    await expect(f.engine.activate()).rejects.toThrow();
  });
  it("rejects changed successor inside the locked observation before policy mutation", async () => {
    const f = await active228(); f.current.quantityPolicyEnabled = false; await f.engine.pauseForRepair(); await f.engine.resume();
    f.current.quantityPolicyEnabled = true;
    const transaction = f.adapters.transaction.getMockImplementation()!;
    f.adapters.transaction.mockImplementationOnce(async (context, callback) => transaction(context, async (tx: { observe: () => Promise<typeof f.current> }) => callback({ ...tx,
      observe: async () => ({ ...await tx.observe(), databaseSuccessor: { ...f.binding, migrationSha256: sha("f") } }),
    })));
    const onCount = f.calls.filter(x => x === "ON").length;
    await expect(f.engine.activate()).rejects.toThrow("successor/stage");
    expect(f.calls.filter(x => x === "ON")).toHaveLength(onCount);
  });
  it("rejects changed critical worker catalog and never authorizes quiesce47 at228", async () => {
    const f = await active228(); f.current.quantityPolicyEnabled = false;
    const observe = f.adapters.observe.getMockImplementation()!;
    f.adapters.observe.mockImplementationOnce(async () => ({ ...await observe(), catalogFingerprint: sha("f") }));
    await expect(f.engine.pauseForRepair()).rejects.toThrow("identity");
    await expect(f.engine.quiesce()).rejects.toThrow("consumers");
    expect(f.adapters.stopInstalled).not.toHaveBeenCalled();
  });
});

const cliSource = readFileSync("scripts/youtube-v71-controlled-cutover.mjs", "utf8");
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function extract(startText: string, endText: string, name: string, bindings: Record<string, unknown>) {
  const start = cliSource.indexOf(startText), end = cliSource.indexOf(endText, start);
  if (start < 0 || end <= start) throw new Error("Exact C04 function boundary missing");
  return new Function(...Object.keys(bindings), cliSource.slice(start, end) + `;return ${name};`)(...Object.values(bindings));
}
describe("current228 CLI transports without operational I/O", () => {
  it("preflight keeps the original DB2 authority and attaches only the checked successor", async () => {
    const { review } = fixture(), binding = successorBinding();
    const authority = { review: { to: review.releaseSha, database: { targetSha256: review.targetSha256 } }, pointer: { sha256: sha("7") } };
    const postgresContext = { currentUser: "postgres", sessionUser: "postgres", roleSetting: "none", searchPath: '"\\$user", public, extensions', timeZone: "UTC" };
    const successor = { fixture: true }, adapter = { fixture: true, query: vi.fn(async () => JSON.stringify(postgresContext)) };
    const observation = { target: { fixture: true } };
    const observe = vi.fn(async () => ({ authority, successor, adapter, observation }));
    const consumers = { record: { status: "committed", to: review.releaseSha }, pointer: { sha256: sha("e") } };
    const read = extract('  async function preflight(stage, quantityWriterState = "off") {', '  async function observation(context, query) {', "preflight",
      { c04Database: { observeQuantityV4WorkerBoundary: observe }, c04Authority: { cookedWeightAttestationSuccessorBinding: () => binding, loadQuantityV4DatabaseReceipt: () => consumers },
        review, ROOT: "/owned-fixture", check, assertC04WorkerSuccessorBinding, C04_DATABASE_CONTEXT_SQL: "owned context", lastJson: JSON.parse });
    const result = await read("worker");
    expect(result.authority).toBe(authority); expect(result.adapter).toBe(adapter);
    expect(result.successor).toEqual(binding); expect(result.databaseReceiptSha256).toBe(sha("7"));
    expect(result.postgresContext).toEqual(postgresContext);
    expect(adapter.query).toHaveBeenCalledOnce(); expect(adapter.query).toHaveBeenCalledWith("owned context");
    adapter.query.mockResolvedValueOnce(JSON.stringify({ ...postgresContext, currentUser: "supabase_admin" }));
    await expect(read("worker")).rejects.toThrow("original postgres context");
    await expect(read("consumers")).rejects.toThrow("quiesce47");
  });
  it("observes through the same-session checked adapter and adds the exact binding", async () => {
    const binding = successorBinding(), query = vi.fn(async () => "{}"), target = { fixture: true };
    const worker = { workerPolicyEnabled: true, credentialGeneration: 48, workerReleaseSha: "d".repeat(40), schemaIdentity: "schema", snapshotDigest: sha("a") };
    const adapter = { query, observe: vi.fn(async () => ({ target, ledger: Array(228).fill({}), normalDataSha256: sha("b"), writerEnabled: true,
      productWriterEnabled: true, cookedWeightWriterEnabled: true, worker })) };
    const read = extract('  async function observation(context, query) {', '  async function transaction(context, callback) {', "observation", {
      review: fixture().review, normalizeDatabaseObservation: () => ({ credential: { jtiHash: sha("c") }, catalogFingerprint: YOUTUBE_C04_CATALOG_AFTER }),
      lastJson: () => ({}), lastLine: () => sha("d"), OBSERVATION_SQL: "fixture observation", C04_POLICY_STABLE_SQL: "fixture stable", check, sha256: hash,
    });
    const value = await read({ adapter, successor: binding });
    expect(adapter.observe).toHaveBeenCalledWith(undefined, expect.stringContaining("youtube-resolution-c04-"));
    expect(value.databaseSuccessor).toEqual(binding); expect(value.ledgerCount).toBe(228); expect(value.catalogFingerprint).toBe(YOUTUBE_C04_CATALOG_AFTER);
  });
  it("publishes actual228 activation bytes separately from a historical227 receipt", async () => {
    const f = await active228(); await f.engine.activate();
    const observation = { ...structuredClone(f.current), ledgerCount: 228, databaseSuccessor: f.binding };
    const originalObservation = { ...observation, ledgerCount: 227, databaseSuccessor: undefined, workerPolicyEnabled: false,
      policy: { ...observation.policy, enabled: false } };
    const verification = { observation: originalObservation, post: f.original, service: { plistSha256: hash("fixed plist") } };
    const proof = { path: "/owned-fixture/verification.json", sha256: hash(JSON.stringify(verification)) };
    const oldReceipt = JSON.stringify({ schema: "homecook.youtube-c04-activation-receipt.v1", activationVerification: proof, database: originalObservation });
    const paths = { activationReceipt: "/owned-fixture/activation-receipt.json" };
    const store = new Map([[proof.path, JSON.stringify(verification)], [paths.activationReceipt, oldReceipt]]);
    const readPrivate = (path: string) => { const value = store.get(path); if (value === undefined) throw new Error("unowned fixture path"); return value; };
    const validate = extract('  function assertCurrentOrigin(', '  function activationOrigin(', "assertCurrentOrigin", {
      currentSuccessor: () => f.binding, assertC04WorkerSuccessorBinding, check, review: f.review, isDeepStrictEqual,
    });
    const journal = vi.fn(async () => {}), service = { loaded: true, state: "running", pid: 48 };
    const publish = extract('  async function publishActivationReceipt(', '  return { verifyCandidate:', "publishActivationReceipt", {
      readPrivate, sha256: hash, assertCurrentOrigin: validate, isDeepStrictEqual, check, review: f.review, reviewSha256: sha("5"),
      verifyInstalled: async () => ({ service }), existingCredentials: () => ({}), readJournal: () => ({ activationReceipt: { path: paths.activationReceipt, sha256: hash(oldReceipt) } }),
      observation: async () => observation, readLaunchStatus: () => service, PLIST: "/owned-fixture/plist", readFileSync: () => "fixed plist",
      stableStringify: JSON.stringify, baseJournal: { reviewSha256: sha("5") }, paths, directory: "/owned-fixture", existsSync: (path: string) => store.has(path),
      privateDirectory: (path: string) => path, join, randomUUID: () => "12345678-1234-4234-8234-123456789abc",
      durablePrivateJson: (path: string, value: unknown) => { expect(store.has(path)).toBe(false); store.set(path, JSON.stringify(value)); }, journal,
    });
    const record = await publish({ successor: f.binding, databaseReceiptSha256: sha("7") }, proof, { readerReceiptSha256: sha("b"), writerReceiptSha256: sha("c") });
    expect(record.schema).toBe("homecook.youtube-c04-activation-receipt-successor.v1");
    expect(record.database.ledgerCount).toBe(228); expect(record.beforeObservation.ledgerCount).toBe(227);
    expect(record.databaseSuccessor).toEqual(f.binding); expect(store.get(paths.activationReceipt)).toBe(oldReceipt);
    expect(record.predecessorActivationReceipt).toEqual({ path: paths.activationReceipt, sha256: hash(oldReceipt) });
    expect(journal).toHaveBeenCalledWith("activation-committed", { activationReceipt: expect.objectContaining({ path: expect.stringContaining("activation-receipts/") }) });
    expect(() => validate({ ...record, databaseSuccessor: { ...f.binding, migrationSha256: sha("f") } })).toThrow("binding");
    expect(() => validate({ ...record, database: { ...record.database, ledgerCount: 227 } }, { ...record.database, ledgerCount: 227 })).toThrow("binding");
  });
});

it("reconciles a lost228 activation acknowledgement only with the matching new intent", async () => {
  const f = await active228(); f.current.quantityPolicyEnabled = false; await f.engine.pauseForRepair(); await f.engine.resume();
  f.current.quantityPolicyEnabled = true;
  const transaction = f.adapters.transaction.getMockImplementation()!;
  f.adapters.transaction.mockImplementationOnce(async (...args) => { await transaction(...args); throw new Error("current228 acknowledgement lost"); });
  await expect(f.engine.activate()).rejects.toThrow("acknowledgement lost");
  expect(f.journal.state).toBe("activation-outcome-unknown");
  const intent = f.adapters.publishActivationVerification.mock.calls.at(-1)?.[0];
  expect(intent.observation.databaseSuccessor).toEqual(f.binding);
  const origin = { ...intent, databaseSuccessor: f.binding }, current = { ...f.journal }, pointer = { path: "/owned-fixture/reconciliation.json", sha256: sha("e") };
  const observation = structuredClone(f.current), writes: Array<Record<string, unknown>> = [];
  const reconcile = extract('  async function reconcileActivation(', '  async function publishRepairPause(', "reconcileActivation", {
    activationOrigin: () => origin, check, isDeepStrictEqual, review: f.review, reviewSha256: sha("5"),
    stableStringify: JSON.stringify, baseJournal: {}, directory: "/owned-fixture", join,
    privateDirectory: (path: string) => path, randomUUID: () => "12345678-1234-4234-8234-123456789abc",
    durablePrivateJson: (_path: string, value: Record<string, unknown>) => writes.push(value), readPrivate: () => JSON.stringify(writes.at(-1)), sha256: () => pointer.sha256,
    journal: vi.fn(async () => {}), assertCurrentOrigin: () => f.binding,
  });
  await reconcile(current, observation, f.post);
  expect(writes[0]).toMatchObject({ schema: "homecook.youtube-c04-activation-reconciliation-successor.v1", status: "committed",
    databaseSuccessor: f.binding, expectedAfter: { ledgerCount: 228, catalogFingerprint: f.review.catalogAfter, databaseSuccessor: f.binding } });
  await expect(reconcile(current, { ...observation, databaseSuccessor: { ...f.binding, receipt: { ...f.binding.receipt, sha256: sha("f") } } }, f.post)).rejects.toThrow("successor intent");
  expect(writes).toHaveLength(1); expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
});

it("checks the new checkpoint against original227 bytes and rejects foreign paths or lineage", async () => {
  const f = await active228(); f.current.quantityPolicyEnabled = false; await f.engine.pauseForRepair(); const record = await f.engine.resume();
  const directory = `${f.review.operationRoot}/${f.review.operationId}`, paths = { postOrigin: `${directory}/post-worker-origin.json` };
  const oldBytes = JSON.stringify(f.original), predecessor = { path: `${directory}/post-worker-terminal.json`, sha256: hash(oldBytes) };
  const oldOrigin = { ...fixture().journal, state: "verified-policy-disabled", workerDatabaseReceiptSha256: sha("7"), postWorkerTerminal: predecessor };
  const oldOriginBytes = JSON.stringify(oldOrigin), predecessorOrigin = { path: paths.postOrigin, sha256: hash(oldOriginBytes) };
  const pointer = { path: `${directory}/verifications/12345678-1234-4234-8234-123456789abc/post-worker-terminal.json`, sha256: hash(JSON.stringify(record)) };
  const origin = { ...oldOrigin, postWorkerTerminal: pointer, databaseSuccessor: f.binding, successorPredecessorCheckpoint: predecessor, successorPredecessorOrigin: predecessorOrigin };
  const store = new Map([[predecessor.path, oldBytes], [predecessorOrigin.path, oldOriginBytes]]);
  const read = extract('  function checkpointOrigin(', '  async function publishCheckpoint(', "checkpointOrigin", {
    assertC04QuantityCheckpointOrigin, assertC04SuccessorCheckpoint, assertC04QuantityJournal, review: f.review, reviewSha256: sha("5"),
    currentSuccessor: () => f.binding, isDeepStrictEqual, check, directory, paths, join,
    dirname: (path: string) => path.slice(0, path.lastIndexOf("/")), sha256: hash,
    readPrivate: (path: string) => { const value = store.get(path); if (value === undefined) throw new Error("unowned fixture read"); return value; },
  });
  expect(read(record, origin, "after", pointer.sha256)).toEqual(record);
  expect(() => read(record, { ...origin, postWorkerTerminal: { ...pointer, path: "/foreign/post-worker-terminal.json" } }, "after", pointer.sha256)).toThrow("path");
  expect(() => read(record, { ...origin, successorPredecessorCheckpoint: { ...predecessor, sha256: sha("f") } }, "after", pointer.sha256)).toThrow("bytes");
  expect(() => read(record, origin, "before", pointer.sha256)).toThrow("historical");
  expect(() => assertC04SuccessorCheckpoint(f.review, { ...record, predecessorRecord: { ...f.original, ledgerCount: 228 } }, sha("5"))).toThrow();
});

it("rejects unproved229, missing binding and generation47 without widening the historical ledger", async () => {
  const f = await active228(); f.binding.ledgerCount = 229;
  await expect(f.engine.activate()).rejects.toThrow("successor"); f.binding.ledgerCount = 228;
  const observe = f.adapters.observe.getMockImplementation()!;
  f.adapters.observe.mockImplementationOnce(async () => ({ ...await observe(), databaseSuccessor: undefined }));
  await expect(f.engine.activate()).rejects.toThrow("successor/stage");
  f.adapters.observe.mockImplementationOnce(async () => ({ ...await observe(), credentialGeneration: 47 }));
  await expect(f.engine.activate()).rejects.toThrow("identity");
});
it("retains source, key-bound credential, artifact, metadata and plist invariants on current checkpoints", async () => {
  const f = await active228(); f.current.quantityPolicyEnabled = false; await f.engine.pauseForRepair(); const record = await f.engine.resume();
  for (const key of ["credentialRowSha256", "artifactSha256", "descriptorSha256", "credentialMetadataSha256", "plistSha256", "workerReleaseSha", "schemaIdentity", "snapshotDigest"]) {
    expect(() => assertC04SuccessorCheckpoint(f.review, { ...record, [key]: sha("f") }, sha("5"))).toThrow();
  }
});
it("keeps busy228 pause drain-pending without stopping jobs or reissuing48", async () => {
  const f = await active228(); f.current.quantityPolicyEnabled = false; f.current.queued = 1;
  const paused = await f.engine.pauseForRepair(); expect(paused.status).toBe("drain_pending");
  expect(paused.observation.databaseSuccessor).toEqual(f.binding); expect(paused.observation.ledgerCount).toBe(228);
  expect(f.adapters.stopInstalled).not.toHaveBeenCalled(); expect(f.adapters.issueCredentials).toHaveBeenCalledTimes(1);
});

describe("pending activation cannot cross the successor boundary", () => {
  it.each([false, true])("rejects original227 unknown intent at current228 enabled=%s before any mutable adapter", async enabled => {
    const f = await active228();
    f.journal.state = "activation-outcome-unknown";
    f.journal.activationReceipt = null; f.journal.activationReconciliation = null;
    f.current.workerPolicyEnabled = enabled; f.current.policy.enabled = enabled;
    if (!enabled) f.current.policyRowSha256 = f.original!.policyRowSha256;
    const original = structuredClone(f.journal), calls = f.calls.length;
    const candidate = f.adapters.verifyCandidate.mock.calls.length, published = f.adapters.publishActivationVerification.mock.calls.length;
    const transactions = f.adapters.transaction.mock.calls.length;
    await expect(f.engine.activate()).rejects.toThrow();
    expect(f.journal).toEqual(original); expect(f.calls.slice(calls)).toEqual([]);
    expect(f.adapters.activationOrigin).toHaveBeenCalled();
    expect(f.adapters.verifyCandidate).toHaveBeenCalledTimes(candidate);
    expect(f.adapters.publishActivationVerification).toHaveBeenCalledTimes(published);
    expect(f.adapters.transaction).toHaveBeenCalledTimes(transactions);
    expect(f.adapters.finalizeActivation).not.toHaveBeenCalled();
  });
  it.each([false, true])("keeps same228 unknown intent retry enabled=%s after checking its original identity", async enabled => {
    const f = await active228(); f.current.quantityPolicyEnabled = false;
    await f.engine.pauseForRepair(); await f.engine.resume(); f.current.quantityPolicyEnabled = true;
    if (enabled) {
      const transaction = f.adapters.transaction.getMockImplementation()!;
      f.adapters.transaction.mockImplementationOnce(async (...args) => { await transaction(...args); throw new Error("lost commit acknowledgement"); });
    } else f.adapters.assertStableInstalled.mockRejectedValueOnce(new Error("unapplied intent"));
    await expect(f.engine.activate()).rejects.toThrow();
    f.journal.state = "activation-outcome-unknown";
    const origins = f.adapters.activationOrigin.mock.calls.length, on = f.calls.filter(x => x === "ON").length;
    await expect(f.engine.activate()).resolves.toMatchObject({ status: "committed" });
    expect(f.adapters.activationOrigin).toHaveBeenCalledTimes(origins + 1);
    expect(f.calls.filter(x => x === "ON")).toHaveLength(on + (enabled ? 0 : 1));
    expect(f.calls.filter(x => x === "CAS48")).toHaveLength(1);
    if (enabled) expect(f.adapters.finalizeActivation).toHaveBeenCalledTimes(1);
  });
});

it.each(["migration", "receipt"])("preserves same228 unknown state when the original intent has a foreign %s binding", async field => {
  const f = await active228(); f.current.quantityPolicyEnabled = false;
  await f.engine.pauseForRepair(); await f.engine.resume(); f.current.quantityPolicyEnabled = true;
  f.adapters.assertStableInstalled.mockRejectedValueOnce(new Error("unapplied intent"));
  await expect(f.engine.activate()).rejects.toThrow("unapplied intent"); f.journal.state = "activation-outcome-unknown";
  const read = f.adapters.activationOrigin.getMockImplementation()!;
  f.adapters.activationOrigin.mockImplementationOnce(async () => {
    const intent = (await read())!;
    return { ...intent, observation: { ...intent.observation, databaseSuccessor: field === "migration"
      ? { ...f.binding, migrationSha256: sha("f") } : { ...f.binding, receipt: { ...f.binding.receipt, sha256: sha("f") } } } };
  });
  const original = structuredClone(f.journal), count = f.calls.length;
  await expect(f.engine.activate()).rejects.toThrow("successor/stage");
  expect(f.journal).toEqual(original); expect(f.calls.slice(count)).toEqual([]);
});

function sameSessionContextFixture() {
  const admin = { currentUser: "supabase_admin", sessionUser: "supabase_admin", roleSetting: "none",
    searchPath: '"\\$user", public, auth, extensions', timeZone: "UTC" };
  const postgres = { currentUser: "postgres", sessionUser: "postgres", roleSetting: "none",
    searchPath: '"\\$user", public, extensions', timeZone: "UTC" };
  let current = { ...admin }, saved: typeof admin | null = null, aborted = false;
  const failure = { sql: false, restore: false, guard: false, setup: false, restoredConfig: false }, originalError = new Error("owned observation failed");
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("ROLLBACK TO SAVEPOINT")) {
      if (failure.restore) throw new Error("owned restore failed");
      if (!saved) throw new Error("owned savepoint missing");
      current = { ...saved }; aborted = false; return "";
    }
    if (aborted) throw new Error("owned transaction is aborted");
    if (sql === "owned context") return JSON.stringify(current);
    if (sql.startsWith("SAVEPOINT")) { saved = { ...current }; return ""; }
    if (sql.startsWith("RELEASE SAVEPOINT")) { saved = null; if (failure.restoredConfig) current.timeZone = "foreign-zone"; return ""; }
    if (sql.includes("SET LOCAL ROLE postgres")) {
      current = { ...current, currentUser: "postgres", roleSetting: "postgres", searchPath: postgres.searchPath, timeZone: failure.setup ? "foreign-zone" : postgres.timeZone };
      return "";
    }
    if (sql === "owned model") { if (failure.sql) { aborted = true; throw originalError; } return "{}"; }
    if (sql === "owned stable") return sha("d");
    if (sql.startsWith("UPDATE private.youtube_extraction_current_policy")) expect(current).toEqual(admin);
    return "";
  });
  const worker = { workerPolicyEnabled: true, credentialGeneration: 48, workerReleaseSha: "d".repeat(40), schemaIdentity: "schema", snapshotDigest: sha("a") };
  const adapter = { query, observe: vi.fn(async (sessionQuery?: unknown) => {
    if (typeof sessionQuery !== "function") throw new Error("owned same-session query missing");
    if (context.successor) {
      expect(JSON.parse(await sessionQuery("owned context"))).toEqual(current);
      if (current.currentUser !== "postgres" || current.searchPath !== postgres.searchPath || current.timeZone !== "UTC") throw new Error("owned catalog actor/context differs");
      if (failure.guard) throw originalError;
    }
    return { target: context.target, ledger: Array(context.successor ? 228 : 227).fill({}), normalDataSha256: sha("b"), writerEnabled: false,
      productWriterEnabled: true, cookedWeightWriterEnabled: true, worker };
  }) };
  const context = { adapter, successor: successorBinding() as ReturnType<typeof successorBinding> | undefined,
    postgresContext: postgres as typeof postgres | undefined, stage: "worker", quantityWriterState: "off", target: { postgresContainerId: "a".repeat(64) } };
  const observe = extract('  async function observation(context, query) {', '  async function transaction(context, callback) {', "observation", {
    review: fixture().review, normalizeDatabaseObservation: () => ({ credential: { jtiHash: sha("c") }, catalogFingerprint: YOUTUBE_C04_CATALOG_AFTER }),
    lastJson: JSON.parse, lastLine: (value: string) => value.trim(), OBSERVATION_SQL: "owned model", C04_POLICY_STABLE_SQL: "owned stable",
    C04_DATABASE_CONTEXT_SQL: "owned context", check, sha256: hash, isDeepStrictEqual,
  });
  const session = { query, close: vi.fn(async () => {}), stop: vi.fn() };
  const transaction = extract('  async function transaction(context, callback) {', '  function existingCredentials(', "transaction", {
    openDedicatedAdminSession: () => session, randomUUID: () => "12345678-1234-4234-8234-123456789abc", observation: observe,
    buildC04QuantityCredentialTransitionSql: () => { throw new Error("unexpected credential issue"); }, review: fixture().review,
  });
  return { admin, postgres, context, calls, query, adapter, session, observe, transaction, failure, originalError,
    get current() { return current; }, get aborted() { return aborted; } };
}

describe("current228 uses original postgres context inside the same admin lock session", () => {
  it("reads the exact postgres catalog context and restores admin before the policy update", async () => {
    const f = sameSessionContextFixture();
    await f.transaction(f.context, async (tx: { observe: () => Promise<{ ledgerCount: number }>; closePolicy: () => Promise<string> }) => {
      expect((await tx.observe()).ledgerCount).toBe(228);
      expect(f.current).toEqual(f.admin); await tx.closePolicy();
    });
    expect(f.calls.findIndex(sql => sql.startsWith("SAVEPOINT"))).toBeGreaterThan(f.calls.findIndex(sql => sql.includes("LOCK TABLE")));
    expect(f.calls.some(sql => sql.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
    expect(f.calls.some(sql => sql.startsWith("RELEASE SAVEPOINT"))).toBe(true);
    expect(f.current).toEqual(f.admin); expect(f.context.postgresContext?.searchPath).toBe(f.postgres.searchPath);
    expect(f.session.close).toHaveBeenCalledOnce(); expect(f.session.stop).toHaveBeenCalledOnce();
  });
  it.each(["guard", "sql"] as const)("restores admin and propagates the original %s error with no policy mutation", async failure => {
    const f = sameSessionContextFixture(); f.failure[failure] = true;
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toBe(f.originalError);
    expect(f.current).toEqual(f.admin); expect(f.aborted).toBe(false);
    expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false); expect(f.calls).not.toContain("COMMIT;");
    expect(f.session.stop).toHaveBeenCalledOnce();
  });
  it("stops the session when restoration fails instead of running a policy update or reporting success", async () => {
    const f = sameSessionContextFixture(); f.failure.sql = true; f.failure.restore = true;
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toThrow("owned restore failed");
    expect(f.session.stop).toHaveBeenCalledOnce(); expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false);
    expect(f.calls).not.toContain("COMMIT;"); expect(f.session.close).not.toHaveBeenCalled();
  });
  it.each(["setup", "restoredConfig"] as const)("rejects a %s GUC mismatch with no later policy update", async failure => {
    const f = sameSessionContextFixture(); f.failure[failure] = true;
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toThrow(failure === "setup" ? "observation postgres context" : "original admin context");
    expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false); expect(f.calls).not.toContain("COMMIT;");
    expect(f.session.stop).toHaveBeenCalledOnce();
    if (failure === "setup") expect(f.current).toEqual(f.admin);
  });
  it("rejects the wrong original admin actor before creating a savepoint or reading the catalog", async () => {
    const f = sameSessionContextFixture(); f.current.currentUser = "authenticator";
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toThrow("locked admin context");
    expect(f.adapter.observe).not.toHaveBeenCalled(); expect(f.calls.some(sql => sql.startsWith("SAVEPOINT") || sql.startsWith("UPDATE"))).toBe(false);
    expect(f.session.stop).toHaveBeenCalledOnce();
  });
  it("keeps an initial session failure unapplied and stops the session", async () => {
    const f = sameSessionContextFixture(), error = new Error("owned initial pending role/session failed");
    f.query.mockRejectedValueOnce(error);
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toBe(error);
    expect(f.adapter.observe).not.toHaveBeenCalled(); expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false);
    expect(f.session.close).not.toHaveBeenCalled(); expect(f.session.stop).toHaveBeenCalledOnce();
  });
  it("rejects a missing captured postgres context before touching the locked observation", async () => {
    const f = sameSessionContextFixture(); f.context.postgresContext = undefined;
    await expect(f.transaction(f.context, async (tx: { observe: () => Promise<unknown>; closePolicy: () => Promise<string> }) => {
      await tx.observe(); await tx.closePolicy();
    })).rejects.toThrow("original postgres context");
    expect(f.adapter.observe).not.toHaveBeenCalled(); expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false);
    expect(f.session.stop).toHaveBeenCalledOnce();
  });
  it("keeps the original227 observation without any role/savepoint or extra context SQL", async () => {
    const f = sameSessionContextFixture(); f.context.successor = undefined; f.context.postgresContext = undefined;
    expect((await f.observe(f.context, f.query)).ledgerCount).toBe(227);
    expect(f.adapter.observe).toHaveBeenCalledWith(f.query, expect.any(String));
    expect(f.calls).toEqual(["owned model", "owned stable"]); expect(f.current).toEqual(f.admin);
  });
});

it.each([false,true])("classifies failed activation OFF only with the same229 proof (foreign=%s)", async foreign => {
  const f=await active229();await f.engine.activate();
  f.current.quantityPolicyEnabled=false;await f.engine.pauseForRepair();await f.engine.resume();f.current.quantityPolicyEnabled=true;
  f.adapters.transaction.mockImplementationOnce(async()=>{
    if(foreign)f.current.databaseMaintenance={...f.maintenance,receipt:{...f.maintenance.receipt,sha256:sha("f")}};
    throw new Error("owned failed activation dispatch");
  });
  await expect(f.engine.activate()).rejects.toThrow("owned failed activation dispatch");
  expect(f.journal.state).toBe(foreign?"activation-outcome-unknown":"activation-not-applied");
});


function recipeSaveBinding(prior:MaintenanceBinding) {
  const migrations=[{filename:"20261014225200_recipe_snapshot_reason_identity.sql",sha256:"b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66"},
    {filename:"20261014225300_recipe_future_patch_http_replay.sql",sha256:"aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7"}];
  return {...prior,schema:"homecook.recipe-save-recovery-maintenance.v1",ledgerCount:231,reviewSha256:sha("6"),receipt:{path:"/owned-fixture/recipe-save231.json",sha256:sha("7")},
    predecessorDatabaseReceiptSha256:prior.receipt.sha256,migrationSha256:createHash("sha256").update(JSON.stringify(migrations)).digest("hex"),predecessorMaintenance:prior};
}
async function active231() {
  const f=await active229();await f.engine.activate();const maintenance=recipeSaveBinding(f.maintenance),prior=f.adapters.preflight.getMockImplementation()!;
  f.adapters.preflight.mockImplementation(async(...args)=>{
    const context=await prior(...args);f.current.ledgerCount=231;f.current.databaseMaintenance=maintenance;return {...context,databaseMaintenance:maintenance};
  });return Object.assign(f,{maintenance});
}
describe("exact recipe-save231 worker current proof",()=>{
  it("preserves original48 credential/source and supports explicit same231 pause/repair/readback",async()=>{
    const f=await active231();await f.engine.activate();f.current.quantityPolicyEnabled=false;
    const paused=await f.engine.pauseForRepair();expect(paused.observation).toMatchObject({ledgerCount:231,databaseMaintenance:f.maintenance});
    const resumed=await f.engine.resume();expect(resumed).toMatchObject({ledgerCount:231,databaseMaintenance:f.maintenance});
    expect(f.calls.filter(value=>value==="CAS48")).toHaveLength(1);expect(f.adapters.issueCredentials).toHaveBeenCalledTimes(1);
  });
  it.each(["activation-commit-intent","activation-outcome-unknown"])("does not carry old229 %s into231",async status=>{
    const f=await active231();f.journal.state=status;f.journal.activationReceipt=null;f.journal.activationReconciliation=null;
    const count=f.adapters.transaction.mock.calls.length;
    await expect(f.engine.activate()).rejects.toThrow();expect(f.adapters.transaction).toHaveBeenCalledTimes(count);
  });
  it.each(["migrationSha256","predecessorDatabaseReceiptSha256","ledgerCount"])("rejects foreign231 %s before mutable work",async key=>{
    const f=await active231();const prior=f.adapters.preflight.getMockImplementation()!;
    f.adapters.preflight.mockImplementation(async(...args)=>{const context=await prior(...args);return {...context,databaseMaintenance:{...f.maintenance,[key]:key==="ledgerCount"?230:sha("f")}};});
    const count=f.adapters.transaction.mock.calls.length;await expect(f.engine.activate()).rejects.toThrow();expect(f.adapters.transaction).toHaveBeenCalledTimes(count);
  });
});
