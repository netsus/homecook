import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { pathToFileURL } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");
const CONFIRMATION = "APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS";
let EXPECTED_HEAD = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).stdout.trim();
const ACCEPT_HEADER = "Accept: application/vnd.github+json";
const VERSION_HEADER = "X-GitHub-Api-Version: 2026-03-10";
const COMPLETION_FILE = "production-release-snapshot-completion.json";
const temporaryDirectories: string[] = [];
let immutableFixtureRoot = "";
const IMMUTABLE_FIXTURE_PATHS = [
  "scripts/bootstrap-production-release-rulesets.mjs",
  "scripts/manage-production-release-rulesets.mjs",
  "scripts/lib/exact-git-worktree.mjs",
  "scripts/lib/github-app-identity.mjs",
  "scripts/lib/production-release-approval-policy.mjs",
  "scripts/lib/production-release-ruleset-patterns.mjs",
  "scripts/lib/production-release-rulesets-apply.mjs",
  "scripts/lib/production-release-rulesets.mjs",
  ".github/rulesets/production-release-master.json",
  ".github/rulesets/production-release-tag-creation.json",
  ".github/rulesets/production-release-tag-immutability.json",
  ".github/rulesets/production-release-approval-environment.json",
  ".github/workflows/production-release-attestation.yml",
];
const EPHEMERAL_RSA_KEY_PAIR = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const EPHEMERAL_RSA_PRIVATE_KEY_BYTES = Buffer.byteLength(
  EPHEMERAL_RSA_KEY_PAIR.privateKey,
);

function approvedEnvironmentReadback(overrides: Record<string, unknown> = {}) {
  return {
    name: "production-release-approval",
    can_admins_bypass: false,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    protection_rules: [
      { type: "wait_timer", wait_timer: 0 },
      {
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [{ type: "User", reviewer: { id: 57648890 } }],
      },
      { type: "branch_policy" },
    ],
    ...overrides,
  };
}

const FAKE_GH = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const statePath = process.env.HOMECOOK_C2_MOCK_STATE;
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const markMutation = () => {
  if (state.replace_private_key_after_mutation && !state.private_key_replaced) {
    fs.writeFileSync(process.env.HOMECOOK_C2_PRIVATE_KEY_PATH, "replaced");
    state.private_key_replaced = true;
  }
  if (state.precreate_completion_marker && !state.completion_marker_precreated) {
    fs.writeFileSync(
      process.env.HOMECOOK_C2_SNAPSHOT_DIR + "/" + process.env.HOMECOOK_C2_COMPLETION_FILE,
      "attacker-marker",
      { flag: "wx", mode: 0o600 },
    );
    state.completion_marker_precreated = true;
  }
};
const asRestRuleset = (id, payload) => ({
  id,
  node_id: "RRS_" + id,
  name: payload.name,
  target: payload.target,
  source_type: "Repository",
  source: "netsus/homecook",
  enforcement: payload.enforcement,
  bypass_actors: payload.bypass_actors,
  conditions: payload.conditions,
  rules: payload.rules.map((rule) => rule.type === "required_status_checks"
    ? {
        parameters: {
          ...rule.parameters,
          required_status_checks: [...rule.parameters.required_status_checks]
            .reverse()
            .map(({ context, integration_id }) => ({ integration_id, context })),
        },
        type: rule.type,
      }
    : rule),
  created_at: "2026-08-26T00:00:00Z",
  updated_at: "2026-08-26T00:00:00Z",
  current_user_can_bypass: "never",
  _links: { html: "https://example.invalid/rulesets/" + id },
});
const reply = (value) => {
  process.stdout.write(JSON.stringify(value));
  save();
};
const fail = (message, code = 1) => {
  save();
  process.stderr.write(message + "\n");
  process.exit(code);
};
state.calls ??= [];
if (args[0] === "secret" && args[1] === "set") {
  const name = args[2];
  const key = "SECRET " + name;
  state.calls.push({ key, args, stdin_bytes: stdin.length });
  if (state.fail_on === key) fail("mock secret failure");
  if (!state.secrets.some((entry) => entry.name === name)) state.secrets.push({ name });
  save();
  process.exit(0);
}
if (args[0] !== "api") fail("unexpected fake gh invocation");
const endpoint = args[1];
const method = option("--method") ?? "GET";
const key = method + " " + endpoint;
const payload = stdin.length === 0 ? null : JSON.parse(stdin.toString("utf8"));
state.calls.push({ args, key, payload });
if (state.fail_on === key) fail("mock API failure");
if (endpoint === "/repos/netsus/homecook" && method === "GET") {
  reply({ full_name: "netsus/homecook", permissions: { admin: state.admin !== false } });
} else if (endpoint === "/repos/netsus/homecook/git/ref/heads/master" && method === "GET") {
  state.remote_ref_reads = (state.remote_ref_reads ?? 0) + 1;
  const sequence = state.remote_master_shas ?? ["${EXPECTED_HEAD}"];
  const sha = sequence[Math.min(state.remote_ref_reads - 1, sequence.length - 1)];
  reply({ ref: "refs/heads/master", object: { sha, type: "commit" } });
} else if (endpoint.startsWith("/repos/netsus/homecook/rulesets?")) {
  const effective = endpoint.includes("includes_parents=true");
  if (effective) {
    state.effective_inventory_reads = (state.effective_inventory_reads ?? 0) + 1;
    if (
      state.effective_inventory_reads === (state.effective_state_race_read ?? 3)
      && state.effective_state_race
      && !state.effective_state_race_inserted
    ) {
      state.effective_rulesets = [...(state.effective_rulesets ?? state.rulesets), state.effective_state_race];
      state.effective_state_race_inserted = true;
    }
  } else {
    state.ruleset_inventory_reads = (state.ruleset_inventory_reads ?? 0) + 1;
  }
  if (!effective && state.ruleset_inventory_reads === 2 && state.ruleset_race && !state.ruleset_race_inserted) {
    state.rulesets.push(state.ruleset_race);
    state.ruleset_race_inserted = true;
  }
  const inventory = effective ? (state.effective_rulesets ?? state.rulesets) : state.rulesets;
  reply([inventory.map(({ id, name, target, enforcement, source, source_type }) => ({
    id, name, target, enforcement, source, source_type,
  }))]);
} else if (/\/rulesets\/[0-9]+$/.test(endpoint) && method === "GET") {
  const id = Number(endpoint.split("/").at(-1));
  const ruleset = [
    ...state.rulesets,
    ...(state.effective_rulesets ?? []),
  ].find((entry) => entry.id === id);
  if (!ruleset) fail("HTTP 404: ruleset missing");
  reply(ruleset);
} else if (endpoint === "/repos/netsus/homecook/rulesets" && method === "POST") {
  const id = state.next_id++;
  const ruleset = asRestRuleset(id, payload);
  state.rulesets.push(ruleset);
  markMutation();
  reply(ruleset);
} else if (/\/rulesets\/[0-9]+$/.test(endpoint) && method === "PUT") {
  const id = Number(endpoint.split("/").at(-1));
  const index = state.rulesets.findIndex((entry) => entry.id === id);
  if (index === -1) fail("HTTP 404: ruleset missing");
  state.rulesets[index] = asRestRuleset(id, payload);
  markMutation();
  reply(state.rulesets[index]);
} else if (endpoint === "/repos/netsus/homecook/environments/production-release-approval" && method === "GET") {
  if (!state.environment) fail("HTTP 404: environment missing");
  reply(state.environment);
} else if (endpoint === "/repos/netsus/homecook/environments/production-release-approval" && method === "PUT") {
  const currentAdminBypass = state.environment?.can_admins_bypass;
  state.environment = {
    name: "production-release-approval",
    can_admins_bypass: state.omit_admin_bypass ? undefined : currentAdminBypass,
    deployment_branch_policy: payload.deployment_branch_policy,
    protection_rules: [
      ...(payload.wait_timer === 0 ? [] : [{ type: "wait_timer", wait_timer: payload.wait_timer }]),
      {
        type: "required_reviewers",
        prevent_self_review: payload.prevent_self_review,
        reviewers: payload.reviewers.map((reviewer) => ({
          type: reviewer.type,
          reviewer: { id: reviewer.id },
        })),
      },
      { type: "branch_policy" },
    ],
  };
  markMutation();
  reply(state.environment);
} else if (endpoint.includes("/deployment-branch-policies?") && method === "GET") {
  reply([{ branch_policies: state.policies }]);
} else if (endpoint.endsWith("/deployment-branch-policies") && method === "POST") {
  const policy = { id: 9001, ...payload };
  state.policies.push(policy);
  markMutation();
  reply(policy);
} else if (endpoint.includes("/secrets?") && method === "GET") {
  reply([{ secrets: state.secrets }]);
} else {
  fail("unexpected fake gh endpoint: " + key);
}
`;

const FAKE_GIT = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const args = process.argv.slice(2);
const command = args.join(" ");
if (command.endsWith("rev-parse --show-toplevel")) process.stdout.write(process.env.HOMECOOK_C2_ROOT + "\n");
else if (command.endsWith("rev-parse HEAD")) process.stdout.write((process.env.HOMECOOK_C2_HEAD ?? process.env.HOMECOOK_C2_EXPECTED_HEAD) + "\n");
else if (command.endsWith("rev-parse origin/master")) process.stdout.write((process.env.HOMECOOK_C2_ORIGIN_MASTER ?? process.env.HOMECOOK_C2_EXPECTED_HEAD) + "\n");
else if (command.endsWith("rev-parse --abbrev-ref HEAD")) process.stdout.write((process.env.HOMECOOK_C2_BRANCH ?? "master") + "\n");
else if (command.endsWith("config --get remote.origin.url")) process.stdout.write((process.env.HOMECOOK_C2_ORIGIN_URL ?? "git@github.com:netsus/homecook.git") + "\n");
else if (command.endsWith("status --porcelain")) process.stdout.write(process.env.HOMECOOK_C2_DIRTY === "true" ? " M dirty\n" : "");
else if (command.endsWith("rev-parse --show-object-format")) process.stdout.write("sha1\n");
else if (command.includes("rev-parse HEAD HEAD^{tree}")) {
  const expressions = args.slice(args.indexOf("rev-parse") + 1);
  const tree = spawnSync("/usr/bin/git", ["-C", process.env.HOMECOOK_C2_REAL_REPO_ROOT, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).stdout.trim();
  const values = expressions.map((expression) => {
    if (expression === "HEAD") return process.env.HOMECOOK_C2_HEAD ?? process.env.HOMECOOK_C2_EXPECTED_HEAD;
    if (expression === "HEAD^{tree}") return tree;
    const path = expression.slice(expression.indexOf(":") + 1);
    const absolutePath = process.env.HOMECOOK_C2_REAL_REPO_ROOT + "/" + path;
    const stat = fs.lstatSync(absolutePath);
    const bytes = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(absolutePath))
      : fs.readFileSync(absolutePath);
    return createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex");
  });
  process.stdout.write(values.join("\n") + "\n");
}
else if (command.includes("rev-parse") && args.at(-1)?.includes(":")) {
  const path = args.at(-1).slice(args.at(-1).indexOf(":") + 1);
  const absolutePath = process.env.HOMECOOK_C2_REAL_REPO_ROOT + "/" + path;
  const stat = fs.lstatSync(absolutePath);
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(fs.readlinkSync(absolutePath))
    : fs.readFileSync(absolutePath);
  process.stdout.write(createHash("sha1")
    .update("blob " + bytes.length + "\0")
    .update(bytes)
    .digest("hex") + "\n");
}
else if (command.includes("rev-parse") && command.endsWith("^{tree}")) {
  const result = spawnSync("/usr/bin/git", ["-C", process.env.HOMECOOK_C2_REAL_REPO_ROOT, "rev-parse", "HEAD^{tree}"]);
  const state = JSON.parse(fs.readFileSync(process.env.HOMECOOK_C2_MOCK_STATE, "utf8"));
  state.source_tree_reads = (state.source_tree_reads ?? 0) + 1;
  if (state.desired_worktree_race && state.source_tree_reads === 2) {
    fs.writeFileSync(
      process.env.HOMECOOK_C2_REAL_REPO_ROOT + "/" + state.desired_worktree_race_path,
      state.desired_worktree_weakened,
    );
    state.desired_worktree_race_active = true;
  }
  fs.writeFileSync(process.env.HOMECOOK_C2_MOCK_STATE, JSON.stringify(state, null, 2));
  process.stdout.write(result.stdout);
}
else if (command.includes("ls-tree -rz --full-tree")) {
  if (process.env.HOMECOOK_C2_ROOT !== process.env.HOMECOOK_C2_REAL_REPO_ROOT) process.exit(0);
  const result = spawnSync("/usr/bin/git", ["-C", process.env.HOMECOOK_C2_REAL_REPO_ROOT, "ls-tree", "-rz", "--full-tree", "HEAD"]);
  const state = JSON.parse(fs.readFileSync(process.env.HOMECOOK_C2_MOCK_STATE, "utf8"));
  let listing = result.stdout.toString("utf8");
  const fixturePaths = new Set([
    ".github/rulesets/production-release-master.json",
    ".github/rulesets/production-release-tag-creation.json",
    ".github/rulesets/production-release-tag-immutability.json",
    ".github/rulesets/production-release-approval-environment.json",
    ".github/workflows/production-release-attestation.yml",
    "scripts/lib/production-release-rulesets.mjs",
  ]);
  listing = listing.split("\0").filter((record) => {
    if (!record) return false;
    return fixturePaths.has(record.slice(record.indexOf("\t") + 1));
  }).map((record) => {
    if (!record) return record;
    const match = record.match(/^([0-9]{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/u);
    if (!match || match[2] === "commit") return record;
    const path = match[4];
    if (state.hidden_worktree_mismatch_path === path) {
      return record.replace(/ [0-9a-f]{40}\t/u, " " + "0".repeat(40) + "\t");
    }
    const absolutePath = process.env.HOMECOOK_C2_REAL_REPO_ROOT + "/" + path;
    const bytes = match[1] === "120000"
      ? Buffer.from(fs.readlinkSync(absolutePath))
      : fs.readFileSync(absolutePath);
    const objectId = createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex");
    return record.replace(/ [0-9a-f]{40}\t/u, " " + objectId + "\t");
  }).join("\0") + "\0";
  process.stdout.write(listing);
}
else { process.stderr.write("unexpected fake git invocation: " + command + "\n"); process.exit(1); }
`;

const FAKE_FETCH_PRELOAD = String.raw`import fs from "node:fs";
import { verify } from "node:crypto";
globalThis.fetch = async (url, options = {}) => {
  const statePath = process.env.HOMECOOK_C2_MOCK_STATE;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (state.desired_worktree_race_active) {
    fs.writeFileSync(
      process.env.HOMECOOK_C2_REAL_REPO_ROOT + "/" + state.desired_worktree_race_path,
      state.desired_worktree_original,
    );
    state.desired_worktree_race_active = false;
  }
  const authorization = options.headers?.Authorization ?? options.headers?.authorization;
  const jwt = typeof authorization === "string" ? authorization.replace(/^Bearer\s+/u, "") : "";
  const parts = jwt.split(".");
  let header = {};
  let payload = {};
  let signatureValid = false;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    signatureValid = verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      state.expected_app_public_key,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {}
  state.identity_calls ??= [];
  state.identity_calls.push({
    alg: header.alg,
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    method: options.method ?? "GET",
    signature_valid: signatureValid,
    url: String(url),
  });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  const ok = signatureValid && state.identity_force_failure !== true;
  return {
    ok,
    status: ok ? 200 : 401,
    async json() {
      return ok ? { id: state.identity_response_id ?? 4724458, slug: "homecook-release-attestation" } : {};
    },
  };
};
`;

function tempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createImmutableFixture() {
  immutableFixtureRoot = mkdtempSync(join(tmpdir(), "homecook-c2-immutable-source-"));
  for (const path of IMMUTABLE_FIXTURE_PATHS) {
    const target = join(immutableFixtureRoot, path);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(join(repoRoot, path), target);
  }
  for (const args of [
    ["init", "-q", "-b", "master"],
    ["config", "user.email", "c2-immutable@example.invalid"],
    ["config", "user.name", "C2 Immutable"],
    ["remote", "add", "origin", "git@github.com:netsus/homecook.git"],
    ["add", "."],
    ["commit", "-qm", "immutable C2 fixture"],
  ]) {
    const result = spawnSync("/usr/bin/git", ["-C", immutableFixtureRoot, ...args], {
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  EXPECTED_HEAD = spawnSync(
    "/usr/bin/git",
    ["-C", immutableFixtureRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).stdout.trim();
}

function initialState(overrides: Record<string, unknown> = {}) {
  return {
    admin: true,
    calls: [],
    environment: approvedEnvironmentReadback(),
    next_id: 101,
    policies: [{ id: 9001, name: "master", type: "branch" }],
    remote_master_shas: [EXPECTED_HEAD, EXPECTED_HEAD],
    rulesets: [],
    secrets: [
      { name: "HOMECOOK_RELEASE_ATTESTATION_APP_ID" },
      { name: "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY" },
    ],
    ...overrides,
  };
}

function runExecute({
  args = [],
  env = {},
  privateKeyMode = 0o600,
  privateKeyPem = EPHEMERAL_RSA_KEY_PAIR.privateKey,
  sourceRepoRoot = immutableFixtureRoot,
  state = initialState(),
}: {
  args?: string[];
  env?: Record<string, string>;
  privateKeyMode?: number;
  privateKeyPem?: string | Buffer;
  sourceRepoRoot?: string;
  state?: Record<string, unknown>;
} = {}) {
  const harnessDir = tempDirectory("homecook-c2-harness-");
  const binDir = join(harnessDir, "bin");
  const snapshotDir = join(harnessDir, "snapshot");
  const privateKeyPath = join(harnessDir, "must-not-leak-private-key-path.pem");
  const statePath = join(harnessDir, "state.json");
  mkdirSync(binDir);
  writeFileSync(join(binDir, "gh"), FAKE_GH, { mode: 0o755 });
  writeFileSync(join(binDir, "git"), FAKE_GIT, { mode: 0o755 });
  const fetchPreloadPath = join(harnessDir, "fetch-preload.mjs");
  writeFileSync(fetchPreloadPath, FAKE_FETCH_PRELOAD, { mode: 0o600 });
  writeFileSync(privateKeyPath, privateKeyPem, { mode: privateKeyMode });
  const sourceHead = spawnSync(
    "/usr/bin/git",
    ["-C", sourceRepoRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).stdout.trim();
  if (
    JSON.stringify(state.remote_master_shas)
    === JSON.stringify([EXPECTED_HEAD, EXPECTED_HEAD])
  ) {
    state.remote_master_shas = [sourceHead, sourceHead];
  }
  writeFileSync(statePath, JSON.stringify({
    ...state,
    calls: [],
    expected_app_public_key: EPHEMERAL_RSA_KEY_PAIR.publicKey,
  }, null, 2));
  const bootstrap = spawnSync(
    "/usr/bin/git",
    [
      "-C",
      sourceRepoRoot,
      "show",
      "HEAD:scripts/bootstrap-production-release-rulesets.mjs",
    ],
  );
  if (bootstrap.status !== 0) throw new Error("Unable to read immutable bootstrap fixture.");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-",
      "--source-repo",
      sourceRepoRoot,
      "--expected-head",
      sourceHead,
      "apply",
      "--execute",
      "--confirm",
      CONFIRMATION,
      "--repo",
      "netsus/homecook",
      "--snapshot-dir",
      snapshotDir,
      "--app-id",
      "4724458",
      "--app-private-key-file",
      privateKeyPath,
      "--json",
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: bootstrap.stdout,
      env: {
        ...process.env,
        HOMECOOK_C2_MOCK_STATE: statePath,
        HOMECOOK_C2_COMPLETION_FILE: COMPLETION_FILE,
        HOMECOOK_C2_PRIVATE_KEY_PATH: privateKeyPath,
        HOMECOOK_C2_EXPECTED_HEAD: sourceHead,
        HOMECOOK_C2_REAL_REPO_ROOT: sourceRepoRoot,
        HOMECOOK_C2_SNAPSHOT_DIR: snapshotDir,
        HOMECOOK_C2_ROOT: sourceRepoRoot,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${fetchPreloadPath}`.trim(),
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        ...env,
      },
    },
  );
  return {
    combined: `${result.stdout}\n${result.stderr}`,
    privateKeyPath,
    result,
    snapshotDir,
    state: JSON.parse(readFileSync(statePath, "utf8")) as {
      calls: Array<{ args?: string[]; key: string; payload?: Record<string, unknown>; stdin_bytes?: number }>;
      environment: Record<string, unknown> | null;
      policies: Array<Record<string, unknown>>;
      effective_inventory_reads?: number;
      identity_calls?: Array<{
        alg?: string;
        exp?: number;
        iat?: number;
        iss?: number;
        method?: string;
        signature_valid?: boolean;
        url?: string;
      }>;
      remote_ref_reads?: number;
      ruleset_inventory_reads?: number;
      rulesets: Array<Record<string, unknown>>;
      secrets: Array<{ name: string }>;
      private_key_replaced?: boolean;
    },
  };
}

function resolvedRulesets() {
  return [
    "production-release-master",
    "production-release-tag-creation",
    "production-release-tag-immutability",
  ].map((name, index) => ({
    id: 101 + index,
    source: "netsus/homecook",
    source_type: "Repository",
    ...JSON.parse(readFileSync(join(repoRoot, ".github", "rulesets", `${name}.json`), "utf8")),
  }));
}

function runIndependentVerify(actualDir: string) {
  return spawnSync(
    process.execPath,
    [
      RULESET_SCRIPT,
      "verify",
      "--json",
      "--root-dir",
      immutableFixtureRoot,
      "--actual-dir",
      actualDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

beforeAll(() => {
  createImmutableFixture();
});

afterAll(() => {
  if (immutableFixtureRoot) {
    rmSync(immutableFixtureRoot, { force: true, recursive: true });
  }
});

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("production release C2 apply", { timeout: 10_000 }, () => {
  it("commits the approved Integration and User actor IDs", () => {
    const tagCreation = JSON.parse(
      readFileSync(join(repoRoot, ".github/rulesets/production-release-tag-creation.json"), "utf8"),
    );
    const environment = JSON.parse(
      readFileSync(join(repoRoot, ".github/rulesets/production-release-approval-environment.json"), "utf8"),
    );

    expect(tagCreation.bypass_actors).toEqual([
      { actor_id: 4724458, actor_type: "Integration", bypass_mode: "always" },
    ]);
    expect(environment.required_reviewers).toEqual([
      { actor_id: 57648890, actor_type: "User" },
    ]);
    expect(environment.wait_timer).toBe(0);
  });

  it("keeps apply dry-run by default and requires exact confirmation for execution", () => {
    const dryRun = spawnSync(process.execPath, [RULESET_SCRIPT, "apply", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({ dry_run: true, mode: "apply" });

    const blocked = runExecute({ args: ["--confirm", "wrong"] });
    expect(blocked.result.status).toBe(1);
    expect(blocked.combined).toContain(CONFIRMATION);
    expect(blocked.state.calls).toEqual([]);
  });

  it("rejects non-admin auth before any mutation", () => {
    const run = runExecute({ state: initialState({ admin: false }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/ADMIN/u);
    expect(run.state.calls.some((call) => call.key.startsWith("POST ") || call.key.startsWith("PUT ") || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("reports unexpected pre-mutation API failure with partial_state false", () => {
    const run = runExecute({
      state: initialState({ fail_on: "GET /repos/netsus/homecook" }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it.each([
    [{ HOMECOOK_C2_DIRTY: "true" }, /clean/iu],
    [{ HOMECOOK_C2_HEAD: "a".repeat(40) }, /origin\/master/iu],
    [{ HOMECOOK_C2_BRANCH: "feature/not-master" }, /master checkout/iu],
    [{ HOMECOOK_C2_ORIGIN_URL: "git@github.com:someone-else/copied-homecook.git" }, /canonical.*origin/iu],
  ])("rejects dirty or drifting source state", (env, message) => {
    const run = runExecute({ env });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(message);
    expect(run.state.calls).toEqual([]);
  });

  it.each([
    ["hidden desired ruleset edit", ".github/rulesets/production-release-tag-creation.json"],
    ["hidden imported script edit", "scripts/lib/production-release-rulesets.mjs"],
  ])("rejects %s before network or mutation", (_label, hiddenPath) => {
    const run = runExecute({
      state: initialState({ hidden_worktree_mismatch_path: hiddenPath }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.identity_calls).toBeUndefined();
    expect(run.state.calls).toEqual([]);
  });

  it("never executes a hidden worktree module top-level marker", () => {
    const hiddenPath = "scripts/lib/production-release-rulesets.mjs";
    const absolutePath = join(immutableFixtureRoot, hiddenPath);
    const original = readFileSync(absolutePath, "utf8");
    const markerPath = join(tempDirectory("homecook-c2-marker-"), "executed");
    const markerSource = `import { writeFileSync as writeHiddenMarker } from "node:fs";\nwriteHiddenMarker(process.env.HOMECOOK_C2_TOP_LEVEL_MARKER, "executed");\n`;
    expect(spawnSync(
      "/usr/bin/git",
      ["-C", immutableFixtureRoot, "update-index", "--assume-unchanged", hiddenPath],
    ).status).toBe(0);
    writeFileSync(absolutePath, `${markerSource}${original}`);
    try {
      const run = runExecute({
        env: { HOMECOOK_C2_TOP_LEVEL_MARKER: markerPath },
        state: initialState({ hidden_worktree_mismatch_path: hiddenPath }),
      });
      expect(run.result.status).toBe(1);
      expect(run.combined).toContain('"partial_state": false');
      expect(run.state.calls).toEqual([]);
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      writeFileSync(absolutePath, original);
      expect(spawnSync(
        "/usr/bin/git",
        ["-C", immutableFixtureRoot, "update-index", "--no-assume-unchanged", hiddenPath],
      ).status).toBe(0);
    }
  });

  it("uses immutable HEAD desired state during a restored worktree race", () => {
    const desiredPath = ".github/rulesets/production-release-master.json";
    const absolutePath = join(immutableFixtureRoot, desiredPath);
    const original = readFileSync(absolutePath, "utf8");
    const weakened = JSON.parse(original);
    const weakenedPullRequest = weakened.rules.find((rule: { type?: string }) =>
      rule.type === "pull_request");
    weakenedPullRequest.parameters.required_approving_review_count = 0;
    weakenedPullRequest.parameters.require_last_push_approval = false;
    const run = runExecute({
      state: initialState({
        desired_worktree_original: original,
        desired_worktree_race: true,
        desired_worktree_race_path: desiredPath,
        desired_worktree_weakened: JSON.stringify(weakened, null, 2),
      }),
    });
    expect(run.result.status, run.combined).toBe(0);
    const masterWrite = run.state.calls.find((call) =>
      call.key === "POST /repos/netsus/homecook/rulesets"
      && call.payload?.name === "production-release-master");
    const appliedPullRequest = (masterWrite?.payload?.rules as Array<{
      parameters?: Record<string, unknown>;
      type?: string;
    }>).find((rule) => rule.type === "pull_request");
    expect(appliedPullRequest?.parameters).toMatchObject({
      require_last_push_approval: true,
      required_approving_review_count: 1,
    });
    expect(readFileSync(absolutePath, "utf8")).toBe(original);
  }, 15_000);

  it.each([
    ["--assume-unchanged", ".github/rulesets/production-release-master.json"],
    ["--skip-worktree", "scripts/lib/production-release-rulesets.mjs"],
  ])("detects a real hidden %s worktree edit", (flag, hiddenPath) => {
    const rootDir = tempDirectory("homecook-c2-hidden-index-");
    const absolutePath = join(rootDir, hiddenPath);
    mkdirSync(join(absolutePath, ".."), { recursive: true });
    const original = readFileSync(join(repoRoot, hiddenPath), "utf8");
    writeFileSync(absolutePath, original);
    for (const args of [
      ["init", "-q"],
      ["config", "user.email", "c2-test@example.invalid"],
      ["config", "user.name", "C2 Test"],
      ["add", hiddenPath],
      ["commit", "-qm", "fixture"],
      ["update-index", flag, hiddenPath],
    ]) {
      expect(spawnSync("git", ["-C", rootDir, ...args]).status).toBe(0);
    }
    if (hiddenPath.endsWith("production-release-master.json")) {
      const weakened = JSON.parse(original);
      const pullRequest = weakened.rules.find((rule: { type?: string }) =>
        rule.type === "pull_request");
      pullRequest.parameters.required_approving_review_count = 0;
      pullRequest.parameters.require_last_push_approval = false;
      writeFileSync(absolutePath, JSON.stringify(weakened, null, 2));
    } else {
      writeFileSync(absolutePath, `${original}\n// hidden imported policy change\n`);
    }
    expect(spawnSync("git", ["-C", rootDir, "status", "--porcelain"], {
      encoding: "utf8",
    }).stdout).toBe("");

    const moduleUrl = pathToFileURL(
      join(repoRoot, "scripts/lib/exact-git-worktree.mjs"),
    ).href;
    const verification = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `import { verifyExactTrackedWorktree } from ${JSON.stringify(moduleUrl)};
       verifyExactTrackedWorktree(process.argv[1], "HEAD");`,
      rootDir,
    ], { encoding: "utf8" });

    expect(verification.status).toBe(1);
    expect(`${verification.stdout}\n${verification.stderr}`)
      .not.toContain("hidden imported policy change");
    const clearFlag = flag === "--assume-unchanged"
      ? "--no-assume-unchanged"
      : "--no-skip-worktree";
    expect(spawnSync("git", ["-C", rootDir, "update-index", clearFlag, hiddenPath]).status).toBe(0);
  });

  it("rejects a stale local tracking ref when the canonical remote master differs", () => {
    const run = runExecute({
      state: initialState({ remote_master_shas: ["a".repeat(40)] }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/remote master/iu);
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("rejects unresolved desired actors before GitHub access", () => {
    const rootDir = tempDirectory("homecook-c2-unresolved-");
    expect(spawnSync(
      "/usr/bin/git",
      ["clone", "-q", immutableFixtureRoot, rootDir],
    ).status).toBe(0);
    const rulesetDir = join(rootDir, ".github", "rulesets");
    const tagPath = join(rulesetDir, "production-release-tag-creation.json");
    const tag = JSON.parse(readFileSync(tagPath, "utf8"));
    tag.bypass_actors[0].actor_id = 0;
    writeFileSync(tagPath, JSON.stringify(tag, null, 2));
    const environmentPath = join(rulesetDir, "production-release-approval-environment.json");
    const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
    environment.required_reviewers = [{ actor_id: 0, actor_type: "Unresolved" }];
    writeFileSync(environmentPath, JSON.stringify(environment, null, 2));
    expect(spawnSync(
      "/usr/bin/git",
      ["-C", rootDir, "add", ".github/rulesets"],
    ).status).toBe(0);
    expect(spawnSync(
      "/usr/bin/git",
      ["-C", rootDir, "commit", "-qm", "unresolved actors"],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_EMAIL: "c2-unresolved@example.invalid",
          GIT_AUTHOR_NAME: "C2 Unresolved",
          GIT_COMMITTER_EMAIL: "c2-unresolved@example.invalid",
          GIT_COMMITTER_NAME: "C2 Unresolved",
        },
      },
    ).status).toBe(0);

    const run = runExecute({
      sourceRepoRoot: rootDir,
      state: initialState({
        remote_master_shas: [
          spawnSync("/usr/bin/git", ["-C", rootDir, "rev-parse", "HEAD"], {
            encoding: "utf8",
          }).stdout.trim(),
        ],
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/resolved desired state/iu);
    expect(run.state.calls).toEqual([]);
  });

  it("rejects noncanonical positive App and reviewer identities", () => {
    const rootDir = tempDirectory("homecook-c2-wrong-actors-");
    const rulesetDir = join(rootDir, ".github", "rulesets");
    const workflowDir = join(rootDir, ".github", "workflows");
    mkdirSync(rulesetDir, { recursive: true });
    mkdirSync(workflowDir, { recursive: true });
    for (const name of [
      "production-release-master",
      "production-release-tag-creation",
      "production-release-tag-immutability",
      "production-release-approval-environment",
    ]) {
      copyFileSync(
        join(repoRoot, ".github", "rulesets", `${name}.json`),
        join(rulesetDir, `${name}.json`),
      );
    }
    const tagPath = join(rulesetDir, "production-release-tag-creation.json");
    const tag = JSON.parse(readFileSync(tagPath, "utf8"));
    tag.bypass_actors[0].actor_id = 12345;
    writeFileSync(tagPath, JSON.stringify(tag, null, 2));
    const environmentPath = join(rulesetDir, "production-release-approval-environment.json");
    const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
    environment.required_reviewers = [{ actor_id: 57648890, actor_type: "Team" }];
    writeFileSync(environmentPath, JSON.stringify(environment, null, 2));
    copyFileSync(
      join(repoRoot, ".github/workflows/production-release-attestation.yml"),
      join(workflowDir, "production-release-attestation.yml"),
    );
    const plan = spawnSync(
      process.execPath,
      [RULESET_SCRIPT, "plan", "--json", "--root-dir", rootDir],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(plan.status).toBe(1);
    expect(plan.stderr).toMatch(/4724458|57648890|exact/iu);
  });

  it("rejects overly broad private-key permissions and never prints its path", () => {
    const run = runExecute({ privateKeyMode: 0o644 });
    const output = run.combined;
    expect(run.result.status).toBe(1);
    expect(output).toMatch(/0600/iu);
    expect(output).not.toContain(run.privateKeyPath);
  }, 15_000);

  it("uses the single validated RSA buffer after the key path is replaced", () => {
    const run = runExecute({
      state: initialState({ replace_private_key_after_mutation: true }),
    });
    expect(run.result.status, run.combined).toBe(0);
    const privateKeyCall = run.state.calls.find(
      (call) => call.key === "SECRET HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
    );
    expect(run.state.private_key_replaced).toBe(true);
    expect(privateKeyCall?.stdin_bytes).toBe(EPHEMERAL_RSA_PRIVATE_KEY_BYTES);
  }, 15_000);

  it.each([
    ["empty", ""],
    ["malformed", "not-a-private-key"],
    ["public", EPHEMERAL_RSA_KEY_PAIR.publicKey],
    ["non-RSA", generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    }).privateKey],
  ])("rejects a %s App private key without disclosing it", (_label, privateKeyPem) => {
    const run = runExecute({ privateKeyPem });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/RSA private key/iu);
    if (String(privateKeyPem).length > 0) {
      expect(run.combined).not.toContain(String(privateKeyPem));
    }
    expect(run.combined).not.toContain(run.privateKeyPath);
    expect(run.state.calls).toEqual([]);
  });

  it("verifies the correct RSA key against the pinned GitHub App identity", () => {
    const bootstrapDirectoriesBefore = new Set(
      readdirSync(tmpdir()).filter((name) => name.startsWith("homecook-c2-immutable-")),
    );
    const run = runExecute();
    expect(run.result.status, run.combined).toBe(0);
    expect(run.state.identity_calls).toHaveLength(1);
    expect(run.state.identity_calls?.[0]).toMatchObject({
      alg: "RS256",
      iss: 4724458,
      method: "GET",
      signature_valid: true,
      url: "https://api.github.com/app",
    });
    const call = run.state.identity_calls?.[0];
    expect((call?.exp ?? 0) - (call?.iat ?? 0)).toBeLessThanOrEqual(600);
    expect(JSON.stringify(run.state.identity_calls)).not.toContain("Bearer");
    expect(run.combined).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./u);
    const snapshotText = readdirSync(run.snapshotDir)
      .map((name) => readFileSync(join(run.snapshotDir, name), "utf8"))
      .join("\n");
    expect(snapshotText).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./u);
    const leakedBootstrapDirectories = readdirSync(tmpdir()).filter((name) =>
      name.startsWith("homecook-c2-immutable-")
      && !bootstrapDirectoriesBefore.has(name));
    expect(leakedBootstrapDirectories).toEqual([]);
  });

  it("rejects a wrong but valid RSA key before mutation", () => {
    const wrongKey = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    }).privateKey;
    const run = runExecute({ privateKeyPem: wrongKey });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.combined).not.toContain(wrongKey);
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it.each([
    ["authentication failure", { identity_force_failure: true }],
    ["wrong App id", { identity_response_id: 999 }],
  ])("rejects GitHub App identity %s before mutation", (_label, identityState) => {
    const run = runExecute({ state: initialState(identityState) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("refuses duplicate canonical rulesets and unknown overlapping rulesets", () => {
    const canonical = resolvedRulesets();
    const duplicate = runExecute({
      state: initialState({ rulesets: [...canonical, { ...canonical[0], id: 999 }] }),
    });
    expect(duplicate.result.status).toBe(1);
    expect(duplicate.combined).toMatch(/duplicate/iu);

    const conflict = runExecute({
      state: initialState({
        rulesets: [
          ...canonical,
          {
            id: 999,
            name: "unknown-prod-tag-policy",
            target: "tag",
            source: "netsus/homecook",
            source_type: "Repository",
            enforcement: "active",
            conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
            rules: [{ type: "creation" }],
            bypass_actors: [],
          },
        ],
      }),
    });
    expect(conflict.result.status).toBe(1);
    expect(conflict.combined).toMatch(/unknown conflicting/iu);
  });

  it.each([
    ["branch wildcard", "branch", "refs/heads/*"],
    ["prod-tag prefix wildcard", "tag", "refs/tags/prod-2026*"],
  ])("refuses an unknown %s ruleset that semantically overlaps canonical refs", (_label, target, include) => {
    const run = runExecute({
      state: initialState({
        rulesets: [
          ...resolvedRulesets(),
          {
            id: 999,
            name: "unknown-overlapping-policy",
            target,
            source: "netsus/homecook",
            source_type: "Repository",
            enforcement: "active",
            conditions: { ref_name: { include: [include], exclude: [] } },
            rules: [{ type: "creation" }],
            bypass_actors: [],
          },
        ],
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/unknown conflicting/iu);
  });

  it.each([
    ["tag", "refs/tags/prod[0-9]*"],
    ["branch", "refs/*master"],
  ])("preserves an unknown %s ruleset that cannot overlap canonical refs", (target, include) => {
    const unknownRuleset = {
      id: 999,
      name: `non-overlapping-${target}-policy`,
      target,
      source: "netsus/homecook",
      source_type: "Repository",
      enforcement: "active",
      conditions: { ref_name: { include: [include], exclude: [] } },
      rules: [{ type: "creation" }],
      bypass_actors: [],
    };
    const run = runExecute({
      state: initialState({ rulesets: [...resolvedRulesets(), unknownRuleset] }),
    });
    expect(run.result.status, run.combined).toBe(0);
    expect(run.state.rulesets).toContainEqual(unknownRuleset);
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
  }, 15_000);

  it.each([
    ["deployment branch policies", { policies: [{ id: 1, name: "prod-*", type: "tag" }] }, /extra deployment/iu],
    ["environment secrets", { secrets: [{ name: "UNEXPECTED_SECRET" }] }, /extra environment secret/iu],
  ])("refuses preexisting extra %s instead of deleting them", (_label, extras, message) => {
    const environment = {
      name: "production-release-approval",
      can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: true,
          reviewers: [{ type: "User", reviewer: { id: 57648890 } }],
        },
        { type: "branch_policy" },
      ],
    };
    const run = runExecute({ state: initialState({ environment, ...extras }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(message);
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
  });

  it("resets a preexisting nonzero environment wait timer to zero", () => {
    const environment = {
      name: "production-release-approval",
      can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [
        { type: "wait_timer", wait_timer: 10 },
        {
          type: "required_reviewers",
          prevent_self_review: true,
          reviewers: [{ type: "User", reviewer: { id: 57648890 } }],
        },
        { type: "branch_policy" },
      ],
    };
    const run = runExecute({
      state: initialState({
        environment,
        policies: [{ id: 1, name: "master", type: "branch" }],
        rulesets: resolvedRulesets(),
        secrets: [
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_ID" },
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY" },
        ],
      }),
    });
    expect(run.result.status, run.combined).toBe(0);
    expect(run.state.calls).toContainEqual(expect.objectContaining({
      key: "PUT /repos/netsus/homecook/environments/production-release-approval",
      payload: expect.objectContaining({ wait_timer: 0 }),
    }));
    const environmentPut = run.state.calls.find((call) =>
      call.key === "PUT /repos/netsus/homecook/environments/production-release-approval");
    expect(environmentPut?.payload).not.toHaveProperty("can_admins_bypass");

    const rerun = runExecute({ state: run.state });
    expect(rerun.result.status, rerun.combined).toBe(0);
    expect(rerun.state.calls.some((call) =>
      call.key === "PUT /repos/netsus/homecook/environments/production-release-approval"))
      .toBe(false);
  }, 15_000);

  it("fails closed with partial-state reporting on an API failure and never rolls back", () => {
    const failureKey = "POST /repos/netsus/homecook/rulesets";
    const run = runExecute({ state: initialState({ fail_on: failureKey }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toContain("mock API failure");
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
  });

  it.each([
    ["missing", null],
    ["enabled", approvedEnvironmentReadback({ can_admins_bypass: true })],
  ])("fails closed with manual action when admin bypass is %s", (label, environment) => {
    const run = runExecute({ state: initialState({ environment, policies: [] }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain(
      label === "enabled" ? '"partial_state": false' : '"partial_state": true',
    );
    expect(run.combined).toContain('"manual_action_required": true');
    expect(run.combined).toMatch(/admin bypass/iu);
    expect(run.state.calls.filter((call) => call.key.startsWith("SECRET "))).toEqual([]);
    expect(run.state.calls.some((call) =>
      call.key.endsWith("/deployment-branch-policies") && call.key.startsWith("POST ")))
      .toBe(false);
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
    if (label === "enabled") {
      expect(run.state.calls.some((call) =>
        call.key.startsWith("POST ")
        || call.key.startsWith("PUT ")
        || call.key.startsWith("SECRET "))).toBe(false);
    }
  });

  it("fails closed when remote master drifts after mutation and before snapshot", () => {
    const run = runExecute({
      state: initialState({ remote_master_shas: [EXPECTED_HEAD, "b".repeat(40)] }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/remote master/iu);
    expect(existsSync(run.snapshotDir)).toBe(true);
    expect(readdirSync(run.snapshotDir)).toEqual([]);
  });

  it.each([
    ["duplicate", { ...resolvedRulesets()[0], id: 999 }],
    ["unknown overlap", {
      id: 999,
      name: "concurrent-prod-policy",
      target: "tag",
      source: "netsus/homecook",
      source_type: "Repository",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
      rules: [{ type: "creation" }],
      bypass_actors: [],
    }],
  ])("fails partial when post-mutation ruleset inventory gains a %s", (_label, rulesetRace) => {
    const run = runExecute({
      state: initialState({ ruleset_race: rulesetRace }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/duplicate|unknown conflicting/iu);
    expect(run.state.ruleset_inventory_reads).toBe(2);
  });

  it("treats reordered ruleset keys and server metadata as semantically equal", () => {
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .reverse()
            .map(([key, entry]) => [key, reorder(entry)]),
        );
      }
      return value;
    };
    const rulesets = resolvedRulesets().map((ruleset) => ({
      ...(reorder(ruleset) as Record<string, unknown>),
      _links: { html: "https://example.invalid/ruleset" },
      node_id: "server-metadata",
    }));
    const run = runExecute({ state: initialState({ rulesets }) });
    expect(run.result.status, run.combined).toBe(0);
    expect(run.state.calls.some((call) =>
      call.key.startsWith("PUT /repos/netsus/homecook/rulesets/"))).toBe(false);
  });

  it("repairs a canonical ruleset that has an extra unsafe rule", () => {
    const rulesets = resolvedRulesets();
    const tagCreation = rulesets.find((entry) => entry.name === "production-release-tag-creation");
    tagCreation?.rules.push({ type: "update" });
    const run = runExecute({ state: initialState({ rulesets }) });
    expect(run.result.status, run.combined).toBe(0);
    expect(run.state.calls.some((call) =>
      call.key === "PUT /repos/netsus/homecook/rulesets/102")).toBe(true);
  });

  it("fails closed on an overlapping parent effective ruleset", () => {
    const repositoryRulesets = resolvedRulesets();
    const parentRuleset = {
      id: 999,
      name: "organization-prod-policy",
      target: "tag",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
      rules: [{ type: "creation" }],
      bypass_actors: [],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, parentRuleset],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.combined).toMatch(/parent|effective/iu);
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it.each([
    ["organization repository_name protected/exempt", {
      source_type: "Organization",
      source: "netsus",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_name: { include: ["homecook"], exclude: [], protected: true },
      },
      bypass_actors: [{
        actor_id: 42,
        actor_type: "Team",
        bypass_mode: "exempt",
      }, {
        actor_id: 99,
        actor_type: "OrganizationAdmin",
        bypass_mode: "always",
      }, {
        actor_id: 99,
        actor_type: "EnterpriseOwner",
        bypass_mode: "exempt",
      }, {
        actor_id: null,
        actor_type: "EnterpriseRole",
        bypass_mode: "always",
      }],
    }],
    ["organization repository_id", {
      source_type: "Organization",
      source: "netsus",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_id: { repository_ids: [123456789] },
      },
    }],
    ["organization repository_property source", {
      source_type: "Organization",
      source: "netsus",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_property: {
          include: [{ name: "visibility", property_values: ["private"], source: "system" }],
          exclude: [],
        },
      },
    }],
    ["enterprise organization_name", {
      source_type: "Enterprise",
      source: "netsus-enterprise",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        organization_name: { include: ["netsus"], exclude: [] },
        repository_name: { include: ["homecook"], exclude: [], protected: false },
      },
      bypass_actors: [
        { actor_id: 99, actor_type: "EnterpriseOwner", bypass_mode: "exempt" },
        { actor_id: null, actor_type: "EnterpriseRole", bypass_mode: "always" },
      ],
    }],
    ["enterprise organization_id", {
      source_type: "Enterprise",
      source: "netsus-enterprise",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        organization_id: { organization_ids: [987654321] },
        repository_property: {
          include: [{ name: "visibility", property_values: ["private"], source: "system" }],
          exclude: [],
        },
      },
    }],
    ["enterprise organization_property", {
      source_type: "Enterprise",
      source: "netsus-enterprise",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        organization_property: {
          include: [{ name: "region", property_values: ["kr"] }],
          exclude: [],
        },
        repository_name: { include: ["homecook"], exclude: [], protected: true },
      },
    }],
  ])("converges with official inherited %s fixture", (_label, fixture) => {
    const repositoryRulesets = resolvedRulesets();
    const inheritedRuleset = {
      id: 997,
      name: "organization-release-branch-policy",
      target: "branch",
      enforcement: "active",
      ...fixture,
      rules: [{
        type: "pull_request",
        parameters: { required_approving_review_count: 1 },
      }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, inheritedRuleset],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status, run.combined).toBe(0);
  }, 10_000);

  it("rejects ambiguous inherited condition union before mutation", () => {
    const repositoryRulesets = resolvedRulesets();
    const ambiguous = {
      id: 995,
      name: "ambiguous-organization-policy",
      target: "branch",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_name: { include: ["homecook"], exclude: [] },
        repository_id: { repository_ids: [123456789] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, ambiguous],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("rejects unknown nested ref_name field before mutation", () => {
    const repositoryRulesets = resolvedRulesets();
    const invalidRef = {
      id: 991,
      name: "invalid-ref-policy",
      target: "branch",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["refs/heads/release/*"],
          exclude: ["refs/heads/master"],
          unsupported: true,
        },
        repository_name: { include: ["homecook"], exclude: [] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, invalidRef],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it.each([
    ["Team without ID", "Organization", "branch", {
      actor_id: null,
      actor_type: "Team",
      bypass_mode: "always",
    }],
    ["DeployKey with ID", "Organization", "branch", {
      actor_id: 9,
      actor_type: "DeployKey",
      bypass_mode: "always",
    }],
    ["Team pull_request on tag", "Organization", "tag", {
      actor_id: 42,
      actor_type: "Team",
      bypass_mode: "pull_request",
    }],
    ["DeployKey pull_request", "Organization", "branch", {
      actor_id: null,
      actor_type: "DeployKey",
      bypass_mode: "pull_request",
    }],
    ["EnterpriseRole with zero ID", "Enterprise", "branch", {
      actor_id: 0,
      actor_type: "EnterpriseRole",
      bypass_mode: "always",
    }],
    ["EnterpriseRole with negative ID", "Enterprise", "branch", {
      actor_id: -1,
      actor_type: "EnterpriseRole",
      bypass_mode: "always",
    }],
  ])("rejects inherited bypass actor %s before mutation", (
    _label,
    sourceType,
    target,
    bypassActor,
  ) => {
    const repositoryRulesets = resolvedRulesets();
    const conditions = sourceType === "Enterprise"
      ? {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        organization_name: { include: ["netsus"], exclude: [] },
        repository_name: { include: ["homecook"], exclude: [] },
      }
      : {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_name: { include: ["homecook"], exclude: [] },
      };
    const invalidBypass = {
      id: 992,
      name: "invalid-bypass-policy",
      target,
      source_type: sourceType,
      source: sourceType === "Enterprise" ? "netsus-enterprise" : "netsus",
      enforcement: "active",
      conditions,
      bypass_actors: [bypassActor],
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, invalidBypass],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("rejects effective inventory entry with missing source identity before mutation", () => {
    const repositoryRulesets = resolvedRulesets();
    const missingSource = {
      id: 994,
      name: "missing-source-policy",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        repository_name: { include: ["homecook"], exclude: [] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, missingSource],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("rejects repository-origin effective detail with omitted bypass actors", () => {
    const repositoryRulesets = resolvedRulesets();
    const partialRepositoryRule = {
      id: 993,
      name: "repository-release-policy",
      target: "branch",
      source_type: "Repository",
      source: "netsus/homecook",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: [...repositoryRulesets, partialRepositoryRule],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it.each([
    ["Team negative ID", { actor_id: -7, actor_type: "Team", bypass_mode: "always" }],
    ["Integration zero ID", { actor_id: 0, actor_type: "Integration", bypass_mode: "always" }],
    ["unknown actor", { actor_id: 1, actor_type: "UnknownActor", bypass_mode: "always" }],
    ["EnterpriseOwner on repository", {
      actor_id: null,
      actor_type: "EnterpriseOwner",
      bypass_mode: "always",
    }],
    ["DeployKey non-null ID", { actor_id: 123, actor_type: "DeployKey", bypass_mode: "always" }],
    ["invalid mode", { actor_id: 1, actor_type: "Team", bypass_mode: "invalid" }],
  ])("rejects repository-origin bypass actor %s before mutation", (_label, actor) => {
    const repositoryRulesets = resolvedRulesets();
    const invalid = {
      id: 988,
      name: "repository-invalid-bypass",
      target: "branch",
      source_type: "Repository",
      source: "netsus/homecook",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
      bypass_actors: [actor],
    };
    const run = runExecute({
      state: initialState({
        rulesets: [...repositoryRulesets, invalid],
        effective_rulesets: [...repositoryRulesets, invalid],
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("fails closed when effective inventory omits canonical repository rulesets", () => {
    const repositoryRulesets = resolvedRulesets();
    const run = runExecute({
      state: initialState({
        effective_rulesets: [],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.combined).toMatch(/effective/iu);
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("fails before mutation when canonical repository/effective IDs disagree", () => {
    const repositoryRulesets = resolvedRulesets();
    const effectiveRulesets = repositoryRulesets.map((ruleset, index) =>
      index === 0 ? { ...ruleset, id: ruleset.id + 1000 } : ruleset);
    const run = runExecute({
      state: initialState({
        effective_rulesets: effectiveRulesets,
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
    expect(run.state.calls.some((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "))).toBe(false);
  });

  it("detects full actual-state drift after snapshot storage", () => {
    const repositoryRulesets = resolvedRulesets();
    const drift = {
      id: 998,
      name: "late-prod-policy",
      target: "tag",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
      rules: [{ type: "creation" }],
      bypass_actors: [],
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: repositoryRulesets,
        effective_state_race: drift,
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.state.effective_inventory_reads).toBe(3);
    expect(existsSync(join(run.snapshotDir, "production-release-effective-rulesets.json")))
      .toBe(true);
    expect(existsSync(join(run.snapshotDir, COMPLETION_FILE))).toBe(false);
    const independent = runIndependentVerify(run.snapshotDir);
    expect(independent.status, independent.stderr).toBe(0);
    expect(independent.stdout).toContain("missing_snapshot_completion_manifest");
  });

  it("does not overwrite a raced completion marker", () => {
    const run = runExecute({ state: initialState({ precreate_completion_marker: true }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(readFileSync(join(run.snapshotDir, COMPLETION_FILE), "utf8"))
      .toBe("attacker-marker");
  }, 15_000);

  it("wraps unexpected post-mutation normalization failure as partial state", () => {
    const repositoryRulesets = resolvedRulesets();
    const unsupportedInheritedShape = {
      id: 996,
      name: "late-non-conflicting-policy",
      target: "branch",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/release/*"], exclude: ["refs/heads/master"] },
        unsupported_condition: { include: ["unsafe"] },
      },
      rules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }],
      unsupported_server_field: true,
    };
    const run = runExecute({
      state: initialState({
        effective_rulesets: repositoryRulesets,
        effective_state_race: unsupportedInheritedShape,
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/unexpected|normalization|unsupported/iu);
  });

  it("applies exact state, captures a validator-matched snapshot, and reruns idempotently", () => {
    const first = runExecute();
    expect(first.result.status, first.combined).toBe(0);
    const result = JSON.parse(first.result.stdout);
    expect(result).toMatchObject({
      activation_blocked: false,
      actual_state: "matched",
      dry_run: false,
      mode: "apply",
      private_key: { supplied: true },
    });
    expect(first.state.rulesets).toHaveLength(3);
    expect(first.state.rulesets.map((entry) => entry.name).sort()).toEqual([
      "production-release-master",
      "production-release-tag-creation",
      "production-release-tag-immutability",
    ]);
    for (const ruleset of first.state.rulesets) expect(ruleset).not.toHaveProperty("schema");
    expect(first.state.environment).toMatchObject({ can_admins_bypass: false });
    expect(first.state.policies).toEqual([
      expect.objectContaining({ name: "master", type: "branch" }),
    ]);
    expect(first.state.secrets.map((entry) => entry.name).sort()).toEqual([
      "HOMECOOK_RELEASE_ATTESTATION_APP_ID",
      "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
    ]);
    expect(first.state.remote_ref_reads).toBe(3);
    expect(first.state.ruleset_inventory_reads).toBe(3);
    expect(first.state.effective_inventory_reads).toBe(3);
    const remoteReadIndexes = first.state.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) =>
        call.key === "GET /repos/netsus/homecook/git/ref/heads/master")
      .map(({ index }) => index);
    const firstMutationIndex = first.state.calls.findIndex((call) =>
      call.key.startsWith("POST ")
      || call.key.startsWith("PUT ")
      || call.key.startsWith("SECRET "));
    expect(remoteReadIndexes).toHaveLength(3);
    expect(remoteReadIndexes[0] + 1).toBe(firstMutationIndex);
    expect(remoteReadIndexes[2]).toBe(first.state.calls.length - 1);
    const snapshotFiles = [
      "production-release-master.json",
      "production-release-tag-creation.json",
      "production-release-tag-immutability.json",
      "production-release-approval-environment.json",
      "production-release-approval-deployment-branch-policies.json",
      "production-release-approval-environment-secrets.json",
      "production-release-repository-rulesets.json",
      "production-release-effective-rulesets.json",
    ];
    expect(snapshotFiles.every((name) => existsSync(join(first.snapshotDir, name)))).toBe(true);
    const completion = JSON.parse(
      readFileSync(join(first.snapshotDir, COMPLETION_FILE), "utf8"),
    );
    expect(completion).toMatchObject({
      schema: "homecook.github.production-release-snapshot-completion.v1",
      version: 1,
      status: "verified",
      repository: "netsus/homecook",
      app_id: 4724458,
      reviewer: { actor_id: 57648890, actor_type: "User" },
    });
    expect(completion.head).toBe(EXPECTED_HEAD);
    expect(completion.head_tree).toBe(
      spawnSync("/usr/bin/git", ["rev-parse", "HEAD^{tree}"], {
        cwd: immutableFixtureRoot,
        encoding: "utf8",
      }).stdout.trim(),
    );
    expect(Object.keys(completion.desired_policy_blobs)).toEqual([
      ".github/rulesets/production-release-master.json",
      ".github/rulesets/production-release-tag-creation.json",
      ".github/rulesets/production-release-tag-immutability.json",
      ".github/rulesets/production-release-approval-environment.json",
      ".github/workflows/production-release-attestation.yml",
    ]);
    expect(completion.files).toHaveLength(snapshotFiles.length);
    const snapshotBundle = snapshotFiles
      .map((name) => readFileSync(join(first.snapshotDir, name), "utf8"))
      .join("\n");
    expect(snapshotBundle).not.toContain("PRIVATE KEY");

    const second = runExecute({ state: first.state });
    expect(second.result.status, second.combined).toBe(0);
    expect(second.state.calls.filter((call) =>
      call.key.startsWith("POST ") || call.key.startsWith("PUT "))).toEqual([]);
    expect(second.state.calls.filter((call) => call.key.startsWith("SECRET ")))
      .toHaveLength(2);
  }, 15_000);

  it("blocks independent verification after snapshot tampering", () => {
    const run = runExecute();
    expect(run.result.status, run.combined).toBe(0);
    const completionPath = join(run.snapshotDir, COMPLETION_FILE);
    const completionSource = readFileSync(completionPath, "utf8");
    const completion = JSON.parse(completionSource);
    completion.desired_policy_blobs[".github/rulesets/production-release-master.json"] =
      "0".repeat(40);
    writeFileSync(completionPath, JSON.stringify(completion, null, 2));
    const sourceBinding = runIndependentVerify(run.snapshotDir);
    expect(sourceBinding.status, sourceBinding.stderr).toBe(0);
    expect(sourceBinding.stdout).toContain("snapshot_completion_manifest_mismatch");
    writeFileSync(completionPath, completionSource);
    const target = join(run.snapshotDir, "production-release-master.json");
    writeFileSync(target, `${readFileSync(target, "utf8")} `);
    const independent = runIndependentVerify(run.snapshotDir);
    expect(independent.status, independent.stderr).toBe(0);
    expect(independent.stdout).toContain("snapshot_completion_digest_mismatch");
  });

  it("redacts the private-key path and content channel from success and failure output", () => {
    const success = runExecute();
    expect(success.result.status, success.combined).toBe(0);
    expect(success.combined).not.toContain(success.privateKeyPath);
    expect(success.combined).not.toContain("must-not-leak-private-key-path");
    const privateKeyCall = success.state.calls.find(
      (call) => call.key === "SECRET HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
    );
    expect(privateKeyCall?.args).not.toContain(success.privateKeyPath);
    expect(privateKeyCall?.stdin_bytes).toBeGreaterThan(0);
  });

  it("pins official GitHub REST headers on every gh api call", () => {
    const run = runExecute();
    expect(run.result.status, run.combined).toBe(0);
    const apiCalls = run.state.calls.filter((call) => /^GET |^POST |^PUT /u.test(call.key));
    expect(apiCalls.length).toBeGreaterThan(0);
    for (const call of apiCalls) {
      expect(call.args).toEqual(expect.arrayContaining([
        "-H",
        ACCEPT_HEADER,
        "-H",
        VERSION_HEADER,
      ]));
    }
  });

  it("pins every gh boundary to github.com despite hostile GH_HOST", () => {
    const run = runExecute({ env: { GH_HOST: "evil.example" } });
    expect(run.result.status, run.combined).toBe(0);
    const apiCalls = run.state.calls.filter((call) => /^GET |^POST |^PUT /u.test(call.key));
    for (const call of apiCalls) {
      expect(call.args).toEqual(expect.arrayContaining(["--hostname", "github.com"]));
    }
    const secretCalls = run.state.calls.filter((call) => call.key.startsWith("SECRET "));
    expect(secretCalls).toHaveLength(2);
    for (const call of secretCalls) {
      expect(call.args).toEqual(expect.arrayContaining([
        "--repo",
        "github.com/netsus/homecook",
      ]));
    }
  });

  it("documents pinned REST headers and manual admin-bypass action", () => {
    const runbook = readFileSync(
      join(repoRoot, "docs/engineering/local-mac-production-release-promotion.md"),
      "utf8",
    );
    expect(runbook).toContain(ACCEPT_HEADER);
    expect(runbook).toContain(VERSION_HEADER);
    expect(runbook).toContain("Allow administrators to bypass");
    expect(runbook).toContain("manual_action_required");
    expect(runbook).toContain("production-release-snapshot-completion.json");
    expect(runbook).toContain("authoritative C2 evidence");
    expect(runbook).toContain("operator는 completion marker를 수동 작성하지 않는다");
    expect(runbook).not.toContain("deployment-branch-policies.jsonl");
    expect(runbook).not.toContain('"$C2_ACTUAL_DIR/verify.json"');
  });

  it("uses the shared canonical-target matcher without an apply-local duplicate", () => {
    const applySource = readFileSync(
      join(repoRoot, "scripts/lib/production-release-rulesets-apply.mjs"),
      "utf8",
    );
    expect(applySource).toContain("productionReleaseRulesetConflictsWithCanonicalTarget");
    expect(applySource).not.toContain("function globMatches(");
    expect(applySource).not.toContain("function conflictsWithCanonicalTarget(");
  });

  it.each([
    ["repository policy without ref", {
      target: "repository",
      conditions: { repository_name: { include: ["homecook"], exclude: [] } },
    }, false],
    ["push rule without ref", {
      target: "push",
      conditions: { repository_name: { include: ["homecook"], exclude: [] } },
    }, false],
    ["all branches with master excluded", {
      target: "branch",
      conditions: {
        ref_name: { include: ["~ALL"], exclude: ["refs/heads/master"] },
      },
    }, false],
    ["all branches with only default branch excluded", {
      target: "branch",
      conditions: {
        ref_name: { include: ["~ALL"], exclude: ["~DEFAULT_BRANCH"] },
      },
    }, true],
    ["actual master overlap", {
      target: "branch",
      conditions: {
        ref_name: { include: ["refs/heads/master"], exclude: [] },
      },
    }, true],
    ["ambiguous branch pattern", {
      target: "branch",
      conditions: {
        ref_name: { include: ["refs/heads/[invalid"], exclude: [] },
      },
    }, true],
    ["FNM_PATHNAME double-star exclusion without slash", {
      target: "branch",
      conditions: {
        ref_name: { include: ["~ALL"], exclude: ["refs/**master"] },
      },
    }, true],
    ["FNM_PATHNAME ambiguous four-star exclusion", {
      target: "branch",
      conditions: {
        ref_name: { include: ["~ALL"], exclude: ["refs/****/r"] },
      },
    }, true],
    ["unsupported caret complement", {
      target: "branch",
      conditions: {
        ref_name: { include: ["refs/heads/[^a]aster"], exclude: [] },
      },
    }, true],
    ["supported question and class", {
      target: "branch",
      conditions: {
        ref_name: { include: ["refs/heads/maste?", "refs/heads/m[ae]ster"], exclude: [] },
      },
    }, true],
    ["supported globstar directory form", {
      target: "branch",
      conditions: {
        ref_name: { include: ["refs/**/master"], exclude: [] },
      },
    }, true],
  ])("matches canonical target for %s", async (_label, ruleset, expected) => {
    const patternModule = await import(pathToFileURL(
      join(repoRoot, "scripts/lib/production-release-ruleset-patterns.mjs"),
    ).href);
    expect(
      patternModule.productionReleaseRulesetConflictsWithCanonicalTarget(ruleset),
    ).toBe(expected);
  });

  it("accepts a legal repository-origin push rule end to end", () => {
    const repositoryRulesets = resolvedRulesets();
    const pushRule = {
      id: 990,
      name: "repository-push-policy",
      target: "push",
      source: "netsus/homecook",
      source_type: "Repository",
      enforcement: "active",
      rules: [{ type: "file_path_restriction", parameters: { restricted_file_paths: [".env"] } }],
      bypass_actors: [],
    };
    const run = runExecute({
      state: initialState({
        rulesets: [...repositoryRulesets, pushRule],
        effective_rulesets: [...repositoryRulesets, pushRule],
      }),
    });
    expect(run.result.status, run.combined).toBe(0);
    expect(run.result.stdout).toContain('"actual_state": "matched"');
  }, 10_000);

  it("rejects unknown conditions on a repository-origin push rule", () => {
    const repositoryRulesets = resolvedRulesets();
    const pushRule = {
      id: 989,
      name: "invalid-push-policy",
      target: "push",
      source: "netsus/homecook",
      source_type: "Repository",
      enforcement: "active",
      conditions: { unsupported: true },
      rules: [{ type: "file_path_restriction", parameters: { restricted_file_paths: [".env"] } }],
      bypass_actors: [],
    };
    const run = runExecute({
      state: initialState({
        rulesets: [...repositoryRulesets, pushRule],
        effective_rulesets: [...repositoryRulesets, pushRule],
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": false');
  });
});
