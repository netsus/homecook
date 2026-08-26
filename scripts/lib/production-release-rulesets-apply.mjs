import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createPrivateKey } from "node:crypto";

import {
  getProductionReleaseRulesetPlan,
  normalizeInheritedProductionReleaseRulesetForInventory,
  normalizeProductionReleaseRulesetForComparison,
  normalizeRepositoryProductionReleaseRulesetForInventory,
  productionReleaseRulesetsSemanticallyEqual,
} from "./production-release-rulesets.mjs";
import {
  productionReleaseRulesetConflictsWithCanonicalTarget,
} from "./production-release-ruleset-patterns.mjs";

export const C2_CONFIRMATION = "APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS";
export const C2_CANONICAL_REPOSITORY = "netsus/homecook";
export const C2_RELEASE_APP_ID = 4724458;
export const C2_ENVIRONMENT_REVIEWER_ID = 57648890;

const ENVIRONMENT_NAME = "production-release-approval";
const GITHUB_API_HEADERS = [
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2026-03-10",
];
const RULESET_NAMES = [
  "production-release-master",
  "production-release-tag-creation",
  "production-release-tag-immutability",
];
const SECRET_NAMES = [
  "HOMECOOK_RELEASE_ATTESTATION_APP_ID",
  "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
];
const SNAPSHOT_FILES = {
  environment: "production-release-approval-environment.json",
  policies: "production-release-approval-deployment-branch-policies.json",
  secrets: "production-release-approval-environment-secrets.json",
};

export class ProductionReleaseApplyError extends Error {
  constructor(message, { manualActionRequired = false, partialState = false } = {}) {
    super(message);
    this.name = "ProductionReleaseApplyError";
    this.manualActionRequired = manualActionRequired;
    this.partialState = partialState;
  }
}

function fail(message, options) {
  throw new ProductionReleaseApplyError(message, options);
}

function parseJson(text, label, options) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} returned invalid JSON.`, options);
  }
}

function run(command, args, { input = undefined } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function runGit(rootDir, args) {
  const result = run("git", ["-C", rootDir, ...args]);
  if (result.status !== 0) {
    fail("Unable to verify the local Git checkout.");
  }
  return result.stdout.trim();
}

function validateGitCheckout(rootDir) {
  if (resolve(runGit(rootDir, ["rev-parse", "--show-toplevel"])) !== resolve(rootDir)) {
    fail("--root-dir must be the exact Git checkout root.");
  }
  const originUrl = runGit(rootDir, ["config", "--get", "remote.origin.url"]);
  if (!/^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)netsus\/homecook(?:\.git)?\/?$/u.test(originUrl)) {
    fail("C2 execution requires the canonical netsus/homecook origin checkout.");
  }
  if (runGit(rootDir, ["status", "--porcelain"]) !== "") {
    fail("C2 execution requires a clean Git checkout.");
  }
  if (runGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]) !== "master") {
    fail("C2 execution requires the master checkout.");
  }
  const head = runGit(rootDir, ["rev-parse", "HEAD"]);
  const originMaster = runGit(rootDir, ["rev-parse", "origin/master"]);
  if (head !== originMaster) {
    fail("C2 execution HEAD must equal exact origin/master.");
  }
  return head;
}

function readValidatedPrivateKey(privateKeyFile) {
  if (!privateKeyFile || !isAbsolute(privateKeyFile)) {
    fail("--app-private-key-file must be an absolute path to a supplied regular file.");
  }
  let fileDescriptor;
  try {
    fileDescriptor = openSync(
      privateKeyFile,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    fail("The supplied App private-key file is unavailable.");
  }
  try {
    const stat = fstatSync(fileDescriptor);
    if (!stat.isFile()) {
      fail("The supplied App private-key path must be a regular file.");
    }
    const permissionBits = stat.mode & 0o777;
    if ((permissionBits & 0o400) === 0 || (permissionBits & 0o177) !== 0) {
      fail("The supplied App private-key file mode must be no broader than 0600 and owner-readable.");
    }
    const pem = readFileSync(fileDescriptor);
    if (pem.length === 0) throw new Error("empty");
    const key = createPrivateKey(pem);
    if (key.type !== "private" || key.asymmetricKeyType !== "rsa") {
      fail("The supplied App private-key file must contain a valid nonempty RSA private key.");
    }
    return pem;
  } catch (error) {
    if (error instanceof ProductionReleaseApplyError) throw error;
    fail("The supplied App private-key file must contain a valid nonempty RSA private key.");
  } finally {
    try {
      closeSync(fileDescriptor);
    } catch {
      // The validated key material is already held in memory; never reopen by path.
    }
  }
}

function validateSnapshotDirectory(snapshotDir) {
  if (!snapshotDir || !isAbsolute(snapshotDir)) {
    fail("--snapshot-dir must be an absolute create-only directory path.");
  }
  if (existsSync(snapshotDir)) {
    fail("--snapshot-dir must not already exist; C2 snapshots are create-only.");
  }
  try {
    mkdirSync(snapshotDir, { mode: 0o700 });
  } catch {
    fail("Unable to create the C2 create-only snapshot directory.");
  }
}

function readDesiredState(rootDir, appId) {
  const plan = getProductionReleaseRulesetPlan({ rootDir });
  if (
    plan.activation_blockers.includes("unresolved_release_tag_integration_actor")
    || plan.activation_blockers.includes("unresolved_approval_environment_reviewer")
  ) {
    fail("C2 execution requires fully resolved desired state actor IDs.");
  }
  const readDesiredJson = (name) => parseJson(
    readFileSync(resolve(rootDir, ".github", "rulesets", `${name}.json`), "utf8"),
    `Desired state ${name}`,
  );
  const rulesets = RULESET_NAMES.map((name) => readDesiredJson(name));
  const environment = readDesiredJson("production-release-approval-environment");
  const releaseActor = rulesets
    .find((ruleset) => ruleset.name === "production-release-tag-creation")
    ?.bypass_actors?.[0];
  const reviewer = environment.required_reviewers?.[0];
  if (
    releaseActor?.actor_id !== C2_RELEASE_APP_ID
    || releaseActor?.actor_type !== "Integration"
    || releaseActor?.bypass_mode !== "always"
    || reviewer?.actor_id !== C2_ENVIRONMENT_REVIEWER_ID
    || reviewer?.actor_type !== "User"
    || appId !== String(releaseActor.actor_id)
  ) {
    fail("C2 execution requires the approved fully resolved desired state and matching App ID.");
  }
  return { environment, rulesets };
}

function ghApi(endpoint, { allowNotFound = false, input = undefined, method = "GET", partialState = false } = {}) {
  const args = ["api", endpoint, ...GITHUB_API_HEADERS, "--method", method];
  if (input !== undefined) args.push("--input", "-");
  const result = run("gh", args, {
    input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  });
  if (result.status !== 0) {
    if (allowNotFound && /\b404\b/u.test(result.stderr)) return null;
    const detail = result.stderr.trim();
    fail(
      `GitHub API failed${detail ? `: ${detail}` : "."}`,
      { partialState },
    );
  }
  return parseJson(result.stdout, "GitHub API", { partialState });
}

function ghPaginated(endpoint, { partialState = false } = {}) {
  const result = run("gh", [
    "api",
    endpoint,
    ...GITHUB_API_HEADERS,
    "--method",
    "GET",
    "--paginate",
    "--slurp",
  ]);
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    fail(`GitHub API failed${detail ? `: ${detail}` : "."}`, { partialState });
  }
  return parseJson(result.stdout, "GitHub paginated API", { partialState });
}

function flattenArrayPages(pages, label, { partialState = false } = {}) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    fail(`${label} pagination response is invalid.`, { partialState });
  }
  return pages.flat();
}

function flattenObjectPages(pages, property, label, { partialState = false } = {}) {
  if (!Array.isArray(pages)) {
    fail(`${label} pagination response is invalid.`, { partialState });
  }
  const values = [];
  for (const page of pages) {
    if (!page || !Array.isArray(page[property])) {
      fail(`${label} pagination response is invalid.`, { partialState });
    }
    values.push(...page[property]);
  }
  return values;
}

function apiRuleset(desired) {
  return {
    name: desired.name,
    target: desired.target,
    enforcement: desired.enforcement,
    bypass_actors: desired.bypass_actors,
    conditions: desired.conditions,
    rules: desired.rules,
  };
}

function rulesetMatches(actual, desired) {
  try {
    return productionReleaseRulesetsSemanticallyEqual(actual, apiRuleset(desired));
  } catch {
    return false;
  }
}

function readRulesetInventory({ includeParents = false, partialState = false } = {}) {
  const summaries = flattenArrayPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/rulesets?includes_parents=${includeParents ? "true" : "false"}&per_page=100`,
      { partialState },
    ),
    "Repository rulesets",
    { partialState },
  );
  if (!includeParents) {
    for (const name of RULESET_NAMES) {
      if (summaries.filter((entry) => entry?.name === name).length > 1) {
        fail(`Refusing duplicate canonical ruleset name: ${name}.`, { partialState });
      }
    }
  }
  const details = new Map();
  for (const summary of summaries) {
    if (!Number.isInteger(summary?.id)) {
      fail("Repository ruleset summary is missing an exact id.", { partialState });
    }
    const detail = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets/${summary.id}`, {
      partialState,
    });
    details.set(summary.id, detail);
    const sourceType = detail?.source_type ?? summary?.source_type;
    const source = detail?.source ?? summary?.source;
    if (
      typeof sourceType !== "string"
      || sourceType.length === 0
      || typeof source !== "string"
      || source.length === 0
    ) {
      fail(`Ruleset source identity is missing: ${detail?.name ?? "unnamed"}.`, {
        partialState,
      });
    }
    const parentRuleset = sourceType !== "Repository" || source !== C2_CANONICAL_REPOSITORY;
    if (!includeParents && parentRuleset) {
      fail(`Repository ruleset source identity mismatch: ${detail?.name ?? "unnamed"}.`, {
        partialState,
      });
    }
    if (includeParents && parentRuleset) {
      if (
        RULESET_NAMES.includes(detail?.name)
        || productionReleaseRulesetConflictsWithCanonicalTarget(detail)
      ) {
        fail(`Refusing conflicting parent effective ruleset: ${detail?.name ?? "unnamed"}.`, {
          partialState,
        });
      }
    } else if (
      !RULESET_NAMES.includes(detail?.name)
      && productionReleaseRulesetConflictsWithCanonicalTarget(detail)
    ) {
      fail(`Refusing unknown conflicting ruleset target: ${detail?.name ?? "unnamed"}.`, {
        partialState,
      });
    }
  }
  return { details, summaries };
}

function requireCanonicalRemoteMaster(expectedHead, { partialState = false } = {}) {
  const readback = ghApi(
    `/repos/${C2_CANONICAL_REPOSITORY}/git/ref/heads/master`,
    { partialState },
  );
  if (
    readback?.ref !== "refs/heads/master"
    || readback?.object?.type !== "commit"
    || readback?.object?.sha !== expectedHead
  ) {
    fail("Canonical GitHub remote master must match the exact local HEAD.", {
      partialState,
    });
  }
  return readback;
}

function effectiveWaitTimer(environment) {
  const waitTimerRules = (environment?.protection_rules ?? [])
    .filter((rule) => rule?.type === "wait_timer");
  if (waitTimerRules.length === 0) return 0;
  if (waitTimerRules.length === 1) return waitTimerRules[0]?.wait_timer;
  return null;
}

function environmentMatches(actual) {
  const reviewerRules = (actual?.protection_rules ?? [])
    .filter((rule) => rule?.type === "required_reviewers");
  return actual?.name === ENVIRONMENT_NAME
    && actual?.can_admins_bypass === false
    && actual?.deployment_branch_policy?.protected_branches === false
    && actual?.deployment_branch_policy?.custom_branch_policies === true
    && reviewerRules.length === 1
    && reviewerRules[0]?.prevent_self_review === true
    && reviewerRules[0]?.reviewers?.length === 1
    && reviewerRules[0]?.reviewers?.[0]?.type === "User"
    && reviewerRules[0]?.reviewers?.[0]?.reviewer?.id === C2_ENVIRONMENT_REVIEWER_ID
    && effectiveWaitTimer(actual) === 0;
}

function environmentPayload() {
  return {
    wait_timer: 0,
    reviewers: [{ type: "User", id: C2_ENVIRONMENT_REVIEWER_ID }],
    prevent_self_review: true,
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  };
}

function setEnvironmentSecret(name, { appId, privateKey }) {
  let input;
  if (name === "HOMECOOK_RELEASE_ATTESTATION_APP_ID") {
    input = `${appId}\n`;
  } else {
    input = privateKey;
  }
  const result = run(
    "gh",
    ["secret", "set", name, "--repo", C2_CANONICAL_REPOSITORY, "--env", ENVIRONMENT_NAME],
    { input },
  );
  if (result.status !== 0) {
    fail(`GitHub secret registration failed for ${name}.`, {
      partialState: true,
    });
  }
}

function requireAdminBypassDisabled(environment, { partialState = false } = {}) {
  if (environment?.can_admins_bypass !== false) {
    fail("Approval environment admin bypass readback is missing or true; disable Allow administrators to bypass in GitHub UI, then rerun.", {
      manualActionRequired: true,
      partialState,
    });
  }
}

function normalizeBranchPolicies(policies) {
  return policies
    .map((policy) => ({ name: policy?.name, type: policy?.type }))
    .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
}

function normalizeSecretNames(secrets) {
  return secrets.map((secret) => secret?.name).sort();
}

function inventoryDetails(inventory) {
  return inventory.summaries.map((summary) => inventory.details.get(summary.id));
}

function readFullActualState(expectedHead, { partialState = true } = {}) {
  const environment = ghApi(
    `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
    { partialState },
  );
  const policies = flattenObjectPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/deployment-branch-policies?per_page=100`,
      { partialState },
    ),
    "branch_policies",
    "Deployment branch policies",
    { partialState },
  );
  const secrets = flattenObjectPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/secrets?per_page=100`,
      { partialState },
    ),
    "secrets",
    "Environment secrets",
    { partialState },
  );
  const repositoryRulesets = readRulesetInventory({ partialState });
  const effectiveRulesets = readRulesetInventory({
    includeParents: true,
    partialState,
  });
  const remoteMaster = requireCanonicalRemoteMaster(expectedHead, { partialState });
  return {
    effectiveRulesets,
    environment,
    policies,
    remoteMaster,
    repositoryRulesets,
    secrets,
  };
}

function validateRulesetActualState(
  repositoryRulesets,
  effectiveRulesets,
  desired,
  { partialState = true } = {},
) {
  inventoryComparisonProjection(repositoryRulesets);
  inventoryComparisonProjection(effectiveRulesets);
  for (const desiredRuleset of desired.rulesets) {
    const summaries = repositoryRulesets.summaries.filter(
      (entry) => entry.name === desiredRuleset.name,
    );
    if (summaries.length !== 1) {
      fail(`Ruleset readback is not unique: ${desiredRuleset.name}.`, {
        partialState,
      });
    }
    const readback = repositoryRulesets.details.get(summaries[0].id);
    if (!rulesetMatches(readback, desiredRuleset)) {
      fail(`Ruleset readback mismatch: ${desiredRuleset.name}.`, { partialState });
    }
    const effectiveSummaries = effectiveRulesets.summaries.filter(
      (entry) => entry.name === desiredRuleset.name,
    );
    if (effectiveSummaries.length !== 1) {
      fail(`Effective ruleset readback is not unique: ${desiredRuleset.name}.`, {
        partialState,
      });
    }
    const effectiveReadback = effectiveRulesets.details.get(
      effectiveSummaries[0].id,
    );
    if (
      effectiveReadback?.source_type !== "Repository"
      || effectiveReadback?.source !== C2_CANONICAL_REPOSITORY
      || !rulesetMatches(effectiveReadback, desiredRuleset)
    ) {
      fail(`Effective ruleset readback mismatch: ${desiredRuleset.name}.`, {
        partialState,
      });
    }
  }
}

function validatePreflightRulesetConsistency(
  repositoryRulesets,
  effectiveRulesets,
  desired,
) {
  inventoryComparisonProjection(repositoryRulesets);
  inventoryComparisonProjection(effectiveRulesets);
  for (const desiredRuleset of desired.rulesets) {
    const repositoryEntries = repositoryRulesets.summaries.filter(
      (entry) => entry.name === desiredRuleset.name,
    );
    const effectiveEntries = effectiveRulesets.summaries.filter(
      (entry) => entry.name === desiredRuleset.name,
    );
    if (repositoryEntries.length === 0 && effectiveEntries.length === 0) {
      continue;
    }
    if (repositoryEntries.length !== 1 || effectiveEntries.length !== 1) {
      fail(`Preflight repository/effective canonical inventory mismatch: ${desiredRuleset.name}.`);
    }
    const repositoryDetail = repositoryRulesets.details.get(repositoryEntries[0].id);
    const effectiveDetail = effectiveRulesets.details.get(effectiveEntries[0].id);
    if (
      repositoryEntries[0].id !== effectiveEntries[0].id
      || effectiveDetail?.source_type !== "Repository"
      || effectiveDetail?.source !== C2_CANONICAL_REPOSITORY
      || !productionReleaseRulesetsSemanticallyEqual(
        repositoryDetail,
        effectiveDetail,
      )
    ) {
      fail(`Preflight repository/effective canonical identity mismatch: ${desiredRuleset.name}.`);
    }
  }
}

function validateFullActualState(state, desired, { partialState = true } = {}) {
  requireAdminBypassDisabled(state.environment, { partialState });
  if (!environmentMatches(state.environment)) {
    fail("Approval environment readback mismatch after apply.", { partialState });
  }
  if (
    JSON.stringify(normalizeBranchPolicies(state.policies))
    !== JSON.stringify([{ name: "master", type: "branch" }])
  ) {
    fail("Approval environment deployment branch policy readback mismatch.", {
      partialState,
    });
  }
  if (
    JSON.stringify(normalizeSecretNames(state.secrets))
    !== JSON.stringify([...SECRET_NAMES].sort())
  ) {
    fail("Approval environment secret inventory readback mismatch.", {
      partialState,
    });
  }
  validateRulesetActualState(
    state.repositoryRulesets,
    state.effectiveRulesets,
    desired,
    { partialState },
  );
}

function inventoryComparisonProjection(inventory) {
  return inventory.summaries
    .map((summary) => {
      const detail = inventory.details.get(summary.id);
      const source = detail?.source ?? summary.source;
      const sourceType = detail?.source_type ?? summary.source_type;
      if (
        typeof source !== "string"
        || source.length === 0
        || typeof sourceType !== "string"
        || sourceType.length === 0
      ) {
        throw new Error(`Ruleset source identity is missing: ${detail?.name ?? "unnamed"}.`);
      }
      const parent = sourceType !== "Repository" || source !== C2_CANONICAL_REPOSITORY;
      return {
        id: detail?.id ?? summary.id,
        ruleset: parent
          ? normalizeInheritedProductionReleaseRulesetForInventory(
            detail,
            `inherited ruleset ${detail?.name ?? summary.name}`,
          )
          : RULESET_NAMES.includes(detail?.name)
            ? normalizeProductionReleaseRulesetForComparison(
              detail,
              `ruleset ${detail?.name ?? summary.name}`,
            )
            : normalizeRepositoryProductionReleaseRulesetForInventory(
              detail,
              `repository ruleset ${detail?.name ?? summary.name}`,
            ),
        source,
        source_type: sourceType,
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.source_type}:${left.source}:${left.ruleset.name}:${left.id}`;
      const rightKey = `${right.source_type}:${right.source}:${right.ruleset.name}:${right.id}`;
      return leftKey.localeCompare(rightKey);
    });
}

function fullActualStateProjection(state) {
  const reviewerRules = (state.environment?.protection_rules ?? [])
    .filter((rule) => rule?.type === "required_reviewers");
  return {
    effective_rulesets: inventoryComparisonProjection(state.effectiveRulesets),
    environment: {
      can_admins_bypass: state.environment?.can_admins_bypass,
      deployment_branch_policy: state.environment?.deployment_branch_policy,
      name: state.environment?.name,
      prevent_self_review: reviewerRules[0]?.prevent_self_review,
      reviewers: (reviewerRules[0]?.reviewers ?? [])
        .map((entry) => ({ id: entry?.reviewer?.id, type: entry?.type }))
        .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`)),
      wait_timer: effectiveWaitTimer(state.environment),
    },
    policies: normalizeBranchPolicies(state.policies),
    remote_master: state.remoteMaster?.object?.sha,
    repository_rulesets: inventoryComparisonProjection(state.repositoryRulesets),
    secrets: normalizeSecretNames(state.secrets),
  };
}

function fullActualStatesSemanticallyEqual(left, right) {
  return JSON.stringify(fullActualStateProjection(left))
    === JSON.stringify(fullActualStateProjection(right));
}

function writeSnapshot(snapshotDir, name, value) {
  try {
    writeFileSync(resolve(snapshotDir, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    fail("C2 snapshot write failed closed; partial GitHub state was not rolled back.", {
      partialState: true,
    });
  }
}

function writeFullActualStateSnapshot(snapshotDir, state) {
  for (const ruleset of inventoryDetails(state.repositoryRulesets)) {
    if (RULESET_NAMES.includes(ruleset?.name)) {
      writeSnapshot(snapshotDir, `${ruleset.name}.json`, ruleset);
    }
  }
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.environment, state.environment);
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.policies, { branch_policies: state.policies });
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.secrets, { secrets: state.secrets });
  writeSnapshot(snapshotDir, "production-release-repository-rulesets.json", {
    includes_parents: false,
    rulesets: inventoryDetails(state.repositoryRulesets),
    scope: "repository",
  });
  writeSnapshot(snapshotDir, "production-release-effective-rulesets.json", {
    includes_parents: true,
    rulesets: inventoryDetails(state.effectiveRulesets),
    scope: "effective",
  });
}

export function executeProductionReleaseControls({
  appId,
  confirmation,
  privateKeyFile,
  repository,
  rootDir = process.cwd(),
  snapshotDir,
}) {
  let mutationStarted = false;
  try {
  if (confirmation !== C2_CONFIRMATION) {
    fail(`--confirm must equal ${C2_CONFIRMATION} exactly.`);
  }
  if (repository !== C2_CANONICAL_REPOSITORY) {
    fail(`C2 execution is pinned to canonical repository ${C2_CANONICAL_REPOSITORY}.`);
  }
  const desired = readDesiredState(rootDir, appId);
  const privateKey = readValidatedPrivateKey(privateKeyFile);
  const head = validateGitCheckout(rootDir);
  const repositoryReadback = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}`);
  if (
    repositoryReadback?.full_name !== C2_CANONICAL_REPOSITORY
    || repositoryReadback?.permissions?.admin !== true
  ) {
    fail("C2 execution requires ADMIN permission on the canonical repository.");
  }

  const preflightInventory = readRulesetInventory();
  const preflightEffectiveInventory = readRulesetInventory({
    includeParents: true,
  });
  validatePreflightRulesetConsistency(
    preflightInventory,
    preflightEffectiveInventory,
    desired,
  );

  let environment = ghApi(
    `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
    { allowNotFound: true },
  );
  if (environment) {
    requireAdminBypassDisabled(environment);
  }
  let policies = [];
  let secrets = [];
  if (environment) {
    policies = flattenObjectPages(
      ghPaginated(
        `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/deployment-branch-policies?per_page=100`,
      ),
      "branch_policies",
      "Deployment branch policies",
    );
    secrets = flattenObjectPages(
      ghPaginated(
        `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/secrets?per_page=100`,
      ),
      "secrets",
      "Environment secrets",
    );
  }
  const normalizedPolicies = policies.map((policy) => ({ name: policy.name, type: policy.type }));
  const extraPolicies = normalizedPolicies.filter(
    (policy) => policy.name !== "master" || policy.type !== "branch",
  );
  if (extraPolicies.length > 0 || normalizedPolicies.filter(
    (policy) => policy.name === "master" && policy.type === "branch",
  ).length > 1) {
    fail("Refusing preexisting extra deployment branch policies; no policy was deleted.");
  }
  const secretNames = secrets.map((secret) => secret?.name);
  if (
    new Set(secretNames).size !== secretNames.length
    || secretNames.some((name) => !SECRET_NAMES.includes(name))
  ) {
    fail("Refusing preexisting extra environment secrets; no secret was deleted.");
  }

  validateSnapshotDirectory(snapshotDir);
  requireCanonicalRemoteMaster(head);

  const operations = [];
  for (const desiredRuleset of desired.rulesets) {
    const summary = preflightInventory.summaries.find(
      (entry) => entry.name === desiredRuleset.name,
    );
    const body = apiRuleset(desiredRuleset);
    if (!summary) {
      mutationStarted = true;
      const created = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets`, {
        input: body,
        method: "POST",
        partialState: true,
      });
      if (!Number.isInteger(created?.id)) fail("Created ruleset readback is missing an exact id.", { partialState: true });
      operations.push(`created_ruleset:${desiredRuleset.name}`);
    } else {
      const actual = preflightInventory.details.get(summary.id);
      if (!rulesetMatches(actual, desiredRuleset)) {
        mutationStarted = true;
        ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets/${summary.id}`, {
          input: body,
          method: "PUT",
          partialState: true,
        });
        operations.push(`updated_ruleset:${desiredRuleset.name}`);
      }
    }
  }

  if (!environmentMatches(environment)) {
    mutationStarted = true;
    ghApi(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
      { input: environmentPayload(), method: "PUT", partialState: true },
    );
    operations.push("upserted_environment");
    environment = ghApi(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
      { partialState: true },
    );
    requireAdminBypassDisabled(environment, { partialState: true });
    if (!environmentMatches(environment)) {
      fail("Approval environment readback mismatch immediately after update.", {
        partialState: true,
      });
    }
  }
  if (!normalizedPolicies.some((policy) => policy.name === "master" && policy.type === "branch")) {
    mutationStarted = true;
    ghApi(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/deployment-branch-policies`,
      { input: { name: "master", type: "branch" }, method: "POST", partialState: true },
    );
    operations.push("created_master_deployment_policy");
  }
  for (const name of SECRET_NAMES) {
    mutationStarted = true;
    setEnvironmentSecret(name, { appId, privateKey });
    operations.push(`upserted_environment_secret:${name}`);
  }

  const snapshotState = readFullActualState(head);
  validateFullActualState(snapshotState, desired);
  writeFullActualStateSnapshot(snapshotDir, snapshotState);

  const postSnapshotState = readFullActualState(head);
  validateFullActualState(postSnapshotState, desired);
  if (!fullActualStatesSemanticallyEqual(snapshotState, postSnapshotState)) {
    fail("Full GitHub actual state changed after snapshot storage.", {
      partialState: true,
    });
  }

  let verification;
  try {
    verification = getProductionReleaseRulesetPlan({ actualDir: snapshotDir, rootDir });
  } catch {
    fail("C2 snapshot verifier rejected the readback; partial GitHub state was not rolled back.", {
      partialState: true,
    });
  }
  if (verification.activation_blocked || verification.actual_state !== "matched") {
    fail("C2 snapshot verification failed closed after apply.", { partialState: true });
  }
  return {
    ...verification,
    dry_run: false,
    head,
    mode: "apply",
    operations,
    partial_state: false,
    private_key: { supplied: true },
    repository: C2_CANONICAL_REPOSITORY,
    snapshot_created: true,
  };
  } catch (error) {
    if (!mutationStarted) {
      if (error instanceof ProductionReleaseApplyError) throw error;
      throw new ProductionReleaseApplyError(
        "Unexpected C2 apply failure before mutation.",
        { partialState: false },
      );
    }
    if (error instanceof ProductionReleaseApplyError) {
      if (error.partialState) throw error;
      throw new ProductionReleaseApplyError(error.message, {
        manualActionRequired: error.manualActionRequired,
        partialState: true,
      });
    }
    throw new ProductionReleaseApplyError(
      "Unexpected C2 apply failure after mutation.",
      { partialState: true },
    );
  }
}
