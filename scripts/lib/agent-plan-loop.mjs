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
