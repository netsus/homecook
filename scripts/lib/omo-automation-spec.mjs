import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXECUTION_MODES = new Set(["manual", "autonomous"]);
const MERGE_POLICIES = new Set(["manual", "conditional-auto"]);
const RISK_CLASSES = new Set(["low", "medium", "high", "critical"]);

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

function ensureEnum(value, values, label) {
  const normalized = ensureNonEmptyString(value, label);
  if (!values.has(normalized)) {
    throw new Error(`${label} must be one of: ${[...values].join(", ")}`);
  }

  return normalized;
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) =>
    ensureNonEmptyString(entry, `${label}[${index}]`),
  );
}

function normalizeScope(scope, label, requiredKeys) {
  const normalizedScope = ensureObject(scope, label);
  const normalized = {};

  for (const key of requiredKeys) {
    normalized[key] = normalizeStringArray(normalizedScope[key] ?? [], `${label}.${key}`);
  }

  return normalized;
}

function normalizeMaxFixRounds(value) {
  const normalized = ensureObject(value, "automationSpec.max_fix_rounds");
  const backend = Number(normalized.backend);
  const frontend = Number(normalized.frontend);

  if (!Number.isInteger(backend) || backend < 1) {
    throw new Error("automationSpec.max_fix_rounds.backend must be a positive integer.");
  }

  if (!Number.isInteger(frontend) || frontend < 1) {
    throw new Error("automationSpec.max_fix_rounds.frontend must be a positive integer.");
  }

  return {
    backend,
    frontend,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function resolveAutomationSpecPath({
  rootDir = process.cwd(),
  slice,
}) {
  return resolve(
    rootDir,
    "docs",
    "workpacks",
    ensureNonEmptyString(slice, "slice"),
    "automation-spec.json",
  );
}

export function normalizeAutomationSpec(rawSpec) {
  const spec = ensureObject(rawSpec, "automationSpec");

  return {
    slice_id: ensureNonEmptyString(spec.slice_id, "automationSpec.slice_id"),
    execution_mode: ensureEnum(
      spec.execution_mode,
      EXECUTION_MODES,
      "automationSpec.execution_mode",
    ),
    risk_class: ensureEnum(spec.risk_class, RISK_CLASSES, "automationSpec.risk_class"),
    merge_policy: ensureEnum(
      spec.merge_policy,
      MERGE_POLICIES,
      "automationSpec.merge_policy",
    ),
    backend: normalizeScope(spec.backend, "automationSpec.backend", [
      "required_endpoints",
      "invariants",
      "verify_commands",
      "required_test_targets",
    ]),
    frontend: normalizeScope(spec.frontend, "automationSpec.frontend", [
      "required_routes",
      "required_states",
      "playwright_projects",
      "artifact_assertions",
    ]),
    external_smokes: normalizeStringArray(
      spec.external_smokes ?? [],
      "automationSpec.external_smokes",
    ),
    blocked_conditions: normalizeStringArray(
      spec.blocked_conditions ?? [],
      "automationSpec.blocked_conditions",
    ),
    max_fix_rounds: normalizeMaxFixRounds(spec.max_fix_rounds ?? {}),
  };
}

export function readAutomationSpec({
  rootDir = process.cwd(),
  slice,
  required = false,
} = {}) {
  const automationSpecPath = resolveAutomationSpecPath({
    rootDir,
    slice,
  });

  if (!existsSync(automationSpecPath)) {
    if (required) {
      throw new Error(`Automation spec not found: ${automationSpecPath}`);
    }

    return {
      automationSpecPath,
      automationSpec: null,
    };
  }

  return {
    automationSpecPath,
    automationSpec: normalizeAutomationSpec(readJson(automationSpecPath)),
  };
}

export function resolveAutonomousSlicePolicy({
  workItem,
  automationSpec,
} = {}) {
  if (!workItem || typeof workItem !== "object" || !automationSpec) {
    return {
      autonomous: false,
      reason: "missing_policy",
      mergeEligible: false,
    };
  }

  const executionMode =
    workItem.workflow?.execution_mode ?? automationSpec.execution_mode;
  const mergePolicy =
    workItem.workflow?.merge_policy ?? automationSpec.merge_policy;
  const riskClass = automationSpec.risk_class;
  const isProductPreset =
    workItem.change_type === "product" &&
    ["vertical-slice-strict", "vertical-slice-light"].includes(workItem.preset);

  const autonomous =
    executionMode === "autonomous" &&
    mergePolicy === "conditional-auto" &&
    isProductPreset &&
    ["low", "medium"].includes(riskClass);

  return {
    autonomous,
    reason: autonomous ? "eligible" : "manual_or_high_risk",
    mergeEligible: autonomous,
    executionMode,
    mergePolicy,
    riskClass,
  };
}

export function resolveStageAutomationConfig({
  automationSpec,
  stage,
} = {}) {
  if (!automationSpec) {
    return null;
  }

  if (Number(stage) === 2) {
    return {
      stage: "backend",
      ...automationSpec.backend,
      external_smokes: [...automationSpec.external_smokes],
      blocked_conditions: [...automationSpec.blocked_conditions],
      max_fix_rounds: automationSpec.max_fix_rounds.backend,
    };
  }

  if (Number(stage) === 4) {
    return {
      stage: "frontend",
      ...automationSpec.frontend,
      external_smokes: [...automationSpec.external_smokes],
      blocked_conditions: [...automationSpec.blocked_conditions],
      max_fix_rounds: automationSpec.max_fix_rounds.frontend,
    };
  }

  return null;
}
