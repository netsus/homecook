#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  parseCliArgs,
  scoreExploratoryReport,
  validateExploratoryReport,
} from "./lib/qa-system.mjs";

const args = parseCliArgs(process.argv.slice(2));
const checklistPath = typeof args.checklist === "string" ? args.checklist : "";
const reportPath = typeof args.report === "string" ? args.report : "";
const failUnder = Number(args["fail-under"] ?? "80");

if (!checklistPath || !reportPath) {
  console.error("Usage: pnpm qa:eval -- --checklist <path> --report <path> [--fail-under 80]");
  process.exit(1);
}

const checklist = JSON.parse(readFileSync(checklistPath, "utf8"));
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const validationErrors = validateExploratoryReport(report, checklist);

if (validationErrors.length > 0) {
  console.error("Exploratory QA report validation failed:");
  for (const error of validationErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const score = scoreExploratoryReport(report, checklist);
process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);

if (score.total < failUnder) {
  console.error(`Exploratory QA score ${score.total} is below fail-under ${failUnder}.`);
  process.exit(1);
}
