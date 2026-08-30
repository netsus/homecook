import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  assertLocalMacProductionMutationAuthority,
  getLocalMacProductionReleasePaths,
} from "./local-mac-production-release.mjs";

export const DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL = "com.homecook.full-local.production";
const LAUNCHCTL_BIN = "/bin/launchctl";

/**
 * @typedef {{
 *   status: number | null,
 *   stdout?: string,
 *   stderr?: string,
 * }} SpawnResult
 */

/**
 * @typedef {(
 *   command: string,
 *   args: readonly string[],
 *   options?: import("node:child_process").SpawnSyncOptionsWithStringEncoding,
 * ) => SpawnResult} LaunchctlSpawn
 */

/**
 * @typedef {{
 *   exists: (path: import("node:fs").PathLike) => boolean,
 *   stat: typeof statSync,
 * }} ConfigValidationFileSystem
 */

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function requireDarwin(platform) {
  if (platform !== "darwin") {
    throw new Error(`Full-local launch agent requires macOS. Current platform: ${platform}`);
  }
}

function requireUserId(getuid) {
  const uid = typeof getuid === "function" ? getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }
  return uid;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function modeBits(mode) {
  return Number(mode) & 0o777;
}

function requireAbsolutePath(value, label) {
  return resolve(requireNonEmptyString(value, label));
}

function requireMode(mode, expectedMode, label) {
  if (modeBits(mode) !== expectedMode) {
    throw new Error(`${label} must use mode 0${expectedMode.toString(8)}.`);
  }
}

function requireExistingFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }

  const stat = statSync(path);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }

  return stat;
}

function buildSanitizedLaunchAgentPath(nodeBin) {
  const segments = [
    dirname(requireAbsolutePath(nodeBin, "nodeBin")),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];

  return [...new Set(segments)].join(":");
}

function runLaunchctl(args, spawn) {
  const result = spawn(LAUNCHCTL_BIN, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    throw new Error(details || `${LAUNCHCTL_BIN} ${args.join(" ")} failed.`);
  }
  return result;
}

function assertSafeExistingPlistTarget(path, currentUid) {
  try {
    const parent = lstatSync(dirname(path));
    if (parent.isSymbolicLink() || !parent.isDirectory()) {
      throw new Error("Full-local plist target parent must be a regular directory.");
    }
    if (parent.uid !== currentUid || (parent.mode & 0o022) !== 0) {
      throw new Error("Full-local plist target parent owner or mode is unsafe.");
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
    throw new Error("Full-local plist target must not be a symlink.");
  }
  if (!stat.isFile()) {
    throw new Error("Full-local plist target must be a regular file.");
  }
  if (stat.uid !== currentUid) {
    throw new Error("Full-local plist target must be owned by the current user.");
  }
  requireMode(stat.mode, 0o600, "Full-local plist target");
}

/**
 * @param {string[]} argv
 * @param {{
 *   cwd?: string,
 *   homeDir?: string,
 *   nodeBin?: string,
 * }} [options]
 */
export function parseFullLocalLaunchAgentArgs(
  argv,
  {
    cwd = process.cwd(),
    homeDir = process.env.HOME ?? "",
    nodeBin = process.execPath,
  } = {},
) {
  const [command, ...rest] = argv;
  const options = {
    command,
    configPath: resolve(cwd, "infra/full-local-supabase/.env.production.local"),
    homeDir: resolve(requireNonEmptyString(homeDir, "homeDir")),
    json: false,
    lockToken: undefined,
    nodeBin: resolve(requireNonEmptyString(nodeBin, "nodeBin")),
    releaseManifestPath: undefined,
    rootDir: resolve(cwd),
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--config") {
      options.configPath = resolve(cwd, value);
    } else if (token === "--home-dir") {
      options.homeDir = resolve(value);
    } else if (token === "--lock-token") {
      options.lockToken = value;
    } else if (token === "--node-bin") {
      options.nodeBin = resolve(value);
    } else if (token === "--release-manifest") {
      options.releaseManifestPath = resolve(value);
    } else if (token === "--root-dir") {
      options.rootDir = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

/**
 * @param {{
 *   configPath: string,
 *   fileSystem?: ConfigValidationFileSystem,
 * }} options
 */
export function validateFullLocalLaunchAgentConfigPath({
  configPath,
  fileSystem = {
    exists: existsSync,
    stat: statSync,
  },
} = {}) {
  const normalizedPath = requireAbsolutePath(configPath, "configPath");
  if (!fileSystem.exists(normalizedPath)) {
    throw new Error(`Full-local config file does not exist: ${normalizedPath}`);
  }

  const stat = fileSystem.stat(normalizedPath);
  if (!stat.isFile()) {
    throw new Error(`Full-local config file must be a regular file: ${normalizedPath}`);
  }
  requireMode(stat.mode, 0o600, "Full-local config file");
  return normalizedPath;
}

/**
 * @param {string} [homeDir]
 */
export function getFullLocalLaunchAgentPaths(homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = resolve(requireNonEmptyString(homeDir, "homeDir"));
  const logDir = resolve(normalizedHomeDir, "Library", "Logs", "Homecook");
  return {
    logDir,
    plistPath: resolve(
      normalizedHomeDir,
      "Library",
      "LaunchAgents",
      `${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}.plist`,
    ),
    stderrPath: resolve(logDir, "full-local-production.err.log"),
    stdoutPath: resolve(logDir, "full-local-production.out.log"),
  };
}

export function getFullLocalResumeConfigPath(homeDir = process.env.HOME ?? "") {
  return resolve(
    requireAbsolutePath(homeDir, "homeDir"),
    ".homecook",
    "config",
    "full-local-production.env",
  );
}

/**
 * @param {{
 *   configPath: string,
 *   homeDir?: string,
 *   nodeBin?: string,
 *   currentDescriptorPath?: string,
 *   releaseIdentityPath?: string,
 *   runtimeCommand?: "resume-current" | "start" | "status",
 *   includeReleaseIdentity?: boolean,
 *   rootDir?: string,
 * }} options
 */
export function renderFullLocalLaunchAgentPlist({
  configPath,
  frozenConfigRoot = null,
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  currentDescriptorPath,
  releaseIdentityPath,
  runtimeCommand = "start",
  includeReleaseIdentity = true,
  rootDir = process.cwd(),
} = {}) {
  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedNodeBin = requireAbsolutePath(nodeBin, "nodeBin");
  const normalizedCurrentDescriptorPath = requireAbsolutePath(
    currentDescriptorPath
      ?? getLocalMacProductionReleasePaths(normalizedHomeDir).currentDescriptorPath,
    "currentDescriptorPath",
  );
  const normalizedReleaseIdentityPath = requireAbsolutePath(
    releaseIdentityPath ?? resolve(normalizedRootDir, "prepare.json"),
    "releaseIdentityPath",
  );
  if (!new Set(["resume-current", "start", "status"]).has(runtimeCommand)) {
    throw new Error("runtimeCommand must be resume-current, start, or status.");
  }
  const normalizedConfigPath = requireAbsolutePath(configPath, "configPath");
  if (
    runtimeCommand === "resume-current"
    && normalizedConfigPath !== getFullLocalResumeConfigPath(normalizedHomeDir)
  ) {
    const normalizedFrozenRoot = frozenConfigRoot ? requireAbsolutePath(frozenConfigRoot, "frozenConfigRoot") : null;
    const frozenRelative = normalizedFrozenRoot ? relative(normalizedFrozenRoot, normalizedConfigPath) : "..";
    if (!normalizedFrozenRoot || frozenRelative === "" || frozenRelative.startsWith("..") || isAbsolute(frozenRelative)) {
      throw new Error("resume-current requires the canonical config or a bound frozen config root.");
    }
  }
  const sanitizedPath = buildSanitizedLaunchAgentPath(normalizedNodeBin);
  const paths = getFullLocalLaunchAgentPaths(normalizedHomeDir);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(normalizedRootDir)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>-i</string>
    <string>${escapeXml(`HOME=${normalizedHomeDir}`)}</string>
    <string>${escapeXml(`PATH=${sanitizedPath}`)}</string>
    <string>${escapeXml(normalizedNodeBin)}</string>
    <string>${escapeXml(resolve(normalizedRootDir, "scripts", "full-local-production-runtime.mjs"))}</string>
    <string>${runtimeCommand}</string>
${runtimeCommand === "resume-current" ? `    <string>--current-descriptor</string>
    <string>${escapeXml(normalizedCurrentDescriptorPath)}</string>
` : ""}    <string>--config</string>
    <string>${escapeXml(normalizedConfigPath)}</string>
${includeReleaseIdentity && runtimeCommand !== "resume-current" ? `    <string>--release-identity</string>
    <string>${escapeXml(normalizedReleaseIdentityPath)}</string>
` : ""}  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(paths.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(paths.stderrPath)}</string>
</dict>
</plist>
`;
}

/**
 * @param {{
 *   label?: string,
 *   serviceTarget: string,
 *   status: number | null,
 *   stdout?: string,
 *   stderr?: string,
 * }} options
 */
export function parseLaunchctlPrintStatus({
  label = DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
  serviceTarget,
  status,
  stdout,
  stderr,
} = {}) {
  const output = `${stdout ?? ""}\n${stderr ?? ""}`;
  const pidText = output.match(/^\s*pid = (\d+)$/mu)?.[1] ?? null;
  const state = status === 0
    ? output.match(/^\s*state = (.+)$/mu)?.[1]?.trim() ?? "unknown"
    : "unloaded";

  return {
    label,
    loaded: status === 0,
    pid: pidText ? Number.parseInt(pidText, 10) : null,
    serviceTarget: requireNonEmptyString(serviceTarget, "serviceTarget"),
    state,
  };
}

/**
 * @param {{
 *   getuid?: (() => number) | undefined,
 *   homeDir?: string,
 *   platform?: string,
 *   spawn?: LaunchctlSpawn,
 * }} [options]
 */
export function readFullLocalLaunchAgentStatus({
  getuid = process.getuid?.bind(process),
  homeDir = process.env.HOME ?? "",
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  requireDarwin(platform);
  const uid = requireUserId(getuid);
  const serviceTarget = `gui/${uid}/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`;
  const launchctlResult = spawn(LAUNCHCTL_BIN, ["print", serviceTarget], {
    encoding: "utf8",
  });
  const paths = getFullLocalLaunchAgentPaths(homeDir);
  const plist = existsSync(paths.plistPath) ? readFileSync(paths.plistPath, "utf8") : null;

  return {
    ...parseLaunchctlPrintStatus({
      label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
      serviceTarget,
      status: launchctlResult.status,
      stderr: launchctlResult.stderr,
      stdout: launchctlResult.stdout,
    }),
    configPath: plist ? extractFullLocalConfigPathFromPlist(plist) : null,
    plistPath: paths.plistPath,
  };
}

/**
 * @param {string} plist
 */
export function extractFullLocalConfigPathFromPlist(plist) {
  const matches = [...String(plist).matchAll(/<string>([^<]+)<\/string>/g)];
  for (let index = 0; index < matches.length; index += 1) {
    if (matches[index][1] === "--config") {
      return matches[index + 1]?.[1] ?? null;
    }
  }
  return null;
}

/**
 * @param {{
 *   mutationAuthority?: object,
 *   configPath: string,
 *   getuid?: (() => number) | undefined,
 *   homeDir?: string,
 *   nodeBin?: string,
 *   platform?: string,
 *   currentDescriptorPath?: string,
 *   releaseIdentityPath?: string,
 *   runtimeCommand?: "resume-current" | "start" | "status",
 *   rootDir?: string,
 *   spawn?: LaunchctlSpawn,
 * }} options
 */
export function installFullLocalLaunchAgent({
  mutationAuthority,
  configPath,
  frozenConfigRoot = null,
  getuid = process.getuid?.bind(process),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  platform = process.platform,
  currentDescriptorPath,
  releaseIdentityPath,
  runtimeCommand = "start",
  rootDir = process.cwd(),
  spawn = spawnSync,
} = {}) {
  requireDarwin(platform);
  assertLocalMacProductionMutationAuthority({
    helperName: "Full-local LaunchAgent install",
    mutationAuthority,
  });
  const uid = requireUserId(getuid);
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedNodeBin = requireAbsolutePath(nodeBin, "nodeBin");
  const normalizedConfigPath = validateFullLocalLaunchAgentConfigPath({ configPath });
  requireExistingFile(
    resolve(normalizedRootDir, "scripts", "full-local-production-runtime.mjs"),
    "Full-local runtime entrypoint",
  );

  const paths = getFullLocalLaunchAgentPaths(homeDir);
  assertSafeExistingPlistTarget(paths.plistPath, uid);
  const plist = renderFullLocalLaunchAgentPlist({
    configPath: normalizedConfigPath,
    frozenConfigRoot,
    homeDir,
    nodeBin: normalizedNodeBin,
    currentDescriptorPath,
    releaseIdentityPath: releaseIdentityPath ?? resolve(normalizedRootDir, "prepare.json"),
    runtimeCommand,
    rootDir: normalizedRootDir,
  });

  mkdirSync(dirname(paths.plistPath), { recursive: true, mode: 0o700 });
  mkdirSync(paths.logDir, { recursive: true, mode: 0o700 });
  writeFileSync(paths.plistPath, plist, { encoding: "utf8", mode: 0o600 });
  chmodSync(paths.plistPath, 0o600);

  spawn(LAUNCHCTL_BIN, ["bootout", `gui/${uid}`, paths.plistPath], {
    encoding: "utf8",
  });
  runLaunchctl(["bootstrap", `gui/${uid}`, paths.plistPath], spawn);
  runLaunchctl(
    ["kickstart", "-k", `gui/${uid}/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`],
    spawn,
  );

  return {
    changed: true,
    configPath: normalizedConfigPath,
    label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
    plistPath: paths.plistPath,
    stderrPath: paths.stderrPath,
    stdoutPath: paths.stdoutPath,
  };
}

/**
 * @param {{
 *   mutationAuthority?: object,
 *   getuid?: (() => number) | undefined,
 *   homeDir?: string,
 *   platform?: string,
 *   spawn?: LaunchctlSpawn,
 * }} [options]
 */
export function uninstallFullLocalLaunchAgent({
  mutationAuthority,
  getuid = process.getuid?.bind(process),
  homeDir = process.env.HOME ?? "",
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  requireDarwin(platform);
  assertLocalMacProductionMutationAuthority({
    helperName: "Full-local LaunchAgent uninstall",
    mutationAuthority,
  });
  const uid = requireUserId(getuid);
  const paths = getFullLocalLaunchAgentPaths(homeDir);
  spawn(LAUNCHCTL_BIN, ["bootout", `gui/${uid}`, paths.plistPath], {
    encoding: "utf8",
  });
  rmSync(paths.plistPath, { force: true });

  return {
    label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
    plistPath: paths.plistPath,
    removed: true,
  };
}
