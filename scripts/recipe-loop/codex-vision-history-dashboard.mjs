#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readJsonl, regenerateRunDocs, repoRelative } from "./lib/codex-vision-history.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function printHelp() {
  process.stdout.write(`Usage:
node scripts/recipe-loop/codex-vision-history-dashboard.mjs \\
  --run-dir notebooks/recipe_loop_runs/codex-vision-keyframes-20260628
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`unexpected positional argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

export function buildHistoryDashboard({ runDir, cwd = process.cwd() }) {
  const resolvedRunDir = path.resolve(cwd, runDir);
  const historyPath = path.join(resolvedRunDir, "history.jsonl");
  const entries = readJsonl(historyPath);
  regenerateRunDocs(resolvedRunDir);
  return { entries, runDir: resolvedRunDir };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const runDir = args["run-dir"];
  if (!runDir) throw new Error("missing required --run-dir");
  const result = buildHistoryDashboard({ runDir, cwd: repoRoot });
  process.stdout.write(`regenerated ${repoRelative(result.runDir)} (${result.entries.length} iterations)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
