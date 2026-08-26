import {
  chmodSync,
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

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");
const CONFIRMATION = "APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS";
const EXPECTED_HEAD = "e806916d42a1aab2749d6a9f239cf5043b300250";
const ACCEPT_HEADER = "Accept: application/vnd.github+json";
const VERSION_HEADER = "X-GitHub-Api-Version: 2026-03-10";
const temporaryDirectories: string[] = [];
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
    if (state.effective_inventory_reads === 2 && state.effective_state_race && !state.effective_state_race_inserted) {
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
const args = process.argv.slice(2);
const command = args.join(" ");
if (command.endsWith("rev-parse --show-toplevel")) process.stdout.write(process.env.HOMECOOK_C2_ROOT + "\n");
else if (command.endsWith("rev-parse HEAD")) process.stdout.write((process.env.HOMECOOK_C2_HEAD ?? "${EXPECTED_HEAD}") + "\n");
else if (command.endsWith("rev-parse origin/master")) process.stdout.write((process.env.HOMECOOK_C2_ORIGIN_MASTER ?? "${EXPECTED_HEAD}") + "\n");
else if (command.endsWith("rev-parse --abbrev-ref HEAD")) process.stdout.write((process.env.HOMECOOK_C2_BRANCH ?? "master") + "\n");
else if (command.endsWith("config --get remote.origin.url")) process.stdout.write((process.env.HOMECOOK_C2_ORIGIN_URL ?? "git@github.com:netsus/homecook.git") + "\n");
else if (command.endsWith("status --porcelain")) process.stdout.write(process.env.HOMECOOK_C2_DIRTY === "true" ? " M dirty\n" : "");
else { process.stderr.write("unexpected fake git invocation: " + command + "\n"); process.exit(1); }
`;

function tempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
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
  privateKeyPem = EPHEMERAL_RSA_KEY_PAIR.privateKey,
  state = initialState(),
}: {
  args?: string[];
  env?: Record<string, string>;
  privateKeyPem?: string | Buffer;
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
  writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
  writeFileSync(statePath, JSON.stringify({ ...state, calls: [] }, null, 2));
  const result = spawnSync(
    process.execPath,
    [
      RULESET_SCRIPT,
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
      env: {
        ...process.env,
        HOMECOOK_C2_MOCK_STATE: statePath,
        HOMECOOK_C2_PRIVATE_KEY_PATH: privateKeyPath,
        HOMECOOK_C2_ROOT: repoRoot,
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
    ...JSON.parse(readFileSync(join(repoRoot, ".github", "rulesets", `${name}.json`), "utf8")),
  }));
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("production release C2 apply", () => {
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
    tag.bypass_actors[0].actor_id = 0;
    writeFileSync(tagPath, JSON.stringify(tag, null, 2));
    const environmentPath = join(rulesetDir, "production-release-approval-environment.json");
    const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
    environment.required_reviewers = [{ actor_id: 0, actor_type: "Unresolved" }];
    writeFileSync(environmentPath, JSON.stringify(environment, null, 2));
    copyFileSync(
      join(repoRoot, ".github/workflows/production-release-attestation.yml"),
      join(workflowDir, "production-release-attestation.yml"),
    );

    const run = runExecute({
      args: ["--root-dir", rootDir],
      env: { HOMECOOK_C2_ROOT: rootDir },
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toMatch(/resolved desired state/iu);
    expect(run.state.calls).toEqual([]);
  });

  it("rejects overly broad private-key permissions and never prints its path", () => {
    const run = runExecute();
    chmodSync(run.privateKeyPath, 0o644);
    const rerun = spawnSync(
      process.execPath,
      [
        RULESET_SCRIPT,
        "apply",
        "--execute",
        "--confirm",
        CONFIRMATION,
        "--repo",
        "netsus/homecook",
        "--snapshot-dir",
        `${run.snapshotDir}-permissions`,
        "--app-id",
        "4724458",
        "--app-private-key-file",
        run.privateKeyPath,
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_C2_MOCK_STATE: join(run.privateKeyPath, "..", "state.json"),
          HOMECOOK_C2_ROOT: repoRoot,
          PATH: `${join(run.privateKeyPath, "..", "bin")}:${process.env.PATH ?? ""}`,
        },
      },
    );
    const output = `${rerun.stdout}\n${rerun.stderr}`;
    expect(rerun.status).toBe(1);
    expect(output).toMatch(/0600/iu);
    expect(output).not.toContain(run.privateKeyPath);
  });

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
  });

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
  });

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
  ])("fails closed with manual action when admin bypass is %s", (_label, environment) => {
    const run = runExecute({ state: initialState({ environment, policies: [] }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toContain('"manual_action_required": true');
    expect(run.combined).toMatch(/admin bypass/iu);
    expect(run.state.calls.filter((call) => call.key.startsWith("SECRET "))).toEqual([]);
    expect(run.state.calls.some((call) =>
      call.key.endsWith("/deployment-branch-policies") && call.key.startsWith("POST ")))
      .toBe(false);
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
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
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/parent|effective/iu);
  });

  it("converges with a non-conflicting inherited organization ruleset", () => {
    const repositoryRulesets = resolvedRulesets();
    const inheritedRuleset = {
      id: 997,
      name: "organization-release-branch-policy",
      target: "branch",
      source_type: "Organization",
      source: "netsus",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["refs/heads/release/*"],
          exclude: ["refs/heads/master"],
        },
        repository_name: { include: ["homecook"], exclude: [] },
        repository_id: { repository_ids: [123456789] },
        repository_property: {
          include: [{ name: "visibility", property_values: ["private"] }],
          exclude: [],
        },
      },
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
    const rerun = runExecute({ state: run.state });
    expect(rerun.result.status, rerun.combined).toBe(0);
  }, 15_000);

  it("fails closed when effective inventory omits canonical repository rulesets", () => {
    const repositoryRulesets = resolvedRulesets();
    const run = runExecute({
      state: initialState({
        effective_rulesets: [],
        rulesets: repositoryRulesets,
      }),
    });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/effective/iu);
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
    expect(run.state.effective_inventory_reads).toBe(2);
    expect(existsSync(join(run.snapshotDir, "production-release-effective-rulesets.json")))
      .toBe(true);
  });

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
    expect(first.state.effective_inventory_reads).toBe(2);
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

  it("documents pinned REST headers and manual admin-bypass action", () => {
    const runbook = readFileSync(
      join(repoRoot, "docs/engineering/local-mac-production-release-promotion.md"),
      "utf8",
    );
    expect(runbook).toContain(ACCEPT_HEADER);
    expect(runbook).toContain(VERSION_HEADER);
    expect(runbook).toContain("Allow administrators to bypass");
    expect(runbook).toContain("manual_action_required");
  });
});
