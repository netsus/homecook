import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PRODUCTION_RELEASE_RULESET_SCHEMA =
  "homecook.github.repository-ruleset.v1";

const EXPECTED_RULESET_FILES = [
  {
    filePath: ".github/rulesets/production-release-master.json",
    expectedName: "production-release-master",
    expectedPattern: "refs/heads/master",
    target: "branch",
  },
  {
    filePath: ".github/rulesets/production-release-tags.json",
    expectedName: "production-release-tags",
    expectedPattern: "refs/tags/prod-*",
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

function validateBypassActors(bypassActors, label) {
  if (!Array.isArray(bypassActors) || bypassActors.length === 0) {
    throw new Error(`${label} must include at least one narrow bypass actor.`);
  }

  for (const [index, actor] of bypassActors.entries()) {
    const actorType = requireNonEmptyString(
      actor?.actor_type,
      `${label}[${index}].actor_type`,
    );
    const actorId = requireNonEmptyString(
      actor?.actor_id,
      `${label}[${index}].actor_id`,
    );
    requireNonEmptyString(actor?.mode, `${label}[${index}].mode`);

    if (
      actorType === "RepositoryRole"
      && /admin|maintain|write|triage/iu.test(actorId)
    ) {
      throw new Error(`${label}[${index}] must not grant broad repository-role bypass.`);
    }
  }

  return bypassActors;
}

function validateRulesetFile({ expectedName, expectedPattern, filePath, rootDir, target }) {
  const absolutePath = resolve(rootDir, filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Required production release ruleset file is missing: ${filePath}`);
  }

  const ruleset = readJson(absolutePath, "Production release ruleset");
  if (ruleset.schema !== PRODUCTION_RELEASE_RULESET_SCHEMA) {
    throw new Error(`${filePath} schema must be ${PRODUCTION_RELEASE_RULESET_SCHEMA}.`);
  }
  if (requireNonEmptyString(ruleset.name, `${filePath}.name`) !== expectedName) {
    throw new Error(`${filePath} name must be ${expectedName}.`);
  }
  if (requireNonEmptyString(ruleset.target, `${filePath}.target`) !== target) {
    throw new Error(`${filePath} target must be ${target}.`);
  }
  if (requireNonEmptyString(ruleset.enforcement, `${filePath}.enforcement`) !== "active") {
    throw new Error(`${filePath} enforcement must be active.`);
  }
  if (
    !Array.isArray(ruleset.conditions?.ref_name?.include)
    || ruleset.conditions.ref_name.include[0] !== expectedPattern
  ) {
    throw new Error(`${filePath} must include exact ref pattern ${expectedPattern}.`);
  }
  validateBypassActors(ruleset.bypass_actors, `${filePath}.bypass_actors`);

  return {
    filePath,
    name: expectedName,
    pattern: expectedPattern,
    target,
  };
}

export function getProductionReleaseRulesetPlan({
  rootDir = process.cwd(),
} = {}) {
  const workflowPath = resolve(
    rootDir,
    ".github/workflows/production-release-attestation.yml",
  );
  if (!existsSync(workflowPath)) {
    throw new Error("Production release attestation workflow file is missing.");
  }

  return {
    rulesets: EXPECTED_RULESET_FILES.map((entry) => validateRulesetFile({
      ...entry,
      rootDir,
    })),
    workflow: {
      filePath: ".github/workflows/production-release-attestation.yml",
      present: true,
    },
  };
}
