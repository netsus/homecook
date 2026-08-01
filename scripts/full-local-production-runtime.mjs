#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FULL_LOCAL_SECRET_NAMES,
  assertFullLocalComposeModel,
  assertNoSecretLeakage,
  assertSecretRotationAllowed,
  generateFullLocalSecretBundle,
  materializeFullLocalSecrets,
  summarizeFullLocalRuntimeStates,
  validateExternalSecretDirectory,
  validateFullLocalProductionConfig,
} from "./lib/full-local-production-runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INFRA = join(ROOT, "infra/full-local-supabase");
const COMPOSE_FILE = join(INFRA, "docker-compose.production.yml");
const CONFIG_EXAMPLE = join(INFRA, ".env.production.example");
const DEFAULT_CONFIG = join(INFRA, ".env.production.local");
const KEYCHAIN_WRITER = join(INFRA, "keychain-store.exp");
const KEYCHAIN_CHUNK_SIZE = 96;
const KEYCHAIN_MAX_CHUNKS = 128;

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

function hasFlag(args, name) {
  return args.includes(name);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(options.failure ?? `${command} failed.`);
  }
  return result.stdout ?? "";
}

function parseConfig(path) {
  const config = {};
  for (const [index, rawLine] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      fail(`Invalid full-local config at line ${index + 1}.`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    config[match[1]] = value;
  }
  return config;
}

function configPath(args) {
  return resolve(optionValue(args, "--config") ?? DEFAULT_CONFIG);
}

function keychainValue(service, account) {
  return run(
    "security",
    ["find-generic-password", "-s", service, "-a", account, "-w"],
    { failure: `Required Keychain item ${account} is unavailable.` },
  ).trim();
}

function chunkAccount(account, index) {
  return `${account}__${String(index).padStart(3, "0")}`;
}

function countAccount(account) {
  return `${account}__count`;
}

function keychainSecret(service, account) {
  const countValue = keychainValue(service, countAccount(account));
  const count = Number(countValue);
  if (!Number.isSafeInteger(count) || count < 1 || count > KEYCHAIN_MAX_CHUNKS) {
    fail(`Keychain item ${account} has an invalid chunk count.`);
  }
  return Array.from({ length: count }, (_, index) =>
    keychainValue(service, chunkAccount(account, index))).join("");
}

function keychainItemExists(service, account) {
  return spawnSync(
    "security",
    ["find-generic-password", "-s", service, "-a", countAccount(account)],
    { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] },
  ).status === 0;
}

function dockerVolumeExists(name) {
  const result = spawnSync("docker", ["volume", "inspect", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    return true;
  }
  const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/no such volume/iu.test(diagnostic)) {
    return false;
  }
  fail("Docker could not verify whether the persistent PostgreSQL volume exists.");
}

function keychainChunkCount(service, account) {
  if (!keychainItemExists(service, account)) {
    return 0;
  }
  const count = Number(keychainValue(service, countAccount(account)));
  return Number.isSafeInteger(count) && count >= 1 && count <= KEYCHAIN_MAX_CHUNKS
    ? count
    : 0;
}

function storeKeychainValue(service, account, secretPath) {
  run("expect", [KEYCHAIN_WRITER, service, account, secretPath], {
    failure: `Keychain item ${account} could not be stored.`,
  });
}

function deleteKeychainSecret(service, account) {
  const count = keychainChunkCount(service, account);
  for (const item of [
    countAccount(account),
    ...Array.from(
      { length: count },
      (_, index) => chunkAccount(account, index),
    ),
  ]) {
    spawnSync(
      "security",
      ["delete-generic-password", "-s", service, "-a", item],
      { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] },
    );
  }
}

function storeKeychainSecret(directory, service, account, secret) {
  const previousCount = keychainChunkCount(service, account);
  const chunks = [];
  for (let index = 0; index < secret.length; index += KEYCHAIN_CHUNK_SIZE) {
    chunks.push(secret.slice(index, index + KEYCHAIN_CHUNK_SIZE));
  }
  if (chunks.length < 1 || chunks.length > KEYCHAIN_MAX_CHUNKS) {
    fail(`Keychain item ${account} has an unsupported length.`);
  }
  for (const [index, chunk] of chunks.entries()) {
    const path = join(directory, chunkAccount(account, index));
    writeFileSync(path, chunk, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
    storeKeychainValue(service, chunkAccount(account, index), path);
  }
  const countPath = join(directory, countAccount(account));
  writeFileSync(countPath, String(chunks.length), { encoding: "utf8", mode: 0o600 });
  chmodSync(countPath, 0o600);
  storeKeychainValue(service, countAccount(account), countPath);
  for (let index = chunks.length; index < previousCount; index += 1) {
    spawnSync(
      "security",
      ["delete-generic-password", "-s", service, "-a", chunkAccount(account, index)],
      { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] },
    );
  }
}

function composeArgs(runtime, ...args) {
  return [
    "compose",
    "--project-name",
    runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
    "-f",
    COMPOSE_FILE,
    ...args,
  ];
}

function compose(runtime, args) {
  return run("docker", composeArgs(runtime, ...args), {
    env: runtime.env,
    failure: "Full-local Docker Compose operation failed.",
  });
}

function initializeConfig(args) {
  const target = configPath(args);
  if (existsSync(target) && !hasFlag(args, "--replace")) {
    fail(`Full-local config already exists: ${target}`);
  }
  const home = homedir().replaceAll("\\", "\\\\");
  const contents = readFileSync(CONFIG_EXAMPLE, "utf8")
    .replace("/Users/REPLACE_ME", home);
  writeFileSync(target, contents, { encoding: "utf8", mode: 0o600 });
  chmodSync(target, 0o600);
  return target;
}

function baseRuntime(args, { requireSecrets = true } = {}) {
  const path = configPath(args);
  if (!existsSync(path)) {
    fail(`Full-local config does not exist: ${path}`);
  }
  const config = parseConfig(path);
  const service = config.FULL_LOCAL_KEYCHAIN_SERVICE;
  if (!service) {
    fail("FULL_LOCAL_KEYCHAIN_SERVICE is required.");
  }
  const secrets = requireSecrets
    ? Object.fromEntries(FULL_LOCAL_SECRET_NAMES.map((name) => [
        name,
        keychainSecret(service, name),
      ]))
    : {};
  return { config, configPath: path, secrets, service };
}

function validateAndMaterialize(args) {
  const runtime = baseRuntime(args);
  const secretDirectory = validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: runtime.config.FULL_LOCAL_SECRET_DIR,
  });
  materializeFullLocalSecrets({
    readSecret: (name) => runtime.secrets[name],
    targetDirectory: secretDirectory,
  });
  const validation = validateFullLocalProductionConfig({
    config: runtime.config,
    configFileMode: statSync(runtime.configPath).mode,
    secretDirectoryMode: statSync(secretDirectory).mode,
    secrets: runtime.secrets,
  });
  const env = { ...process.env, ...runtime.config };
  delete env.DOCKER_DEFAULT_PLATFORM;
  const composed = run(
    "docker",
    [
      "compose",
      "--project-name",
      runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
      "-f",
      COMPOSE_FILE,
      "config",
      "--format",
      "json",
    ],
    { env, failure: "Full-local Compose configuration is invalid." },
  );
  assertFullLocalComposeModel(JSON.parse(composed));
  assertNoSecretLeakage({
    artifacts: [composed, readFileSync(runtime.configPath, "utf8")],
    secrets: Object.values(runtime.secrets),
  });
  return Object.freeze({ ...runtime, env, validation });
}

function bootstrapSecrets(args) {
  const runtime = baseRuntime(args, { requireSecrets: false });
  const replace = hasFlag(args, "--replace");
  assertSecretRotationAllowed({
    postgresVolumeExists: dockerVolumeExists(
      runtime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
    ),
    replace,
  });
  const existing = FULL_LOCAL_SECRET_NAMES.filter((name) =>
    keychainItemExists(runtime.service, name));
  if (existing.length > 0 && !replace) {
    fail(
      `Keychain already has ${existing.length} full-local items; use --replace only for an intentional rotation.`,
    );
  }
  const secrets = generateFullLocalSecretBundle();
  const secretDirectory = validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: runtime.config.FULL_LOCAL_SECRET_DIR,
  });
  materializeFullLocalSecrets({
    readSecret: (name) => secrets[name],
    targetDirectory: secretDirectory,
  });
  const stagingDirectory = mkdtempSync(
    join(tmpdir(), "homecook-keychain-staging-"),
  );
  chmodSync(stagingDirectory, 0o700);
  const previous = replace
    ? Object.fromEntries(FULL_LOCAL_SECRET_NAMES.map((name) => [
        name,
        keychainSecret(runtime.service, name),
      ]))
    : null;
  try {
    for (const name of FULL_LOCAL_SECRET_NAMES) {
      storeKeychainSecret(
        stagingDirectory,
        runtime.service,
        name,
        secrets[name],
      );
    }
    for (const name of FULL_LOCAL_SECRET_NAMES) {
      if (keychainSecret(runtime.service, name) !== secrets[name]) {
        fail(`Keychain verification failed for ${name}.`);
      }
    }
  } catch (error) {
    if (previous) {
      for (const name of FULL_LOCAL_SECRET_NAMES) {
        storeKeychainSecret(
          stagingDirectory,
          runtime.service,
          name,
          previous[name],
        );
      }
    } else {
      for (const name of FULL_LOCAL_SECRET_NAMES) {
        deleteKeychainSecret(runtime.service, name);
      }
    }
    throw error;
  } finally {
    rmSync(stagingDirectory, { force: true, recursive: true });
  }
  return FULL_LOCAL_SECRET_NAMES.length;
}

function runtimeStatus(runtime) {
  const containers = compose(runtime, ["ps", "--all", "--quiet"])
    .trim().split("\n").filter(Boolean);
  const states = containers.map((container) => JSON.parse(run(
    "docker",
    ["inspect", "--format", "{{json .State}}", container],
    { env: runtime.env },
  )));
  return summarizeFullLocalRuntimeStates(states);
}

async function waitForRuntimeHealthy(runtime, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = runtimeStatus(runtime);
    if (status.healthy) {
      return status;
    }
    if (status.exited) {
      fail("A full-local runtime container exited before startup completed.");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  fail("Full-local runtime did not become healthy within 180 seconds.");
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init-config":
      print({ config: initializeConfig(args), status: "PASS" });
      break;
    case "bootstrap-secrets":
      print({ secret_count: bootstrapSecrets(args), status: "PASS" });
      break;
    case "validate": {
      const runtime = validateAndMaterialize(args);
      print({ ...runtime.validation, status: "PASS" });
      break;
    }
    case "start": {
      const runtime = validateAndMaterialize(args);
      compose(runtime, ["up", "-d"]);
      const status = await waitForRuntimeHealthy(runtime);
      print({ ...status, status: "PASS" });
      break;
    }
    case "status": {
      const runtime = validateAndMaterialize(args);
      const status = runtimeStatus(runtime);
      print({ ...status, status: status.healthy ? "PASS" : "BLOCKED" });
      if (!status.healthy) {
        process.exitCode = 2;
      }
      break;
    }
    case "stop": {
      const runtime = validateAndMaterialize(args);
      compose(runtime, ["stop"]);
      print({ preserved_named_volumes: true, status: "PASS" });
      break;
    }
    default:
      fail(`Unknown command: ${command ?? "<missing>"}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: error instanceof Error ? error.message : "Unknown failure.",
    status: "FAIL",
  })}\n`);
  process.exit(1);
});
