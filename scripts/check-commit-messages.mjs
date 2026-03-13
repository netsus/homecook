import { execSync } from "node:child_process";

import { isValidCommitMessage } from "./lib/git-policy.mjs";

function getCommitMessages() {
  const baseRef = process.env.BASE_REF;
  const headRef = process.env.HEAD_REF ?? "HEAD";

  if (baseRef) {
    const output = execSync(`git log --format=%s ${baseRef}..${headRef}`, {
      encoding: "utf8",
    }).trim();

    return output ? output.split("\n") : [];
  }

  const output = execSync("git log -n 20 --format=%s", {
    encoding: "utf8",
  }).trim();

  return output ? output.split("\n") : [];
}

const messages = getCommitMessages();
const invalid = messages.filter((message) => !isValidCommitMessage(message));

if (invalid.length > 0) {
  console.error("Invalid commit messages found:");
  for (const message of invalid) {
    console.error(`- ${message}`);
  }
  console.error(
    "Expected Conventional Commits, e.g. feat: ..., fix(scope): ..., chore: ...",
  );
  process.exit(1);
}

process.stdout.write(`Commit messages OK (${messages.length})\n`);
