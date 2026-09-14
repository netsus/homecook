#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_PATH = join(ROOT, "scripts/sql/reconcile-recipe-nutrition-v2-data-20260915.sql");
const CONTAINER = "homecook-full-local-isolated-postgres-1";
const EXPECTED_IDENTITY = "true|homecook-full-local-isolated|postgres";
const mode = process.argv[2] ?? "verify";

if (!["plan", "apply", "verify"].includes(mode)) {
  process.stderr.write("Usage: reconcile-recipe-nutrition-v2-data.mjs <plan|apply|verify>\n");
  process.exit(2);
}

function required(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const identity = required("docker", [
  "inspect", "-f",
  "{{.State.Running}}|{{index .Config.Labels \"com.docker.compose.project\"}}|{{index .Config.Labels \"com.docker.compose.service\"}}",
  CONTAINER,
]);
if (identity !== EXPECTED_IDENTITY) {
  throw new Error(`LOCAL_TARGET_IDENTITY_MISMATCH:${identity}`);
}
if (!existsSync(SQL_PATH)) throw new Error("RECONCILIATION_SQL_MISSING");

function runSql(transactionEnd) {
  return required("docker", [
    "exec", "-i", CONTAINER,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "begin;",
    "-f", "/dev/stdin",
    "-c", transactionEnd,
  ], { input: readFileSync(SQL_PATH, "utf8") });
}

if (mode === "verify" || mode === "plan") {
  const output = runSql("rollback;");
  process.stdout.write(`${JSON.stringify({ mode, status: "verified", output })}\n`);
  process.exit(0);
}

if (process.env.HOMECOOK_NUTRITION_V2_DATA_WRITE_APPROVED !== "1") {
  throw new Error("WRITE_APPROVAL_REQUIRED");
}

const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const backupDirectory = join(homedir(), ".homecook/ops/nutrition-v2-reconcile");
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const backupPath = join(backupDirectory, `before-${timestamp}.sql`);
const backupFd = openSync(backupPath, "wx", 0o600);
const backup = spawnSync("docker", [
  "exec", CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres",
], { cwd: ROOT, stdio: ["ignore", backupFd, "inherit"] });
closeSync(backupFd);
if (backup.status !== 0 || backup.error) throw new Error("FULL_LOCAL_BACKUP_FAILED");
chmodSync(backupPath, 0o600);
if (statSync(backupPath).size <= 0) throw new Error("EMPTY_FULL_LOCAL_BACKUP");
const backupSha256 = await new Promise((resolveHash, reject) => {
  const hash = createHash("sha256");
  const input = createReadStream(backupPath);
  input.on("data", (chunk) => hash.update(chunk));
  input.once("error", reject);
  input.once("end", () => resolveHash(hash.digest("hex")));
});

const applyOutput = runSql("commit;");
process.stdout.write(`${JSON.stringify({
  mode,
  status: "applied",
  backup_path: backupPath,
  backup_sha256: backupSha256,
  output: applyOutput,
})}\n`);
