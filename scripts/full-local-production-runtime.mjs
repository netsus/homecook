#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  FULL_LOCAL_SECRET_NAMES,
  assertFullLocalComposeModel,
  assertNoSecretLeakage,
  assertSecretRotationAllowed,
  buildFullLocalProductCatalogSql,
  generateFullLocalSecretBundle,
  materializeFullLocalSecrets,
  parseFullLocalProductCatalogSqlOutput,
  summarizeFullLocalRuntimeStates,
  selectNewlyStartedFullLocalWriterServices,
  validateExternalSecretDirectory,
  validateFullLocalProductionConfig,
} from "./lib/full-local-production-runtime.mjs";
import {
  buildPlatformServiceSchemaCatalogSql,
  digestPlatformServiceSchemaCatalog,
  buildPlatformBackupAuthentication,
  buildDockerStorageVolumeCaptureInvocation,
  buildDockerStorageVolumeRestoreInvocation,
  listStoragePayloadPaths,
  PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
  PLATFORM_BACKUP_KEYCHAIN_SERVICE,
  platformBackupAuthenticationPath,
  verifyPlatformBackupAuthentication,
  verifyStoragePayloadManifest,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import { mapStorageRowsToPayloadReferences } from "./lib/isolated-local-backup-restore-drill.mjs";
import { verifyFullLocalBackupReadiness } from "./lib/full-local-backup-readiness.mjs";
import {
  openFullLocalBackupKeyEscrow,
  signFullLocalBackupKeyRecoveryEvidence,
  verifyFullLocalBackupKeyEscrowBinding,
  verifyFullLocalBackupKeyRecoveryIssuerAttestation,
  withReplacementRestoreAttemptCleanup,
  withRecoveredBackupKeyCreateOnlyRegistration,
} from "./lib/full-local-backup-key-recovery.mjs";
import {
  assertPrivateArtifactParent,
  assertRegularReadinessArtifact,
  authenticateFullLocalBackupArchives,
  fullLocalBackupMetadataSha256,
} from "./lib/full-local-backup-readiness.mjs";
import {
  selectExactFullLocalServiceImages,
  selectFullLocalProductionResources,
} from "./lib/full-local-production-resources.mjs";
import {
  assertFreshRestoreExecutionApproved,
  assertFreshRestoreAllowed,
  assertRestoredStorageVolumeProvenance,
  buildPlatformServiceRestoreAttestation,
  buildBootstrapAwareDatabaseResetSql,
  buildComposeLabeledStorageVolumeCreateArgs,
  buildCutoverPreflight,
  buildPlatformRestoreSql,
  buildSanitizedPlatformData,
  executeBootstrapAwarePlatformRestore,
  verifyRestoredPlatformDataSnapshot,
  compareRestoreReplayManifests,
} from "./lib/full-local-restore-cutover.mjs";
import {
  FULL_LOCAL_OAUTH_KEYCHAIN_ACCOUNTS,
  assertLocalOAuthProvisionApproved,
  materializeFullLocalOAuthSecrets,
  upsertNaverCustomProvider,
  validateFullLocalOAuthConfig,
} from "./lib/full-local-oauth-providers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INFRA = join(ROOT, "infra/full-local-supabase");
const COMPOSE_FILE = join(INFRA, "docker-compose.production.yml");
const OAUTH_COMPOSE_FILE = join(INFRA, "docker-compose.oauth.production.yml");
const CONFIG_EXAMPLE = join(INFRA, ".env.production.example");
const DEFAULT_CONFIG = join(INFRA, ".env.production.local");
const KEYCHAIN_CREATOR = join(INFRA, "keychain-create.exp");
const KEYCHAIN_WRITER = join(INFRA, "keychain-store.exp");
const KEYCHAIN_CHUNK_SIZE = 96;
const KEYCHAIN_MAX_CHUNKS = 128;

export const FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENTS = Object.freeze([
  "authenticated_transaction_read_only",
  "internal_auth_callback_record_v2",
  "internal_auth_callback_renew_v2",
  "internal_youtube_extraction_scope",
  "internal_youtube_extraction_post_session",
  "internal_youtube_extraction_get_cache",
  "internal_youtube_extraction_patch_candidate",
]);

const FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENT_SET = new Set(
  FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENTS,
);

export function buildFullLocalAuthorizationContractCtesSql() {
  return [
    "authorization_function_definitions as (",
    "  select",
    "    coalesce(",
    "      pg_get_functiondef(to_regprocedure('private.verify_full_local_authenticated_authority()')),",
    "      ''",
    "    ) as authenticated_definition,",
    "    coalesce(",
    "      pg_get_functiondef(to_regprocedure('private.verify_full_local_internal_scope()')),",
    "      ''",
    "    ) as internal_definition",
    "),",
    "authorization_markers as (",
    "  select",
    "    position('current_setting(''transaction_read_only'') = ''on''' in authenticated_definition) as authenticated_read_only_position,",
    "    position('v_scope in (''auth-callback'', ''auth-refresh'')' in internal_definition) as auth_callback_scope_position,",
    "    position('v_scope = ''request-authority''' in internal_definition) as request_authority_scope_position,",
    "    position('''/rpc/record_full_local_session_authority_v2''' in internal_definition) as record_v2_position,",
    "    position('''/rpc/assert_and_renew_full_local_session_authority_v2''' in internal_definition) as renew_v2_position,",
    "    position('v_scope = ''youtube-extraction''' in internal_definition) as youtube_scope_position,",
    "    substring(",
    "      internal_definition",
    "      from position('v_scope = ''youtube-extraction''' in internal_definition)",
    "    ) as youtube_definition",
    "  from authorization_function_definitions",
    "),",
    "authorization_checks(requirement_order, requirement_name, present) as (",
    "  select requirement.*",
    "  from authorization_markers as marker",
    "  cross join lateral (values",
    "    (1, 'authenticated_transaction_read_only', marker.authenticated_read_only_position > 0),",
    "    (2, 'internal_auth_callback_record_v2',",
    "      marker.auth_callback_scope_position > 0",
    "      and marker.record_v2_position > marker.auth_callback_scope_position",
    "      and marker.record_v2_position < marker.request_authority_scope_position),",
    "    (3, 'internal_auth_callback_renew_v2',",
    "      marker.auth_callback_scope_position > 0",
    "      and marker.renew_v2_position > marker.auth_callback_scope_position",
    "      and marker.renew_v2_position < marker.request_authority_scope_position),",
    "    (4, 'internal_youtube_extraction_scope', marker.youtube_scope_position > 0),",
    "    (5, 'internal_youtube_extraction_post_session',",
    "      position('v_method = ''POST''' in marker.youtube_definition) > 0",
    "      and position('''/youtube_extraction_sessions''' in marker.youtube_definition)",
    "        between position('v_method = ''POST''' in marker.youtube_definition) + 1",
    "        and position('v_method = ''GET''' in marker.youtube_definition) - 1),",
    "    (6, 'internal_youtube_extraction_get_cache',",
    "      position('v_method = ''GET''' in marker.youtube_definition)",
    "        > position('v_method = ''POST''' in marker.youtube_definition)",
    "      and position(",
    "        '''/youtube_transcript_cache'''",
    "        in substring(marker.youtube_definition from position('v_method = ''GET''' in marker.youtube_definition))",
    "      ) between 1",
    "        and position('v_method = ''PATCH''' in marker.youtube_definition)",
    "          - position('v_method = ''GET''' in marker.youtube_definition) - 1),",
    "    (7, 'internal_youtube_extraction_patch_candidate',",
    "      position('v_method = ''PATCH''' in marker.youtube_definition)",
    "        > position('v_method = ''GET''' in marker.youtube_definition)",
    "      and position(",
    "        '''/youtube_extraction_candidates'''",
    "        in substring(marker.youtube_definition from position('v_method = ''PATCH''' in marker.youtube_definition))",
    "      ) > 0)",
    "  ) as requirement(requirement_order, requirement_name, present)",
    ")",
  ].join("\n");
}

export function buildFullLocalAuthorizationContractSql() {
  return [
    "begin transaction read only;",
    "set local statement_timeout = '5s';",
    "with",
    buildFullLocalAuthorizationContractCtesSql(),
    "select json_build_object(",
    "  'status', case when bool_and(present) then 'PASS' else 'BLOCKED' end,",
    "  'missing_requirements', coalesce(",
    "    json_agg(requirement_name order by requirement_order) filter (where not present),",
    "    '[]'::json",
    "  )",
    ")::text",
    "from authorization_checks;",
    "rollback;",
    "",
  ].join("\n");
}

export function parseFullLocalAuthorizationContractSqlOutput(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const invalid = () => fail(
    "Authorization contract gate must return a single safe authorization contract result.",
  );
  if (lines.length !== 1) {
    return invalid();
  }

  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch {
    return invalid();
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || Object.keys(parsed).sort().join("|") !== "missing_requirements|status"
    || !Array.isArray(parsed.missing_requirements)
    || !["PASS", "BLOCKED"].includes(parsed.status)
  ) {
    return invalid();
  }
  const missingRequirements = parsed.missing_requirements;
  if (
    missingRequirements.some((requirement) =>
      typeof requirement !== "string"
      || !FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENT_SET.has(requirement))
    || new Set(missingRequirements).size !== missingRequirements.length
    || FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENTS
      .filter((requirement) => missingRequirements.includes(requirement))
      .some((requirement, index) => requirement !== missingRequirements[index])
    || parsed.status !== (missingRequirements.length === 0 ? "PASS" : "BLOCKED")
  ) {
    return invalid();
  }
  return Object.freeze({
    missingRequirements: Object.freeze([...missingRequirements]),
    status: parsed.status,
  });
}

export function runtimeAuthorizationContractPayload({
  authorizationContractGate,
  productCatalogGate,
}) {
  const authorizationGate = authorizationContractGate ?? {
    missingRequirements: FULL_LOCAL_AUTHORIZATION_CONTRACT_REQUIREMENTS,
    status: "BLOCKED",
  };
  const productPayload = productCatalogGate
    ? runtimeCatalogPayload(productCatalogGate)
    : {
        product_catalog_missing_columns: [],
        product_catalog_missing_functions: [],
        product_catalog_missing_relations: [],
        product_catalog_status: "NOT_RUN",
      };
  return {
    ...productPayload,
    authorization_contract_missing_requirements: authorizationGate.missingRequirements,
    authorization_contract_status: authorizationGate.status,
    status: productCatalogGate?.status === "PASS" && authorizationGate.status === "PASS"
      ? "PASS"
      : "BLOCKED",
  };
}

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

function keychainDirectItemExists(service, account) {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", service, "-a", account],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status === 0) return true;
  if (result.status === 44) return false;
  fail("Recovery could not verify the direct Keychain account safely.");
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

function inspectDockerVolume(name) {
  const output = run("docker", ["volume", "inspect", name], {
    failure: "Docker Storage volume provenance inspection failed.",
  });
  const inspected = JSON.parse(output);
  if (!Array.isArray(inspected) || inspected.length !== 1) {
    fail("Docker Storage volume provenance inspection was ambiguous.");
  }
  return inspected[0];
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

function createKeychainValue(service, account, ownershipToken, secretPath) {
  run("expect", [KEYCHAIN_CREATOR, service, account, ownershipToken, secretPath], {
    failure: `Keychain item ${account} could not be created because it already exists or Keychain rejected it.`,
  });
}

function keychainOwnedDirectValue(service, account, ownershipToken) {
  return run(
    "security",
    [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-G",
      ownershipToken,
      "-w",
    ],
    { failure: "Attempt-owned recovered backup Keychain item is unavailable." },
  ).trim();
}

function deleteOwnedKeychainDirectItem(service, account, ownershipToken) {
  run(
    "security",
    [
      "delete-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-G",
      ownershipToken,
    ],
    { failure: "Attempt-owned recovered backup Keychain item could not be removed." },
  );
}

export function attemptCreatedArtifactIdentity({ attemptToken, path }) {
  const artifact = lstatSync(path);
  if (!artifact.isFile() || artifact.isSymbolicLink()) {
    fail("Attempt-created restore artifact must be a regular file.");
  }
  return Object.freeze({
    attemptToken,
    dev: artifact.dev,
    ino: artifact.ino,
    path,
    sha256: sha256File(path),
    size: artifact.size,
  });
}

function pathEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function removeAttemptCreatedArtifact(expected) {
  const { path } = expected;
  if (!pathEntryExists(path)) return;
  const artifact = lstatSync(path);
  if (
    !artifact.isFile()
    || artifact.isSymbolicLink()
    || artifact.dev !== expected.dev
    || artifact.ino !== expected.ino
    || artifact.size !== expected.size
    || sha256File(path) !== expected.sha256
  ) {
    fail("Attempt-created restore artifact changed type; manual recovery required.");
  }
  assertPrivateArtifactParent(path);
  rmSync(path);
}

export function assertFailedAttemptArtifactsCleared(paths) {
  if (paths.some((path) => pathEntryExists(path))) {
    fail("attempt artifact ownership changed; manual recovery required before retry");
  }
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
    ...(runtime.oauth?.enabled ? ["-f", OAUTH_COMPOSE_FILE] : []),
    ...args,
  ];
}

function compose(runtime, args) {
  return run("docker", composeArgs(runtime, ...args), {
    env: runtime.env,
    failure: "Full-local Docker Compose operation failed.",
  });
}

function composeWithInput(runtime, args, input) {
  return run("docker", composeArgs(runtime, ...args), {
    env: runtime.env,
    failure: "Full-local Docker Compose database operation failed.",
    input,
  });
}

function composeContainerIds(runtime) {
  return compose(runtime, ["ps", "--all", "--quiet"])
    .trim()
    .split("\n")
    .filter(Boolean);
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
  const oauthEnabled = config.FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS === "true";
  const oauthService = config.FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE;
  if (oauthEnabled && !oauthService) {
    fail("FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE is required when social providers are enabled.");
  }
  const oauthSecrets = requireSecrets && oauthEnabled
    ? Object.fromEntries(Object.entries(FULL_LOCAL_OAUTH_KEYCHAIN_ACCOUNTS).map(([
        name,
        account,
      ]) => [name, keychainValue(oauthService, account)]))
    : {};
  return {
    config,
    configPath: path,
    oauthEnabled,
    oauthSecrets,
    oauthService,
    secrets,
    service,
  };
}

function validateAndMaterialize(args) {
  const runtime = baseRuntime(args);
  const secretDirectory = validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: runtime.config.FULL_LOCAL_SECRET_DIR,
  });
  const oauth = validateFullLocalOAuthConfig({
    config: runtime.config,
    secrets: runtime.oauthSecrets,
  });
  if (oauth.enabled) {
    materializeFullLocalOAuthSecrets({
      secrets: runtime.oauthSecrets,
      targetDirectory: secretDirectory,
    });
  }
  materializeFullLocalSecrets({
    additionalExpectedNames: oauth.enabled ? Object.keys(runtime.oauthSecrets) : [],
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
    composeArgs({ ...runtime, oauth }, "config", "--format", "json"),
    { env, failure: "Full-local Compose configuration is invalid." },
  );
  assertFullLocalComposeModel(JSON.parse(composed));
  assertNoSecretLeakage({
    artifacts: [composed, readFileSync(runtime.configPath, "utf8")],
    secrets: [...Object.values(runtime.secrets), ...Object.values(runtime.oauthSecrets)],
  });
  return Object.freeze({ ...runtime, env, oauth, validation });
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
  const containers = composeContainerIds(runtime);
  const states = containers.map((container) => JSON.parse(run(
    "docker",
    ["inspect", "--format", "{{json .State}}", container],
    { env: runtime.env },
  )));
  return summarizeFullLocalRuntimeStates(states);
}

function postgresContainerId(runtime) {
  const container = compose(runtime, ["ps", "--quiet", "postgres"]).trim();
  return container.length > 0 ? container : null;
}

function formatProductCatalogBlockers(gate) {
  return [
    ...gate.missingRelations,
    ...gate.missingColumns,
    ...gate.missingFunctions,
  ].join(", ");
}

function collectFullLocalProductCatalog(containerId) {
  if (!containerId) {
    fail("Full-local PostgreSQL runtime is unavailable.");
  }
  const result = spawnSync("docker", [
    "exec",
    "-i",
    containerId,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
  ], {
    encoding: "utf8",
    input: buildFullLocalProductCatalogSql(),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail("Full-local product catalog gate query failed.");
  }
  try {
    return parseFullLocalProductCatalogSqlOutput(result.stdout ?? "");
  } catch {
    fail("Full-local product catalog gate returned an invalid result.");
  }
}

function collectFullLocalAuthorizationContract(containerId) {
  if (!containerId) {
    fail("Full-local PostgreSQL runtime is unavailable.");
  }
  const result = spawnSync("docker", [
    "exec",
    "-i",
    containerId,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
  ], {
    encoding: "utf8",
    input: buildFullLocalAuthorizationContractSql(),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail("Full-local authorization contract gate query failed.");
  }
  try {
    return parseFullLocalAuthorizationContractSqlOutput(result.stdout ?? "");
  } catch {
    fail("Full-local authorization contract gate returned an invalid result.");
  }
}

function assertFullLocalProductCatalogPass(gate) {
  if (gate.status === "PASS") {
    return true;
  }
  fail(`Full-local product catalog gate blocked runtime readiness: ${formatProductCatalogBlockers(gate)}`);
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

async function waitForServiceHealthy(runtime, service, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const container = compose(runtime, ["ps", "--quiet", service]).trim();
    if (container) {
      const state = JSON.parse(run(
        "docker",
        ["inspect", "--format", "{{json .State}}", container],
        { env: runtime.env },
      ));
      if (state.Status === "exited") {
        fail(`Full-local ${service} exited before becoming healthy.`);
      }
      if (state.Status === "running" && state.Health?.Status === "healthy") {
        return true;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  fail(`Full-local ${service} did not become healthy within 180 seconds.`);
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  const output = run("openssl", ["dgst", "-sha256", "-r", path], {
    failure: "Backup readiness file digest failed.",
  });
  const digest = /^([0-9a-f]{64})\s/u.exec(output)?.[1];
  if (!digest) fail("Backup readiness file digest is invalid.");
  return digest;
}

export function dockerResourceInventory(type, { all = false, execute = run } = {}) {
  const ids = execute(
    "docker",
    type === "container" && all
      ? [type, "ls", "--all", "--quiet"]
      : [type, "ls", "--quiet"],
    { failure: `Docker ${type} inventory listing failed.` },
  ).trim().split("\n").filter(Boolean);
  if (ids.length === 0) return [];
  return JSON.parse(execute("docker", [type, "inspect", ...ids], {
    failure: `Docker ${type} inventory inspection failed.`,
  }) || "[]");
}

function liveFullLocalProductionResources(runtime) {
  return selectFullLocalProductionResources({
    config: runtime.config,
    containers: dockerResourceInventory("container"),
    volumes: dockerResourceInventory("volume"),
  });
}

function configuredFullLocalProductionResources(runtime) {
  return {
    composeProject: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
    postgresContainerName:
      `${runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME}-postgres-1`,
    postgresImage: runtime.config.FULL_LOCAL_POSTGRES_IMAGE,
    postgresVolumeName: runtime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
    storageVolumeName: runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
  };
}

async function loadFullLocalBackupReadiness(runtime, resources) {
  const path = runtime.config.FULL_LOCAL_BACKUP_READINESS_PATH;
  if (!path || !isAbsolute(path) || !existsSync(path)) {
    fail("FULL_LOCAL_BACKUP_READINESS_PATH must reference existing readiness evidence.");
  }
  const readinessPath = assertRegularReadinessArtifact(path);
  assertPrivateArtifactParent(readinessPath);
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(readinessPath),
  });
  const evidenceStat = statSync(readinessPath);
  if (!evidenceStat.isFile() || (evidenceStat.mode & 0o777) !== 0o600) {
    fail("Full-local backup readiness evidence must be a mode 0600 file.");
  }
  const backupKey = keychainValue(
    PLATFORM_BACKUP_KEYCHAIN_SERVICE,
    PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
  );
  const authenticationPath = assertRegularReadinessArtifact(
    platformBackupAuthenticationPath(readinessPath),
  );
  assertPrivateArtifactParent(authenticationPath);
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(authenticationPath),
  });
  const readinessBytes = readFileSync(readinessPath);
  verifyPlatformBackupAuthentication({
    archive: readinessPath,
    archiveBytes: readinessBytes,
    authentication: JSON.parse(readFileSync(authenticationPath, "utf8")),
    backupKey,
  });
  const evidence = JSON.parse(readinessBytes.toString("utf8"));
  const keyRecoveryManifestPath = assertRegularReadinessArtifact(
    evidence?.key_recovery?.evidence_path,
  );
  assertPrivateArtifactParent(keyRecoveryManifestPath);
  const keyRecoveryAuthenticationPath = assertRegularReadinessArtifact(
    platformBackupAuthenticationPath(keyRecoveryManifestPath),
  );
  assertPrivateArtifactParent(keyRecoveryAuthenticationPath);
  const keyRecoveryManifestBytes = readFileSync(keyRecoveryManifestPath);
  verifyPlatformBackupAuthentication({
    archive: keyRecoveryManifestPath,
    archiveBytes: keyRecoveryManifestBytes,
    authentication: JSON.parse(readFileSync(keyRecoveryAuthenticationPath, "utf8")),
    backupKey,
  });
  const keyRecoveryManifest = JSON.parse(keyRecoveryManifestBytes.toString("utf8"));
  const escrowEnvelopePath = assertRegularReadinessArtifact(
    keyRecoveryManifest.escrow_envelope_path,
  );
  assertPrivateArtifactParent(escrowEnvelopePath);
  const escrowAuthenticationPath = assertRegularReadinessArtifact(
    platformBackupAuthenticationPath(escrowEnvelopePath),
  );
  assertPrivateArtifactParent(escrowAuthenticationPath);
  const escrowEnvelopeBytes = readFileSync(escrowEnvelopePath);
  verifyPlatformBackupAuthentication({
    archive: escrowEnvelopePath,
    archiveBytes: escrowEnvelopeBytes,
    authentication: JSON.parse(readFileSync(escrowAuthenticationPath, "utf8")),
    backupKey,
  });
  const escrowEnvelope = JSON.parse(escrowEnvelopeBytes.toString("utf8"));
  if (
    escrowEnvelope?.format !== "homecook-full-local-backup-key-escrow-v1"
    || escrowEnvelope?.cipher !== "AES-256-GCM"
    || escrowEnvelope?.kdf !== "scrypt"
  ) {
    fail("Backup key escrow envelope format is invalid.");
  }
  verifyFullLocalBackupKeyRecoveryIssuerAttestation({
    envelope: escrowEnvelope,
    evidence: keyRecoveryManifest,
  });
  if (
    sha256File(keyRecoveryManifestPath) !== evidence.key_recovery.evidence_sha256
    || keyRecoveryManifest.escrow_envelope_path
      !== evidence.key_recovery.escrow_envelope_path
    || keyRecoveryManifest.escrow_envelope_sha256
      !== evidence.key_recovery.escrow_envelope_sha256
  ) {
    fail("Signed backup key recovery evidence does not match readiness.");
  }
  const restoreManifestPath = assertRegularReadinessArtifact(
    evidence?.restore?.manifest_path,
  );
  assertPrivateArtifactParent(restoreManifestPath);
  const restoreAuthenticationPath = assertRegularReadinessArtifact(
    platformBackupAuthenticationPath(restoreManifestPath),
  );
  assertPrivateArtifactParent(restoreAuthenticationPath);
  const restoreManifestBytes = readFileSync(restoreManifestPath);
  verifyPlatformBackupAuthentication({
    archive: restoreManifestPath,
    archiveBytes: restoreManifestBytes,
    authentication: JSON.parse(readFileSync(restoreAuthenticationPath, "utf8")),
    backupKey,
  });
  if (sha256File(restoreManifestPath) !== evidence.restore.manifest_sha256) {
    fail("Signed restore manifest digest does not match readiness evidence.");
  }
  const observedFiles = {};
  const archiveStats = [];
  for (const archivePath of [
    evidence?.backup?.archive_path,
    evidence?.off_mac_copy?.archive_path,
  ]) {
    if (typeof archivePath !== "string" || !isAbsolute(archivePath) || !existsSync(archivePath)) {
      fail("Backup readiness archive or off-Mac copy is unavailable.");
    }
    if (lstatSync(archivePath).isSymbolicLink()) {
      fail("Backup readiness archives must not be symlinks.");
    }
    assertPrivateArtifactParent(archivePath);
    assertPrivateArtifactParent(platformBackupAuthenticationPath(archivePath));
    const archiveStat = statSync(realpathSync(archivePath));
    if (!archiveStat.isFile() || (archiveStat.mode & 0o777) !== 0o600) {
      fail("Backup readiness archives must be regular mode 0600 files.");
    }
    archiveStats.push(archiveStat);
    observedFiles[resolve(archivePath)] = sha256File(archivePath);
  }
  if (archiveStats[0].dev === archiveStats[1].dev) {
    fail("Backup readiness off-Mac copy must remain on a distinct filesystem device.");
  }
  if (
    String(archiveStats[1].dev) !== evidence.key_recovery.archive_device_id
    || archiveStats[1].dev === statSync(escrowEnvelopePath).dev
    || archiveStats[0].dev === statSync(escrowEnvelopePath).dev
  ) {
    fail("Backup key escrow must remain on a medium distinct from the off-Mac archive.");
  }
  verifyFullLocalBackupKeyEscrowBinding({
    archiveDeviceIds: archiveStats.map((stat) => String(stat.dev)),
    manifest: evidence.key_recovery,
    observedDeviceId: String(statSync(escrowEnvelopePath).dev),
    observedPath: escrowEnvelopePath,
    observedSha256: sha256File(escrowEnvelopePath),
  });
  const authenticatedMetadata = await authenticateFullLocalBackupArchives({
    evidence,
    verifyArchive: (archive) => withVerifiedPlatformBackup({
      archive,
      backupKey,
      consume: ({ metadata }) => metadata,
    }),
  });
  if (authenticatedMetadata.components?.data_sha256 !== evidence?.backup?.data_sha256) {
    fail("Authenticated backup metadata does not match readiness evidence.");
  }
  return verifyFullLocalBackupReadiness({
    authenticatedBackupMetadataSha256:
      fullLocalBackupMetadataSha256(authenticatedMetadata),
    evidence,
    evidenceFileMode: evidenceStat.mode & 0o777,
    observedEscrowFiles: {
      [escrowEnvelopePath]: sha256File(escrowEnvelopePath),
    },
    observedFiles,
    production: {
      composeProject: resources.composeProject,
      postgresContainerName: resources.postgresContainerName,
      postgresImage: resources.postgresImage,
      postgresVolumeName: resources.postgresVolumeName,
      storageVolumeName: resources.storageVolumeName,
    },
  });
}

function restoredSemanticManifest(runtime) {
  const sql = String.raw`
    create temporary table homecook_restore_manifest (
      relation text primary key,
      row_count bigint not null,
      row_digest text not null
    );
    do $homecook$
    declare item record;
    begin
      for item in
        select schemaname, tablename
        from pg_catalog.pg_tables
        where schemaname = 'public'
        order by tablename
      loop
        execute format(
          'insert into homecook_restore_manifest(relation, row_count, row_digest) '
          || 'select %L, count(*), md5(coalesce(string_agg(row_text, E''\\n'' order by row_text), '''')) '
          || 'from (select to_jsonb(source_row)::text as row_text from %I.%I source_row) rows',
          item.schemaname || '.' || item.tablename,
          item.schemaname,
          item.tablename
        );
      end loop;
    end
    $homecook$;
    create temporary table homecook_storage_url_references as
    select
      recipe.created_by as owner_uuid,
      regexp_replace(
        split_part(split_part(recipe.thumbnail_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.recipes recipe
    where recipe.thumbnail_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      app_user.id as owner_uuid,
      regexp_replace(
        split_part(split_part(app_user.profile_image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.users app_user
    where app_user.profile_image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      recipe_book.user_id as owner_uuid,
      regexp_replace(
        split_part(split_part(recipe_book.cover_image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.recipe_books recipe_book
    where recipe_book.cover_image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      null::uuid as owner_uuid,
      regexp_replace(
        split_part(split_part(food_product.image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.food_products food_product
    where food_product.image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/';
    create temporary table homecook_storage_references as
    select
      storage_object.bucket_id,
      storage_object.name,
      exists (
        select 1 from homecook_storage_url_references url_reference
        where url_reference.object_key = storage_object.bucket_id || '/' || storage_object.name
      )
      or exists (
        select 1 from public.recipe_image_objects managed_object
        where managed_object.bucket_id = storage_object.bucket_id
          and managed_object.object_path = storage_object.name
      ) as referenced,
      case
        when split_part(storage_object.name, '/', 1)
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else
          not exists (
            select 1 from auth.users auth_user
            where auth_user.id::text = split_part(storage_object.name, '/', 1)
          )
          or exists (
            select 1 from homecook_storage_url_references url_reference
            where url_reference.object_key = storage_object.bucket_id || '/' || storage_object.name
              and url_reference.owner_uuid is not null
              and url_reference.owner_uuid::text <> split_part(storage_object.name, '/', 1)
          )
          or exists (
            select 1 from public.recipe_image_objects managed_object
            where managed_object.bucket_id = storage_object.bucket_id
              and managed_object.object_path = storage_object.name
              and managed_object.owner_uuid::text <> split_part(storage_object.name, '/', 1)
          )
      end as owner_prefix_mismatch
    from storage.objects storage_object;
    select jsonb_build_object(
      'auth_identity_digest', (
        select md5(coalesce(string_agg(value, E'\\n' order by value), ''))
        from (
          select concat_ws('|', id::text, created_at::text, coalesce(email, '')) as value
          from auth.users
          union all
          select concat_ws('|', id::text, user_id::text, provider, provider_id) as value
          from auth.identities
        ) auth_rows
      ),
      'auth_users', (select count(*) from auth.users),
      'auth_identities', (select count(*) from auth.identities),
      'auth_sessions', (select count(*) from auth.sessions),
      'auth_refresh_tokens', (select count(*) from auth.refresh_tokens),
      'auth_flow_state', (select count(*) from auth.flow_state),
      'public_relations', (
        select coalesce(jsonb_agg(to_jsonb(manifest_row) order by relation), '[]'::jsonb)
        from homecook_restore_manifest manifest_row
      ),
      'storage_bucket_digest', (
        select md5(coalesce(string_agg(to_jsonb(bucket_row)::text, E'\\n' order by id), ''))
        from storage.buckets bucket_row
      ),
      'storage_buckets', (select count(*) from storage.buckets),
      'storage_objects', (select count(*) from storage.objects),
      'storage_object_digest', (
        select md5(coalesce(string_agg(
          concat_ws(
            '|',
            bucket_id,
            name,
            coalesce(owner_id::text, ''),
            coalesce((metadata - 'lastModified')::text, ''),
            coalesce(user_metadata::text, '')
          ),
          E'\\n' order by bucket_id, name
        ), ''))
        from storage.objects
      ),
      'storage_referenced_objects', (
        select count(*) from homecook_storage_references where referenced
      ),
      'storage_unreferenced_objects', (
        select count(*) from homecook_storage_references where not referenced
      ),
      'storage_owner_prefix_mismatches', (
        select count(*) from homecook_storage_references where owner_prefix_mismatch
      ),
      'public_users_without_auth', (
        select count(*)
        from public.users app_user
        left join auth.users auth_user on auth_user.id = app_user.id
        where auth_user.id is null
      )
    )::text;
  `;
  const output = composeWithInput(runtime, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "--tuples-only",
    "--no-align",
    "--variable",
    "ON_ERROR_STOP=1",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
  ], sql).trim();
  const parsed = JSON.parse(output.split("\n").at(-1));
  if (
    parsed.auth_sessions !== 0
    || parsed.auth_refresh_tokens !== 0
    || parsed.auth_flow_state !== 0
    || parsed.public_users_without_auth !== 0
    || parsed.storage_unreferenced_objects !== 0
    || parsed.storage_owner_prefix_mismatches !== 0
  ) {
    fail("Restored semantic manifest contains transient Auth rows, missing Storage references, or owner mismatches.");
  }
  return {
    auth_identity_digest: sha256Text(parsed.auth_identity_digest),
    auth_identities: parsed.auth_identities,
    auth_users: parsed.auth_users,
    database_digest: sha256Text(JSON.stringify(parsed.public_relations)),
    public_relation_count: parsed.public_relations.length,
    public_users_without_auth: parsed.public_users_without_auth,
    storage_bucket_count: parsed.storage_buckets,
    storage_digest: sha256Text(
      `${parsed.storage_bucket_digest}\n${parsed.storage_object_digest}`,
    ),
    storage_object_count: parsed.storage_objects,
    storage_owner_prefix_mismatch_count: parsed.storage_owner_prefix_mismatches,
    storage_referenced_object_count: parsed.storage_referenced_objects,
    storage_unreferenced_object_count: parsed.storage_unreferenced_objects,
    transient_promote_count: 0,
  };
}

function writeRestoreManifest({
  archiveSha256,
  attemptToken,
  backupKey,
  createdArtifacts,
  manifestPath,
  metadata,
  runtime,
  semantic,
}) {
  const restoreManifest = {
    ...semantic,
    compose_project: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
    created_at: new Date().toISOString(),
    format: "homecook-full-local-restore-v1",
    fresh_target_attested: true,
    postgres_volume: runtime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
    relation_classification_digest: metadata.manifest.relation_classification_digest,
    restore_execution: "clean-isolated-restore-platform-v1",
    restore_attempt_token: attemptToken,
    source_archive_sha256: archiveSha256,
    source_backup_created_at: metadata.created_at,
    source_data_sha256: metadata.components.data_sha256,
    source_roles_sha256: metadata.components.roles_sha256,
    source_schema_sha256: metadata.components.schema_sha256,
    storage_volume: runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
    unclassified_count: metadata.manifest.unclassified.length,
  };
  const manifestContents = `${JSON.stringify(restoreManifest, null, 2)}\n`;
  writeFileSync(manifestPath, manifestContents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  createdArtifacts.push(attemptCreatedArtifactIdentity({ attemptToken, path: manifestPath }));
  chmodSync(manifestPath, 0o600);
  const authenticationPath = platformBackupAuthenticationPath(manifestPath);
  const authentication = buildPlatformBackupAuthentication({
    archive: manifestPath,
    archiveBytes: Buffer.from(manifestContents, "utf8"),
    backupKey,
  });
  writeFileSync(authenticationPath, `${JSON.stringify(authentication, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  createdArtifacts.push(attemptCreatedArtifactIdentity({ attemptToken, path: authenticationPath }));
  chmodSync(authenticationPath, 0o600);
  return restoreManifest;
}

function restoredPlatformDataSnapshot(runtime, metadata) {
  const restoredDataSql = compose(runtime, [
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "--data-only",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
  ]);
  return verifyRestoredPlatformDataSnapshot({
    restoredDataSql,
    sourceDataSha256: metadata.components.data_sha256,
    sourceRelationClassificationDigest:
      metadata.manifest.relation_classification_digest,
  });
}

function restoredServiceRestoreAttestation(runtime, metadata, serviceImages) {
  if (!metadata.service_restore_attestation) {
    fail("Verified platform backup is missing service restore attestation.");
  }
  const schemaCatalog = composeWithInput(runtime, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "--tuples-only",
    "--no-align",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
  ], buildPlatformServiceSchemaCatalogSql());
  const serviceLedgerSql = compose(runtime, [
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "--data-only",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
    "--table",
    "auth.schema_migrations",
    "--table",
    "storage.migrations",
  ]);
  return buildPlatformServiceRestoreAttestation({
    components: metadata.components,
    expected: metadata.service_restore_attestation,
    schemaCatalogSha256: digestPlatformServiceSchemaCatalog(schemaCatalog.trim()),
    serviceImages,
    serviceLedgers: buildSanitizedPlatformData(serviceLedgerSql).manifest.service_ledgers,
  });
}

function restoredStorageRows(runtime) {
  const sql = `
    select coalesce(json_agg(json_build_object(
      'bucket_id', bucket_id,
      'name', name,
      'version', version::text
    ) order by bucket_id, name), '[]'::json)::text
    from storage.objects;
  `;
  return JSON.parse(composeWithInput(runtime, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "--tuples-only",
    "--no-align",
    "--variable",
    "ON_ERROR_STOP=1",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
  ], sql).trim());
}

function restoreStoragePayloadVolume(runtime, storagePayloadPath) {
  const staging = mkdtempSync(join(tmpdir(), "homecook-storage-volume-restore-"));
  chmodSync(staging, 0o700);
  try {
    writeFileSync(
      join(staging, "storage.payload.tar"),
      readFileSync(storagePayloadPath),
      { mode: 0o600 },
    );
    const volumeName = runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME;
    if (dockerVolumeExists(volumeName)) {
      run("docker", ["volume", "rm", volumeName], {
        env: runtime.env,
        failure: "Fresh full-local Storage volume reset failed.",
      });
    }
    run("docker", buildComposeLabeledStorageVolumeCreateArgs({
      attemptToken: runtime.env.FULL_LOCAL_RESTORE_ATTEMPT_TOKEN,
      composeProject: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
      volumeName,
    }), {
      env: runtime.env,
      failure: "Fresh full-local Storage volume creation failed.",
    });
    assertRestoredStorageVolumeProvenance({
      attemptToken: runtime.env.FULL_LOCAL_RESTORE_ATTEMPT_TOKEN,
      composeProject: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
      inspect: inspectDockerVolume(volumeName),
      volumeName,
    });
    const invocation = buildDockerStorageVolumeRestoreInvocation({
      archiveDirectory: staging,
      volumeName,
    });
    run(invocation.command, invocation.args, {
      env: runtime.env,
      failure: "Verified full-local Storage payload restore failed.",
    });
  } finally {
    rmSync(staging, { force: true, recursive: true });
  }
}

function verifyRestoredStoragePayload(runtime, manifest) {
  const staging = mkdtempSync(join(tmpdir(), "homecook-storage-volume-verify-"));
  chmodSync(staging, 0o700);
  const archiveDirectory = join(staging, "archive");
  const sourceDirectory = join(staging, "snapshot");
  mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
  try {
    const invocation = buildDockerStorageVolumeCaptureInvocation({
      archiveDirectory,
      volumeName: runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
    });
    run(invocation.command, invocation.args, {
      env: runtime.env,
      failure: "Restored full-local Storage payload capture failed.",
    });
    run("tar", [
      "-C",
      sourceDirectory,
      "-xf",
      join(archiveDirectory, "storage.payload.tar"),
    ], { failure: "Restored full-local Storage payload extraction failed." });
    const references = mapStorageRowsToPayloadReferences(
      restoredStorageRows(runtime),
      listStoragePayloadPaths(sourceDirectory),
    );
    verifyStoragePayloadManifest(manifest, {
      references,
      sourceDirectory,
      sourceIdentity: manifest.source_identity,
    });
    return {
      storage_payload_catalog_sha256: manifest.catalog_sha256,
      storage_payload_object_count: manifest.object_count,
      storage_payload_total_bytes: manifest.total_bytes,
      storage_reference_count: references.length,
    };
  } finally {
    rmSync(staging, { force: true, recursive: true });
  }
}

function restoreEvidenceOptions(args, command) {
  const archiveOption = optionValue(args, "--archive");
  const manifestOption = optionValue(args, "--manifest");
  if (!archiveOption || !isAbsolute(archiveOption) || !existsSync(archiveOption)) {
    fail(`${command} requires --archive <absolute existing path>.`);
  }
  if (!manifestOption || !isAbsolute(manifestOption) || !manifestOption.endsWith(".json")) {
    fail(`${command} requires --manifest <absolute external .json path>.`);
  }
  const manifestPath = resolve(manifestOption);
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(manifestPath),
  });
  if (existsSync(manifestPath)) {
    fail("Restore manifest output already exists.");
  }
  if (existsSync(platformBackupAuthenticationPath(manifestPath))) {
    fail("Restore manifest authentication output already exists.");
  }
  return { archive: resolve(archiveOption), manifestPath };
}

function runCutoverPreflight(args) {
  const evidenceOption = optionValue(args, "--evidence");
  if (!evidenceOption || !isAbsolute(evidenceOption) || !existsSync(evidenceOption)) {
    fail("cutover-preflight requires --evidence <absolute existing mode 0600 JSON path>.");
  }
  const evidencePath = resolve(evidenceOption);
  const evidenceStat = statSync(evidencePath);
  if (!evidenceStat.isFile() || (evidenceStat.mode & 0o777) !== 0o600) {
    fail("cutover-preflight evidence must be a regular mode 0600 file.");
  }
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const preflight = buildCutoverPreflight({
    completeStorageBackupVerified: evidence.complete_storage_backup_verified,
    firstLocalMutationApproved:
      optionValue(args, "--confirm-first-local-auth-mutation")
        === "APPROVE_FIRST_LOCAL_PRODUCTION_AUTH_MUTATION",
    offMacRestoreCount: evidence.off_mac_restore_count,
    providerCallbackVerified: evidence.provider_callback_verified,
    remoteOutstandingFlows: evidence.remote_outstanding_flows,
    restoreReplayVerified: evidence.restore_replay_verified,
    storageVerified: evidence.storage_verified,
    temporaryHostedS3CredentialRevoked:
      evidence.temporary_hosted_s3_credential_revoked,
  });
  if (!preflight.ready) {
    fail(`Cutover preflight blocked: ${preflight.blockers.join(", ")}`);
  }
  return {
    ...preflight,
    evidence_path: evidencePath,
    status: "PASS",
  };
}

function writeCanonicalRecoveryManifest({
  archive,
  archiveSha256,
  args,
  attemptToken,
  backupKey,
  createdArtifacts,
  metadata,
  restoreManifest,
}) {
  const output = optionValue(args, "--recovery-manifest");
  const envelopePath = optionValue(args, "--escrow-envelope");
  const issuerKeyPath = optionValue(args, "--recovery-issuer-private-key");
  for (const [label, path] of Object.entries({ output, envelopePath, issuerKeyPath })) {
    if (!path || !isAbsolute(path)) fail(`restore-platform requires --${label} absolute path.`);
  }
  const canonicalEnvelope = assertRegularReadinessArtifact(envelopePath);
  const canonicalIssuerKey = assertRegularReadinessArtifact(issuerKeyPath);
  assertPrivateArtifactParent(canonicalEnvelope);
  assertPrivateArtifactParent(canonicalIssuerKey);
  if (
    statSync(canonicalEnvelope).dev === statSync(archive).dev
    || statSync(canonicalIssuerKey).dev !== statSync(canonicalEnvelope).dev
  ) {
    fail("Recovery issuer key and escrow must share a medium distinct from the archive.");
  }
  const outputPath = resolve(output);
  if (existsSync(outputPath) || existsSync(platformBackupAuthenticationPath(outputPath))) {
    fail("Canonical recovery manifest output already exists.");
  }
  validateExternalSecretDirectory({ repositoryRoot: ROOT, secretDirectory: dirname(outputPath) });
  const envelope = JSON.parse(readFileSync(canonicalEnvelope, "utf8"));
  const unsigned = {
    archive_device_id: String(statSync(archive).dev),
    archive_sha256: archiveSha256,
    clean_restore_verified: restoreManifest.fresh_target_attested === true,
    created_at: new Date().toISOString(),
    escrow_device_id: String(statSync(canonicalEnvelope).dev),
    escrow_envelope_path: canonicalEnvelope,
    escrow_envelope_sha256: sha256File(canonicalEnvelope),
    format: "homecook-full-local-backup-key-recovery-v1",
    isolated_replacement_environment_verified:
      restoreManifest.restore_execution === "clean-isolated-restore-platform-v1",
    keychain_reregistered: true,
    keychain_registration: {
      account: PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
      adapter: "macos-keychain-recovered-key-v1",
      key_sha256: createHash("sha256").update(backupKey).digest("hex"),
    },
    restored_metadata_sha256: fullLocalBackupMetadataSha256(metadata),
    restore_attempt_token: attemptToken,
    restore_manifest_path: resolve(optionValue(args, "--manifest")),
    restore_manifest_sha256: sha256File(resolve(optionValue(args, "--manifest"))),
  };
  const evidence = signFullLocalBackupKeyRecoveryEvidence({
    evidence: unsigned,
    privateKey: readFileSync(canonicalIssuerKey, "utf8"),
  });
  verifyFullLocalBackupKeyRecoveryIssuerAttestation({ envelope, evidence });
  const contents = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(outputPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  createdArtifacts.push(attemptCreatedArtifactIdentity({ attemptToken, path: outputPath }));
  const authentication = buildPlatformBackupAuthentication({
    archive: outputPath,
    archiveBytes: Buffer.from(contents),
    backupKey,
  });
  const authenticationPath = platformBackupAuthenticationPath(outputPath);
  writeFileSync(
    authenticationPath,
    `${JSON.stringify(authentication, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  createdArtifacts.push(attemptCreatedArtifactIdentity({ attemptToken, path: authenticationPath }));
  return evidence;
}

function recoveryManifestOutputPaths(args) {
  const output = optionValue(args, "--recovery-manifest");
  if (!output || !isAbsolute(output)) {
    fail("restore-platform requires --recovery-manifest absolute path.");
  }
  const outputPath = resolve(output);
  const authenticationPath = platformBackupAuthenticationPath(outputPath);
  if (existsSync(outputPath) || existsSync(authenticationPath)) {
    fail("Canonical recovery manifest output already exists.");
  }
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(outputPath),
  });
  return { authenticationPath, outputPath };
}

async function restorePlatformBackup(args) {
  const { archive, manifestPath } = restoreEvidenceOptions(args, "restore-platform");
  assertFreshRestoreExecutionApproved({
    confirmation: optionValue(args, "--confirm-fresh-restore"),
  });

  const runtime = validateAndMaterialize(args);
  const recoveryOutputs = recoveryManifestOutputPaths(args);
  assertFreshRestoreAllowed({
    postgresVolumeExists: dockerVolumeExists(runtime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME),
    storageVolumeExists: dockerVolumeExists(runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME),
  });
  const envelopePath = assertRegularReadinessArtifact(
    optionValue(args, "--escrow-envelope"),
  );
  const credentialPath = assertRegularReadinessArtifact(
    optionValue(args, "--recovery-credential-file"),
  );
  assertPrivateArtifactParent(envelopePath);
  assertPrivateArtifactParent(credentialPath);
  if (statSync(envelopePath).dev !== statSync(credentialPath).dev) {
    fail("Recovery credential and escrow envelope must share the replacement medium.");
  }
  const backupKey = openFullLocalBackupKeyEscrow({
    envelope: JSON.parse(readFileSync(envelopePath, "utf8")),
    recoveryCredential: readFileSync(credentialPath, "utf8").trim(),
  });
  const archiveSha256 = sha256File(archive);
  const createdArtifacts = [];
  const expectedArtifactPaths = [
    manifestPath,
    platformBackupAuthenticationPath(manifestPath),
    recoveryOutputs.outputPath,
    recoveryOutputs.authenticationPath,
  ];

  return withRecoveredBackupKeyCreateOnlyRegistration({
    createItem: (recoveredKey, ownershipToken) => {
      const keyStaging = mkdtempSync(join(tmpdir(), "homecook-recovered-backup-key-"));
      chmodSync(keyStaging, 0o700);
      try {
        const keyPath = join(keyStaging, "recovered.key");
        writeFileSync(keyPath, recoveredKey, { encoding: "utf8", mode: 0o600 });
        createKeychainValue(
          PLATFORM_BACKUP_KEYCHAIN_SERVICE,
          PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
          ownershipToken,
          keyPath,
        );
      } finally {
        rmSync(keyStaging, { force: true, recursive: true });
      }
    },
    deleteOwnedItem: (ownershipToken) => deleteOwnedKeychainDirectItem(
      PLATFORM_BACKUP_KEYCHAIN_SERVICE,
      PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
      ownershipToken,
    ),
    directItemExists: () => keychainDirectItemExists(
      PLATFORM_BACKUP_KEYCHAIN_SERVICE,
      PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
    ),
    execute: async (attemptToken) => {
      let bootstrapServiceImages = null;
      const restoreRuntime = Object.freeze({
        ...runtime,
        env: {
          ...runtime.env,
          FULL_LOCAL_RESTORE_ATTEMPT_TOKEN: attemptToken,
        },
      });
      return withReplacementRestoreAttemptCleanup({
        attemptToken,
        composeProject: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
        createdArtifacts,
        execute: async () => {
          assertFreshRestoreAllowed({
            postgresVolumeExists: dockerVolumeExists(
              restoreRuntime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
            ),
            storageVolumeExists: dockerVolumeExists(
              restoreRuntime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
            ),
          });
          return withVerifiedPlatformBackup({
            archive,
            backupKey,
            consume: async ({
              dataPath,
              metadata,
              rolesPath,
              schemaPath,
              storagePayloadPath,
            }) => executeBootstrapAwarePlatformRestore({
            // GoTrue and Storage bootstrap the exact pinned service-owned roles
            // before the database itself is cleanly recreated from template0.
            bootstrapServices: async () => {
              compose(restoreRuntime, ["up", "-d"]);
              await waitForRuntimeHealthy(restoreRuntime);
              bootstrapServiceImages = selectExactFullLocalServiceImages({
                composeProject: restoreRuntime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
                containers: dockerResourceInventory("container", { all: true }),
                expectedImages: metadata.service_restore_attestation?.service_images,
              });
            },
            replayDatabase: () => composeWithInput(restoreRuntime, [
              "exec",
              "-T",
              "postgres",
              "psql",
              "--single-transaction",
              "--variable",
              "ON_ERROR_STOP=1",
              "--username",
              "supabase_admin",
              "--dbname",
              "postgres",
            ], buildPlatformRestoreSql({
              dataSql: readFileSync(dataPath, "utf8"),
              rolesSql: readFileSync(rolesPath, "utf8"),
              schemaSql: readFileSync(schemaPath, "utf8"),
            })),
            resetDatabase: () => composeWithInput(restoreRuntime, [
              "exec",
              "-T",
              "postgres",
              "psql",
              "--variable",
              "ON_ERROR_STOP=1",
              "--username",
              "supabase_admin",
              "--dbname",
              "template1",
            ], buildBootstrapAwareDatabaseResetSql()),
            restoreStoragePayload: () => restoreStoragePayloadVolume(
              restoreRuntime,
              storagePayloadPath,
            ),
            startPostgres: async () => {
              compose(restoreRuntime, ["up", "-d", "postgres"]);
              await waitForServiceHealthy(restoreRuntime, "postgres");
            },
            verifyRestoreAttestation: () => restoredServiceRestoreAttestation(
              restoreRuntime,
              metadata,
              bootstrapServiceImages,
            ),
            startServices: async () => {
              compose(restoreRuntime, ["up", "-d"]);
              await waitForRuntimeHealthy(restoreRuntime);
            },
            stopServices: () => compose(restoreRuntime, ["down"]),
            verifyResources: () => {
              assertRestoredStorageVolumeProvenance({
                attemptToken: restoreRuntime.env.FULL_LOCAL_RESTORE_ATTEMPT_TOKEN,
                composeProject: restoreRuntime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
                inspect: inspectDockerVolume(restoreRuntime.config.FULL_LOCAL_STORAGE_VOLUME_NAME),
                volumeName: restoreRuntime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
              });
              liveFullLocalProductionResources(restoreRuntime);
            },
            verifyRestoredPlatform: () => {
              const restoreManifest = writeRestoreManifest({
                archiveSha256,
                attemptToken,
                backupKey,
                createdArtifacts,
                manifestPath,
                metadata,
                runtime: restoreRuntime,
                semantic: {
                  ...restoredPlatformDataSnapshot(restoreRuntime, metadata),
                  ...restoredSemanticManifest(restoreRuntime),
                  ...verifyRestoredStoragePayload(restoreRuntime, metadata.storage_payload),
                },
              });
              const recoveryManifest = writeCanonicalRecoveryManifest({
                archive,
                archiveSha256,
                args,
                attemptToken,
                backupKey,
                createdArtifacts,
                metadata,
                restoreManifest,
              });
              return { recovery_manifest: recoveryManifest, restore_manifest: restoreManifest };
            },
            }),
          });
        },
        expectedServices: [
          "api-gateway",
          "auth",
          "auth-proxy",
          "postgres",
          "postgrest",
          "postgrest-probe",
          "storage",
        ],
        expectedVolumes: [
          {
            composeVolume: "postgres-data",
            name: runtime.config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
          },
          {
            composeVolume: "storage-data",
            name: runtime.config.FULL_LOCAL_STORAGE_VOLUME_NAME,
          },
        ],
        inventoryContainers: () => dockerResourceInventory("container", { all: true }),
        inventoryVolumes: () => dockerResourceInventory("volume"),
        removeArtifact: removeAttemptCreatedArtifact,
        removeContainer: (containerId) => run("docker", ["rm", "--force", containerId], {
          failure: "Attempt-owned replacement container could not be removed.",
        }),
        removeVolume: (volumeName) => run("docker", ["volume", "rm", volumeName], {
          failure: "Attempt-owned replacement volume could not be removed.",
        }),
        verifyCleanup: () => assertFailedAttemptArtifactsCleared(expectedArtifactPaths),
      });
    },
    readOwnedItem: (ownershipToken) => keychainOwnedDirectValue(
      PLATFORM_BACKUP_KEYCHAIN_SERVICE,
      PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
      ownershipToken,
    ),
    recoveredKey: backupKey,
    verifyArchive: (recoveredKey) => withVerifiedPlatformBackup({
      archive,
      backupKey: recoveredKey,
      consume: ({ metadata }) => metadata,
    }),
  });
}

function compareRestoreManifests(args) {
  const firstPath = optionValue(args, "--first");
  const secondPath = optionValue(args, "--second");
  const outputPath = optionValue(args, "--manifest");
  for (const [label, path] of Object.entries({ firstPath, secondPath })) {
    if (!path || !isAbsolute(path) || !existsSync(path)) {
      fail(`compare-restore-manifests requires --${label === "firstPath" ? "first" : "second"} <absolute existing .json path>.`);
    }
  }
  if (!outputPath || !isAbsolute(outputPath) || !outputPath.endsWith(".json")) {
    fail("compare-restore-manifests requires --manifest <absolute external .json path>.");
  }
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(resolve(outputPath)),
  });
  if (existsSync(outputPath)) fail("Restore replay comparison output already exists.");
  const first = JSON.parse(readFileSync(firstPath, "utf8"));
  const second = JSON.parse(readFileSync(secondPath, "utf8"));
  const comparison = compareRestoreReplayManifests(first, second);
  const result = {
    ...comparison,
    created_at: new Date().toISOString(),
    format: "homecook-full-local-restore-replay-v1",
    storage_object_count: first.storage_object_count,
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outputPath, 0o600);
  return result;
}

function createLocalSupabaseAdmin(runtime) {
  return createClient(
    runtime.config.FULL_LOCAL_INTERNAL_GATEWAY_URL,
    runtime.secrets.service_role_key,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  ).auth.admin.customProviders;
}

async function provisionOAuthProviders(args) {
  assertLocalOAuthProvisionApproved({
    confirmation: optionValue(args, "--confirm-local-auth-mutation"),
  });
  const runtime = validateAndMaterialize(args);
  if (!runtime.oauth.enabled) {
    fail("Social providers must be enabled before OAuth provisioning.");
  }
  if (!runtimeStatus(runtime).healthy) {
    fail("Full-local runtime must be healthy before OAuth provisioning.");
  }
  const naver = await upsertNaverCustomProvider({
    admin: createLocalSupabaseAdmin(runtime),
    clientId: runtime.oauthSecrets.naver_client_id,
    clientSecret: runtime.oauthSecrets.naver_client_secret,
    siteUrl: runtime.config.FULL_LOCAL_SITE_URL,
  });
  return {
    built_in_providers: ["google", "kakao"],
    custom_provider: naver,
    provider_count: 3,
  };
}

async function verifyOAuthProviders(args) {
  const runtime = validateAndMaterialize(args);
  if (!runtime.oauth.enabled) {
    fail("Social providers must be enabled before OAuth verification.");
  }
  if (!runtimeStatus(runtime).healthy) {
    fail("Full-local runtime must be healthy before OAuth verification.");
  }
  const settingsResponse = await fetch(
    `${runtime.config.FULL_LOCAL_INTERNAL_GATEWAY_URL}/auth/v1/settings`,
    { headers: { apikey: runtime.secrets.anon_key } },
  );
  if (!settingsResponse.ok) fail("Local Auth settings request failed.");
  const settings = await settingsResponse.json();
  if (settings?.external?.google !== true || settings?.external?.kakao !== true) {
    fail("Google and Kakao are not both enabled in local Auth settings.");
  }
  const naver = await createLocalSupabaseAdmin(runtime).getProvider("custom:naver");
  if (naver.error || naver.data?.enabled !== true) {
    fail("custom:naver is missing or disabled in local Auth.");
  }
  return {
    enabled_providers: ["google", "kakao", "custom:naver"],
    provider_count: 3,
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runtimeCatalogPayload(gate) {
  return {
    product_catalog_missing_columns: gate.missingColumns,
    product_catalog_missing_functions: gate.missingFunctions,
    product_catalog_missing_relations: gate.missingRelations,
    product_catalog_status: gate.status,
  };
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
      const resources = liveFullLocalProductionResources(runtime);
      const backupReadiness = await loadFullLocalBackupReadiness(runtime, resources);
      const base = {
        ...backupReadiness,
        ...runtime.validation,
        oauth_provider_count: runtime.oauth.provider_count,
        social_providers_enabled: runtime.oauth.enabled,
      };
      const containers = composeContainerIds(runtime);
      if (containers.length === 0) {
        print({
          ...base,
          ...runtimeAuthorizationContractPayload({
            authorizationContractGate: null,
            productCatalogGate: null,
          }),
          runtime_present: false,
        });
        process.exitCode = 2;
        break;
      }
      const status = runtimeStatus(runtime);
      if (!status.healthy) {
        print({
          ...base,
          ...runtimeAuthorizationContractPayload({
            authorizationContractGate: null,
            productCatalogGate: null,
          }),
          runtime_present: true,
        });
        process.exitCode = 2;
        break;
      }
      const containerId = postgresContainerId(runtime);
      const productCatalogGate = collectFullLocalProductCatalog(containerId);
      const authorizationContractGate = collectFullLocalAuthorizationContract(containerId);
      const gatePayload = runtimeAuthorizationContractPayload({
        authorizationContractGate,
        productCatalogGate,
      });
      print({
        ...base,
        ...gatePayload,
        runtime_present: true,
      });
      if (gatePayload.authorization_contract_status !== "PASS"
        || gatePayload.product_catalog_status !== "PASS") {
        process.exitCode = 2;
      }
      break;
    }
    case "start": {
      const runtime = validateAndMaterialize(args);
      await loadFullLocalBackupReadiness(
        runtime,
        configuredFullLocalProductionResources(runtime),
      );
      const containersBeforeStart = dockerResourceInventory("container");
      try {
        compose(runtime, ["up", "-d"]);
        const status = await waitForRuntimeHealthy(runtime);
        const resources = liveFullLocalProductionResources(runtime);
        const backupReadiness = await loadFullLocalBackupReadiness(runtime, resources);
        const gate = collectFullLocalProductCatalog(postgresContainerId(runtime));
        assertFullLocalProductCatalogPass(gate);
        print({
          ...status,
          ...runtimeCatalogPayload(gate),
          backup_readiness: backupReadiness,
          status: "PASS",
        });
      } catch (error) {
        const newlyStartedWriters = selectNewlyStartedFullLocalWriterServices({
          after: dockerResourceInventory("container"),
          before: containersBeforeStart,
          composeProject: runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
        });
        if (newlyStartedWriters.length > 0) {
          compose(runtime, ["stop", ...newlyStartedWriters]);
        }
        throw error;
      }
      break;
    }
    case "status": {
      const runtime = validateAndMaterialize(args);
      const resources = liveFullLocalProductionResources(runtime);
      const backupReadiness = await loadFullLocalBackupReadiness(runtime, resources);
      const status = runtimeStatus(runtime);
      if (!status.healthy) {
        print({
          ...status,
          backup_readiness: backupReadiness,
          ...runtimeAuthorizationContractPayload({
            authorizationContractGate: null,
            productCatalogGate: null,
          }),
        });
        process.exitCode = 2;
        break;
      }
      const containerId = postgresContainerId(runtime);
      const productCatalogGate = collectFullLocalProductCatalog(containerId);
      const authorizationContractGate = collectFullLocalAuthorizationContract(containerId);
      const gatePayload = runtimeAuthorizationContractPayload({
        authorizationContractGate,
        productCatalogGate,
      });
      print({
        ...status,
        backup_readiness: backupReadiness,
        ...gatePayload,
      });
      if (gatePayload.authorization_contract_status !== "PASS"
        || gatePayload.product_catalog_status !== "PASS") {
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
    case "restore-platform": {
      const result = await restorePlatformBackup(args);
      print({ ...result, status: "PASS" });
      break;
    }
    case "compare-restore-manifests": {
      print({ ...compareRestoreManifests(args), status: "PASS" });
      break;
    }
    case "provision-oauth": {
      print({ ...await provisionOAuthProviders(args), status: "PASS" });
      break;
    }
    case "verify-oauth": {
      print({ ...await verifyOAuthProviders(args), status: "PASS" });
      break;
    }
    case "cutover-preflight": {
      print(runCutoverPreflight(args));
      break;
    }
    default:
      fail(`Unknown command: ${command ?? "<missing>"}`);
  }
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(resolve(process.argv[1]))
      === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown failure.",
      status: "FAIL",
    })}\n`);
    process.exit(1);
  });
}
