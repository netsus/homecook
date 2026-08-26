#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
} from "./lib/github-production-release-attestation.mjs";
import { normalizeExpectedReleaseContexts } from "./lib/production-release-approval-policy.mjs";

function parseArgs(argv) {
  const options = {
    checkRunsPath: null,
    commitStatusesPath: null,
    excludedCheckSuiteId: null,
    expectedContexts: null,
    predicateOutputPath: null,
    releaseSha: null,
    releaseTag: null,
    releaseTagObjectSha: null,
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
    } else if (token === "--commit-statuses-json") {
      options.commitStatusesPath = value;
    } else if (token === "--excluded-check-suite-id") {
      options.excludedCheckSuiteId = value;
    } else if (token === "--expected-contexts") {
      options.expectedContexts = value;
    } else if (token === "--predicate-output") {
      options.predicateOutputPath = value;
    } else if (token === "--release-sha") {
      options.releaseSha = value;
    } else if (token === "--release-tag") {
      options.releaseTag = value;
    } else if (token === "--release-tag-object-sha") {
      options.releaseTagObjectSha = value;
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
  const commitStatuses = options.commitStatusesPath
    ? JSON.parse(readFileSync(options.commitStatusesPath, "utf8"))
    : [];
  const expectedContexts = options.expectedContexts
    ? normalizeExpectedReleaseContexts(
      options.expectedContexts.split(",").map((value) => value.trim()).filter(Boolean),
      "expected_release_contexts",
    )
    : undefined;
  const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
    checkRuns,
    commitStatuses,
    excludedCheckSuiteId: options.excludedCheckSuiteId,
    expectedContexts,
    predicateOutputPath: options.predicateOutputPath,
    releaseSha: options.releaseSha,
    releaseTag: options.releaseTag,
    releaseTagObjectSha: options.releaseTagObjectSha,
    releaseTree: options.releaseTree,
    repository: options.repository,
    subjectOutputPath: options.subjectOutputPath,
  });

  process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
