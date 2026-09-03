#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseExternalCheckEvidence,
} from "./lib/github-production-release-attestation.mjs";
import { normalizeExpectedReleaseContexts } from "./lib/production-release-approval-policy.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    options[token.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const required = [
    "check_run_pages_json", "check_suite_pages_json", "commit_statuses_json",
    "excluded_check_suite_ids_json", "expected_contexts", "output", "release_sha",
    "workflow_runs_json",
  ];
  for (const key of required) {
    if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required.`);
  }
  const exclusion = JSON.parse(readFileSync(options.excluded_check_suite_ids_json, "utf8"));
  if (!exclusion || !Array.isArray(exclusion.check_suite_ids)) {
    throw new Error("Excluded check suite evidence must contain check_suite_ids.");
  }
  const evidence = buildGitHubProductionReleaseExternalCheckEvidence({
    checkRunPages: JSON.parse(readFileSync(options.check_run_pages_json, "utf8")),
    checkSuitePages: JSON.parse(readFileSync(options.check_suite_pages_json, "utf8")),
    commitStatuses: JSON.parse(readFileSync(options.commit_statuses_json, "utf8")),
    excludedCheckSuiteIds: exclusion.check_suite_ids,
    expectedContexts: normalizeExpectedReleaseContexts(
      options.expected_contexts.split(",").map((value) => value.trim()).filter(Boolean),
      "expected_release_contexts",
    ),
    releaseSha: options.release_sha,
    workflowRuns: JSON.parse(readFileSync(options.workflow_runs_json, "utf8")),
  });
  writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
