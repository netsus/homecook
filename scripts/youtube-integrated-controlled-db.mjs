#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertIntegratedMasterDatabaseObservation,
  integratedMasterMigrationLedger,
  parseIntegratedMasterDescriptor,
  unwrapIntegratedMigration,
  YOUTUBE_INTEGRATED_MIGRATION,
  YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR,
} from "./lib/prelaunch-integrated-master-readiness.mjs";
import {
  createRecordingDockerAdapter,
  durableJson,
} from "./lib/marketing-round2-controlled-deploy.mjs";

export const YOUTUBE_INTEGRATED_DB_CONFIRMATION = "LOCAL_PRELAUNCH_YOUTUBE_INTEGRATED_DB219_APPLY";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operationRoot = join(homedir(), ".homecook/operations/youtube-integrated-20261013");
const ledgerSql = "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;";
const fail = (message) => { throw new Error(`YouTube integrated DB219: ${message}`); };
const requireValue = (value, message) => { if (!value) fail(message); };
const lastLine = (value) => value.trim().split("\n").filter(Boolean).at(-1) ?? "";
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function parseArgs(argv) {
  const [action, ...rest] = argv;
  requireValue(["plan", "apply"].includes(action), "use plan or apply");
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    requireValue(["--db-config", "--release", "--confirmation"].includes(key)
      && value && !values[key], "invalid or duplicate option");
    values[key] = value;
  }
  requireValue(values["--db-config"] && /^[a-f0-9]{40}$/u.test(values["--release"] ?? ""),
    "--db-config and exact --release are required");
  if (action === "apply") {
    requireValue(values["--confirmation"] === YOUTUBE_INTEGRATED_DB_CONFIRMATION,
      "exact apply confirmation is required");
  } else {
    requireValue(values["--confirmation"] === undefined, "plan does not accept confirmation");
  }
  return { action, configPath: values["--db-config"], releaseSha: values["--release"] };
}

async function observe(adapter, descriptor, source, phase, target, query = (sql) => adapter.query(sql)) {
  const ledger = JSON.parse(lastLine(await query(ledgerSql)));
  const saved = phase === "predecessor"
    ? JSON.parse(lastLine(await query(`SELECT jsonb_build_object(
        'savedRows', count(*),
        'bridgeFunctionAbsent', to_regprocedure('public.read_public_youtube_saved_recipe_detail(uuid,uuid)') IS NULL,
        'queued', (SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued'),
        'processing', (SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='processing'),
        'permitHeld', EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at > clock_timestamp())
      ) FROM public.youtube_saved_recipe_results;`)))
    : JSON.parse(lastLine(await query(`SELECT jsonb_build_object(
        'savedRows', count(*),
        'canonicalRows', count(*) FILTER (WHERE saved.canonical_recipe_id IS NOT NULL),
        'invalidRows', count(*) FILTER (WHERE recipe.id IS NULL OR recipe.created_by IS DISTINCT FROM saved.owner_user_id OR recipe.visibility <> 'private')
      ) FROM public.youtube_saved_recipe_results AS saved
      LEFT JOIN public.recipes AS recipe ON recipe.id = saved.canonical_recipe_id;`)));
  const plan = assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger, phase, target, saved });
  if (phase === "predecessor") {
    requireValue(saved.queued === 0 && saved.processing === 0 && saved.permitHeld === false,
      "worker queue and permit must be drained before DB219");
  }
  return { plan, saved };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  requireValue(process.platform === "darwin", "must run on the local macOS production host");
  const head = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  requireValue(head === options.releaseSha, "repository HEAD differs from --release");
  const descriptor = parseIntegratedMasterDescriptor(
    readFileSync(join(repository, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR)),
  );
  const source = integratedMasterMigrationLedger(repository);
  const bridge = source.at(-1);
  const migrationPath = join(repository, YOUTUBE_INTEGRATED_MIGRATION);
  requireValue(bridge?.filename === YOUTUBE_INTEGRATED_MIGRATION.replace("supabase/migrations/", "")
    && bridge.sha256 === descriptor.database.migration.sha256,
  "migration bytes differ from the release descriptor");
  const payload = unwrapIntegratedMigration(readFileSync(migrationPath));
  mkdirSync(operationRoot, { recursive: true, mode: 0o700 });
  chmodSync(operationRoot, 0o700);
  const operationId = randomUUID();
  const operationDirectory = join(operationRoot, operationId);
  mkdirSync(operationDirectory, { mode: 0o700 });
  const adapter = await createRecordingDockerAdapter({
    configPath: options.configPath,
    backupDirectory: join(operationDirectory, "backup"),
  });
  const target = await adapter.inspect();
  const before = await observe(adapter, descriptor, source, "predecessor", target);
  await durableJson(join(operationDirectory, "prestate.json"), {
    operationId, releaseSha: options.releaseSha, target, migration: bridge,
    inventory: before.saved, ledgerCount: before.plan.applied.length,
  }, true);
  if (options.action === "plan") {
    process.stdout.write(`${JSON.stringify({ ready: true, operationId, releaseSha: options.releaseSha,
      migration: bridge, savedRows: before.saved.savedRows, ledgerBefore: before.plan.applied.length,
      ledgerAfter: source.length, mutationPerformed: false }, null, 2)}\n`);
    return;
  }

  const session = adapter.session(`youtube-integrated-${operationId}`);
  let backup;
  let commitDispatched = false;
  try {
    await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE;
      SET LOCAL lock_timeout='10s';
      SET LOCAL statement_timeout='180s';
      SET LOCAL idle_in_transaction_session_timeout='180s';
      SELECT pg_advisory_xact_lock(104230921, 71013);
      LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE;
      LOCK TABLE public.youtube_saved_recipe_results IN SHARE ROW EXCLUSIVE MODE;`);
    const locked = await observe(adapter, descriptor, source, "predecessor", target,
      (sql) => session.query(sql));
    requireValue(locked.saved.savedRows === before.saved.savedRows,
      "saved-result inventory changed before backup");
    const snapshot = lastLine(await session.query("SELECT pg_export_snapshot();"));
    requireValue(/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/u.test(snapshot), "exported snapshot is invalid");
    backup = await adapter.backup({ snapshot, timeout: 160_000, target });
    requireValue(backup.fullArchiveDecoded === true, "backup restorability check failed");
    await session.query(payload, 180_000);
    await session.query(`INSERT INTO homecook_deploy.migrations(filename,sha256)
      VALUES (${sqlLiteral(bridge.filename)}, ${sqlLiteral(bridge.sha256)});`);
    const post = await observe(adapter, descriptor, source, "applied", target,
      (sql) => session.query(sql));
    requireValue(post.saved.savedRows === before.saved.savedRows,
      "saved-result inventory changed inside DB219 transaction");
    await durableJson(join(operationDirectory, "commit-intent.json"), {
      operationId, releaseSha: options.releaseSha, target, migration: bridge,
      backup, before: before.saved, after: post.saved, transactionAtomic: true,
      rollbackRule: "Do not restore DB independently. Restore the verified backup only with an explicit incident decision; the predecessor web is incompatible after DB219.",
    }, true);
    commitDispatched = true;
    await session.query("COMMIT;", 30_000);
    await session.close();
    await adapter.reloadSchema(operationId);
    const verified = await observe(adapter, descriptor, source, "applied", target);
    requireValue(verified.saved.savedRows === before.saved.savedRows,
      "post-commit saved-result inventory changed");
    const receipt = { status: "committed", operationId, releaseSha: options.releaseSha,
      target, migration: bridge, backup, before: before.saved, after: verified.saved,
      ledgerCount: verified.plan.applied.length, transactionAtomic: true,
      automaticRollbackPerformed: false };
    await durableJson(join(operationDirectory, "receipt.json"), receipt, true);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    if (!commitDispatched) {
      try { await session.query("ROLLBACK;", 5_000); await session.close(); } catch { session.stop(); }
    } else {
      session.stop();
    }
    await durableJson(join(operationDirectory, "failure.json"), {
      status: commitDispatched ? "unknown_after_commit_dispatch" : "rolled_back_before_commit",
      operationId, releaseSha: options.releaseSha, migration: bridge, backup: backup ?? null,
      message: error instanceof Error ? error.message : "unknown failure",
    }, true);
    throw error;
  }
}

await main();
