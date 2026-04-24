import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  commitWorktreeChanges,
  ensureSupervisorWorktree,
  ensureWorktreeBranch,
  syncWorktreeWithBaseBranch,
} from "../scripts/lib/omo-worktree.mjs";

function createGitFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-worktree-"));
  const remoteDir = mkdtempSync(join(tmpdir(), "omo-worktree-remote-"));

  execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
  execFileSync("git", ["init", "--bare"], { cwd: remoteDir });
  execFileSync("git", ["config", "user.name", "OMO Test"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "omo@example.com"], { cwd: rootDir });
  execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: rootDir });

  writeFileSync(join(rootDir, "README.md"), "# temp\n");
  execFileSync("git", ["add", "README.md"], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "chore: seed repo"], { cwd: rootDir });
  execFileSync("git", ["push", "-u", "origin", "master"], { cwd: rootDir });

  return {
    rootDir,
    remoteDir,
  };
}

describe("OMO worktree manager", () => {
  it("creates a dedicated detached worktree under .worktrees and checks out stage branches there", () => {
    const { rootDir } = createGitFixture();
    writeFileSync(join(rootDir, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");

    const first = ensureSupervisorWorktree({
      rootDir,
      workItemId: "03-recipe-like",
    });
    const second = ensureWorktreeBranch({
      rootDir,
      worktreePath: first.path,
      branch: "docs/03-recipe-like",
    });

    const rootBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();
    const worktreeBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: first.path,
      encoding: "utf8",
    }).trim();

    expect(first.path).toBe(join(rootDir, ".worktrees", "03-recipe-like"));
    expect(first.created).toBe(true);
    expect(second.branch).toBe("docs/03-recipe-like");
    expect(rootBranch).toBe("master");
    expect(worktreeBranch).toBe("docs/03-recipe-like");
    expect(readFileSync(join(first.path, ".env.local"), "utf8")).toBe(
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n",
    );
  });

  it("syncs a worktree from origin/master without requiring a local master checkout handoff", () => {
    const { rootDir, remoteDir } = createGitFixture();
    writeFileSync(join(rootDir, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");
    const ensured = ensureSupervisorWorktree({
      rootDir,
      workItemId: "05-planner-week-core",
    });
    const initialHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ensured.path,
      encoding: "utf8",
    }).trim();
    const syncCloneDir = mkdtempSync(join(tmpdir(), "omo-worktree-sync-clone-"));

    execFileSync("git", ["clone", remoteDir, syncCloneDir]);
    execFileSync("git", ["checkout", "-B", "master", "origin/master"], { cwd: syncCloneDir });
    execFileSync("git", ["config", "user.name", "OMO Sync"], { cwd: syncCloneDir });
    execFileSync("git", ["config", "user.email", "omo-sync@example.com"], { cwd: syncCloneDir });
    writeFileSync(join(syncCloneDir, "NEXT.md"), "new remote change\n");
    execFileSync("git", ["add", "NEXT.md"], { cwd: syncCloneDir });
    execFileSync("git", ["commit", "-m", "feat: remote update"], { cwd: syncCloneDir });
    execFileSync("git", ["push", "origin", "master"], { cwd: syncCloneDir });

    syncWorktreeWithBaseBranch({
      rootDir,
      worktreePath: ensured.path,
    });

    const remoteHead = execFileSync("git", ["rev-parse", "origin/master"], {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();
    const syncedHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ensured.path,
      encoding: "utf8",
    }).trim();
    const rootBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();
    const worktreeBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: ensured.path,
      encoding: "utf8",
    }).trim();

    expect(initialHead).not.toBe(remoteHead);
    expect(syncedHead).toBe(remoteHead);
    expect(rootBranch).toBe("master");
    expect(worktreeBranch).toBe("");
    expect(readFileSync(join(ensured.path, ".env.local"), "utf8")).toBe(
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n",
    );
  });

  it("fetches origin/master before creating a new worktree branch from origin/master", () => {
    const { rootDir, remoteDir } = createGitFixture();
    const ensured = ensureSupervisorWorktree({
      rootDir,
      workItemId: "06-recipe-to-planner",
    });
    const syncCloneDir = mkdtempSync(join(tmpdir(), "omo-worktree-branch-clone-"));

    execFileSync("git", ["clone", remoteDir, syncCloneDir]);
    execFileSync("git", ["checkout", "-B", "master", "origin/master"], { cwd: syncCloneDir });
    execFileSync("git", ["config", "user.name", "OMO Sync"], { cwd: syncCloneDir });
    execFileSync("git", ["config", "user.email", "omo-sync@example.com"], { cwd: syncCloneDir });
    writeFileSync(join(syncCloneDir, "BRANCH.md"), "new branch base\n");
    execFileSync("git", ["add", "BRANCH.md"], { cwd: syncCloneDir });
    execFileSync("git", ["commit", "-m", "feat: branch base update"], { cwd: syncCloneDir });
    execFileSync("git", ["push", "origin", "master"], { cwd: syncCloneDir });

    const branch = ensureWorktreeBranch({
      rootDir,
      worktreePath: ensured.path,
      branch: "feature/be-06-recipe-to-planner",
      startPoint: "origin/master",
    });
    const branchHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ensured.path,
      encoding: "utf8",
    }).trim();
    const remoteHead = execFileSync("git", ["rev-parse", "origin/master"], {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();

    expect(branch).toMatchObject({
      branch: "feature/be-06-recipe-to-planner",
      created: true,
    });
    expect(branchHead).toBe(remoteHead);
  });

  it("re-syncs the root .env.local into an existing worktree when reusing it", () => {
    const { rootDir } = createGitFixture();
    writeFileSync(join(rootDir, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");

    const first = ensureSupervisorWorktree({
      rootDir,
      workItemId: "04-recipe-save",
    });

    writeFileSync(join(rootDir, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:65432\n");

    const second = ensureSupervisorWorktree({
      rootDir,
      workItemId: "04-recipe-save",
    });

    expect(first.path).toBe(second.path);
    expect(second.created).toBe(false);
    expect(readFileSync(join(second.path, ".env.local"), "utf8")).toBe(
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:65432\n",
    );
  });

  it("rejects non-conventional commit subjects for OMO-generated worktree commits", () => {
    const { rootDir } = createGitFixture();
    const ensured = ensureSupervisorWorktree({
      rootDir,
      workItemId: "08a-meal-add-search-core",
    });
    ensureWorktreeBranch({
      rootDir,
      worktreePath: ensured.path,
      branch: "feature/be-08a-meal-add-search-core",
    });

    writeFileSync(join(ensured.path, "CHANGELOG.md"), "temp\n");

    expect(() =>
      commitWorktreeChanges({
        worktreePath: ensured.path,
        subject: "Prevent OMO backend review lanes from stalling",
      }),
    ).toThrow(/Conventional Commits/);
  });
});
