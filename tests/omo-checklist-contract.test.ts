import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveChecklistIds,
  resolveOwnedChecklistItems,
  resolveReviewChecklistItems,
} from "../scripts/lib/omo-checklist-contract.mjs";

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-checklist-contract-"));
  mkdirSync(join(rootDir, "docs", "workpacks", "06-test-slice"), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "workpacks", "06-test-slice", "README.md"),
    [
      "# 06-test-slice",
      "",
      "## Design Status",
      "",
      "- [x] 임시 UI (temporary)",
      "- [ ] 리뷰 대기 (pending-review)",
      "- [ ] 확정 (confirmed)",
      "- [ ] N/A",
      "",
      "## Delivery Checklist",
      "- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->",
      "- [ ] UI 연결 <!-- omo:id=delivery-ui;stage=4;scope=frontend;review=5,6 -->",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", "06-test-slice", "acceptance.md"),
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      "- [x] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=accept-backend-api;stage=2;scope=backend;review=3,6 -->",
      "- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->",
      "",
      "## Automation Split",
      "",
      "### Manual Only",
      "- [ ] 실제 OAuth smoke",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", "06-test-slice", "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: "06-test-slice",
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

  return rootDir;
}

describe("OMO checklist contract parser", () => {
  it("activates metadata mode and resolves stage ownership plus review scopes", () => {
    const rootDir = createFixture();
    const contract = readWorkpackChecklistContract({
      rootDir,
      slice: "06-test-slice",
    });

    expect(isChecklistContractActive(contract)).toBe(true);
    expect(contract.errors).toEqual([]);
    expect(resolveChecklistIds(resolveOwnedChecklistItems(contract, 2))).toEqual([
      "delivery-backend-contract",
      "accept-backend-api",
    ]);
    expect(resolveChecklistIds(resolveOwnedChecklistItems(contract, 4))).toEqual([
      "delivery-ui",
      "accept-loading",
    ]);
    expect(resolveChecklistIds(resolveReviewChecklistItems(contract, 3))).toEqual([
      "delivery-backend-contract",
      "accept-backend-api",
    ]);
    expect(resolveChecklistIds(resolveReviewChecklistItems(contract, 5))).toEqual([
      "delivery-ui",
      "accept-loading",
    ]);
    expect(resolveChecklistIds(resolveReviewChecklistItems(contract, 6))).toEqual([
      "delivery-backend-contract",
      "delivery-ui",
      "accept-backend-api",
      "accept-loading",
    ]);
  });

  it("reports malformed metadata under the active contract", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-checklist-contract-invalid-"));
    mkdirSync(join(rootDir, "docs", "workpacks", "06-test-slice"), { recursive: true });
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "README.md"),
      [
        "# 06-test-slice",
        "",
        "## Delivery Checklist",
        "- [ ] 백엔드 계약 고정 <!-- omo:id=broken -->",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "acceptance.md"),
      "# Acceptance Checklist\n",
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "automation-spec.json"),
      "{}\n",
    );

    const contract = readWorkpackChecklistContract({
      rootDir,
      slice: "06-test-slice",
    });

    expect(contract.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("stage must be 2 or 4"),
        }),
      ]),
    );
  });

  it("parses checklist metadata even when rationale text follows the metadata comment", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-checklist-contract-rationale-"));
    mkdirSync(join(rootDir, "docs", "workpacks", "06-test-slice"), { recursive: true });
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "README.md"),
      [
        "# 06-test-slice",
        "",
        "## Delivery Checklist",
        "- [x] UI 연결 <!-- omo:id=delivery-ui;stage=4;scope=frontend;review=5,6 --> rationale follows here",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "acceptance.md"),
      [
        "# Acceptance Checklist",
        "",
        "## Happy Path",
        "- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 --> N/A per baseline",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "06-test-slice", "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: "06-test-slice",
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

    const contract = readWorkpackChecklistContract({
      rootDir,
      slice: "06-test-slice",
    });

    expect(contract.errors).toEqual([]);
    expect(resolveChecklistIds(resolveOwnedChecklistItems(contract, 4))).toEqual([
      "delivery-ui",
      "accept-loading",
    ]);
  });
});
