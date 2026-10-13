import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter } from "./marketing-round2-controlled-deploy.mjs";

export const YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR =
  "docs/engineering/data/youtube-integrated-master-release-20261013.json";
export const YOUTUBE_INTEGRATED_LIVE_RELEASE =
  "f970bc1d1f1e981d8947e852a9b51ada4a74570a";
export const YOUTUBE_INTEGRATED_SOURCE_COMMITS = Object.freeze([
  "58a03675ac11a7ff31e250165f2f96fbe8000ea2",
  "4c39d0b81fa29dc929c69d0fc3031aeff3144b33",
]);
export const YOUTUBE_INTEGRATED_MIGRATION =
  "supabase/migrations/20261012120000_youtube_saved_recipe_canonical_bridge.sql";
export const YOUTUBE_INTEGRATED_PIPELINE_IDENTITY =
  "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd";
export const YOUTUBE_INTEGRATED_CLIENT_VERSION =
  "codex-vision-source-anchored-v71-word-range-hardening";
export const YOUTUBE_INTEGRATED_VERIFIER_VERSION =
  "source-anchor-fidelity-v44-source-bound-review-hardening";

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireValue = (value, message) => {
  if (!value) throw new DeploymentError(`통합 master 배포 증명 불일치: ${message}`);
};
const ledgerSql = "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;";

export function unwrapIntegratedMigration(bytes) {
  const source = Buffer.from(bytes).toString("utf8");
  requireValue(/^begin;\s/iu.test(source) && /\scommit;\s*$/iu.test(source),
    "migration outer transaction wrapper");
  const payload = source.replace(/^begin;\s*/iu, "").replace(/\s*commit;\s*$/iu, "");
  requireValue(!/(?:^|;)\s*(?:begin|commit|rollback)\s*;/iu.test(payload),
    "nested transaction control");
  return payload;
}

export function integratedMasterMigrationLedger(repositoryRoot) {
  const migrationRoot = join(repositoryRoot, "supabase/migrations");
  return readdirSync(migrationRoot)
    .filter((filename) => /^\d+_[^/]+\.sql$/u.test(filename))
    .sort()
    .map((filename) => ({ filename, sha256: sha256(readFileSync(join(migrationRoot, filename))) }));
}

export function assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger, phase, target, saved }) {
  requireValue(phase === "predecessor" || phase === "applied", "database phase");
  requireValue(target?.database?.systemIdentifier === "7669475895419854882"
    && target.database.major === 17, "full-local database target");
  requireValue(source.length === descriptor.database.afterLedgerCount, "candidate migration ledger");
  const bridge = source.at(-1);
  requireValue(bridge?.filename === YOUTUBE_INTEGRATED_MIGRATION.replace("supabase/migrations/", "")
    && bridge.sha256 === descriptor.database.migration.sha256, "candidate bridge migration");
  const expected = phase === "predecessor" ? source.slice(0, descriptor.database.beforeLedgerCount) : source;
  requireValue(isDeepStrictEqual(ledger, expected), `${phase} live migration ledger`);
  requireValue(Number.isInteger(saved?.savedRows) && saved.savedRows >= 0, "saved result inventory");
  if (phase === "predecessor") {
    requireValue(saved.bridgeFunctionAbsent === true, "predecessor bridge function absence");
  } else {
    requireValue(saved.canonicalRows === saved.savedRows && saved.invalidRows === 0,
      "private owner canonical backfill");
  }
  return Object.freeze({
    baselineRequired: false,
    pending: phase === "predecessor" ? [bridge] : [],
    applied: expected,
    source,
    migrationSourceRef: descriptor.releaseSha ?? null,
    phase,
    savedRows: saved.savedRows,
  });
}

export async function verifyIntegratedMasterDatabase({
  repositoryRoot,
  configPath,
  backupDirectory,
  releaseSha,
  descriptor,
  phase,
  createAdapter = createRecordingDockerAdapter,
}) {
  requireValue(COMMIT.test(releaseSha ?? "")
    && execFileSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() === releaseSha,
  "database verifier release");
  const source = integratedMasterMigrationLedger(repositoryRoot);
  const adapter = await createAdapter({ configPath, backupDirectory });
  const target = await adapter.inspect();
  const [ledger, saved] = await Promise.all([
    adapter.query(ledgerSql).then(JSON.parse),
    phase === "predecessor"
      ? adapter.query(`SELECT jsonb_build_object(
          'savedRows', count(*),
          'bridgeFunctionAbsent', to_regprocedure('public.read_public_youtube_saved_recipe_detail(uuid,uuid)') IS NULL
        ) FROM public.youtube_saved_recipe_results;`).then(JSON.parse)
      : adapter.query(`SELECT jsonb_build_object(
          'savedRows', count(*),
          'canonicalRows', count(*) FILTER (WHERE saved.canonical_recipe_id IS NOT NULL),
          'invalidRows', count(*) FILTER (WHERE recipe.id IS NULL OR recipe.created_by IS DISTINCT FROM saved.owner_user_id OR recipe.visibility <> 'private')
        ) FROM public.youtube_saved_recipe_results AS saved
        LEFT JOIN public.recipes AS recipe ON recipe.id = saved.canonical_recipe_id;`).then(JSON.parse),
  ]);
  return assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger, phase, target, saved });
}

export function parseIntegratedMasterDescriptor(bytes) {
  let descriptor;
  try { descriptor = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new DeploymentError("통합 master 배포 증명 JSON을 읽을 수 없습니다."); }
  requireValue(descriptor?.schema === "homecook.youtube-integrated-master-release.v1", "schema");
  requireValue(descriptor.liveReleaseSha === YOUTUBE_INTEGRATED_LIVE_RELEASE, "live release");
  requireValue(isDeepStrictEqual(descriptor.sourceCommits, [...YOUTUBE_INTEGRATED_SOURCE_COMMITS]), "source commits");
  requireValue(descriptor.database?.beforeLedgerCount === 218
    && descriptor.database?.afterLedgerCount === 219
    && descriptor.database?.migration?.path === YOUTUBE_INTEGRATED_MIGRATION
    && SHA256.test(descriptor.database.migration.sha256 ?? ""), "database transition");
  requireValue(descriptor.worker?.policyVersion === 3
    && descriptor.worker?.credentialGenerationBefore === 46
    && descriptor.worker?.credentialGenerationAfter === 47
    && descriptor.worker?.pipelineIdentity === YOUTUBE_INTEGRATED_PIPELINE_IDENTITY
    && descriptor.worker?.clientVersion === YOUTUBE_INTEGRATED_CLIENT_VERSION
    && descriptor.worker?.verifierVersion === YOUTUBE_INTEGRATED_VERIFIER_VERSION,
  "worker transition");
  requireValue(Array.isArray(descriptor.files) && descriptor.files.length > 0, "file closure");
  const paths = descriptor.files.map((entry) => entry?.path);
  requireValue(paths.every((path) => typeof path === "string" && path.length > 0 && !path.startsWith("/")
      && !path.includes("..") && !path.includes("\\"))
    && new Set(paths).size === paths.length
    && isDeepStrictEqual(paths, [...paths].sort()), "sorted unique file paths");
  for (const entry of descriptor.files) {
    const isSelf = entry.path === YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR;
    requireValue((entry.beforeSha256 === null || SHA256.test(entry.beforeSha256))
      && (isSelf ? entry.afterSha256 === null : SHA256.test(entry.afterSha256 ?? "")),
    `file digest ${entry.path}`);
  }
  requireValue(paths.includes(YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR)
    && paths.includes(YOUTUBE_INTEGRATED_MIGRATION), "required files");
  return Object.freeze(descriptor);
}

export function assertIntegratedMasterDescriptor({
  descriptor,
  liveSha,
  changedFiles,
  readAt,
  isAncestor,
}) {
  requireValue(liveSha === YOUTUBE_INTEGRATED_LIVE_RELEASE, "running web predecessor");
  requireValue(Array.isArray(changedFiles), "changed files");
  const expectedPaths = descriptor.files.map((entry) => entry.path);
  requireValue(isDeepStrictEqual([...changedFiles].sort(), expectedPaths), "complete changed-file closure");
  for (const source of YOUTUBE_INTEGRATED_SOURCE_COMMITS) {
    requireValue(isAncestor(source), `source ancestry ${source}`);
  }
  for (const entry of descriptor.files) {
    if (entry.path === YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR) continue;
    const before = readAt(liveSha, entry.path);
    const after = readAt("target", entry.path);
    requireValue((before === null ? null : sha256(before)) === entry.beforeSha256,
      `predecessor digest ${entry.path}`);
    requireValue(after !== null && sha256(after) === entry.afterSha256,
      `target digest ${entry.path}`);
  }
  const migration = descriptor.files.find((entry) => entry.path === YOUTUBE_INTEGRATED_MIGRATION);
  requireValue(migration?.afterSha256 === descriptor.database.migration.sha256, "migration digest binding");
  const runtime = Buffer.from(readAt("target",
    "lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs") ?? "").toString("utf8");
  const policy = Buffer.from(readAt("target", "lib/server/youtube-async-extraction.ts") ?? "").toString("utf8");
  requireValue(runtime.includes(YOUTUBE_INTEGRATED_CLIENT_VERSION)
    && runtime.includes(YOUTUBE_INTEGRATED_VERIFIER_VERSION)
    && policy.includes(YOUTUBE_INTEGRATED_PIPELINE_IDENTITY), "worker runtime identity");
  return Object.freeze({ descriptor, reviewedFiles: new Set(expectedPaths) });
}

export function reviewedIntegratedMasterReadiness(input) {
  requireValue(input.review?.descriptor, "review descriptor");
  return {
    review: input.review,
    readiness: inheritRound2Readiness({ ...input, files: [], databaseDeployment: false }),
  };
}

export function integratedMasterAppliedDatabaseState(plan, descriptor, releaseSha) {
  requireValue(COMMIT.test(releaseSha ?? ""), "release SHA");
  requireValue(plan?.baselineRequired === false && Array.isArray(plan.pending) && plan.pending.length === 0
    && Array.isArray(plan.applied) && Array.isArray(plan.source)
    && plan.applied.length === descriptor.database.afterLedgerCount
    && isDeepStrictEqual(plan.applied, plan.source), "applied database ledger");
  const migration = plan.applied.at(-1);
  requireValue(migration?.filename === YOUTUBE_INTEGRATED_MIGRATION.replace("supabase/migrations/", "")
    && migration.sha256 === descriptor.database.migration.sha256, "applied bridge migration");
  return Object.freeze({
    changed: true,
    applied: [migration],
    backwardCompatible: false,
    reason: "YouTube canonical bridge DB219 requires the matching integrated web projection; the f970 predecessor can render bridged recipe contents as empty.",
    releaseSha,
    ledgerCount: descriptor.database.afterLedgerCount,
  });
}

