import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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
  it("allows only the release App to create prod tags while nobody can mutate or delete them", () => {
    const creationPath = join(repoRoot, ".github/rulesets/production-release-tag-creation.json");
    const immutabilityPath = join(
      repoRoot,
      ".github/rulesets/production-release-tag-immutability.json",
    );
    expect(existsSync(creationPath)).toBe(true);
    expect(existsSync(immutabilityPath)).toBe(true);
    if (!existsSync(creationPath) || !existsSync(immutabilityPath)) {
      return;
    }
    const creationRuleset = JSON.parse(
      read(creationPath),
    ) as {
      bypass_actors?: Array<{ actor_id?: number; actor_type?: string; bypass_mode?: string }>;
      name?: string;
      rules?: Array<{ type?: string }>;
    };
    const immutabilityRuleset = JSON.parse(
      read(immutabilityPath),
    ) as {
      bypass_actors?: Array<{ actor_id?: number; actor_type?: string; bypass_mode?: string }>;
      name?: string;
      rules?: Array<{ type?: string }>;
    };

    expect(creationRuleset.name).toBe("production-release-tag-creation");
    expect(creationRuleset.rules).toEqual([{ type: "creation" }]);
    expect(creationRuleset.bypass_actors).toEqual([
      { actor_id: 4724458, actor_type: "Integration", bypass_mode: "always" },
    ]);
    expect(immutabilityRuleset.name).toBe("production-release-tag-immutability");
    expect(immutabilityRuleset.rules).toEqual([
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "update" },
    ]);
    expect(immutabilityRuleset.bypass_actors).toEqual([]);
  });

  it("pins environment administrator bypass off in desired state and readback", () => {
    const desired = JSON.parse(
      read(".github/rulesets/production-release-approval-environment.json"),
    ) as { can_admins_bypass?: boolean; wait_timer?: number };

    expect(desired.can_admins_bypass).toBe(false);
    expect(desired.wait_timer).toBe(0);
  });

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
    const tagCreationRuleset = JSON.parse(
      read(".github/rulesets/production-release-tag-creation.json"),
    ) as {
      bypass_actors?: Array<{ actor_id?: number | null; actor_type?: string; bypass_mode?: string }>;
      conditions?: { ref_name?: { exclude?: string[]; include?: string[] } };
      enforcement?: string;
      name?: string;
      rules?: Array<{ parameters?: Record<string, unknown>; type?: string }>;
      target?: string;
    };
    const tagImmutabilityRuleset = JSON.parse(
      read(".github/rulesets/production-release-tag-immutability.json"),
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
      deployment_branch_policies?: Array<{ name?: string; type?: string }>;
      environment_secret_names?: string[];
      master_only_branches?: string[];
      can_admins_bypass?: boolean;
      prevent_self_review?: boolean;
      required_reviewers?: Array<{ actor_id?: number; actor_type?: string }>;
      wait_timer?: number;
    };

    expect(branchRuleset.name).toBe("production-release-master");
    expect(branchRuleset.target).toBe("branch");
    expect(branchRuleset.enforcement).toBe("active");
    expect(branchRuleset.conditions?.ref_name).toEqual({
      include: ["refs/heads/master"],
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

    expect(tagCreationRuleset.name).toBe("production-release-tag-creation");
    expect(tagCreationRuleset.target).toBe("tag");
    expect(tagCreationRuleset.enforcement).toBe("active");
    expect(tagCreationRuleset.conditions?.ref_name).toEqual({
      include: ["refs/tags/prod-*"],
      exclude: [],
    });
    expect(tagCreationRuleset.rules).toEqual([{ type: "creation" }]);
    expect(tagImmutabilityRuleset.name).toBe("production-release-tag-immutability");
    expect(tagImmutabilityRuleset.rules).toEqual([
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "update" },
    ]);

    for (const ruleset of [branchRuleset, tagCreationRuleset, tagImmutabilityRuleset]) {
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
    expect(tagCreationRuleset.bypass_actors).toEqual([
      {
        actor_id: 4724458,
        actor_type: "Integration",
        bypass_mode: "always",
      },
    ]);
    expect(tagImmutabilityRuleset.bypass_actors).toEqual([]);
    expect(approvalEnvironment).toMatchObject({
      can_admins_bypass: false,
      deployment_branch_policy: {
        custom_branch_policies: true,
        protected_branches: false,
      },
      deployment_branch_policies: [{ name: "master", type: "branch" }],
      environment_secret_names: [
        "HOMECOOK_RELEASE_ATTESTATION_APP_ID",
        "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
      ],
      master_only_branches: ["master"],
      prevent_self_review: true,
      required_reviewers: [{ actor_id: 57648890, actor_type: "User" }],
      wait_timer: 0,
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
        conditions: { ref_name: { include: ["refs/heads/master"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          {
            type: "pull_request",
            parameters: {
              allowed_merge_methods: ["merge", "squash", "rebase"],
              dismiss_stale_reviews_on_push: true,
              require_code_owner_review: false,
              require_extra_approval_for_unattributed_changes: true,
              require_last_push_approval: true,
              required_approving_review_count: 1,
              required_review_thread_resolution: true,
              required_reviewers: [],
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
      join(actualDir, "production-release-tag-creation.json"),
      JSON.stringify({
        id: 102,
        name: "production-release-tag-creation",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [{ type: "creation" }],
        bypass_actors: [],
      }, null, 2),
    );
    writeFileSync(
      join(actualDir, "production-release-tag-immutability.json"),
      JSON.stringify({
        id: 103,
        name: "production-release-tag-immutability",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          { type: "update" },
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
    expect(verify.stdout).toContain("production-release-tag-creation");
    expect(verify.stdout).toContain("production-release-tag-immutability");
    expect(verify.stdout).toContain("\"activation_blocked\": true");
    expect(verify.stdout).toContain("\"actual_state\": \"missing\"");
    expect(verify.stdout).not.toContain("unresolved_approval_environment_reviewer");
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
    expect(verifyWithActual.stdout).toContain("\"actual_state\": \"mismatch\"");

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
      join(rulesetsDir, "production-release-tag-creation.json"),
      JSON.stringify({
        schema: "homecook.github.repository-ruleset.v1",
        name: "production-release-tag-creation",
        target: "tag",
        enforcement: "active",
        conditions: {
          ref_name: {
            include: ["refs/tags/prod-*"],
            exclude: [],
          },
        },
        rules: [{ type: "creation" }],
        bypass_actors: [
          {
            actor_id: 4724458,
            actor_type: "Integration",
            bypass_mode: "always",
          },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(rulesetsDir, "production-release-tag-immutability.json"),
      read(".github/rulesets/production-release-tag-immutability.json"),
    );
    writeFileSync(
      join(rulesetsDir, "production-release-approval-environment.json"),
      JSON.stringify({
        schema: "homecook.github.production-release-approval-environment.v1",
        name: "production-release-approval",
        repository: "netsus/homecook",
        source_ref: "refs/heads/master",
        can_admins_bypass: false,
        wait_timer: 0,
        prevent_self_review: true,
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
        deployment_branch_policies: [{ name: "master", type: "branch" }],
        environment_secret_names: [
          "HOMECOOK_RELEASE_ATTESTATION_APP_ID",
          "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY",
        ],
        master_only_branches: ["master"],
        required_reviewers: [
          { actor_id: 57648890, actor_type: "User" },
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
      join(resolvedActualDir, "production-release-tag-creation.json"),
      JSON.stringify({
        id: 102,
        name: "production-release-tag-creation",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [{ type: "creation" }],
        bypass_actors: [
          {
            actor_id: 4724458,
            actor_type: "Integration",
            bypass_mode: "always",
          },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-tag-immutability.json"),
      JSON.stringify({
        id: 103,
        name: "production-release-tag-immutability",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          { type: "update" },
        ],
        bypass_actors: [],
      }, null, 2),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-approval-environment.json"),
      JSON.stringify({
        name: "production-release-approval",
        can_admins_bypass: false,
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
        protection_rules: [
          {
            type: "required_reviewers",
            prevent_self_review: true,
            reviewers: [
              { type: "User", reviewer: { id: 57648890 } },
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
    writeFileSync(
      join(resolvedActualDir, "production-release-approval-environment-secrets.json"),
      JSON.stringify({
        secrets: [
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_ID" },
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY" },
        ],
      }, null, 2),
    );
    const repositoryInventoryPath = join(
      resolvedActualDir,
      "production-release-repository-rulesets.json",
    );
    const effectiveInventoryPath = join(
      resolvedActualDir,
      "production-release-effective-rulesets.json",
    );
    const repositoryInventory = {
      scope: "repository",
      includes_parents: false,
      rulesets: [
        "production-release-master",
        "production-release-tag-creation",
        "production-release-tag-immutability",
      ].map((name) => ({
        ...JSON.parse(read(join(resolvedActualDir, `${name}.json`))),
        source: "netsus/homecook",
        source_type: "Repository",
      })),
    };
    const inheritedOrganizationRuleset = {
      id: 999,
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
        repository_name: { include: ["homecook"], exclude: [], protected: true },
      },
      bypass_actors: [{ actor_id: 42, actor_type: "Team", bypass_mode: "exempt" }],
      rules: [{
        type: "pull_request",
        parameters: { required_approving_review_count: 1 },
      }],
    };
    const inheritedEnterpriseRuleset = {
      id: 996,
      name: "enterprise-release-property-policy",
      target: "branch",
      source_type: "Enterprise",
      source: "netsus-enterprise",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["refs/heads/release/*"],
          exclude: ["refs/heads/master"],
        },
        organization_property: {
          include: [{ name: "region", property_values: ["kr"] }],
          exclude: [],
        },
        repository_property: {
          include: [{
            name: "visibility",
            property_values: ["private"],
            source: "system",
          }],
          exclude: [],
        },
      },
      bypass_actors: [
        { actor_id: null, actor_type: "EnterpriseOwner", bypass_mode: "exempt" },
        { actor_id: null, actor_type: "EnterpriseRole", bypass_mode: "always" },
      ],
      rules: [{
        type: "pull_request",
        parameters: { required_approving_review_count: 1 },
      }],
    };
    const effectiveInventory = {
      scope: "effective",
      includes_parents: true,
      rulesets: [
        ...repositoryInventory.rulesets,
        inheritedOrganizationRuleset,
        inheritedEnterpriseRuleset,
      ],
    };
    writeFileSync(repositoryInventoryPath, JSON.stringify(repositoryInventory, null, 2));
    writeFileSync(effectiveInventoryPath, JSON.stringify(effectiveInventory, null, 2));
    const completionFiles = [
      "production-release-master.json",
      "production-release-tag-creation.json",
      "production-release-tag-immutability.json",
      "production-release-approval-environment.json",
      "production-release-approval-deployment-branch-policies.json",
      "production-release-approval-environment-secrets.json",
      "production-release-repository-rulesets.json",
      "production-release-effective-rulesets.json",
    ];
    for (const args of [
      ["init", "-q"],
      ["config", "user.email", "ruleset-test@example.invalid"],
      ["config", "user.name", "Ruleset Test"],
      ["add", "."],
      ["commit", "-qm", "fixture"],
    ]) {
      expect(spawnSync("git", ["-C", resolvedRootDir, ...args]).status).toBe(0);
    }
    const fixtureHead = spawnSync("git", ["-C", resolvedRootDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).stdout.trim();
    const fixtureTree = spawnSync(
      "git",
      ["-C", resolvedRootDir, "rev-parse", `${fixtureHead}^{tree}`],
      { encoding: "utf8" },
    ).stdout.trim();
    const desiredPolicyPaths = [
      ".github/rulesets/production-release-master.json",
      ".github/rulesets/production-release-tag-creation.json",
      ".github/rulesets/production-release-tag-immutability.json",
      ".github/rulesets/production-release-approval-environment.json",
      ".github/workflows/production-release-attestation.yml",
    ];
    writeFileSync(
      join(resolvedActualDir, "production-release-snapshot-completion.json"),
      JSON.stringify({
        schema: "homecook.github.production-release-snapshot-completion.v1",
        version: 1,
        status: "verified",
        repository: "netsus/homecook",
        head: fixtureHead,
        head_tree: fixtureTree,
        remote_master: fixtureHead,
        desired_policy_blobs: Object.fromEntries(desiredPolicyPaths.map((path) => [
          path,
          spawnSync("git", ["-C", resolvedRootDir, "rev-parse", `${fixtureHead}:${path}`], {
            encoding: "utf8",
          }).stdout.trim(),
        ])),
        app_id: 4724458,
        reviewer: { actor_id: 57648890, actor_type: "User" },
        files: completionFiles.map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(join(resolvedActualDir, name)))
            .digest("hex"),
        })),
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

    const verifyResolvedSnapshot = () => spawnSync(
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
      { cwd: repoRoot, encoding: "utf8" },
    );
    for (const [inventoryPath, blocker] of [
      [repositoryInventoryPath, "missing_repository_ruleset_inventory_readback"],
      [effectiveInventoryPath, "missing_effective_ruleset_inventory_readback"],
    ]) {
      const contents = read(inventoryPath);
      rmSync(inventoryPath);
      const verifyMissingInventory = verifyResolvedSnapshot();
      expect(verifyMissingInventory.status, verifyMissingInventory.stderr).toBe(0);
      expect(verifyMissingInventory.stdout).toContain("\"activation_blocked\": true");
      expect(verifyMissingInventory.stdout).toContain(blocker);
      writeFileSync(inventoryPath, contents);
    }

    writeFileSync(repositoryInventoryPath, JSON.stringify({
      ...repositoryInventory,
      rulesets: [...repositoryInventory.rulesets, repositoryInventory.rulesets[0]],
    }, null, 2));
    const verifyDuplicateRepository = verifyResolvedSnapshot();
    expect(verifyDuplicateRepository.stdout).toContain("\"activation_blocked\": true");
    expect(verifyDuplicateRepository.stdout).toContain(
      "repository_ruleset_inventory_canonical_duplicate",
    );
    writeFileSync(repositoryInventoryPath, JSON.stringify(repositoryInventory, null, 2));

    writeFileSync(repositoryInventoryPath, JSON.stringify({
      ...repositoryInventory,
      rulesets: repositoryInventory.rulesets.map((ruleset, index) =>
        index === 0
          ? { id: ruleset.id, name: ruleset.name, target: ruleset.target }
          : ruleset),
    }, null, 2));
    const verifyRepositorySummaryOnly = verifyResolvedSnapshot();
    expect(verifyRepositorySummaryOnly.stdout).toContain("\"activation_blocked\": true");
    expect(verifyRepositorySummaryOnly.stdout).toContain(
      "repository_ruleset_inventory_full_detail_missing",
    );
    writeFileSync(repositoryInventoryPath, JSON.stringify(repositoryInventory, null, 2));

    writeFileSync(repositoryInventoryPath, JSON.stringify({
      ...repositoryInventory,
      rulesets: [
        ...repositoryInventory.rulesets,
        {
          id: 998,
          name: "unknown-prod-overlap",
          target: "tag",
          source: "netsus/homecook",
          source_type: "Repository",
          enforcement: "active",
          conditions: { ref_name: { include: ["refs/tags/prod-*"], exclude: [] } },
          rules: [{ type: "creation" }],
          bypass_actors: [],
        },
      ],
    }, null, 2));
    const verifyRepositoryOverlap = verifyResolvedSnapshot();
    expect(verifyRepositoryOverlap.stdout).toContain("\"activation_blocked\": true");
    expect(verifyRepositoryOverlap.stdout).toContain(
      "repository_ruleset_inventory_unknown_overlap",
    );
    writeFileSync(repositoryInventoryPath, JSON.stringify(repositoryInventory, null, 2));

    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: effectiveInventory.rulesets.filter(
        (ruleset) => ruleset.name !== "production-release-tag-immutability",
      ),
    }, null, 2));
    const verifyMissingEffectiveCanonical = verifyResolvedSnapshot();
    expect(verifyMissingEffectiveCanonical.stdout).toContain("\"activation_blocked\": true");
    expect(verifyMissingEffectiveCanonical.stdout).toContain(
      "effective_ruleset_inventory_canonical_missing",
    );

    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: effectiveInventory.rulesets.map((ruleset) =>
        ruleset.name === "production-release-master"
          ? { ...ruleset, id: 9999 }
          : ruleset),
    }, null, 2));
    const verifyCrossInventoryId = verifyResolvedSnapshot();
    expect(verifyCrossInventoryId.stdout).toContain("\"activation_blocked\": true");
    expect(verifyCrossInventoryId.stdout).toContain(
      "ruleset_inventory_consistency_mismatch",
    );

    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: [
        ...effectiveInventory.rulesets,
        {
          ...inheritedOrganizationRuleset,
          id: 997,
          name: "organization-prod-overlap",
          target: "tag",
          conditions: {
            ...inheritedOrganizationRuleset.conditions,
            ref_name: { include: ["refs/tags/prod-*"], exclude: [] },
          },
        },
      ],
    }, null, 2));
    const verifyInheritedConflict = verifyResolvedSnapshot();
    expect(verifyInheritedConflict.stdout).toContain("\"activation_blocked\": true");
    expect(verifyInheritedConflict.stdout).toContain(
      "effective_ruleset_inventory_parent_conflict",
    );
    writeFileSync(effectiveInventoryPath, JSON.stringify(effectiveInventory, null, 2));

    const { source: _omittedSource, ...missingSourceInherited } = structuredClone(
      inheritedOrganizationRuleset,
    );
    expect(_omittedSource).toBe("netsus");
    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: [...repositoryInventory.rulesets, missingSourceInherited],
    }, null, 2));
    const verifyMissingEffectiveSource = verifyResolvedSnapshot();
    expect(verifyMissingEffectiveSource.stdout).toContain("\"activation_blocked\": true");
    expect(verifyMissingEffectiveSource.stdout).toContain(
      "effective_ruleset_inventory_source_missing",
    );

    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: [
        ...effectiveInventory.rulesets,
        {
          id: 995,
          name: "repository-release-policy",
          target: "branch",
          source_type: "Repository",
          source: "netsus/homecook",
          enforcement: "active",
          conditions: {
            ref_name: {
              include: ["refs/heads/release/*"],
              exclude: ["refs/heads/master"],
            },
          },
          rules: [{
            type: "pull_request",
            parameters: { required_approving_review_count: 1 },
          }],
        },
      ],
    }, null, 2));
    const verifyPartialRepositoryEffective = verifyResolvedSnapshot();
    expect(verifyPartialRepositoryEffective.stdout).toContain("\"activation_blocked\": true");
    expect(verifyPartialRepositoryEffective.stdout).toContain(
      "effective_ruleset_inventory_full_detail_missing",
    );

    writeFileSync(effectiveInventoryPath, JSON.stringify({
      ...effectiveInventory,
      rulesets: [
        ...repositoryInventory.rulesets,
        {
          ...inheritedOrganizationRuleset,
          id: 994,
          conditions: {
            ...inheritedOrganizationRuleset.conditions,
            repository_id: { repository_ids: [123456789] },
          },
        },
      ],
    }, null, 2));
    const verifyAmbiguousInherited = verifyResolvedSnapshot();
    expect(verifyAmbiguousInherited.stdout).toContain("\"activation_blocked\": true");
    expect(verifyAmbiguousInherited.stdout).toContain(
      "effective_ruleset_inventory_schema_mismatch",
    );
    writeFileSync(effectiveInventoryPath, JSON.stringify(effectiveInventory, null, 2));

    const approvalReadbackPath = join(
      resolvedActualDir,
      "production-release-approval-environment.json",
    );
    const matchedApprovalReadback = JSON.parse(read(approvalReadbackPath)) as Record<
      string,
      unknown
    >;
    for (const invalidAdminBypass of [undefined, true]) {
      const invalidApprovalReadback = { ...matchedApprovalReadback };
      if (invalidAdminBypass === undefined) {
        delete invalidApprovalReadback.can_admins_bypass;
      } else {
        invalidApprovalReadback.can_admins_bypass = invalidAdminBypass;
      }
      writeFileSync(approvalReadbackPath, JSON.stringify(invalidApprovalReadback, null, 2));
      const verifyAdminBypass = spawnSync(
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
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(verifyAdminBypass.status, verifyAdminBypass.stderr).toBe(0);
      expect(verifyAdminBypass.stdout).toContain("\"activation_blocked\": true");
      expect(verifyAdminBypass.stdout).toContain(
        "approval_environment_admin_bypass_mismatch",
      );
    }
    writeFileSync(approvalReadbackPath, JSON.stringify(matchedApprovalReadback, null, 2));

    for (const invalidWaitTimerRules of [
      [{ type: "wait_timer", wait_timer: 10 }],
      [
        { type: "wait_timer", wait_timer: 0 },
        { type: "wait_timer", wait_timer: 0 },
      ],
    ]) {
      const invalidApprovalReadback = structuredClone(matchedApprovalReadback);
      invalidApprovalReadback.protection_rules = (
        invalidApprovalReadback.protection_rules as Array<Record<string, unknown>>
      ).filter((rule) => rule.type !== "wait_timer");
      (invalidApprovalReadback.protection_rules as Array<Record<string, unknown>>)
        .unshift(...invalidWaitTimerRules);
      writeFileSync(approvalReadbackPath, JSON.stringify(invalidApprovalReadback, null, 2));
      const verifyWaitTimer = spawnSync(
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
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(verifyWaitTimer.status, verifyWaitTimer.stderr).toBe(0);
      expect(verifyWaitTimer.stdout).toContain("\"activation_blocked\": true");
      expect(verifyWaitTimer.stdout).toContain(
        "approval_environment_wait_timer_mismatch",
      );
    }
    writeFileSync(approvalReadbackPath, JSON.stringify(matchedApprovalReadback, null, 2));

    writeFileSync(
      join(resolvedActualDir, "production-release-approval-deployment-branch-policies.json"),
      JSON.stringify({
        branch_policies: [
          { name: "master", type: "branch" },
          { name: "prod-*", type: "tag" },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(resolvedActualDir, "production-release-approval-environment-secrets.json"),
      JSON.stringify({
        secrets: [
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_ID" },
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY" },
          { name: "HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN" },
        ],
      }, null, 2),
    );
    const verifyExtraEnvironmentPolicy = spawnSync(
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
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(verifyExtraEnvironmentPolicy.status, verifyExtraEnvironmentPolicy.stderr).toBe(0);
    expect(verifyExtraEnvironmentPolicy.stdout).toContain("\"activation_blocked\": true");
    expect(verifyExtraEnvironmentPolicy.stdout).toContain(
      "approval_environment_deployment_branch_policy_mismatch",
    );
    expect(verifyExtraEnvironmentPolicy.stdout).toContain(
      "approval_environment_secret_inventory_mismatch",
    );

    const actualMasterWithoutBypassActors = JSON.parse(
      read(join(resolvedActualDir, "production-release-master.json")),
    ) as Record<string, unknown>;
    delete actualMasterWithoutBypassActors.bypass_actors;
    writeFileSync(
      join(resolvedActualDir, "production-release-master.json"),
      JSON.stringify(actualMasterWithoutBypassActors, null, 2),
    );
    const verifyOmittedBypassActors = spawnSync(
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
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(verifyOmittedBypassActors.status).toBe(1);
    expect(verifyOmittedBypassActors.stderr).toMatch(/C2 admin-visible snapshot/iu);
    expect(verifyOmittedBypassActors.stderr).toContain("bypass_actors");

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
    expect(blocked.stderr).toContain("Authoritative immutable C2 execution is required");
    expect(blocked.stderr).toContain(
      '/usr/bin/git show "$C2_HEAD":scripts/bootstrap-production-release-rulesets.mjs',
    );
    expect(existsSync(join(repoRoot, "scripts/bootstrap-production-release-rulesets.mjs")))
      .toBe(true);
    const entrySource = read("scripts/manage-production-release-rulesets.mjs");
    expect(entrySource).not.toMatch(/^import .*production-release/um);

    const hostileRoot = createTempDirectory("homecook-c2-direct-hostile-");
    const hostileScripts = join(hostileRoot, "scripts");
    const hostileLib = join(hostileScripts, "lib");
    const markerPath = join(hostileRoot, "worktree-module-executed");
    mkdirSync(hostileLib, { recursive: true });
    writeFileSync(join(hostileScripts, "manage-production-release-rulesets.mjs"), entrySource);
    for (const name of [
      "production-release-rulesets.mjs",
      "production-release-rulesets-apply.mjs",
    ]) {
      writeFileSync(
        join(hostileLib, name),
        `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(markerPath)}, "executed");`,
      );
    }
    const hostileDirect = spawnSync(
      process.execPath,
      [join(hostileScripts, "manage-production-release-rulesets.mjs"), "apply", "--execute"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_C2_IMMUTABLE_CODE_ROOT: hostileRoot,
          HOMECOOK_C2_IMMUTABLE_HEAD: spawnSync(
            "/usr/bin/git",
            ["-C", repoRoot, "rev-parse", "HEAD"],
            { encoding: "utf8" },
          ).stdout.trim(),
          HOMECOOK_C2_SOURCE_REPO_ROOT: repoRoot,
        },
      },
    );
    expect(hostileDirect.status).toBe(1);
    expect(hostileDirect.stderr).toContain("Authoritative immutable C2 execution is required");
    expect(existsSync(markerPath)).toBe(false);
  });

  it("keeps the attestation workflow least-privilege and approval-gated", () => {
    const workflow = read(".github/workflows/production-release-attestation.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("artifact-metadata: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow.match(/actions: read/gu)).toHaveLength(2);
    expect(workflow.match(/checks: read/gu)).toHaveLength(2);
    expect(workflow.match(/statuses: read/gu)).toHaveLength(2);
    expect(workflow.match(/approve-and-tag:[\s\S]*?permissions:[\s\S]*?contents: read/u)).not.toBeNull();
    expect(workflow).toContain("environment: production-release-approval");
    expect(workflow).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_ID");
    expect(workflow).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY");
    expect(workflow).not.toContain("HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN");
    expect(workflow).toContain("actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349");
    expect(workflow).toContain("permission-contents: write");
    expect(workflow).not.toContain("permission-administration");
    expect(workflow.match(/persist-credentials: false/gu)).toHaveLength(2);
    expect(workflow.match(/git\/ref\/heads\/master/gu)).toHaveLength(3);
    expect(workflow).toContain("git/matching-refs/tags/$RELEASE_TAG");
    expect(workflow).not.toContain("git fetch origin");
    expect(workflow).toContain("prod-YYYYMMDD.N");
    expect(workflow).toContain("required_check_summary");
    expect(workflow).toContain("commits/\"$RELEASE_SHA\"/statuses");
    expect(workflow).toMatch(/statuses[\s\S]*?--paginate/u);
    expect(workflow).toContain("--excluded-check-suite-ids-json");
    expect(workflow).not.toContain("--excluded-check-suite-id ");
    expect(workflow).toContain("actions/workflows/production-release-attestation.yml");
    expect(workflow).toContain("head_sha=$RELEASE_SHA");
    expect(workflow).toContain("event=workflow_dispatch");
    expect(workflow).toContain("--paginate");
    expect(workflow).toContain('.path == ".github/workflows/production-release-attestation.yml"');
    expect(workflow).toContain(".workflow_id == $workflow_id");
    expect(workflow).toContain("release-workflow-suite-ids.json");
    expect(workflow).toContain("check_suite_ids");
    expect(workflow).toMatch(
      /cmp[\s\S]*?production-release-attestation-inputs\/release-workflow-suite-ids\.json[\s\S]*?post-approval\/release-workflow-suite-ids\.json/u,
    );
    expect(workflow).toContain("subject-path:");
    expect(workflow).toContain("predicate-path:");
    expect(workflow).not.toContain("gh api repos/netsus/homecook/rulesets");
    expect(workflow).not.toContain("gh api repos/netsus/homecook/environments/");
    expect(workflow).toContain("Validate resolved committed desired state without admin readback");
    expect(workflow).toContain("git mktag");
    expect(workflow).toContain("x-access-token:${{ steps.app-token.outputs.token }}@github.com/netsus/homecook.git");
    expect(workflow).toContain('"refs/tags/$RELEASE_TAG:refs/tags/$RELEASE_TAG"');
    expect(workflow.match(/x-access-token:\$\{\{ steps\.app-token\.outputs\.token \}\}/gu)).toHaveLength(1);
    expect(workflow).toContain("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6");
    expect(workflow).toContain("custom predicate");
    expect(workflow).toContain("terminal check summary");
    for (const context of EXPECTED_RELEASE_CONTEXTS) {
      expect(workflow).toContain(context);
    }
    expect(workflow).not.toContain("security-smoke,snyk");
    expect(workflow.match(/commits\/\$RELEASE_SHA\/check-runs\?filter=all&per_page=100/gu)).toHaveLength(2);

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
    expect(workflow).toContain("release_tag_object_sha");
    expect(workflow).toContain("production-release-tag-object.raw");
    expect(workflow).toContain("git/ref/tags/$RELEASE_TAG");
    expect(workflow).toContain('.object.type == "tag"');
    expect(workflow).toContain("remote tag object SHA");

    const pushIndex = workflow.indexOf("git push");
    const existingTagRaceIndex = workflow.indexOf("release_tag already exists");
    const readbackIndex = workflow.indexOf("Read back exact remote annotated tag object");
    const attestIndex = workflow.indexOf("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6");
    expect(pushIndex).toBeGreaterThan(-1);
    expect(existingTagRaceIndex).toBeGreaterThan(-1);
    expect(existingTagRaceIndex).toBeLessThan(pushIndex);
    expect(workflow).toContain("git push --porcelain");
    expect(workflow).toContain("[new tag]");
    expect(workflow).toContain("protected tag creation race detected");
    expect(readbackIndex).toBeGreaterThan(pushIndex);
    expect(attestIndex).toBeGreaterThan(readbackIndex);
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
    expect(ci).toContain("scope:");
    expect(ci.match(/if: always\(\)/gu)).toHaveLength(3);
    expect(qa).toContain("changes:");
    expect(policy).toContain("policy:");
    expect(securityReview).toMatch(/pull_request:/u);
    expect(securityReview).not.toContain("paths-ignore:");
    expect(securityReview).toContain("scope:");
    expect(securityReview).toContain("if: always()");
    expect(securityReview).toContain("dependency-audit:");
    expect(securityReview).toContain("snyk:");
    expect(read(".github/rulesets/production-release-master.json")).not.toContain('"context": "snyk"');
    expect(securitySmoke).not.toMatch(/pull_request:[\s\S]*?paths:/u);
    expect(securitySmoke).not.toMatch(/push:[\s\S]*?paths:/u);
    expect(securitySmoke).toContain("scope:");
    expect(securitySmoke).toContain("if: always()");
  });

  it("fails required jobs closed when scope resolution fails and reports unrelated changes as N/A", () => {
    const requiredJobs = [
      { file: ".github/workflows/ci.yml", jobs: ["quality", "build", "security-function-authorization"] },
      { file: ".github/workflows/security-review.yml", jobs: ["dependency-audit"] },
      { file: ".github/workflows/security-smoke.yml", jobs: ["security-smoke"] },
    ];

    for (const { file, jobs } of requiredJobs) {
      const workflow = read(file);
      for (const job of jobs) {
        const section = workflow.match(
          new RegExp(
            `^  ${job}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:|(?![\\s\\S]))`,
            "mu",
          ),
        )?.[0] ?? "";
        expect(section, `${file}:${job}`).toContain("if: always()");
        expect(section, `${file}:${job}`).toMatch(
          /- name: Fail closed when scope resolution failed[\s\S]*?if: needs\.scope\.result != 'success'[\s\S]*?exit 1/u,
        );
        expect(section, `${file}:${job}`).toMatch(
          /- name: Report not applicable[\s\S]*?if: needs\.scope\.result == 'success' && needs\.scope\.outputs\.[a-z_]+ != 'true'[\s\S]*?N\/A/u,
        );
      }
    }
  });

  it("keeps pull requests secret-free and runs Snyk only in trusted event contexts", () => {
    const securityReview = read(".github/workflows/security-review.yml");
    const snykSection = securityReview.match(
      /^  snyk:\n([\s\S]*?)(?=(?![\s\S]))/mu,
    )?.[0] ?? "";
    const dependencyAuditSection = securityReview.match(
      /^  dependency-audit:\n([\s\S]*?)(?=^  snyk:)/mu,
    )?.[0] ?? "";

    expect(dependencyAuditSection).not.toContain("SNYK_TOKEN");
    expect(snykSection).toContain("github.event_name != 'pull_request'");
    expect(snykSection).not.toMatch(/^    env:\n[\s\S]*?SNYK_TOKEN:/mu);
    expect(snykSection).toMatch(
      /uses: snyk\/actions\/node@[0-9a-f]{40}[\s\S]*?env:\n\s+SNYK_TOKEN: \$\{\{ secrets\.SNYK_TOKEN \}\}/u,
    );
  });

  it("reports trusted Snyk scans as N/A without exposing an absent token", () => {
    const securityReview = read(".github/workflows/security-review.yml");
    const snykSection = securityReview.match(
      /^  snyk:\n([\s\S]*?)(?=(?![\s\S]))/mu,
    )?.[0] ?? "";

    expect(snykSection).toMatch(
      /- name: Probe Snyk token presence\n\s+id: snyk-token\n\s+env:\n\s+SNYK_TOKEN_PRESENT: \$\{\{ secrets\.SNYK_TOKEN != '' \}\}[\s\S]*?>> "\$GITHUB_OUTPUT"/u,
    );
    expect(snykSection).toMatch(
      /- name: Report Snyk not applicable\n\s+if: steps\.snyk-token\.outputs\.present != 'true'[\s\S]*?N\/A/u,
    );

    for (const stepName of [
      "Checkout",
      "Setup pnpm",
      "Setup Node",
      "Install dependencies",
    ]) {
      const step = snykSection.match(
        new RegExp(
          `- name: ${stepName}\\n([\\s\\S]*?)(?=\\n      - name: |(?![\\s\\S]))`,
          "u",
        ),
      )?.[0] ?? "";
      expect(step, stepName).toContain("if: steps.snyk-token.outputs.present == 'true'");
      expect(step, stepName).not.toContain("SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}");
    }

    expect(snykSection.match(/^\s+SNYK_TOKEN:/gmu)).toHaveLength(1);
    expect(snykSection).not.toContain("continue-on-error");
  });

  it("rejects mutable external Action refs in trusted-context workflows", () => {
    const trustedWorkflowFiles = [
      ".github/workflows/ci.yml",
      ".github/workflows/playwright.yml",
      ".github/workflows/policy.yml",
      ".github/workflows/security-review.yml",
      ".github/workflows/security-smoke.yml",
    ];
    const mutableUses = (source: string) => source
      .split("\n")
      .map((line) => line.match(/^\s*-\s+uses:\s+([^\s#]+)\s*(?:#.*)?$/u)?.[1])
      .filter((reference): reference is string => Boolean(reference))
      .filter((reference) => !/@[0-9a-f]{40}$/u.test(reference));

    expect(mutableUses("steps:\n  - uses: actions/checkout@v6\n")).toEqual([
      "actions/checkout@v6",
    ]);
    for (const workflowFile of trustedWorkflowFiles) {
      expect(mutableUses(read(workflowFile)), workflowFile).toEqual([]);
    }

    const pinnedActions = [
      "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
      "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86",
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      "snyk/actions/node@12140f4059e244892ae643824a95459a102120dd",
    ];
    const trustedWorkflowBundle = trustedWorkflowFiles.map(read).join("\n");
    for (const pinnedAction of pinnedActions) {
      expect(trustedWorkflowBundle).toContain(pinnedAction);
    }
  });

  it("documents C2 admin snapshot as separate pre-activation evidence", () => {
    const runbook = read("docs/engineering/local-mac-production-release-promotion.md");

    expect(runbook).toContain(
      "C2 admin readback snapshot은 runtime release workflow와 분리된 별도 evidence다.",
    );
    expect(runbook).toContain(
      "production-release-approval-environment-secrets.json",
    );
    expect(runbook).toContain("production-release-tag-creation.json");
    expect(runbook).toContain("production-release-tag-immutability.json");
    expect(runbook).toContain("can_admins_bypass: false");
    expect(runbook).toContain(
      '/usr/bin/git show "$C2_HEAD":scripts/bootstrap-production-release-rulesets.mjs',
    );
    expect(runbook).toContain('--source-repo "$(/usr/bin/git rev-parse --show-toplevel)"');
    expect(runbook).toContain('--expected-head "$C2_HEAD"');
    expect(runbook).not.toContain("pnpm release:github:rulesets:apply -- \\\n+  --execute");
    expect(runbook).toContain("authoritative C2 evidence");
    expect(runbook).toContain("operator는 completion marker를 수동 작성하지 않는다");
    expect(runbook).toContain('.activation_blocked == false and .actual_state == "matched"');
    expect(runbook).toContain("runtime workflow는 GitHub Administration API를 호출하지 않는다");
    expect(runbook).toContain("tag App token은 `contents:write`만 요청한다");
    expect(runbook).toContain("optional additional started check다");
    expect(runbook).toContain("attestation이 없는 상태");
    expect(runbook).toContain("production deployment authority가 아니며");
    expect(runbook).toContain("다음 `prod-YYYYMMDD.N`");
    expect(runbook).toContain("self-referential suite exception");
    expect(runbook).toContain("canonical `production-release-attestation.yml`");
    expect(runbook).toContain("external bad/pending/rerun");
  });
});
