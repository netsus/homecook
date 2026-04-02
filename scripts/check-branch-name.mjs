import { spawnSync } from "node:child_process";

import {
  isAllowedBranchName,
  isProtectedBranchName,
} from "./lib/git-policy.mjs";

function readCurrentBranchName() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  const branchName = result.stdout.trim();

  return branchName.length > 0 ? branchName : null;
}

const branchName = process.env.BRANCH_NAME ?? process.argv[2] ?? readCurrentBranchName();

if (!branchName) {
  console.error("Branch name is required via BRANCH_NAME, argv, or the current git checkout.");
  process.exit(1);
}

if (!isAllowedBranchName(branchName)) {
  console.error(
    [
      `Invalid branch name: ${branchName}`,
      "Expected one of:",
      "  feature/<slug>",
      "  fix/<slug>",
      "  chore/<slug>",
      "  docs/<slug>",
      "  refactor/<slug>",
      "  test/<slug>",
      "  release/<slug>",
      "  hotfix/<slug>",
      "  main | master | develop",
    ].join("\n"),
  );
  process.exit(1);
}

if (isProtectedBranchName(branchName) && process.env.ALLOW_PROTECTED_BRANCH !== "1") {
  console.error(
    [
      `Protected base branch is not allowed for direct work: ${branchName}`,
      "Create and checkout a dedicated work branch before editing files or opening a PR.",
      "Allowed work branch patterns:",
      "  feature/<slug>",
      "  fix/<slug>",
      "  chore/<slug>",
      "  docs/<slug>",
      "  refactor/<slug>",
      "  test/<slug>",
      "  release/<slug>",
      "  hotfix/<slug>",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write(`Branch name OK: ${branchName}\n`);
