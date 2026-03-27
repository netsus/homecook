import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_OMO_PROVIDER_CONFIG = {
  claude: {
    provider: "claude-cli",
    bin: "claude",
    model: "sonnet",
    effort: "high",
    permission_mode: "dontAsk",
  },
  codex: {
    provider: "opencode",
    bin: "opencode",
    agent: "hephaestus",
  },
};

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function mergeProviderSection(defaults, raw) {
  return {
    ...defaults,
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
  };
}

export function getOmoProviderConfigPath(rootDir = process.cwd()) {
  return resolve(rootDir, ".opencode", "omo-provider.json");
}

export function readOmoProviderConfig(rootDir = process.cwd()) {
  const configPath = getOmoProviderConfigPath(rootDir);
  const raw = readJsonIfExists(configPath);

  return {
    configPath,
    config: {
      claude: mergeProviderSection(DEFAULT_OMO_PROVIDER_CONFIG.claude, raw?.claude),
      codex: mergeProviderSection(DEFAULT_OMO_PROVIDER_CONFIG.codex, raw?.codex),
    },
  };
}

export function resolveClaudeProviderConfig({
  rootDir = process.cwd(),
  provider,
  bin,
  model,
  effort,
} = {}) {
  const { config, configPath } = readOmoProviderConfig(rootDir);

  return {
    provider:
      typeof provider === "string" && provider.trim().length > 0
        ? provider.trim()
        : config.claude.provider,
    bin:
      typeof bin === "string" && bin.trim().length > 0
        ? bin.trim()
        : config.claude.bin,
    model:
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : config.claude.model,
    effort:
      typeof effort === "string" && effort.trim().length > 0
        ? effort.trim()
        : config.claude.effort,
    permissionMode:
      typeof config.claude.permission_mode === "string" &&
      config.claude.permission_mode.trim().length > 0
        ? config.claude.permission_mode.trim()
        : DEFAULT_OMO_PROVIDER_CONFIG.claude.permission_mode,
    configPath,
  };
}

export function resolveCodexProviderConfig({
  rootDir = process.cwd(),
  bin,
  agent,
} = {}) {
  const { config, configPath } = readOmoProviderConfig(rootDir);

  return {
    provider: "opencode",
    bin:
      typeof bin === "string" && bin.trim().length > 0
        ? bin.trim()
        : config.codex.bin,
    agent:
      typeof agent === "string" && agent.trim().length > 0
        ? agent.trim()
        : config.codex.agent,
    configPath,
  };
}
