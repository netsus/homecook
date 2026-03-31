#!/usr/bin/env node

import path from "node:path";

import {
  buildEvalArtifactPaths,
  parseCliArgs,
  runEvalSuite,
  writeJsonFile,
} from "./lib/qa-system.mjs";

const args = parseCliArgs(process.argv.slice(2));
const manifestPath =
  typeof args.manifest === "string" ? args.manifest : "qa/evals/manifest.json";
const outputRoot =
  typeof args["output-dir"] === "string"
    ? args["output-dir"]
    : path.join(".artifacts", "qa", "evals");

const suiteResult = runEvalSuite(manifestPath);
const artifactPaths = buildEvalArtifactPaths({ baseDir: outputRoot });

writeJsonFile(artifactPaths.summaryPath, suiteResult);
writeJsonFile(artifactPaths.latestPath, suiteResult);

for (const caseResult of suiteResult.cases) {
  writeJsonFile(
    path.join(artifactPaths.outputDir, `${caseResult.caseId}.json`),
    caseResult,
  );
}

process.stdout.write(`${JSON.stringify(suiteResult, null, 2)}\n`);

if (!suiteResult.pass) {
  console.error(
    `QA eval suite ${suiteResult.suiteId} failed for cases: ${suiteResult.failedCases.join(", ")}`,
  );
  process.exit(1);
}
