/** Rollback-safe installer for the exact 2026-10-10 YouTube resolution worker. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import { assertCredentialTransition, assertWorkerInstallAuthority, resolutionDatabaseTarget } from "./prelaunch-youtube-resolution-contract.mjs";
import { assertYoutubeResolutionRolloutReview } from "./prelaunch-youtube-resolution-readiness.mjs";
import { getLocalMacProductionReleasePaths } from "./local-mac-production-release.mjs";
import { createRecordingDockerAdapter } from "./marketing-round2-controlled-deploy.mjs";
import {
  buildYoutubeExtractionWorkerInstallPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  loadYoutubeExtractionWorkerRuntimeInputs,
  parseLaunchctlPrintStatus,
  validateYoutubeExtractionWorkerSecretFile,
} from "./youtube-extraction-worker-ops.mjs";
import { createRestrictedPostgrestRpcClient, readWorkerEnvironment } from "./youtube-extraction-worker-runtime.mjs";
import { buildYoutubeExtractionWorkerPolicySnapshotDigest } from "./youtube-extraction-worker-artifact.mjs";

export const YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION = "LOCAL_PRELAUNCH_YOUTUBE_RESOLUTION_WORKER_INSTALL";
export const YOUTUBE_RESOLUTION_WORKER_INSTALL_PIN = Object.freeze({
  path: "/Users/cwj/.homecook/operations/youtube-resolution-20261010/worker-install.json",
  sha256: "bc8ef1cbd763cdaae5f958ae24d8e1de44ff558b6ce5ca85aa7b498bc3f30008",
});
export const YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH = "/Users/cwj/.homecook/youtube-extraction-releases/c51d53871f31-youtube-resolution-20261010/artifact.json";
export const YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH = "/Users/cwj/.homecook/youtube-extraction/app-descriptor-c51d53871f31-youtube-resolution.json";
export const YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256 = "1657cc467d239f5c59755cd6e68c3b59432e80d8984e9275d3e63fb217de6346";
export const YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256 = "6207b867a50a6ffabd705a11a9028df8c4ef4b9682b32dade0ad22a983a3d650";
export const YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY = "d5e2647ce033319677dbb844d026bada538b8def4d1f55dbd796e98a379cb86f";
export const YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256 = "d728e154663c05677eba4b5b4cfc578036707e8c70d1bee823dbca1ef4ee3fad";
const SHA = /^[a-f0-9]{64}$/u;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (value, message) => { if (!value) throw new Error(`Reviewed YouTube resolution worker install: ${message}`); };
const QUEUE_SQL = "SELECT jsonb_build_object('queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) FROM public.youtube_extraction_jobs;";
const PERMIT_SQL = "SELECT coalesce(jsonb_build_object('ownerId',owner_id,'expiresAt',expires_at),'null'::jsonb) FROM public.youtube_extractor_permits WHERE permit_key='primary';";
const CREDENTIAL_SQL = "SELECT jsonb_build_object('generation',current_generation,'jtiSha256',current_jti_hash,'expiresAt',expires_at,'releaseSha',release_sha,'schemaIdentity',schema_identity,'snapshotDigest',allowed_snapshot_digest) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';";
const POLICY_SQL = "SELECT jsonb_build_object('enabled',enabled,'policyVersion',policy_version,'extractorMode',extractor_mode,'pipelineIdentity',pipeline_identity,'resultAffectingOptions',result_affecting_options) FROM private.youtube_extraction_current_policy WHERE policy_key='primary';";
// The adapter supplies the read-only transaction; do not end it here.
const CATALOG_SQL = `SET LOCAL request.jwt.claims='{"role":"youtube_extraction_worker"}'; SELECT to_jsonb(public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint');`;

export function assertYoutubeResolutionWorkerInstallPin(pin) {
  check(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "install pin is not approved");
}

export function decodeYoutubeResolutionWorkerJwt(token) {
  check(typeof token === "string" && token.split(".").length === 3, "worker token is not a JWT");
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Reviewed YouTube resolution worker install: worker JWT claims are malformed");
  }
}

export function assertYoutubeResolutionWorkerJwtClaims(claims, expected) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  check(claims.role === "youtube_extraction_worker", "worker JWT role changed");
  check(claims.scope === "youtube-extraction-worker", "worker JWT scope changed");
  check(audience.includes(expected.audience) && claims.iss === expected.issuer, "worker JWT issuer/audience changed");
  check(claims.release_sha === expected.releaseSha
    && claims.schema_identity === expected.schemaIdentity
    && claims.allowed_snapshot_digest === expected.snapshotDigest
    && claims.generation === expected.generation,
  "worker JWT release binding changed");
  check(claims.jti_hash === expected.jtiSha256,
    "worker JWT jti binding changed");
  check(Number.isInteger(claims.iat) && claims.iat <= Math.floor(Date.now() / 1000) + 5
    && Number.isInteger(claims.exp) && claims.exp > claims.iat
    && new Date(claims.exp * 1000).toISOString() === expected.expiresAt,
    "worker JWT expiry changed");
  return true;
}

export function assertYoutubeResolutionWorkerInstallManifest(manifest) {
  check(manifest?.schema === "homecook.prelaunch-youtube-resolution-worker-install.v1", "manifest schema mismatch");
  assertYoutubeResolutionRolloutReview(manifest.review);
  check(manifest.review.contract.to === "c51d53871f31c7840fe24792b46b191ca963b11b", "release SHA mismatch");
  const paths = manifest.paths ?? {};
  check(paths.artifact === YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH
    && paths.descriptor === YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH
    && ["config", "databaseConfig", "credential", "currentPolicy", "queueState", "secretRoot", "rootDir", "expectedSchema",
      "journalDirectory"].every((name) => isAbsolute(paths[name] ?? "")), "reviewed install paths mismatch");
  check(manifest.review.contract.artifact.identitySha256 === YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY
    && manifest.review.contract.artifact.fileSha256 === YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256
    && manifest.review.contract.artifact.descriptorFileSha256 === YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256
    && manifest.review.contract.artifact.expectedSchemaSha256 === YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256,
  "reviewed artifact pins mismatch");
  check(manifest.authority && manifest.previous && manifest.credentialBefore && manifest.credentialAfter,
    "install authority, credential transition, or predecessor is missing");
  assertWorkerInstallAuthority(manifest.review.contract, manifest.authority);
  const reviewedAt = Date.parse(manifest.reviewedAt);
  check(Number.isFinite(reviewedAt), "review timestamp missing");
  assertCredentialTransition(manifest.review.contract, manifest.credentialBefore, manifest.credentialAfter, reviewedAt);
  check(manifest.previous.path === manifest.authority.previousPlistPath
    && manifest.previous.sha256 === manifest.authority.previousPlistSha256
    && manifest.previous.loaded === manifest.authority.previousLoaded
    && manifest.previous.state === manifest.authority.previousState,
  "previous plist authority mismatch");
  return manifest;
}

export async function verifyYoutubeResolutionWorkerCaller({ environment, token, secretRoot, fetchImpl = fetch }) {
  const endpoint = new URL(environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL);
  check(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname)
    && endpoint.pathname.endsWith("/rest/v1") && endpoint.username === "" && endpoint.password === ""
    && endpoint.search === "" && endpoint.hash === "", "worker Data API is not exact loopback REST v1");
  const keyPath = validateYoutubeExtractionWorkerSecretFile(
    environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE, { secretRoot },
  );
  const gatewayApiKey = readFileSync(keyPath, "utf8").trim();
  check(gatewayApiKey.length > 0, "gateway API key is empty");
  const client = createRestrictedPostgrestRpcClient({ dataApiUrl: endpoint.toString(), apiKey: gatewayApiKey,
    token, fetchImpl });
  const authenticated = await client.rpc("check_youtube_extraction_worker_pre_request");
  check(authenticated.error === null, "authenticated worker pre-request verification failed");
  const empty = await fetchImpl(new URL(`${endpoint.pathname}/rpc/check_youtube_extraction_worker_pre_request`, endpoint), {
    method: "POST", headers: { apikey: gatewayApiKey, "content-type": "application/json" }, body: "{}",
  });
  const emptyBody = empty.status === 500 ? await empty.json().catch(() => null) : null;
  // The existing full-local session guard returns SQLSTATE 55000 for a missing
  // session. Accept only that exact denial, never a generic server error.
  const emptyClaimDenied = [401, 403].includes(empty.status)
    || (empty.status === 500 && emptyBody?.code === "55000"
      && emptyBody?.message === "ACCOUNT_SESSION_STALE");
  check(emptyClaimDenied, "empty-claim worker pre-request was not denied");
  return { authenticatedStatus: 200, emptyClaimStatus: empty.status, emptyClaimDenied };
}

/**
 * @param {(options: {configPath: string, backupDirectory: string}) => Promise<{
 *   inspect(): Promise<{database: {systemIdentifier: string, major: number}}>,
 *   query(sql: string): Promise<string>
 * }>} [createAdapter]
 */
export async function observeLiveInstallAuthority(manifest, inputs, previousStatus,
  createAdapter = createRecordingDockerAdapter) {
  const adapter = await createAdapter({ configPath: manifest.paths.databaseConfig,
    backupDirectory: manifest.paths.journalDirectory });
  // inspect selects the exact container used by query, as well as validating it.
  const target = await adapter.inspect();
  check(target.database?.systemIdentifier === "7669475895419854882"
    && target.database?.major === 17
    && isDeepStrictEqual(resolutionDatabaseTarget(target),
      resolutionDatabaseTarget(manifest.review.databaseBefore.target)),
  "live database target differs from the reviewed predecessor");
  const [queue, permit, credential, catalogFingerprint, policy] = await Promise.all([
    adapter.query(QUEUE_SQL), adapter.query(PERMIT_SQL), adapter.query(CREDENTIAL_SQL), adapter.query(CATALOG_SQL),
    adapter.query(POLICY_SQL),
  ]).then((rows) => rows.map((row) => JSON.parse(row)));
  check(policy.enabled === true, "live worker policy is not enabled");
  check(credential.generation === inputs.credentialState.generation
    && credential.jtiSha256 === inputs.credentialState.jti_sha256
    && Number.isFinite(Date.parse(credential.expiresAt))
    && Date.parse(credential.expiresAt) === Date.parse(inputs.credentialState.expires_at)
    && credential.releaseSha === inputs.credentialState.release_sha
    && credential.schemaIdentity === inputs.credentialState.schema_identity
    && credential.snapshotDigest === inputs.credentialState.allowed_snapshot_digest,
  "live DB credential differs from trusted runtime input");
  return {
    ...manifest.authority,
    catalogFingerprint,
    policyVersion: policy.policyVersion,
    pipelineIdentity: policy.pipelineIdentity,
    snapshotDigest: buildYoutubeExtractionWorkerPolicySnapshotDigest({
      extractorMode: policy.extractorMode,
      pipelineIdentity: policy.pipelineIdentity,
      policyVersion: policy.policyVersion,
      resultAffectingOptions: policy.resultAffectingOptions,
    }),
    credentialGeneration: credential.generation,
    queue,
    permitHeld: Boolean(permit?.ownerId && Date.parse(permit.expiresAt) > Date.now()),
    previousLoaded: previousStatus.loaded,
    previousState: previousStatus.state,
  };
}

function parsePlist(bytes) {
  return JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], {
    input: bytes, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }));
}

export function assertYoutubeResolutionLauncherPreserved(previous, next) {
  const envArgs = (plist) => plist.ProgramArguments.slice(2).filter((value) => /^[A-Z_][A-Z0-9_]*=/u.test(value));
  const previousEnv = envArgs(previous); const nextEnv = envArgs(next);
  check(isDeepStrictEqual(nextEnv, previousEnv), "launcher environment changed");
  const path = nextEnv.find((value) => value.startsWith("PATH="))?.slice(5);
  check(typeof path === "string" && path.split(":").indexOf("/usr/bin") >= 0
    && path.split(":").indexOf("/opt/homebrew/bin") >= 0
    && path.split(":").indexOf("/usr/bin") < path.split(":").indexOf("/opt/homebrew/bin"),
  "system Python precedence changed");
  check(nextEnv.some((value) => value.startsWith("TMPDIR=/private/")),
  "canonical TMPDIR changed");
  const node = (plist) => plist.ProgramArguments.find((value, index) => index >= 2
    && value.startsWith("/") && !value.includes("="));
  check(node(next) === node(previous) && node(next)?.includes("/.nvm/"), "absolute NVM Node changed");
  return true;
}

function preserveLauncherEnvironment(previous, plistPreview) {
  const previousEnv = previous.ProgramArguments.slice(2).filter((value) => /^[A-Z_][A-Z0-9_]*=/u.test(value));
  let preview = plistPreview;
  const next = parsePlist(Buffer.from(preview));
  const nextEnv = next.ProgramArguments.slice(2).filter((value) => /^[A-Z_][A-Z0-9_]*=/u.test(value));
  const node = next.ProgramArguments.find((entry, index) => index >= 2 && entry.startsWith("/") && !entry.includes("="));
  check(node, "generated launcher Node argument missing");
  const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  // Replace generated bindings as a group. Appending a differing PATH would
  // create duplicate bindings and reorder the reviewed TMPDIR/PATH values.
  for (const value of nextEnv) preview = preview.replace(`<string>${escape(value)}</string>`, "");
  preview = preview.replace(`<string>${escape(node)}</string>`,
    [...previousEnv, node].map((value) => `<string>${escape(value)}</string>`).join("\n    "));
  return preview;
}

export async function prepareYoutubeResolutionWorkerInstall(manifest, adapters = {}) {
  assertYoutubeResolutionWorkerInstallManifest(manifest);
  const readBytes = adapters.readBytes ?? ((path) => readFileSync(path));
  const artifactBytes = readBytes(manifest.paths.artifact);
  const descriptorBytes = readBytes(manifest.paths.descriptor);
  const expectedSchemaBytes = readBytes(manifest.paths.expectedSchema);
  check(hash(artifactBytes) === YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256
    && hash(descriptorBytes) === YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256
    && hash(expectedSchemaBytes) === YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256,
  "artifact, descriptor, or schema bytes changed");
  const loadInputs = adapters.loadInputs ?? loadYoutubeExtractionWorkerRuntimeInputs;
  const inputs = loadInputs({
    appDescriptorPath: manifest.paths.descriptor,
    workerArtifactPath: manifest.paths.artifact,
    currentPolicyPath: manifest.paths.currentPolicy,
    credentialPath: manifest.paths.credential,
    expectedSchemaPath: manifest.paths.expectedSchema,
    queueStatePath: manifest.paths.queueState,
    secretRoot: manifest.paths.secretRoot,
  });
  const preflight = (adapters.evaluatePreflight ?? evaluateYoutubeExtractionWorkerPreflight)(inputs);
  check(preflight.ready === true && preflight.release_sha === manifest.review.contract.to,
    "trusted worker preflight failed");
  const environment = await (adapters.readEnvironment ?? readWorkerEnvironment)(manifest.paths.config);
  const token = readBytes(inputs.credentialState.token_file).toString("utf8").trim();
  const claims = decodeYoutubeResolutionWorkerJwt(token);
  assertYoutubeResolutionWorkerJwtClaims(claims, {
    // These are fixed by the existing ES256 issuer, not worker dotenv keys.
    audience: "youtube-extraction",
    issuer: "https://worker.mumeok.kr",
    releaseSha: manifest.review.contract.to,
    schemaIdentity: manifest.review.contract.credential.schemaIdentity,
    snapshotDigest: manifest.review.contract.policy.snapshotDigest,
    generation: manifest.review.contract.credential.afterGeneration,
    jtiSha256: inputs.credentialState.jti_sha256,
    expiresAt: inputs.credentialState.expires_at,
  });
  await (adapters.verifyCaller ?? verifyYoutubeResolutionWorkerCaller)({
    environment, token, secretRoot: manifest.paths.secretRoot, fetchImpl: adapters.fetch,
  });
  check(inputs.credentialState.generation === manifest.authority.credentialGeneration
    && inputs.credentialState.release_sha === manifest.authority.releaseSha,
  "credential metadata differs from DB/review authority");
  const buildPlan = adapters.buildPlan ?? buildYoutubeExtractionWorkerInstallPlan;
  let plan = buildPlan({ configPath: manifest.paths.config, manifestPath: manifest.paths.artifact,
    credentialPath: manifest.paths.credential, appDescriptorPath: manifest.paths.descriptor,
    currentPolicyPath: manifest.paths.currentPolicy, expectedSchemaPath: manifest.paths.expectedSchema,
    secretRoot: manifest.paths.secretRoot, homeDir: adapters.homeDir ?? homedir(), rootDir: manifest.paths.rootDir,
    userId: adapters.userId ?? process.getuid(), dryRun: true, i031Preflight: manifest.i031Preflight });
  const previousBytes = readBytes(manifest.previous.path);
  check(hash(previousBytes) === manifest.previous.sha256, "previous plist bytes changed");
  check(plan.plist_path === manifest.previous.path, "install plan targets a different plist");
  const parse = adapters.parsePlist ?? parsePlist;
  plan = { ...plan, plist_preview: preserveLauncherEnvironment(parse(previousBytes), plan.plist_preview) };
  assertYoutubeResolutionLauncherPreserved(parse(previousBytes), parse(Buffer.from(plan.plist_preview)));
  const previousStatus = await (adapters.readStatus ?? (() => {
    const result = spawnSync("/bin/launchctl", ["print", plan.service_target], { encoding: "utf8" });
    const parsed = parseLaunchctlPrintStatus({ serviceTarget: plan.service_target,
      status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
    check(!result.error && (parsed.loaded || (parsed.state === "unloaded"
      && (result.status === 113 || /could not find service/iu.test(result.stderr ?? "")))),
    "previous launchd observation failed ambiguously");
    return parsed;
  }))();
  check(previousStatus.loaded === manifest.previous.loaded && previousStatus.state === manifest.previous.state,
    "previous launchd state changed");
  const observed = await (adapters.verifyAuthority
    ?? (() => observeLiveInstallAuthority(manifest, inputs, previousStatus)))();
  assertWorkerInstallAuthority(manifest.review.contract, observed);
  check(isDeepStrictEqual(observed, manifest.authority), "live install authority changed");
  return { manifest, plan, previousBytes, previousStatus, inputs, preflight };
}

export async function awaitYoutubeResolutionWorkerRunning({ readStatus, wait = (ms) => delay(ms), attempts = 64 }) {
  let latest; let consecutive = 0; let observations = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await readStatus();
    if (latest.loaded && latest.state === "running" && Number.isInteger(latest.pid) && latest.pid > 0) {
      consecutive += 1; observations = [...observations, latest].slice(-2);
    } else { consecutive = 0; observations = []; }
    if (consecutive === 2) return { ...latest, observations };
    if (!latest.loaded || latest.state === "exited") throw new Error(`worker failed during startup: ${latest.state}`);
    await wait(250);
  }
  throw new Error(`worker did not become stable: ${latest?.state ?? "unknown"}`);
}

function launchctl(args) {
  return execFileSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function assertYoutubeResolutionWorkerRestored(prepared, restoredHash, restoredStatus) {
  check(restoredHash === prepared.manifest.previous.sha256, "restored predecessor plist hash mismatch");
  check(restoredStatus.loaded === prepared.previousStatus.loaded, "restored predecessor loaded state mismatch");
  check(restoredStatus.state === prepared.previousStatus.state, "restored predecessor state mismatch");
  return true;
}

export async function executeYoutubeResolutionWorkerInstall(prepared, confirmation, adapters = {}) {
  check(confirmation === YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION, "exact install confirmation required");
  const canonical = getLocalMacProductionReleasePaths(adapters.homeDir ?? homedir());
  mkdirSync(dirname(canonical.lockPath), { recursive: true, mode: 0o700 });
  const lockPath = canonical.lockPath;
  const lockFd = openSync(lockPath, "wx", 0o600); closeSync(lockFd);
  const run = adapters.launchctl ?? launchctl;
  const reprepare = adapters.prepare ?? prepareYoutubeResolutionWorkerInstall;
  const journalPath = join(prepared.manifest.paths.journalDirectory, `install-${Date.now()}-${randomUUID()}.json`);
  let mutationStarted = false;
  try {
    const again = await reprepare(prepared.manifest);
    check(again.plan.plist_preview === prepared.plan.plist_preview, "install plan changed before mutation");
    mkdirSync(prepared.manifest.paths.journalDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(`${journalPath}.previous.plist`, prepared.previousBytes, { flag: "wx", mode: 0o600 });
    mutationStarted = true;
    try { run(["bootout", prepared.plan.service_target]); } catch { if (prepared.previousStatus.loaded) throw new Error("failed to stop predecessor worker"); }
    const staging = `${prepared.plan.plist_path}.resolution-${randomUUID()}`;
    writeFileSync(staging, prepared.plan.plist_preview, { flag: "wx", mode: 0o600 }); chmodSync(staging, 0o600);
    renameSync(staging, prepared.plan.plist_path);
    run(["bootstrap", `gui/${adapters.userId ?? process.getuid()}`, prepared.plan.plist_path]);
    run(["kickstart", "-k", prepared.plan.service_target]);
    const status = await awaitYoutubeResolutionWorkerRunning({ wait: adapters.wait, readStatus: async () =>
      parseLaunchctlPrintStatus({ serviceTarget: prepared.plan.service_target, status: 0,
        stdout: run(["print", prepared.plan.service_target]) }) });
    const environment = await (adapters.readEnvironment ?? readWorkerEnvironment)(prepared.manifest.paths.config);
    const token = readFileSync(prepared.inputs.credentialState.token_file, "utf8").trim();
    const postflight = await (adapters.verifyCaller ?? verifyYoutubeResolutionWorkerCaller)({
      environment, token, secretRoot: prepared.manifest.paths.secretRoot, fetchImpl: adapters.fetch,
    });
    const freshAuthority = await (adapters.verifyAuthority
      ?? (() => observeLiveInstallAuthority(prepared.manifest, prepared.inputs, prepared.previousStatus)))();
    assertWorkerInstallAuthority(prepared.manifest.review.contract, freshAuthority);
    const result = { schema: "homecook.prelaunch-youtube-resolution-worker-install-result.v1",
      status: "installed-verified", releaseSha: prepared.manifest.review.contract.to,
      artifactIdentitySha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY,
      artifactFileSha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256,
      descriptorFileSha256: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256,
      expectedSchemaSha256: YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256,
      credentialGeneration: freshAuthority.credentialGeneration,
      policyVersion: freshAuthority.policyVersion,
      pipelineIdentity: freshAuthority.pipelineIdentity,
      snapshotDigest: freshAuthority.snapshotDigest,
      plistSha256: hash(readFileSync(prepared.plan.plist_path)),
      runningObservations: status.observations,
      authenticatedPreRequest: postflight.authenticatedStatus >= 200 && postflight.authenticatedStatus < 300,
      emptyClaimSucceeded: postflight.emptyClaimDenied === true
        || [401, 403].includes(postflight.emptyClaimStatus),
      queue: freshAuthority.queue,
      permitFree: freshAuthority.permitHeld === false,
      installedAt: new Date().toISOString(),
      changed: true };
    writeFileSync(journalPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return result;
  } catch (error) {
    if (!mutationStarted) throw error;
    let restoreError = null;
    try {
      try { run(["bootout", prepared.plan.service_target]); } catch { /* best effort before exact restore */ }
      const restore = `${prepared.plan.plist_path}.restore-${randomUUID()}`;
      writeFileSync(restore, prepared.previousBytes, { flag: "wx", mode: 0o600 }); chmodSync(restore, 0o600);
      renameSync(restore, prepared.plan.plist_path);
      if (prepared.previousStatus.loaded) {
        run(["bootstrap", `gui/${adapters.userId ?? process.getuid()}`, prepared.plan.plist_path]);
        if (prepared.previousStatus.state === "running") run(["kickstart", "-k", prepared.plan.service_target]);
      }
      const raw = (() => { try { return run(["print", prepared.plan.service_target]); } catch { return ""; } })();
      const restored = raw ? parseLaunchctlPrintStatus({ serviceTarget: prepared.plan.service_target, status: 0, stdout: raw })
        : { loaded: false, state: "unloaded" };
      assertYoutubeResolutionWorkerRestored(prepared, hash(readFileSync(prepared.plan.plist_path)), restored);
    } catch (failure) { restoreError = failure instanceof Error ? failure.message : "restore failed"; }
    const result = { schema: "homecook.prelaunch-youtube-resolution-worker-install-result.v1",
      status: restoreError ? "failed-requires-manual-recovery" : "failed-restored-plist",
      originalError: error instanceof Error ? error.message : "install failed", restoreError };
    try { writeFileSync(journalPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); } catch { /* preserve original */ }
    if (restoreError) throw new Error(`${result.originalError}; restore=${restoreError}`);
    throw error;
  } finally {
    rmSync(lockPath, { force: true });
  }
}

export async function loadYoutubeResolutionWorkerInstallManifest() {
  assertYoutubeResolutionWorkerInstallPin(YOUTUBE_RESOLUTION_WORKER_INSTALL_PIN);
  const bytes = readFileSync(YOUTUBE_RESOLUTION_WORKER_INSTALL_PIN.path);
  check(hash(bytes) === YOUTUBE_RESOLUTION_WORKER_INSTALL_PIN.sha256, "install manifest bytes changed");
  return assertYoutubeResolutionWorkerInstallManifest(JSON.parse(bytes));
}
