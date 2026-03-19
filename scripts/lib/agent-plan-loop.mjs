import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildIssueSignature,
  buildPingPongLogMarkdown,
  evaluateLoopRound,
  formatAgentSetting,
  formatReviewMarkdown,
  normalizeReview,
  parseClaudeInvocationMetadata,
  parseCodexInvocationMetadata,
  parseStructuredOutput,
} from "./agent-loop-core.mjs";

export const DEFAULT_PLAN_CONTEXT_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/workpacks/README.md",
  "docs/engineering/subagents.md",
  "docs/engineering/agent-workflow-overview.md",
];

/**
 * @param {{ workpack?: string | null, contextFiles?: string[], workingDirectory?: string }} options
 * @returns {string[]}
 */
export function resolveContextFiles({
  workpack = null,
  contextFiles = [],
  workingDirectory = process.cwd(),
}) {
  const basePaths = DEFAULT_PLAN_CONTEXT_FILES.map((f) => resolve(workingDirectory, f));
  const workpackPaths = workpack
    ? [
        resolve(workingDirectory, "docs", "workpacks", workpack, "README.md"),
        resolve(workingDirectory, "docs", "workpacks", workpack, "acceptance.md"),
      ].filter((p) => existsSync(p))
    : [];
  const extraPaths = contextFiles.map((f) => resolve(workingDirectory, f));
  const allPaths = [
    ...new Set([...basePaths, ...workpackPaths, ...extraPaths].map((p) => resolve(p))),
  ];

  for (const filePath of allPaths) {
    if (!existsSync(filePath)) {
      throw new Error(`Context file not found: ${filePath}`);
    }
  }

  return allPaths;
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.flatMap((entry, index) => {
    if (entry === null || entry === undefined) {
      return [];
    }

    if (typeof entry !== "string") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }

    const trimmed = entry.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

export function normalizePlanResponse(response) {
  const normalized = ensureObject(response, "plan response");

  return {
    title: ensureNonEmptyString(normalized.title, "plan response.title"),
    summary: ensureNonEmptyString(normalized.summary, "plan response.summary"),
    plan_markdown: ensureNonEmptyString(
      normalized.plan_markdown,
      "plan response.plan_markdown",
    ),
    change_log: ensureStringArray(
      normalized.change_log,
      "plan response.change_log",
    ),
    assumptions: ensureStringArray(
      normalized.assumptions,
      "plan response.assumptions",
    ),
    open_questions: ensureStringArray(
      normalized.open_questions,
      "plan response.open_questions",
    ),
    out_of_scope: ensureStringArray(
      normalized.out_of_scope,
      "plan response.out_of_scope",
    ),
    sources_used: ensureStringArray(
      normalized.sources_used,
      "plan response.sources_used",
    ),
  };
}

export {
  buildIssueSignature,
  buildPingPongLogMarkdown,
  evaluateLoopRound,
  formatAgentSetting,
  formatReviewMarkdown,
  normalizeReview,
  parseClaudeInvocationMetadata,
  parseCodexInvocationMetadata,
  parseStructuredOutput,
};
