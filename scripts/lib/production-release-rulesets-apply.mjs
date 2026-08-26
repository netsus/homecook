import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { getProductionReleaseRulesetPlan } from "./production-release-rulesets.mjs";

export const C2_CONFIRMATION = "APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS";
export const C2_CANONICAL_REPOSITORY = "netsus/homecook";
export const C2_RELEASE_APP_ID = 4724458;
export const C2_ENVIRONMENT_REVIEWER_ID = 57648890;

const ENVIRONMENT_NAME = "production-release-approval";
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
  constructor(message, { partialState = false } = {}) {
    super(message);
    this.name = "ProductionReleaseApplyError";
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

function run(command, args, { input = undefined, stdinFd = undefined } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input,
    stdio: stdinFd === undefined ? undefined : [stdinFd, "pipe", "pipe"],
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

function validatePrivateKeyFile(privateKeyFile) {
  if (!privateKeyFile || !isAbsolute(privateKeyFile)) {
    fail("--app-private-key-file must be an absolute path to a supplied regular file.");
  }
  let stat;
  try {
    stat = lstatSync(privateKeyFile);
  } catch {
    fail("The supplied App private-key file is unavailable.");
  }
  if (!stat.isFile()) {
    fail("The supplied App private-key path must be a regular file.");
  }
  const permissionBits = stat.mode & 0o777;
  if ((permissionBits & 0o400) === 0 || (permissionBits & 0o177) !== 0) {
    fail("The supplied App private-key file mode must be no broader than 0600 and owner-readable.");
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
  const args = ["api", endpoint, "--method", method];
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
  const result = run("gh", ["api", endpoint, "--method", "GET", "--paginate", "--slurp"]);
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    fail(`GitHub API failed${detail ? `: ${detail}` : "."}`, { partialState });
  }
  return parseJson(result.stdout, "GitHub paginated API", { partialState });
}

function flattenArrayPages(pages, label) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    fail(`${label} pagination response is invalid.`);
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

function comparableRuleset(value) {
  return JSON.stringify({
    name: value.name,
    target: value.target,
    enforcement: value.enforcement,
    bypass_actors: value.bypass_actors ?? [],
    conditions: value.conditions,
    rules: value.rules,
  });
}

function rulesetMatches(actual, desired) {
  return comparableRuleset(actual) === comparableRuleset(apiRuleset(desired));
}

function globMatches(pattern, value) {
  if (typeof pattern !== "string") return true;
  if (pattern === "~ALL") return true;
  const tokens = parseGlobTokens(pattern);
  if (!tokens) return true;
  const memo = new Map();
  const canMatch = (tokenIndex, valueIndex) => {
    const key = `${tokenIndex}:${valueIndex}`;
    if (memo.has(key)) return memo.get(key);
    if (valueIndex === value.length) {
      const matched = tokens.slice(tokenIndex).every(
        (token) => token.type === "star" || token.type === "double-star",
      );
      memo.set(key, matched);
      return matched;
    }
    if (tokenIndex === tokens.length) {
      memo.set(key, false);
      return false;
    }
    const token = tokens[tokenIndex];
    let matched;
    if (token.type === "star" || token.type === "double-star") {
      const mayConsume = token.type === "double-star" || value[valueIndex] !== "/";
      matched = canMatch(tokenIndex + 1, valueIndex)
        || (mayConsume && canMatch(tokenIndex, valueIndex + 1));
    } else {
      matched = tokenMatches(token, value[valueIndex])
        && canMatch(tokenIndex + 1, valueIndex + 1);
    }
    memo.set(key, matched);
    return matched;
  };
  return canMatch(0, 0);
}

function parseGlobTokens(pattern) {
  const tokens = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      const doubleStar = pattern[index + 1] === "*";
      tokens.push({ type: doubleStar ? "double-star" : "star" });
      if (doubleStar) index += 1;
    } else if (character === "?") {
      tokens.push({ type: "any" });
    } else if (character === "[") {
      const closeIndex = pattern.indexOf("]", index + 1);
      if (closeIndex === -1 || closeIndex === index + 1) return null;
      tokens.push({ content: pattern.slice(index + 1, closeIndex), type: "class" });
      index = closeIndex;
    } else {
      tokens.push({ character, type: "literal" });
    }
  }
  return tokens;
}

function classMatches(content, character) {
  const negated = content[0] === "!" || content[0] === "^";
  const body = negated ? content.slice(1) : content;
  let matched = false;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index + 1] === "-" && body[index + 2] !== undefined) {
      matched ||= character >= body[index] && character <= body[index + 2];
      index += 2;
    } else {
      matched ||= character === body[index];
    }
  }
  return negated ? !matched : matched;
}

function tokenMatches(token, character) {
  if (token.type === "literal") return token.character === character;
  if (token.type === "any") return character !== "/";
  if (token.type === "class") {
    return character !== "/" && classMatches(token.content, character);
  }
  return false;
}

function classCanMatchWithoutSlash(content) {
  if (content[0] === "!" || content[0] === "^") return true;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index + 1] === "-" && content[index + 2] !== undefined) {
      if (content[index] !== "/" || content[index + 2] !== "/") return true;
      index += 2;
    } else if (content[index] !== "/") {
      return true;
    }
  }
  return false;
}

function remainingGlobCanMatchWithoutSlash(tokens, startIndex) {
  return tokens.slice(startIndex).every((token) => {
    if (token.type === "star" || token.type === "double-star") return true;
    if (token.type === "literal") return token.character !== "/";
    if (token.type === "any") return true;
    return classCanMatchWithoutSlash(token.content);
  });
}

function globCanMatchPrefix(pattern, prefix) {
  const tokens = parseGlobTokens(pattern);
  if (!tokens) return true;
  const memo = new Map();
  const canMatch = (tokenIndex, prefixIndex) => {
    const key = `${tokenIndex}:${prefixIndex}`;
    if (memo.has(key)) return memo.get(key);
    if (prefixIndex === prefix.length) {
      const matched = remainingGlobCanMatchWithoutSlash(tokens, tokenIndex);
      memo.set(key, matched);
      return matched;
    }
    if (tokenIndex === tokens.length) {
      memo.set(key, false);
      return false;
    }
    const token = tokens[tokenIndex];
    let matched;
    if (token.type === "star" || token.type === "double-star") {
      const mayConsume = token.type === "double-star" || prefix[prefixIndex] !== "/";
      matched = canMatch(tokenIndex + 1, prefixIndex)
        || (mayConsume && canMatch(tokenIndex, prefixIndex + 1));
    } else {
      matched = tokenMatches(token, prefix[prefixIndex])
        && canMatch(tokenIndex + 1, prefixIndex + 1);
    }
    memo.set(key, matched);
    return matched;
  };
  return canMatch(0, 0);
}

function overlapsProductionTagPattern(pattern) {
  if (typeof pattern !== "string" || pattern === "~ALL") return true;
  return globCanMatchPrefix(pattern, "refs/tags/prod-");
}

function conflictsWithCanonicalTarget(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include ?? [];
  if (!Array.isArray(include)) return true;
  if (ruleset.target === "branch") {
    return include.some((entry) =>
      entry === "~DEFAULT_BRANCH" || globMatches(entry, "refs/heads/master"));
  }
  if (ruleset.target === "tag") {
    return include.some(overlapsProductionTagPattern);
  }
  return false;
}

function environmentMatches(actual) {
  const reviewerRules = (actual?.protection_rules ?? [])
    .filter((rule) => rule?.type === "required_reviewers");
  const waitTimerRules = (actual?.protection_rules ?? [])
    .filter((rule) => rule?.type === "wait_timer");
  return actual?.name === ENVIRONMENT_NAME
    && actual?.can_admins_bypass === false
    && actual?.deployment_branch_policy?.protected_branches === false
    && actual?.deployment_branch_policy?.custom_branch_policies === true
    && reviewerRules.length === 1
    && reviewerRules[0]?.prevent_self_review === true
    && reviewerRules[0]?.reviewers?.length === 1
    && reviewerRules[0]?.reviewers?.[0]?.type === "User"
    && reviewerRules[0]?.reviewers?.[0]?.reviewer?.id === C2_ENVIRONMENT_REVIEWER_ID
    && (
      waitTimerRules.length === 0
      || (waitTimerRules.length === 1 && waitTimerRules[0]?.wait_timer === 0)
    );
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
    can_admins_bypass: false,
  };
}

function setEnvironmentSecret(name, { appId, privateKeyFile }) {
  let input;
  let stdinFd;
  if (name === "HOMECOOK_RELEASE_ATTESTATION_APP_ID") {
    input = `${appId}\n`;
  } else {
    try {
      stdinFd = openSync(privateKeyFile, "r");
    } catch {
      fail("Unable to open the supplied App private-key file.");
    }
  }
  try {
    const result = run(
      "gh",
      ["secret", "set", name, "--repo", C2_CANONICAL_REPOSITORY, "--env", ENVIRONMENT_NAME],
      { input, stdinFd },
    );
    if (result.status !== 0) {
      fail(`GitHub secret registration failed for ${name}.`, {
        partialState: true,
      });
    }
  } finally {
    if (stdinFd !== undefined) closeSync(stdinFd);
  }
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

export function executeProductionReleaseControls({
  appId,
  confirmation,
  privateKeyFile,
  repository,
  rootDir = process.cwd(),
  snapshotDir,
}) {
  if (confirmation !== C2_CONFIRMATION) {
    fail(`--confirm must equal ${C2_CONFIRMATION} exactly.`);
  }
  if (repository !== C2_CANONICAL_REPOSITORY) {
    fail(`C2 execution is pinned to canonical repository ${C2_CANONICAL_REPOSITORY}.`);
  }
  const desired = readDesiredState(rootDir, appId);
  validatePrivateKeyFile(privateKeyFile);
  const head = validateGitCheckout(rootDir);
  const repositoryReadback = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}`);
  if (
    repositoryReadback?.full_name !== C2_CANONICAL_REPOSITORY
    || repositoryReadback?.permissions?.admin !== true
  ) {
    fail("C2 execution requires ADMIN permission on the canonical repository.");
  }

  const summaries = flattenArrayPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/rulesets?includes_parents=false&per_page=100`,
    ),
    "Repository rulesets",
  );
  for (const name of RULESET_NAMES) {
    if (summaries.filter((entry) => entry?.name === name).length > 1) {
      fail(`Refusing duplicate canonical ruleset name: ${name}.`);
    }
  }
  const details = new Map();
  for (const summary of summaries) {
    if (!Number.isInteger(summary?.id)) fail("Repository ruleset summary is missing an exact id.");
    const detail = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets/${summary.id}`);
    details.set(summary.id, detail);
    if (!RULESET_NAMES.includes(detail?.name) && conflictsWithCanonicalTarget(detail)) {
      fail(`Refusing unknown conflicting ruleset target: ${detail?.name ?? "unnamed"}.`);
    }
  }

  let environment = ghApi(
    `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
    { allowNotFound: true },
  );
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

  const operations = [];
  const rulesetIds = new Map();
  for (const desiredRuleset of desired.rulesets) {
    const summary = summaries.find((entry) => entry.name === desiredRuleset.name);
    const body = apiRuleset(desiredRuleset);
    if (!summary) {
      const created = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets`, {
        input: body,
        method: "POST",
        partialState: true,
      });
      if (!Number.isInteger(created?.id)) fail("Created ruleset readback is missing an exact id.", { partialState: true });
      rulesetIds.set(desiredRuleset.name, created.id);
      operations.push(`created_ruleset:${desiredRuleset.name}`);
    } else {
      const actual = details.get(summary.id);
      rulesetIds.set(desiredRuleset.name, summary.id);
      if (!rulesetMatches(actual, desiredRuleset)) {
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
    environment = ghApi(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
      { input: environmentPayload(), method: "PUT", partialState: true },
    );
    operations.push(environment ? "upserted_environment" : "upserted_environment_unknown");
  }
  if (!normalizedPolicies.some((policy) => policy.name === "master" && policy.type === "branch")) {
    ghApi(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/deployment-branch-policies`,
      { input: { name: "master", type: "branch" }, method: "POST", partialState: true },
    );
    operations.push("created_master_deployment_policy");
  }
  for (const name of SECRET_NAMES) {
    if (!secretNames.includes(name)) {
      setEnvironmentSecret(name, { appId, privateKeyFile });
      operations.push(`registered_environment_secret:${name}`);
    }
  }

  const rulesetReadbacks = [];
  for (const desiredRuleset of desired.rulesets) {
    const id = rulesetIds.get(desiredRuleset.name);
    const readback = ghApi(`/repos/${C2_CANONICAL_REPOSITORY}/rulesets/${id}`, {
      partialState: operations.length > 0,
    });
    if (!rulesetMatches(readback, desiredRuleset)) {
      fail(`Ruleset readback mismatch: ${desiredRuleset.name}.`, { partialState: true });
    }
    rulesetReadbacks.push(readback);
  }
  environment = ghApi(
    `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}`,
    { partialState: operations.length > 0 },
  );
  if (!environmentMatches(environment) || environment?.can_admins_bypass !== false) {
    fail("Approval environment readback mismatch or admin bypass is not false.", {
      partialState: true,
    });
  }
  policies = flattenObjectPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/deployment-branch-policies?per_page=100`,
      { partialState: operations.length > 0 },
    ),
    "branch_policies",
    "Deployment branch policies",
    { partialState: operations.length > 0 },
  );
  secrets = flattenObjectPages(
    ghPaginated(
      `/repos/${C2_CANONICAL_REPOSITORY}/environments/${ENVIRONMENT_NAME}/secrets?per_page=100`,
      { partialState: operations.length > 0 },
    ),
    "secrets",
    "Environment secrets",
    { partialState: operations.length > 0 },
  );

  for (const ruleset of rulesetReadbacks) writeSnapshot(snapshotDir, `${ruleset.name}.json`, ruleset);
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.environment, environment);
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.policies, { branch_policies: policies });
  writeSnapshot(snapshotDir, SNAPSHOT_FILES.secrets, { secrets });

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
}
