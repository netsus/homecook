#!/usr/bin/env node

import { runProviderSmoke } from "./lib/omo-provider-smoke.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-smoke-providers.mjs [options]",
      "",
      "Options:",
      "  --claude-only                   Run only the Claude provider smoke",
      "  --codex-only                    Run only the Codex provider smoke",
      "  --claude-bin <path>             Override claude binary path",
      "  --opencode-bin <path>           Override opencode binary path",
      "  --artifact-base-dir <path>      Override artifact base directory",
      "  --home-dir <path>               Override HOME for provider execution",
      "  --timeout-ms <ms>                Provider execution timeout per run (default: 120000)",
      "  --allow-dirty                   Allow tracked git changes while running the smoke",
      "  --json                          Print JSON output",
      "  --help                          Show this help text",
      "",
    ].join("\n"),
  );
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    json: false,
    allowDirty: false,
    claudeOnly: false,
    codexOnly: false,
    timeoutMs: 120000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    if (token === "--claude-only") {
      options.claudeOnly = true;
      continue;
    }
    if (token === "--codex-only") {
      options.codexOnly = true;
      continue;
    }
    if (
      token === "--claude-bin" ||
      token === "--opencode-bin" ||
      token === "--artifact-base-dir" ||
      token === "--home-dir" ||
      token === "--timeout-ms"
    ) {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  options.timeoutMs = Number.parseInt(String(options.timeoutMs), 10);
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be an integer >= 1000.");
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const result = runProviderSmoke({
    rootDir: process.cwd(),
    artifactBaseDir: options.artifactBaseDir,
    homeDir: options.homeDir,
    claudeBin: options.claudeBin,
    opencodeBin: options.opencodeBin,
    claudeOnly: options.claudeOnly,
    codexOnly: options.codexOnly,
    assertClean: !options.allowDirty,
    timeoutMs: options.timeoutMs,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Provider smoke: ${result.ok ? "pass" : "fail"}`,
      `Artifact base dir: ${result.artifactBaseDir}`,
      `Timeout per provider run: ${options.timeoutMs}ms`,
      ...result.targets.map(
        (target) =>
          `- ${target.provider}: sessionReused=${target.sessionReused ? "yes" : "no"} preflight="${target.preflight.command}"`,
      ),
      ...(result.errors.length > 0 ? ["Errors:", ...result.errors.map((error) => `- ${error}`)] : []),
    ].join("\n") + "\n",
  );

  if (!result.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
}
