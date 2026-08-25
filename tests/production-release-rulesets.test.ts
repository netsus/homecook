import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const RULESET_SCRIPT = join(repoRoot, "scripts", "manage-production-release-rulesets.mjs");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("production release rulesets desired state", () => {
  it("locks branch and prod-tag protections without broad admin bypass", () => {
    const branchRuleset = JSON.parse(
      read(".github/rulesets/production-release-master.json"),
    ) as {
      target?: string;
      enforcement?: string;
      conditions?: { ref_name?: { include?: string[] } };
      rules?: Record<string, boolean>;
      bypass_actors?: Array<{ actor_type?: string; actor_id?: string; mode?: string }>;
    };
    const tagRuleset = JSON.parse(
      read(".github/rulesets/production-release-tags.json"),
    ) as {
      target?: string;
      enforcement?: string;
      conditions?: { ref_name?: { include?: string[] } };
      rules?: Record<string, boolean>;
      bypass_actors?: Array<{ actor_type?: string; actor_id?: string; mode?: string }>;
    };

    expect(branchRuleset.target).toBe("branch");
    expect(branchRuleset.enforcement).toBe("active");
    expect(branchRuleset.conditions?.ref_name?.include).toEqual(["refs/heads/master"]);
    expect(branchRuleset.rules).toMatchObject({
      restrict_deletions: true,
      restrict_non_fast_forward_updates: true,
    });

    expect(tagRuleset.target).toBe("tag");
    expect(tagRuleset.enforcement).toBe("active");
    expect(tagRuleset.conditions?.ref_name?.include).toEqual(["refs/tags/prod-*"]);
    expect(tagRuleset.rules).toMatchObject({
      restrict_creations: true,
      restrict_deletions: true,
      restrict_non_fast_forward_updates: true,
    });

    for (const ruleset of [branchRuleset, tagRuleset]) {
      expect(ruleset.bypass_actors?.length ?? 0).toBeGreaterThan(0);
      expect(
        ruleset.bypass_actors?.some((actor) =>
          actor.actor_type === "RepositoryRole"
          && /admin|maintain|write|triage/iu.test(actor.actor_id ?? ""),
        ) ?? false,
      ).toBe(false);
    }
  });

  it("ships a read-only ruleset planner/verifier and a dry-run apply surface", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["release:github:rulesets:plan"]).toBeTruthy();
    expect(packageJson.scripts?.["release:github:rulesets:verify"]).toBeTruthy();
    expect(packageJson.scripts?.["release:github:rulesets:apply"]).toBeTruthy();

    const verify = spawnSync(process.execPath, [RULESET_SCRIPT, "verify", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(verify.status, verify.stderr).toBe(0);
    expect(verify.stdout).toContain("\"mode\": \"verify\"");
    expect(verify.stdout).toContain("production-release-master");
    expect(verify.stdout).toContain("production-release-tags");

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
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("environment: production-release-approval");
    expect(workflow).toContain("refs/remotes/origin/master^{commit}");
    expect(workflow).toContain("prod-YYYYMMDD.N");
    expect(workflow).toContain("required_check_summary");
    expect(workflow).toContain("actions/attest@v4");
    expect(workflow).toContain("terminal check summary");
  });
});
