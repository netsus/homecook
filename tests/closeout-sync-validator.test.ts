import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";

function metadata(id: string, stage: 2 | 4, scope: "backend" | "frontend" | "shared", review: string) {
  return `<!-- omo:id=${id};stage=${stage};scope=${scope};review=${review} -->`;
}

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function buildReadme({
  designStatus = "temporary",
  authorityStatus = "not-required",
  visualArtifact = "not-required",
  deliveryItems,
}: {
  designStatus?: "temporary" | "pending-review" | "confirmed" | "N/A";
  authorityStatus?: string;
  visualArtifact?: string;
  deliveryItems: Array<{ checked: boolean; text: string; meta?: string }>;
}) {
  return [
    "# Slice: 05-planner-week-core",
    "",
    "## Design Authority",
    "",
    "- UI risk: `not-required`",
    "- Anchor screen dependency: 없음",
    `- Visual artifact: ${visualArtifact}`,
    `- Authority status: \`${authorityStatus}\``,
    "- Notes: none",
    "",
    "## Design Status",
    "",
    `- [${designStatus === "temporary" ? "x" : " "}] 임시 UI (temporary)`,
    `- [${designStatus === "pending-review" ? "x" : " "}] 리뷰 대기 (pending-review)`,
    `- [${designStatus === "confirmed" ? "x" : " "}] 확정 (confirmed)`,
    `- [${designStatus === "N/A" ? "x" : " "}] N/A`,
    "",
    "## Delivery Checklist",
    ...deliveryItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}${item.meta ? ` ${item.meta}` : ""}`),
    "",
  ].join("\n");
}

function buildAcceptance({
  generalItems,
  manualOnlyItems = [],
}: {
  generalItems: Array<{ checked: boolean; text: string; meta?: string }>;
  manualOnlyItems?: Array<{ checked: boolean; text: string }>;
}) {
  return [
    "# Acceptance Checklist",
    "",
    "## Happy Path",
    ...generalItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}${item.meta ? ` ${item.meta}` : ""}`),
    "",
    "## Automation Split",
    "",
    "### Manual Only",
    ...manualOnlyItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`),
    "",
  ].join("\n");
}

function createFixture({
  roadmapStatus,
  designStatus,
  authorityStatus = "not-required",
  visualArtifact = "not-required",
  deliveryItems,
  acceptanceItems,
  manualOnlyItems = [],
  withAutomationSpec = false,
  authorityRequired = false,
  authorityReportPaths = [] as string[],
}: {
  roadmapStatus: string;
  designStatus: "temporary" | "pending-review" | "confirmed" | "N/A";
  authorityStatus?: string;
  visualArtifact?: string;
  deliveryItems: Array<{ checked: boolean; text: string; meta?: string }>;
  acceptanceItems: Array<{ checked: boolean; text: string; meta?: string }>;
  manualOnlyItems?: Array<{ checked: boolean; text: string }>;
  withAutomationSpec?: boolean;
  authorityRequired?: boolean;
  authorityReportPaths?: string[];
}) {
  const rootDir = mkdtempSync(join(tmpdir(), "closeout-sync-"));

  writeFixtureFile(
    rootDir,
    "docs/workpacks/README.md",
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`05-planner-week-core\` | ${roadmapStatus} | planner |`,
    ].join("\n"),
  );
  writeFixtureFile(
    rootDir,
    "docs/workpacks/05-planner-week-core/README.md",
    buildReadme({
      designStatus,
      authorityStatus,
      visualArtifact,
      deliveryItems,
    }),
  );
  writeFixtureFile(
    rootDir,
    "docs/workpacks/05-planner-week-core/acceptance.md",
    buildAcceptance({
      generalItems: acceptanceItems,
      manualOnlyItems,
    }),
  );

  if (withAutomationSpec) {
    writeFixtureFile(
      rootDir,
      "docs/workpacks/05-planner-week-core/automation-spec.json",
      JSON.stringify(
        {
          slice_id: "05-planner-week-core",
          execution_mode: "autonomous",
          risk_class: "medium",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: [],
            invariants: [],
            verify_commands: [],
            required_test_targets: [],
          },
          frontend: {
            required_routes: [],
            required_states: [],
            playwright_projects: [],
            artifact_assertions: [],
            design_authority: {
              ui_risk: authorityRequired ? "anchor-extension" : "not-required",
              anchor_screens: authorityRequired ? ["RECIPE_DETAIL"] : [],
              required_screens: authorityRequired ? ["RECIPE_DETAIL"] : [],
              generator_required: authorityRequired,
              critic_required: authorityRequired,
              authority_required: authorityRequired,
              stage4_evidence_requirements: authorityRequired ? ["mobile-default"] : [],
              authority_report_paths: authorityReportPaths,
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
  }

  return rootDir;
}

describe("closeout sync validator", () => {
  it("does not enforce strict closeout on draft frontend PRs", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "temporary",
      deliveryItems: [{ checked: false, text: "UI 연결" }],
      acceptanceItems: [{ checked: false, text: "대표 사용자 흐름이 정상 동작한다" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-05-planner-week-core",
        PR_IS_DRAFT: "true",
      },
      changedFiles: [],
    });

    expect(results).toEqual([]);
  });

  it("fails non-draft frontend PRs with temporary design status and open closeout items", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "temporary",
      deliveryItems: [{ checked: false, text: "UI 연결" }],
      acceptanceItems: [{ checked: false, text: "대표 사용자 흐름이 정상 동작한다" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Design Status"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Delivery Checklist item"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Acceptance item outside Manual Only"),
        }),
      ]),
    );
  });

  it("fails changed merged slices with unchecked acceptance items outside Manual Only", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: false, text: "대표 사용자 흐름이 정상 동작한다" }],
      manualOnlyItems: [{ checked: false, text: "실제 OAuth smoke" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/README.md"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "closeout-sync:05-planner-week-core",
        errors: [
          expect.objectContaining({
            message: expect.stringContaining("Acceptance item outside Manual Only"),
          }),
        ],
      }),
    ]);
  });

  it("ignores unchecked Manual Only items when merged slice closeout is otherwise complete", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
      manualOnlyItems: [{ checked: false, text: "실제 OAuth smoke" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/acceptance.md"],
    });

    expect(results).toEqual([]);
  });

  it("accepts ready-for-review frontend PRs when closeout state is synced", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
      manualOnlyItems: [{ checked: false, text: "실제 OAuth smoke" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results).toEqual([]);
  });

  it("enforces Stage 2-owned checklist items for non-draft backend PRs under the metadata contract", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "temporary",
      withAutomationSpec: true,
      deliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "frontend", "5,6"),
        },
      ],
      acceptanceItems: [
        {
          checked: false,
          text: "API 응답 형식이 { success, data, error }를 따른다",
          meta: metadata("accept-backend-api", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "loading 상태가 있다",
          meta: metadata("accept-loading", 4, "frontend", "5,6"),
        },
      ],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/be-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Stage 2-owned checklist item must be checked"),
        }),
      ]),
    );
  });

  it("enforces Stage 4-owned checklist items and pending-review design status for metadata-contract frontend PRs", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "temporary",
      withAutomationSpec: true,
      deliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "frontend", "5,6"),
        },
      ],
      acceptanceItems: [
        {
          checked: true,
          text: "API 응답 형식이 { success, data, error }를 따른다",
          meta: metadata("accept-backend-api", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "loading 상태가 있다",
          meta: metadata("accept-loading", 4, "frontend", "5,6"),
        },
      ],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Design Status 'pending-review'"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Stage 4-owned checklist item must be checked"),
        }),
      ]),
    );
  });

  it("enforces all non-Manual checklist items at merge closeout for metadata-contract slices", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      withAutomationSpec: true,
      deliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "frontend", "5,6"),
        },
      ],
      acceptanceItems: [
        {
          checked: true,
          text: "API 응답 형식이 { success, data, error }를 따른다",
          meta: metadata("accept-backend-api", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "loading 상태가 있다",
          meta: metadata("accept-loading", 4, "frontend", "5,6"),
        },
      ],
      manualOnlyItems: [{ checked: false, text: "실제 OAuth smoke" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/README.md"],
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Checklist item outside Manual Only must be checked before merge closeout"),
        }),
      ]),
    );
  });

  it("treats waived metadata items as closed for metadata-contract merge closeout", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      withAutomationSpec: true,
      deliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: `${metadata("delivery-ui", 4, "frontend", "5,6").replace("-->", ";waived=true;waived_by=claude;waived_stage=6;waived_reason=rebuttal_accepted -->")}`,
        },
      ],
      acceptanceItems: [
        {
          checked: true,
          text: "API 응답 형식이 { success, data, error }를 따른다",
          meta: metadata("accept-backend-api", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "loading 상태가 있다",
          meta: `${metadata("accept-loading", 4, "frontend", "5,6").replace("-->", ";waived=true;waived_by=claude;waived_stage=6;waived_reason=rebuttal_accepted -->")}`,
        },
      ],
      manualOnlyItems: [{ checked: false, text: "실제 OAuth smoke" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/README.md"],
    });

    expect(results).toEqual([]);
  });

  it("fails merged closeout when authority-required slices are not marked reviewed", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "required",
      visualArtifact: "ui/designs/evidence/05/PLANNER_WEEK-mobile.png",
      withAutomationSpec: true,
      authorityRequired: true,
      authorityReportPaths: ["ui/designs/authority/PLANNER_WEEK-authority.md"],
      deliveryItems: [{ checked: true, text: "UI 연결", meta: metadata("delivery-ui", 4, "frontend", "5,6") }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다", meta: metadata("accept-loading", 4, "frontend", "5,6") }],
    });
    writeFixtureFile(
      rootDir,
      "ui/designs/authority/PLANNER_WEEK-authority.md",
      "# Authority\n- verdict: `pass`\n",
    );

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/README.md"],
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Design Authority status 'reviewed'"),
        }),
      ]),
    );
  });

  it("fails merged closeout when authority verdict is not pass", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      visualArtifact: "ui/designs/evidence/05/PLANNER_WEEK-mobile.png",
      withAutomationSpec: true,
      authorityRequired: true,
      authorityReportPaths: ["ui/designs/authority/PLANNER_WEEK-authority.md"],
      deliveryItems: [{ checked: true, text: "UI 연결", meta: metadata("delivery-ui", 4, "frontend", "5,6") }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다", meta: metadata("accept-loading", 4, "frontend", "5,6") }],
    });
    writeFixtureFile(
      rootDir,
      "ui/designs/authority/PLANNER_WEEK-authority.md",
      "# Authority\n- verdict: conditional-pass\n",
    );

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/05-planner-week-core/README.md"],
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("final authority verdict 'pass'"),
        }),
      ]),
    );
  });
});
