#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertProductionComposeModel,
  assertRestoreAllowed,
  evaluateCapacityPreflight,
  planOrderedRecovery,
  validateHybridProductionConfig,
  validateSemanticRestoreEvidence,
} from "./lib/hybrid-production-runtime.mjs";

const composeFile =
  "infra/hybrid-supabase/docker-compose.production.yml";
const composeText = readFileSync(composeFile, "utf8");

function secret(label) {
  return `${label}-${randomBytes(32).toString("base64url")}`;
}

function legacyJwt(role, legacySecret) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1_000) + 10 * 365 * 24 * 60 * 60,
    iat: Math.floor(Date.now() / 1_000) - 60,
    iss: "supabase",
    role,
  });
  const signature = createHmac("sha256", legacySecret)
    .update(`${header}.${payload}`, "utf8")
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function expectFailure(action, label) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`${label} did not fail closed.`);
}

const { publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const storageLegacySecret = secret("storage-legacy");
const combinedJwks = JSON.stringify({
  keys: [
    {
      ...publicKey.export({ format: "jwk" }),
      alg: "ES256",
      kid: "hybrid-production-artifact-key",
      use: "sig",
    },
    {
      alg: "HS256",
      k: Buffer.from(storageLegacySecret, "utf8").toString("base64url"),
      kid: "hybrid-production-local-key",
      kty: "oct",
      use: "sig",
    },
  ],
});
const config = {
  AUTH_SUPABASE_EXPECTED_ISSUER:
    "https://artifact-check.supabase.co/auth/v1",
  AUTH_SUPABASE_JWKS_URL:
    "https://artifact-check.supabase.co/auth/v1/.well-known/jwks.json",
  AUTH_SUPABASE_URL: "https://artifact-check.supabase.co",
  HOMECOOK_DATA_AUTHORITY: "remote",
  HOMECOOK_HYBRID_BACKUP_KEY_ID:
    "homecook-hybrid-artifact-backup-key-v1",
  HOMECOOK_HYBRID_GATEWAY_PORT: "54381",
  HOMECOOK_HYBRID_SECRET_SOURCE: "process-env",
  HYBRID_COMPOSE_PROJECT_NAME: "homecook-hybrid-artifact-check",
  HYBRID_DOCKER_PLATFORM: ["aarch64", "arm64"].includes(
    spawnSync(
      "docker",
      ["info", "--format", "{{.Architecture}}"],
      { cwd: process.cwd(), encoding: "utf8" },
    ).stdout.trim(),
  ) ? "linux/arm64" : "linux/amd64",
  HYBRID_GATEWAY_TIMEOUT_MS: "3000",
  HYBRID_POSTGRES_DB: "postgres",
  HYBRID_POSTGRES_VOLUME_NAME:
    "homecook-hybrid-artifact-postgres",
  HYBRID_STORAGE_FILE_SIZE_LIMIT: "52428800",
  HYBRID_STORAGE_GLOBAL_BUCKET: "homecook-hybrid",
  HYBRID_STORAGE_TENANT_ID: "homecook-hybrid",
  HYBRID_STORAGE_VOLUME_NAME:
    "homecook-hybrid-artifact-storage",
};
const secrets = {
  AUTH_SUPABASE_PUBLISHABLE_KEY: secret("auth-publishable"),
  DATA_SUPABASE_PUBLISHABLE_KEY:
    legacyJwt("anon", storageLegacySecret),
  DATA_SUPABASE_SECRET_KEY:
    legacyJwt("service_role", storageLegacySecret),
  HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
    secret("attestation"),
  HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
    secret("binding"),
  HYBRID_COMBINED_JWKS: combinedJwks,
  HYBRID_POSTGRES_PASSWORD: secret("postgres"),
  HYBRID_STORAGE_LEGACY_JWT_SECRET: storageLegacySecret,
};
const validation = validateHybridProductionConfig({
  config,
  secrets,
  configFileMode: 0o600,
});
const composeEnv = {
  ...process.env,
  ...config,
  ...secrets,
};
delete composeEnv.DOCKER_DEFAULT_PLATFORM;
const compose = spawnSync(
  "docker",
  ["compose", "-f", composeFile, "config", "--format", "json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: composeEnv,
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (compose.status !== 0) {
  throw new Error("Production Compose config validation failed.");
}
const composeModel = JSON.parse(compose.stdout);
assertProductionComposeModel(composeModel);

const cliFixtureDirectory = mkdtempSync(
  join(tmpdir(), "homecook-hybrid-artifact-"),
);
const cliFixtureConfig = join(cliFixtureDirectory, "runtime.env");
writeFileSync(
  cliFixtureConfig,
  Object.entries(config)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
chmodSync(cliFixtureConfig, 0o600);
const cliEnv = {
  ...composeEnv,
  HOMECOOK_HYBRID_BACKUP_KEY: secret("separate-backup"),
};

function runCli(args, expectedStatus = 0) {
  const result = spawnSync(
    "node",
    [
      "scripts/hybrid-production-runtime.mjs",
      ...args,
      "--config",
      cliFixtureConfig,
      "--allow-process-env-secrets",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: cliEnv,
    },
  );
  if (result.status !== expectedStatus) {
    throw new Error("Hybrid production CLI dry-run validation failed.");
  }
  return result;
}

try {
  runCli(["validate"]);
  runCli(["install", "--dry-run"]);
  runCli(["recover", "--dry-run"]);
  runCli(["capacity", "--dry-run"]);
  runCli(["network", "--dry-run"]);
  runCli(["backup", "--dry-run", "--output", "/tmp/dry-run.tar.gz.enc"]);
  runCli([
    "restore",
    "--dry-run",
    "--destructive",
    "--pre-restore-backup",
    "/tmp/dry-run-before.tar.gz.enc",
    "--pre-restore-backup-verified",
  ]);
  runCli([
    "restore",
    "--dry-run",
    "--destructive",
  ], 1);
} finally {
  rmSync(cliFixtureDirectory, { force: true, recursive: true });
}

if (
  composeText.includes("HYBRID_TEST_")
  || composeText.includes("auth-stub")
  || /\btmpfs\s*:/u.test(composeText)
  || /0\.0\.0\.0:/u.test(composeText)
) {
  throw new Error("Production Compose contains an integration-only default.");
}

const missingSecretEnv = { ...composeEnv };
delete missingSecretEnv.HYBRID_POSTGRES_PASSWORD;
const missingSecret = spawnSync(
  "docker",
  ["compose", "-f", composeFile, "config", "--quiet"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: missingSecretEnv,
  },
);
if (missingSecret.status === 0) {
  throw new Error("Production Compose accepted a missing secret.");
}

expectFailure(
  () =>
    validateHybridProductionConfig({
      config,
      secrets: {
        ...secrets,
        DATA_SUPABASE_SECRET_KEY: "replace-me",
      },
      configFileMode: 0o600,
    }),
  "placeholder secret fixture",
);
expectFailure(
  () =>
    assertProductionComposeModel({
      services: {
        gateway: {
          ports: [{
            host_ip: "0.0.0.0",
            published: 54381,
            target: 8080,
          }],
        },
        postgres: {},
        postgrest: {},
        storage: {},
      },
    }),
  "non-loopback port fixture",
);
expectFailure(
  () =>
    assertRestoreAllowed({
      destructive: true,
      preRestoreBackupPath: null,
      preRestoreBackupVerified: false,
    }),
  "backup-free restore fixture",
);
validateSemanticRestoreEvidence({
  phases: [
    "pre-data-schema",
    "hybrid-compatibility-fk-replacement",
    "application-data",
    "post-data-validation",
  ],
  authUsers: 0,
  authUsersResidual: 0,
  publicManifest: {
    source: "fixture-public-digest",
    target: "fixture-public-digest",
  },
  storageManifest: {
    source: "fixture-storage-digest",
    target: "fixture-storage-digest",
  },
});
expectFailure(
  () =>
    validateSemanticRestoreEvidence({
      phases: [
        "pre-data-schema",
        "application-data",
        "hybrid-compatibility-fk-replacement",
        "post-data-validation",
      ],
      authUsers: 0,
      authUsersResidual: 0,
      publicManifest: { source: "a", target: "a" },
      storageManifest: { source: "b", target: "b" },
    }),
  "restore-order fixture",
);
expectFailure(
  () =>
    validateSemanticRestoreEvidence({
      phases: [
        "pre-data-schema",
        "hybrid-compatibility-fk-replacement",
        "application-data",
        "post-data-validation",
      ],
      authUsers: 1,
      authUsersResidual: 0,
      publicManifest: { source: "a", target: "a" },
      storageManifest: { source: "b", target: "b" },
    }),
  "auth.users residual fixture",
);
expectFailure(
  () =>
    validateSemanticRestoreEvidence({
      phases: [
        "pre-data-schema",
        "hybrid-compatibility-fk-replacement",
        "application-data",
        "post-data-validation",
      ],
      authUsers: 0,
      authUsersResidual: 0,
      publicManifest: { source: "a", target: "other" },
      storageManifest: { source: "b", target: "b" },
    }),
  "manifest mismatch fixture",
);
const orderedRecoveryPlan = planOrderedRecovery({
  postgres: "not-started",
  postgrest: "not-started",
  storage: "not-started",
  gateway: "not-started",
});
expectFailure(
  () =>
    planOrderedRecovery({
      postgres: "healthy",
      postgrest: "unhealthy",
      storage: "healthy",
      gateway: "not-started",
    }),
  "unhealthy dependency fixture",
);
const idempotentPlan = planOrderedRecovery({
  postgres: "healthy",
  postgrest: "healthy",
  storage: "healthy",
  gateway: "healthy",
});
const capacity = evaluateCapacityPreflight({
  dataBytes: 4 * 1024 ** 2,
  freeBytes: 120 * 1024 ** 3,
});
if (!capacity.pass) {
  throw new Error("Capacity dry-run fixture unexpectedly failed.");
}
if (
  orderedRecoveryPlan.join(",") !== "start:postgres,wait:postgres"
  || idempotentPlan.length !== 0
) {
  throw new Error("Ordered recovery dry-run fixture failed.");
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  checks: {
    backup_restore_dry_run: "PASS",
    capacity_preflight_dry_run: "PASS",
    cli_commands: "PASS",
    compose_config: "PASS",
    fail_closed_env: "PASS",
    idempotent_recovery: idempotentPlan.length === 0 ? "PASS" : "FAIL",
    network_loopback_fixture: "PASS",
    ordered_recovery_dry_run:
      orderedRecoveryPlan.join(",") === "start:postgres,wait:postgres"
        ? "PASS"
        : "FAIL",
  },
  authority: validation.authority,
  gateway_port: validation.gatewayPort,
  evidence_scope: "deterministic-production-artifact-dry-run",
  production_writes: 0,
  remote_db_writes: 0,
  remote_storage_writes: 0,
  cutover_writes: 0,
  manual_gates_remaining: [
    "mac-reboot-ordered-recovery-live",
    "off-mac-encrypted-restore-live",
    "capacity-final-preflight-live",
    "24h-local-shadow",
    "google-naver-kakao-live-oauth",
    "final-cutover",
  ],
})}\n`);
