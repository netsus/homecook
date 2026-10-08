import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPrelaunchScope, parsePrelaunchOptions } from "../scripts/lib/prelaunch-web-deploy.mjs";
import {
  assertCurrentYoutubeTrialWorker,
  deriveYoutubeTrialPolicySnapshot,
  assertYoutubeTrialMigrationTransition,
  assertYoutubeTrialNutritionSettings,
  assertYoutubeTrialReview,
  assertYoutubeTrialReviewPin,
  assertYoutubeTrialScopePreserved,
  assertYoutubeTrialSource,
  assertYoutubeTrialSourceBackfill,
  YOUTUBE_TRIAL_LIVE_SHA,
  YOUTUBE_TRIAL_MIGRATION,
  YOUTUBE_TRIAL_MIGRATION_FILENAMES,
  YOUTUBE_TRIAL_MIGRATIONS,
  YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_TRIAL_SCOPE_ALIAS,
  YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS,
  YOUTUBE_TRIAL_WEB_SUPPORT_FILES,
  YOUTUBE_TRIAL_POLICY_SQL,
  youtubeTrialScopeEvidence,
} from "../scripts/lib/prelaunch-youtube-trial-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const proofNames = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook",
  "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"];
const scope = (name: string, body: string) => ({ name, bodySha256: sha(body), owner: "postgres",
  acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });

function review() {
  const sourceBackfillMigrations = YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS.map((filename) => ({ filename, sha256: sha(filename) }));
  return {
    schema: "homecook.prelaunch-youtube-trial-review.v1", from: YOUTUBE_TRIAL_LIVE_SHA, to: "b".repeat(40),
    migrationSourceRef: "c".repeat(40), applicationSourceRef: "d".repeat(40), previousMigrationCount: 207, migrationCount: 210,
    migrations: [...YOUTUBE_TRIAL_MIGRATIONS],
    files: {
      "app/api/v1/recipes/youtube/saved-drafts/route.ts": [null, sha("route")],
      [YOUTUBE_TRIAL_WEB_SUPPORT_FILES[0]]: [sha("old-artifact-helper"), sha("new-artifact-helper")],
      [YOUTUBE_TRIAL_WEB_SUPPORT_FILES[1]]: [sha("old-expected-schema"), YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256],
      [`supabase/migrations/${YOUTUBE_TRIAL_MIGRATION.filename}`]: [null, YOUTUBE_TRIAL_MIGRATION.sha256],
      [`supabase/migrations/${YOUTUBE_TRIAL_MIGRATION_FILENAMES[1]}`]: [null, YOUTUBE_TRIAL_MIGRATIONS[1].sha256],
      [`supabase/migrations/${YOUTUBE_TRIAL_MIGRATION_FILENAMES[2]}`]: [null, YOUTUBE_TRIAL_MIGRATIONS[2].sha256],
      ...Object.fromEntries(sourceBackfillMigrations.map((row) => [`supabase/migrations/${row.filename}`, [null, row.sha256]])),
    },
    protectedSources: ["app/api/v1/recipes/youtube/saved-drafts/route.ts"],
    originalReadinessSha256: sha("readiness"), proofDigests: Object.fromEntries(proofNames.map((name) => [name, sha(name)])),
    preApplyProof: { path: "/private/youtube/db-before.json", sha256: sha("db-before") },
    workerRolloutProof: { path: "/private/youtube/worker-proof.json", sha256: sha("worker") },
    applicationTreeSha256: sha("app-tree"), runtimeBundleTreeSha256: sha("runtime-tree"),
    workerDescriptorSha256: sha("worker-artifact"), installedWorkerArtifactSha256: sha("worker-artifact"),
    queuePolicySha256: sha("queue-policy"),
    expectedNutritionSetting: false, expectedNutritionSettingsSha256: sha("nutrition-settings"),
    newScopeAliases: [YOUTUBE_TRIAL_SCOPE_ALIAS], expectedSchemaSha256: YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256,
    expectedScopeFunctions: [scope("verify_full_local_internal_scope", "new wrapper"),
      scope(YOUTUBE_TRIAL_SCOPE_ALIAS, "old active")],
    currentWorkerPaths: Object.fromEntries(["appDescriptorPath", "credentialPath", "currentPolicyPath", "expectedSchemaPath",
      "queueStatePath", "secretRoot", "workerArtifactPath"].map(name => [name, `/private/youtube/${name}`])),
    credentialGeneration: 7, queuePolicyVersion: 3, pipelineIdentity: sha("pipeline"),
    queuePolicySnapshotDigest: sha("policy-snapshot"),
    sourceBackfillMigrations,
  };
}

const ledger = (count: number) => Array.from({ length: count }, (_, index) => ({
  filename: `${String(index).padStart(14, "0")}_reviewed.sql`, sha256: sha(String(index)),
}));

describe("reviewed YouTube manual-trial deployment", () => {
  it("requires exact reviewed ref, already-applied DB and private DB config", () => {
    const args = ["--reviewed-youtube-trial-readiness", "--already-applied-db", "--db-config", "/private/db.env",
      "--reviewed-ref", "b".repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({ reviewedYoutubeTrialReadiness: true, alreadyAppliedDb: true });
    expect(() => parsePrelaunchOptions(["--reviewed-youtube-trial-readiness"])).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, 4))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions([...args, "--reviewed-ai-nutrition-readiness"])).toThrow("함께");
  });

  it("starts with an unusable immutable review pin", () => {
    expect(() => assertYoutubeTrialReviewPin({ path: null, sha256: null })).toThrow("not configured");
    expect(() => assertYoutubeTrialReviewPin({ path: "relative.json", sha256: sha("x") })).toThrow("not configured");
  });

  it("rejects forged source pairs, protected omissions and worker operations in web", () => {
    const manifest = review(); const files = Object.keys(manifest.files);
    expect(() => assertYoutubeTrialReview(manifest)).not.toThrow();
    expect(() => assertYoutubeTrialReview({ ...manifest, from: "d".repeat(40) })).toThrow("source pair");
    expect(() => assertYoutubeTrialReview({ ...manifest, protectedSources: ["lib/missing.ts"] })).toThrow("protected source");
    expect(() => assertYoutubeTrialReview({ ...manifest,
      files: { ...manifest.files, "scripts/lib/youtube-extraction-worker-ops.mjs": [sha("old"), sha("new")] } })).toThrow("worker operations");
    const input = { review: manifest, liveSha: manifest.from, releaseSha: manifest.to, files,
      actualFiles: files, digests: manifest.files };
    expect(() => assertYoutubeTrialSource(input)).not.toThrow();
    expect(() => assertYoutubeTrialSource({ ...input, actualFiles: files.slice(1) })).toThrow("complete source diff");
    expect(() => assertYoutubeTrialSource({ ...input, digests: { ...manifest.files,
      [files[0]]: [null, sha("forged")] } })).toThrow("source bytes");
  });

  it("admits exactly two reviewed support files only in the pinned trial lane", () => {
    const pkg = { scripts: { build: "next build", start: "node scripts/start-production.mjs" } };
    for (const file of YOUTUBE_TRIAL_WEB_SUPPORT_FILES) {
      expect(() => classifyPrelaunchScope([file], pkg, pkg)).toThrow("허용하지 않는");
      expect(classifyPrelaunchScope([file], pkg, pkg, { reviewedYoutubeTrialSupport: true }).support).toEqual([file]);
    }
    expect(() => classifyPrelaunchScope(["scripts/lib/youtube-extraction-worker-ops.mjs"], pkg, pkg,
      { reviewedYoutubeTrialSupport: true })).toThrow("허용하지 않는");
  });

  it("closes review bytes before granting the exact two-file classifier exception", () => {
    const manifest = review(); const files = Object.keys(manifest.files); const pkg = { scripts: {
      build: "next build", start: "node scripts/start-production.mjs" } };
    const source = { review: manifest, liveSha: manifest.from, releaseSha: manifest.to,
      files, actualFiles: files, digests: manifest.files };
    expect(() => assertYoutubeTrialReview(manifest)).not.toThrow();
    expect(() => assertYoutubeTrialSource(source)).not.toThrow();
    expect(classifyPrelaunchScope(files, pkg, pkg, { reviewedYoutubeTrialSupport: true }).support)
      .toEqual(expect.arrayContaining([...YOUTUBE_TRIAL_WEB_SUPPORT_FILES]));
    for (const file of YOUTUBE_TRIAL_WEB_SUPPORT_FILES) expect(() => classifyPrelaunchScope([file], pkg, pkg)).toThrow("허용하지 않는");
    expect(() => classifyPrelaunchScope(["scripts/lib/youtube-extraction-worker-runtime.mjs"], pkg, pkg,
      { reviewedYoutubeTrialSupport: true })).toThrow("허용하지 않는");
    expect(() => assertYoutubeTrialSource({ ...source, digests: { ...manifest.files,
      [YOUTUBE_TRIAL_WEB_SUPPORT_FILES[0]]: [sha("old-artifact-helper"), sha("tampered")] } })).toThrow("source bytes");
  });

  it("requires exact 207 predecessor plus the two reviewed trial SQL files", () => {
    const migrations = review().migrations; const before = ledger(207); const source = [...before, ...migrations];
    expect(() => assertYoutubeTrialMigrationTransition(before, source, migrations)).not.toThrow();
    expect(() => assertYoutubeTrialMigrationTransition(before.map((row, i) => i ? row : { ...row, sha256: sha("edited") }), source, migrations)).toThrow("predecessor");
    expect(() => assertYoutubeTrialMigrationTransition(before,
      [...before, ...migrations.map((row, index) => index === 1 ? { ...row, sha256: sha("wrong") } : row)], migrations)).toThrow("trial SQL");
    expect(() => assertYoutubeTrialMigrationTransition(before.slice(1), source, migrations)).toThrow("ledger");
  });
  it("admits only exact already-applied historical source backfill rows", () => {
    const manifest = review(); const ledger = [
      ...manifest.sourceBackfillMigrations,
      ...Array.from({ length: 185 }, (_, index) => ({ filename: `${String(index).padStart(14, "0")}_old.sql`, sha256: sha(`old:${index}`) })),
    ];
    expect(() => assertYoutubeTrialSourceBackfill(manifest, ledger, manifest.sourceBackfillMigrations)).not.toThrow();
    expect(() => assertYoutubeTrialSourceBackfill(manifest, ledger,
      manifest.sourceBackfillMigrations.map((row, index) => index ? row : { ...row, sha256: sha("wrong") }))).toThrow("migration source");
    expect(() => assertYoutubeTrialSourceBackfill(manifest, ledger.slice(1), manifest.sourceBackfillMigrations)).toThrow("207 ledger");
    const unknown = { filename: "20261001000000_unknown.sql", sha256: sha("unknown") };
    expect(() => assertYoutubeTrialReview({ ...manifest, sourceBackfillMigrations: [...manifest.sourceBackfillMigrations.slice(0, -1), unknown] })).toThrow(/trial SQL|source backfill/);
    expect(() => assertYoutubeTrialReview({ ...manifest, files: { ...manifest.files,
      [`supabase/migrations/${manifest.sourceBackfillMigrations[0].filename}`]: [sha("before"), manifest.sourceBackfillMigrations[0].sha256] } })).toThrow(/trial SQL|source backfill/);
  });

  it("preserves the old scope chain and admits exactly one reviewed alias", () => {
    const before = [scope("verify_full_local_internal_scope", "old active")];
    const after = [scope("verify_full_local_internal_scope", "new wrapper"), scope(YOUTUBE_TRIAL_SCOPE_ALIAS, "old active")];
    expect(() => assertYoutubeTrialScopePreserved(before, after, after, YOUTUBE_TRIAL_SCOPE_ALIAS)).not.toThrow();
    expect(() => assertYoutubeTrialScopePreserved(before, after.slice(0, 1), after.slice(0, 1), YOUTUBE_TRIAL_SCOPE_ALIAS)).toThrow("one reviewed");
    const changed = after.map((row, i) => i ? { ...row, bodySha256: sha("changed") } : row);
    expect(() => assertYoutubeTrialScopePreserved(before, changed, changed, YOUTUBE_TRIAL_SCOPE_ALIAS)).toThrow("authority changed");
  });

  it("rejects nutrition and worker identity drift", () => {
    const manifest = review();
    expect(() => assertYoutubeTrialReview({ ...manifest, expectedNutritionSetting: "disabled" })).toThrow("pinned nutrition");
    expect(() => assertYoutubeTrialReview({ ...manifest, installedWorkerArtifactSha256: null })).toThrow("app/worker identity");
    expect(() => assertYoutubeTrialReview({ ...manifest, workerRolloutProof: { path: null, sha256: null } })).toThrow("worker rollout proof");
  });

  it("preserves the pinned nutrition boolean and whole settings digest in both directions", () => {
    const manifest = review(); const observed = { count: 1, enabled: false, sha256: manifest.expectedNutritionSettingsSha256 };
    expect(() => assertYoutubeTrialNutritionSettings(manifest, observed, observed)).not.toThrow();
    expect(() => assertYoutubeTrialNutritionSettings(manifest, observed, { ...observed, enabled: true })).toThrow("settings changed");
    const enabledManifest = { ...manifest, expectedNutritionSetting: true };
    const enabled = { ...observed, enabled: true };
    expect(() => assertYoutubeTrialNutritionSettings(enabledManifest, enabled, { ...enabled, enabled: false })).toThrow("settings changed");
  });

  it("attests current worker state instead of trusting the old rollout receipt", () => {
    const manifest = review(); const now = Date.now();
    const inputs = { appDescriptor: { release_sha: manifest.to }, workerArtifact: {
      release_sha: manifest.to, artifact_sha256: manifest.installedWorkerArtifactSha256, schema_identity: "schema-v1",
      allowed_snapshot_digest: sha("snapshot"), pipeline_identity: manifest.pipelineIdentity,
    }, currentPolicy: { pipeline_identity: manifest.pipelineIdentity, policy_version: manifest.queuePolicyVersion,
      policy_snapshot_digest: manifest.queuePolicySnapshotDigest, enabled: true },
    credentialState: { release_sha: manifest.to, generation: manifest.credentialGeneration, schema_identity: "schema-v1",
      allowed_snapshot_digest: sha("snapshot"), expires_at: new Date(now + 3_600_000).toISOString() } };
    const observed = { review: manifest, inputs, preflight: { ready: true },
      launchd: { loaded: true, state: "running", label: "com.homecook.youtube-extraction-worker" },
      descriptorSha256: manifest.workerDescriptorSha256, policySha256: manifest.queuePolicySha256,
      expectedSchemaSha256: manifest.expectedSchemaSha256, now };
    expect(() => assertCurrentYoutubeTrialWorker(manifest, observed)).not.toThrow();
    expect(() => assertCurrentYoutubeTrialWorker(manifest, { ...observed,
      inputs: { ...inputs, workerArtifact: { ...inputs.workerArtifact, artifact_sha256: sha("stale") } } })).toThrow("file identity drift");
    expect(() => assertCurrentYoutubeTrialWorker(manifest, { ...observed,
      inputs: { ...inputs, currentPolicy: { ...inputs.currentPolicy, policy_version: 2 } } })).toThrow("queue policy drift");
    expect(() => assertCurrentYoutubeTrialWorker(manifest, { ...observed,
      inputs: { ...inputs, credentialState: { ...inputs.credentialState, generation: 6 } } })).toThrow("credential metadata drift");
    expect(() => assertCurrentYoutubeTrialWorker(manifest, { ...observed,
      launchd: { ...observed.launchd, state: "exited" } })).toThrow("loaded and healthy");
  });

  it("accepts the exact real saved-results scope alias in bounded evidence", () => {
    expect(youtubeTrialScopeEvidence([{ name: YOUTUBE_TRIAL_SCOPE_ALIAS, source: "old body", owner: "postgres",
      acl: ["postgres=X/postgres"], securityDefiner: true,
      config: ["search_path=pg_catalog, public, private, pg_temp"] }])[0].name).toBe(YOUTUBE_TRIAL_SCOPE_ALIAS);
    expect(() => youtubeTrialScopeEvidence([{ name: "verify_arbitrary_manifest_alias", source: "body" }])).toThrow("invalid scope");
  });
  it("derives policy snapshot in canonical JS without invoking the revoked DB function", () => {
    expect(YOUTUBE_TRIAL_POLICY_SQL).not.toContain("youtube_extraction_policy_snapshot_digest");
    const raw = { enabled: true, policy_version: 3, extractor_mode: "i031_codex_vision",
      pipeline_identity: sha("pipeline"), result_affecting_options: { frameMode: "hybrid", keyframeTotalLimit: 8 } };
    const first = deriveYoutubeTrialPolicySnapshot(raw);
    expect(first.policy_snapshot_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveYoutubeTrialPolicySnapshot(structuredClone(raw)).policy_snapshot_digest).toBe(first.policy_snapshot_digest);
    expect(deriveYoutubeTrialPolicySnapshot({ ...raw,
      result_affecting_options: { ...raw.result_affecting_options, keyframeTotalLimit: 7 } }).policy_snapshot_digest)
      .not.toBe(first.policy_snapshot_digest);
  });

  it("wires readiness before preparation and before activation", () => {
    const source = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
    expect(source).toContain("options.reviewedYoutubeTrialReadiness ? await loadYoutubeTrialReview() : null");
    expect(source).toContain("return verifyYoutubeTrialAppliedDatabase(");
    expect(source).toContain("round2-youtube-trial-source-review.json");
    expect(source).toMatch(/options\.reviewedYoutubeTrialReadiness\) await stageRound2Readiness/);
  });
});
