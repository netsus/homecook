import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");
const CONFIRMATION = "APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS";
const temporaryDirectories: string[] = [];

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
state.calls.push({ key, payload });
if (state.fail_on === key) fail("mock API failure");
if (endpoint === "/repos/netsus/homecook" && method === "GET") {
  reply({ full_name: "netsus/homecook", permissions: { admin: state.admin !== false } });
} else if (endpoint.startsWith("/repos/netsus/homecook/rulesets?")) {
  reply([state.rulesets.map(({ id, name, target, enforcement }) => ({ id, name, target, enforcement }))]);
} else if (/\/rulesets\/[0-9]+$/.test(endpoint) && method === "GET") {
  const id = Number(endpoint.split("/").at(-1));
  const ruleset = state.rulesets.find((entry) => entry.id === id);
  if (!ruleset) fail("HTTP 404: ruleset missing");
  reply(ruleset);
} else if (endpoint === "/repos/netsus/homecook/rulesets" && method === "POST") {
  const id = state.next_id++;
  const ruleset = { id, ...payload };
  state.rulesets.push(ruleset);
  reply(ruleset);
} else if (/\/rulesets\/[0-9]+$/.test(endpoint) && method === "PUT") {
  const id = Number(endpoint.split("/").at(-1));
  const index = state.rulesets.findIndex((entry) => entry.id === id);
  if (index === -1) fail("HTTP 404: ruleset missing");
  state.rulesets[index] = { id, ...payload };
  reply(state.rulesets[index]);
} else if (endpoint === "/repos/netsus/homecook/environments/production-release-approval" && method === "GET") {
  if (!state.environment) fail("HTTP 404: environment missing");
  reply(state.environment);
} else if (endpoint === "/repos/netsus/homecook/environments/production-release-approval" && method === "PUT") {
  state.environment = {
    name: "production-release-approval",
    can_admins_bypass: state.omit_admin_bypass ? undefined : payload.can_admins_bypass,
    deployment_branch_policy: payload.deployment_branch_policy,
    protection_rules: [
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
  reply(state.environment);
} else if (endpoint.includes("/deployment-branch-policies?") && method === "GET") {
  reply([{ branch_policies: state.policies }]);
} else if (endpoint.endsWith("/deployment-branch-policies") && method === "POST") {
  const policy = { id: 9001, ...payload };
  state.policies.push(policy);
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
else if (command.endsWith("rev-parse HEAD")) process.stdout.write((process.env.HOMECOOK_C2_HEAD ?? "84f8e3c5e10be7609d2d75cb40013053d8d818a9") + "\n");
else if (command.endsWith("rev-parse origin/master")) process.stdout.write((process.env.HOMECOOK_C2_ORIGIN_MASTER ?? "84f8e3c5e10be7609d2d75cb40013053d8d818a9") + "\n");
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
    environment: null,
    next_id: 101,
    policies: [],
    rulesets: [],
    secrets: [],
    ...overrides,
  };
}

function runExecute({
  args = [],
  env = {},
  state = initialState(),
}: {
  args?: string[];
  env?: Record<string, string>;
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
  writeFileSync(privateKeyPath, "", { mode: 0o600 });
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
      rulesets: Array<Record<string, unknown>>;
      secrets: Array<{ name: string }>;
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
  });

  it("fails closed with partial-state reporting on an API failure and never rolls back", () => {
    const failureKey = "POST /repos/netsus/homecook/rulesets";
    const run = runExecute({ state: initialState({ fail_on: failureKey }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toContain("mock API failure");
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
  });

  it("fails closed when environment readback cannot prove admin bypass false", () => {
    const run = runExecute({ state: initialState({ omit_admin_bypass: true }) });
    expect(run.result.status).toBe(1);
    expect(run.combined).toContain('"partial_state": true');
    expect(run.combined).toMatch(/admin bypass/iu);
    expect(run.state.calls.some((call) => call.key.startsWith("DELETE "))).toBe(false);
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
    const snapshotFiles = [
      "production-release-master.json",
      "production-release-tag-creation.json",
      "production-release-tag-immutability.json",
      "production-release-approval-environment.json",
      "production-release-approval-deployment-branch-policies.json",
      "production-release-approval-environment-secrets.json",
    ];
    expect(snapshotFiles.every((name) => existsSync(join(first.snapshotDir, name)))).toBe(true);
    const snapshotBundle = snapshotFiles
      .map((name) => readFileSync(join(first.snapshotDir, name), "utf8"))
      .join("\n");
    expect(snapshotBundle).not.toContain("PRIVATE KEY");

    const second = runExecute({ state: first.state });
    expect(second.result.status, second.combined).toBe(0);
    expect(
      second.state.calls.filter((call) =>
        call.key.startsWith("POST ")
        || call.key.startsWith("PUT ")
        || call.key.startsWith("SECRET ")),
    ).toEqual([]);
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
    expect(privateKeyCall).toMatchObject({ stdin_bytes: 0 });
  });
});
