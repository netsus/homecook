import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sliceId = "meal-log-core";
const approvedPlanSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

describe("meal-log-core Stage 1 HOLD repair", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;
  const evidencePath =
    `docs/workpacks/${sliceId}/evidence/2026-08-10-stage1-repair.md`;

  it("locks #9 to the current official tuple and approved 1,018-line cooking plan", () => {
    const readme = read(readmePath);
    const automation = readJson(automationPath);
    const backend = automation.backend as Record<string, unknown>;
    const workItem = readJson(workItemPath);
    const docsRefs = workItem.docs_refs as Record<string, unknown>;
    const verification = workItem.verification as Record<string, unknown>;
    const owningBundle = [readme, read(automationPath), read(workItemPath)].join(
      "\n",
    );

    expect(strings(docsRefs.source_of_truth)).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.30.md",
      "docs/화면정의서-v1.5.34.md",
      "docs/유저flow맵-v1.3.32.md",
      "docs/db설계-v1.3.32.md",
      "docs/api문서-v1.2.37.md",
    ]);
    expect(readme).toContain(`approved master plan SHA-256 \`${approvedPlanSha}\``);
    expect(readme).toContain("1,018 lines");
    expect(strings(docsRefs.governing_docs).join("\n")).toContain(
      `#sha256-${approvedPlanSha}`,
    );
    expect(strings(verification.artifact_assertions)).toContain(
      "approved-cooking-plan-sha256-d4d0fb39-and-1018-line-lock",
    );
    expect(strings(backend.invariants)).toContain(
      "current-official-tuple-and-approved-cooking-plan-sha256-d4d0fb39-1018-lines",
    );
    expect(strings(backend.artifact_assertions)).toContain(
      "approved-cooking-plan-sha256-d4d0fb39-and-1018-line-lock",
    );
    expect(owningBundle).not.toContain("45f02013fbc1c3af");
    expect(owningBundle).not.toContain("1056-line");
    expect(owningBundle).not.toContain("1,056 lines");
  });

  it("locks malformed UUID keys for POST PATCH and DELETE to exact 400 and whole-operation zero-write", () => {
    const readme = read(readmePath);
    const acceptance = read(acceptancePath);
    const automation = readJson(automationPath);
    const backend = automation.backend as Record<string, unknown>;
    const workItem = readJson(workItemPath);
    const verification = workItem.verification as Record<string, unknown>;

    expect(readme).toContain(
      "| malformed UUID key | `400 INVALID_IDEMPOTENCY_KEY` | mutation/operation/entry/event/pointer/projection/aggregate 0 |",
    );

    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect(acceptance).toContain(
        `- [ ] ${method} malformed UUID Idempotency-Key returns exact \`400 INVALID_IDEMPOTENCY_KEY\` and leaves mutation/operation/entry/event/pointer/projection/aggregate at zero <!-- omo:id=accept-meal-log-${method.toLowerCase()}-invalid-idempotency-key;stage=2;scope=backend;review=3,6 -->`,
      );
    }

    expect(strings(backend.invariants)).toEqual(
      expect.arrayContaining([
        "post-patch-delete-malformed-uuid-key-exact-400-invalid-idempotency-key",
        "malformed-uuid-key-whole-operation-zero-write-mutation-operation-entry-event-pointer-projection-aggregate",
      ]),
    );
    expect(strings(backend.required_test_targets)).toContain(
      "post-patch-delete-malformed-idempotency-key-exact-400-and-whole-operation-zero-write-evidence",
    );
    expect(strings(backend.artifact_assertions)).toContain(
      "post-patch-delete-malformed-idempotency-key-exact-400-and-seven-surface-zero-write",
    );
    expect(strings(automation.blocked_conditions)).toContain(
      "post-patch-delete-malformed-uuid-key-not-exact-400-or-any-mutation-operation-entry-event-pointer-projection-aggregate-write",
    );
    expect(strings(verification.artifact_assertions)).toContain(
      "post-patch-delete-malformed-idempotency-key-exact-400-and-seven-surface-zero-write",
    );
  });

  it("records the exact HOLD repair lineage without promoting lifecycle or approval", () => {
    const readme = read(readmePath);
    const evidenceExists = existsSync(join(root, evidencePath));
    const evidence = evidenceExists ? read(evidencePath) : "";
    const workItem = readJson(workItemPath);
    const workflowStatus = readJson(".workflow-v2/status.json");
    const status = (
      workflowStatus.items as Array<Record<string, unknown>>
    ).find((item) => item.id === sliceId);
    const roadmap = read("docs/workpacks/README.md");

    expect(evidenceExists).toBe(true);
    for (const document of [readme, evidence]) {
      expect(document).toContain(
        "c16102a3072e929e45bb24a69464cd3110d03db5",
      );
      expect(document).toContain(
        "076c5b22ec91dd600eb387be4930a2582054ac15",
      );
    }
    expect(workItem.status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(status).toMatchObject({
      branch: "docs/meal-log-core-stage1-repair",
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(roadmap).toMatch(
      /\| 9 \| D \| `meal-log-core` \| in-progress \| #1 \+ #2 \+ #4 \+ #8 \|/,
    );
    expect(evidence).toContain("fresh independent internal 1.5 rereview required");
    expect(evidence).toContain("self-approval: forbidden");
  });

  it("preserves #9 backend Stage 2 and #11 UI parallel ownership boundaries", () => {
    const readme = read(readmePath);

    expect(readme).toContain("## #9 Stage 2 / #11 UI Parallel Ownership");
    expect(readme).toContain(
      "| DB | `meal_log_entries`, active consumption pointer, meal-log RLS/constraint/RPC/migration | #9 table/event/pointer를 만들거나 수정하지 않음 |",
    );
    expect(readme).toContain(
      "| API | meal-log create/PATCH/DELETE/read routes and meal-log-only types/tests | COOK_MODE/LEFTOVERS presentation; meal-log API를 소유하지 않음 |",
    );
    expect(readme).toContain("#10/#12 shell/MEAL_LOG screen을 선점하지 않음");
    expect(readme).toContain("#12 consumed UI/CTA를 미리 구현하지 않음");
    expect(readme).toContain("shared projection은 branch owner 한 명이 순차 통합");
  });
});
