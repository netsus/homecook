import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  normalizeAutomationSpec,
  readAutomationSpec,
  resolveAutonomousSlicePolicy,
  resolveStageAutomationConfig,
} from "../scripts/lib/omo-automation-spec.mjs";

describe("OMO automation spec", () => {
  it("normalizes frontend design authority settings", () => {
    const spec = normalizeAutomationSpec({
      slice_id: "06-recipe-to-planner",
      execution_mode: "autonomous",
      risk_class: "medium",
      merge_policy: "conditional-auto",
      backend: {
        required_endpoints: ["POST /api/v1/planner"],
        invariants: ["owner-authorization"],
        verify_commands: ["pnpm verify:backend"],
        required_test_targets: ["tests/example.backend.test.ts"],
      },
      frontend: {
        required_routes: ["/recipes/[id]"],
        required_states: ["loading", "error"],
        playwright_projects: ["mobile-chrome"],
        artifact_assertions: ["playwright-report"],
        design_authority: {
          ui_risk: "anchor-extension",
          anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          required_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          generator_required: true,
          critic_required: true,
          authority_required: true,
          stage4_evidence_requirements: ["mobile-default", "mobile-narrow"],
          authority_report_paths: ["ui/designs/authority/PLANNER_WEEK-authority.md"],
        },
      },
      external_smokes: ["true"],
      blocked_conditions: [],
      max_fix_rounds: {
        backend: 2,
        frontend: 2,
      },
    });

    expect(spec.frontend.design_authority).toMatchObject({
      ui_risk: "anchor-extension",
      authority_required: true,
      required_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
    });
  });

  it("defaults missing design authority to not-required", () => {
    const spec = normalizeAutomationSpec({
      slice_id: "05-planner-week-core",
      execution_mode: "autonomous",
      risk_class: "medium",
      merge_policy: "conditional-auto",
      backend: {
        required_endpoints: ["GET /planner"],
        invariants: [],
        verify_commands: [],
        required_test_targets: [],
      },
      frontend: {
        required_routes: ["/planner"],
        required_states: ["loading"],
        playwright_projects: [],
        artifact_assertions: [],
      },
      external_smokes: ["true"],
      blocked_conditions: [],
      max_fix_rounds: {
        backend: 2,
        frontend: 2,
      },
    });

    expect(spec.frontend.design_authority).toEqual({
      ui_risk: "not-required",
      anchor_screens: [],
      required_screens: [],
      generator_required: false,
      critic_required: false,
      authority_required: false,
      stage4_evidence_requirements: [],
      authority_report_paths: [],
    });
  });

  it("accepts frontend verify_commands and exposes them in stage 4 config", () => {
    const spec = normalizeAutomationSpec({
      slice_id: "08b-meal-add-books-pantry",
      execution_mode: "autonomous",
      risk_class: "low",
      merge_policy: "conditional-auto",
      backend: {
        required_endpoints: ["POST /api/v1/meals"],
        invariants: ["owner-authorization"],
        verify_commands: ["pnpm verify:backend"],
        required_test_targets: ["tests/08b.backend.test.ts"],
      },
      frontend: {
        required_routes: ["/planner"],
        required_states: ["loading", "empty", "error", "unauthorized"],
        verify_commands: ["pnpm exec vitest run tests/e2e/slice-08b.spec.ts"],
        playwright_projects: ["mobile-chrome"],
        artifact_assertions: ["playwright-report"],
      },
      external_smokes: ["pnpm dev:local-supabase"],
      blocked_conditions: [],
      max_fix_rounds: {
        backend: 2,
        frontend: 2,
      },
    });

    expect(resolveStageAutomationConfig({ automationSpec: spec, stage: 4 })).toMatchObject({
      stage: "frontend",
      verify_commands: ["pnpm exec vitest run tests/e2e/slice-08b.spec.ts"],
    });
  });

  it("falls back to worktree automation spec when the root workpack copy is missing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-automation-spec-"));
    mkdirSync(
      join(rootDir, ".worktrees", "08b-meal-add-books-pantry", "docs", "workpacks", "08b-meal-add-books-pantry"),
      { recursive: true },
    );
    writeFileSync(
      join(
        rootDir,
        ".worktrees",
        "08b-meal-add-books-pantry",
        "docs",
        "workpacks",
        "08b-meal-add-books-pantry",
        "automation-spec.json",
      ),
      JSON.stringify(
        {
          slice_id: "08b-meal-add-books-pantry",
          execution_mode: "autonomous",
          risk_class: "low",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: ["POST /api/v1/meals"],
            invariants: ["owner-authorization"],
            verify_commands: ["pnpm verify:backend"],
            required_test_targets: ["tests/08b.backend.test.ts"],
          },
          frontend: {
            required_routes: ["/planner"],
            required_states: ["loading", "empty", "error", "unauthorized"],
            verify_commands: ["pnpm exec playwright test tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            playwright_projects: ["mobile-chrome"],
            artifact_assertions: ["playwright-report"],
          },
          external_smokes: ["pnpm dev:local-supabase"],
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

    const { automationSpec, automationSpecPath } = readAutomationSpec({
      rootDir,
      slice: "08b-meal-add-books-pantry",
      required: true,
    });

    expect(automationSpecPath).toContain(".worktrees/08b-meal-add-books-pantry/");
    expect(automationSpec?.frontend.verify_commands).toEqual([
      "pnpm exec playwright test tests/e2e/slice-08b-meal-add-books-pantry.spec.ts",
    ]);
  });

  it("disables autonomous merge for anchor-extension UI risk", () => {
    const policy = resolveAutonomousSlicePolicy({
      workItem: {
        change_type: "product",
        preset: "vertical-slice-strict",
        workflow: {
          execution_mode: "autonomous",
          merge_policy: "conditional-auto",
        },
      },
      automationSpec: {
        execution_mode: "autonomous",
        merge_policy: "conditional-auto",
        risk_class: "medium",
        frontend: {
          design_authority: {
            ui_risk: "anchor-extension",
          },
        },
      },
    });

    expect(policy).toMatchObject({
      autonomous: true,
      mergeEligible: false,
      reason: "manual_merge_required",
      uiRisk: "anchor-extension",
    });
  });
});
