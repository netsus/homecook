import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";
import { writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function buildAuthorityReport({
  evidenceLines,
  verdict = "pass",
}: {
  evidenceLines: string[];
  verdict?: "pass" | "conditional-pass" | "hold";
}) {
  return [
    "# RECIPE_DETAIL Authority Review",
    "",
    "> 대상 slice: `06-recipe-to-planner`",
    "> evidence:",
    ...evidenceLines.map((line) => `> - ${line}`),
    "> 검토일: 2026-04-13",
    "> 검토자: product-design-authority",
    "",
    "## Verdict",
    "",
    `- verdict: \`${verdict}\``,
    "",
    "## Decision",
    "",
    "- Stage 4 진행 가능 여부: `가능`",
  ].join("\n");
}

function createFixture({
  authorityRequired = true,
  authorityReportPaths = ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
  stage4EvidenceRequirements = ["mobile-default", "mobile-narrow"],
  authorityReportContents = buildAuthorityReport({
    evidenceLines: [
      "`ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png`",
      "`ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png`",
      "design reference: `ui/designs/RECIPE_DETAIL.md`",
    ],
  }),
  evidenceFiles = [
    "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
    "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
  ],
  createAuthorityReportFiles = true,
  runtimeDesignAuthority = null,
}: {
  authorityRequired?: boolean;
  authorityReportPaths?: string[];
  stage4EvidenceRequirements?: string[];
  authorityReportContents?: string;
  evidenceFiles?: string[];
  createAuthorityReportFiles?: boolean;
  runtimeDesignAuthority?: Record<string, unknown> | null;
} = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "authority-evidence-presence-"));

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
            ui_risk: authorityRequired ? "anchor-extension" : "not-required",
            anchor_screens: authorityRequired ? ["RECIPE_DETAIL"] : [],
            required_screens: authorityRequired ? ["RECIPE_DETAIL"] : [],
            generator_required: authorityRequired,
            critic_required: authorityRequired,
            authority_required: authorityRequired,
            stage4_evidence_requirements: stage4EvidenceRequirements,
            authority_report_paths: authorityReportPaths,
          },
        },
        external_smokes: [],
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

  if (createAuthorityReportFiles) {
    for (const reportPath of authorityReportPaths) {
      writeFixtureFile(rootDir, reportPath, authorityReportContents);
    }
  }

  for (const evidenceFile of evidenceFiles) {
    writeFixtureFile(rootDir, evidenceFile, "evidence");
  }

  if (runtimeDesignAuthority) {
    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        slice: "06-recipe-to-planner",
        current_stage: 5,
        active_stage: 5,
        design_authority: runtimeDesignAuthority,
      },
    });
  }

  return rootDir;
}

describe("authority evidence presence validator", () => {
  it("skips branches outside frontend ready-for-review or closeout", () => {
    const rootDir = createFixture();

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/governance-authority-validator",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("skips slices that are not authority-required", () => {
    const rootDir = createFixture({
      authorityRequired: false,
      authorityReportPaths: [],
      stage4EvidenceRequirements: [],
      evidenceFiles: [],
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("fails non-draft frontend PRs when an authority report file is missing", () => {
    const rootDir = createFixture({
      authorityReportPaths: ["ui/designs/authority/MISSING-authority.md"],
      evidenceFiles: [],
      createAuthorityReportFiles: false,
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("authority report file"),
        }),
      ]),
    );
  });

  it("fails when the authority report does not record visual evidence refs for required mobile variants", () => {
    const rootDir = createFixture({
      authorityReportContents: buildAuthorityReport({
        evidenceLines: ["design reference: `ui/designs/RECIPE_DETAIL.md`"],
      }),
      evidenceFiles: [],
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("visual evidence"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("mobile-default"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("mobile-narrow"),
        }),
      ]),
    );
  });

  it("fails when authority reports reference visual evidence files that do not exist", () => {
    const rootDir = createFixture({
      evidenceFiles: [],
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("missing visual evidence file"),
        }),
      ]),
    );
  });

  it("passes when authority reports include existing default and narrow evidence files", () => {
    const rootDir = createFixture();

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("accepts slice-level evidence requirements when they are satisfied across multiple authority reports", () => {
    const rootDir = createFixture({
      authorityReportPaths: [
        "ui/designs/authority/RECIPE_DETAIL-authority.md",
        "ui/designs/authority/PLANNER_WEEK-authority.md",
      ],
      stage4EvidenceRequirements: ["mobile-default", "mobile-narrow", "planner-5-column-mobile"],
      authorityReportContents: buildAuthorityReport({
        evidenceLines: [
          "`ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png`",
          "`ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png`",
        ],
      }),
      evidenceFiles: [
        "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
        "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
        "ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png",
      ],
    });

    writeFixtureFile(
      rootDir,
      "ui/designs/authority/PLANNER_WEEK-authority.md",
      buildAuthorityReport({
        evidenceLines: [
          "`ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png`",
        ],
      }),
    );

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("fails when runtime authority report paths drift from automation-spec authority_report_paths", () => {
    const rootDir = createFixture({
      runtimeDesignAuthority: {
        status: "reviewed",
        ui_risk: "anchor-extension",
        authority_required: true,
        authority_report_paths: ["ui/designs/authority/OTHER-authority.md"],
        evidence_artifact_refs: [
          "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
          "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
        ],
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_verdict: "pass",
        source_stage: 5,
      },
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("runtime design_authority.authority_report_paths"),
        }),
      ]),
    );
  });

  it("fails when runtime evidence refs are not represented in the authority report evidence block", () => {
    const rootDir = createFixture({
      runtimeDesignAuthority: {
        status: "reviewed",
        ui_risk: "anchor-extension",
        authority_required: true,
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        evidence_artifact_refs: [
          "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
          "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
          "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-alt.png",
        ],
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_verdict: "pass",
        source_stage: 5,
      },
      evidenceFiles: [
        "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
        "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
        "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-alt.png",
      ],
    });

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("runtime design_authority.evidence_artifact_refs"),
        }),
      ]),
    );
  });

  it("reuses the same evidence checks for closeout branches", () => {
    const rootDir = createFixture();

    const results = validateAuthorityEvidencePresence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
      },
    });

    expect(results).toEqual([]);
  });

  it("keeps the repo slice06 authority evidence baseline valid for closeout replay", () => {
    const results = validateAuthorityEvidencePresence({
      rootDir: process.cwd(),
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
      },
    });

    expect(results).toEqual([]);
  });
});
