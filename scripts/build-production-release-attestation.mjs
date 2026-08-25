#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
} from "./lib/github-production-release-attestation.mjs";

function parseArgs(argv) {
  const options = {
    checkRunsPath: null,
    predicateOutputPath: null,
    releaseSha: null,
    releaseTag: null,
    releaseTree: null,
    repository: null,
    subjectOutputPath: null,
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
    } else if (token === "--predicate-output") {
      options.predicateOutputPath = value;
    } else if (token === "--release-sha") {
      options.releaseSha = value;
    } else if (token === "--release-tag") {
      options.releaseTag = value;
    } else if (token === "--release-tree") {
      options.releaseTree = value;
    } else if (token === "--repository") {
      options.repository = value;
    } else if (token === "--subject-output") {
      options.subjectOutputPath = value;
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
  if (!options.subjectOutputPath) {
    throw new Error("--subject-output <path> is required.");
  }
  if (!options.predicateOutputPath) {
    throw new Error("--predicate-output <path> is required.");
  }

  const checkRuns = JSON.parse(readFileSync(options.checkRunsPath, "utf8"));
  const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
    checkRuns,
    predicateOutputPath: options.predicateOutputPath,
    releaseSha: options.releaseSha,
    releaseTag: options.releaseTag,
    releaseTree: options.releaseTree,
    repository: options.repository,
    subjectOutputPath: options.subjectOutputPath,
  });

  process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
