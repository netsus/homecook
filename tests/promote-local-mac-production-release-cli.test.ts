import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const SCRIPT_PATH = join(process.cwd(), "scripts", "promote-local-mac-production-release.mjs");

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return String(result.stdout ?? "").trim();
}

function createFixtureRepo({
  includeOriginMaster = true,
} = {}) {
  const rootDir = createTempDirectory("homecook-release-cli-root-");
  writeFileSync(join(rootDir, "README.md"), "fixture\n");

  runGit(rootDir, ["init"]);
  runGit(rootDir, ["config", "user.name", "Codex Fixture"]);
  runGit(rootDir, ["config", "user.email", "fixture@example.com"]);
  runGit(rootDir, ["add", "README.md"]);
  runGit(rootDir, ["commit", "-m", "test: create release cli fixture"]);

  const releaseSha = runGit(rootDir, ["rev-parse", "HEAD"]);
  const releaseTree = runGit(rootDir, ["rev-parse", "HEAD^{tree}"]);

  if (includeOriginMaster) {
    runGit(rootDir, ["update-ref", "refs/remotes/origin/master", releaseSha]);
  }
  runGit(rootDir, ["tag", "-a", "prod-20260825.1", "-m", "fixture release tag"]);
  const releaseTagObjectSha = runGit(rootDir, [
    "rev-parse",
    "refs/tags/prod-20260825.1^{tag}",
  ]);

  const manifestPath = join(rootDir, "release.json");
  writeFileSync(manifestPath, JSON.stringify({
    schema: "homecook.local-mac-production-release.v1",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    signer_workflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    signer_digest: releaseSha,
    expected_release_integration_id: 15368,
    promotion_id: "promo-20260825-01",
    release_tag: "prod-20260825.1",
    release_tag_object_sha: releaseTagObjectSha,
    release_manifest_path: manifestPath,
    release_sha: releaseSha,
    release_tree: releaseTree,
    master_sha_at_approval: releaseSha,
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
    backup_readiness_evidence: "backup-20260825-01",
    previous_release_sha: "c".repeat(40),
    expected_release_contexts: [
      "build",
      "changes",
      "dependency-audit",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
    ],
    required_check_summary: {
      total: 12,
      success: 10,
      intended_skip: 2,
    },
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
  }, null, 2));

  return {
    manifestPath,
    releaseSha,
    rootDir,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("promote-local-mac-production-release CLI", () => {
  it("advertises the full canonical command family in help output", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "help"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("prepare");
    expect(result.stdout).toContain("promote");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("verify");
  });

  it("prints the exact resolved origin/master head for status and plan against a valid fixture repo", () => {
    const fixture = createFixtureRepo();

    const statusResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(statusResult.status, statusResult.stderr).toBe(0);
    expect(statusResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);
    expect(statusResult.stdout).toContain("release_tag: -");

    const planResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "plan",
        "--release-manifest",
        fixture.manifestPath,
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(planResult.status, planResult.stderr).toBe(0);
    expect(planResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);
    expect(planResult.stdout).toContain("release_tag: prod-20260825.1");
    expect(planResult.stdout).toContain(`release_sha: ${fixture.releaseSha}`);
  });

  it("preserves relative path compatibility for plan and status CLI inputs", () => {
    const fixture = createFixtureRepo();
    mkdirSync(join(fixture.rootDir, "fixture-home"), { mode: 0o700 });
    const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
    manifest.release_manifest_path = join(realpathSync(fixture.rootDir), "release.json");
    writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2));

    const statusResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
        "--root-dir",
        ".",
        "--home-dir",
        "./fixture-home",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(statusResult.status, statusResult.stderr).toBe(0);
    expect(statusResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);

    const planResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "plan",
        "--root-dir",
        ".",
        "--home-dir",
        "./fixture-home",
        "--release-manifest",
        "./release.json",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(planResult.status, planResult.stderr).toBe(0);
    expect(planResult.stdout).toContain("release_tag: prod-20260825.1");
    expect(planResult.stdout).toContain(`release_sha: ${fixture.releaseSha}`);
  });

  it("fails closed for status when the target repo cannot resolve exact origin/master", () => {
    const fixture = createFixtureRepo({ includeOriginMaster: false });

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin/master");
    expect(result.stderr).toContain("could not be resolved");
  });

  it("requires the manifest and offline attestation inputs for prepare instead of blanket-blocking it", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "prepare"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("prepare requires --release-manifest");
    expect(result.stderr).not.toContain("currently blocked");
  });

  it("enables promote and verify argument validation without blanket-blocking either command", () => {
    const promote = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "promote"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(promote.status).toBe(1);
    expect(promote.stderr).toContain("promote requires --release-manifest");
    expect(promote.stderr).not.toContain("currently blocked");

    const verify = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "verify"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(verify.status).toBe(1);
    expect(verify.stderr).toContain("verify requires --release-manifest");
    expect(verify.stderr).not.toContain("currently blocked");
  });

});
