import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  UNRESOLVED_RELEASE_TAG_INTEGRATION_ACTOR_ID,
  normalizeExpectedReleaseContexts,
} from "./production-release-approval-policy.mjs";

export const PRODUCTION_RELEASE_RULESET_SCHEMA =
  "homecook.github.repository-ruleset.v1";

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
    filePath: ".github/rulesets/production-release-tags.json",
    requiredRuleTypes: [
      "creation",
      "deletion",
      "non_fast_forward",
    ],
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

function normalizeRefName(refName, label) {
  const value = requireObject(refName, label);
  return {
    include: requireArray(value.include, `${label}.include`).map((entry, index) =>
      requireNonEmptyString(entry, `${label}.include[${index}]`)),
    exclude: requireArray(value.exclude ?? [], `${label}.exclude`).map((entry, index) =>
      requireNonEmptyString(entry, `${label}.exclude[${index}]`)),
  };
}

function normalizeRules(rules, label) {
  return requireArray(rules, label)
    .map((rule, index) => {
      const value = requireObject(rule, `${label}[${index}]`);
      const type = requireNonEmptyString(value.type, `${label}[${index}].type`);
      const parameters = value.parameters === undefined
        ? null
        : requireObject(value.parameters, `${label}[${index}].parameters`);
      return {
        parameters,
        type,
      };
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
  const normalizedRules = normalizeRules(value.rules, `${filePath}.rules`);
  const normalizedBypassActors = normalizeBypassActors(
    value.bypass_actors ?? [],
    `${filePath}.bypass_actors`,
  );
  const requiredStatusChecksRule = normalizedRules.find(
    (rule) => rule.type === "required_status_checks",
  );
  const requiredStatusChecks = requiredStatusChecksRule?.parameters?.required_status_checks;

  return {
    conditions: {
      ref_name: normalizeRefName(value.conditions?.ref_name, `${filePath}.conditions.ref_name`),
    },
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

function validateRulesetFile({ filePath, requiredRuleTypes, rootDir, target }) {
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

  const presentRuleTypes = new Set(normalized.rules.map((rule) => rule.type));
  for (const requiredRuleType of requiredRuleTypes) {
    if (!presentRuleTypes.has(requiredRuleType)) {
      throw new Error(`${filePath} must include the ${requiredRuleType} rule type.`);
    }
  }
  if (normalized.target === "branch") {
    normalizeExpectedReleaseContexts(
      normalized.required_status_contexts,
      `${filePath}.required_status_contexts`,
    );
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

function sameRuleset(left, right) {
  return JSON.stringify({
    conditions: left.conditions,
    enforcement: left.enforcement,
    name: left.name,
    required_status_contexts: left.required_status_contexts,
    rules: left.rules,
    target: left.target,
    bypass_actors: left.bypass_actors.map((actor) => ({
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      bypass_mode: actor.bypass_mode,
    })),
  }) === JSON.stringify({
    conditions: right.conditions,
    enforcement: right.enforcement,
    name: right.name,
    required_status_contexts: right.required_status_contexts,
    rules: right.rules,
    target: right.target,
    bypass_actors: right.bypass_actors.map((actor) => ({
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      bypass_mode: actor.bypass_mode,
    })),
  });
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
      if (actualState === "matched") {
        actualState = "missing";
      }
    } else if (!matched) {
      activationBlocked = true;
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
  }

  return {
    activation_blocked: activationBlocked,
    actual_dir: actualDir ? resolve(actualDir) : null,
    actual_state: activationBlocked ? actualState : "matched",
    rulesets,
    workflow: {
      filePath: ".github/workflows/production-release-attestation.yml",
      present: true,
    },
  };
}
