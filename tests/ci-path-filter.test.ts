import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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
  it("resolves the same push scope from a checkout containing only the classifier", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-sparse-scope-"));
    temporaryDirectories.push(root);
    const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], { encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.name", "Scope fixture");
    git("config", "user.email", "scope@example.invalid");
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "components"));
    writeFileSync(join(root, "scripts/ci-path-filter.mjs"), readFileSync("scripts/ci-path-filter.mjs"));
    writeFileSync(join(root, "components/page.tsx"), "before");
    git("add", ".");
    git("commit", "-qm", "before");
    const before = git("rev-parse", "HEAD");
    writeFileSync(join(root, "components/page.tsx"), "after");
    git("commit", "-qam", "after");
    const after = git("rev-parse", "HEAD");
    git("sparse-checkout", "set", "--no-cone", "/scripts/ci-path-filter.mjs");
    expect(git("ls-files", "-t").split("\n").filter((line) => line.startsWith("H "))).toEqual(["H scripts/ci-path-filter.mjs"]);
    const eventPath = join(root, ".git", "event.json");
    writeFileSync(eventPath, JSON.stringify({ before, after }));
    const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: eventPath };
    delete env.CI_CHANGED_FILES;
    const output = execFileSync(process.execPath, ["scripts/ci-path-filter.mjs"], { cwd: root, env, encoding: "utf8" });
    const flags = Object.fromEntries(output.split("\n").filter((line) => /^[a-z_]+=(true|false)$/.test(line)).map((line) => {
      const [key, value] = line.split("=");
      return [key, value === "true"];
    }));
    expect(flags).toEqual(evaluateCiPathFilters({ changedFiles: ["components/page.tsx"], eventName: "push" }));
  });

  it("selects product tests only when every changed path is presentation-only on a PR", () => {
    const ui = ["components/home/home-screen.tsx", "public/logo.svg", "app/page.tsx", "app/planner/page.tsx", "app/globals.css"];
    expect(evaluateCiPathFilters({ changedFiles: ui }).product_tests_only).toBe(true);
    for (const path of ["docs/README.md", "AGENTS.md", ".workflow-v2/a.json", ".agents/skills/a/SKILL.md", "unknown-file", "tests/home-screen.test.tsx", "scripts/ci-path-filter.mjs", "lib/server/a.ts", "package.json"]) {
      expect(evaluateCiPathFilters({ changedFiles: [...ui, path] }).product_tests_only, path).toBe(false);
    }
    for (const eventName of ["push", "schedule", "workflow_dispatch"]) {
      expect(evaluateCiPathFilters({ changedFiles: ui, eventName }).product_tests_only).toBe(false);
    }
    expect(evaluateCiPathFilters({ changedFiles: ui, labels: [{ name: "full-ci" }] }).product_tests_only).toBe(false);
    expect(evaluateCiPathFilters({ changedFiles: ui, forceFullRun: true }).product_tests_only).toBe(false);
    expect(evaluateCiPathFilters({ changedFiles: [] }).product_tests_only).toBe(false);
  });

  it("skips nutrition PostgreSQL only for presentation-only PRs", () => {
    for (const path of ["components/home/home-screen.tsx", "public/logo.svg", "app/page.tsx", "app/planner/page.tsx", "app/globals.css"]) {
      expect(evaluateCiPathFilters({ changedFiles: [path, "docs/note.md"] })).toMatchObject({
        code: true, nutrition_postgres: false,
      });
      expect(evaluateCiPathFilters({ changedFiles: [path], eventName: "push" }).nutrition_postgres).toBe(true);
      expect(evaluateCiPathFilters({ changedFiles: [path], labels: ["full-ci"] }).nutrition_postgres).toBe(true);
    }
  });

  it("retains nutrition PostgreSQL for mixed, backend, migration, test, and tooling changes", () => {
    for (const path of ["supabase/migrations/new.sql", "app/api/recipes/route.ts", "lib/server/nutrition.ts", "tests/ingredient-nutrition-postgres.integration.test.ts", "tests/helpers/vitest-worker-temp.ts", "scripts/new-tool.mjs", "types/api.ts", "stores/planner.ts", "hooks/use-recipe.ts", "package.json", "pnpm-lock.yaml", "vitest.config.ts", ".github/workflows/ci.yml", "scripts/ci-path-filter.mjs"]) {
      expect(evaluateCiPathFilters({ changedFiles: ["components/home/home-screen.tsx", path] }).nutrition_postgres, path).toBe(true);
    }
    for (const eventName of ["schedule", "workflow_dispatch"]) {
      expect(evaluateCiPathFilters({ eventName }).nutrition_postgres).toBe(true);
    }
    expect(evaluateCiPathFilters({ forceFullRun: true }).nutrition_postgres).toBe(true);
    expect(evaluateCiPathFilters({ changedFiles: ["docs/note.md"] }).nutrition_postgres).toBe(false);
  });

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

  it("treats beta landing route and marketing components as frontend QA inputs", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: ["app/beta/page.tsx"],
        eventName: "pull_request",
        draft: false,
      }),
    ).toMatchObject({
      accessibility: true,
      lighthouse: true,
      smoke: true,
      visual: true,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: ["components/marketing/marketing-demand-validation-screen.tsx"],
        eventName: "pull_request",
        draft: false,
      }),
    ).toMatchObject({
      accessibility: true,
      smoke: true,
      visual: true,
    });
  });

  it("keeps non-runtime marketing archives, evidence, and unit tests out of browser gates", () => {
    expect(
      evaluateCiPathFilters({
        changedFiles: [
          "ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/docs/design-baseline/3cf3336/00-hero-a.png",
          "docs/marketing/assets/campaign/0aaa282/public/assets/funnel/ads/ad-a-4x5.png",
        ],
        eventName: "pull_request",
        draft: false,
      }),
    ).toEqual({
      code: false,
      nutrition_postgres: false,
      product_tests_only: false,
      dependency_audit: false,
      security_function_authorization: false,
      security_smoke: false,
      smoke: false,
      accessibility: false,
      visual: false,
      lighthouse: false,
      full_regression: false,
      complete_regression_matrix: false,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: [
          "ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png",
        ],
        eventName: "pull_request",
        draft: false,
      }),
    ).toEqual({
      code: false,
      nutrition_postgres: false,
      product_tests_only: false,
      dependency_audit: false,
      security_function_authorization: false,
      security_smoke: false,
      smoke: false,
      accessibility: false,
      visual: false,
      lighthouse: false,
      full_regression: false,
      complete_regression_matrix: false,
    });

    expect(
      evaluateCiPathFilters({
        changedFiles: ["tests/marketing-demand-validation-v2-contract.test.ts"],
        eventName: "pull_request",
        draft: false,
      }),
    ).toMatchObject({
      code: true,
      security_smoke: false,
      smoke: false,
      accessibility: false,
      visual: false,
      lighthouse: false,
      full_regression: false,
    });
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
      nutrition_postgres: true,
      product_tests_only: false,
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
      nutrition_postgres: true,
      product_tests_only: false,
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
      nutrition_postgres: true,
      product_tests_only: false,
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
      nutrition_postgres: false,
      product_tests_only: false,
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
