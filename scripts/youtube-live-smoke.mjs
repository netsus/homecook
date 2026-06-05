#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateLiveExtractorCorpus,
  validateYoutubeLiveExtractionReport,
} from "./validate-youtube-live-extraction-report.mjs";

const ROOT = process.cwd();
const URL_SETS = {
  "recipio-12": "scripts/youtube-live-smoke-recipio-12-urls.json",
};

function parseArgs(argv) {
  const args = {
    artifactDir: null,
    baseUrl: null,
    fullScreenshots: false,
    keepServer: false,
    noServer: false,
    port: null,
    set: null,
    urls: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--set" && next) {
      args.set = next;
      index += 1;
      continue;
    }

    if (token === "--url" && next) {
      args.urls.push(next);
      index += 1;
      continue;
    }

    if (token === "--artifact-dir" && next) {
      args.artifactDir = next;
      index += 1;
      continue;
    }

    if (token === "--base-url" && next) {
      args.baseUrl = next;
      args.noServer = true;
      index += 1;
      continue;
    }

    if (token === "--port" && next) {
      args.port = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (token === "--no-server") {
      args.noServer = true;
      continue;
    }

    if (token === "--keep-server") {
      args.keepServer = true;
      continue;
    }

    if (token === "--full-screenshots") {
      args.fullScreenshots = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.set && args.urls.length === 0) {
    args.set = "recipio-12";
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  pnpm youtube:smoke:live -- --set recipio-12",
      "  pnpm youtube:smoke:live -- --url https://www.youtube.com/watch?v=lTCplQtiGw8",
      "",
      "The live smoke wrapper accepts only YouTube URL strings as extraction input.",
    ].join("\n") + "\n",
  );
}

async function readUrlSet(setName) {
  const relativePath = URL_SETS[setName];
  if (!relativePath) {
    throw new Error(`Unknown URL set: ${setName}`);
  }

  const resolvedPath = path.join(ROOT, relativePath);
  const urls = JSON.parse(await readFile(resolvedPath, "utf8"));
  const validation = validateLiveExtractorCorpus(urls);
  if (!validation.ok) {
    throw new Error(`Invalid live URL corpus: ${validation.errors.map((error) => error.message).join("; ")}`);
  }

  return {
    corpusPath: relativePath,
    urls,
  };
}

function assertLiveEnvironment() {
  if (process.env.NODE_ENV === "test") {
    throw new Error("youtube:smoke:live cannot run with NODE_ENV=test.");
  }

  if (process.env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER === "1") {
    throw new Error("youtube:smoke:live requires HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=0.");
  }
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertLiveEnvironment();

  const selected = args.urls.length > 0
    ? { corpusPath: null, urls: args.urls }
    : await readUrlSet(args.set);
  const runId = `youtube-live-smoke-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.resolve(
    args.artifactDir ?? path.join(ROOT, ".artifacts", "youtube-live-smoke", runId),
  );
  await mkdir(artifactDir, { recursive: true });

  const smokeArgs = [
    "scripts/youtube-real-app-route-smoke.mjs",
    "--artifact-dir",
    artifactDir,
  ];

  for (const url of selected.urls) {
    smokeArgs.push("--url", url);
  }

  if (args.baseUrl) {
    smokeArgs.push("--base-url", args.baseUrl);
  }
  if (args.noServer) {
    smokeArgs.push("--no-server");
  }
  if (args.keepServer) {
    smokeArgs.push("--keep-server");
  }
  if (args.fullScreenshots) {
    smokeArgs.push("--full-screenshots");
  }
  if (args.port) {
    smokeArgs.push("--port", String(args.port));
  }

  await runCommand("node", smokeArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      HOMECOOK_YOUTUBE_FIXTURE_PROVIDER: "0",
      YOUTUBE_LIVE_EXTRACTOR_CORPUS_PATH: selected.corpusPath ?? "",
      YOUTUBE_LIVE_SMOKE_COMMAND: "pnpm youtube:smoke:live",
    },
  });

  const reportPath = path.join(artifactDir, "report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const validation = await validateYoutubeLiveExtractionReport(report, { rootDir: ROOT });
  process.stdout.write(`Live report validation:\n${JSON.stringify(validation, null, 2)}\n`);

  if (!validation.ok) {
    throw new Error(`Live report validation failed for ${reportPath}`);
  }

  process.stdout.write(`Live smoke report: ${reportPath}\n`);
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
