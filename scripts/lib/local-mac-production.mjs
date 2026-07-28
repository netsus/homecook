import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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

export const LOCAL_MAC_PRODUCTION_LABEL = "com.homecook.production";
export const DEFAULT_LOCAL_MAC_PRODUCTION_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_MAC_PRODUCTION_PORT = 3100;

const REQUIRED_PRODUCTION_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
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
  "HOMECOOK_ENABLE_YOUTUBE_IMPORT",
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
    rootDir: cwd,
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
  const fixedPath = [
    dirname(normalizedNodeBin),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");

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
    <string>${escapeXml(resolve(normalizedRootDir, "scripts", "start-production.mjs"))}</string>
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
    resolve(rootDir, "scripts", "start-production.mjs"),
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

export function installLocalMacProductionLaunchAgent({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  host = DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
  port = DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
  platform = process.platform,
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
  verifyPrerequisites = verifyLocalMacProductionPrerequisites,
} = {}) {
  if (platform !== "darwin") {
    throw new Error(`Local Mac production requires macOS. Current platform: ${platform}`);
  }

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

  const paths = getLocalMacProductionPaths(homeDir);
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
  attempts = 40,
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
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  host = DEFAULT_LOCAL_MAC_PRODUCTION_HOST,
  port = DEFAULT_LOCAL_MAC_PRODUCTION_PORT,
  loadEnvFiles = loadProductionEnvFiles,
  validateDataQuality = validateProductionDataQuality,
  installLaunchAgent = installLocalMacProductionLaunchAgent,
  waitForReady = waitForLocalMacProductionReady,
  uninstallLaunchAgent = uninstallLocalMacProductionLaunchAgent,
} = {}) {
  loadEnvFiles({ rootDir });
  const validation = await validateDataQuality({
    env: {
      ...process.env,
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
        uninstallLaunchAgent({ homeDir });
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

export function restartLocalMacProductionLaunchAgent({
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
} = {}) {
  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }

  runLaunchctl(["kickstart", "-k", `gui/${uid}/${LOCAL_MAC_PRODUCTION_LABEL}`], spawn);
}

export function uninstallLocalMacProductionLaunchAgent({
  homeDir = process.env.HOME ?? "",
  getuid = process.getuid?.bind(process),
  spawn = spawnSync,
} = {}) {
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
