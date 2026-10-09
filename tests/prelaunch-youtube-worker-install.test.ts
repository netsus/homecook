import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertPrelaunchYoutubeWorkerInstallManifest,
  assertPrelaunchYoutubeWorkerInstallPin,
  assertPrelaunchYoutubeLiveAuthority,
  assertPrelaunchYoutubeWorkerRestored,
  awaitPrelaunchYoutubeWorkerRunning,
  PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION,
  prelaunchYoutubeWorkerInstallAuthority,
  verifyPrelaunchYoutubeInstallerConfigRouting,
} from "../scripts/lib/prelaunch-youtube-worker-install.mjs";
import {
  YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_TRIAL_LIVE_SHA,
  YOUTUBE_TRIAL_MIGRATIONS,
  YOUTUBE_TRIAL_SCOPE_ALIAS,
  YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS,
  YOUTUBE_TRIAL_WEB_SUPPORT_FILES,
} from "../scripts/lib/prelaunch-youtube-trial-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const paths = Object.fromEntries(["configPath", "databaseConfigPath", "manifestPath", "credentialPath", "appDescriptorPath", "currentPolicyPath",
  "expectedSchemaPath", "queueStatePath", "secretRoot", "rootDir", "journalDirectory", "rootApprovalRecordPath",
  "dbApplyReceiptPath", "backupProofPath", "sourceRepositoryRoot"].map((name) => [name, `/private/youtube/${name}`]));
const scope = (name: string, body: string) => ({ name, bodySha256: sha(body), owner: "postgres",
  acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });
function webReview() {
  const artifact = sha("artifact"); const descriptor = sha("descriptor"); const policy = sha("policy");
  const sourceBackfillMigrations = YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS.map((filename) => ({ filename, sha256: sha(filename) }));
  return { schema: "homecook.prelaunch-youtube-trial-review.v1", from: YOUTUBE_TRIAL_LIVE_SHA, to: "b".repeat(40),
    migrationSourceRef: "c".repeat(40), applicationSourceRef: "d".repeat(40), previousMigrationCount: 207, migrationCount: 210,
    migrations: [...YOUTUBE_TRIAL_MIGRATIONS], files: Object.fromEntries([
      ["app/api/v1/recipes/youtube/saved-drafts/route.ts", [null, sha("route")]],
      ...YOUTUBE_TRIAL_WEB_SUPPORT_FILES.map((file) => [file, [sha(`old:${file}`), file.endsWith("expected-schema.json") ? YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256 : sha(`new:${file}`)]]),
      ...YOUTUBE_TRIAL_MIGRATIONS.map((row) => [`supabase/migrations/${row.filename}`, [null, row.sha256]]),
      ...sourceBackfillMigrations.map((row) => [`supabase/migrations/${row.filename}`, [null, row.sha256]]),
    ]), protectedSources: [], originalReadinessSha256: sha("readiness"),
    proofDigests: Object.fromEntries(["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook",
      "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"].map((name) => [name, sha(name)])),
    preApplyProof: { path: "/private/youtube/pre.json", sha256: sha("pre") },
    workerRolloutProof: { path: "/private/youtube/worker.json", sha256: sha("worker") },
    applicationTreeSha256: sha("app"), runtimeBundleTreeSha256: sha("runtime"), workerDescriptorSha256: descriptor,
    installedWorkerArtifactSha256: artifact, queuePolicySha256: policy, expectedNutritionSetting: false,
    expectedNutritionSettingsSha256: sha("nutrition"), newScopeAliases: [YOUTUBE_TRIAL_SCOPE_ALIAS],
    expectedScopeFunctions: [scope("verify_full_local_internal_scope", "wrapper"), scope(YOUTUBE_TRIAL_SCOPE_ALIAS, "old")],
    expectedSchemaSha256: YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256,
    currentWorkerPaths: Object.fromEntries(["appDescriptorPath", "credentialPath", "currentPolicyPath", "expectedSchemaPath",
      "queueStatePath", "secretRoot", "workerArtifactPath"].map((name) => [name, `/private/youtube/${name}`])),
    credentialGeneration: 45, queuePolicyVersion: 3, pipelineIdentity: sha("pipeline"), queuePolicySnapshotDigest: sha("snapshot"),
    sourceBackfillMigrations };
}
function manifest() {
  const review = webReview(); const value: any = { schema: "homecook.prelaunch-youtube-worker-install.v1", approved: true,
    webReleaseSha: review.to, artifactSha256: review.installedWorkerArtifactSha256,
    manifestFileSha256: sha("artifact-manifest-file"),
    descriptorSha256: review.workerDescriptorSha256, policySha256: review.queuePolicySha256,
    expectedSchemaSha256: review.expectedSchemaSha256, credentialGeneration: review.credentialGeneration,
    review, paths, rootApprovalRecordSha256: sha("approval"), dbApplyReceiptSha256: sha("db210"),
    backupProofSha256: sha("fresh-backups"), oldPlistSha256: sha("old-plist"), oldLoaded: true, oldState: "exited",
    oldWeb: { releaseSha: YOUTUBE_TRIAL_LIVE_SHA, plistPath: "/private/old.plist", workingDirectory: "/private/live-web",
      buildId: "live-build", plistSha256: sha("live-plist") },
    i031Preflight: { ready: true, codexCliVersion: "0.154.0-alpha.6.2", chatGptLogin: true, toolsReady: true } };
  value.installAuthoritySha256 = sha(JSON.stringify(prelaunchYoutubeWorkerInstallAuthority(value),
    Object.keys(prelaunchYoutubeWorkerInstallAuthority(value)).sort())); return value;
}

describe("reviewed prelaunch YouTube worker installer", () => {
  it("starts fail-closed and requires the exact confirmation", () => {
    expect(() => assertPrelaunchYoutubeWorkerInstallPin({ path: null, sha256: null })).toThrow("not configured");
    expect(PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION).toBe("LOCAL_PRELAUNCH_YOUTUBE_TRIAL_WORKER_INSTALL");
  });
  it("binds the approved web, artifact, descriptor, policy, credential and DB/backup proofs", () => {
    expect(() => assertPrelaunchYoutubeWorkerInstallManifest(manifest())).not.toThrow();
    expect(() => assertPrelaunchYoutubeWorkerInstallManifest({ ...manifest(), artifactSha256: sha("other") })).toThrow("identities differ");
    expect(() => assertPrelaunchYoutubeWorkerInstallManifest({ ...manifest(), credentialGeneration: 44 })).toThrow("identities differ");
    expect(() => assertPrelaunchYoutubeWorkerInstallManifest({ ...manifest(), dbApplyReceiptSha256: null })).toThrow("pins required");
  });
  it("keeps mutation authority separate with exclusive locks, rollback and no DB-policy rollback claim", () => {
    const source = readFileSync("scripts/lib/prelaunch-youtube-worker-install.mjs", "utf8");
    expect(source).toContain("getLocalMacProductionReleasePaths");
    expect(source).toContain('openSync(lockPath, "wx"');
    expect(source).toContain("dbPolicyRollbackPerformed: false");
    expect(source).toContain("failed-restored-plist");
    expect(source).toContain("failed-restored-to-preexisting-unhealthy");
    expect(source).not.toContain("assertLocalMacProductionMutationAuthority");
  });
  it("rejects live DB queue, permit, credential, policy and predecessor web drift", () => {
    const value = manifest(); const now = Date.now(); const observed: any = { policy: { enabled: true,
      policy_version: value.review.queuePolicyVersion, pipeline_identity: value.review.pipelineIdentity,
      policy_snapshot_digest: value.review.queuePolicySnapshotDigest }, queue: { queued: 0, processing: 0 },
    permit: { owner_id: null }, credential: { current_generation: value.credentialGeneration,
      release_sha: value.webReleaseSha, schema_identity: "schema", allowed_snapshot_digest: value.review.queuePolicySnapshotDigest,
      current_jti_hash: "jti", expires_at: new Date(now + 3600_000).toISOString() },
    inputs: { workerArtifact: { schema_identity: "schema" }, credentialState: { jti_sha256: "jti" } }, web: {
      releaseSha: YOUTUBE_TRIAL_LIVE_SHA, plistSha256: value.oldWeb.plistSha256, buildId: value.oldWeb.buildId,
      workingDirectory: value.oldWeb.workingDirectory } };
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, observed, now)).not.toThrow();
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, { ...observed, queue: { queued: 1, processing: 0 } }, now)).toThrow("queue");
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, { ...observed, permit: { owner_id: "held" } }, now)).toThrow("permit");
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, { ...observed,
      credential: { ...observed.credential, current_generation: 44 } }, now)).toThrow("credential");
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, { ...observed,
      policy: { ...observed.policy, policy_version: 2 } }, now)).toThrow("policy");
    expect(() => assertPrelaunchYoutubeLiveAuthority(value, { ...observed,
      web: { ...observed.web, buildId: "other" } }, now)).toThrow("web fence");
  });
  it("exposes no CLI paths or expected hashes", () => {
    const source = readFileSync("scripts/install-prelaunch-youtube-worker.mjs", "utf8");
    expect(source).toContain("[--execute");
    expect(source).not.toMatch(/--(?:manifest|credential|policy|descriptor|config|root|label|hash)/);
  });
  it("does not claim rollback success when plist or restored launchd state differs", () => {
    const value = manifest(); const previous = { loaded: true, state: "spawn scheduled" };
    expect(assertPrelaunchYoutubeWorkerRestored(value, previous, value.oldPlistSha256,
      { loaded: true, state: "waiting" })).toBe("failed-restored-to-preexisting-unhealthy");
    expect(assertPrelaunchYoutubeWorkerRestored(value, previous, value.oldPlistSha256,
      { loaded: true, state: "running" })).toBe("failed-restored-to-preexisting-unhealthy");
    expect(() => assertPrelaunchYoutubeWorkerRestored(value, previous, sha("wrong"), previous)).toThrow("plist hash");
    expect(() => assertPrelaunchYoutubeWorkerRestored(value, previous, value.oldPlistSha256,
      { loaded: false, state: "unloaded" })).toThrow("loaded state");
    const healthy = { loaded: true, state: "running" };
    expect(() => assertPrelaunchYoutubeWorkerRestored(value, healthy, value.oldPlistSha256,
      { loaded: true, state: "waiting" })).toThrow("return to running");
  });
  it("routes worker config only to the plan and full-local config to DB and backup", async () => {
    const value = manifest(); const calls: string[] = [];
    const result = await verifyPrelaunchYoutubeInstallerConfigRouting(value, {
      worker: async (config: string) => { calls.push(`worker:${config}`); return config; },
      database: async (config: string) => { calls.push(`database:${config}`); return config; },
      backup: async (config: string) => { calls.push(`backup:${config}`); return config; },
    });
    expect(result.worker).toBe(value.paths.configPath);
    expect(result.database).toBe(value.paths.databaseConfigPath);
    expect(result.backup).toBe(value.paths.databaseConfigPath);
    expect(calls).toEqual([`worker:${value.paths.configPath}`, `database:${value.paths.databaseConfigPath}`,
      `backup:${value.paths.databaseConfigPath}`]);
    const conflated = { ...value, paths: { ...value.paths, databaseConfigPath: value.paths.configPath } };
    await expect(verifyPrelaunchYoutubeInstallerConfigRouting(conflated, {
      worker: async () => null, database: async () => null, backup: async () => null,
    })).rejects.toThrow("must be distinct");
  });
  it("waits for two stable running observations and fails fast on process exit", async () => {
    const statuses = [{ loaded: true, state: "spawn scheduled", pid: null },
      { loaded: true, state: "running", pid: 41 }, { loaded: true, state: "running", pid: 41 }];
    await expect(awaitPrelaunchYoutubeWorkerRunning({ readStatus: async () => statuses.shift(), wait: async () => {} }))
      .resolves.toMatchObject({ state: "running", pid: 41 });
    await expect(awaitPrelaunchYoutubeWorkerRunning({ readStatus: async () => ({ loaded: true, state: "exited", pid: null }),
      wait: async () => {} })).rejects.toThrow("process failed");
    await expect(awaitPrelaunchYoutubeWorkerRunning({ attempts: 2,
      readStatus: async () => ({ loaded: true, state: "spawn scheduled", pid: null }), wait: async () => {} }))
      .rejects.toThrow("stable running");
  });
});
