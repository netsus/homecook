import { describe, expect, it } from "vitest";

import {
  findMissingPrSections,
  isAllowedBranchName,
  isValidCommitMessage,
} from "../scripts/lib/git-policy.mjs";

describe("git policy", () => {
  it("accepts allowed branch names", () => {
    expect(isAllowedBranchName("feature/login-gate-modal")).toBe(true);
    expect(isAllowedBranchName("hotfix/auth-callback")).toBe(true);
    expect(isAllowedBranchName("master")).toBe(true);
  });

  it("rejects invalid branch names", () => {
    expect(isAllowedBranchName("feature/login_gate")).toBe(false);
    expect(isAllowedBranchName("bugfix/auth")).toBe(false);
  });

  it("accepts conventional commit messages", () => {
    expect(isValidCommitMessage("feat: add login modal")).toBe(true);
    expect(isValidCommitMessage("fix(auth): guard callback state")).toBe(true);
  });

  it("rejects non-conventional commit messages", () => {
    expect(isValidCommitMessage("update login flow")).toBe(false);
    expect(isValidCommitMessage("feat add login flow")).toBe(false);
  });

  it("accepts merge commit messages", () => {
    expect(
      isValidCommitMessage(
        "Merge cd887bb into dff7451bb4de10fc18845c48b138f992257ba3e8",
      ),
    ).toBe(true);
    expect(
      isValidCommitMessage("Merge branch 'master' into feature/login"),
    ).toBe(true);
  });

  it("reports missing PR template sections", () => {
    const missing = findMissingPrSections("## Summary\n\n## Test Plan");

    expect(missing).toContain("## Workpack / Slice");
    expect(missing).toContain("## Security Review");
    expect(missing).not.toContain("## Summary");
  });
});
