import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const supersedablePullRequestWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/playwright.yml",
  ".github/workflows/policy.yml",
  ".github/workflows/pr-governance.yml",
  ".github/workflows/qa-eval.yml",
  ".github/workflows/security-review.yml",
  ".github/workflows/security-smoke.yml",
] as const;

function expectedConcurrency({
  action,
  eventName,
  pullRequestNumber,
  runId,
}: {
  action: string;
  eventName: string;
  pullRequestNumber: number;
  runId: number;
}) {
  const isHeadUpdate = action === "synchronize";

  return {
    group: isHeadUpdate ? `pr-${pullRequestNumber}-head-updates` : String(runId),
    cancelInProgress:
      (eventName === "pull_request" || eventName === "pull_request_target")
      && isHeadUpdate,
  };
}

describe("workflow concurrency", () => {
  it("cancels only superseded pull-request runs while preserving protected-branch evidence", () => {
    for (const relativePath of supersedablePullRequestWorkflows) {
      const workflow = readFileSync(join(repoRoot, relativePath), "utf8");

      expect(workflow, relativePath).toContain("concurrency:");
      expect(workflow, relativePath).toContain(
        "group: ${{ github.workflow }}-${{ github.event.action == 'synchronize' && format('pr-{0}-head-updates', github.event.pull_request.number) || github.run_id }}",
      );
      expect(workflow, relativePath).toContain(
        "cancel-in-progress: ${{ (github.event_name == 'pull_request' || github.event_name == 'pull_request_target') && github.event.action == 'synchronize' }}",
      );
    }
  });

  it("does not add cancellation to the production attestation authority", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github/workflows/production-release-attestation.yml"),
      "utf8",
    );

    expect(workflow).not.toContain("cancel-in-progress:");
  });

  it("does not let metadata events cancel or replace a ready-for-review full run", () => {
    const ready = expectedConcurrency({
      action: "ready_for_review",
      eventName: "pull_request",
      pullRequestNumber: 1514,
      runId: 100,
    });
    const labeled = expectedConcurrency({
      action: "labeled",
      eventName: "pull_request",
      pullRequestNumber: 1514,
      runId: 101,
    });
    const firstHeadUpdate = expectedConcurrency({
      action: "synchronize",
      eventName: "pull_request",
      pullRequestNumber: 1514,
      runId: 102,
    });
    const nextHeadUpdate = expectedConcurrency({
      action: "synchronize",
      eventName: "pull_request",
      pullRequestNumber: 1514,
      runId: 103,
    });

    expect(ready).toEqual({ group: "100", cancelInProgress: false });
    expect(labeled).toEqual({ group: "101", cancelInProgress: false });
    expect(ready.group).not.toBe(labeled.group);
    expect(firstHeadUpdate).toEqual({
      group: "pr-1514-head-updates",
      cancelInProgress: true,
    });
    expect(nextHeadUpdate).toEqual(firstHeadUpdate);
  });
});
