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

  it("validates doc gate repair stage results", () => {
    const result = validateStageResult(
      2,
      {
        result: "done",
        summary_markdown: "doc gate repaired",
        commit: { subject: "docs: repair workpack" },
        pr: { title: "docs: repair workpack", body_markdown: "body" },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["docs/workpacks/06-foo/README.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["docs/workpacks/06-foo/README.md"],
        tests_touched: [],
        artifacts_written: [".artifacts/doc-gate.log"],
        resolved_doc_finding_ids: ["doc-gate-missing-section-goal"],
        contested_doc_fix_ids: [],
        rebuttals: [],
      },
      {
        subphase: "doc_gate_repair",
      },
    ) as {
      resolved_doc_finding_ids: string[];
      contested_doc_fix_ids: string[];
    };

    expect(result.resolved_doc_finding_ids).toEqual(["doc-gate-missing-section-goal"]);
    expect(result.contested_doc_fix_ids).toEqual([]);
  });

  it("rejects overlapping resolved and contested doc gate ids", () => {
    expect(() =>
      validateStageResult(
        2,
        {
          result: "done",
          summary_markdown: "doc gate repaired",
          commit: { subject: "docs: repair workpack" },
          pr: { title: "docs: repair workpack", body_markdown: "body" },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["docs/workpacks/06-foo/README.md"],
            endpoints: [],
            routes: [],
            states: [],
            invariants: [],
          },
          changed_files: ["docs/workpacks/06-foo/README.md"],
          tests_touched: [],
          artifacts_written: [".artifacts/doc-gate.log"],
          resolved_doc_finding_ids: ["doc-gate-missing-section-goal"],
          contested_doc_fix_ids: ["doc-gate-missing-section-goal"],
          rebuttals: [
            {
              fix_id: "doc-gate-missing-section-goal",
              rationale_markdown: "Already satisfied.",
              evidence_refs: ["docs/workpacks/06-foo/README.md"],
            },
          ],
        },
        {
          subphase: "doc_gate_repair",
        },
      ),
    ).toThrow(/resolved_doc_finding_ids and stageResult.contested_doc_fix_ids must be disjoint/);
  });

  it("validates doc gate review stage results", () => {
    const result = validateStageResult(
      2,
      {
        decision: "request_changes",
        body_markdown: "Fix the workpack wording.",
        route_back_stage: 2,
        approved_head_sha: null,
        review_scope: {
          scope: "doc_gate",
          checklist_ids: [],
        },
        reviewed_doc_finding_ids: ["doc-gate-missing-section-goal"],
        required_doc_fix_ids: ["doc-gate-missing-section-goal"],
        waived_doc_fix_ids: [],
        findings: [
          {
            file: "docs/workpacks/06-foo/README.md",
            line_hint: 1,
            severity: "major",
            category: "contract",
            issue: "Goal section is incomplete.",
            suggestion: "Lock the user-facing goal in the README.",
          },
        ],
      },
      {
        subphase: "doc_gate_review",
      },
    ) as {
      reviewed_doc_finding_ids: string[];
      required_doc_fix_ids: string[];
    };

    expect(result.reviewed_doc_finding_ids).toEqual(["doc-gate-missing-section-goal"]);
    expect(result.required_doc_fix_ids).toEqual(["doc-gate-missing-section-goal"]);
  });

  it("normalizes doc gate repair rebuttal alias fields into the canonical schema", () => {
    const result = validateStageResult(
      2,
      {
        result: "done",
        summary_markdown: "doc gate repaired",
        commit: { subject: "docs: repair workpack" },
        pr: { title: "docs: repair workpack", body_markdown: "body" },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["docs/workpacks/06-foo/README.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["docs/workpacks/06-foo/README.md"],
        tests_touched: [],
        artifacts_written: [".artifacts/doc-gate.log"],
        resolved_doc_finding_ids: [],
        contested_doc_fix_ids: ["doc-gate-missing-section-goal"],
        rebuttals: [
          {
            fixId: "doc-gate-missing-section-goal",
            rationale: "Already satisfied.",
            evidenceRefs: ["docs/workpacks/06-foo/README.md"],
          },
        ],
      },
      {
        subphase: "doc_gate_repair",
      },
    ) as {
      rebuttals: Array<{ fix_id: string; rationale_markdown: string; evidence_refs: string[] }>;
    };

    expect(result.rebuttals).toEqual([
      {
        fix_id: "doc-gate-missing-section-goal",
        rationale_markdown: "Already satisfied.",
        evidence_refs: ["docs/workpacks/06-foo/README.md"],
      },
    ]);
  });

  it("accepts doc gate review findings written with doc-gate alias fields", () => {
    const result = validateStageResult(
      2,
      {
        decision: "request_changes",
        body_markdown: "Fix the workpack wording.",
        route_back_stage: 2,
        approved_head_sha: null,
        review_scope: {
          scope: "doc_gate",
          checklist_ids: [],
        },
        reviewed_doc_finding_ids: ["doc-gate-missing-section-goal"],
        required_doc_fix_ids: ["doc-gate-missing-section-goal"],
        waived_doc_fix_ids: [],
        findings: [
          {
            evidence_paths: ["docs/workpacks/06-foo/README.md"],
            severity: "major",
            category: "contract",
            message: "Goal section is incomplete.",
            remediation_hint: "Lock the user-facing goal in the README.",
          },
        ],
      },
      {
        subphase: "doc_gate_review",
      },
    ) as {
      findings: Array<{ file: string; issue: string; suggestion: string }>;
    };

    expect(result.findings).toEqual([
      {
        file: "docs/workpacks/06-foo/README.md",
        line_hint: null,
        severity: "major",
        category: "contract",
        issue: "Goal section is incomplete.",
        suggestion: "Lock the user-facing goal in the README.",
      },
    ]);
  });

  it("validates authority_precheck stage results", () => {
    const result = validateStageResult(
      4,
      {
        result: "done",
        summary_markdown: "authority precheck complete",
        commit: { subject: "feat: frontend" },
        pr: { title: "feat: frontend", body_markdown: "body" },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["app/example/page.tsx"],
          endpoints: [],
          routes: ["/example"],
          states: ["loading"],
          invariants: [],
        },
        changed_files: ["app/example/page.tsx"],
        tests_touched: ["tests/example.frontend.test.ts"],
        artifacts_written: ["ui/designs/authority/EXAMPLE-authority.md"],
        checklist_updates: [
          {
            id: "delivery-ui",
            status: "checked",
            evidence_refs: ["pnpm verify:frontend"],
          },
        ],
        contested_fix_ids: [],
        rebuttals: [],
        authority_verdict: "conditional-pass",
        reviewed_screen_ids: ["EXAMPLE"],
        authority_report_paths: ["ui/designs/authority/EXAMPLE-authority.md"],
        evidence_artifact_refs: ["ui/designs/evidence/example/EXAMPLE-mobile.png"],
        blocker_count: 0,
        major_count: 1,
        minor_count: 0,
      },
      {
        strictExtendedContract: true,
        subphase: "authority_precheck",
      },
    ) as {
      authority_verdict: string;
      reviewed_screen_ids: string[];
      authority_report_paths: string[];
    };

    expect(result.authority_verdict).toBe("conditional-pass");
    expect(result.reviewed_screen_ids).toEqual(["EXAMPLE"]);
    expect(result.authority_report_paths).toEqual(["ui/designs/authority/EXAMPLE-authority.md"]);
  });

  it("normalizes authority review metadata for Stage 5", () => {
    const result = validateStageResult(
      5,
      {
        decision: "request_changes",
        body_markdown: "authority follow-up needed",
        route_back_stage: 4,
        approved_head_sha: null,
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui"],
        },
        reviewed_checklist_ids: ["delivery-ui"],
        required_fix_ids: ["delivery-ui"],
        waived_fix_ids: [],
        authority_verdict: "hold",
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        blocker_count: 1,
        major_count: 0,
        minor_count: 0,
        findings: [
          {
            file: "app/example.tsx",
            severity: "major",
            category: "logic",
            issue: "CTA hierarchy is weak",
            suggestion: "Strengthen the primary action hierarchy",
          },
        ],
      },
      {
        strictExtendedContract: true,
      },
    ) as {
      authority_verdict: string;
      blocker_count: number | null;
      reviewed_screen_ids: string[];
    };

    expect(result.authority_verdict).toBe("hold");
    expect(result.blocker_count).toBe(1);
    expect(result.reviewed_screen_ids).toEqual(["RECIPE_DETAIL"]);
  });

  it("accepts final_authority_gate review results with authority fields", () => {
    const result = validateStageResult(
      5,
      {
        decision: "approve",
        body_markdown: "final authority approved",
        route_back_stage: null,
        approved_head_sha: "abc123",
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui"],
        },
        reviewed_checklist_ids: ["delivery-ui"],
        required_fix_ids: [],
        waived_fix_ids: [],
        authority_verdict: "pass",
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
      },
      {
        strictExtendedContract: true,
        subphase: "final_authority_gate",
      },
    ) as {
      authority_verdict: string | null;
      approved_head_sha: string | null;
    };

    expect(result.authority_verdict).toBe("pass");
    expect(result.approved_head_sha).toBe("abc123");
  });
});
