import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");
const temporaryDirectories: string[] = [];

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
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
      rules?: Array<{ parameters?: Record<string, unknown>; type?: string }>;
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
              required_status_checks: [],
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

    const verifyWithActual = spawnSync(
      process.execPath,
      [RULESET_SCRIPT, "verify", "--json", "--actual-dir", actualDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    expect(verifyWithActual.status, verifyWithActual.stderr).toBe(0);
    expect(verifyWithActual.stdout).toContain("\"activation_blocked\": false");
    expect(verifyWithActual.stdout).toContain("\"actual_state\": \"matched\"");

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
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("environment: production-release-approval");
    expect(workflow).toContain("refs/remotes/origin/master^{commit}");
    expect(workflow).toContain("prod-YYYYMMDD.N");
    expect(workflow).toContain("required_check_summary");
    expect(workflow).toContain("subject-path:");
    expect(workflow).toContain("predicate-path:");
    expect(workflow).toContain("gh api repos/${{ github.repository }}/rulesets");
    expect(workflow).toContain("git tag -a");
    expect(workflow).toContain("git push origin refs/tags/");
    expect(workflow).toContain("actions/attest@v4");
    expect(workflow).toContain("custom predicate");
    expect(workflow).toContain("terminal check summary");
  });
});
