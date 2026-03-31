#!/usr/bin/env node

import path from "node:path";

import {
  buildExploratoryChecklist,
  createExploratoryReportTemplate,
  parseCliArgs,
  readMarkdown,
  renderExploratoryInstructions,
  writeJsonFile,
  writeTextFile,
} from "./lib/qa-system.mjs";

const args = parseCliArgs(process.argv.slice(2));
const slice = typeof args.slice === "string" ? args.slice.trim() : "";

if (!slice) {
  console.error("Usage: pnpm qa:explore -- --slice <slice-id> [--base-url <url>] [--output-dir <dir>]");
  process.exit(1);
}

const baseUrl =
  typeof args["base-url"] === "string" ? args["base-url"] : "http://127.0.0.1:3000";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir =
  typeof args["output-dir"] === "string"
    ? args["output-dir"]
    : path.join(".artifacts", "qa", slice, timestamp);

const readmePath = path.join("docs", "workpacks", slice, "README.md");
const acceptancePath = path.join("docs", "workpacks", slice, "acceptance.md");
const readmeMarkdown = readMarkdown(readmePath);
const acceptanceMarkdown = readMarkdown(acceptancePath);

const checklist = buildExploratoryChecklist({
  slice,
  baseUrl,
  readmeMarkdown,
  acceptanceMarkdown,
});
const reportTemplate = createExploratoryReportTemplate(checklist);
const instructions = renderExploratoryInstructions(checklist, outputDir);

writeJsonFile(path.join(outputDir, "exploratory-checklist.json"), checklist);
writeJsonFile(path.join(outputDir, "exploratory-report.json"), reportTemplate);
writeTextFile(path.join(outputDir, "README.md"), instructions);

process.stdout.write(
  [
    `Exploratory QA bundle created for ${slice}`,
    `- checklist: ${path.join(outputDir, "exploratory-checklist.json")}`,
    `- report: ${path.join(outputDir, "exploratory-report.json")}`,
    `- instructions: ${path.join(outputDir, "README.md")}`,
  ].join("\n") + "\n",
);
