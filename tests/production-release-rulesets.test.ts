import { readFileSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");
const temporaryDirectories: string[] = [];
const EXPECTED_RELEASE_CONTEXTS = [
  "build",
  "changes",
  "dependency-audit",
  "policy",
  "quality",
  "security-function-authorization",
  "security-smoke",
  "snyk",
];
const GITHUB_ACTIONS_APP_INTEGRATION_ID = 15368;

function read(filePath: string) {
  return readFileSync(isAbsolute(filePath) ? filePath : join(repoRoot, filePath), "utf8");
}

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("production release rulesets desired state", () => {
  it("stores desired branch and prod-tag protections in official REST ruleset shapes", () => {
    const branchRuleset = JSON.parse(
      read(".github/rulesets/production-release-master.json"),
    ) as {
      bypass_actors?: Array<{ actor_id?: number | null; actor_type?: string; bypass_mode?: string }>;
      conditions?: { ref_name?: { exclude?: string[]; include?: string[] } };
      enforcement?: string;
      name?: string;
      rules?: Array<{
        parameters?: {
          required_status_checks?: Array<{ context?: string; integration_id?: number | null }>;
        } & Record<string, unknown>;
        type?: string;
      }>;
      target?: string;
    };
    const tagRuleset = JSON.parse(
      read(".github/rulesets/production-release-tags.json"),
    ) as {
      bypass_actors?: Array<{ actor_id?: number | null; actor_type?: string; bypass_mode?: string }>;
      conditions?: { ref_name?: { exclude?: string[]; include?: string[] } };
      enforcement?: string;
      name?: string;
      rules?: Array<{ parameters?: Record<string, unknown>; type?: string }>;
      target?: string;
    };
    const approvalEnvironment = JSON.parse(
      read(".github/rulesets/production-release-approval-environment.json"),
    ) as {
      deployment_branch_policy?: Record<string, boolean>;
      master_only_branches?: string[];
      prevent_self_review?: boolean;
      required_reviewers?: Array<{ actor_id?: number; actor_type?: string }>;
    };

    expect(branchRuleset.name).toBe("production-release-master");
    expect(branchRuleset.target).toBe("branch");
    expect(branchRuleset.enforcement).toBe("active");
    expect(branchRuleset.conditions?.ref_name).toEqual({
      include: ["~DEFAULT_BRANCH"],
      exclude: [],
    });
    expect(branchRuleset.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "deletion" }),
        expect.objectContaining({ type: "non_fast_forward" }),
        expect.objectContaining({ type: "pull_request" }),
        expect.objectContaining({ type: "required_status_checks" }),
      ]),
    );
    const requiredStatusChecksRule = branchRuleset.rules?.find(
      (rule) => rule.type === "required_status_checks",
    );
    expect(
      requiredStatusChecksRule?.parameters?.required_status_checks?.map(
        (entry) => entry.context,
      ),
    ).toEqual(EXPECTED_RELEASE_CONTEXTS);
    expect(
      requiredStatusChecksRule?.parameters?.required_status_checks?.map(
        (entry) => entry.integration_id,
      ),
    ).toEqual(EXPECTED_RELEASE_CONTEXTS.map(() => GITHUB_ACTIONS_APP_INTEGRATION_ID));

    expect(tagRuleset.name).toBe("production-release-tags");
    expect(tagRuleset.target).toBe("tag");
    expect(tagRuleset.enforcement).toBe("active");
    expect(tagRuleset.conditions?.ref_name).toEqual({
      include: ["refs/tags/prod-*"],
      exclude: [],
    });
    expect(tagRuleset.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "creation" }),
        expect.objectContaining({ type: "deletion" }),
        expect.objectContaining({ type: "non_fast_forward" }),
      ]),
    );

    for (const ruleset of [branchRuleset, tagRuleset]) {
      expect(
        ruleset.bypass_actors?.some((actor) =>
          actor.actor_type === "RepositoryRole"
          && actor.actor_id !== undefined,
        ) ?? false,
      ).toBe(false);
      for (const actor of ruleset.bypass_actors ?? []) {
        expect(typeof actor.actor_type).toBe("string");
        expect(["always", "pull_request"]).toContain(actor.bypass_mode);
        expect(
          actor.actor_id === undefined
          || actor.actor_id === null
          || Number.isInteger(actor.actor_id),
        ).toBe(true);
      }
    }
    expect(tagRuleset.bypass_actors).toEqual([
      {
        actor_id: 0,
        actor_type: "Integration",
        bypass_mode: "always",
      },
    ]);
    expect(approvalEnvironment).toMatchObject({
      deployment_branch_policy: {
        custom_branch_policies: true,
        protected_branches: false,
      },
      master_only_branches: ["master"],
      prevent_self_review: true,
      required_reviewers: [{ actor_id: 0, actor_type: "Unresolved" }],
    });
  });

  it("ships a read-only ruleset planner/verifier with optional actual-state comparison and a dry-run apply surface", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["release:github:rulesets:plan"]).toBeTruthy();
    expect(packageJson.scripts?.["release:github:rulesets:verify"]).toBeTruthy();
    expect(packageJson.scripts?.["release:github:rulesets:apply"]).toBeTruthy();

    const actualDir = createTempDirectory("homecook-rulesets-actual-");
    writeFileSync(
      join(actualDir, "production-release-master.json"),
      JSON.stringify({
        id: 101,
        name: "production-release-master",
        target: "branch",
        enforcement: "active",
        conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          {
            type: "pull_request",
            parameters: {
              dismiss_stale_reviews_on_push: true,
              require_code_owner_review: false,
              require_last_push_approval: true,
              required_approving_review_count: 1,
              required_review_thread_resolution: true,
            },
          },
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: true,
              do_not_enforce_on_create: false,
              required_status_checks: EXPECTED_RELEASE_CONTEXTS.map((context) => ({
                context,
                integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
              })),
            },
          },
        ],
        bypass_actors: [],
      }, null, 2),
    );
    writeFileSync(
      join(actualDir, "production-release-tags.json"),
      JSON.stringify({
        id: 102,
        name: "production-release-tags",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [
          { type: "creation" },
          { type: "deletion" },
          { type: "non_fast_forward" },
        ],
        bypass_actors: [],
      }, null, 2),
    );

    const verify = spawnSync(process.execPath, [RULESET_SCRIPT, "verify", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(verify.status, verify.stderr).toBe(0);
    expect(verify.stdout).toContain("\"mode\": \"verify\"");
    expect(verify.stdout).toContain("production-release-master");
    expect(verify.stdout).toContain("production-release-tags");
    expect(verify.stdout).toContain("\"activation_blocked\": true");
    expect(verify.stdout).toContain("\"actual_state\": \"unresolved_actor\"");
    expect(verify.stdout).toContain("unresolved_approval_environment_reviewer");
    expect(verify.stdout).toContain("missing_approval_environment_readback");

    const verifyWithActual = spawnSync(
      process.execPath,
      [RULESET_SCRIPT, "verify", "--json", "--actual-dir", actualDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    expect(verifyWithActual.status, verifyWithActual.stderr).toBe(0);
    expect(verifyWithActual.stdout).toContain("\"activation_blocked\": true");
    expect(verifyWithActual.stdout).toContain("\"actual_state\": \"unresolved_actor\"");

    const resolvedRootDir = createTempDirectory("homecook-rulesets-desired-");
    const resolvedActualDir = createTempDirectory("homecook-rulesets-actual-resolved-");
    const rulesetsDir = join(resolvedRootDir, ".github", "rulesets");
    const workflowsDir = join(resolvedRootDir, ".github", "workflows");
    mkdirSync(rulesetsDir, { recursive: true });
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(
      join(rulesetsDir, "production-release-master.json"),
      read(".github/rulesets/production-release-master.json"),
    );
    writeFileSync(
      join(rulesetsDir, "production-release-tags.json"),
      JSON.stringify({
        schema: "homecook.github.repository-ruleset.v1",
        name: "production-release-tags",
        target: "tag",
        enforcement: "active",
        conditions: {
          ref_name: {
            include: ["refs/tags/prod-*"],
            exclude: [],
          },
        },
        rules: [
          { type: "creation" },
          { type: "deletion" },
          { type: "non_fast_forward" },
        ],
        bypass_actors: [
          {
            actor_id: 12345,
            actor_type: "Integration",
            bypass_mode: "always",
          },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(rulesetsDir, "production-release-approval-environment.json"),
      JSON.stringify({
        schema: "homecook.github.production-release-approval-environment.v1",
        name: "production-release-approval",
        repository: "netsus/homecook",
        source_ref: "refs/heads/master",
        prevent_self_review: true,
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
        master_only_branches: ["master"],
        required_reviewers: [
          { actor_id: 24680, actor_type: "User" },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(workflowsDir, "production-release-attestation.yml"),
      read(".github/workflows/production-release-attestation.yml"),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-master.json"),
      read(join(actualDir, "production-release-master.json")),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-tags.json"),
      JSON.stringify({
        id: 102,
        name: "production-release-tags",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [
          { type: "creation" },
          { type: "deletion" },
          { type: "non_fast_forward" },
        ],
        bypass_actors: [
          {
            actor_id: 12345,
            actor_type: "Integration",
            bypass_mode: "always",
          },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-approval-environment.json"),
      JSON.stringify({
        name: "production-release-approval",
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
        protection_rules: [
          {
            type: "required_reviewers",
            prevent_self_review: true,
            reviewers: [
              { type: "User", reviewer: { id: 24680 } },
            ],
          },
          { type: "branch_policy" },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-approval-deployment-branch-policies.json"),
      JSON.stringify({
        branch_policies: [
          { name: "master", type: "branch" },
        ],
      }, null, 2),
    );
    const verifyResolved = spawnSync(
      process.execPath,
      [
        RULESET_SCRIPT,
        "verify",
        "--json",
        "--root-dir",
        resolvedRootDir,
        "--actual-dir",
        resolvedActualDir,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    expect(verifyResolved.status, verifyResolved.stderr).toBe(0);
    expect(verifyResolved.stdout).toContain("\"activation_blocked\": false");
    expect(verifyResolved.stdout).toContain("\"actual_state\": \"matched\"");

    const dryRun = spawnSync(process.execPath, [RULESET_SCRIPT, "apply", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain("\"mode\": \"apply\"");
    expect(dryRun.stdout).toContain("\"dry_run\": true");
    expect(`${dryRun.stdout}\n${dryRun.stderr}`).not.toContain("gh api");

    const blocked = spawnSync(
      process.execPath,
      [RULESET_SCRIPT, "apply", "--execute"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("C2");
    expect(blocked.stderr).toContain("explicit operator-approved");
  });

  it("keeps the attestation workflow least-privilege and approval-gated", () => {
    const workflow = read(".github/workflows/production-release-attestation.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("artifact-metadata: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow.match(/approve-and-tag:[\s\S]*?permissions:[\s\S]*?contents: read/u)).not.toBeNull();
    expect(workflow).toContain("environment: production-release-approval");
    expect(workflow).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_ID");
    expect(workflow).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY");
    expect(workflow).not.toContain("HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN");
    expect(workflow).toContain("actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349");
    expect(workflow).toContain("refs/remotes/origin/master^{commit}");
    expect(workflow).toContain("prod-YYYYMMDD.N");
    expect(workflow).toContain("required_check_summary");
    expect(workflow).toContain("commits/\"$RELEASE_SHA\"/statuses");
    expect(workflow).toMatch(/statuses[\s\S]*?--paginate/u);
    expect(workflow).toContain("actions/runs/${{ github.run_id }}");
    expect(workflow).toContain("--excluded-check-suite-id");
    expect(workflow).toContain("subject-path:");
    expect(workflow).toContain("predicate-path:");
    expect(workflow).toContain("gh api repos/netsus/homecook/rulesets");
    expect(workflow).toContain("git tag -a");
    expect(workflow).toContain("x-access-token:${{ steps.app-token.outputs.token }}@github.com/netsus/homecook.git");
    expect(workflow).toContain("refs/tags/\"$RELEASE_TAG\"");
    expect(workflow).toContain("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6");
    expect(workflow).toContain("custom predicate");
    expect(workflow).toContain("terminal check summary");
    for (const context of EXPECTED_RELEASE_CONTEXTS) {
      expect(workflow).toContain(context);
    }

    const mutableActionReferences = workflow.match(/uses:\s+[^\s]+@(?![0-9a-f]{40}(?:\s|$))[^\s]+/gu) ?? [];
    expect(mutableActionReferences).toEqual([]);
    for (const pinnedAction of [
      "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
      "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
      "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6",
      "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349",
    ]) {
      expect(workflow).toContain(pinnedAction);
    }

    expect(workflow).toContain('test "${{ github.repository }}" = "netsus/homecook"');
    expect(workflow).toContain('test "${{ github.ref }}" = "refs/heads/master"');
    expect(workflow).toContain('test "${{ github.workflow_ref }}" = "netsus/homecook/.github/workflows/production-release-attestation.yml@refs/heads/master"');
    expect(workflow).toContain("Re-fetch and rebuild approval evidence after environment approval");
    expect(workflow).toContain("Compare approval evidence to preflight evidence");
    expect(workflow).toContain("Recheck origin/master immediately before protected tag push");
  });

  it("runs every shared release context for every pull request and every master push", () => {
    const ci = read(".github/workflows/ci.yml");
    const qa = read(".github/workflows/playwright.yml");
    const policy = read(".github/workflows/policy.yml");
    const securityReview = read(".github/workflows/security-review.yml");
    const securitySmoke = read(".github/workflows/security-smoke.yml");

    expect(ci).toMatch(/push:[\s\S]*?- master[\s\S]*?pull_request:/u);
    expect(ci).not.toMatch(/pull_request:[\s\S]*?paths:/u);
    expect(ci).not.toMatch(/push:[\s\S]*?paths:/u);
    expect(qa).toContain("changes:");
    expect(policy).toContain("policy:");
    expect(securityReview).toMatch(/pull_request:/u);
    expect(securityReview).not.toContain("paths-ignore:");
    expect(securityReview).toContain("dependency-audit:");
    expect(securityReview).toContain("snyk:");
    expect(securitySmoke).not.toMatch(/pull_request:[\s\S]*?paths:/u);
    expect(securitySmoke).not.toMatch(/push:[\s\S]*?paths:/u);
  });
});
