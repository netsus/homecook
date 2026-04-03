import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  return value.map((entry, index) =>
    ensureNonEmptyString(entry, `${label}[${index}]`),
  );
}

function ensureEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}. Got: ${JSON.stringify(value)}`);
  }
  return value;
}

function validateFinding(finding, index) {
  const label = `stageResult.findings[${index}]`;
  const f = ensureObject(finding, label);
  return {
    file: ensureNonEmptyString(f.file, `${label}.file`),
    line_hint:
      typeof f.line_hint === "number" && Number.isInteger(f.line_hint) ? f.line_hint : null,
    severity: ensureEnum(f.severity, ["critical", "major", "minor"], `${label}.severity`),
    category: ensureNonEmptyString(f.category, `${label}.category`),
    issue: ensureNonEmptyString(f.issue, `${label}.issue`),
    suggestion: ensureNonEmptyString(f.suggestion, `${label}.suggestion`),
  };
}

function validateOptionalFindings(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((f, i) => validateFinding(f, i));
}

export function resolveStageResultPath(artifactDir) {
  return resolve(ensureNonEmptyString(artifactDir, "artifactDir"), "stage-result.json");
}

export function readStageResult(artifactDir) {
  const stageResultPath = resolveStageResultPath(artifactDir);
  if (!existsSync(stageResultPath)) {
    return null;
  }

  return JSON.parse(readFileSync(stageResultPath, "utf8"));
}

export function validateStageResult(stage, stageResult) {
  const normalizedStage = Number(stage);
  const result = ensureObject(stageResult, "stageResult");

  if ([1, 2, 4].includes(normalizedStage)) {
    const fallbackCommitSubject =
      typeof result.commit?.subject === "string" && result.commit.subject.trim().length > 0
        ? result.commit.subject
        : result.pr?.title;

    return {
      result: ensureNonEmptyString(result.result, "stageResult.result"),
      summary_markdown: ensureNonEmptyString(
        result.summary_markdown,
        "stageResult.summary_markdown",
      ),
      commit: {
        subject: ensureNonEmptyString(fallbackCommitSubject, "stageResult.commit.subject"),
        body_markdown:
          typeof result.commit?.body_markdown === "string" &&
          result.commit.body_markdown.trim().length > 0
            ? result.commit.body_markdown.trim()
            : null,
      },
      pr: {
        title: ensureNonEmptyString(result.pr?.title, "stageResult.pr.title"),
        body_markdown: ensureNonEmptyString(
          result.pr?.body_markdown,
          "stageResult.pr.body_markdown",
        ),
      },
      checks_run: ensureStringArray(result.checks_run ?? [], "stageResult.checks_run"),
      next_route: ensureNonEmptyString(result.next_route, "stageResult.next_route"),
    };
  }

  return {
    decision: ensureNonEmptyString(result.decision, "stageResult.decision"),
    body_markdown: ensureNonEmptyString(
      result.body_markdown,
      "stageResult.body_markdown",
    ),
    route_back_stage:
      result.route_back_stage === null || result.route_back_stage === undefined
        ? null
        : Number(result.route_back_stage),
    approved_head_sha:
      typeof result.approved_head_sha === "string" &&
      result.approved_head_sha.trim().length > 0
        ? result.approved_head_sha.trim()
        : null,
    findings: validateOptionalFindings(result.findings),
  };
}
