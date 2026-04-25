import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { applyDocGateWaivedFindings, evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

function writeFixture(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function createDocGateFixture({
  includeDesignAuthority = true,
  includeKeywords = true,
}: {
  includeDesignAuthority?: boolean;
  includeKeywords?: boolean;
}) {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-doc-gate-"));
  const slice = "06-recipe-to-planner";

  writeFixture(
    rootDir,
    `docs/workpacks/${slice}/README.md`,
    [
      `# ${slice}`,
      "",
      "## Goal",
      "- goal",
      "",
      "## Branches",
      "- be",
      "- fe",
      "",
      "## In Scope",
      "- scope",
      "",
      "## Out of Scope",
      "- out",
      "",
      "## Dependencies",
      "- dep",
      "",
      "## Backend First Contract",
      "- contract",
      "",
      "## Frontend Delivery Mode",
      "- loading / empty / error / read-only / unauthorized",
      "",
      ...(includeDesignAuthority
        ? [
            "## Design Authority",
            "- UI risk: `anchor-extension`",
            "- Anchor screen dependency: `RECIPE_DETAIL` / `PLANNER_WEEK`",
            "- Visual artifact: figma://frame/recipe-to-planner",
            "- Authority status: `required`",
            "- Notes: authority planned",
            "",
          ]
        : []),
      "## Design Status",
      "- [x] 임시 UI (temporary)",
      "- [ ] 리뷰 대기 (pending-review)",
      "- [ ] 확정 (confirmed)",
      "- [ ] N/A",
      "",
      "## Source Links",
      "- source",
      "",
      "## QA / Test Data Plan",
      "- qa",
      "",
      "## Key Rules",
      "- rule",
      "",
      "## Primary User Path",
      "1. step",
      "2. step",
      "3. step",
      "",
      "## Delivery Checklist",
      "- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend;stage=2;scope=backend;review=3,6 -->",
      "- [ ] UI 연결 <!-- omo:id=delivery-ui;stage=4;scope=frontend;review=5,6 -->",
      "",
    ].join("\n"),
  );

  writeFixture(
    rootDir,
    `docs/workpacks/${slice}/acceptance.md`,
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      "- [ ] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=accept-backend;stage=2;scope=backend;review=3,6 -->",
      "- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->",
      "",
      "## State / Policy",
      "- state",
      "",
      "## Error / Permission",
      "- error",
      "",
      "## Data Integrity",
      "- integrity",
      "",
      "## Data Setup / Preconditions",
      "- setup",
      "",
      "## Manual QA",
      "- manual",
      "",
      "## Automation Split",
      "### Manual Only",
      "- [ ] live smoke",
      "",
    ].join("\n"),
  );

  writeFixture(
    rootDir,
    `docs/workpacks/${slice}/automation-spec.json`,
    JSON.stringify(
      {
        slice_id: slice,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: ["POST /planner/meals"],
          invariants: [],
          verify_commands: [],
          required_test_targets: ["tests/backend.test.ts"],
        },
        frontend: {
          required_routes: ["/recipes/[id]"],
          required_states: ["loading"],
          playwright_projects: [],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: "anchor-extension",
            anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
            required_screens: ["RECIPE_DETAIL"],
            generator_required: true,
            critic_required: true,
            authority_required: true,
            stage4_evidence_requirements: ["mobile-default", "mobile-narrow"],
            authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          },
        },
        external_smokes: ["true"],
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

  writeFixture(
    rootDir,
    "ui/designs/RECIPE_DETAIL.md",
    includeKeywords
      ? "# RECIPE_DETAIL\nmobile baseline 375\nnarrow 320\nprimary CTA\nscroll containment\nanchor extension\n"
      : "# RECIPE_DETAIL\nbasic layout only\n",
  );
  writeFixture(
    rootDir,
    "ui/designs/critiques/RECIPE_DETAIL-critique.md",
    includeKeywords
      ? "# critique\n375\n320\nprimary CTA\nscroll containment\nRECIPE_DETAIL anchor\n"
      : "# critique\nmissing mobile keywords\n",
  );

  return {
    rootDir,
    slice,
  };
}

describe("OMO doc gate", () => {
  it("passes when authority-required workpack lock is complete", () => {
    const fixture = createDocGateFixture({});

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });

    expect(result.outcome).toBe("pass");
  });

  it("fails when Design Authority section is missing", () => {
    const fixture = createDocGateFixture({
      includeDesignAuthority: false,
    });

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });

    expect(result.outcome).toBe("fixable");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Design Authority"),
        }),
      ]),
    );
  });

  it("fails when mobile UX keywords are missing from design artifacts", () => {
    const fixture = createDocGateFixture({
      includeKeywords: false,
    });

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });

    expect(result.outcome).toBe("fixable");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("mobile baseline"),
        }),
      ]),
    );
  });

  it("guides review=5 remediation only toward Stage 4 frontend-owned checklist items", () => {
    const fixture = createDocGateFixture({});
    const acceptancePath = join(
      fixture.rootDir,
      "docs",
      "workpacks",
      fixture.slice,
      "acceptance.md",
    );
    const readmePath = join(
      fixture.rootDir,
      "docs",
      "workpacks",
      fixture.slice,
      "README.md",
    );

    writeFileSync(
      acceptancePath,
      readFileSync(acceptancePath, "utf8").replaceAll("review=5,6", "review=6"),
    );
    writeFileSync(
      readmePath,
      readFileSync(readmePath, "utf8").replaceAll("review=5,6", "review=6"),
    );

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });

    expect(result.outcome).toBe("fixable");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "doc-gate-missing-review5-scope",
          remediation_hint: expect.stringContaining("scope=shared/backend"),
        }),
      ]),
    );
  });

  it("filters waived findings during pending_recheck recalculation", () => {
    const fixture = createDocGateFixture({
      includeKeywords: false,
    });

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });
    const waivedIds = result.findings.map((finding) => finding.id);

    const filtered = applyDocGateWaivedFindings({
      result,
      waivedFindingIds: waivedIds,
    });

    expect(filtered.outcome).toBe("pass");
    expect(filtered.findings).toEqual([]);
  });

  it("keeps unwaived findings actionable during pending_recheck recalculation", () => {
    const fixture = createDocGateFixture({
      includeKeywords: false,
    });

    const result = evaluateDocGate({
      rootDir: fixture.rootDir,
      slice: fixture.slice,
    });
    const waivedIds = result.findings.slice(0, result.findings.length - 1).map((finding) => finding.id);

    const filtered = applyDocGateWaivedFindings({
      result,
      waivedFindingIds: waivedIds,
    });

    expect(filtered.outcome).toBe("fixable");
    expect(filtered.findings).toHaveLength(1);
    expect(filtered.findings[0]?.id).toBe(result.findings.at(-1)?.id);
  });
});
