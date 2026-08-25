#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseAttestationDocument,
} from "./lib/github-production-release-attestation.mjs";

function parseArgs(argv) {
  const options = {
    checkRunsPath: null,
    manifestDigest: null,
    outputPath: null,
    releaseSha: null,
    releaseTag: null,
    releaseTree: null,
    repository: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--check-runs-json") {
      options.checkRunsPath = value;
    } else if (token === "--manifest-digest") {
      options.manifestDigest = value;
    } else if (token === "--output") {
      options.outputPath = value;
    } else if (token === "--release-sha") {
      options.releaseSha = value;
    } else if (token === "--release-tag") {
      options.releaseTag = value;
    } else if (token === "--release-tree") {
      options.releaseTree = value;
    } else if (token === "--repository") {
      options.repository = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.checkRunsPath) {
    throw new Error("--check-runs-json <path> is required.");
  }
  if (!options.outputPath) {
    throw new Error("--output <path> is required.");
  }

  const checkRuns = JSON.parse(readFileSync(options.checkRunsPath, "utf8"));
  const document = buildGitHubProductionReleaseAttestationDocument({
    checkRuns,
    manifestDigest: options.manifestDigest,
    outputPath: options.outputPath,
    releaseSha: options.releaseSha,
    releaseTag: options.releaseTag,
    releaseTree: options.releaseTree,
    repository: options.repository,
  });

  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
