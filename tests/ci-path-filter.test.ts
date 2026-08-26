import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  evaluateCiPathFilters,
  matchesPathPattern,
} from "../scripts/ci-path-filter.mjs";

const temporaryDirectories: string[] = [];

function runPathFilterCli({
  event,
  eventName,
  gitExitCode,
  gitScript,
}: {
  event: Record<string, unknown>;
  eventName: string;
  gitExitCode?: number;
  gitScript?: string;
}) {
  const directory = mkdtempSync(join(tmpdir(), "homecook-ci-path-filter-"));
  temporaryDirectories.push(directory);
  const eventPath = join(directory, "event.json");
  const gitPath = join(directory, "git");
  writeFileSync(eventPath, JSON.stringify(event));
  writeFileSync(gitPath, gitScript ?? `#!/bin/sh\nexit ${gitExitCode ?? 0}\n`);
  chmodSync(gitPath, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    PATH: `${directory}:${process.env.PATH ?? ""}`,
  };
  delete env.CI_CHANGED_FILES;

  return spawnSync(process.execPath, ["scripts/ci-path-filter.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

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
      code: true,
      dependency_audit: false,
      security_function_authorization: false,
      security_smoke: true,
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

  it("does not run browser QA for recipe extraction lab changes", () => {
    const result = evaluateCiPathFilters({
      changedFiles: [
        "lib/server/recipe-extraction-lab/extract.mjs",
        "lib/server/recipe-extraction-lab/prompt.mjs",
        "tests/recipe-loop-local-integrity.test.ts",
      ],
      eventName: "pull_request",
      action: "ready_for_review",
      draft: false,
    });

    expect(result).toEqual({
      code: true,
      dependency_audit: false,
      security_function_authorization: false,
      security_smoke: true,
      smoke: false,
      accessibility: false,
      visual: false,
      lighthouse: false,
      full_regression: false,
      complete_regression_matrix: false,
    });
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
      code: true,
      dependency_audit: true,
      security_function_authorization: true,
      security_smoke: true,
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
      code: true,
      dependency_audit: true,
      security_function_authorization: true,
      security_smoke: true,
      smoke: true,
      accessibility: true,
      visual: true,
      lighthouse: true,
      full_regression: true,
      complete_regression_matrix: true,
    });
  });

  it("skips expensive required-context jobs for docs-only changes but keeps policy-relevant workflow edits in scope", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: ["docs/engineering/git-workflow.md"],
        eventName: "pull_request",
      }),
    ).toMatchObject({
      code: false,
      dependency_audit: false,
      security_function_authorization: false,
      security_smoke: false,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: [".github/workflows/ci.yml"],
        eventName: "pull_request",
      }),
    ).toMatchObject({
      code: true,
      dependency_audit: true,
      security_function_authorization: true,
      security_smoke: true,
    });
  });

  it("runs the isolated security-function gate only for its authorization surface", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: ["supabase/migrations/20260826000000_policy.sql"],
        eventName: "pull_request",
      }),
    ).toMatchObject({
      code: true,
      security_function_authorization: true,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: ["components/home/home-screen.tsx"],
        eventName: "pull_request",
      }).security_function_authorization,
    ).toBe(false);
  });

  it.each(["pull_request", "push"])(
    "treats shared types and hybrid Supabase infrastructure as code on %s",
    (eventName) => {
      for (const changedFile of [
        "types/api.ts",
        "infra/hybrid-supabase/runtime-bootstrap.sql",
        "tsconfig.release.json",
      ]) {
        expect(
          evaluateCiPathFilters({
            changedFiles: [changedFile],
            eventName,
          }).code,
          `${eventName}:${changedFile}`,
        ).toBe(true);
      }
    },
  );

  it.each([
    {
      eventName: "pull_request",
      event: {
        pull_request: {
          base: { ref: "master", sha: "a".repeat(40) },
          head: { sha: "b".repeat(40) },
        },
      },
    },
    {
      eventName: "push",
      event: { before: "a".repeat(40), after: "b".repeat(40) },
    },
  ])("fails closed when $eventName git diff resolution fails", ({ event, eventName }) => {
    const result = runPathFilterCli({ event, eventName, gitExitCode: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed files|git|resolve|diff/iu);
  });

  it.each(["pull_request", "push"])(
    "fails closed when %s event refs are unavailable",
    (eventName) => {
      const event = eventName === "pull_request" ? { pull_request: {} } : {};
      const result = runPathFilterCli({ event, eventName, gitExitCode: 0 });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/event|ref|sha|changed files/iu);
    },
  );

  it.each([
    {
      eventName: "pull_request",
      event: {
        pull_request: {
          base: { ref: "master", sha: "a".repeat(40) },
          head: { sha: "b".repeat(40) },
        },
      },
    },
    {
      eventName: "push",
      event: { before: "a".repeat(40), after: "b".repeat(40) },
    },
  ])("accepts a genuine empty diff on $eventName", ({ event, eventName }) => {
    const result = runPathFilterCli({ event, eventName, gitExitCode: 0 });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("ci-path-filter changed files: (none)");
    expect(result.stdout).toContain("code=false");
  });

  it.each(["schedule", "workflow_dispatch"])(
    "keeps %s as a full run without git diff resolution",
    (eventName) => {
      const result = runPathFilterCli({ event: {}, eventName, gitExitCode: 1 });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("code=true");
      expect(result.stdout).toContain("dependency_audit=true");
    },
  );

  it("does not fall back to a tip-only diff when a valid push range fails", () => {
    const result = runPathFilterCli({
      event: { before: "a".repeat(40), after: "b".repeat(40) },
      eventName: "push",
      gitScript: [
        "#!/bin/sh",
        "if [ \"$1\" = \"diff\" ]; then exit 1; fi",
        "if [ \"$1\" = \"diff-tree\" ]; then exit 0; fi",
        "exit 2",
        "",
      ].join("\n"),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/push|range|changed files|git|diff/iu);
  });

  it("forces every heavy scope on for a zero-before new-ref push", () => {
    const result = runPathFilterCli({
      event: { before: "0".repeat(40), after: "b".repeat(40) },
      eventName: "push",
      gitExitCode: 1,
    });

    expect(result.status, result.stderr).toBe(0);
    for (const output of [
      "code",
      "dependency_audit",
      "security_function_authorization",
      "security_smoke",
      "smoke",
      "accessibility",
      "visual",
      "lighthouse",
      "full_regression",
      "complete_regression_matrix",
    ]) {
      expect(result.stdout, output).toContain(`${output}=true`);
    }
  });
});
