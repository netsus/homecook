#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  assertRemotePopulationCas,
  buildRemoteIdentityMirrorTransaction,
  buildRemoteIdentityMirrorVerificationSql,
  createRemotePopulationSnapshot,
} from "./lib/hybrid-remote-auth-mirror.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = join(
  ROOT,
  "infra/hybrid-supabase/.env.production.local",
);
const DEFAULT_REMOTE_ENV =
  "/Users/cwj/01_vibe_coding/homecook-mac-production/.env.production.local";
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 100;

function fail(message) {
  throw new Error(message);
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value.`);
  }
  return value;
}

function requiredOption(args, name) {
  const value = optionValue(args, name);
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

function safeName(value, label) {
  if (!SAFE_NAME.test(value)) {
    fail(`${label} is unsafe.`);
  }
  return value;
}

function parseEnvFile(path, requiredNames) {
  if (!existsSync(path)) {
    fail(`Required env file does not exist: ${path}`);
  }
  if ((statSync(path).mode & 0o777) !== 0o600) {
    fail(`Required env file mode must be exactly 0600: ${path}`);
  }
  const values = {};
  for (const [index, rawLine] of readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      fail(`Invalid env syntax at ${path}:${index + 1}.`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (requiredNames.includes(match[1])) {
      values[match[1]] = value;
    }
  }
  for (const name of requiredNames) {
    if (!values[name]) {
      fail(`Required env file is missing ${name}.`);
    }
  }
  return Object.freeze(values);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: [
      options.input === undefined ? "ignore" : "pipe",
      "pipe",
      "pipe",
    ],
  });
  if (result.status !== 0) {
    const knownReason = options.knownFailureReasons?.find((reason) =>
      result.stderr.includes(reason));
    if (knownReason) {
      fail(`${options.failure ?? `${command} failed.`} ${knownReason}.`);
    }
    fail(options.failure ?? `${command} failed.`);
  }
  return result.stdout;
}

function gatewayRunning(project) {
  const output = run(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      "label=com.docker.compose.service=gateway",
      "--format",
      "{{.State}}",
    ],
    { failure: "Production gateway state could not be inspected." },
  ).trim();
  if (!output) {
    fail("Production gateway container is missing.");
  }
  return output.split(/\r?\n/u).some((state) =>
    ["running", "restarting"].includes(state));
}

function next3100Running() {
  return spawnSync(
    "lsof",
    ["-nP", "-iTCP:3100", "-sTCP:LISTEN"],
    { encoding: "utf8" },
  ).status === 0;
}

function assertRuntimePrivate(config) {
  if (
    gatewayRunning(config.HYBRID_COMPOSE_PROJECT_NAME)
    || !next3100Running()
  ) {
    fail(
      "Gateway must remain private and the existing Next 3100 service must remain running.",
    );
  }
}

function psql(target, sql, failure) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      target.container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      target.database,
    ],
    {
      failure,
      input: `${sql.trim()}\n`,
      knownFailureReasons: [
        "remote issuer mismatch",
        "local auth.users must remain empty",
        "account capability must remain legacy",
        "remote identity deletion or recreation detected",
        "remote mirror exact population mismatch",
        "public owner identity epoch anti-join mismatch",
      ],
    },
  );
}

function verifyPrebackup(configPath, archive) {
  if (!isAbsolute(archive)) {
    fail("--prebackup must be an absolute path.");
  }
  const output = run(
    process.execPath,
    [
      "scripts/hybrid-production-runtime.mjs",
      "verify-backup",
      "--archive",
      archive,
      "--against-current",
      "--config",
      configPath,
    ],
    { failure: "Current complete-v2 prebackup verification failed." },
  );
  const evidence = JSON.parse(output);
  if (
    evidence.status !== "PASS"
    || evidence.current_match !== true
    || evidence.auth_users !== 0
    || evidence.auth_users_residual !== 0
    || !SHA256.test(evidence.archive_sha256)
  ) {
    fail("Current complete-v2 prebackup evidence is invalid.");
  }
  return evidence.archive_sha256;
}

function expectedIssuer(remoteUrl) {
  const url = new URL(remoteUrl);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname.replace(/\/+$/u, "") !== ""
  ) {
    fail("NEXT_PUBLIC_SUPABASE_URL must be an exact HTTPS origin.");
  }
  return `${url.origin}/auth/v1`;
}

async function readRemotePopulation(client, issuer) {
  const projectedUsers = [];
  let expectedTotal = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error || !data || !Array.isArray(data.users)) {
      fail("Remote Auth Admin listUsers failed.");
    }
    if (
      page === 1
      && Number.isSafeInteger(data.total)
      && data.total > 0
    ) {
      expectedTotal = data.total;
    }
    const remotePage = data.users;
    projectedUsers.push(...remotePage.map(({
      created_at: createdAt,
      id,
    }) => ({ created_at: createdAt, id })));
    remotePage.fill(null);
    remotePage.length = 0;
    if (
      data.nextPage === null
      || projectedUsers.length === expectedTotal
      || projectedUsers.length < page * PAGE_SIZE
    ) {
      break;
    }
    if (page === MAX_PAGES) {
      fail("Remote Auth pagination exceeded the safe page limit.");
    }
  }
  if (
    expectedTotal !== null
    && projectedUsers.length !== expectedTotal
  ) {
    fail("Remote Auth pagination total changed during one read.");
  }
  return createRemotePopulationSnapshot({
    issuer,
    users: projectedUsers,
  });
}

function parseEvidence(output, snapshot) {
  const line = output.split(/\r?\n/u)
    .find((entry) => entry.startsWith("HOMECOOK_AUTH_MIRROR|"));
  if (!line) {
    fail("Local mirror evidence is missing.");
  }
  const evidence = JSON.parse(
    line.slice("HOMECOOK_AUTH_MIRROR|".length),
  );
  if (
    evidence.authUsers !== 0
    || evidence.capability !== "legacy"
    || evidence.mirrorCount !== snapshot.count
    || evidence.mirrorDigest !== snapshot.digest
    || evidence.remoteCount !== snapshot.count
    || evidence.remoteDigest !== snapshot.digest
    || evidence.publicOwnerAntiJoinCount !== 0
    || evidence.remoteEpochAntiJoinCount !== 0
    || evidence.remoteIdentityDigestMismatchCount !== 0
  ) {
    fail("Local mirror evidence does not match the remote population.");
  }
  return Object.freeze({
    auth_users: evidence.authUsers,
    capability: evidence.capability,
    mirror_count: evidence.mirrorCount,
    mirror_digest: evidence.mirrorDigest,
    public_owner_identity_epoch_anti_join:
      evidence.publicOwnerAntiJoinCount,
    remote_owner_identity_epoch_anti_join:
      evidence.remoteEpochAntiJoinCount,
    remote_identity_digest_mismatch:
      evidence.remoteIdentityDigestMismatchCount,
    remote_count: evidence.remoteCount,
    remote_digest: evidence.remoteDigest,
  });
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/hybrid-remote-auth-mirror.mjs dry-run [options]",
      "  node scripts/hybrid-remote-auth-mirror.mjs apply [options]",
      "  node scripts/hybrid-remote-auth-mirror.mjs verify [options]",
      "",
      "Required:",
      "  --target-container <name> --target-db <name>",
      "  --remote-env <0600 server env file>",
      "  dry-run/apply: --prebackup <current complete-v2 archive>",
      "",
      "Only id and created_at are retained from Auth Admin pages.",
      "The production gateway remains private for every command.",
    ].join("\n") + "\n",
  );
}

async function main() {
  const [command = "--help", ...args] = process.argv.slice(2);
  if (["--help", "-h", "help"].includes(command)) {
    help();
    return;
  }
  if (!["dry-run", "apply", "verify"].includes(command)) {
    fail(`Unsupported command: ${command}`);
  }
  const configPath = resolve(
    optionValue(args, "--config") ?? DEFAULT_CONFIG,
  );
  const remoteEnvPath = resolve(
    optionValue(args, "--remote-env") ?? DEFAULT_REMOTE_ENV,
  );
  const config = parseEnvFile(configPath, [
    "AUTH_SUPABASE_EXPECTED_ISSUER",
    "HYBRID_COMPOSE_PROJECT_NAME",
  ]);
  const remote = parseEnvFile(remoteEnvPath, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const issuer = expectedIssuer(remote.NEXT_PUBLIC_SUPABASE_URL);
  if (issuer !== config.AUTH_SUPABASE_EXPECTED_ISSUER) {
    fail("Remote Auth issuer does not match the local production contract.");
  }
  const target = {
    container: safeName(
      requiredOption(args, "--target-container"),
      "target container",
    ),
    database: safeName(
      requiredOption(args, "--target-db"),
      "target database",
    ),
  };
  assertRuntimePrivate(config);
  const prebackupSha256 = command === "verify"
    ? null
    : verifyPrebackup(
      configPath,
      resolve(requiredOption(args, "--prebackup")),
    );
  const client = createClient(
    remote.NEXT_PUBLIC_SUPABASE_URL,
    remote.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const first = await readRemotePopulation(client, issuer);
  const second = await readRemotePopulation(client, issuer);
  const snapshot = assertRemotePopulationCas(first, second);
  const revision = Math.floor(Date.now() / 1_000);
  const verifiedAt = new Date().toISOString();

  if (command === "verify") {
    const evidence = parseEvidence(
      psql(
        target,
        buildRemoteIdentityMirrorVerificationSql({
          issuer,
          snapshot,
        }),
        "Independent local mirror verification failed.",
      ),
      snapshot,
    );
    assertRuntimePrivate(config);
    print({
      ...evidence,
      gateway_private: true,
      identity_mirror_safe: true,
      next_3100_running: true,
      publication_blockers: [
        "full-hybrid-publication-gates-not-evaluated",
      ],
      publication_safe: false,
      remote_cas_reads: 2,
      status: "VERIFY_PASS_GATEWAY_PRIVATE",
    });
    return;
  }

  const evidence = parseEvidence(
    psql(
      target,
      buildRemoteIdentityMirrorTransaction({
        dryRun: command === "dry-run",
        issuer,
        revision,
        snapshot,
        verifiedAt,
      }),
      command === "dry-run"
        ? "Remote identity mirror dry-run failed."
        : "Remote identity mirror apply failed.",
    ),
    snapshot,
  );
  assertRuntimePrivate(config);
  print({
    ...evidence,
    gateway_private: true,
    identity_mirror_safe: true,
    next_3100_running: true,
    prebackup_sha256: prebackupSha256,
    publication_blockers: [
      "full-hybrid-publication-gates-not-evaluated",
    ],
    publication_safe: false,
    remote_cas_reads: 2,
    status: command === "dry-run"
      ? "DRY_RUN_PASS_GATEWAY_PRIVATE"
      : "APPLY_PASS_GATEWAY_PRIVATE",
  });
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "FAIL",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
