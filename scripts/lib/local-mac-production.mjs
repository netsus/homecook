import { spawn as spawnChild, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  loadProductionEnvFiles,
  validateProductionDataQuality,
} from "./production-data-quality.mjs";
import { ensureDockerRunning } from "./local-docker.mjs";
import {
  ensureRegularFile,
  readYoutubeExtractionAppDescriptor,
  readYoutubeExtractionExpectedSchema,
  sha256File,
  verifyYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  assertLocalMacProductionMutationAuthority,
  readLocalMacProductionRepoHeadSha,
} from "./local-mac-production-release.mjs";

export const LOCAL_MAC_PRODUCTION_LABEL = "com.homecook.production";
export const DEFAULT_LOCAL_MAC_PRODUCTION_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_MAC_PRODUCTION_PORT = 3100;

const FULL_LOCAL_RUNTIME_ENV_KEYS = [
  "DOCKER_CONTEXT",
  "DOCKER_HOST",
  "HOME",
  "PATH",
  "TMPDIR",
  "XDG_CONFIG_HOME",
];

const REQUIRED_PRODUCTION_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "HOMECOOK_AUTH_AUTHORITY",
  "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
  "AUTH_SUPABASE_EXPECTED_ISSUER",
  "AUTH_SUPABASE_JWKS_URL",
  "AUTH_SUPABASE_SECRET_KEY",
  "LOCAL_SUPABASE_INTERNAL_URL",
  "LOCAL_SUPABASE_SECRET_KEY",
  "HOMECOOK_DATA_AUTHORITY",
  "DATA_SUPABASE_URL",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
];

const DENIED_PRODUCTION_ENV_KEYS = new Set([
  "GH_TOKEN",
  "HOMECOOK_ENABLE_QA_FIXTURES",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES",
  "HOMECOOK_ENABLE_LOCAL_DEV_AUTH",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH",
  "HOMECOOK_YOUTUBE_FIXTURE_PROVIDER",
]);

const EXTRA_PRODUCTION_ENV_KEYS = new Set([
  "APIFY_TOKEN",
  "GEMINI_API_KEYS",
  "HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION",
  "HOMECOOK_ENABLE_YOUTUBE_IMPORT",
  "HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH",
  "HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1",
  "HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH",
  "HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V1",
  "HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT",
  "YOUTUBE_RECIPE_LLM_DAILY_LIMIT",
  "YOUTUBE_RECIPE_LLM_TIMEOUT_MS",
  "YOUTUBE_RECIPE_LLM_USER_DAILY_LIMIT",
  "YOUTUBE_RECIPE_VISUAL_QUANTITY_DAILY_LIMIT",
  "YOUTUBE_RECIPE_VISUAL_QUANTITY_TIMEOUT_MS",
  "YOUTUBE_RECIPE_VISUAL_QUANTITY_USER_DAILY_LIMIT",
  "YOUTUBE_RECIPE_VISUAL_RECIPE_DAILY_LIMIT",
  "YOUTUBE_RECIPE_VISUAL_RECIPE_TIMEOUT_MS",
  "YOUTUBE_RECIPE_VISUAL_RECIPE_USER_DAILY_LIMIT",
  "YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID",
  "YOUTUBE_TRANSCRIPT_PAID_DAILY_LIMIT",
  "YOUTUBE_TRANSCRIPT_PAID_PROVIDER",
  "YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS",
  "YOUTUBE_TRANSCRIPT_PAID_USER_DAILY_LIMIT",
]);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;

function readReleaseShaClaim(path, label) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value?.release_sha;
  } catch {
    throw new Error(`${label} is unreadable or invalid.`);
  }
}

export function readLocalMacProductionReleaseSha({
  rootDir = process.cwd(),
  runCommand = spawnSync,
} = {}) {
  return readLocalMacProductionRepoHeadSha({ rootDir, runCommand });
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, releaseSha?: string }} [options]
 */
export function verifyYoutubeExtractionAppReleaseAlignment({
  env = process.env,
  releaseSha,
} = {}) {
  if (env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION !== "1") {
    return { enabled: false, releaseSha: null };
  }
  const normalizedReleaseSha = ensureNonEmptyString(releaseSha, "releaseSha");
  if (!RELEASE_SHA_PATTERN.test(normalizedReleaseSha)) {
    throw new Error("Local Mac production release SHA is invalid.");
  }
  const descriptorPath = ensureRegularFile(
    env.HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH,
    "YouTube extraction app descriptor",
  );
  const manifestPath = ensureRegularFile(
    env.HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH,
    "YouTube extraction worker manifest",
  );
  const expectedSchemaPath = ensureRegularFile(
    env.HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH,
    "YouTube extraction expected schema manifest",
  );
  if (
    readReleaseShaClaim(descriptorPath, "YouTube extraction app descriptor")
      !== normalizedReleaseSha
    || readReleaseShaClaim(manifestPath, "YouTube extraction worker manifest")
      !== normalizedReleaseSha
  ) {
    throw new Error("YouTube extraction app release mismatch; refusing LaunchAgent install.");
  }
  const descriptor = readYoutubeExtractionAppDescriptor(descriptorPath);
  const manifest = verifyYoutubeExtractionWorkerArtifact(manifestPath);
  const expectedSchema = readYoutubeExtractionExpectedSchema(expectedSchemaPath);
  const expectedSchemaSha = sha256File(expectedSchemaPath);
  if (
    descriptor.release_sha !== normalizedReleaseSha
    || manifest.release_sha !== normalizedReleaseSha
    || descriptor.release_sha !== manifest.release_sha
    || descriptor.artifact_sha256 !== manifest.artifact_sha256
    || descriptor.expected_schema_sha256 !== expectedSchemaSha
    || manifest.expected_schema_sha256 !== expectedSchemaSha
    || descriptor.schema_identity !== manifest.schema_identity
    || expectedSchema.schema_identity !== manifest.schema_identity
  ) {
    throw new Error("YouTube extraction app release mismatch; refusing LaunchAgent install.");
  }
  return { enabled: true, releaseSha: normalizedReleaseSha };
}

function ensureLocalOnlyHost(host) {
  const normalized = ensureNonEmptyString(host, "host");
  if (normalized !== DEFAULT_LOCAL_MAC_PRODUCTION_HOST) {
    throw new Error("Local Mac production must bind to 127.0.0.1.");
  }

  return normalized;
}

function ensurePort(port) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("port must be an integer between 1 and 65535.");
  }

  return parsed;
}

function ensureLocalNextStartArgs(args) {
  if (Array.isArray(args) && args.length === 0) {
    return [
      "-H",
      DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
      "-p",
      String(DEFAULT_LOCAL_MAC_PRODUCTION_PORT),
    ];
  }

  if (
    !Array.isArray(args)
    || args.length !== 4
    || args[0] !== "-H"
    || args[2] !== "-p"
  ) {
    throw new Error("Local Mac production requires explicit -H and -p arguments.");
  }

  return [
    "-H",
    ensureLocalOnlyHost(args[1]),
    "-p",
    String(ensurePort(args[3])),
  ];
}

function createFullLocalRuntimeCommandEnv(env) {
  /** @type {Record<string, string | undefined>} */
  const commandEnv = {};

  for (const key of FULL_LOCAL_RUNTIME_ENV_KEYS) {
    if (typeof env[key] === "string" && env[key].length > 0) {
      commandEnv[key] = env[key];
    }
  }

  ensureNonEmptyString(commandEnv.HOME, "HOME");
  ensureNonEmptyString(commandEnv.PATH, "PATH");

  return commandEnv;
}

export function parseLocalMacProductionArgs(argv, {
  cwd = process.cwd(),
  nodeBin = process.execPath,
} = {}) {
  const [command, ...rest] = argv;
  const options = {
    command,
    force: false,
    host: DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
    nodeBin,
    port: DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
    releaseManifestPath: undefined,
    rootDir: cwd,
    lockToken: undefined,
    sourcePath: undefined,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }

    if (arg === "--source-env") {
      options.sourcePath = resolve(value);
    } else if (arg === "--release-manifest") {
      options.releaseManifestPath = resolve(value);
    } else if (arg === "--lock-token") {
      options.lockToken = value;
    } else if (arg === "--node-bin") {
      options.nodeBin = resolve(value);
    } else if (arg === "--port") {
      options.port = Number(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += 1;
  }

  return options;
}

function parseEnvEntries(text) {
  const entries = new Map();

  for (const line of String(text).split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) continue;
    entries.set(match[1], match[2]);
  }

  return entries;
}

function isAllowedProductionKey(key, exampleKeys) {
  return exampleKeys.has(key) || EXTRA_PRODUCTION_ENV_KEYS.has(key);
}

function resolveLocalOrigin(origin) {
  const parsed = new URL(ensureNonEmptyString(origin, "origin"));
  if (parsed.protocol !== "http:" || parsed.hostname !== DEFAULT_LOCAL_MAC_PRODUCTION_HOST) {
    throw new Error("Local Mac production origin must use http://127.0.0.1.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Local Mac production origin must not include a path, query, or hash.");
  }

  return parsed.origin;
}

function assertLoopbackHttpOrigin(value, label) {
  const parsed = new URL(ensureNonEmptyString(value, label));
  if (
    parsed.protocol !== "http:"
    || !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact loopback HTTP origin.`);
  }
  return parsed.origin;
}

function assertLocalOnlySupabaseEntries(entries) {
  for (const authority of ["HOMECOOK_AUTH_AUTHORITY", "HOMECOOK_DATA_AUTHORITY"]) {
    if (entries.get(authority)?.trim() !== "local") {
      throw new Error(`${authority} must be local.`);
    }
  }
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "DATA_SUPABASE_URL",
    "LOCAL_SUPABASE_INTERNAL_URL",
  ]) {
    assertLoopbackHttpOrigin(entries.get(key), key);
  }
  const authOrigin = new URL(ensureNonEmptyString(
    entries.get("NEXT_PUBLIC_AUTH_SUPABASE_URL"),
    "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  ));
  const hosted = authOrigin.hostname.endsWith(".supabase.co")
    || authOrigin.hostname.endsWith(".supabase.in");
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(authOrigin.hostname);
  if (
    hosted
    || !["http:", "https:"].includes(authOrigin.protocol)
    || (authOrigin.protocol === "http:" && !loopback)
    || authOrigin.pathname !== "/"
    || authOrigin.search
    || authOrigin.hash
  ) {
    throw new Error("NEXT_PUBLIC_AUTH_SUPABASE_URL must be loopback HTTP or self-hosted HTTPS.");
  }
  const expectedIssuer = `${authOrigin.origin}/auth/v1`;
  if (entries.get("AUTH_SUPABASE_EXPECTED_ISSUER")?.trim() !== expectedIssuer) {
    throw new Error("AUTH_SUPABASE_EXPECTED_ISSUER must match the local Auth origin.");
  }
  if (
    entries.get("AUTH_SUPABASE_JWKS_URL")?.trim()
    !== `${expectedIssuer}/.well-known/jwks.json`
  ) {
    throw new Error("AUTH_SUPABASE_JWKS_URL must match the local Auth issuer.");
  }
}

export function createProductionEnvContents({ sourceText, exampleText, origin }) {
  const sourceEntries = parseEnvEntries(sourceText);
  const exampleKeys = new Set(parseEnvEntries(exampleText).keys());
  const localOrigin = resolveLocalOrigin(origin);
  const selectedEntries = new Map();
  const omittedKeys = [];

  for (const [key, rawValue] of sourceEntries) {
    if (DENIED_PRODUCTION_ENV_KEYS.has(key) || !isAllowedProductionKey(key, exampleKeys)) {
      omittedKeys.push(key);
      continue;
    }

    selectedEntries.set(key, rawValue);
  }

  const missingRequiredKeys = REQUIRED_PRODUCTION_ENV_KEYS.filter((key) => {
    const value = selectedEntries.get(key);
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingRequiredKeys.length > 0) {
    throw new Error(`Missing required production env keys: ${missingRequiredKeys.join(", ")}`);
  }
  assertLocalOnlySupabaseEntries(selectedEntries);

  selectedEntries.set("HOMECOOK_PRODUCTION_EXPOSURE", "local-only");
  selectedEntries.set("NEXT_PUBLIC_APP_URL", localOrigin);
  selectedEntries.set("NEXT_PUBLIC_SITE_URL", localOrigin);

  const lines = [
    "# Generated for local-only production on this Mac.",
    "# Do not commit this file or expose the service outside 127.0.0.1.",
    ...[...selectedEntries]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, rawValue]) => `${key}=${rawValue}`),
    "",
  ];

  return {
    contents: lines.join("\n"),
    copiedKeyCount: selectedEntries.size,
    omittedKeys: omittedKeys.sort(),
  };
}

export function prepareProductionEnvFile({
  rootDir = process.cwd(),
  sourcePath = resolve(rootDir, ".env.local"),
  examplePath = resolve(rootDir, ".env.example"),
  origin = `http://${DEFAULT_LOCAL_MAC_PRODUCTION_HOST}:${DEFAULT_LOCAL_MAC_PRODUCTION_PORT}`,
  force = false,
} = {}) {
  const targetPath = resolve(rootDir, ".env.production.local");
  if (!existsSync(sourcePath)) {
    throw new Error(`Source env file does not exist: ${sourcePath}`);
  }
  if (!existsSync(examplePath)) {
    throw new Error(`Example env file does not exist: ${examplePath}`);
  }
  if (existsSync(targetPath) && !force) {
    throw new Error(`${targetPath} already exists. Use --force to replace it.`);
  }

  const result = createProductionEnvContents({
    sourceText: readFileSync(sourcePath, "utf8"),
    exampleText: readFileSync(examplePath, "utf8"),
    origin,
  });

  writeFileSync(targetPath, result.contents, { mode: 0o600 });
  chmodSync(targetPath, 0o600);

  return {
    ...result,
    targetPath,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function getLocalMacProductionPaths(homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = resolve(ensureNonEmptyString(homeDir, "homeDir"));
  const logDir = resolve(normalizedHomeDir, ".homecook", "logs");

  return {
    plistPath: resolve(
      normalizedHomeDir,
      "Library",
      "LaunchAgents",
      `${LOCAL_MAC_PRODUCTION_LABEL}.plist`,
    ),
    logDir,
    stdoutPath: resolve(logDir, "homecook-production.out.log"),
    stderrPath: resolve(logDir, "homecook-production.err.log"),
  };
}

function getLocalMacProductionPath(nodeBin) {
  return [
    dirname(resolve(ensureNonEmptyString(nodeBin, "nodeBin"))),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

/**
 * @param {{
 *   command: string,
 *   args: readonly string[],
 *   cwd: string,
 *   env: Record<string, string | undefined>,
 *   runCommand?: (
 *     command: string,
 *     args: readonly string[],
 *     options: import("node:child_process").SpawnSyncOptionsWithStringEncoding,
 *   ) => { status: number | null },
 * }} options
 */
export function verifyFullLocalProductionRuntimeStatus({
  command,
  args,
  cwd,
  env,
  runCommand = spawnSync,
}) {
  const result = runCommand(command, args, {
    cwd: resolve(cwd),
    env,
    encoding: "utf8",
    stdio: "ignore",
  });

  if (result.status !== 0) {
    throw new Error(
      "Full-local production runtime health check failed; "
      + "com.homecook.full-local.production must be healthy before starting the app.",
    );
  }
}

/**
 * @typedef {{ status: number | null }} LocalStartupCommandResult
 * @typedef {{ on: (...args: unknown[]) => unknown }} LocalRuntimeChild
 * @typedef {{
 *   args?: string[],
 *   rootDir?: string,
 *   nodeBin?: string,
 *   env?: Record<string, string | undefined>,
 *   ensureDocker?: () => Promise<void>,
 *   runCommand?: (
 *     command: string,
 *     args: readonly string[],
 *     options: import("node:child_process").SpawnSyncOptionsWithStringEncoding,
 *   ) => LocalStartupCommandResult,
 *   spawnProcess?: (
 *     command: string,
 *     args: readonly string[],
 *     options: import("node:child_process").SpawnOptions,
 *   ) => LocalRuntimeChild,
 * }} LocalMacProductionRuntimeOptions
 */

/**
 * @param {LocalMacProductionRuntimeOptions} [options]
 */
export async function startLocalMacProductionRuntime({
  args = [],
  rootDir = process.cwd(),
  nodeBin = process.execPath,
  env = process.env,
  ensureDocker = ensureDockerRunning,
  runCommand = spawnSync,
  spawnProcess = spawnChild,
} = {}) {
  const normalizedRootDir = resolve(ensureNonEmptyString(rootDir, "rootDir"));
  const normalizedNodeBin = resolve(ensureNonEmptyString(nodeBin, "nodeBin"));
  const normalizedArgs = ensureLocalNextStartArgs(args);
  const runtimeEnv = createFullLocalRuntimeCommandEnv(env);

  await ensureDocker();

  verifyFullLocalProductionRuntimeStatus({
    command: normalizedNodeBin,
    args: [resolve(normalizedRootDir, "scripts", "full-local-production-runtime.mjs"), "status"],
    cwd: normalizedRootDir,
    env: runtimeEnv,
    runCommand,
  });

  return spawnProcess(
    normalizedNodeBin,
    [
      resolve(normalizedRootDir, "scripts", "start-production.mjs"),
      ...normalizedArgs,
    ],
    {
      cwd: normalizedRootDir,
      env,
      stdio: "inherit",
    },
  );
}

export function renderLocalMacProductionPlist({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  host = DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
  port = DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
} = {}) {
  const normalizedRootDir = resolve(ensureNonEmptyString(rootDir, "rootDir"));
  const normalizedHomeDir = resolve(ensureNonEmptyString(homeDir, "homeDir"));
  const normalizedNodeBin = resolve(ensureNonEmptyString(nodeBin, "nodeBin"));
  const normalizedHost = ensureLocalOnlyHost(host);
  const normalizedPort = ensurePort(port);
  const paths = getLocalMacProductionPaths(normalizedHomeDir);
  const fixedPath = getLocalMacProductionPath(normalizedNodeBin);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOCAL_MAC_PRODUCTION_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(normalizedRootDir)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(normalizedNodeBin)}</string>
    <string>${escapeXml(resolve(normalizedRootDir, "scripts", "start-local-mac-production.mjs"))}</string>
    <string>-H</string>
    <string>${normalizedHost}</string>
    <string>-p</string>
    <string>${normalizedPort}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(normalizedHomeDir)}</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>${escapeXml(fixedPath)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(paths.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(paths.stderrPath)}</string>
</dict>
</plist>
`;
}

export function verifyLocalMacProductionPrerequisites({
  rootDir = process.cwd(),
  nodeBin = process.execPath,
} = {}) {
  const requiredPaths = [
    resolve(rootDir, ".env.production.local"),
    resolve(rootDir, ".next", "BUILD_ID"),
    resolve(rootDir, "scripts", "start-local-mac-production.mjs"),
    resolve(rootDir, "scripts", "start-production.mjs"),
    resolve(rootDir, "scripts", "full-local-production-runtime.mjs"),
    resolve(rootDir, "infra", "full-local-supabase", ".env.production.local"),
    resolve(nodeBin),
  ];
  const missingPaths = requiredPaths.filter((filePath) => !existsSync(filePath));

  if (missingPaths.length > 0) {
    throw new Error(`Local Mac production prerequisites are missing: ${missingPaths.join(", ")}`);
  }
}

function runLaunchctl(args, spawn) {
  const result = spawn("launchctl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    throw new Error(details || `launchctl ${args.join(" ")} failed.`);
  }

  return result;
}

function assertSafeExistingPlistTarget(path, expectedMode, currentUid, label) {
  try {
    const parent = lstatSync(dirname(path));
    if (parent.isSymbolicLink() || !parent.isDirectory()) {
      throw new Error(`${label} parent must be a regular directory.`);
    }
    if (parent.uid !== currentUid || (parent.mode & 0o022) !== 0) {
      throw new Error(`${label} parent owner or mode is unsafe.`);
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink.`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (stat.uid !== currentUid) {
    throw new Error(`${label} must be owned by the current user.`);
  }
  if ((stat.mode & 0o777) !== expectedMode) {
    throw new Error(`${label} must use mode 0${expectedMode.toString(8)}.`);
  }
}

/**
 * @param {{
 *   mutationAuthority?: object,
 *   rootDir?: string,
 *   homeDir?: string,
 *   nodeBin?: string,
 *   host?: string,
 *   port?: number,
 *   platform?: NodeJS.Platform,
 *   getuid?: (() => number) | undefined,
 *   spawn?: typeof spawnSync,
 *   verifyRuntimeStatus?: typeof verifyFullLocalProductionRuntimeStatus,
 *   verifyPrerequisites?: typeof verifyLocalMacProductionPrerequisites,
 * }} [options]
 */
export function installLocalMacProductionLaunchAgent({
  mutationAuthority,
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  host = DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
  port = DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
  platform = process.platform,
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
  verifyRuntimeStatus = verifyFullLocalProductionRuntimeStatus,
  verifyPrerequisites = verifyLocalMacProductionPrerequisites,
} = {}) {
  if (platform !== "darwin") {
    throw new Error(`Local Mac production requires macOS. Current platform: ${platform}`);
  }
  assertLocalMacProductionMutationAuthority({
    helperName: "Local Mac production LaunchAgent install",
    mutationAuthority,
  });

  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }

  const normalizedRootDir = resolve(rootDir);
  const normalizedNodeBin = resolve(nodeBin);
  verifyPrerequisites({
    rootDir: normalizedRootDir,
    nodeBin: normalizedNodeBin,
  });
  verifyRuntimeStatus({
    command: normalizedNodeBin,
    args: [resolve(normalizedRootDir, "scripts", "full-local-production-runtime.mjs"), "status"],
    cwd: normalizedRootDir,
    env: {
      HOME: resolve(ensureNonEmptyString(homeDir, "homeDir")),
      PATH: getLocalMacProductionPath(normalizedNodeBin),
    },
  });

  const paths = getLocalMacProductionPaths(homeDir);
  assertSafeExistingPlistTarget(
    paths.plistPath,
    0o644,
    uid,
    "Local Mac production plist target",
  );
  const plist = renderLocalMacProductionPlist({
    rootDir: normalizedRootDir,
    homeDir,
    nodeBin: normalizedNodeBin,
    host,
    port,
  });

  mkdirSync(dirname(paths.plistPath), { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
  writeFileSync(paths.plistPath, plist, { mode: 0o644 });
  chmodSync(paths.plistPath, 0o644);

  spawn("launchctl", ["bootout", `gui/${uid}`, paths.plistPath], {
    encoding: "utf8",
  });
  runLaunchctl(["bootstrap", `gui/${uid}`, paths.plistPath], spawn);
  runLaunchctl(["kickstart", "-k", `gui/${uid}/${LOCAL_MAC_PRODUCTION_LABEL}`], spawn);

  return {
    changed: true,
    label: LOCAL_MAC_PRODUCTION_LABEL,
    plistPath: paths.plistPath,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    host: ensureLocalOnlyHost(host),
    port: ensurePort(port),
  };
}

export function readLocalMacProductionStatus({
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
} = {}) {
  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }

  const serviceTarget = `gui/${uid}/${LOCAL_MAC_PRODUCTION_LABEL}`;
  const result = spawn("launchctl", ["print", serviceTarget], {
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const state = output.match(/^\s*state = (.+)$/mu)?.[1]?.trim() ?? "unknown";
  const pidText = output.match(/^\s*pid = (\d+)$/mu)?.[1];

  return {
    loaded: result.status === 0,
    running: result.status === 0 && state === "running",
    state: result.status === 0 ? state : "unloaded",
    pid: pidText ? Number.parseInt(pidText, 10) : null,
    serviceTarget,
  };
}

export async function waitForLocalMacProductionReady({
  origin = `http://${DEFAULT_LOCAL_MAC_PRODUCTION_HOST}:${DEFAULT_LOCAL_MAC_PRODUCTION_PORT}`,
  attempts = 120,
  intervalMs = 250,
  fetchImpl = fetch,
  waitImpl = (milliseconds) => new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  }),
} = {}) {
  const localOrigin = resolveLocalOrigin(origin);
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("attempts must be a positive integer.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error("intervalMs must be a non-negative integer.");
  }

  let lastFailure = "server did not respond";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(localOrigin, {
        method: "HEAD",
        cache: "no-store",
      });
      if (response.ok) {
        return {
          attempts: attempt,
          status: response.status,
        };
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) {
      await waitImpl(intervalMs);
    }
  }

  throw new Error(`Local Mac production did not become ready: ${lastFailure}`);
}

export async function activateLocalMacProduction({
  mutationAuthority,
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  host = DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
  port = DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
  env = process.env,
  loadEnvFiles = loadProductionEnvFiles,
  readReleaseSha = readLocalMacProductionReleaseSha,
  verifyYoutubeRelease = verifyYoutubeExtractionAppReleaseAlignment,
  validateDataQuality = validateProductionDataQuality,
  installLaunchAgent = installLocalMacProductionLaunchAgent,
  waitForReady = waitForLocalMacProductionReady,
  uninstallLaunchAgent = uninstallLocalMacProductionLaunchAgent,
} = {}) {
  loadEnvFiles({ rootDir });
  if (env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION === "1") {
    verifyYoutubeRelease({
      env,
      releaseSha: readReleaseSha({ rootDir }),
    });
  }
  const validation = await validateDataQuality({
    rootDir,
    env: {
      ...env,
      NODE_ENV: "production",
      HOMECOOK_VALIDATE_PRODUCTION_DATA: "1",
    },
    requireDb: true,
  });

  if (!validation.ok) {
    const codes = validation.errors
      .map((error) => error.code)
      .filter(Boolean)
      .join(", ");
    throw new Error(`Production data quality gate failed before install: ${codes || "unknown"}`);
  }

  let installed = null;
  try {
    installed = installLaunchAgent({
      mutationAuthority,
      rootDir,
      homeDir,
      nodeBin,
      host,
      port,
    });
    const ready = await waitForReady({
      origin: `http://${installed.host}:${installed.port}`,
    });
    return {
      ...installed,
      ready,
    };
  } catch (error) {
    if (installed) {
      try {
        uninstallLaunchAgent({
          homeDir,
          mutationAuthority,
        });
      } catch (cleanupError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(`${originalMessage}. Automatic rollback failed: ${cleanupMessage}`);
      }
    }
    throw error;
  }
}

/**
 * @param {{
 *   mutationAuthority?: object,
 *   getuid?: (() => number) | undefined,
 *   spawn?: typeof spawnSync,
 * }} [options]
 */
export function restartLocalMacProductionLaunchAgent({
  mutationAuthority,
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
} = {}) {
  assertLocalMacProductionMutationAuthority({
    helperName: "Local Mac production LaunchAgent restart",
    mutationAuthority,
  });
  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }

  runLaunchctl(["kickstart", "-k", `gui/${uid}/${LOCAL_MAC_PRODUCTION_LABEL}`], spawn);
}

/**
 * @param {{
 *   mutationAuthority?: object,
 *   homeDir?: string,
 *   getuid?: (() => number) | undefined,
 *   spawn?: typeof spawnSync,
 * }} [options]
 */
export function uninstallLocalMacProductionLaunchAgent({
  mutationAuthority,
  homeDir = process.env.HOME ?? "",
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
} = {}) {
  assertLocalMacProductionMutationAuthority({
    helperName: "Local Mac production LaunchAgent uninstall",
    mutationAuthority,
  });
  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }

  const paths = getLocalMacProductionPaths(homeDir);
  const result = spawn("launchctl", ["bootout", `gui/${uid}`, paths.plistPath], {
    encoding: "utf8",
  });
  if (result.status !== 0 && existsSync(paths.plistPath)) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    throw new Error(details || "Unable to unload the local Mac production service.");
  }

  rmSync(paths.plistPath, { force: true });
  return {
    removed: true,
    plistPath: paths.plistPath,
  };
}
