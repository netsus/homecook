import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateKnownShape } from "../scripts/lib/validate-workflow-v2.mjs";
import {
  detectBookkeepingOverlap,
  detectOmoPromotionRisk,
  detectPlaywrightWorkflowGap,
  resolveFixArgs,
  runMetaHarnessAudit,
  runMetaHarnessFix,
} from "../scripts/lib/meta-harness-auditor.mjs";

function write(rootDir: string, relativePath: string, content: string) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function readJson(rootDir: string, relativePath: string) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readJsonAbsolute(absolutePath: string) {
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function readProjectJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), relativePath), "utf8"));
}

function createAuditFixture() {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "meta-harness-auditor-"));

  write(rootDir, "AGENTS.md", "# agents\n");
  write(rootDir, "docs/sync/CURRENT_SOURCE_OF_TRUTH.md", "# source of truth\n");
  write(rootDir, "docs/workpacks/README.md", "# workpacks\n");
  write(rootDir, "docs/workpacks/03-recipe-like/README.md", "# slice 03\n");
  write(rootDir, "docs/workpacks/04-recipe-save/README.md", "# slice 04\n");
  write(
    rootDir,
    "docs/engineering/slice-workflow.md",
    [
      "# Slice Workflow",
      "",
      "## Delivery Checklist",
      "",
      "- roadmap status",
      "- acceptance",
      "- PR 본문",
      "",
    ].join("\n"),
  );
  write(rootDir, "docs/engineering/agent-workflow-overview.md", "# Agent Workflow Overview\n");
  write(
    rootDir,
    "docs/engineering/workflow-v2/README.md",
    [
      "# Workflow v2",
      "",
      "일반 product slice 구현은 계속 v1 절차를 따른다.",
      "tracked state는 .workflow-v2/ 아래에서 관리한다.",
      "closeout drift 복구를 위해 omo:reconcile 경로를 제공한다.",
      "high-risk slice는 manual merge handoff로 종료한다.",
      "live smoke는 on-demand로 실행한다.",
      "scheduler 운영 기준 플랫폼은 우선 macOS `launchd`다.",
      "",
    ].join("\n"),
  );
  write(
    rootDir,
    "docs/engineering/workflow-v2/promotion-readiness.md",
    [
      "# OMO Promotion Readiness",
      "",
      "## Required Gates",
      "",
      "## Pilot Gates",
      "",
      "authority-required-ui",
      "external-smoke",
      "bugfix-patch",
      ".workflow-v2/promotion-evidence.json",
      "slice06",
      "",
    ].join("\n"),
  );
  write(
    rootDir,
    "docs/engineering/workflow-v2/omo-base.md",
    [
      "# OMO base",
      "",
      "기준은 여전히 v1 문서와 `AGENTS.md`다.",
      "",
    ].join("\n"),
  );
  write(
    rootDir,
    ".github/workflows/playwright.yml",
    [
      "on:",
      "  pull_request:",
      "    paths:",
      "      - 'app/**'",
      "      - 'lib/*.ts'",
      "      - 'lib/auth/**'",
      "",
    ].join("\n"),
  );
  write(rootDir, ".workflow-v2/status.json", '{"items":[]}\n');
  write(
    rootDir,
    ".workflow-v2/promotion-evidence.json",
    JSON.stringify(
      {
        version: 1,
        target: "OMO v2",
        updated_at: "2026-04-14T00:00:00.000Z",
        canonical_policy: "v1",
        execution_mode: "promotion-candidate",
        documentation_gates: [
          {
            id: "promotion-checklist",
            status: "pass",
            notes: "exists",
            evidence_refs: ["docs/engineering/workflow-v2/promotion-readiness.md"],
          },
        ],
        operational_gates: [
          {
            id: "manual-handoff-policy",
            status: "partial",
            notes: "manual handoff remains",
            evidence_refs: ["docs/engineering/workflow-v2/README.md"],
          },
        ],
        pilot_lanes: [
          {
            id: "authority-required-ui",
            label: "Authority lane",
            status: "in_progress",
            required: true,
            notes: "slice06 running",
            workpack_refs: ["docs/workpacks/06-recipe-to-planner/README.md"],
            checkpoint_refs: ["stage4-ready-for-review"],
          },
          {
            id: "external-smoke",
            label: "External smoke lane",
            status: "pending",
            required: true,
            notes: "waiting",
            workpack_refs: [],
            checkpoint_refs: [],
          },
          {
            id: "bugfix-patch",
            label: "Bugfix lane",
            status: "pending",
            required: true,
            notes: "waiting",
            workpack_refs: [],
            checkpoint_refs: [],
          },
        ],
        promotion_gate: {
          status: "not-ready",
          blockers: ["pilot lanes missing"],
          next_review_trigger: "after slice06 stage4",
          notes: "blocked",
        },
      },
      null,
      2,
    ),
  );
  write(rootDir, ".opencode/README.md", "# opencode\n");
  write(rootDir, "scripts/lib/omo-reconcile.mjs", "export function reconcile() {}\n");
  write(rootDir, "lib/api/planner.ts", "export const planner = true;\n");
  write(rootDir, "lib/server/user-bootstrap.ts", "export const bootstrap = true;\n");
  write(
    rootDir,
    "docs/engineering/meta-harness-auditor/finding-registry.json",
    JSON.stringify(
      {
        version: 1,
        findings: [
          {
            id: "H-CI-001",
            title: "Playwright workflow path coverage gap",
            severity: "important",
            priority: "P0",
            bucket: "CI",
            owner: "docs-governance",
            safe_to_autofix: true,
            approval_required: false,
            stability: "stable",
            introduced_in: "C2",
          },
          {
            id: "H-GOV-001",
            title: "Bookkeeping source-of-truth overlap between v1 and v2",
            severity: "important",
            priority: "P1",
            bucket: "workflow",
            owner: "docs-governance",
            safe_to_autofix: false,
            approval_required: true,
            stability: "stable",
            introduced_in: "C2",
          },
          {
            id: "H-OMO-001",
            title: "OMO v2 is not yet default promotion-ready",
            severity: "important",
            priority: "P2",
            bucket: "promotion-blocker",
            owner: "workflow-v2",
            safe_to_autofix: false,
            approval_required: true,
            stability: "stable",
            introduced_in: "C2",
          },
        ],
      },
      null,
      2,
    ),
  );
  write(
    rootDir,
    "docs/engineering/meta-harness-auditor/cadence.json",
    JSON.stringify(
      {
        version: 1,
        events: [
          {
            id: "manual-ad-hoc",
            label: "Manual Ad Hoc Audit",
            trigger: "Manual trigger",
            default_run_mode: "audit-only",
            recommended_scope: "Current repo",
            notes: "fallback",
          },
          {
            id: "slice-checkpoint",
            label: "In-Flight Slice Checkpoint",
            trigger: "Stage checkpoint",
            default_run_mode: "audit-only",
            recommended_scope: "Checkpoint evidence",
            notes: "pilot",
          },
        ],
      },
      null,
      2,
    ),
  );

  return rootDir;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("meta-harness-auditor", () => {
  it("detects the Playwright workflow path coverage gap", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    const findings = detectPlaywrightWorkflowGap({ rootDir });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("H-CI-001");
    expect(findings[0]?.priority).toBe("P0");
  });

  it("does not report the Playwright gap when lib/** is covered", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    write(
      rootDir,
      ".github/workflows/playwright.yml",
      [
        "on:",
        "  pull_request:",
        "    paths:",
        "      - 'app/**'",
        "      - 'lib/**'",
        "",
      ].join("\n"),
    );

    expect(detectPlaywrightWorkflowGap({ rootDir })).toHaveLength(0);
  });

  it("detects bookkeeping overlap and OMO promotion risk", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    const governanceFindings = detectBookkeepingOverlap({ rootDir });
    const promotionFindings = detectOmoPromotionRisk({ rootDir });

    expect(governanceFindings.map((finding) => finding.id)).toContain("H-GOV-001");
    expect(promotionFindings.map((finding) => finding.id)).toContain("H-OMO-001");
  });

  it("clears H-GOV-001 once the authority matrix and shared helper wiring exist", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    write(
      rootDir,
      "docs/engineering/bookkeeping-authority-matrix.md",
      [
        "# Bookkeeping Authority Matrix",
        "",
        "- `docs/workpacks/README.md`",
        "- `.workflow-v2/status.json`",
        "- `PR body closeout evidence`",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "docs/engineering/slice-workflow.md",
      [
        "# Slice Workflow",
        "",
        "Delivery Checklist",
        "roadmap status",
        "acceptance",
        "PR 본문",
        "docs/engineering/bookkeeping-authority-matrix.md",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "docs/engineering/agent-workflow-overview.md",
      [
        "# Agent Workflow Overview",
        "",
        "docs/engineering/bookkeeping-authority-matrix.md",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "docs/engineering/workflow-v2/README.md",
      [
        "# Workflow v2",
        "",
        "tracked state는 .workflow-v2/ 아래에서 관리한다.",
        "closeout drift 복구를 위해 omo:reconcile 경로를 제공한다.",
        "docs/engineering/bookkeeping-authority-matrix.md",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "scripts/lib/bookkeeping-authority.mjs",
      "export const BOOKKEEPING_AUTHORITY_DOC_PATH = 'docs/engineering/bookkeeping-authority-matrix.md';\n",
    );
    write(
      rootDir,
      "scripts/lib/validate-closeout-sync.mjs",
      "import { resolveSliceBookkeepingPaths } from './bookkeeping-authority.mjs';\n",
    );
    write(
      rootDir,
      "scripts/lib/validate-omo-bookkeeping.mjs",
      "import { describeCloseoutWritableSurfaces } from './bookkeeping-authority.mjs';\n",
    );
    write(
      rootDir,
      "scripts/lib/omo-closeout-policy.mjs",
      "export * from './bookkeeping-authority.mjs';\n",
    );
    write(
      rootDir,
      "scripts/lib/omo-reconcile.mjs",
      "import { describeCloseoutWritableScopeForPr } from './bookkeeping-authority.mjs';\n",
    );

    expect(detectBookkeepingOverlap({ rootDir })).toEqual([]);
  });

  it("clears H-OMO-001 once promotion evidence is ready and docs stop advertising pilot-only operation", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    write(
      rootDir,
      "docs/engineering/workflow-v2/README.md",
      [
        "# Workflow v2",
        "",
        "Workflow v2 is the canonical default path.",
        "Promotion evidence is tracked in .workflow-v2/promotion-evidence.json.",
        "manual handoff는 `high-risk` / `anchor-extension` / `exceptional recovery`에 한정된 예외 경로다.",
        "provider wait와 budget issue는 기본적으로 `pause + scheduled resume`를 사용한다.",
        "live smoke는 일반 PR CI 전체 강제가 아니라 `external_smokes[]`가 선언된 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.",
        "live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "docs/engineering/workflow-v2/promotion-readiness.md",
      [
        "# OMO Promotion Readiness",
        "",
        "#### `manual-handoff-policy`",
        "manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.",
        "provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.",
        "",
        "#### `live-smoke-standard`",
        "live smoke는 `external_smokes[]`가 비어 있지 않은 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.",
        "canonical evidence는 source PR의 `Actual Verification`이며, closeout preflight는 같은 evidence를 재사용한다.",
        "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox rehearsal 중 더 이른 쪽을 따른다.",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      ".opencode/README.md",
      [
        "# opencode",
        "",
        "## Manual Handoff Standard",
        "provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.",
        "handoff bundle은 아래를 반드시 포함한다.",
        "",
        "## Live Smoke Standard",
        "canonical evidence는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
        "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox repo rehearsal 중 더 이른 쪽을 따른다.",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      "docs/engineering/workflow-v2/omo-base.md",
      [
        "# OMO base",
        "",
        "OMO runs the default workflow stack.",
        "",
      ].join("\n"),
    );
    write(
      rootDir,
      ".workflow-v2/promotion-evidence.json",
      JSON.stringify(
        {
          version: 1,
          target: "OMO v2",
          updated_at: "2026-04-14T00:00:00.000Z",
          canonical_policy: "v2",
          execution_mode: "default",
          documentation_gates: [
            {
              id: "promotion-checklist",
              status: "pass",
              notes: "done",
              evidence_refs: ["docs/engineering/workflow-v2/promotion-readiness.md"],
            },
          ],
          operational_gates: [
            {
              id: "manual-handoff-policy",
              status: "pass",
              notes: "done",
              evidence_refs: ["docs/engineering/workflow-v2/README.md"],
            },
            {
              id: "live-smoke-standard",
              status: "pass",
              notes: "done",
              evidence_refs: [".opencode/README.md"],
            },
            {
              id: "scheduler-standard",
              status: "pass",
              notes: "done",
              evidence_refs: [".opencode/README.md"],
            },
          ],
          pilot_lanes: [
            {
              id: "authority-required-ui",
              label: "Authority lane",
              status: "pass",
              required: true,
              notes: "done",
              workpack_refs: ["docs/workpacks/06-recipe-to-planner/README.md"],
              checkpoint_refs: ["stage2-complete", "stage4-ready-for-review", "stage6-closeout"],
            },
            {
              id: "external-smoke",
              label: "External smoke lane",
              status: "pass",
              required: true,
              notes: "done",
              workpack_refs: [],
              checkpoint_refs: [],
            },
            {
              id: "bugfix-patch",
              label: "Bugfix lane",
              status: "pass",
              required: true,
              notes: "done",
              workpack_refs: [],
              checkpoint_refs: [],
            },
          ],
          promotion_gate: {
            status: "ready",
            blockers: [],
            next_review_trigger: "none",
            notes: "ready",
          },
        },
        null,
        2,
      ),
    );

    expect(detectOmoPromotionRisk({ rootDir })).toEqual([]);
  });

  it("writes a valid audit bundle", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    const result = runMetaHarnessAudit({
      rootDir,
    });

    const findingsSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/findings.schema.json",
    );
    const scorecardSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/scorecard.schema.json",
    );
    const remediationSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/remediation-plan.schema.json",
    );
    const cadenceSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/cadence.schema.json",
    );
    const findingRegistrySchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/finding-registry.schema.json",
    );
    const auditContextSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/audit-context.schema.json",
    );
    const promotionSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/promotion-readiness.schema.json",
    );

    const findings = readJsonAbsolute(path.join(result.outputDir, "findings.json"));
    const auditContext = readJsonAbsolute(path.join(result.outputDir, "audit-context.json"));
    const scorecard = readJsonAbsolute(path.join(result.outputDir, "scorecard.json"));
    const remediationPlan = readJsonAbsolute(path.join(result.outputDir, "remediation-plan.json"));
    const promotionReadiness = readJsonAbsolute(path.join(result.outputDir, "promotion-readiness.json"));
    const report = readFileSync(path.join(result.outputDir, "report.md"), "utf8");
    const cadenceConfig = readJson(rootDir, "docs/engineering/meta-harness-auditor/cadence.json");
    const findingRegistry = readJson(rootDir, "docs/engineering/meta-harness-auditor/finding-registry.json");

    expect(validateKnownShape(cadenceSchema, cadenceConfig)).toEqual([]);
    expect(validateKnownShape(findingRegistrySchema, findingRegistry)).toEqual([]);
    expect(validateKnownShape(findingsSchema, findings)).toEqual([]);
    expect(validateKnownShape(auditContextSchema, auditContext)).toEqual([]);
    expect(validateKnownShape(scorecardSchema, scorecard)).toEqual([]);
    expect(validateKnownShape(remediationSchema, remediationPlan)).toEqual([]);
    expect(validateKnownShape(promotionSchema, promotionReadiness)).toEqual([]);
    expect(promotionReadiness.verdict).toBe("not-ready");
    expect(auditContext.run_mode).toBe("audit-only");
    expect(auditContext.cadence_event).toBe("manual-ad-hoc");
    expect(report).toContain("Meta Harness Audit Report");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("parses fix-one-finding CLI args", () => {
    expect(
      resolveFixArgs(["--finding", "H-CI-001", "--output-dir", ".artifacts/fix", "--reason", "manual approval"]),
    ).toEqual({
      outputDir: ".artifacts/fix",
      findingId: "H-CI-001",
      reason: "manual approval",
    });
  });

  it("rejects non-safe findings in fix-one-finding mode", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    expect(() => runMetaHarnessFix({ rootDir, findingId: "H-GOV-001" })).toThrow(
      "not eligible for fix-one-finding mode",
    );
  });

  it("rejects unknown finding IDs in fix-one-finding mode", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    expect(() => runMetaHarnessFix({ rootDir, findingId: "H-UNKNOWN-999" })).toThrow(
      "Unknown finding ID",
    );
  });

  it("applies the H-CI-001 autofix and clears the targeted finding", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    const result = runMetaHarnessFix({
      rootDir,
      findingId: "H-CI-001",
    });
    const fixResultSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/fix-result.schema.json",
    );
    const fixResult = readJsonAbsolute(path.join(result.outputDir, "fix-result.json"));
    const workflow = readFileSync(path.join(rootDir, ".github/workflows/playwright.yml"), "utf8");

    expect(validateKnownShape(fixResultSchema, fixResult)).toEqual([]);
    expect(fixResult.status).toBe("applied");
    expect(fixResult.pre_fix_active).toBe(true);
    expect(fixResult.post_fix_active).toBe(false);
    expect(fixResult.changed_files).toContain(".github/workflows/playwright.yml");
    expect(workflow).toContain("lib/**");
    expect(detectPlaywrightWorkflowGap({ rootDir })).toHaveLength(0);
  });

  it("returns noop when a safe finding is already resolved", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    write(
      rootDir,
      ".github/workflows/playwright.yml",
      [
        "on:",
        "  pull_request:",
        "    paths:",
        "      - 'app/**'",
        "      - 'lib/**'",
        "",
      ].join("\n"),
    );

    const result = runMetaHarnessFix({
      rootDir,
      findingId: "H-CI-001",
    });
    const fixResult = readJsonAbsolute(path.join(result.outputDir, "fix-result.json"));

    expect(fixResult.status).toBe("noop");
    expect(fixResult.pre_fix_active).toBe(false);
    expect(fixResult.post_fix_active).toBe(false);
    expect(fixResult.changed_files).toEqual([]);
  });
});
