#!/usr/bin/env node

/** Exact 213 -> 215 controlled DB driver for release c51d53871. */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  createRecordingDockerAdapter,
  durableJson,
  privatePath,
  withRecordingInvocation,
} from "./lib/marketing-round2-controlled-deploy.mjs";
import {
  assertEnqueueClosureEvidence,
  LIVE_CATALOG_FINGERPRINT,
  LIVE_PIPELINE_IDENTITY,
  LIVE_POLICY_SNAPSHOT_DIGEST,
  MIGRATIONS,
  TARGET_CATALOG_FINGERPRINT,
} from "./lib/prelaunch-youtube-resolution-contract.mjs";
import {
  assertYoutubeResolutionDbPoststate,
  assertYoutubeResolutionLockedPrestate,
  buildYoutubeResolutionDbPlan,
  YOUTUBE_RESOLUTION_BASELINE_FUNCTION_SQL,
  YOUTUBE_RESOLUTION_DB_CONFIRMATION,
  YOUTUBE_RESOLUTION_DB_LOCK_SQL,
  YOUTUBE_RESOLUTION_POSTGRES_MAJOR,
  YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID,
} from "./lib/prelaunch-youtube-resolution-db-plan.mjs";
import { YOUTUBE_RESOLUTION_FUNCTION_EVIDENCE_SQL } from "./lib/prelaunch-youtube-resolution-readiness.mjs";
import { buildYoutubeExtractionWorkerPolicySnapshotDigest } from "./lib/youtube-extraction-worker-artifact.mjs";
import { readPinnedLocalDockerTarget } from "./lib/local-supabase-isolated-runtime.mjs";
import { parseLaunchctlPrintStatus } from "./lib/youtube-extraction-worker-ops.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, "..");
const RELEASE_SHA = "c51d53871f31c7840fe24792b46b191ca963b11b";
const CONFIG_PATH = "/Users/cwj/.homecook/config/full-local-production.env";
const OPERATION_DIR = "/Users/cwj/.homecook/operations/youtube-resolution-20261010";
const BACKUP_DIR = path.join(OPERATION_DIR, "db-backup");
const PREPARE_PATH = path.join(OPERATION_DIR, "db-prepare.json");
const BEFORE_PATH = path.join(OPERATION_DIR, "db-before.json");
const FINAL_PLAN_PATH = path.join(OPERATION_DIR, "db-final-plan.json");
const JOURNAL_PATH = path.join(OPERATION_DIR, "db-journal.json");
const RECEIPT_PATH = path.join(OPERATION_DIR, "db-apply-receipt.json");
const ROOT_APPROVAL_PATH = path.join(OPERATION_DIR, "root-approval.json");
const CLOSURE_PATH = path.join(OPERATION_DIR, "enqueue-closure.json");
const BACKUP_CLONE_PATH = "/Users/cwj/.codex/worktrees/youtube-display-release/homecook/.omx/cost-efficient-p5-20261010/backup-clone/backup-clone-evidence.json";
const FUNCTION_AUTHORITY_PATH = "/Users/cwj/.codex/worktrees/youtube-display-release/homecook/.omx/cost-efficient-p5-20261010/stage1-function-authority-normalized-v2.json";
const SOURCE_PROOF_PATH = "/Users/cwj/.codex/worktrees/youtube-display-release/homecook/.omx/cost-efficient-p5-20261010/stage1-source-prepare-v2.json";
const ARTIFACT_PROOF_PATH = "/Users/cwj/.codex/worktrees/youtube-display-release/homecook/.omx/cost-efficient-p5-20261010/stage1-artifact-prepare.json";
const PLATFORM_BACKUP_RESULT_PATH = "/Users/cwj/.homecook/backups/youtube-resolution-20261010/backup-result.json";
const PLATFORM_BACKUP_RESULT_SHA = "ca9a966df4ed030cf5726bb673553f994969bd0040718dfc2d85af8dd459a82c";
const EXPECTED_ARCHIVE_SHA = "4ceb03bb1b2297d0941bc4ac7f82e7f068e641dd83b76eaaca471c49157b4bb3";
const EXPECTED_CLONE_SHA = "4f9c594590308387b0fb35a9dc1d90e4c535f38bcdbffd37e764b17dfce4ef6a";
const EXPECTED_FUNCTION_SHA = "8829b63477325f466007a6b70c83da8df34e86c315057a3f403077f3d66e850a";
const EXPECTED_MIGRATIONS = Object.freeze({
  "20261009200000_youtube_ingredient_resolution.sql": {
    sha256: "2c074b50ef2ab18c542aaa6528919489ce1199dd1db7d31a24f724a3902a8f03",
    header: "-- Keep extracted source text intact while adding reviewed, bounded lookup candidates.\nbegin;\n",
    preservedPrefix: "-- Keep extracted source text intact while adding reviewed, bounded lookup candidates.\n",
  },
  "20261010010000_youtube_saved_ingredient_links.sql": {
    sha256: "c0b15f16e3e036e646e48b34340f5c304a96267c8b0821229346d84ba274f55c",
    header: "begin;\n",
    preservedPrefix: "",
  },
});
const SHA = /^[a-f0-9]{64}$/u;
const PROTECTED_RELATIONS = [
  ["public", "ingredients"], ["public", "nutrition_sources"], ["public", "nutrition_source_items"],
  ["public", "nutrition_profiles"], ["public", "nutrition_values"],
  ["public", "ingredient_nutrition_profiles"], ["public", "youtube_saved_recipe_results"],
];
const requireValue = (value, message) => { if (!value) throw new Error(`YouTube resolution controlled DB: ${message}`); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const lastLine = (value) => String(value).split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
const git = (args, options = {}) => execFileSync("git", ["-C", REPOSITORY_ROOT, ...args], {
  encoding: options.binary ? undefined : "utf8", maxBuffer: 64 * 1024 * 1024,
});

export function stripExactMigrationWrapper(raw, filename) {
  const expected = EXPECTED_MIGRATIONS[filename];
  requireValue(expected && sha256(raw) === expected.sha256, `reviewed migration bytes changed: ${filename}`);
  const header = Buffer.from(expected.header);
  const commit = Buffer.from("commit;\n");
  requireValue(Buffer.isBuffer(raw) && raw.subarray(0, header.length).equals(header)
    && raw.subarray(-commit.length).equals(commit), `exact transaction wrapper changed: ${filename}`);
  const body = raw.subarray(header.length, raw.length - commit.length);
  const payload = Buffer.concat([Buffer.from(expected.preservedPrefix), body]);
  requireValue(payload.length > 0, `empty migration payload: ${filename}`);
  return payload.toString("utf8");
}
function committedBytes(relative) {
  return Buffer.from(git(["show", `${RELEASE_SHA}:${relative}`], { binary: true }));
}

function committedLedger() {
  const names = git(["ls-tree", "--name-only", `${RELEASE_SHA}:supabase/migrations`]).trim().split("\n")
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name)).sort();
  return names.map((filename) => ({ filename, sha256: sha256(committedBytes(`supabase/migrations/${filename}`)) }));
}

function migrationBundle() {
  const ledger = committedLedger();
  requireValue(ledger.length === 215 && isDeepStrictEqual(ledger.slice(213).map((row) => row.filename), MIGRATIONS),
    "release migration closure is not exact 215");
  return ledger.slice(213).map((row) => {
    const raw = committedBytes(`supabase/migrations/${row.filename}`);
    return { ...row, payload: stripExactMigrationWrapper(raw, row.filename) };
  });
}

function relationDigestSql(schema, relation) {
  return `select encode(extensions.digest(convert_to(coalesce(string_agg(row_text,E'\\n' order by row_text),''),'UTF8'),'sha256'),'hex') from (select to_jsonb(t)::text row_text from ${schema}.${relation} t) rows;`;
}

async function preservation(adapter) {
  const result = {};
  const session = typeof adapter.session === "function"
    ? adapter.session(`youtube-resolution-readonly-${randomUUID().slice(0, 8)}`)
    : null;
  try {
    if (session) await session.query("BEGIN READ ONLY; SET LOCAL statement_timeout='60s';", 65_000);
    for (const [schema, relation] of PROTECTED_RELATIONS) {
      try {
        const value = session
          ? lastLine(await session.query(relationDigestSql(schema, relation), 65_000))
          : await adapter.query(relationDigestSql(schema, relation));
        result[`${schema}.${relation}`] = value;
      } catch {
        throw new Error(`Protected relation digest failed: ${schema}.${relation}`);
      }
    }
    if (session) { await session.query("ROLLBACK;", 5_000); await session.close(); }
  } catch (error) {
    session?.stop(); throw error;
  }
  return result;
}

async function collectDatabase(adapter, { post = false } = {}) {
  const rawTarget = await adapter.inspect();
  const target = { ...rawTarget, systemId: rawTarget.database?.systemIdentifier, postgresMajor: rawTarget.database?.major };
  const readiness = JSON.parse(lastLine(await adapter.query(`SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true); SELECT public.read_youtube_extraction_enqueue_readiness();`)));
  const policy = JSON.parse(await adapter.query("SELECT jsonb_build_object('enabled',enabled,'policyVersion',policy_version,'extractorMode',extractor_mode,'pipelineIdentity',pipeline_identity,'resultAffectingOptions',result_affecting_options) FROM private.youtube_extraction_current_policy WHERE policy_key='primary';"));
  const credential = JSON.parse(await adapter.query("SELECT jsonb_build_object('generation',current_generation,'releaseSha',release_sha,'schemaIdentity',schema_identity,'allowedSnapshotDigest',allowed_snapshot_digest,'expiresAt',expires_at) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';"));
  const queue = JSON.parse(await adapter.query("SELECT jsonb_build_object('queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) FROM public.youtube_extraction_jobs;"));
  const permitHeld = await adapter.query("SELECT EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp());") === "t";
  const activeEnqueueSessions = Number(await adapter.query("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state<>'idle' AND query ~ 'enqueue_youtube_extraction_job';"));
  const ai = JSON.parse(await adapter.query("SELECT jsonb_build_object('enabled',coalesce(bool_or(enabled),false),'count',count(*)) FROM private.ingredient_ai_nutrition_settings;"));
  const ledger = JSON.parse(await adapter.query("SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;"));
  const functionEvidence = JSON.parse(await adapter.query(post ? YOUTUBE_RESOLUTION_FUNCTION_EVIDENCE_SQL : YOUTUBE_RESOLUTION_BASELINE_FUNCTION_SQL));
  const synonymCount = Number(await adapter.query("SELECT count(*) FROM public.ingredient_synonyms;"));
  return {
    target, ledger, catalogFingerprint: readiness.catalog_fingerprint, aiAutomaticEnabled: ai.enabled,
    policyVersion: policy.policyVersion, pipelineIdentity: policy.pipelineIdentity,
    snapshotDigest: buildYoutubeExtractionWorkerPolicySnapshotDigest({ extractorMode: policy.extractorMode,
      pipelineIdentity: policy.pipelineIdentity, policyVersion: policy.policyVersion,
      resultAffectingOptions: policy.resultAffectingOptions }),
    credential, queue, permitHeld, activeEnqueueSessions,
    functionEvidence, preservation: await preservation(adapter), synonymCount,
  };
}

function assertBaseline(prestate, ledger) {
  requireValue(prestate.target.systemId === YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID
    && prestate.target.postgresMajor === YOUTUBE_RESOLUTION_POSTGRES_MAJOR
    && isDeepStrictEqual(prestate.ledger, ledger.slice(0, 213))
    && prestate.catalogFingerprint === LIVE_CATALOG_FINGERPRINT
    && prestate.synonymCount === 4146
    && prestate.aiAutomaticEnabled === false && prestate.policyVersion === 3
    && prestate.pipelineIdentity === LIVE_PIPELINE_IDENTITY
    && prestate.snapshotDigest === LIVE_POLICY_SNAPSHOT_DIGEST
    && prestate.credential.generation === 45
    && prestate.credential.releaseSha === "370483030665cb25548c40865544c3b6f4f49cbc"
    && prestate.credential.allowedSnapshotDigest === LIVE_POLICY_SNAPSHOT_DIGEST,
  "live 213 predecessor identity changed");
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  await privatePath(directory, true);
}

function readPinnedJson(file, expectedSha) {
  const bytes = execFileSync("/usr/bin/stat", ["-f", "%p", file], { encoding: "utf8" });
  requireValue(bytes.trim().endsWith("100600") || bytes.trim().endsWith("100400"), `private evidence mode invalid: ${file}`);
  const body = execFileSync("/bin/cat", [file]);
  requireValue(sha256(body) === expectedSha, `private evidence bytes changed: ${file}`);
  return JSON.parse(body);
}

async function verifyPrivateProof(proof, label) {
  requireValue(proof?.path?.startsWith("/") && SHA.test(proof.sha256 ?? ""), `${label} proof shape invalid`);
  await privatePath(proof.path);
  const bytes = await fs.readFile(proof.path);
  requireValue(sha256(bytes) === proof.sha256, `${label} proof bytes changed`);
  return bytes;
}

async function verifyPlatformBackupProof(proof) {
  requireValue(proof?.path === PLATFORM_BACKUP_RESULT_PATH && proof.sha256 === PLATFORM_BACKUP_RESULT_SHA,
    "platform backup proof identity changed");
  const stat = await fs.lstat(proof.path);
  requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o777) === 0o644 && stat.nlink === 1, "platform backup result authority changed");
  const bytes = await fs.readFile(proof.path);
  requireValue(sha256(bytes) === proof.sha256, "platform backup result bytes changed");
}

export function observeYoutubeResolutionWorkerStopped({ uid = process.getuid(), run = spawnSync } = {}) {
  const target = `gui/${uid}/com.homecook.youtube-extraction-worker`;
  const result = run("/bin/launchctl", ["print", target], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = parseLaunchctlPrintStatus({ serviceTarget: target, status: result.status,
    stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  if (parsed.loaded) return false;
  requireValue(parsed.state === "unloaded"
    && (result.status === 113 || /could not find service/iu.test(result.stderr ?? "")),
  "launchd worker stop observation failed ambiguously");
  return true;
}

export function openDedicatedAdminSession(containerId, applicationName) {
  requireValue(/^[a-f0-9]{64}$/u.test(containerId) && /^youtube-resolution-[a-z0-9-]{1,80}$/u.test(applicationName),
    "invalid dedicated admin identity");
  const env = { ...process.env, DOCKER_HOST: readPinnedLocalDockerTarget().docker_host };
  for (const key of ["DOCKER_CONTEXT", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY"]) delete env[key];
  const child = spawn("docker", ["exec", "-i", "-e", `PGAPPNAME=${applicationName}`, containerId,
    "psql", "-h", "/var/run/postgresql", "-p", "5432", "-U", "supabase_admin", "-d", "postgres",
    "-XAtq", "-v", "ON_ERROR_STOP=1"], { env, stdio: ["pipe", "pipe", "pipe"] });
  let pending; let buffer = ""; let exited = false;
  const closed = new Promise((resolveClosed) => {
    child.once("error", () => { exited = true; pending?.reject(new Error("admin session failed; output withheld")); resolveClosed(null); });
    child.once("close", (code) => { exited = true; pending?.reject(new Error("admin session closed; readback required")); resolveClosed(code); });
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", (bytes) => {
    buffer += bytes.toString("utf8");
    if (buffer.length > 4 * 1024 * 1024) { child.kill(); pending?.reject(new Error("admin output limit")); return; }
    if (pending && buffer.includes(`${pending.marker}\n`)) {
      const index = buffer.indexOf(`${pending.marker}\n`); const output = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + pending.marker.length + 1); const task = pending; pending = undefined; task.resolve(output);
    }
  });
  return {
    async query(sql, timeout = 180_000) {
      requireValue(!pending && !exited, "admin session unavailable");
      const marker = `resolution_${randomUUID().replaceAll("-", "")}`; let timer;
      try {
        return await new Promise((resolveQuery, reject) => {
          pending = { marker, resolve: resolveQuery, reject };
          timer = setTimeout(() => { child.kill(); reject(new Error("admin session timeout")); }, timeout);
          child.stdin.write(`${sql}\nSELECT '${marker}';\n`, (error) => {
            if (error) reject(new Error("admin dispatch outcome unknown"));
          });
        });
      } finally { clearTimeout(timer); }
    },
    async close() { child.stdin.end(); return closed; },
    stop() { child.kill(); },
  };
}

function validateRootApproval(record, preparationSha) {
  requireValue(record?.schema === "homecook.youtube-resolution-root-approval.v1" && record.approved === true
    && record.releaseSha === RELEASE_SHA && record.preparationSha256 === preparationSha
    && SHA.test(record.credentialScriptSha256 ?? "")
    && record.credentialGenerationBefore === 45 && record.credentialGenerationAfter === 46
    && Date.parse(record.credentialExpiresAt) <= Date.parse("2026-10-14T17:14:32Z")
    && record.credentialSchemaIdentity === "youtube-extraction-worker-schema-v2"
    && record.credentialSnapshotDigest === LIVE_POLICY_SNAPSHOT_DIGEST
    && isDeepStrictEqual(record.approvedActions, ["issue_generation46", "register_generation46", "install_generation46"])
    && record.samePermissions === true && record.samePolicy === true
    && record.humanApprovalProof?.path?.startsWith("/") && SHA.test(record.humanApprovalProof.sha256 ?? "")
    && record.platformBackupProof?.path === PLATFORM_BACKUP_RESULT_PATH
    && record.platformBackupProof.sha256 === PLATFORM_BACKUP_RESULT_SHA
    && record.previousWorker?.releaseSha === "370483030665cb25548c40865544c3b6f4f49cbc"
    && record.previousWorker?.plistPath?.startsWith("/") && SHA.test(record.previousWorker.plistSha256 ?? "")
    && record.previousWorker.beforeClosureLoaded === true && record.previousWorker.beforeClosureState === "running"
    && record.previousWorker.atInstallLoaded === false && record.previousWorker.atInstallState === "unloaded"
    && typeof record.approvedAt === "string" && Number.isFinite(Date.parse(record.approvedAt)),
  "root approval record is not exact");
}

async function prepare() {
  await ensurePrivateDirectory(OPERATION_DIR); await ensurePrivateDirectory(BACKUP_DIR);
  requireValue(git(["rev-parse", RELEASE_SHA]).trim() === RELEASE_SHA, "release commit unavailable");
  const ledger = committedLedger(); const bundle = migrationBundle();
  const clone = readPinnedJson(BACKUP_CLONE_PATH, EXPECTED_CLONE_SHA);
  const authority = readPinnedJson(FUNCTION_AUTHORITY_PATH, EXPECTED_FUNCTION_SHA);
  const sourceProof = JSON.parse(await fs.readFile(SOURCE_PROOF_PATH, "utf8"));
  const artifactProof = JSON.parse(await fs.readFile(ARTIFACT_PROOF_PATH, "utf8"));
  requireValue(sourceProof.source?.target?.ref === RELEASE_SHA && sourceProof.source.completeDiffCovered === true
    && artifactProof.release_sha === RELEASE_SHA && clone.source_archive_sha256 === EXPECTED_ARCHIVE_SHA
    && authority.releaseSha === RELEASE_SHA && authority.functions?.length === 8,
  "source/artifact/clone/function authority evidence mismatch");
  const adapter = await createRecordingDockerAdapter({ configPath: CONFIG_PATH, backupDirectory: BACKUP_DIR });
  const prestate = await collectDatabase(adapter);
  assertBaseline(prestate, ledger);
  const before = { schema: "homecook.youtube-resolution-db-before.v1", status: "READ_ONLY_PREPARED",
    observedAt: new Date().toISOString(), releaseSha: RELEASE_SHA, prestate };
  await durableJson(BEFORE_PATH, before, true);
  const beforeSha = sha256(await fs.readFile(BEFORE_PATH));
  const preparation = { schema: "homecook.youtube-resolution-db-preparation.v1", status: "PREPARED_READ_ONLY",
    releaseSha: RELEASE_SHA, sourceLedger: ledger,
    migrations: bundle.map((row) => ({ filename: row.filename, sha256: row.sha256 })),
    evidence: {
      dbBefore: { path: BEFORE_PATH, sha256: beforeSha },
      backupClone: { path: BACKUP_CLONE_PATH, sha256: EXPECTED_CLONE_SHA },
      functionAuthority: { path: FUNCTION_AUTHORITY_PATH, sha256: EXPECTED_FUNCTION_SHA },
      sourceProof: { path: SOURCE_PROOF_PATH, sha256: sha256(await fs.readFile(SOURCE_PROOF_PATH)) },
      artifactProof: { path: ARTIFACT_PROOF_PATH, sha256: sha256(await fs.readFile(ARTIFACT_PROOF_PATH)) },
    },
    target: prestate.target, catalogBefore: prestate.catalogFingerprint,
    catalogAfter: TARGET_CATALOG_FINGERPRINT, archiveSha256: clone.source_archive_sha256,
    executeAuthorized: false, productionWrites: 0 };
  await durableJson(PREPARE_PATH, preparation, true);
  return preparation;
}

async function finalize() {
  const preparationBytes = await fs.readFile(PREPARE_PATH); const preparation = JSON.parse(preparationBytes);
  const preparationSha = sha256(preparationBytes);
  const rootApprovalBytes = await fs.readFile(ROOT_APPROVAL_PATH); const rootApproval = JSON.parse(rootApprovalBytes);
  validateRootApproval(rootApproval, preparationSha);
  await verifyPrivateProof(rootApproval.humanApprovalProof, "human approval");
  await verifyPlatformBackupProof(rootApproval.platformBackupProof);
  const closureBytes = await fs.readFile(CLOSURE_PATH); const closure = JSON.parse(closureBytes);
  const sourceProofBytes = await fs.readFile(SOURCE_PROOF_PATH);
  const artifactProofBytes = await fs.readFile(ARTIFACT_PROOF_PATH);
  requireValue(sha256(sourceProofBytes) === preparation.evidence.sourceProof.sha256
    && sha256(artifactProofBytes) === preparation.evidence.artifactProof.sha256,
  "source/artifact proof changed after preparation");
  const sourceProof = JSON.parse(sourceProofBytes);
  const artifactProof = JSON.parse(artifactProofBytes);
  const review = {
    schema: "homecook.prelaunch-youtube-resolution-precutover-authority.v1", from: sourceProof.live.webRef,
    to: RELEASE_SHA, integrationSourceRef: "a23b197bb0306a66bcc0666d94720f07e927d4f4",
    previousMigrationCount: 213, migrationCount: 215, migrations: preparation.migrations,
    sourceBackfill: { filename: "20261009003000_youtube_saved_recipe_result_owner_correction.sql",
      sha256: sourceProof.source.fileHashes["supabase/migrations/20261009003000_youtube_saved_recipe_result_owner_correction.sql"][1] },
    files: sourceProof.source.fileHashes, protectedSources: Object.keys(sourceProof.source.fileHashes).sort(),
    runtimeFiles: sourceProof.runtime.actualFiles,
    artifact: { identitySha256: artifactProof.artifact.identity_sha256 ?? artifactProof.artifact.identitySha256,
      fileSha256: artifactProof.artifact.file_sha256 ?? artifactProof.artifact.fileSha256,
      descriptorFileSha256: artifactProof.descriptor.file_sha256 ?? artifactProof.descriptor.fileSha256,
      expectedSchemaSha256: artifactProof.expected_schema_sha256 },
    previousWorker: rootApproval.previousWorker,
    catalog: { before: LIVE_CATALOG_FINGERPRINT, after: TARGET_CATALOG_FINGERPRINT },
    policy: { version: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST },
    credential: { beforeGeneration: 45, afterGeneration: 46, schemaIdentity: "youtube-extraction-worker-schema-v2", maxTtlSeconds: 604800 },
    proofs: {
      platformBackup: rootApproval.platformBackupProof,
      isolatedRestore: preparation.evidence.backupClone,
      dbBefore: preparation.evidence.dbBefore,
      enqueueClosure: { path: CLOSURE_PATH, sha256: sha256(closureBytes) },
      workerArtifact: { path: artifactProof.artifact.path, sha256: artifactProof.artifact.file_sha256 },
      appDescriptor: { path: artifactProof.descriptor.path, sha256: artifactProof.descriptor.file_sha256 },
    },
  };
  assertEnqueueClosureEvidence(review, closure);
  const clone = readPinnedJson(BACKUP_CLONE_PATH, EXPECTED_CLONE_SHA);
  const authority = readPinnedJson(FUNCTION_AUTHORITY_PATH, EXPECTED_FUNCTION_SHA);
  const adapter = await createRecordingDockerAdapter({ configPath: CONFIG_PATH, backupDirectory: BACKUP_DIR });
  requireValue(observeYoutubeResolutionWorkerStopped(), "worker is still loaded after closure");
  const current = { ...(await collectDatabase(adapter)), workerStopped: true };
  const plan = buildYoutubeResolutionDbPlan({ review, prestate: current, closureEvidence: closure,
    backupCloneEvidence: clone, sourceLedger: preparation.sourceLedger,
    backupArchiveSha256: preparation.archiveSha256, expectedFunctionEvidence: authority.functions });
  const finalPlan = { schema: "homecook.youtube-resolution-db-final-plan.v1", status: "AUTHORIZED_FOR_ROOT_EXECUTION",
    preparation: { path: PREPARE_PATH, sha256: preparationSha },
    rootApproval: { path: ROOT_APPROVAL_PATH, sha256: sha256(rootApprovalBytes) },
    closure: { path: CLOSURE_PATH, sha256: sha256(closureBytes) }, review, plan };
  await durableJson(FINAL_PLAN_PATH, finalPlan, true);
  return finalPlan;
}

export async function sessionJson(session, sql) {
  // json_agg may contain literal newlines between array rows. Keep the entire
  // one-result payload; taking its last line silently discards the array prefix.
  return JSON.parse((await session.query(sql)).trim());
}

async function collectSessionDatabase(session, target, { post = false } = {}) {
  const readiness = await sessionJson(session, `SET LOCAL request.jwt.claims='{"role":"youtube_extraction_worker"}'; SELECT public.read_youtube_extraction_enqueue_readiness(); SET LOCAL request.jwt.claims='';`);
  const policy = await sessionJson(session, "SELECT jsonb_build_object('enabled',enabled,'policyVersion',policy_version,'extractorMode',extractor_mode,'pipelineIdentity',pipeline_identity,'resultAffectingOptions',result_affecting_options) FROM private.youtube_extraction_current_policy WHERE policy_key='primary';");
  const credential = await sessionJson(session, "SELECT jsonb_build_object('generation',current_generation,'releaseSha',release_sha,'schemaIdentity',schema_identity,'allowedSnapshotDigest',allowed_snapshot_digest,'expiresAt',expires_at) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';");
  const queue = await sessionJson(session, "SELECT jsonb_build_object('queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) FROM public.youtube_extraction_jobs;");
  const permitHeld = lastLine(await session.query("SELECT EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp());")) === "t";
  const activeEnqueueSessions = Number(lastLine(await session.query("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state<>'idle' AND query ~ 'enqueue_youtube_extraction_job';")));
  const ai = await sessionJson(session, "SELECT jsonb_build_object('enabled',coalesce(bool_or(enabled),false),'count',count(*)) FROM private.ingredient_ai_nutrition_settings;");
  const ledger = await sessionJson(session, "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;");
  const functionEvidence = await sessionJson(session, post ? YOUTUBE_RESOLUTION_FUNCTION_EVIDENCE_SQL : YOUTUBE_RESOLUTION_BASELINE_FUNCTION_SQL);
  const synonymCount = Number(lastLine(await session.query("SELECT count(*) FROM public.ingredient_synonyms;")));
  const preserved = {};
  for (const [schema, relation] of PROTECTED_RELATIONS) {
    preserved[`${schema}.${relation}`] = lastLine(await session.query(relationDigestSql(schema, relation)));
  }
  return {
    target, ledger, catalogFingerprint: readiness.catalog_fingerprint, aiAutomaticEnabled: ai.enabled,
    policyVersion: policy.policyVersion, pipelineIdentity: policy.pipelineIdentity,
    snapshotDigest: buildYoutubeExtractionWorkerPolicySnapshotDigest({ extractorMode: policy.extractorMode,
      pipelineIdentity: policy.pipelineIdentity, policyVersion: policy.policyVersion,
      resultAffectingOptions: policy.resultAffectingOptions }),
    credential, queue, permitHeld, activeEnqueueSessions,
    functionEvidence, preservation: preserved, synonymCount,
  };
}

async function execute(confirmation) {
  requireValue(confirmation === YOUTUBE_RESOLUTION_DB_CONFIRMATION, "exact confirmation required");
  const finalPlanBytes = await fs.readFile(FINAL_PLAN_PATH); const finalPlan = JSON.parse(finalPlanBytes);
  requireValue(finalPlan.status === "AUTHORIZED_FOR_ROOT_EXECUTION", "final plan is not authorized");
  const preparationBytes = await fs.readFile(finalPlan.preparation.path);
  requireValue(sha256(preparationBytes) === finalPlan.preparation.sha256, "preparation bytes changed");
  const rootApprovalBytes = await fs.readFile(finalPlan.rootApproval.path);
  requireValue(sha256(rootApprovalBytes) === finalPlan.rootApproval.sha256, "root approval bytes changed");
  const rootApproval = JSON.parse(rootApprovalBytes);
  validateRootApproval(rootApproval, finalPlan.preparation.sha256);
  await verifyPrivateProof(rootApproval.humanApprovalProof, "human approval");
  await verifyPlatformBackupProof(rootApproval.platformBackupProof);
  const closureBytes = await fs.readFile(finalPlan.closure.path);
  requireValue(sha256(closureBytes) === finalPlan.closure.sha256, "closure proof bytes changed");
  const closure = JSON.parse(closureBytes);
  assertEnqueueClosureEvidence(finalPlan.review, closure);
  const bundle = migrationBundle();
  const before = JSON.parse(await fs.readFile(BEFORE_PATH));
  return withRecordingInvocation(OPERATION_DIR, async () => {
    // Every guarded retry keeps its own create-only snapshot. Never overwrite
    // or delete a verified snapshot from an earlier rolled-back attempt.
    const backupDirectory = await fs.mkdtemp(path.join(BACKUP_DIR, "attempt-"));
    await fs.chmod(backupDirectory, 0o700);
    const adapter = await createRecordingDockerAdapter({ configPath: CONFIG_PATH, backupDirectory });
    const target = await adapter.inspect();
    const session = openDedicatedAdminSession(target.postgresContainerId, `youtube-resolution-${randomUUID().slice(0, 8)}`);
    let commitDispatched = false; let backup = null;
    try {
      const lockOutput = await session.query(`${YOUTUBE_RESOLUTION_DB_LOCK_SQL.join(";\n")};\nSELECT current_user;`);
      requireValue(lastLine(lockOutput) === "supabase_admin", "mutation session role is not supabase_admin");
      requireValue(observeYoutubeResolutionWorkerStopped(), "worker reloaded before DB lock");
      const locked = { ...(await collectSessionDatabase(session, finalPlan.plan.target)), workerStopped: true };
      assertYoutubeResolutionLockedPrestate(finalPlan.plan, locked);
      const snapshot = lastLine(await session.query("SELECT pg_export_snapshot();"));
      requireValue(/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/u.test(snapshot), "exported snapshot invalid");
      backup = await adapter.backup({ snapshot, timeout: 160_000, target });
      for (const migration of bundle) await session.query(migration.payload);
      await session.query(`INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES ${bundle.map((row) => `(${sqlLiteral(row.filename)},${sqlLiteral(row.sha256)})`).join(",")};`);
      const post = { ...(await collectSessionDatabase(session, finalPlan.plan.target, { post: true })), workerStopped: true };
      post.synonymInsertDelta = post.synonymCount - before.prestate.synonymCount;
      await durableJson(path.join(OPERATION_DIR, `db-poststate-observation-${randomUUID()}.json`), {
        observed: post,
        checks: {
          ledger: isDeepStrictEqual(post.ledger, finalPlan.plan.sourceLedger),
          preservation: isDeepStrictEqual(post.preservation, finalPlan.plan.expectedAfter.preservation),
          functions: isDeepStrictEqual(post.functionEvidence, finalPlan.plan.expectedAfter.functionEvidence),
          policy: post.policyVersion === finalPlan.review.policy.version
            && post.pipelineIdentity === finalPlan.review.policy.pipelineIdentity
            && post.snapshotDigest === finalPlan.review.policy.snapshotDigest,
          quiescence: post.queue.queued === 0 && post.queue.processing === 0
            && post.permitHeld === false && post.activeEnqueueSessions === 0,
          synonym: post.synonymCount === 4147 && post.synonymInsertDelta === 1,
        },
      }, true);
      assertYoutubeResolutionDbPoststate(finalPlan.review, finalPlan.plan, post);
      await durableJson(JOURNAL_PATH, { state: "commit-intent", releaseSha: RELEASE_SHA, backup,
        poststate: post, transactionAtomic: true, dbRollbackPerformed: false });
      commitDispatched = true;
      await session.query("COMMIT;"); await session.close();
      const readback = { ...(await collectDatabase(adapter, { post: true })), workerStopped: true };
      readback.synonymInsertDelta = readback.synonymCount - before.prestate.synonymCount;
      assertYoutubeResolutionDbPoststate(finalPlan.review, finalPlan.plan, readback);
      const receipt = { schema: "homecook.youtube-resolution-db-apply-receipt.v1", status: "applied-verified",
        releaseSha: RELEASE_SHA, migrations: finalPlan.plan.expectedAfter.migrations,
        before: { ledgerCount: 213, catalogFingerprint: LIVE_CATALOG_FINGERPRINT },
        after: { ledgerCount: 215, catalogFingerprint: TARGET_CATALOG_FINGERPRINT },
        aiAutomaticBefore: false, aiAutomaticAfter: false,
        preservationBefore: finalPlan.plan.before.preservation,
        preservationAfter: readback.preservation,
        functionEvidence: readback.functionEvidence, backup,
        transactionAtomic: true, dbRollbackPerformed: false, postCommitReadback: true,
        appliedAt: new Date().toISOString() };
      await durableJson(RECEIPT_PATH, receipt, true);
      await durableJson(JOURNAL_PATH, { ...receipt, state: "committed" });
      await adapter.reloadSchema(randomUUID());
      return receipt;
    } catch (error) {
      session.stop();
      let classification = commitDispatched ? "unknown-after-commit-dispatch" : "rolled-back-by-session-close";
      try {
        const readback = await collectDatabase(adapter);
        if (readback.ledger.length === 213 && readback.catalogFingerprint === LIVE_CATALOG_FINGERPRINT) classification = "not-applied";
        if (readback.ledger.length === 215 && readback.catalogFingerprint === TARGET_CATALOG_FINGERPRINT) classification = "committed-needs-reconcile";
      } catch { /* journal retains unknown outcome */ }
      await durableJson(JOURNAL_PATH, { state: classification, releaseSha: RELEASE_SHA, backup,
        transactionAtomic: true, dbRollbackPerformed: classification === "not-applied",
        error: error instanceof Error ? error.message : "unknown" });
      throw error;
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, confirmation] = process.argv.slice(2);
  if (command === "--prepare" && confirmation === undefined) {
    process.stdout.write(`${JSON.stringify(await prepare(), null, 2)}\n`);
  } else if (command === "--finalize" && confirmation === undefined) {
    process.stdout.write(`${JSON.stringify(await finalize(), null, 2)}\n`);
  } else if (command === "--execute") {
    process.stdout.write(`${JSON.stringify(await execute(confirmation), null, 2)}\n`);
  } else {
    throw new Error(`usage: youtube-resolution-controlled-db.mjs --prepare | --finalize | --execute ${YOUTUBE_RESOLUTION_DB_CONFIRMATION}`);
  }
}
