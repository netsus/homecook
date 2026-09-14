import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { readBranchSession } from "../scripts/lib/branch-session.mjs";
import {
  resolveTargetWorkBranch,
  startWorkBranch,
} from "../scripts/lib/start-work-branch.mjs";

function initGitRepo(rootDir: string) {
  execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "Branch Test"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "branch-test@example.com"], {
    cwd: rootDir,
  });
}

function setupRepoFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "branch-start-"));
  initGitRepo(rootDir);

  writeFileSync(join(rootDir, "README.md"), "# fixture\n");
  writeFileSync(join(rootDir, ".gitignore"), ".opencode/branch-session.json\n");
  execFileSync("git", ["add", "README.md", ".gitignore"], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "chore: seed repo fixture"], { cwd: rootDir });

  const remoteDir = mkdtempSync(join(tmpdir(), "branch-start-remote-"));
  execFileSync("git", ["init", "--bare", "--initial-branch=master", remoteDir]);
  execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: rootDir });
  execFileSync("git", ["push", "-u", "origin", "master"], { cwd: rootDir });

  return rootDir;
}

function readCurrentBranch(rootDir: string) {
  return execFileSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();
}

describe("resolveTargetWorkBranch", () => {
  it("builds docs, backend, and frontend slice branches", () => {
    expect(
      resolveTargetWorkBranch({ slice: "06-recipe-to-planner", role: "docs" }),
    ).toBe("docs/06-recipe-to-planner");
    expect(
      resolveTargetWorkBranch({ slice: "06-recipe-to-planner", role: "be" }),
    ).toBe("feature/be-06-recipe-to-planner");
    expect(
      resolveTargetWorkBranch({ slice: "06-recipe-to-planner", role: "fe" }),
    ).toBe("feature/fe-06-recipe-to-planner");
  });

  it("accepts explicit work branches", () => {
    expect(
      resolveTargetWorkBranch({ branch: "feature/branch-switch-guard" }),
    ).toBe("feature/branch-switch-guard");
  });
});

describe("startWorkBranch", () => {
  it("creates a new work branch from origin/master", () => {
    const rootDir = setupRepoFixture();

    const result = startWorkBranch({
      rootDir,
      branch: "feature/branch-switch-guard",
    });

    expect(result).toMatchObject({
      branch: "feature/branch-switch-guard",
      created: true,
      changed: true,
      source: "base",
    });
    expect(readCurrentBranch(rootDir)).toBe("feature/branch-switch-guard");
    expect(readBranchSession({ rootDir })).toMatchObject({
      branch: "feature/branch-switch-guard",
      source: "branch",
    });
  });

  it("checks out an existing local work branch without recreating it", () => {
    const rootDir = setupRepoFixture();

    startWorkBranch({
      rootDir,
      branch: "feature/branch-switch-guard",
    });
    execFileSync("git", ["checkout", "master"], { cwd: rootDir });

    const result = startWorkBranch({
      rootDir,
      branch: "feature/branch-switch-guard",
    });

    expect(result).toMatchObject({
      branch: "feature/branch-switch-guard",
      created: false,
      changed: true,
      source: "local",
    });
    expect(readCurrentBranch(rootDir)).toBe("feature/branch-switch-guard");
    expect(readBranchSession({ rootDir })?.branch).toBe("feature/branch-switch-guard");
  });

  it("refuses to switch branches when the worktree is dirty", () => {
    const rootDir = setupRepoFixture();

    writeFileSync(join(rootDir, "README.md"), "# changed\n");

    expect(() =>
      startWorkBranch({
        rootDir,
        branch: "feature/branch-switch-guard",
      }),
    ).toThrow("Worktree is dirty.");
  });

  it("blocks feature slice branches until workpack docs exist on origin/master", () => {
    const rootDir = setupRepoFixture();

    expect(() =>
      startWorkBranch({
        rootDir,
        slice: "06-recipe-to-planner",
        role: "be",
      }),
    ).toThrow("Stage 1 docs must be merged before starting feature/be-06-recipe-to-planner.");
  });

  it("allows feature slice branches after workpack docs are merged on origin/master", () => {
    const rootDir = setupRepoFixture();

    mkdirSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner"), {
      recursive: true,
    });
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      "# workpack\n",
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      "# acceptance\n",
    );
    execFileSync("git", ["add", "docs"], { cwd: rootDir });
    execFileSync("git", ["commit", "-m", "docs: add workpack fixture"], { cwd: rootDir });
    execFileSync("git", ["push"], { cwd: rootDir });

    const result = startWorkBranch({
      rootDir,
      slice: "06-recipe-to-planner",
      role: "be",
    });

    expect(result.branch).toBe("feature/be-06-recipe-to-planner");
    expect(readCurrentBranch(rootDir)).toBe("feature/be-06-recipe-to-planner");
    expect(readBranchSession({ rootDir })).toMatchObject({
      branch: "feature/be-06-recipe-to-planner",
      source: "slice-role",
      slice: "06-recipe-to-planner",
      role: "be",
    });
  });
});
