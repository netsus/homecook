import { describe, expect, it } from "vitest";

import {
  evaluateCiPathFilters,
  matchesPathPattern,
} from "../scripts/ci-path-filter.mjs";

describe("ci path filter", () => {
  it("matches repository-style glob patterns", () => {
    expect(matchesPathPattern("components/home/home-screen.tsx", "components/home/**")).toBe(
      true,
    );
    expect(matchesPathPattern("tests/e2e/slice-01-basic.spec.ts", "tests/e2e/slice-*.spec.ts")).toBe(
      true,
    );
    expect(matchesPathPattern("next.config.mjs", "next.config.*")).toBe(true);
    expect(matchesPathPattern("components/pantry/pantry-screen.tsx", "components/home/**")).toBe(
      false,
    );
  });

  it("runs fast UI QA for general design changes without forcing Lighthouse", () => {
    const result = evaluateCiPathFilters({
      changedFiles: ["components/pantry/pantry-screen.tsx"],
      eventName: "pull_request",
      draft: false,
    });

    expect(result).toMatchObject({
      smoke: true,
      accessibility: true,
      visual: true,
      lighthouse: false,
      full_regression: false,
      complete_regression_matrix: false,
    });
  });

  it("blocks Lighthouse only for non-draft performance-relevant pull requests", () => {
    const draftResult = evaluateCiPathFilters({
      changedFiles: ["app/page.tsx"],
      eventName: "pull_request",
      draft: true,
    });
    const readyResult = evaluateCiPathFilters({
      changedFiles: ["app/page.tsx"],
      eventName: "pull_request",
      draft: false,
    });

    expect(draftResult.lighthouse).toBe(false);
    expect(readyResult.lighthouse).toBe(true);
    expect(
      evaluateCiPathFilters({
        changedFiles: ["qa/lighthouse-budget.json"],
        eventName: "pull_request",
        draft: false,
      }).lighthouse,
    ).toBe(true);
  });

  it("enables full regression for ready-for-review and full-ci label events", () => {
    const readyForReviewResult = evaluateCiPathFilters({
      changedFiles: ["components/home/home-screen.tsx"],
      eventName: "pull_request",
      action: "ready_for_review",
    });
    const fullCiResult = evaluateCiPathFilters({
      changedFiles: ["docs/engineering/qa-system.md"],
      eventName: "pull_request",
      labels: [{ name: "full-ci" }],
    });

    expect(readyForReviewResult.full_regression).toBe(true);
    expect(readyForReviewResult.complete_regression_matrix).toBe(false);

    expect(fullCiResult.full_regression).toBe(true);
    expect(fullCiResult.complete_regression_matrix).toBe(true);
  });

  it("uses the trimmed CI regression matrix for protected branch pushes", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: ["components/home/home-screen.tsx"],
        eventName: "push",
      }),
    ).toMatchObject({
      full_regression: true,
      complete_regression_matrix: false,
    });
  });

  it("runs the complete QA set for manual and nightly executions", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: [],
        eventName: "workflow_dispatch",
      }),
    ).toEqual({
      smoke: true,
      accessibility: true,
      visual: true,
      lighthouse: true,
      full_regression: true,
      complete_regression_matrix: true,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: [],
        eventName: "schedule",
      }),
    ).toEqual({
      smoke: true,
      accessibility: true,
      visual: true,
      lighthouse: true,
      full_regression: true,
      complete_regression_matrix: true,
    });
  });
});
