import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  UNRESOLVED_RELEASE_TAG_INTEGRATION_ACTOR_ID,
  normalizeExpectedReleaseContexts,
} from "./production-release-approval-policy.mjs";

export const PRODUCTION_RELEASE_RULESET_SCHEMA =
  "homecook.github.repository-ruleset.v1";
export const PRODUCTION_RELEASE_APPROVAL_ENVIRONMENT_SCHEMA =
  "homecook.github.production-release-approval-environment.v1";

const APPROVAL_ENVIRONMENT_FILE =
  ".github/rulesets/production-release-approval-environment.json";
const APPROVAL_ENVIRONMENT_ACTUAL_FILE =
  "production-release-approval-environment.json";
const APPROVAL_BRANCH_POLICIES_ACTUAL_FILE =
  "production-release-approval-deployment-branch-policies.json";
const APPROVAL_ENVIRONMENT_SECRETS_ACTUAL_FILE =
  "production-release-approval-environment-secrets.json";
const EXPECTED_APPROVAL_BRANCH_POLICIES = [
  { name: "master", type: "branch" },
];
const EXPECTED_APPROVAL_ENVIRONMENT_SECRET_NAMES = [
  "HOMECOOK_RELEASE_ATTESTATION_APP_ID",
  "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
];
const RULESET_SAFETY_KEYS = [
  "bypass_actors",
  "conditions",
  "enforcement",
  "name",
  "rules",
  "target",
];
const RULESET_IGNORED_SERVER_KEYS = [
  "_links",
  "created_at",
  "current_user_can_bypass",
  "id",
  "node_id",
  "schema",
  "source",
  "source_type",
  "updated_at",
];

const EXPECTED_RULESET_FILES = [
  {
    filePath: ".github/rulesets/production-release-master.json",
    requiredRuleTypes: [
      "deletion",
      "non_fast_forward",
      "pull_request",
      "required_status_checks",
    ],
    target: "branch",
  },
  {
    bypassPolicy: "single-integration",
    exactRuleTypes: ["creation"],
    filePath: ".github/rulesets/production-release-tag-creation.json",
    requiredRuleTypes: ["creation"],
    target: "tag",
  },
  {
    bypassPolicy: "none",
    exactRuleTypes: ["deletion", "non_fast_forward", "update"],
    filePath: ".github/rulesets/production-release-tag-immutability.json",
    requiredRuleTypes: ["deletion", "non_fast_forward", "update"],
    target: "tag",
  },
];

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is unreadable or invalid JSON: ${path}`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function rejectUnknownKeys(value, allowedKeys, label) {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unknownKeys.sort().join(", ")}.`);
  }
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

function requirePositiveOrUnresolvedInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be an integer >= 0.`);
  }
  return value;
}

function normalizeRefName(refName, label) {
  const value = requireObject(refName, label);
  return {
    include: requireArray(value.include, `${label}.include`).map((entry, index) =>
      requireNonEmptyString(entry, `${label}.include[${index}]`)),
    exclude: requireArray(value.exclude ?? [], `${label}.exclude`).map((entry, index) =>
      requireNonEmptyString(entry, `${label}.exclude[${index}]`)),
  };
}

function normalizeConditions(conditions, label) {
  const value = requireObject(conditions, label);
  rejectUnknownKeys(value, ["ref_name"], label);
  return {
    ref_name: normalizeRefName(value.ref_name, `${label}.ref_name`),
  };
}

function normalizeRequiredStatusChecks(value, label) {
  return requireArray(value, label)
    .map((entry, index) => {
      const check = requireObject(entry, `${label}[${index}]`);
      rejectUnknownKeys(check, ["context", "integration_id"], `${label}[${index}]`);
      return {
        context: requireNonEmptyString(check.context, `${label}[${index}].context`),
        integration_id: check.integration_id ?? null,
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.context}:${left.integration_id ?? "null"}`;
      const rightKey = `${right.context}:${right.integration_id ?? "null"}`;
      return leftKey.localeCompare(rightKey);
    });
}

function normalizeRules(rules, label) {
  return requireArray(rules, label)
    .map((rule, index) => {
      const value = requireObject(rule, `${label}[${index}]`);
      rejectUnknownKeys(value, ["parameters", "type"], `${label}[${index}]`);
      const type = requireNonEmptyString(value.type, `${label}[${index}].type`);
      const parameters = value.parameters === undefined
        ? null
        : canonicalizeJson(
          requireObject(value.parameters, `${label}[${index}].parameters`),
        );
      if (type === "required_status_checks") {
        parameters.required_status_checks = normalizeRequiredStatusChecks(
          parameters.required_status_checks,
          `${label}[${index}].parameters.required_status_checks`,
        );
      }
      return canonicalizeJson({
        ...value,
        parameters,
        type,
      });
    })
    .sort((left, right) => left.type.localeCompare(right.type));
}

function normalizeBypassActors(bypassActors, label) {
  return requireArray(bypassActors ?? [], label)
    .map((actor, index) => {
      const value = requireObject(actor, `${label}[${index}]`);
      const actorType = requireNonEmptyString(
        value.actor_type,
        `${label}[${index}].actor_type`,
      );
      const bypassMode = requireNonEmptyString(
        value.bypass_mode,
        `${label}[${index}].bypass_mode`,
      );
      const actorId = value.actor_id;
      if (
        actorId !== undefined
        && actorId !== null
        && !Number.isInteger(actorId)
      ) {
        throw new Error(`${label}[${index}].actor_id must be an integer or null.`);
      }
      if (actorType === "RepositoryRole") {
        throw new Error(`${label}[${index}] must not grant broad repository-role bypass.`);
      }
      if (!["always", "pull_request"].includes(bypassMode)) {
        throw new Error(`${label}[${index}].bypass_mode must be always or pull_request.`);
      }
      return {
        actor_id: actorId ?? null,
        actor_type: actorType,
        bypass_mode: bypassMode,
        unresolved: actorType === "Integration"
          && actorId === UNRESOLVED_RELEASE_TAG_INTEGRATION_ACTOR_ID,
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.actor_type}:${left.actor_id ?? "null"}:${left.bypass_mode}`;
      const rightKey = `${right.actor_type}:${right.actor_id ?? "null"}:${right.bypass_mode}`;
      return leftKey.localeCompare(rightKey);
    });
}

function normalizeRuleset({ filePath, requireSchema = true, rootDir, ruleset }) {
  const value = requireObject(ruleset, filePath);
  rejectUnknownKeys(
    value,
    [...RULESET_SAFETY_KEYS, ...RULESET_IGNORED_SERVER_KEYS],
    filePath,
  );
  if (!requireSchema && value.bypass_actors === undefined) {
    throw new Error(
      `${filePath}.bypass_actors is required in the C2 admin-visible snapshot; `
      + "a GitHub API response that omits bypass actors cannot activate release policy.",
    );
  }
  const normalizedRules = normalizeRules(value.rules, `${filePath}.rules`);
  const normalizedBypassActors = normalizeBypassActors(
    value.bypass_actors ?? [],
    `${filePath}.bypass_actors`,
  );
  const requiredStatusChecksRule = normalizedRules.find(
    (rule) => rule.type === "required_status_checks",
  );
  const requiredStatusChecks = requiredStatusChecksRule?.parameters?.required_status_checks;
  const conditions = normalizeConditions(value.conditions, `${filePath}.conditions`);

  return {
    conditions,
    enforcement: requireNonEmptyString(value.enforcement, `${filePath}.enforcement`),
    name: requireNonEmptyString(value.name, `${filePath}.name`),
    required_status_contexts: requiredStatusChecks === undefined
      ? []
      : normalizeExpectedReleaseContexts(
        requiredStatusChecks.map((entry, index) =>
          requireNonEmptyString(
            entry?.context,
            `${filePath}.rules.required_status_checks[${index}].context`,
          )),
        `${filePath}.rules.required_status_checks`,
      ),
    rules: normalizedRules,
    schema: requireSchema
      ? requireNonEmptyString(value.schema, `${filePath}.schema`)
      : value.schema === undefined
        ? null
        : requireNonEmptyString(value.schema, `${filePath}.schema`),
    target: requireNonEmptyString(value.target, `${filePath}.target`),
    bypass_actors: normalizedBypassActors,
    filePath,
    rootDir: resolve(rootDir),
  };
}

function validateRulesetFile({
  bypassPolicy = null,
  exactRuleTypes = null,
  filePath,
  requiredRuleTypes,
  rootDir,
  target,
}) {
  const absolutePath = resolve(rootDir, filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Required production release ruleset file is missing: ${filePath}`);
  }

  const normalized = normalizeRuleset({
    filePath,
    requireSchema: true,
    rootDir,
    ruleset: readJson(absolutePath, "Production release ruleset"),
  });

  if (normalized.schema !== PRODUCTION_RELEASE_RULESET_SCHEMA) {
    throw new Error(`${filePath} schema must be ${PRODUCTION_RELEASE_RULESET_SCHEMA}.`);
  }
  if (normalized.target !== target) {
    throw new Error(`${filePath} target must be ${target}.`);
  }
  if (normalized.enforcement !== "active") {
    throw new Error(`${filePath} enforcement must be active.`);
  }
  const expectedRef = target === "branch" ? "refs/heads/master" : "refs/tags/prod-*";
  if (
    JSON.stringify(normalized.conditions.ref_name.include) !== JSON.stringify([expectedRef])
    || normalized.conditions.ref_name.exclude.length !== 0
  ) {
    throw new Error(`${filePath} must pin only ${expectedRef}.`);
  }

  const presentRuleTypes = new Set(normalized.rules.map((rule) => rule.type));
  for (const requiredRuleType of requiredRuleTypes) {
    if (!presentRuleTypes.has(requiredRuleType)) {
      throw new Error(`${filePath} must include the ${requiredRuleType} rule type.`);
    }
  }
  if (exactRuleTypes) {
    const normalizedExpectedRuleTypes = [...exactRuleTypes].sort();
    const normalizedPresentRuleTypes = normalized.rules.map((rule) => rule.type);
    if (
      JSON.stringify(normalizedPresentRuleTypes)
      !== JSON.stringify(normalizedExpectedRuleTypes)
    ) {
      throw new Error(
        `${filePath} rules must be exactly ${normalizedExpectedRuleTypes.join(", ")}.`,
      );
    }
  }
  if (bypassPolicy === "none" && normalized.bypass_actors.length !== 0) {
    throw new Error(`${filePath} must not define any bypass actor.`);
  }
  if (
    bypassPolicy === "single-integration"
    && (
      normalized.bypass_actors.length !== 1
      || normalized.bypass_actors[0].actor_type !== "Integration"
      || normalized.bypass_actors[0].bypass_mode !== "always"
    )
  ) {
    throw new Error(`${filePath} must define exactly one always Integration bypass actor.`);
  }
  if (normalized.target === "branch") {
    normalizeExpectedReleaseContexts(
      normalized.required_status_contexts,
      `${filePath}.required_status_contexts`,
    );
    const requiredStatusChecksRule = normalized.rules.find(
      (rule) => rule.type === "required_status_checks",
    );
    const requiredStatusChecks = requireArray(
      requiredStatusChecksRule?.parameters?.required_status_checks,
      `${filePath}.rules.required_status_checks`,
    );
    for (const [index, check] of requiredStatusChecks.entries()) {
      if (check?.integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID) {
        throw new Error(
          `${filePath}.rules.required_status_checks[${index}].integration_id must be ${GITHUB_ACTIONS_APP_INTEGRATION_ID}.`,
        );
      }
    }
  }

  return normalized;
}

function loadActualRuleset(actualDir, expectedFilePath) {
  if (!actualDir) {
    return {
      actualFilePath: null,
      normalized: null,
      present: false,
    };
  }

  const actualFilePath = resolve(actualDir, basename(expectedFilePath));
  if (!existsSync(actualFilePath)) {
    return {
      actualFilePath,
      normalized: null,
      present: false,
    };
  }

  return {
    actualFilePath,
    normalized: normalizeRuleset({
      filePath: actualFilePath,
      requireSchema: false,
      rootDir: actualDir,
      ruleset: readJson(actualFilePath, "Production release actual ruleset"),
    }),
    present: true,
  };
}

function validateApprovalEnvironment(rootDir) {
  const absolutePath = resolve(rootDir, APPROVAL_ENVIRONMENT_FILE);
  if (!existsSync(absolutePath)) {
    throw new Error(`Required approval environment policy is missing: ${APPROVAL_ENVIRONMENT_FILE}`);
  }
  const value = requireObject(
    readJson(absolutePath, "Production release approval environment policy"),
    APPROVAL_ENVIRONMENT_FILE,
  );
  if (value.schema !== PRODUCTION_RELEASE_APPROVAL_ENVIRONMENT_SCHEMA) {
    throw new Error(
      `${APPROVAL_ENVIRONMENT_FILE} schema must be ${PRODUCTION_RELEASE_APPROVAL_ENVIRONMENT_SCHEMA}.`,
    );
  }
  if (value.name !== "production-release-approval") {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} name must be production-release-approval.`);
  }
  if (value.repository !== "netsus/homecook" || value.source_ref !== "refs/heads/master") {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} must pin netsus/homecook refs/heads/master.`);
  }
  const deploymentBranchPolicy = requireObject(
    value.deployment_branch_policy,
    `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policy`,
  );
  const reviewers = requireArray(
    value.required_reviewers,
    `${APPROVAL_ENVIRONMENT_FILE}.required_reviewers`,
  ).map((reviewer, index) => {
    const entry = requireObject(
      reviewer,
      `${APPROVAL_ENVIRONMENT_FILE}.required_reviewers[${index}]`,
    );
    const actorType = requireNonEmptyString(
      entry.actor_type,
      `${APPROVAL_ENVIRONMENT_FILE}.required_reviewers[${index}].actor_type`,
    );
    if (!["User", "Team", "Unresolved"].includes(actorType)) {
      throw new Error(`${APPROVAL_ENVIRONMENT_FILE} reviewer actor_type must be User, Team, or Unresolved.`);
    }
    return {
      actor_id: requirePositiveOrUnresolvedInteger(
        entry.actor_id,
        `${APPROVAL_ENVIRONMENT_FILE}.required_reviewers[${index}].actor_id`,
      ),
      actor_type: actorType,
    };
  });
  if (reviewers.length !== 1) {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} must define exactly one required reviewer.`);
  }
  if (
    (reviewers[0].actor_id === 0) !== (reviewers[0].actor_type === "Unresolved")
  ) {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} unresolved reviewer id and type must change together.`);
  }
  const branches = requireArray(
    value.master_only_branches,
    `${APPROVAL_ENVIRONMENT_FILE}.master_only_branches`,
  );
  if (JSON.stringify(branches) !== JSON.stringify(["master"])) {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} must be master-only.`);
  }
  const deploymentBranchPolicies = requireArray(
    value.deployment_branch_policies,
    `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policies`,
  ).map((entry, index) => {
    const policy = requireObject(
      entry,
      `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policies[${index}]`,
    );
    return {
      name: requireNonEmptyString(
        policy.name,
        `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policies[${index}].name`,
      ),
      type: requireNonEmptyString(
        policy.type,
        `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policies[${index}].type`,
      ),
    };
  });
  if (
    JSON.stringify(deploymentBranchPolicies)
    !== JSON.stringify(EXPECTED_APPROVAL_BRANCH_POLICIES)
  ) {
    throw new Error(
      `${APPROVAL_ENVIRONMENT_FILE} deployment branch policies must be exactly master branch only.`,
    );
  }
  const environmentSecretNames = requireArray(
    value.environment_secret_names,
    `${APPROVAL_ENVIRONMENT_FILE}.environment_secret_names`,
  ).map((name, index) => requireNonEmptyString(
    name,
    `${APPROVAL_ENVIRONMENT_FILE}.environment_secret_names[${index}]`,
  ));
  if (
    JSON.stringify(environmentSecretNames)
    !== JSON.stringify(EXPECTED_APPROVAL_ENVIRONMENT_SECRET_NAMES)
  ) {
    throw new Error(
      `${APPROVAL_ENVIRONMENT_FILE} environment secrets must be exactly the App ID and private key.`,
    );
  }
  const normalized = {
    can_admins_bypass: requireBoolean(
      value.can_admins_bypass,
      `${APPROVAL_ENVIRONMENT_FILE}.can_admins_bypass`,
    ),
    deployment_branch_policy: {
      custom_branch_policies: requireBoolean(
        deploymentBranchPolicy.custom_branch_policies,
        `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policy.custom_branch_policies`,
      ),
      protected_branches: requireBoolean(
        deploymentBranchPolicy.protected_branches,
        `${APPROVAL_ENVIRONMENT_FILE}.deployment_branch_policy.protected_branches`,
      ),
    },
    deployment_branch_policies: deploymentBranchPolicies,
    environment_secret_names: environmentSecretNames,
    master_only_branches: branches,
    name: value.name,
    prevent_self_review: requireBoolean(
      value.prevent_self_review,
      `${APPROVAL_ENVIRONMENT_FILE}.prevent_self_review`,
    ),
    repository: value.repository,
    required_reviewers: reviewers,
    source_ref: value.source_ref,
    wait_timer: value.wait_timer,
  };
  if (
    normalized.can_admins_bypass !== false
    || normalized.wait_timer !== 0
    || normalized.prevent_self_review !== true
    || normalized.deployment_branch_policy.custom_branch_policies !== true
    || normalized.deployment_branch_policy.protected_branches !== false
  ) {
    throw new Error(`${APPROVAL_ENVIRONMENT_FILE} must disable admin bypass, set wait_timer to 0, require self-review prevention, and use a custom master-only policy.`);
  }
  return normalized;
}

function loadActualApprovalEnvironment(actualDir, desired) {
  if (!actualDir) {
    return { matched: false, mismatches: [], present: false };
  }
  const environmentPath = resolve(actualDir, APPROVAL_ENVIRONMENT_ACTUAL_FILE);
  const branchPoliciesPath = resolve(actualDir, APPROVAL_BRANCH_POLICIES_ACTUAL_FILE);
  const environmentSecretsPath = resolve(
    actualDir,
    APPROVAL_ENVIRONMENT_SECRETS_ACTUAL_FILE,
  );
  if (
    !existsSync(environmentPath)
    || !existsSync(branchPoliciesPath)
    || !existsSync(environmentSecretsPath)
  ) {
    return { matched: false, mismatches: [], present: false };
  }
  const environment = requireObject(
    readJson(environmentPath, "Production release approval environment readback"),
    environmentPath,
  );
  const branchPolicies = requireObject(
    readJson(branchPoliciesPath, "Production release approval branch policy readback"),
    branchPoliciesPath,
  );
  const environmentSecrets = requireObject(
    readJson(environmentSecretsPath, "Production release approval environment secret readback"),
    environmentSecretsPath,
  );
  const reviewerRule = requireArray(
    environment.protection_rules,
    `${environmentPath}.protection_rules`,
  ).filter((rule) => rule?.type === "required_reviewers");
  const waitTimerRules = requireArray(
    environment.protection_rules,
    `${environmentPath}.protection_rules`,
  ).filter((rule) => rule?.type === "wait_timer");
  const actualReviewers = reviewerRule.length === 1
    ? requireArray(reviewerRule[0].reviewers, `${environmentPath}.reviewers`).map((entry) => ({
      actor_id: entry?.reviewer?.id,
      actor_type: entry?.type,
    }))
    : [];
  const actualBranchPolicies = requireArray(
    branchPolicies.branch_policies,
    `${branchPoliciesPath}.branch_policies`,
  ).map((entry, index) => {
    const policy = requireObject(entry, `${branchPoliciesPath}.branch_policies[${index}]`);
    return {
      name: requireNonEmptyString(
        policy.name,
        `${branchPoliciesPath}.branch_policies[${index}].name`,
      ),
      type: requireNonEmptyString(
        policy.type,
        `${branchPoliciesPath}.branch_policies[${index}].type`,
      ),
    };
  });
  const actualSecretNames = requireArray(
    environmentSecrets.secrets,
    `${environmentSecretsPath}.secrets`,
  ).map((entry, index) => requireNonEmptyString(
    requireObject(entry, `${environmentSecretsPath}.secrets[${index}]`).name,
    `${environmentSecretsPath}.secrets[${index}].name`,
  )).sort();
  if (new Set(actualSecretNames).size !== actualSecretNames.length) {
    throw new Error(`${environmentSecretsPath}.secrets must not contain duplicate names.`);
  }
  const actual = {
    can_admins_bypass: environment.can_admins_bypass,
    deployment_branch_policy: {
      custom_branch_policies:
        environment.deployment_branch_policy?.custom_branch_policies,
      protected_branches:
        environment.deployment_branch_policy?.protected_branches,
    },
    deployment_branch_policies: actualBranchPolicies,
    environment_secret_names: actualSecretNames,
    master_only_branches: actualBranchPolicies
      .filter((entry) => entry.type === "branch")
      .map((entry) => entry.name),
    name: environment.name,
    prevent_self_review: reviewerRule[0]?.prevent_self_review,
    repository: "netsus/homecook",
    required_reviewers: actualReviewers,
    source_ref: "refs/heads/master",
    wait_timer: waitTimerRules.length === 0
      ? 0
      : waitTimerRules.length === 1
        ? waitTimerRules[0]?.wait_timer
        : null,
  };
  const mismatches = [];
  if (actual.can_admins_bypass !== false) {
    mismatches.push("approval_environment_admin_bypass_mismatch");
  }
  if (actual.wait_timer !== 0) {
    mismatches.push("approval_environment_wait_timer_mismatch");
  }
  if (
    JSON.stringify(actual.deployment_branch_policies)
    !== JSON.stringify(desired.deployment_branch_policies)
  ) {
    mismatches.push("approval_environment_deployment_branch_policy_mismatch");
  }
  if (
    JSON.stringify(actual.environment_secret_names)
    !== JSON.stringify(desired.environment_secret_names)
  ) {
    mismatches.push("approval_environment_secret_inventory_mismatch");
  }
  const comparableActual = {
    ...actual,
    deployment_branch_policies: desired.deployment_branch_policies,
    environment_secret_names: desired.environment_secret_names,
  };
  if (JSON.stringify(comparableActual) !== JSON.stringify(desired)) {
    mismatches.push("approval_environment_mismatch");
  }
  return {
    matched: mismatches.length === 0,
    mismatches,
    present: true,
  };
}

function rulesetComparisonProjection(value) {
  return {
    conditions: value.conditions,
    enforcement: value.enforcement,
    name: value.name,
    required_status_contexts: value.required_status_contexts,
    rules: value.rules,
    target: value.target,
    bypass_actors: value.bypass_actors.map((actor) => ({
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      bypass_mode: actor.bypass_mode,
    })),
  };
}

function sameRuleset(left, right) {
  return JSON.stringify(rulesetComparisonProjection(left))
    === JSON.stringify(rulesetComparisonProjection(right));
}

export function normalizeProductionReleaseRulesetForComparison(value, label = "production release ruleset") {
  const normalized = normalizeRuleset({
    filePath: label,
    requireSchema: false,
    rootDir: process.cwd(),
    ruleset: value,
  });
  return rulesetComparisonProjection(normalized);
}

export function productionReleaseRulesetsSemanticallyEqual(left, right) {
  const normalizedLeft = normalizeProductionReleaseRulesetForComparison(
    left,
    "actual production release ruleset",
  );
  const normalizedRight = normalizeProductionReleaseRulesetForComparison(
    right,
    "desired production release ruleset",
  );
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export function getProductionReleaseRulesetPlan({
  actualDir = null,
  rootDir = process.cwd(),
} = {}) {
  const workflowPath = resolve(
    rootDir,
    ".github/workflows/production-release-attestation.yml",
  );
  if (!existsSync(workflowPath)) {
    throw new Error("Production release attestation workflow file is missing.");
  }

  let activationBlocked = false;
  let actualState = "matched";
  let unresolvedActor = false;
  const activationBlockers = [];

  const rulesets = EXPECTED_RULESET_FILES.map((entry) => {
    const desired = validateRulesetFile({
      ...entry,
      rootDir,
    });
    const actual = loadActualRuleset(actualDir, entry.filePath);
    const matched = actual.present && actual.normalized
      ? sameRuleset(desired, actual.normalized)
      : false;

    if (!actual.present) {
      activationBlocked = true;
      activationBlockers.push(`missing_ruleset_readback:${desired.name}`);
      if (actualState === "matched") {
        actualState = "missing";
      }
    } else if (!matched) {
      activationBlocked = true;
      activationBlockers.push(`ruleset_mismatch:${desired.name}`);
      if (actualState === "matched") {
        actualState = "mismatch";
      }
    }
    if (desired.bypass_actors.some((actor) => actor.unresolved === true)) {
      unresolvedActor = true;
    }

    return {
      actual_file_path: actual.actualFilePath,
      actual_present: actual.present,
      filePath: entry.filePath,
      matched,
      name: desired.name,
      pattern: desired.conditions.ref_name.include[0],
      target: desired.target,
    };
  });

  if (unresolvedActor) {
    activationBlocked = true;
    actualState = "unresolved_actor";
    activationBlockers.push("unresolved_release_tag_integration_actor");
  }

  const approvalEnvironment = validateApprovalEnvironment(rootDir);
  const actualApprovalEnvironment = loadActualApprovalEnvironment(
    actualDir,
    approvalEnvironment,
  );
  const unresolvedApprovalReviewer = approvalEnvironment.required_reviewers.some(
    (reviewer) => reviewer.actor_id === 0,
  );
  if (unresolvedApprovalReviewer) {
    activationBlocked = true;
    activationBlockers.push("unresolved_approval_environment_reviewer");
    if (actualState === "matched") {
      actualState = "unresolved_approval_environment";
    }
  }
  if (!actualApprovalEnvironment.present) {
    activationBlocked = true;
    activationBlockers.push("missing_approval_environment_readback");
    if (actualState === "matched") {
      actualState = "missing_approval_environment";
    }
  } else if (!actualApprovalEnvironment.matched) {
    activationBlocked = true;
    activationBlockers.push(...actualApprovalEnvironment.mismatches);
    if (actualState === "matched") {
      actualState = "approval_environment_mismatch";
    }
  }

  return {
    activation_blocked: activationBlocked,
    activation_blockers: [...new Set(activationBlockers)].sort(),
    actual_dir: actualDir ? resolve(actualDir) : null,
    actual_state: activationBlocked ? actualState : "matched",
    approval_environment: {
      actual_present: actualApprovalEnvironment.present,
      matched: actualApprovalEnvironment.matched,
      name: approvalEnvironment.name,
    },
    rulesets,
    workflow: {
      filePath: ".github/workflows/production-release-attestation.yml",
      present: true,
    },
  };
}
