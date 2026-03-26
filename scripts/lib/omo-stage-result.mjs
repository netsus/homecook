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
    return {
      result: ensureNonEmptyString(result.result, "stageResult.result"),
      summary_markdown: ensureNonEmptyString(
        result.summary_markdown,
        "stageResult.summary_markdown",
      ),
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
  };
}
