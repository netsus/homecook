import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateRealSmokePresence } from "../scripts/lib/validate-real-smoke-presence.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixture({
  externalSmokes = [],
}: {
  externalSmokes?: string[];
} = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "real-smoke-presence-"));

  writeFixtureFile(
    rootDir,
    "docs/workpacks/06-recipe-to-planner/automation-spec.json",
    JSON.stringify(
      {
        slice_id: "06-recipe-to-planner",
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: [],
          invariants: [],
          verify_commands: ["pnpm verify:backend"],
          required_test_targets: [],
        },
        frontend: {
          required_routes: ["/planner"],
          required_states: ["loading", "empty", "error"],
          playwright_projects: ["desktop-chrome"],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: "not-required",
            anchor_screens: [],
            required_screens: [],
            generator_required: false,
            critic_required: false,
            authority_required: false,
            stage4_evidence_requirements: [],
            authority_report_paths: [],
          },
        },
        external_smokes: externalSmokes,
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );

  return rootDir;
}

function buildActualVerificationSection({
  verifier,
  environment,
  scope,
  result,
}: {
  verifier: string;
  environment: string;
  scope: string;
  result: string;
}) {
  return [
    "## Summary",
    "- validator test",
    "## Actual Verification",
    `- verifier: ${verifier}`,
    `- environment: ${environment}`,
    `- scope: ${scope}`,
    `- result: ${result}`,
    "- 남은 manual/live 확인: 없음",
  ].join("\n");
}

describe("real smoke presence validator", () => {
  it("skips branches outside backend/frontend ready-for-review or closeout", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/governance-real-smoke",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("skips slices that do not declare external_smokes", () => {
    const rootDir = createFixture();

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/be-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("fails non-draft backend PRs when required smoke evidence is omitted", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/be-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildActualVerificationSection({
          verifier: "Codex",
          environment: "`N/A`",
          scope: "`N/A`",
          result: "N/A (real smoke not run)",
        }),
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("cannot be omitted"),
        }),
      ]),
    );
  });

  it("passes when Actual Verification records local Supabase/bootstrap smoke evidence", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase", "pnpm dev:demo"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildActualVerificationSection({
          verifier: "Claude",
          environment: "local Supabase + seeded demo account",
          scope: "frontend bootstrap smoke via `pnpm dev:local-supabase` and `pnpm dev:demo`",
          result: "pass (recipe_books bootstrap row and planner data loaded)",
        }),
      },
    });

    expect(results).toEqual([]);
  });

  it("fails when Actual Verification does not reference the declared external_smokes entries", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase", "pnpm test:e2e:oauth"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildActualVerificationSection({
          verifier: "Claude",
          environment: "local Supabase + seeded demo account",
          scope: "frontend bootstrap smoke",
          result: "pass (planner bootstrap data loaded)",
        }),
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("external_smokes"),
        }),
      ]),
    );
  });

  it("uses SOURCE_PR_BODY for closeout branches when present", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
        PR_BODY: buildActualVerificationSection({
          verifier: "OMO supervisor",
          environment: "closeout worktree",
          scope: "bookkeeping reconcile",
          result: "pass",
        }),
        SOURCE_PR_BODY: buildActualVerificationSection({
          verifier: "Codex",
          environment: "local Supabase",
          scope: "backend real DB smoke for bootstrap readiness",
          result: "pass (seed/bootstrap smoke complete)",
        }),
      },
    });

    expect(results).toEqual([]);
  });

  it("fails closeout branches without source smoke evidence", () => {
    const rootDir = createFixture({
      externalSmokes: ["pnpm dev:local-supabase"],
    });

    const results = validateRealSmokePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
        PR_BODY: buildActualVerificationSection({
          verifier: "OMO supervisor",
          environment: "closeout worktree",
          scope: "bookkeeping reconcile",
          result: "pass",
        }),
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("real smoke evidence"),
        }),
      ]),
    );
  });
});
