import { describe, expect, it } from "vitest";

import { validateStageResult } from "../scripts/lib/omo-stage-result.mjs";

describe("OMO stage-result contract", () => {
  it("requires extended code-stage fields when strictExtendedContract is enabled", () => {
    expect(() =>
      validateStageResult(
        2,
        {
          result: "done",
          summary_markdown: "ok",
          commit: {
            subject: "feat: example",
          },
          pr: {
            title: "feat: example",
            body_markdown: "body",
          },
          checks_run: [],
          next_route: "open_pr",
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/claimed_scope|changed_files|tests_touched|artifacts_written|checklist_updates|contested_fix_ids|rebuttals/);
  });

  it("requires extended review-stage fields when strictExtendedContract is enabled", () => {
    expect(() =>
      validateStageResult(
        6,
        {
          decision: "approve",
          body_markdown: "ok",
          route_back_stage: null,
          approved_head_sha: null,
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/review_scope|reviewed_checklist_ids|required_fix_ids|waived_fix_ids/);
  });

  it("requires findings for strict request_changes reviews", () => {
    expect(() =>
      validateStageResult(
        6,
        {
          decision: "request_changes",
          body_markdown: "fix this",
          route_back_stage: 4,
          approved_head_sha: null,
          review_scope: {
            scope: "closeout",
            checklist_ids: ["delivery-ui"],
          },
          reviewed_checklist_ids: ["delivery-ui"],
          required_fix_ids: ["delivery-ui"],
          waived_fix_ids: [],
          findings: [],
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/findings must include at least one entry/);
  });

  it("requires required_fix_ids for strict request_changes reviews", () => {
    expect(() =>
      validateStageResult(
        6,
        {
          decision: "request_changes",
          body_markdown: "fix this",
          route_back_stage: 4,
          approved_head_sha: null,
          review_scope: {
            scope: "closeout",
            checklist_ids: ["delivery-ui"],
          },
          reviewed_checklist_ids: ["delivery-ui"],
          required_fix_ids: [],
          waived_fix_ids: [],
          findings: [
            {
              file: "app/example.tsx",
              severity: "major",
              category: "logic",
              issue: "CTA state is wrong",
              suggestion: "align CTA disabled logic",
            },
          ],
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/required_fix_ids/);
  });

  it("allows strict approve reviews without findings", () => {
    const result = validateStageResult(
      5,
      {
        decision: "approve",
        body_markdown: "approved",
        route_back_stage: null,
        approved_head_sha: null,
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui"],
        },
        reviewed_checklist_ids: ["delivery-ui"],
        required_fix_ids: [],
        waived_fix_ids: [],
      },
      {
        strictExtendedContract: true,
      },
    ) as {
      findings: unknown[];
      required_fix_ids: string[];
    };

    expect(result.findings).toEqual([]);
    expect(result.required_fix_ids).toEqual([]);
  });

  it("rejects strict approve reviews that still include required_fix_ids", () => {
    expect(() =>
      validateStageResult(
        3,
        {
          decision: "approve",
          body_markdown: "approved",
          route_back_stage: null,
          approved_head_sha: "abc123",
          review_scope: {
            scope: "backend",
            checklist_ids: ["delivery-backend-contract"],
          },
          reviewed_checklist_ids: ["delivery-backend-contract"],
          required_fix_ids: ["delivery-backend-contract"],
          waived_fix_ids: [],
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/required_fix_ids must be empty/);
  });

  it("normalizes extended fields when provided", () => {
    const result = validateStageResult(
      4,
      {
        result: "done",
        summary_markdown: "frontend updated",
        commit: {
          subject: "feat: frontend",
        },
        pr: {
          title: "feat: frontend",
          body_markdown: "body",
        },
        checks_run: ["pnpm verify:frontend"],
        next_route: "open_pr",
        claimed_scope: {
          files: ["app/example.tsx"],
          endpoints: [],
          routes: ["/example"],
          states: ["loading"],
          invariants: [],
        },
        changed_files: ["app/example.tsx"],
        tests_touched: ["tests/example.test.ts"],
        artifacts_written: [".artifacts/example.log"],
        checklist_updates: [
          {
            id: "accept-loading",
            status: "checked",
            evidence_refs: ["pnpm verify:frontend"],
          },
        ],
        contested_fix_ids: [],
        rebuttals: [],
      },
      {
        strictExtendedContract: true,
      },
    );

    const codeStageResult = result as {
      claimed_scope: { routes: string[] };
      checklist_updates: Array<{ id: string; status: string; evidence_refs: string[] }>;
      contested_fix_ids: string[];
    };

    expect(codeStageResult.claimed_scope.routes).toEqual(["/example"]);
    expect(codeStageResult.checklist_updates).toEqual([
      {
        id: "accept-loading",
        status: "checked",
        evidence_refs: ["pnpm verify:frontend"],
      },
    ]);
    expect(codeStageResult.contested_fix_ids).toEqual([]);
  });

  it("requires rebuttals to match contested_fix_ids for strict code stages", () => {
    expect(() =>
      validateStageResult(
        2,
        {
          result: "done",
          summary_markdown: "backend updated",
          commit: { subject: "feat: backend" },
          pr: { title: "feat: backend", body_markdown: "body" },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["app/example.ts"],
            endpoints: [],
            routes: [],
            states: [],
            invariants: [],
          },
          changed_files: ["app/example.ts"],
          tests_touched: [],
          artifacts_written: [],
          checklist_updates: [],
          contested_fix_ids: ["delivery-backend-contract"],
          rebuttals: [],
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/rebuttals must exactly match/);
  });

  it("rejects waived_fix_ids outside reviewed_checklist_ids", () => {
    expect(() =>
      validateStageResult(
        6,
        {
          decision: "approve",
          body_markdown: "approved",
          route_back_stage: null,
          approved_head_sha: null,
          review_scope: {
            scope: "closeout",
            checklist_ids: ["delivery-ui"],
          },
          reviewed_checklist_ids: ["delivery-ui"],
          required_fix_ids: [],
          waived_fix_ids: ["delivery-backend-contract"],
        },
        {
          strictExtendedContract: true,
        },
      ),
    ).toThrow(/waived_fix_ids must be a subset/);
  });
});
