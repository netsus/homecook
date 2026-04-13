import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateKnownShape } from "../scripts/lib/validate-workflow-v2.mjs";
import {
  detectBookkeepingOverlap,
  detectOmoPromotionRisk,
  detectPlaywrightWorkflowGap,
  runMetaHarnessAudit,
} from "../scripts/lib/meta-harness-auditor.mjs";

function write(rootDir: string, relativePath: string, content: string) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function readJson(rootDir: string, relativePath: string) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
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
  write(rootDir, ".opencode/README.md", "# opencode\n");
  write(rootDir, "scripts/lib/omo-reconcile.mjs", "export function reconcile() {}\n");
  write(rootDir, "lib/api/planner.ts", "export const planner = true;\n");
  write(rootDir, "lib/server/user-bootstrap.ts", "export const bootstrap = true;\n");

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

  it("writes a valid audit bundle", () => {
    const rootDir = createAuditFixture();
    tempDirs.push(rootDir);

    const outputDir = ".artifacts/meta-harness-auditor/test-bundle";
    const result = runMetaHarnessAudit({
      rootDir,
      outputDir,
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
    const auditContextSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/audit-context.schema.json",
    );
    const promotionSchema = readProjectJson(
      "docs/engineering/meta-harness-auditor/promotion-readiness.schema.json",
    );

    const findings = readJson(rootDir, `${outputDir}/findings.json`);
    const auditContext = readJson(rootDir, `${outputDir}/audit-context.json`);
    const scorecard = readJson(rootDir, `${outputDir}/scorecard.json`);
    const remediationPlan = readJson(rootDir, `${outputDir}/remediation-plan.json`);
    const promotionReadiness = readJson(rootDir, `${outputDir}/promotion-readiness.json`);
    const report = readFileSync(path.join(rootDir, outputDir, "report.md"), "utf8");

    expect(validateKnownShape(findingsSchema, findings)).toEqual([]);
    expect(validateKnownShape(auditContextSchema, auditContext)).toEqual([]);
    expect(validateKnownShape(scorecardSchema, scorecard)).toEqual([]);
    expect(validateKnownShape(remediationSchema, remediationPlan)).toEqual([]);
    expect(validateKnownShape(promotionSchema, promotionReadiness)).toEqual([]);
    expect(promotionReadiness.verdict).toBe("not-ready");
    expect(auditContext.run_mode).toBe("audit-only");
    expect(report).toContain("Meta Harness Audit Report");
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
