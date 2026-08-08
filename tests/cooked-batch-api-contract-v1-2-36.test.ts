import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function extractCookedBatchAddendum(api: string) {
  const start = api.indexOf("## 0-CBW.");
  const end = api.indexOf(
    "> **2026-08-04 contract-evolution — recipe snapshot entrypoint context**",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return api.slice(start, end);
}

describe("cooked batch API v1.2.36 Contract Evolution", () => {
  const apiPath = "docs/api문서-v1.2.36.md";

  it("promotes only API v1.2.36 in the official source-of-truth tuple", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    expect(source).toContain("`docs/api문서-v1.2.36.md`");
    expect(source).toContain("Cooked Batch Weight Ledger Contract-Evolution `2026-08-08`");
    expect(source).toContain("요구사항 `v1.7.29` · 화면 `v1.5.33` · Flow `v1.3.31` · DB `v1.3.31`");
  });

  it("preserves API v1.2.35 and the other four official documents byte-for-byte", () => {
    expect(sha256("docs/api문서-v1.2.35.md")).toBe(
      "39edfc8732ea5bff8f63bd9c3a86d06ccbf3544f0afc49a526f66ec256f5ffc4",
    );
    expect(sha256("docs/요구사항기준선-v1.7.29.md")).toBe(
      "45aef470a54edb1a774e9ce4359dd7392eeddd291df737a1fcf98a35d8477f9f",
    );
    expect(sha256("docs/화면정의서-v1.5.33.md")).toBe(
      "9cd3d781616cb679fd60b8856055fa0c57d5ba9e318017502acd34d4ed29ea70",
    );
    expect(sha256("docs/유저flow맵-v1.3.31.md")).toBe(
      "e53c404a07a68c1f14b5792bc223a727f93a11b733947ad6350ef30d843ed04b",
    );
    expect(sha256("docs/db설계-v1.3.31.md")).toBe(
      "a80d2a25efbd7648060afcd033841c463a6171796e7182516bb4a1c768da04b0",
    );
  });

  it("inherits v1.2.35 exactly outside the approved additive contract", () => {
    const previous = read("docs/api문서-v1.2.35.md");
    const current = read(apiPath);
    const addendumStart = current.indexOf(
      "> **2026-08-08 contract-evolution — cooked batch projection",
    );
    const addendumEnd = current.indexOf(
      "> **2026-08-04 contract-evolution — recipe snapshot entrypoint context**",
    );

    expect(addendumStart).toBeGreaterThanOrEqual(0);
    expect(addendumEnd).toBeGreaterThan(addendumStart);

    const normalized = `${current.slice(0, addendumStart)}${current.slice(addendumEnd)}`
      .replace("# API\\_설계\\_v1.2.36", "# API\\_설계\\_v1.2.35")
      .replace("날짜: 8월 8일", "날짜: 8월 4일")
      .replace(/^> \*\*v1\.2\.36 총계\*\*:[^\n]+\n>\n/m, "");

    expect(normalized).toBe(previous);
  });

  it("locks one exact owner-only CookedBatchProjection for reads and mutations", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const projectionFields = [
      "id",
      "recipe_id",
      "recipe_title",
      "recipe_thumbnail_url",
      "status",
      "cooked_at",
      "cooking_servings",
      "finished_weight_g",
      "remaining_weight_g",
      "weight_status",
      "batch_status",
      "depleted_reason",
      "revision",
      "nutrition_calculation_status",
      "current_unweighed_closure_event_id",
    ];

    expect(addendum).toContain(`Exact field set (${projectionFields.length} keys)`);
    for (const field of projectionFields) {
      expect(addendum).toContain(`\`${field}\``);
    }
    expect(addendum).toContain("GET item과 모든 cooked-batch mutation 성공 `data`가 그대로 공유");
    expect(addendum).toContain("legacy row에서 증명할 수 없는 새 field는 explicit `null`");
    expect(addendum).toContain("servings·이름·content로 g 또는 snapshot을 추론하지 않는다");
    expect(addendum).toContain("field를 omit하지 않는다");
  });

  it("locks exact snapshot-v2 complete and batch mutation success data with replay", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));

    for (const field of [
      "session_id",
      "contract_version",
      "mode",
      "status",
      "cooked_batch",
      "meals_updated",
      "pantry_removed",
      "cook_count",
    ]) {
      expect(addendum).toContain(`\`${field}\``);
    }
    expect(addendum).toContain("`contract_version=\"snapshot_v2\"`");
    expect(addendum).toContain("standalone은 `meals_updated=0`");
    expect(addendum).toContain("Exact mutation success field set (3 keys): `action`, `batch`, `event_id`");
    expect(addendum).toContain("`set_finished_weight`만 `event_id=null`");
    expect(addendum).toContain("`mark_unrecoverable|discard|adjust|close|cancel_current`");
    expect(addendum).toContain("최초 HTTP status와 canonical JSON 기준 byte-equivalent `data`");
  });

  it("locks owner-only cooked-batch pagination, filtering and legacy-null semantics", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));

    expect(addendum).toContain("`availability=loggable|all`; default는 `loggable`");
    expect(addendum).toContain("owner + `weight_status=known` + `batch_status=available` + `remaining_weight_g>0`");
    expect(addendum).toContain("default `20`, maximum `50`");
    expect(addendum).toContain("`cooked_at DESC, id DESC`");
    expect(addendum).toContain("cursor는 이 tuple과 exact `availability` filter에 묶인 opaque string");
    expect(addendum).toContain("Exact data container (3 keys): `items`, `next_cursor`, `has_next`");
    expect(addendum).toContain("다른 owner row는 item과 cursor boundary 계산 모두에서 제외");
  });

  it("separates 404 nondisclosure, 422 validation and exact 409 conflicts with zero writes", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));

    expect(addendum).toContain("`401 UNAUTHORIZED`");
    expect(addendum).toContain("동일 `404 RESOURCE_NOT_FOUND` + `fields=[]`");
    expect(addendum).toContain("duplicate pantry ID, body enum/format 오류, pinned target mismatch");
    expect(addendum).toContain("`422 VALIDATION_ERROR`");
    expect(addendum).toContain("stale `expected_revision`, invalid lifecycle/state, bounds 초과, later-event/current-closure conflict");
    expect(addendum).toContain("`409 CONFLICT`");
    expect(addendum).toContain("`409 WEIGHT_UNRECOVERABLE`");
    expect(addendum).toContain("`409 BATCH_ADJUSTMENT_INVALID`");
    expect(addendum).toContain("`409 IDEMPOTENCY_KEY_REUSED`");
    expect(addendum).toContain("`428 IDEMPOTENCY_KEY_REQUIRED`");
    expect(addendum).toContain("`400 INVALID_IDEMPOTENCY_KEY`");
    expect(addendum).toContain("모든 failure는 pantry/batch/event/session/claim/Meal/cook-count/XP write 0");
  });

  it("does not expose server-only authority metadata in the new public projection", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const projectionSection = addendum.slice(
      addendum.indexOf("### `CookedBatchProjection`"),
      addendum.indexOf("### snapshot-v2 complete success `data`"),
    );

    for (const forbidden of [
      "recipe_content_snapshot_id",
      "account_generation",
      "payload_hash",
      "replay_checksum",
      "claim_id",
      "operation_id",
    ]) {
      expect(projectionSection).not.toContain(`\"${forbidden}\"`);
    }
    expect(projectionSection).toContain("비공개");
  });

  it("re-locks every #8 contract surface while keeping review and implementation pending", () => {
    const paths = [
      "docs/workpacks/cooked-batch-weight-ledger/README.md",
      "docs/workpacks/cooked-batch-weight-ledger/acceptance.md",
      "docs/workpacks/cooked-batch-weight-ledger/automation-spec.json",
      ".workflow-v2/work-items/cooked-batch-weight-ledger.json",
      ".workflow-v2/status.json",
      "docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-04-stage1-relock.md",
    ];

    for (const path of paths) {
      const contents = read(path);
      expect(contents).toContain("v1.2.36");
      expect(contents).toContain("CookedBatchProjection");
      expect(contents).toContain("GET /cooked-batches");
      expect(contents).toContain("404 RESOURCE_NOT_FOUND");
    }

    const workItem = JSON.parse(read(".workflow-v2/work-items/cooked-batch-weight-ledger.json"));
    const workflow = JSON.parse(read(".workflow-v2/status.json"));
    const status = workflow.items.find(
      (item: { id: string }) => item.id === "cooked-batch-weight-ledger",
    );

    expect(workItem.status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(`${workItem.notes}\n${status.notes}`).toMatch(
      /fresh independent contract re-review pending/i,
    );
    expect(`${workItem.notes}\n${status.notes}`).toContain("Stage 2 resume pending");
  });
});
