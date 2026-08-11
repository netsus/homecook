import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";
import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";

function metadata(id: string, stage: 2 | 4, scope: "backend" | "frontend" | "shared", review: string) {
  return `<!-- omo:id=${id};stage=${stage};scope=${scope};review=${review} -->`;
}

function waivedMetadata(
  id: string,
  stage: 2 | 4,
  scope: "backend" | "frontend" | "shared",
  review: string,
) {
  return `<!-- omo:id=${id};stage=${stage};scope=${scope};review=${review};waived=true;waived_by=claude;waived_stage=3;waived_reason=historical -->`;
}

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function commitFixture(rootDir: string) {
  execFileSync("git", ["init"], { cwd: rootDir });
  execFileSync("git", ["add", "."], { cwd: rootDir });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Closeout Sync Test",
      "-c",
      "user.email=closeout-sync@example.com",
      "commit",
      "-m",
      "test fixture",
    ],
    { cwd: rootDir },
  );
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
  withWorkItem = false,
  closeout = null as Record<string, unknown> | null,
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
  withWorkItem?: boolean;
  closeout?: Record<string, unknown> | null;
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

  if (withWorkItem || closeout) {
    writeFixtureFile(
      rootDir,
      " .workflow-v2/work-items/05-planner-week-core.json".trimStart(),
      JSON.stringify(
        {
          id: "05-planner-week-core",
          ...(closeout ? { closeout } : {}),
        },
        null,
        2,
      ),
    );
  }

  return rootDir;
}

type ChecklistFixtureItem = {
  checked: boolean;
  text: string;
  meta?: string;
};

function createIncrementalBackendFixture({
  baseDeliveryItems,
  currentDeliveryItems,
  baseAcceptanceItems = [],
  currentAcceptanceItems = [],
  currentWithAutomationSpec = true,
}: {
  baseDeliveryItems: ChecklistFixtureItem[];
  currentDeliveryItems: ChecklistFixtureItem[];
  baseAcceptanceItems?: ChecklistFixtureItem[];
  currentAcceptanceItems?: ChecklistFixtureItem[];
  currentWithAutomationSpec?: boolean;
}) {
  const baseRootDir = createFixture({
    roadmapStatus: "docs",
    designStatus: "temporary",
    withAutomationSpec: true,
    deliveryItems: baseDeliveryItems,
    acceptanceItems: baseAcceptanceItems,
  });
  const rootDir = createFixture({
    roadmapStatus: "in-progress",
    designStatus: "temporary",
    withAutomationSpec: currentWithAutomationSpec,
    deliveryItems: currentDeliveryItems,
    acceptanceItems: currentAcceptanceItems,
  });

  return { baseRootDir, rootDir };
}

function validateIncrementalBackendFixture(rootDir: string, baseRootDir: string) {
  return validateCloseoutSync({
    rootDir,
    env: {
      ...process.env,
      BRANCH_NAME: "feature/be-05-planner-week-core",
      PR_IS_DRAFT: "false",
    },
    changedFiles: [],
    readBaseChecklistContract: () =>
      readWorkpackChecklistContract({
        rootDir: baseRootDir,
        slice: "05-planner-week-core",
      }),
  });
}

function expectInvalidBaseChecklistContract(results: ReturnType<typeof validateCloseoutSync>) {
  expect(results[0]?.errors).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("invalid base checklist contract"),
    }),
  ]);
}

describe("closeout sync validator", () => {
  it("enforces Ready validation against the tracked workflow branch mapping", () => {
    const checklistMeta = metadata("mapped-stage2-item", 2, "backend", "3,6");
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "mapped Stage 2 behavior",
          meta: checklistMeta,
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "mapped Stage 2 behavior",
          meta: checklistMeta,
        },
      ],
    });
    writeFixtureFile(
      rootDir,
      ".workflow-v2/status.json",
      JSON.stringify({
        items: [
          {
            id: "05-planner-week-core",
            branch: "feature/be-product-ingredient-link-contract-runtime",
          },
        ],
      }),
    );
    commitFixture(rootDir);

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/be-product-ingredient-link-contract-runtime",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
      readBaseChecklistContract: ({ slice }) =>
        slice === "05-planner-week-core"
          ? readWorkpackChecklistContract({
              rootDir: baseRootDir,
              slice,
            })
          : null,
    });

    expect(results).toEqual([
      {
        name: "closeout-sync:05-planner-week-core",
        errors: [
          expect.objectContaining({
            message:
              "Ready-for-review backend PRs must newly close at least one Stage 2-owned checklist item relative to the base branch.",
          }),
        ],
      },
    ]);
  });

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

  it("fails closed when a valid closeout slug does not resolve to a tracked slice", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-projection-modes",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "closeout-sync:projection-modes",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("projection-modes"),
          }),
        ]),
      }),
    ]);
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
      changedFiles: [".workflow-v2/work-items/05-planner-week-core.json"],
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

  it("fails merged closeout when README and acceptance surfaces drift from canonical closeout projection", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
      closeout: {
        phase: "completed",
        docs_projection: {
          roadmap_lifecycle: "ready_for_review",
          design_status: "pending-review",
          delivery_checklist: "pending",
          design_authority: "pending",
          acceptance: "pending",
          automation_spec_metadata: "synced",
        },
        verification_projection: {
          required_checks: "passed",
          external_smokes: "passed",
          authority_reports: [],
          actual_verification_refs: ["PR Actual Verification"],
        },
        merge_gate_projection: {
          current_head_sha: "abc1234",
          approval_state: "dual_approved",
          all_checks_green: true,
        },
        projection_state: {
          docs_synced_at: "2026-04-21T00:01:00Z",
        },
      },
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: [".workflow-v2/work-items/05-planner-week-core.json"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "closeout-sync:05-planner-week-core",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Roadmap status must match canonical closeout projection"),
          }),
          expect.objectContaining({
            message: expect.stringContaining("Design Status must match canonical closeout projection"),
          }),
          expect.objectContaining({
            message: expect.stringContaining("Delivery Checklist closeout must match canonical closeout projection"),
          }),
          expect.objectContaining({
            message: expect.stringContaining("Design Authority status must match canonical closeout projection"),
          }),
          expect.objectContaining({
            message: expect.stringContaining("Acceptance closeout must match canonical closeout projection"),
          }),
        ]),
      }),
    ]);
  });

  it("fails merged slices that have a tracked work item but no canonical closeout snapshot", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
      withWorkItem: true,
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: [".workflow-v2/work-items/05-planner-week-core.json"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "closeout-sync:05-planner-week-core",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("requires canonical closeout snapshot"),
          }),
        ]),
      }),
    ]);
  });

  it("fails merged closeout when only the roadmap file changes but the canonical projection drifts", () => {
    const rootDir = createFixture({
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      deliveryItems: [{ checked: true, text: "UI 연결" }],
      acceptanceItems: [{ checked: true, text: "대표 사용자 흐름이 정상 동작한다" }],
      closeout: {
        phase: "completed",
        docs_projection: {
          roadmap_lifecycle: "ready_for_review",
          design_status: "pending-review",
          delivery_checklist: "pending",
          design_authority: "pending",
          acceptance: "pending",
          automation_spec_metadata: "synced",
        },
        verification_projection: {
          required_checks: "passed",
          external_smokes: "passed",
          authority_reports: [],
          actual_verification_refs: ["PR Actual Verification"],
        },
        merge_gate_projection: {
          current_head_sha: "abc1234",
          approval_state: "dual_approved",
          all_checks_green: true,
        },
        projection_state: {
          docs_synced_at: "2026-04-21T00:01:00Z",
        },
      },
    });

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/cleanup-workpack-notes",
      },
      changedFiles: ["docs/workpacks/README.md"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "closeout-sync:05-planner-week-core",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Roadmap status must match canonical closeout projection"),
          }),
          expect.objectContaining({
            message: expect.stringContaining("Design Status must match canonical closeout projection"),
          }),
        ]),
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

  it("accepts an incremental backend PR that newly closes part of the Stage 2 checklist", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "후속 백엔드 운영 경로",
          meta: metadata("delivery-backend-operations", 2, "shared", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "frontend", "5,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "후속 백엔드 운영 경로",
          meta: metadata("delivery-backend-operations", 2, "shared", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "frontend", "5,6"),
        },
      ],
      baseAcceptanceItems: [
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
      currentAcceptanceItems: [
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

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results).toEqual([]);
  });

  it("accepts a metadata-only repair of an invalid base checklist while preserving its items", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "shared", "3,5,6"),
        },
        {
          checked: false,
          text: "별도 Stage 2 완료",
          meta: metadata("delivery-stage2-progress", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "UI 연결",
          meta: metadata("delivery-ui", 4, "shared", "6"),
        },
        {
          checked: true,
          text: "별도 Stage 2 완료",
          meta: metadata("delivery-stage2-progress", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results).toEqual([]);
  });

  it.each([
    { baseChecked: false, currentChecked: true, transition: "unchecked to checked" },
    { baseChecked: true, currentChecked: false, transition: "checked to unchecked" },
  ])(
    "rejects an invalid-base metadata repair that changes checked state from $transition",
    ({ baseChecked, currentChecked }) => {
      const { baseRootDir, rootDir } = createIncrementalBackendFixture({
        baseDeliveryItems: [
          {
            checked: baseChecked,
            text: "백엔드 계약 고정",
          },
        ],
        currentDeliveryItems: [
          {
            checked: currentChecked,
            text: "백엔드 계약 고정",
            meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
          },
        ],
      });

      const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

      expectInvalidBaseChecklistContract(results);
    },
  );

  it("rejects an invalid-base metadata repair that also changes checklist text", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "변경된 백엔드 계약",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expectInvalidBaseChecklistContract(results);
  });

  it("rejects a new waiver injected while repairing an unrelated invalid metadata field", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "잘못된 review 조합",
          meta: metadata("delivery-invalid-review", 4, "frontend", "3,5,6"),
        },
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "잘못된 review 조합",
          meta: waivedMetadata("delivery-invalid-review", 4, "frontend", "5,6"),
        },
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expectInvalidBaseChecklistContract(results);
  });

  it.each([
    {
      field: "scope",
      base: metadata("delivery-invalid-review", 4, "frontend", "3,5,6"),
      current: metadata("delivery-invalid-review", 2, "shared", "3,6"),
    },
    {
      field: "stage",
      base: metadata("delivery-invalid-review", 4, "shared", "5,6"),
      current: metadata("delivery-invalid-review", 2, "shared", "3,6"),
    },
    {
      field: "review",
      base: metadata("delivery-invalid-scope", 2, "frontend", "3,6"),
      current: metadata("delivery-invalid-scope", 4, "frontend", "5,6"),
    },
  ])("rejects a valid $field mutation unrelated to the diagnosed base field", ({ base, current }) => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "필드 단위 수리",
          meta: base,
        },
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "필드 단위 수리",
          meta: current,
        },
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expectInvalidBaseChecklistContract(results);
  });

  it.each([
    {
      caseName: "wrong parent heading",
      currentAcceptance: [
        "# Acceptance Checklist",
        "",
        "## Wrong Parent",
        "",
        "### Manual Only",
        "- [ ] 실제 운영 확인",
        "",
      ].join("\n"),
    },
    {
      caseName: "moved item",
      currentAcceptance: [
        "# Acceptance Checklist",
        "",
        "## Manual QA",
        "",
        "### Manual Only",
        "manual evidence remains pending",
        "- [ ] 실제 운영 확인",
        "",
      ].join("\n"),
    },
  ])("rejects Manual Only repair with $caseName", ({ currentAcceptance }) => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });
    writeFixtureFile(
      baseRootDir,
      "docs/workpacks/05-planner-week-core/acceptance.md",
      [
        "# Acceptance Checklist",
        "",
        "## Manual QA",
        "",
        "## Manual Only",
        "- [ ] 실제 운영 확인",
        "",
      ].join("\n"),
    );
    writeFixtureFile(
      rootDir,
      "docs/workpacks/05-planner-week-core/acceptance.md",
      currentAcceptance,
    );

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expectInvalidBaseChecklistContract(results);
  });

  it("accepts a canonical Manual Only heading repair without moving its item", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });
    writeFixtureFile(
      baseRootDir,
      "docs/workpacks/05-planner-week-core/acceptance.md",
      [
        "# Acceptance Checklist",
        "",
        "## Manual QA",
        "",
        "## Manual Only",
        "- [ ] 실제 운영 확인",
        "",
      ].join("\n"),
    );
    writeFixtureFile(
      rootDir,
      "docs/workpacks/05-planner-week-core/acceptance.md",
      [
        "# Acceptance Checklist",
        "",
        "## Manual QA",
        "",
        "### Manual Only",
        "- [ ] 실제 운영 확인",
        "",
      ].join("\n"),
    );

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results).toEqual([]);
  });

  it("fails closed when the invalid base diagnostic is not a repairable metadata field", () => {
    const unknownMetadata = metadata("delivery-unknown", 2, "backend", "3,6").replace(
      " -->",
      ";unexpected=true -->",
    );
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "알 수 없는 metadata",
          meta: unknownMetadata,
        },
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "알 수 없는 metadata",
          meta: metadata("delivery-unknown", 2, "backend", "3,6"),
        },
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expectInvalidBaseChecklistContract(results);
  });

  it("reads the base checklist contract from origin/master in the policy runtime", () => {
    const rootDir = createFixture({
      roadmapStatus: "docs",
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
          text: "후속 백엔드 운영 경로",
          meta: metadata("delivery-backend-operations", 2, "shared", "3,6"),
        },
      ],
      acceptanceItems: [],
    });
    execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
    execFileSync("git", ["config", "user.name", "Closeout Test"], { cwd: rootDir });
    execFileSync("git", ["config", "user.email", "closeout@example.invalid"], { cwd: rootDir });
    execFileSync("git", ["add", "."], { cwd: rootDir });
    execFileSync("git", ["commit", "-m", "seed base checklist"], { cwd: rootDir });
    execFileSync("git", ["update-ref", "refs/remotes/origin/master", "HEAD"], { cwd: rootDir });

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
        "| `05-planner-week-core` | in-progress | planner |",
      ].join("\n"),
    );
    writeFixtureFile(
      rootDir,
      "docs/workpacks/05-planner-week-core/README.md",
      buildReadme({
        designStatus: "temporary",
        deliveryItems: [
          {
            checked: true,
            text: "백엔드 계약 고정",
            meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
          },
          {
            checked: false,
            text: "후속 백엔드 운영 경로",
            meta: metadata("delivery-backend-operations", 2, "shared", "3,6"),
          },
        ],
      }),
    );

    const results = validateCloseoutSync({
      rootDir,
      env: {
        ...process.env,
        BASE_REF: "master",
        BRANCH_NAME: "feature/be-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
    });

    expect(results).toEqual([]);
  });

  it("rejects a backend PR that does not newly close a Stage 2 checklist item", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      baseAcceptanceItems: [
        {
          checked: false,
          text: "후속 백엔드 운영 경로",
          meta: metadata("accept-backend-operations", 2, "shared", "3,6"),
        },
      ],
      currentAcceptanceItems: [
        {
          checked: false,
          text: "후속 백엔드 운영 경로",
          meta: metadata("accept-backend-operations", 2, "shared", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("newly close at least one Stage 2-owned checklist item"),
        }),
      ]),
    );
  });

  it("rejects a backend PR that reopens a previously completed checklist item", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: true,
          text: "기존 백엔드 계약",
          meta: metadata("delivery-existing-backend", 2, "backend", "3,6"),
        },
        {
          checked: false,
          text: "새 백엔드 계약",
          meta: metadata("delivery-new-backend", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "기존 백엔드 계약",
          meta: metadata("delivery-existing-backend", 2, "backend", "3,6"),
        },
        {
          checked: true,
          text: "새 백엔드 계약",
          meta: metadata("delivery-new-backend", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("must not reopen a checklist item"),
        }),
      ]),
    );
  });

  it("rejects checklist contract drift on an incremental backend PR", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "shared", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("must not change checklist contract metadata"),
        }),
      ]),
    );
  });

  it("rejects removing an existing waiver while closing another Stage 2 item", () => {
    const waivedMetadata = metadata(
      "delivery-waived-backend",
      2,
      "backend",
      "3,6",
    ).replace(
      "-->",
      ";waived=true;waived_by=claude;waived_stage=6;waived_reason=rebuttal_accepted -->",
    );
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "검토로 닫힌 백엔드 항목",
          meta: waivedMetadata,
        },
        {
          checked: false,
          text: "새 백엔드 계약",
          meta: metadata("delivery-new-backend", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "검토로 닫힌 백엔드 항목",
          meta: metadata("delivery-waived-backend", 2, "backend", "3,6"),
        },
        {
          checked: true,
          text: "새 백엔드 계약",
          meta: metadata("delivery-new-backend", 2, "backend", "3,6"),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("must not reopen a checklist item"),
        }),
      ]),
    );
  });

  it("treats a newly added valid waiver as incremental Stage 2 closure", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "검토로 닫을 백엔드 항목",
          meta: metadata("delivery-waived-backend", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: false,
          text: "검토로 닫을 백엔드 항목",
          meta: metadata("delivery-waived-backend", 2, "backend", "3,6").replace(
            "-->",
            ";waived=true;waived_by=claude;waived_stage=6;waived_reason=rebuttal_accepted -->",
          ),
        },
      ],
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results).toEqual([]);
  });

  it("rejects removing automation-spec.json to bypass incremental backend validation", () => {
    const { baseRootDir, rootDir } = createIncrementalBackendFixture({
      baseDeliveryItems: [
        {
          checked: false,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentDeliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
      ],
      currentWithAutomationSpec: false,
    });

    const results = validateIncrementalBackendFixture(rootDir, baseRootDir);

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("must keep automation-spec.json"),
        }),
      ]),
    );
  });

  it("does not require authority reports before frontend ready-for-review", () => {
    const baseRootDir = createFixture({
      roadmapStatus: "docs",
      designStatus: "temporary",
      withAutomationSpec: true,
      authorityRequired: true,
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      authorityStatus: "required",
      visualArtifact: "Stage 4 screenshot evidence 예정",
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
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "temporary",
      withAutomationSpec: true,
      authorityRequired: true,
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      authorityStatus: "required",
      visualArtifact: "Stage 4 screenshot evidence 예정",
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
        BRANCH_NAME: "feature/be-05-planner-week-core",
        PR_IS_DRAFT: "false",
      },
      changedFiles: [],
      readBaseChecklistContract: () =>
        readWorkpackChecklistContract({
          rootDir: baseRootDir,
          slice: "05-planner-week-core",
        }),
    });

    expect(results).toEqual([]);
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
          message: expect.stringContaining("Design Status 'pending-review', 'confirmed', or 'N/A'"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Stage 4-owned checklist item must be checked"),
        }),
      ]),
    );
  });

  it("accepts metadata-contract ready-for-review frontend PRs when design status is already confirmed", () => {
    const rootDir = createFixture({
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      withAutomationSpec: true,
      deliveryItems: [
        {
          checked: true,
          text: "백엔드 계약 고정",
          meta: metadata("delivery-backend-contract", 2, "backend", "3,6"),
        },
        {
          checked: true,
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
          checked: true,
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

    expect(results).toEqual([]);
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
