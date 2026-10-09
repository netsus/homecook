import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertYoutubeResolutionWorkerInstallPin,
  assertYoutubeResolutionWorkerJwtClaims,
  assertYoutubeResolutionLauncherPreserved,
  assertYoutubeResolutionWorkerInstallManifest,
  assertYoutubeResolutionWorkerRestored,
  awaitYoutubeResolutionWorkerRunning,
  decodeYoutubeResolutionWorkerJwt,
  executeYoutubeResolutionWorkerInstall,
  observeLiveInstallAuthority,
  prepareYoutubeResolutionWorkerInstall,
  verifyYoutubeResolutionWorkerCaller,
  YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256,
  YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY,
  YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH,
  YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH,
  YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256,
  YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION,
} from "../scripts/lib/prelaunch-youtube-resolution-worker-install.mjs";
import {
  assembleYoutubeResolutionCredentialExecutionAuthority,
  assembleYoutubeResolutionRolloutReview,
  assembleYoutubeResolutionWebActivation,
  assembleYoutubeResolutionWorkerInstallManifest,
} from "../scripts/lib/prelaunch-youtube-resolution-manifest-assembly.mjs";
import {
  LIVE_CATALOG_FINGERPRINT, LIVE_PIPELINE_IDENTITY, LIVE_POLICY_SNAPSHOT_DIGEST, LIVE_WEB_SHA,
  LIVE_WORKER_SHA, MIGRATIONS, SCHEMA_IDENTITY, SOURCE_BACKFILL, TARGET_CATALOG_FINGERPRINT,
  YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES,
} from "../scripts/lib/prelaunch-youtube-resolution-contract.mjs";

const credentialWriterPath = "/Users/cwj/.codex/worktrees/youtube-display-release/homecook/.omx/cost-efficient-p5-20261010/credential-preparation/execute-approved-credential-rotation.mjs";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const jwt = (claims: object) => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify(claims)).toString("base64url"),
  "signature",
].join(".");

function prepareFixture(root: string) {
  const artifact = JSON.parse(readFileSync(YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH, "utf8"));
  const prefix = "lib/server/youtube-i031-runtime/bundle/";
  const runtimeFiles = Object.fromEntries(artifact.files.filter((row: { path: string }) =>
    row.path.startsWith(prefix) && row.path !== `${prefix}manifest.json`).map((row: { path: string; sha256: string }) =>
    [row.path.slice(prefix.length), row.sha256]));
  const previousPath = join(root, "previous.plist");
  const previousBytes = readFileSync("/Users/cwj/Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist");
  writeFileSync(previousPath, previousBytes, { mode: 0o600 });
  const proof = (name: string) => ({ path: `/private/${name}.json`, sha256: sha(name) });
  const contract = { schema: "homecook.prelaunch-youtube-resolution-review.v1", from: LIVE_WEB_SHA,
    to: "c51d53871f31c7840fe24792b46b191ca963b11b", integrationSourceRef: "b".repeat(40),
    previousMigrationCount: 213, migrationCount: 215,
    migrations: MIGRATIONS.map((filename) => ({ filename, sha256: sha(filename) })),
    sourceBackfill: { filename: SOURCE_BACKFILL, sha256: sha(SOURCE_BACKFILL) },
    files: { "lib/ingredient-search.ts": [sha("old"), sha("new")] }, protectedSources: ["lib/ingredient-search.ts"],
    runtimeFiles, artifact: { identitySha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY,
      fileSha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256,
      descriptorFileSha256: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256,
      expectedSchemaSha256: YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256 },
    previousWorker: { releaseSha: LIVE_WORKER_SHA, plistPath: previousPath, plistSha256: sha(previousBytes.toString()),
      beforeClosureLoaded: true, beforeClosureState: "running", atInstallLoaded: false, atInstallState: "unloaded" },
    catalog: { before: LIVE_CATALOG_FINGERPRINT, after: TARGET_CATALOG_FINGERPRINT },
    policy: { version: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST },
    credential: { beforeGeneration: 45, afterGeneration: 46, schemaIdentity: SCHEMA_IDENTITY, maxTtlSeconds: 604800 },
    proofs: { platformBackup: proof("platformBackup"), isolatedRestore: proof("isolatedRestore"), dbBefore: proof("dbBefore"),
      enqueueClosure: proof("enqueueClosure"), dbApplyReceipt: proof("dbApplyReceipt"),
      workerArtifact: { path: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH, sha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256 },
      appDescriptor: { path: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH, sha256: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256 } } };
  const authority = { releaseSha: contract.to, runtimeFiles, catalogFingerprint: TARGET_CATALOG_FINGERPRINT,
    policyVersion: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST,
    credentialGeneration: 46, queue: { queued: 0, processing: 0 }, permitHeld: false,
    dbReceiptSha256: contract.proofs.dbApplyReceipt.sha256, artifactIdentitySha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY,
    artifactFileSha256: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256,
    descriptorFileSha256: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256,
    expectedSchemaSha256: YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256, previousPlistPath: previousPath,
    previousPlistSha256: sha(previousBytes.toString()), previousLoaded: false, previousState: "unloaded",
    enqueueClosureSha256: contract.proofs.enqueueClosure.sha256, workerStopped: true };
  const expectedSchema = "/Users/cwj/.homecook/youtube-extraction-releases/c51d53871f31-youtube-resolution-20261010/scripts/manifests/youtube-extraction-expected-schema.json";
  const reviewedAt = "2026-10-10T00:00:00.000Z";
  const manifest = { schema: "homecook.prelaunch-youtube-resolution-worker-install.v1", reviewedAt,
    review: { schema: "homecook.prelaunch-youtube-resolution-rollout-review.v1", contract,
      originalReadinessSha256: sha("readiness"), proofDigests: Object.fromEntries([
        "db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook",
        "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding",
      ].map((name) => [name, sha(name)])),
      artifactPaths: { manifest: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH, descriptor: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH,
        expectedSchema }, databaseBefore: { target: { systemIdentifier: "7669475895419854882" }, ledgerCount: 213,
        catalogFingerprint: LIVE_CATALOG_FINGERPRINT, aiAutomaticEnabled: false,
        credential: { generation: 45, releaseSha: LIVE_WORKER_SHA, schemaIdentity: SCHEMA_IDENTITY,
          allowedSnapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST, expiresAt: "2026-10-14T17:14:32.000Z" } },
      expectedFunctionEvidence: YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES.map((signature) => ({
        signature, definitionSha256: sha(signature),
      })) },
    paths: { artifact: YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH, descriptor: YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH,
      expectedSchema, config: "/private/config", databaseConfig: "/private/database", credential: "/private/credential",
      currentPolicy: "/private/policy", queueState: "/private/queue", secretRoot: "/private/secrets",
      rootDir: "/private/runtime", journalDirectory: "/private/journal" }, authority,
    previous: { path: previousPath, sha256: sha(previousBytes.toString()), loaded: false, state: "unloaded" },
    credentialBefore: contract.previousWorker && { generation: 45, releaseSha: LIVE_WORKER_SHA, schemaIdentity: SCHEMA_IDENTITY,
      allowedSnapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST, expiresAt: "2026-10-14T17:14:32.000Z", role: "youtube_extraction_worker" },
    credentialAfter: { generation: 46, releaseSha: contract.to, schemaIdentity: SCHEMA_IDENTITY,
      allowedSnapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST, expiresAt: "2026-10-14T17:14:32.000Z", role: "youtube_extraction_worker" },
    i031Preflight: { ready: true, codexCliVersion: "0.154.0-alpha.6.2", chatGptLogin: true, toolsReady: true } };
  return { manifest, authority, previousBytes };
}

describe("YouTube resolution worker installer", () => {
  it("consumes the credential writer receipt in the actual manifest assembler", async () => {
    const root = mkdtempSync(join(tmpdir(), "resolution-worker-writer-reader-"));
    try {
      const fixture = prepareFixture(root);
      const precutover = {
        ...fixture.manifest.review.contract,
        schema: "homecook.prelaunch-youtube-resolution-precutover-authority.v1",
        proofs: Object.fromEntries(Object.entries(fixture.manifest.review.contract.proofs)
          .filter(([name]) => name !== "dbApplyReceipt")),
      };
      const rollout = assembleYoutubeResolutionRolloutReview({
        precutoverAuthority: precutover,
        dbApplyReceiptProof: fixture.manifest.review.contract.proofs.dbApplyReceipt,
        originalReadinessSha256: fixture.manifest.review.originalReadinessSha256,
        proofDigests: fixture.manifest.review.proofDigests,
        artifactPaths: fixture.manifest.review.artifactPaths,
        databaseBefore: fixture.manifest.review.databaseBefore,
        expectedFunctionEvidence: fixture.manifest.review.expectedFunctionEvidence,
      });
      const { buildCredentialTransitionReceipt } = await import(pathToFileURL(credentialWriterPath).href);
      const transition = buildCredentialTransitionReceipt({
        registeredAt: fixture.manifest.reviewedAt,
        before: fixture.manifest.credentialBefore,
        after: fixture.manifest.credentialAfter,
        tokenSha256: sha("token"), metadataSha256: sha("metadata"), configSha256: sha("config"),
      });
      expect(assembleYoutubeResolutionCredentialExecutionAuthority({
        releaseSha: fixture.manifest.review.contract.to,
        rootApprovalProof: { path: "/private/root.json", sha256: sha("root") },
        enqueueClosureProof: fixture.manifest.review.contract.proofs.enqueueClosure,
        dbApplyReceiptProof: fixture.manifest.review.contract.proofs.dbApplyReceipt,
        approvedAt: fixture.manifest.reviewedAt,
      })).toMatchObject({
        schema: "homecook.youtube-resolution-credential-execution-authority.v1",
        approved: true,
        releaseSha: fixture.manifest.review.contract.to,
      });
      const assembled = assembleYoutubeResolutionWorkerInstallManifest({
        review: rollout,
        rootApproval: {
          approved: true,
          releaseSha: fixture.manifest.review.contract.to,
          workerPaths: Object.fromEntries(Object.entries(fixture.manifest.paths)
            .filter(([key]) => !["artifact", "descriptor", "expectedSchema"].includes(key))),
          i031Preflight: fixture.manifest.i031Preflight,
        },
        credentialTransition: transition,
        dbApplyReceiptProof: fixture.manifest.review.contract.proofs.dbApplyReceipt,
        enqueueClosureProof: fixture.manifest.review.contract.proofs.enqueueClosure,
      });
      expect(assembled.credentialAfter).toEqual(fixture.manifest.credentialAfter);
      expect(() => assertYoutubeResolutionWorkerInstallManifest(assembled)).not.toThrow();
      const installResult = {
        schema: "homecook.prelaunch-youtube-resolution-worker-install-result.v1",
        status: "installed-verified",
        releaseSha: rollout.contract.to,
        artifactIdentitySha256: rollout.contract.artifact.identitySha256,
        artifactFileSha256: rollout.contract.artifact.fileSha256,
        descriptorFileSha256: rollout.contract.artifact.descriptorFileSha256,
        expectedSchemaSha256: rollout.contract.artifact.expectedSchemaSha256,
        credentialGeneration: 46,
        policyVersion: rollout.contract.policy.version,
        pipelineIdentity: rollout.contract.policy.pipelineIdentity,
        snapshotDigest: rollout.contract.policy.snapshotDigest,
        plistSha256: sha("installed-plist"),
        runningObservations: [
          { loaded: true, state: "running", pid: 42 },
          { loaded: true, state: "running", pid: 42 },
        ],
        authenticatedPreRequest: true,
        emptyClaimSucceeded: true,
        queue: { queued: 0, processing: 0 },
        permitFree: true,
        installedAt: "2026-10-10T00:00:01.000Z",
        changed: true,
      };
      expect(assembleYoutubeResolutionWebActivation({
        rolloutReviewProof: { path: "/private/rollout.json", sha256: sha("rollout") },
        rolloutReview: rollout,
        workerInstallResultProof: { path: "/private/install.json", sha256: sha("install") },
        workerInstallResult: installResult,
      })).toEqual({
        schema: "homecook.prelaunch-youtube-resolution-web-activation.v1",
        rolloutReview: { path: "/private/rollout.json", sha256: sha("rollout") },
        workerInstallResult: { path: "/private/install.json", sha256: sha("install") },
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("inspects the real adapter target before querying and compares expiry instants", async () => {
    const target = { database: { systemIdentifier: "7669475895419854882", major: 17 } };
    const state = { generation: 46, jti_sha256: sha("jti"),
      expires_at: "2026-10-14T17:14:32.000Z", release_sha: "candidate",
      schema_identity: SCHEMA_IDENTITY, allowed_snapshot_digest: LIVE_POLICY_SNAPSHOT_DIGEST };
    const manifest = { paths: { databaseConfig: "/unused", journalDirectory: "/unused" },
      review: { databaseBefore: { target } }, authority: {} };
    const calls: string[] = [];
    const createAdapter = async () => ({
      inspect: async () => { calls.push("inspect"); return target; },
      query: async (sql: string) => {
        expect(calls[0]).toBe("inspect");
        expect(sql).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
        calls.push("query");
        if (sql.includes("worker_credentials")) return JSON.stringify({ generation: state.generation,
          jtiSha256: state.jti_sha256, expiresAt: "2026-10-14T17:14:32+00:00",
          releaseSha: state.release_sha, schemaIdentity: state.schema_identity,
          snapshotDigest: state.allowed_snapshot_digest });
        if (sql.includes("current_policy")) return JSON.stringify({ enabled: true, policyVersion: 3,
          extractorMode: "source-anchored", pipelineIdentity: LIVE_PIPELINE_IDENTITY,
          resultAffectingOptions: {} });
        if (sql.includes("extractor_permits")) return "null";
        if (sql.includes("enqueue_readiness")) return JSON.stringify(TARGET_CATALOG_FINGERPRINT);
        return JSON.stringify({ queued: 0, processing: 0 });
      },
    });
    const observed = await observeLiveInstallAuthority(manifest, { credentialState: state },
      { loaded: false, state: "unloaded" }, createAdapter);
    expect(observed.credentialGeneration).toBe(46);
    expect(calls).toEqual(["inspect", "query", "query", "query", "query", "query"]);
    calls.length = 0;
    await expect(observeLiveInstallAuthority(manifest, { credentialState: state },
      { loaded: false, state: "unloaded" }, async () => ({ ...(await createAdapter()),
        inspect: async () => ({ database: { systemIdentifier: "other", major: 17 } }),
      }))).rejects.toThrow("live database target");
    expect(calls).toEqual([]);
  });
  // The exact deployment fixture is private and intentionally absent on other hosts.
  it.skipIf(!existsSync(YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH)
    || !existsSync("/Users/cwj/Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist"))(
    "runs the real prepare path and rejects pinned-byte, live-authority, and plist-target drift", async () => {
    const root = mkdtempSync(join(tmpdir(), "resolution-worker-prepare-"));
    try {
      const fixture = prepareFixture(root);
      const expiresAt = "2026-10-14T17:14:32.000Z";
      const claims = { role: "youtube_extraction_worker", scope: "youtube-extraction-worker",
        iss: "https://worker.mumeok.kr", aud: "youtube-extraction", generation: 46,
        jti_hash: sha("jti"), release_sha: fixture.manifest.review.contract.to,
        schema_identity: SCHEMA_IDENTITY, allowed_snapshot_digest: LIVE_POLICY_SNAPSHOT_DIGEST,
        iat: Math.floor(Date.now() / 1000) - 60, exp: Date.parse(expiresAt) / 1000 };
      const tokenPath = join(root, "token");
      const base = { loadInputs: () => ({ workerArtifact: { release_sha: fixture.manifest.review.contract.to },
        credentialState: { token_file: tokenPath, generation: 46, jti_sha256: sha("jti"), expires_at: expiresAt,
          release_sha: fixture.manifest.review.contract.to, schema_identity: SCHEMA_IDENTITY,
          allowed_snapshot_digest: LIVE_POLICY_SNAPSHOT_DIGEST } }),
      evaluatePreflight: () => ({ ready: true, release_sha: fixture.manifest.review.contract.to }),
      readEnvironment: async () => ({ HOMECOOK_YOUTUBE_WORKER_AUDIENCE: "youtube-extraction",
        HOMECOOK_YOUTUBE_WORKER_ISSUER: "https://worker.mumeok.kr" }),
      verifyCaller: async () => ({ authenticatedStatus: 200, emptyClaimStatus: 403 }),
      readStatus: async () => ({ loaded: false, state: "unloaded" }),
      verifyAuthority: async () => fixture.authority,
      buildPlan: () => ({ plist_path: fixture.manifest.previous.path, service_target: "gui/501/worker",
        plist_preview: fixture.previousBytes.toString("utf8") }),
      readBytes: (path: string) => path === tokenPath ? Buffer.from(jwt(claims)) : readFileSync(path) };
      await expect(prepareYoutubeResolutionWorkerInstall(fixture.manifest, base)).resolves.toMatchObject({
        previousStatus: { loaded: false, state: "unloaded" },
      });
      for (const corrupted of [fixture.manifest.paths.artifact, fixture.manifest.paths.descriptor,
        fixture.manifest.paths.expectedSchema]) {
        await expect(prepareYoutubeResolutionWorkerInstall(fixture.manifest, {
          ...base, readBytes: (path: string) => path === corrupted ? Buffer.from("corrupt") : base.readBytes(path),
        })).rejects.toThrow("bytes changed");
      }
      await expect(prepareYoutubeResolutionWorkerInstall(fixture.manifest, {
        ...base, verifyAuthority: async () => ({ ...fixture.authority, queue: { queued: 1, processing: 0 } }),
      })).rejects.toThrow("queue/permit");
      await expect(prepareYoutubeResolutionWorkerInstall(fixture.manifest, {
        ...base, buildPlan: () => ({ plist_path: join(root, "other.plist"), service_target: "gui/501/worker",
          plist_preview: fixture.previousBytes.toString("utf8") }),
      })).rejects.toThrow("different plist");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("pins the exact artifact, descriptor and expected schema without CLI overrides", () => {
    expect(YOUTUBE_RESOLUTION_WORKER_ARTIFACT_PATH).toBe(
      "/Users/cwj/.homecook/youtube-extraction-releases/c51d53871f31-youtube-resolution-20261010/artifact.json",
    );
    expect(YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_PATH).toBe(
      "/Users/cwj/.homecook/youtube-extraction/app-descriptor-c51d53871f31-youtube-resolution.json",
    );
    expect(YOUTUBE_RESOLUTION_WORKER_ARTIFACT_IDENTITY).toBe("d5e2647ce033319677dbb844d026bada538b8def4d1f55dbd796e98a379cb86f");
    expect(YOUTUBE_RESOLUTION_WORKER_ARTIFACT_FILE_SHA256).toBe("1657cc467d239f5c59755cd6e68c3b59432e80d8984e9275d3e63fb217de6346");
    expect(YOUTUBE_RESOLUTION_WORKER_DESCRIPTOR_SHA256).toBe("6207b867a50a6ffabd705a11a9028df8c4ef4b9682b32dade0ad22a983a3d650");
    expect(YOUTUBE_RESOLUTION_EXPECTED_SCHEMA_SHA256).toBe("d728e154663c05677eba4b5b4cfc578036707e8c70d1bee823dbca1ef4ee3fad");
    expect(() => assertYoutubeResolutionWorkerInstallPin({ path: "/private/install.json", sha256: null })).toThrow("not approved");
    const cli = readFileSync("scripts/install-prelaunch-youtube-resolution-worker.mjs", "utf8");
    expect(cli).not.toMatch(/--(?:manifest|credential|descriptor|policy|config|hash|root)/u);
  });

  it("decodes and binds the future credential claims to release, role, generation and expiry", () => {
    const expiresAt = "2026-10-14T17:14:32.000Z";
    const claims = {
      role: "youtube_extraction_worker", aud: "youtube-extraction", iss: "https://worker.mumeok.kr",
      release_sha: "c51d53871f31c7840fe24792b46b191ca963b11b",
      schema_identity: "youtube-extraction-worker-schema-v2", allowed_snapshot_digest: "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0",
      scope: "youtube-extraction-worker", generation: 46, jti_hash: sha("future-jti"),
      iat: Math.floor(Date.now() / 1000) - 60, exp: Date.parse(expiresAt) / 1000,
    };
    expect(decodeYoutubeResolutionWorkerJwt(jwt(claims))).toEqual(claims);
    const expected = { audience: "youtube-extraction", issuer: "https://worker.mumeok.kr", releaseSha: claims.release_sha,
      schemaIdentity: claims.schema_identity, snapshotDigest: claims.allowed_snapshot_digest, generation: 46,
      jtiSha256: sha("future-jti"), expiresAt };
    expect(() => assertYoutubeResolutionWorkerJwtClaims(claims, expected)).not.toThrow();
    expect(() => assertYoutubeResolutionWorkerJwtClaims({ ...claims, role: "service_role" }, expected)).toThrow("role");
    expect(() => assertYoutubeResolutionWorkerJwtClaims({ ...claims, scope: "youtube-extraction" }, expected)).toThrow("scope");
    expect(() => assertYoutubeResolutionWorkerJwtClaims({ ...claims, generation: 47 }, expected)).toThrow("release binding");
    expect(() => assertYoutubeResolutionWorkerJwtClaims({ ...claims, exp: claims.exp + 1 }, expected)).toThrow("expiry");
  });

  it("requires explicit execution authority before any filesystem or launchctl mutation", async () => {
    expect(YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION).toBe("LOCAL_PRELAUNCH_YOUTUBE_RESOLUTION_WORKER_INSTALL");
    await expect(executeYoutubeResolutionWorkerInstall({} as never, "wrong")).rejects.toThrow("exact install confirmation");
  });

  it("restores the exact plist when post-launch authenticated verification fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "resolution-worker-rollback-"));
    try {
      const plistPath = join(root, "worker.plist"); const old = Buffer.from("old-plist");
      writeFileSync(plistPath, old, { mode: 0o600 });
      const tokenPath = join(root, "token"); writeFileSync(tokenPath, "token", { mode: 0o600 });
      const prepared = { manifest: { review: { contract: { to: "c51d53871f31c7840fe24792b46b191ca963b11b" } },
        paths: { journalDirectory: join(root, "journal"), config: join(root, "config") },
        previous: { sha256: sha(old.toString()) } },
      plan: { plist_path: plistPath, plist_preview: "new-plist", service_target: "gui/501/worker" },
      previousBytes: old, previousStatus: { loaded: false, state: "unloaded" },
      inputs: { credentialState: { token_file: tokenPath } } };
      let prints = 0;
      const launchctl = (args: string[]) => {
        if (args[0] === "print") {
          prints += 1;
          if (prints >= 3) throw new Error("unloaded");
          return "path = /worker\nstate = running\npid = 42\n";
        }
        return "";
      };
      await expect(executeYoutubeResolutionWorkerInstall(prepared, YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION, {
        homeDir: root, userId: 501, launchctl, prepare: async () => prepared, wait: async () => {},
        readEnvironment: async () => ({}), verifyCaller: async () => { throw new Error("invalid signed caller"); },
      })).rejects.toThrow("invalid signed caller");
      expect(readFileSync(plistPath)).toEqual(old);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("requires a signed authenticated pre-request and rejects an empty-claim success", async () => {
    const root = mkdtempSync(join(tmpdir(), "resolution-worker-caller-"));
    const apiKey = join(root, "apikey"); writeFileSync(apiKey, "gateway-key", { mode: 0o600 });
    const environment = { HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE: apiKey,
      HOMECOOK_YOUTUBE_WORKER_DATA_API_URL: "http://127.0.0.1:54321/rest/v1" };
    try {
      await expect(verifyYoutubeResolutionWorkerCaller({ environment, token: "signed-token", secretRoot: root,
        fetchImpl: async (_url, init) => new Response(null, {
          status: init?.headers && Object.hasOwn(init.headers, "authorization") ? 401 : 403,
        }) })).rejects.toThrow("authenticated worker pre-request");
      await expect(verifyYoutubeResolutionWorkerCaller({ environment, token: "signed-token", secretRoot: root,
        fetchImpl: async () => new Response(null, { status: 204 }) })).rejects.toThrow("empty-claim");
      await expect(verifyYoutubeResolutionWorkerCaller({ environment, token: "signed-token", secretRoot: root,
        fetchImpl: async (_url, init) => new Response(null, {
          status: init?.headers && Object.hasOwn(init.headers, "authorization") ? 204 : 403,
        }) })).resolves.toEqual({ authenticatedStatus: 200, emptyClaimStatus: 403, emptyClaimDenied: true });
      for (const message of ["ACCOUNT_SESSION_STALE", "UNRELATED_DATABASE_FAILURE"]) {
        const probe = verifyYoutubeResolutionWorkerCaller({ environment, token: "signed-token", secretRoot: root,
          fetchImpl: async (_url, init) => init?.headers && Object.hasOwn(init.headers, "authorization")
            ? new Response(null, { status: 204 })
            : Response.json({ code: "55000", message }, { status: 500 }) });
        if (message === "ACCOUNT_SESSION_STALE") {
          await expect(probe).resolves.toEqual({ authenticatedStatus: 200, emptyClaimStatus: 500, emptyClaimDenied: true });
        } else await expect(probe).rejects.toThrow("empty-claim");
      }
      let fetchCount = 0;
      await expect(verifyYoutubeResolutionWorkerCaller({ environment: {
        ...environment, HOMECOOK_YOUTUBE_WORKER_DATA_API_URL: "https://attacker.example/rest/v1?leak=1",
        HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE: join(root, "does-not-exist"),
      }, token: "signed-token", secretRoot: root, fetchImpl: async () => {
        fetchCount += 1; return new Response(null, { status: 204 });
      } })).rejects.toThrow("exact loopback");
      expect(fetchCount).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("waits for two stable running observations and fails closed on exit", async () => {
    const states: Array<{ loaded: boolean; state: string; pid: number | null }> = [{ loaded: true, state: "spawn scheduled", pid: null },
      { loaded: true, state: "running", pid: 42 }, { loaded: true, state: "running", pid: 42 }];
    await expect(awaitYoutubeResolutionWorkerRunning({ readStatus: async () => states.shift(), wait: async () => {} }))
      .resolves.toMatchObject({ state: "running", pid: 42 });
    await expect(awaitYoutubeResolutionWorkerRunning({ readStatus: async () => ({ loaded: true, state: "exited" }),
      wait: async () => {} })).rejects.toThrow("failed during startup");
  });

  it("accepts rollback only when exact predecessor bytes and launchd health return", () => {
    const prepared = { manifest: { previous: { sha256: sha("plist") } },
      previousStatus: { loaded: true, state: "running" } };
    expect(assertYoutubeResolutionWorkerRestored(prepared, sha("plist"), { loaded: true, state: "running" })).toBe(true);
    expect(() => assertYoutubeResolutionWorkerRestored(prepared, sha("other"), { loaded: true, state: "running" })).toThrow("hash");
    expect(() => assertYoutubeResolutionWorkerRestored(prepared, sha("plist"), { loaded: true, state: "waiting" })).toThrow("state mismatch");
  });

  it("reuses verified install primitives and contains no credential issuance or DB registration", () => {
    const source = readFileSync("scripts/lib/prelaunch-youtube-resolution-worker-install.mjs", "utf8");
    expect(source).toContain("buildYoutubeExtractionWorkerInstallPlan");
    expect(source).toContain("loadYoutubeExtractionWorkerRuntimeInputs");
    expect(source).toContain("evaluateYoutubeExtractionWorkerPreflight");
    expect(source).toContain("parseLaunchctlPrintStatus");
    expect(source).toContain("readWorkerEnvironment");
    expect(source).toContain("verifyYoutubeResolutionWorkerCaller");
    expect(source).toContain("empty-claim worker pre-request was not denied");
    expect(source).toContain('openSync(lockPath, "wx"');
    expect(source).toContain("failed-requires-manual-recovery");
    expect(source).not.toMatch(/issueYoutube|registerYoutube|rotateYoutubeExtractionWorkerCredential/u);
  });

  it("preserves canonical TMPDIR, absolute NVM Node and system Python precedence", () => {
    const launcher = { ProgramArguments: ["/usr/bin/env", "-i", "HOME=/Users/cwj",
      "PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin", "TMPDIR=/private/var/folders/canonical/",
      "/Users/cwj/.nvm/versions/node/v22/bin/node", "/worker.mjs", "run"] };
    expect(assertYoutubeResolutionLauncherPreserved(launcher, structuredClone(launcher))).toBe(true);
    expect(() => assertYoutubeResolutionLauncherPreserved(launcher, { ...launcher,
      ProgramArguments: launcher.ProgramArguments.map((value) => value.startsWith("TMPDIR=") ? "TMPDIR=/tmp" : value) })).toThrow("environment");
    expect(() => assertYoutubeResolutionLauncherPreserved(launcher, { ...launcher,
      ProgramArguments: launcher.ProgramArguments.map((value) => value.startsWith("PATH=") ? "PATH=/opt/homebrew/bin:/usr/bin" : value) })).toThrow("environment");
    expect(() => assertYoutubeResolutionLauncherPreserved(launcher, { ...launcher,
      ProgramArguments: launcher.ProgramArguments.map((value) => value.includes("/.nvm/") ? "/usr/local/bin/node" : value) })).toThrow("NVM");
  });
});
