#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const UI_APP_PATTERNS = [
  "app/globals.css",
  "app/layout.tsx",
  "app/login/**",
  "app/page.tsx",
  "app/planner/**",
  "app/recipe/**",
  "app/cooking/**",
  "app/leftovers/**",
  "app/menu-add/**",
  "app/menu/**",
  "app/mypage/**",
  "app/pantry/**",
  "app/settings/**",
  "app/shopping/**",
];

const QA_TOOLING_PATTERNS = [
  ".github/workflows/playwright.yml",
  "lighthouserc.js",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "scripts/ci-path-filter.mjs",
  "tests/ci-path-filter.test.ts",
  "tests/playwright-workflow.test.ts",
];

const BROWSER_QA_IGNORED_PATTERNS = [
  "lib/server/recipe-extraction-lab/**",
];

const PLAYWRIGHT_SHARED_PATTERNS = [
  "qa/fixtures/**",
  "tests/e2e/assets/**",
  "tests/e2e/helpers/**",
];

const SMOKE_PATTERNS = [
  ...UI_APP_PATTERNS,
  "components/**",
  "lib/**",
  "stores/**",
  "tests/e2e/slice-*.spec.ts",
  ...PLAYWRIGHT_SHARED_PATTERNS,
  ...QA_TOOLING_PATTERNS,
];

const ACCESSIBILITY_PATTERNS = [
  ...UI_APP_PATTERNS,
  "components/**",
  "lib/mock/**",
  "tests/e2e/qa-a11y.spec.ts",
  ...PLAYWRIGHT_SHARED_PATTERNS,
  ...QA_TOOLING_PATTERNS,
];

const VISUAL_PATTERNS = [
  ...UI_APP_PATTERNS,
  "components/**",
  "lib/mock/**",
  "tests/e2e/qa-visual.spec.ts",
  "tests/e2e/qa-visual.spec.ts-snapshots/**",
  ...PLAYWRIGHT_SHARED_PATTERNS,
  ...QA_TOOLING_PATTERNS,
];

const LIGHTHOUSE_PATTERNS = [
  "app/globals.css",
  "app/layout.tsx",
  "app/page.tsx",
  "app/recipe/**",
  "components/home/**",
  "components/layout/**",
  "components/recipe/**",
  "lighthouserc.js",
  "next.config.*",
  "package.json",
  "pnpm-lock.yaml",
  "qa/lighthouse-budget.json",
];

const FULL_REGRESSION_PATTERNS = [
  ...SMOKE_PATTERNS,
  ...ACCESSIBILITY_PATTERNS,
  ...VISUAL_PATTERNS,
];

/**
 * @typedef {{ name?: string }} CiLabel
 * @typedef {{
 *   changedFiles?: string[];
 *   eventName?: string;
 *   action?: string;
 *   labels?: Array<string | CiLabel>;
 *   draft?: boolean;
 * }} CiPathFilterInput
 *
 * @typedef {{
 *   smoke: boolean;
 *   accessibility: boolean;
 *   visual: boolean;
 *   lighthouse: boolean;
 *   full_regression: boolean;
 *   complete_regression_matrix: boolean;
 * }} CiPathFilterOutput
 */

export const CI_PATH_FILTERS = {
  smoke: SMOKE_PATTERNS,
  accessibility: ACCESSIBILITY_PATTERNS,
  visual: VISUAL_PATTERNS,
  lighthouse: LIGHTHOUSE_PATTERNS,
  fullRegression: FULL_REGRESSION_PATTERNS,
};

function normalizeFilePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegexChar(char) {
  return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
}

export function globToRegExp(pattern) {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegexChar(char);
  }

  return new RegExp(`^${source}$`);
}

export function matchesPathPattern(filePath, pattern) {
  return globToRegExp(normalizeFilePath(pattern)).test(normalizeFilePath(filePath));
}

export function matchesAnyPath(filePath, patterns) {
  return patterns.some((pattern) => matchesPathPattern(filePath, pattern));
}

function hasAnyMatch(changedFiles, patterns) {
  return changedFiles.some((filePath) => matchesAnyPath(filePath, patterns));
}

function withoutBrowserQaIgnoredFiles(changedFiles) {
  return changedFiles.filter(
    (filePath) => !matchesAnyPath(filePath, BROWSER_QA_IGNORED_PATTERNS),
  );
}

/**
 * @param {Array<string | CiLabel>} labels
 */
function normalizeLabels(labels) {
  return labels.map((label) => {
    if (typeof label === "string") {
      return label;
    }

    return label?.name ?? "";
  });
}

/**
 * @param {CiPathFilterInput} [input]
 * @returns {CiPathFilterOutput}
 */
export function evaluateCiPathFilters(input = {}) {
  const {
    changedFiles = [],
    eventName = "pull_request",
    action = "",
    labels = [],
    draft = false,
  } = input;
  const files = [...new Set(changedFiles.map(normalizeFilePath).filter(Boolean))];
  const browserQaFiles = withoutBrowserQaIgnoredFiles(files);
  const labelNames = normalizeLabels(labels);
  const isManualFullRun = eventName === "workflow_dispatch" || eventName === "schedule";
  const isReadyForReview = eventName === "pull_request" && action === "ready_for_review";
  const hasFullCiLabel = labelNames.includes("full-ci");
  const completeRegressionMatrix = isManualFullRun || hasFullCiLabel;
  const hasFullRegressionChange = hasAnyMatch(browserQaFiles, FULL_REGRESSION_PATTERNS);
  const fullRegression =
    isManualFullRun ||
    hasFullCiLabel ||
    (isReadyForReview && hasFullRegressionChange) ||
    (eventName === "push" && hasFullRegressionChange);

  const forceCoreSuites = isManualFullRun || fullRegression;
  const lighthousePathChanged = hasAnyMatch(browserQaFiles, LIGHTHOUSE_PATTERNS);
  const lighthouse = isManualFullRun || (!draft && (hasFullCiLabel || lighthousePathChanged));

  return {
    smoke: forceCoreSuites || hasAnyMatch(browserQaFiles, SMOKE_PATTERNS),
    accessibility: forceCoreSuites || hasAnyMatch(browserQaFiles, ACCESSIBILITY_PATTERNS),
    visual: forceCoreSuites || hasAnyMatch(browserQaFiles, VISUAL_PATTERNS),
    lighthouse,
    full_regression: fullRegression,
    complete_regression_matrix: completeRegressionMatrix,
  };
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readGithubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !existsSync(eventPath)) {
    return {};
  }

  return JSON.parse(readFileSync(eventPath, "utf8"));
}

function resolveChangedFiles(eventName, event) {
  if (process.env.CI_CHANGED_FILES) {
    return process.env.CI_CHANGED_FILES.split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (eventName === "pull_request" && event.pull_request) {
    const baseSha = event.pull_request.base?.sha;
    const headSha = event.pull_request.head?.sha;
    const baseRef = event.pull_request.base?.ref;

    if (baseSha && headSha) {
      const files = runGit(["diff", "--name-only", `${baseSha}...${headSha}`]);
      if (files) {
        return files;
      }
    }

    if (baseRef) {
      const files = runGit(["diff", "--name-only", `origin/${baseRef}...HEAD`]);
      if (files) {
        return files;
      }
    }
  }

  if (eventName === "push") {
    const before = event.before;
    const after = event.after;

    if (before && after && !/^0+$/.test(before)) {
      const files = runGit(["diff", "--name-only", `${before}...${after}`]);
      if (files) {
        return files;
      }
    }

    if (after) {
      const files = runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", after]);
      if (files) {
        return files;
      }
    }
  }

  return [];
}

function writeGithubOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value ? "true" : "false"}`);

  if (outputPath) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "pull_request";
  const event = readGithubEvent();
  const changedFiles = resolveChangedFiles(eventName, event);
  const pullRequest = event.pull_request ?? {};
  const outputs = evaluateCiPathFilters({
    changedFiles,
    eventName,
    action: event.action ?? "",
    labels: pullRequest.labels ?? [],
    draft: Boolean(pullRequest.draft),
  });

  process.stdout.write(
    `ci-path-filter changed files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "(none)"}\n`,
  );
  writeGithubOutputs(outputs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
