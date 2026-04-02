import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function buildReadme({
  designStatus = "temporary",
  deliveryItems,
}: {
  designStatus?: "temporary" | "pending-review" | "confirmed" | "N/A";
  deliveryItems: Array<{ checked: boolean; text: string }>;
}) {
  return [
    "# Slice: 05-planner-week-core",
    "",
    "## Design Status",
    "",
    `- [${designStatus === "temporary" ? "x" : " "}] 임시 UI (temporary)`,
    `- [${designStatus === "pending-review" ? "x" : " "}] 리뷰 대기 (pending-review)`,
    `- [${designStatus === "confirmed" ? "x" : " "}] 확정 (confirmed)`,
    `- [${designStatus === "N/A" ? "x" : " "}] N/A`,
    "",
    "## Delivery Checklist",
    ...deliveryItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`),
    "",
  ].join("\n");
}

function buildAcceptance({
  generalItems,
  manualOnlyItems = [],
}: {
  generalItems: Array<{ checked: boolean; text: string }>;
  manualOnlyItems?: Array<{ checked: boolean; text: string }>;
}) {
  return [
    "# Acceptance Checklist",
    "",
    "## Happy Path",
    ...generalItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`),
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
  deliveryItems,
  acceptanceItems,
  manualOnlyItems = [],
}: {
  roadmapStatus: string;
  designStatus: "temporary" | "pending-review" | "confirmed" | "N/A";
  deliveryItems: Array<{ checked: boolean; text: string }>;
  acceptanceItems: Array<{ checked: boolean; text: string }>;
  manualOnlyItems?: Array<{ checked: boolean; text: string }>;
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
});
