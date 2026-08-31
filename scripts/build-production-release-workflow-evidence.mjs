#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseWorkflowEvidence,
} from "./lib/github-production-release-attestation.mjs";

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
    "release_sha", "repository", "run_attempt", "run_id", "run_json", "source_ref",
    "suite_exclusion_output", "workflow_authority_output", "workflow_head_sha",
    "workflow_head_tree", "workflow_id", "workflow_path",
  ];
  for (const key of required) {
    if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required.`);
  }
  const evidence = buildGitHubProductionReleaseWorkflowEvidence({
    releaseSha: options.release_sha,
    repository: options.repository,
    run: JSON.parse(readFileSync(options.run_json, "utf8")),
    runAttempt: Number(options.run_attempt),
    runId: Number(options.run_id),
    sourceRef: options.source_ref,
    workflowHeadSha: options.workflow_head_sha,
    workflowHeadTree: options.workflow_head_tree,
    workflowId: Number(options.workflow_id),
    workflowPath: options.workflow_path,
  });
  writeFileSync(
    options.workflow_authority_output,
    `${JSON.stringify(evidence.workflow_authority, null, 2)}\n`,
  );
  writeFileSync(
    options.suite_exclusion_output,
    `${JSON.stringify(evidence.suite_exclusion, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
