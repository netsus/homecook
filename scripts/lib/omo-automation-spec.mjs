import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EXECUTION_MODES = new Set(["manual", "autonomous"]);
const MERGE_POLICIES = new Set(["manual", "conditional-auto"]);
const RISK_CLASSES = new Set(["low", "medium", "high", "critical"]);
const DESIGN_AUTHORITY_UI_RISKS = new Set([
  "not-required",
  "low-risk",
  "new-screen",
  "high-risk",
  "anchor-extension",
]);

/**
 * @typedef {{
 *   required_endpoints: string[],
 *   invariants: string[],
 *   verify_commands: string[],
 *   required_test_targets: string[],
 * }} AutomationBackendSpec
 *
 * @typedef {{
 *   ui_risk: string,
 *   anchor_screens: string[],
 *   required_screens: string[],
 *   generator_required: boolean,
 *   generator_artifact: string|null,
 *   critic_required: boolean,
 *   critic_artifact: string|null,
 *   authority_required: boolean,
 *   stage4_evidence_requirements: string[],
 *   authority_report_paths: string[],
 * }} AutomationDesignAuthoritySpec
 *
 * @typedef {{
 *   required_routes: string[],
 *   required_states: string[],
 *   verify_commands: string[],
 *   playwright_projects: string[],
 *   artifact_assertions: string[],
 *   design_authority: AutomationDesignAuthoritySpec,
 * }} AutomationFrontendSpec
 *
 * @typedef {{
 *   slice_id: string,
 *   execution_mode: string,
 *   risk_class: string,
 *   merge_policy: string,
 *   backend: AutomationBackendSpec,
 *   frontend: AutomationFrontendSpec,
 *   external_smokes: string[],
 *   blocked_conditions: string[],
 *   max_fix_rounds: { backend: number, frontend: number },
 * }} AutomationSpec
 */

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

  if (!Number.isInteger(backend) || backend < 0) {
    throw new Error("automationSpec.max_fix_rounds.backend must be a non-negative integer.");
  }

  if (!Number.isInteger(frontend) || frontend < 0) {
    throw new Error("automationSpec.max_fix_rounds.frontend must be a non-negative integer.");
  }

  return {
    backend,
    frontend,
  };
}

function normalizeBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function normalizeNullableString(value, label) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string or null.`);
  }

  return value.trim();
}

function normalizeDesignAuthority(value, label) {
  if (!value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return {
      ui_risk: "not-required",
      anchor_screens: [],
      required_screens: [],
      generator_required: false,
      generator_artifact: null,
      critic_required: false,
      critic_artifact: null,
      authority_required: false,
      stage4_evidence_requirements: [],
      authority_report_paths: [],
    };
  }

  const normalized = ensureObject(value, label);

  return {
    ui_risk: ensureEnum(
      normalized.ui_risk,
      DESIGN_AUTHORITY_UI_RISKS,
      `${label}.ui_risk`,
    ),
    anchor_screens: normalizeStringArray(
      normalized.anchor_screens ?? [],
      `${label}.anchor_screens`,
    ),
    required_screens: normalizeStringArray(
      normalized.required_screens ?? [],
      `${label}.required_screens`,
    ),
    generator_required: normalizeBoolean(
      normalized.generator_required,
      `${label}.generator_required`,
    ),
    generator_artifact: normalizeNullableString(
      normalized.generator_artifact,
      `${label}.generator_artifact`,
    ),
    critic_required: normalizeBoolean(
      normalized.critic_required,
      `${label}.critic_required`,
    ),
    critic_artifact: normalizeNullableString(
      normalized.critic_artifact,
      `${label}.critic_artifact`,
    ),
    authority_required: normalizeBoolean(
      normalized.authority_required,
      `${label}.authority_required`,
    ),
    stage4_evidence_requirements: normalizeStringArray(
      normalized.stage4_evidence_requirements ?? [],
      `${label}.stage4_evidence_requirements`,
    ),
    authority_report_paths: normalizeStringArray(
      normalized.authority_report_paths ?? [],
      `${label}.authority_report_paths`,
    ),
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function uniqueStringArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim()),
    ),
  );
}

/**
 * @param {{ rootDir?: string, slice?: string, worktreePath?: string|null }} options
 * @returns {string}
 */
export function resolveAutomationSpecPath({
  rootDir = process.cwd(),
  slice,
  worktreePath = null,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const candidatePaths = [
    resolve(rootDir, "docs", "workpacks", normalizedSlice, "automation-spec.json"),
  ];

  if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
    candidatePaths.push(
      resolve(worktreePath.trim(), "docs", "workpacks", normalizedSlice, "automation-spec.json"),
    );
  }

  candidatePaths.push(
    resolve(rootDir, ".worktrees", normalizedSlice, "docs", "workpacks", normalizedSlice, "automation-spec.json"),
  );

  return candidatePaths.find((candidatePath) => existsSync(candidatePath)) ?? candidatePaths[0];
}

/**
 * @param {unknown} rawSpec
 * @returns {AutomationSpec}
 */
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
    frontend: {
      ...normalizeScope(spec.frontend, "automationSpec.frontend", [
        "required_routes",
        "required_states",
        "verify_commands",
        "playwright_projects",
        "artifact_assertions",
      ]),
      design_authority: normalizeDesignAuthority(
        spec.frontend?.design_authority ?? {},
        "automationSpec.frontend.design_authority",
      ),
    },
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

/**
 * @param {{ rootDir?: string, slice?: string, worktreePath?: string|null, required?: boolean }} [options]
 * @returns {{ automationSpecPath: string, automationSpec: AutomationSpec|null }}
 */
export function readAutomationSpec({
  rootDir = process.cwd(),
  slice,
  worktreePath = null,
  required = false,
} = {}) {
  const automationSpecPath = resolveAutomationSpecPath({
    rootDir,
    slice,
    worktreePath,
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

export function updateAutomationSpecAuthorityReportPaths({
  rootDir = process.cwd(),
  slice,
  authorityReportPaths = [],
} = {}) {
  const automationSpecPath = resolveAutomationSpecPath({
    rootDir,
    slice,
  });

  if (!existsSync(automationSpecPath)) {
    return {
      changed: false,
      missing: true,
      filePath: automationSpecPath,
    };
  }

  const rawSpec = readJson(automationSpecPath);
  const nextReportPaths = uniqueStringArray(authorityReportPaths);
  const currentReportPaths = uniqueStringArray(
    rawSpec?.frontend?.design_authority?.authority_report_paths ?? [],
  );

  if (
    nextReportPaths.length === currentReportPaths.length &&
    nextReportPaths.every((entry, index) => entry === currentReportPaths[index])
  ) {
    return {
      changed: false,
      missing: false,
      filePath: automationSpecPath,
    };
  }

  const nextSpec = {
    ...rawSpec,
    frontend: {
      ...(rawSpec?.frontend ?? {}),
      design_authority: {
        ...(rawSpec?.frontend?.design_authority ?? {}),
        authority_report_paths: nextReportPaths,
      },
    },
  };

  writeFileSync(automationSpecPath, `${JSON.stringify(nextSpec, null, 2)}\n`);
  return {
    changed: true,
    missing: false,
    filePath: automationSpecPath,
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
  const uiRisk = automationSpec.frontend?.design_authority?.ui_risk ?? "not-required";
  const isProductPreset =
    workItem.change_type === "product" &&
    ["vertical-slice-strict", "vertical-slice-light"].includes(workItem.preset);

  const autonomous =
    executionMode === "autonomous" &&
    isProductPreset;
  const mergeEligible =
    autonomous &&
    mergePolicy === "conditional-auto" &&
    ["low", "medium"].includes(riskClass) &&
    !["high-risk", "anchor-extension"].includes(uiRisk);

  return {
    autonomous,
    reason: !autonomous ? "missing_policy" : mergeEligible ? "eligible" : "manual_merge_required",
    mergeEligible,
    executionMode,
    mergePolicy,
    riskClass,
    uiRisk,
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
