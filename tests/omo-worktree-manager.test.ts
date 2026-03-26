import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  ensureSupervisorWorktree,
  ensureWorktreeBranch,
} from "../scripts/lib/omo-worktree.mjs";

function createGitFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-worktree-"));

  execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "OMO Test"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "omo@example.com"], { cwd: rootDir });

  writeFileSync(join(rootDir, "README.md"), "# temp\n");
  execFileSync("git", ["add", "README.md"], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "chore: seed repo"], { cwd: rootDir });

  return rootDir;
}

describe("OMO worktree manager", () => {
  it("creates a dedicated detached worktree under .worktrees and checks out stage branches there", () => {
    const rootDir = createGitFixture();

    const first = ensureSupervisorWorktree({
      rootDir,
      workItemId: "03-recipe-like",
      baseRef: "master",
    });
    const second = ensureWorktreeBranch({
      rootDir,
      worktreePath: first.path,
      branch: "docs/03-recipe-like",
      startPoint: "master",
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
  });
});
