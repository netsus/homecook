import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";
import { writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

const DEFAULT_VISUAL_EVIDENCE_REFS = [
  "ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png",
  "ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png",
];
const RUNTIME_EVIDENCE_REF = "ui/designs/evidence/authority/runtime-focus.json";
const MANIFEST_REF = "ui/designs/evidence/authority/manifest.json";

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

function validateNonDraftFixture(rootDir: string) {
  return validateAuthorityEvidencePresence({
    rootDir,
    env: {
      ...process.env,
      BRANCH_NAME: "feature/fe-06-recipe-to-planner",
      PR_IS_DRAFT: "false",
    },
  });
}

function createMixedArtifactFixture({
  artifactRequirements = [RUNTIME_EVIDENCE_REF, MANIFEST_REF],
  reportArtifactRefs = artifactRequirements,
  existingArtifactRefs = artifactRequirements,
  runtimeArtifactRefs = null,
}: {
  artifactRequirements?: string[];
  reportArtifactRefs?: string[];
  existingArtifactRefs?: string[];
  runtimeArtifactRefs?: string[] | null;
} = {}) {
  const reportRefs = [...DEFAULT_VISUAL_EVIDENCE_REFS, ...reportArtifactRefs];
  return createFixture({
    stage4EvidenceRequirements: [...DEFAULT_VISUAL_EVIDENCE_REFS, ...artifactRequirements],
    authorityReportContents: buildAuthorityReport({
      evidenceLines: reportRefs.map((ref) => `\`${ref}\``),
    }),
    evidenceFiles: [...DEFAULT_VISUAL_EVIDENCE_REFS, ...existingArtifactRefs],
    runtimeDesignAuthority:
      runtimeArtifactRefs === null
        ? null
        : {
            status: "reviewed",
            ui_risk: "anchor-extension",
            authority_required: true,
            authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
            evidence_artifact_refs: [...DEFAULT_VISUAL_EVIDENCE_REFS, ...runtimeArtifactRefs],
            reviewed_screen_ids: ["RECIPE_DETAIL"],
            authority_verdict: "pass",
            source_stage: 5,
          },
  });
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

    const results = validateNonDraftFixture(rootDir);

    expect(results).toEqual([]);
  });

  it("fails non-draft frontend PRs when an authority report file is missing", () => {
    const rootDir = createFixture({
      authorityReportPaths: ["ui/designs/authority/MISSING-authority.md"],
      evidenceFiles: [],
      createAuthorityReportFiles: false,
    });

    const results = validateNonDraftFixture(rootDir);

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

    const results = validateNonDraftFixture(rootDir);

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

    const results = validateNonDraftFixture(rootDir);

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

    const results = validateNonDraftFixture(rootDir);

    expect(results).toEqual([]);
  });

  it("passes mixed visual and local artifact requirements when report and runtime refs stay in sync", () => {
    const rootDir = createMixedArtifactFixture({
      runtimeArtifactRefs: [RUNTIME_EVIDENCE_REF, MANIFEST_REF],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results).toEqual([]);
  });

  it("fails with the exact required artifact when a JSON ref is absent from the report", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [RUNTIME_EVIDENCE_REF],
      reportArtifactRefs: [],
      existingArtifactRefs: [RUNTIME_EVIDENCE_REF],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Authority reports are missing required artifact evidence: ${RUNTIME_EVIDENCE_REF}`,
    });
  });

  it("fails with the exact required artifact when a referenced JSON file is missing", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [RUNTIME_EVIDENCE_REF],
      existingArtifactRefs: [],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Required authority evidence artifact file is missing: ${RUNTIME_EVIDENCE_REF}`,
    });
  });

  it("rejects a directory used as a required JSON artifact", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [MANIFEST_REF],
      existingArtifactRefs: [],
    });
    mkdirSync(join(rootDir, MANIFEST_REF), { recursive: true });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Required authority evidence artifact must be a regular repo-local JSON file: ${MANIFEST_REF}`,
    });
  });

  it("rejects a final symlink to an external JSON artifact without exposing its contents", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [MANIFEST_REF],
      existingArtifactRefs: [],
    });
    const externalDir = mkdtempSync(join(tmpdir(), "authority-evidence-external-"));
    const externalArtifact = join(externalDir, "manifest.json");
    writeFileSync(externalArtifact, "EXTERNAL_SECRET_MUST_NOT_APPEAR");
    symlinkSync(externalArtifact, join(rootDir, MANIFEST_REF));

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Required authority evidence artifact must be a regular repo-local JSON file: ${MANIFEST_REF}`,
    });
    expect(JSON.stringify(results)).not.toContain("EXTERNAL_SECRET_MUST_NOT_APPEAR");
  });

  it("rejects a JSON artifact whose parent symlink escapes the repository", () => {
    const escapedArtifactRef = "ui/designs/evidence/external/manifest.json";
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [escapedArtifactRef],
      existingArtifactRefs: [],
    });
    const externalDir = mkdtempSync(join(tmpdir(), "authority-evidence-parent-external-"));
    writeFileSync(join(externalDir, "manifest.json"), "external evidence");
    symlinkSync(externalDir, join(rootDir, "ui/designs/evidence/external"), "dir");

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Required authority evidence artifact must be a regular repo-local JSON file: ${escapedArtifactRef}`,
    });
  });

  it.each([
    ["ui/designs/evidence/authority/runtime.log", true],
    ["ui/designs/evidence/authority/secret.pem", true],
    ["ui/designs/evidence/authority/validator.ts", true],
    ["../outside/manifest.json", false],
  ])("rejects unsupported artifact requirement %s", (artifactRef, createFile) => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [artifactRef],
      existingArtifactRefs: createFile ? [artifactRef] : [],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Unsupported authority evidence artifact requirement; expected a repo-relative .json path: ${artifactRef}`,
    });
  });

  it("treats screenshot-suffixed mobile evidence requirements as default and narrow aliases", () => {
    const rootDir = createFixture({
      stage4EvidenceRequirements: ["mobile-default-screenshot", "mobile-narrow-screenshot"],
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

  it("keeps Figma refs valid for default and narrow visual requirements", () => {
    const rootDir = createFixture({
      authorityReportContents: buildAuthorityReport({
        evidenceLines: [
          "https://www.figma.com/design/homecook?node-id=mobile-default",
          "https://www.figma.com/design/homecook?node-id=mobile-narrow",
        ],
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

    expect(results).toEqual([]);
  });

  it("does not let an external JSON URL satisfy a required local artifact path", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [MANIFEST_REF],
      reportArtifactRefs: ["https://example.com/manifest.json"],
      existingArtifactRefs: [MANIFEST_REF],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: "authority_report_paths:evidence",
      message: `Authority reports are missing required artifact evidence: ${MANIFEST_REF}`,
    });
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

  it("fails with the exact required artifact when runtime evidence omits a required JSON ref", () => {
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [RUNTIME_EVIDENCE_REF],
      runtimeArtifactRefs: [],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toContainEqual({
      path: expect.stringContaining(".opencode/omo-runtime/06-recipe-to-planner.json"),
      message: `runtime design_authority.evidence_artifact_refs is missing required artifact evidence: ${RUNTIME_EVIDENCE_REF}`,
    });
  });

  it("fails when a runtime JSON ref does not exactly match the authority report artifact ref", () => {
    const mismatchedRuntimeEvidence = "ui/designs/evidence/authority/runtime-focus-alt.json";
    const rootDir = createMixedArtifactFixture({
      artifactRequirements: [RUNTIME_EVIDENCE_REF],
      existingArtifactRefs: [RUNTIME_EVIDENCE_REF, mismatchedRuntimeEvidence],
      runtimeArtifactRefs: [mismatchedRuntimeEvidence],
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: `runtime design_authority.evidence_artifact_refs must be represented in the authority report > evidence block: ${mismatchedRuntimeEvidence}`,
        }),
        expect.objectContaining({
          message: `runtime design_authority.evidence_artifact_refs is missing required artifact evidence: ${RUNTIME_EVIDENCE_REF}`,
        }),
      ]),
    );
  });

  it("keeps runtime visual refs as a report subset when reports satisfy every visual requirement", () => {
    const desktopVisualRef =
      "ui/designs/evidence/authority/RECIPE_DETAIL-desktop-state.png";
    const reportVisualRefs = [...DEFAULT_VISUAL_EVIDENCE_REFS, desktopVisualRef];
    const rootDir = createFixture({
      stage4EvidenceRequirements: reportVisualRefs,
      authorityReportContents: buildAuthorityReport({
        evidenceLines: reportVisualRefs.map((ref) => `\`${ref}\``),
      }),
      evidenceFiles: reportVisualRefs,
      runtimeDesignAuthority: {
        status: "reviewed",
        ui_risk: "anchor-extension",
        authority_required: true,
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        evidence_artifact_refs: DEFAULT_VISUAL_EVIDENCE_REFS,
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_verdict: "pass",
        source_stage: 5,
      },
    });

    const results = validateNonDraftFixture(rootDir);

    expect(results).toEqual([]);
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

  it("keeps slice8 design and implementation authority evidence valid across both reports", () => {
    const automationSpec = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "docs/workpacks/cooked-batch-weight-ledger/automation-spec.json",
        ),
        "utf8",
      ),
    );

    expect.soft(
      automationSpec.frontend.design_authority.authority_report_paths,
    ).toEqual([
      "ui/designs/authority/COOK_MODE-cooked-batch-weight-ledger-authority.md",
      "docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-final-product-design-authority-post-typography-rereview.md",
    ]);

    const results = validateAuthorityEvidencePresence({
      rootDir: process.cwd(),
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-cooked-batch-weight-ledger",
        PR_IS_DRAFT: "false",
      },
    });

    expect.soft(results).toEqual([]);
  });
});
