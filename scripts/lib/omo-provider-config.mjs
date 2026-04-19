import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_OMO_PROVIDER_CONFIG = {
  claude: {
    provider: "claude-cli",
    bin: "claude",
    model: "sonnet",
    effort: "high",
    permission_mode: "bypassPermissions",
  },
  codex: {
    provider: "opencode",
    bin: "opencode",
    agent: "hephaestus",
    model: "openai/gpt-5.3-codex",
    variant: "high",
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

function resolveDefaultOpencodeBin({ environment, homeDir } = {}) {
  const candidateHomeDir =
    environment?.HOME ??
    homeDir ??
    process.env.HOME ??
    null;
  const fromEnvironment =
    environment?.OPENCODE_BIN ??
    process.env.OPENCODE_BIN ??
    (typeof candidateHomeDir === "string" && candidateHomeDir.trim().length > 0
      ? resolve(candidateHomeDir, ".opencode", "bin", "opencode")
      : null);

  if (typeof fromEnvironment === "string" && fromEnvironment.trim().length > 0) {
    if (fromEnvironment.includes("/") && existsSync(fromEnvironment)) {
      return fromEnvironment;
    }

    if (!fromEnvironment.includes("/")) {
      return fromEnvironment;
    }
  }

  return "opencode";
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

export function assertSupportedClaudeProvider(provider, label = "--claude-provider") {
  if (typeof provider !== "string" || provider.trim().length === 0) {
    return undefined;
  }

  const normalizedProvider = provider.trim();
  if (normalizedProvider !== "claude-cli") {
    throw new Error(
      `Homecook OMO only supports ${label} claude-cli for Claude-owned stages. Remove the flag or pass --claude-provider claude-cli.`,
    );
  }

  return normalizedProvider;
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
  model,
  variant,
  environment,
  homeDir,
} = {}) {
  const { config, configPath } = readOmoProviderConfig(rootDir);
  const configuredBin =
    typeof bin === "string" && bin.trim().length > 0
      ? bin.trim()
      : config.codex.bin;

  return {
    provider: "opencode",
    bin:
      typeof configuredBin === "string" && configuredBin.trim().length > 0
        ? configuredBin === "opencode"
          ? resolveDefaultOpencodeBin({
              environment,
              homeDir,
            })
          : configuredBin
        : resolveDefaultOpencodeBin({
            environment,
            homeDir,
          }),
    agent:
      typeof agent === "string" && agent.trim().length > 0
        ? agent.trim()
        : config.codex.agent,
    model:
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : config.codex.model,
    variant:
      typeof variant === "string" && variant.trim().length > 0
        ? variant.trim()
        : config.codex.variant,
    configPath,
  };
}
