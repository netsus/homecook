import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CLAUDE_BUDGET_STATES = new Set(["available", "constrained", "unavailable"]);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureState(value, label) {
  const normalized = ensureNonEmptyString(value, label);

  if (!CLAUDE_BUDGET_STATES.has(normalized)) {
    throw new Error(`${label} must be one of: ${[...CLAUDE_BUDGET_STATES].join(", ")}`);
  }

  return normalized;
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function getClaudeBudgetOverridePath(rootDir = process.cwd()) {
  return resolve(rootDir, ".opencode", "claude-budget-state.json");
}

export function getOpencodeAuthPath(homeDir = process.env.HOME) {
  return resolve(homeDir ?? "", ".local", "share", "opencode", "auth.json");
}

export function writeClaudeBudgetOverride({
  rootDir = process.cwd(),
  state,
  reason,
  updatedAt,
}) {
  const overridePath = getClaudeBudgetOverridePath(rootDir);
  mkdirSync(resolve(rootDir, ".opencode"), { recursive: true });

  const next = {
    state: ensureState(state, "state"),
    ...(reason ? { reason: ensureNonEmptyString(reason, "reason") } : {}),
    updated_at:
      typeof updatedAt === "string" && updatedAt.trim().length > 0
        ? updatedAt
        : new Date().toISOString(),
  };

  writeFileSync(overridePath, `${JSON.stringify(next, null, 2)}\n`);

  return {
    overridePath,
    override: next,
  };
}

export function clearClaudeBudgetOverride({
  rootDir = process.cwd(),
}) {
  const overridePath = getClaudeBudgetOverridePath(rootDir);

  if (existsSync(overridePath)) {
    rmSync(overridePath);
  }

  return {
    overridePath,
    cleared: true,
  };
}

/**
 * @typedef {object} ResolveClaudeBudgetStateOptions
 * @property {string} [rootDir]
 * @property {string} [homeDir]
 * @property {"available"|"constrained"|"unavailable"} [explicitState]
 * @property {NodeJS.ProcessEnv} [environment]
 */

/**
 * @param {ResolveClaudeBudgetStateOptions} options
 */
export function resolveClaudeBudgetState({
  rootDir = process.cwd(),
  homeDir = process.env.HOME,
  explicitState,
  environment = process.env,
}) {
  if (explicitState !== undefined) {
    return {
      state: ensureState(explicitState, "explicitState"),
      source: "explicit",
      providerConfigured: true,
      reason: null,
      authPath: getOpencodeAuthPath(homeDir),
      overridePath: getClaudeBudgetOverridePath(rootDir),
    };
  }

  if (environment?.OMO_CLAUDE_BUDGET_STATE) {
    return {
      state: ensureState(environment.OMO_CLAUDE_BUDGET_STATE, "OMO_CLAUDE_BUDGET_STATE"),
      source: "env",
      providerConfigured: true,
      reason: null,
      authPath: getOpencodeAuthPath(homeDir),
      overridePath: getClaudeBudgetOverridePath(rootDir),
    };
  }

  const overridePath = getClaudeBudgetOverridePath(rootDir);
  const override = readJsonIfExists(overridePath);
  if (override) {
    return {
      state: ensureState(override.state, "override.state"),
      source: "override-file",
      providerConfigured: true,
      reason: typeof override.reason === "string" ? override.reason : null,
      updatedAt: typeof override.updated_at === "string" ? override.updated_at : null,
      authPath: getOpencodeAuthPath(homeDir),
      overridePath,
    };
  }

  const authPath = getOpencodeAuthPath(homeDir);
  const auth = readJsonIfExists(authPath);
  const providerConfigured = Boolean(
    auth &&
    typeof auth === "object" &&
    auth.anthropic &&
    typeof auth.anthropic === "object",
  );

  if (!providerConfigured) {
    return {
      state: "unavailable",
      source: "missing-auth",
      providerConfigured: false,
      reason: "Anthropic auth is not configured for this machine.",
      authPath,
      overridePath,
    };
  }

  return {
    state: "available",
    source: "opencode-auth",
    providerConfigured: true,
    reason: null,
    authPath,
    overridePath,
  };
}
