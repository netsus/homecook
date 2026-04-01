#!/usr/bin/env node

import { dirname } from "node:path";

import {
  evaluateExploratoryEvalCaseFile,
  parseCliArgs,
  readJsonFile,
  scoreExploratoryReport,
  validateExploratoryReport,
  writeJsonFile,
} from "./lib/qa-system.mjs";

const args = parseCliArgs(process.argv.slice(2));
const checklistPath = typeof args.checklist === "string" ? args.checklist : "";
const reportPath = typeof args.report === "string" ? args.report : "";
const casePath = typeof args.case === "string" ? args.case : "";
const failUnder = Number(args["fail-under"] ?? "85");

function resolveDefaultOutputPath() {
  if (typeof args.output === "string" && args.output.trim().length > 0) {
    return args.output;
  }

  if (reportPath) {
    return `${dirname(reportPath)}/eval-result.json`;
  }

  if (casePath) {
    return `.artifacts/qa/evals/manual/${casePath.replace(/[^a-zA-Z0-9-]+/g, "-")}.json`;
  }

  return ".artifacts/qa/evals/manual/eval-result.json";
}

if (casePath) {
  const result = evaluateExploratoryEvalCaseFile(casePath);
  writeJsonFile(resolveDefaultOutputPath(), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.score.pass) {
    console.error(`Exploratory QA eval case ${result.caseId} did not meet thresholds.`);
    process.exit(1);
  }

  process.exit(0);
}

if (!checklistPath || !reportPath) {
  console.error(
    "Usage: pnpm qa:eval -- --checklist <path> --report <path> [--fail-under 85] [--output <path>]\n" +
      "   or: pnpm qa:eval -- --case <qa/evals/cases/*.json> [--output <path>]",
  );
  process.exit(1);
}

const checklist = readJsonFile(checklistPath);
const report = readJsonFile(reportPath);
const validationErrors = validateExploratoryReport(report, checklist);
const score = scoreExploratoryReport(report, checklist);
const result = {
  schemaVersion: "1.0",
  mode: "coverage-sensitive",
  generatedAt: new Date().toISOString(),
  checklistPath,
  reportPath,
  validationErrors,
  score: {
    ...score,
    pass: validationErrors.length === 0 && score.total >= failUnder,
    thresholds: {
      minTotal: failUnder,
    },
  },
};

writeJsonFile(resolveDefaultOutputPath(), result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (validationErrors.length > 0) {
  console.error("Exploratory QA report validation failed:");
  for (const error of validationErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (score.total < failUnder) {
  console.error(`Exploratory QA score ${score.total} is below fail-under ${failUnder}.`);
  process.exit(1);
}
