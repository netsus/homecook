import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { readBranchPromptState, writeBranchSession } from "../scripts/lib/branch-session.mjs";
import {
  buildUserPromptBranchContext,
  ensureEditWorkBranch,
} from "../scripts/lib/edit-branch-guard.mjs";
import { startWorkBranch } from "../scripts/lib/start-work-branch.mjs";

function initGitRepo(rootDir: string) {
  execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "Branch Guard Test"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "branch-guard@example.com"], {
    cwd: rootDir,
  });
}

function setupRepoFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "edit-branch-guard-"));
  initGitRepo(rootDir);

  writeFileSync(join(rootDir, "README.md"), "# fixture\n");
  writeFileSync(join(rootDir, ".gitignore"), ".opencode/branch-session.json\n");
  execFileSync("git", ["add", "README.md", ".gitignore"], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "chore: seed repo fixture"], { cwd: rootDir });

  const remoteDir = mkdtempSync(join(tmpdir(), "edit-branch-guard-remote-"));
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

describe("ensureEditWorkBranch", () => {
  it("allows edits when the current checkout already matches the recorded intent", () => {
    const rootDir = setupRepoFixture();

    startWorkBranch({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });

    const result = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "docs", "engineering", "git-workflow.md"),
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "allow",
      branchChanged: false,
      currentBranch: "docs/workflow-closeout-sync",
      targetBranch: "docs/workflow-closeout-sync",
    });
  });

  it("auto-switches to the recorded work branch when checkout drifted but the worktree is clean", () => {
    const rootDir = setupRepoFixture();

    startWorkBranch({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });
    execFileSync("git", ["checkout", "master"], { cwd: rootDir });

    const result = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "docs", "engineering", "git-workflow.md"),
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "allow",
      branchChanged: true,
      currentBranch: "master",
      targetBranch: "docs/workflow-closeout-sync",
    });
    expect(readCurrentBranch(rootDir)).toBe("docs/workflow-closeout-sync");
  });

  it("denies edits when no work branch intent was recorded", () => {
    const rootDir = setupRepoFixture();

    const result = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "README.md"),
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "deny",
    });
    expect(result.reason).toContain("No active work branch intent");
  });

  it("denies auto-switch when checkout drifted and the worktree is dirty", () => {
    const rootDir = setupRepoFixture();

    writeBranchSession({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });
    writeFileSync(join(rootDir, "README.md"), "# changed\n");

    const result = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "README.md"),
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "deny",
    });
    expect(result.reason).toContain("does not match the recorded work branch intent");
  });
});

describe("buildUserPromptBranchContext", () => {
  it("reminds the session to declare a branch when no intent exists", () => {
    const rootDir = setupRepoFixture();

    const context = buildUserPromptBranchContext({
      rootDir,
      prompt: "이제 PR1 closeout sync 작업 진행해줘.",
    });

    expect(context.additionalContext).toContain("No active work branch intent");
  });

  it("mentions the active intent when one exists", () => {
    const rootDir = setupRepoFixture();

    writeBranchSession({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });
    execFileSync("git", ["checkout", "-b", "docs/workflow-closeout-sync"], { cwd: rootDir });

    const context = buildUserPromptBranchContext({
      rootDir,
      prompt: "다음 PR 작업으로 넘어가자.",
    });

    expect(context.additionalContext).toContain("Active work branch intent");
    expect(context.additionalContext).toContain("docs/workflow-closeout-sync");
  });

  it("requires branch reassertion after a new user prompt before edits can continue", () => {
    const rootDir = setupRepoFixture();

    startWorkBranch({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });

    buildUserPromptBranchContext({
      rootDir,
      prompt: "PR1 작업으로 넘어가자.",
    });

    expect(readBranchPromptState({ rootDir }).reassertRequired).toBe(true);

    const blocked = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "README.md"),
        },
      },
    });

    expect(blocked).toMatchObject({
      outcome: "deny",
    });
    expect(blocked.reason).toContain("A new user prompt was received");

    startWorkBranch({
      rootDir,
      branch: "docs/workflow-closeout-sync",
    });

    expect(readBranchPromptState({ rootDir }).reassertRequired).toBe(false);

    const allowed = ensureEditWorkBranch({
      rootDir,
      hookInput: {
        tool_input: {
          file_path: join(rootDir, "README.md"),
        },
      },
    });

    expect(allowed).toMatchObject({
      outcome: "allow",
      branchChanged: false,
      targetBranch: "docs/workflow-closeout-sync",
    });
  });
});
