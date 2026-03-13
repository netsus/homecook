import { isAllowedBranchName } from "./lib/git-policy.mjs";

const branchName = process.env.BRANCH_NAME ?? process.argv[2];

if (!branchName) {
  console.error("Branch name is required via BRANCH_NAME or argv.");
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

process.stdout.write(`Branch name OK: ${branchName}\n`);
