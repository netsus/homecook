import { readFileSync } from "node:fs";

import { findEmptyPrSections, findMissingPrSections } from "./lib/git-policy.mjs";

const filePath = process.argv[2] ?? process.env.PR_BODY_FILE;

if (!filePath) {
  console.error("PR body file path is required via argv or PR_BODY_FILE.");
  process.exit(1);
}

const body = readFileSync(filePath, "utf8");
const missing = findMissingPrSections(body);

if (missing.length > 0) {
  console.error("PR body is missing required sections:");
  for (const section of missing) {
    console.error(`- ${section}`);
  }
  process.exit(1);
}

const empty = findEmptyPrSections(body);

if (empty.length > 0) {
  console.error("PR body has empty required sections (template placeholders not filled):");
  for (const section of empty) {
    console.error(`- ${section}`);
  }
  process.exit(1);
}

process.stdout.write("PR body sections OK\n");
