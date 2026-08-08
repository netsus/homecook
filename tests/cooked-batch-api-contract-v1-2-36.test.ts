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

function extractSection(contents: string, startMarker: string, endMarker: string) {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end);
}

function extractFirstJsonObject(section: string) {
  const match = section.match(/```json\n([\s\S]*?)\n```/);

  expect(match).not.toBeNull();
  return JSON.parse(match?.[1] ?? "{}");
}

function extractInlineCodeList(line: string) {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function extractDeclaredInlineKeys(
  contents: string,
  startMarker: string,
  endMarker: string,
) {
  const declaration = extractSection(contents, startMarker, endMarker);
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start + startMarker.length);

  expect(contents.indexOf(startMarker, start + startMarker.length)).toBe(-1);
  expect(contents.indexOf(endMarker, end + endMarker.length)).toBe(-1);
  return extractInlineCodeList(declaration);
}

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

const projectionDeclarationStart = "Exact field set (15 keys):";
const projectionDeclarationEnd = ".\n\nGET item과";
const listContainerDeclarationStart = "Exact data container (3 keys):";
const listContainerDeclarationEnd = ". `items`는";

describe("cooked batch API v1.2.36 Contract Evolution", () => {
  const apiPath = "docs/api문서-v1.2.36.md";

  it("preserves the API v1.2.36 contract after a later official API version is promoted", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    expect(source).toContain("`docs/api문서-v1.2.37.md`");
    expect(source).toContain("| API v1.2.36 | 공통 owner-only `CookedBatchProjection`");
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
      .replace(
        "- duplicate pantry ID 또는 pinned target mismatch는 `422 VALIDATION_ERROR`; missing/other-owner private pantry row는 동일 `404 RESOURCE_NOT_FOUND` + `fields=[]`로 존재·owner·state를 숨긴다. selected row만 제거한다.",
        "- duplicate/missing/other-owner row는 409/422. selected row만 제거한다.",
      )
      .replace(
        "Query: `availability=loggable|all`, cursor, limit. `loggable`은 owner+available+known weight와 remaining>0인 batch만 반환하는 filter다. `all`도 owner row만 반환한다.",
        "Query: `availability=loggable|all`, cursor, limit. `loggable`은 owner+available+known weight와 remaining>0인 batch를 우선 반환한다.",
      )
      .replace(/^> \*\*v1\.2\.36 총계\*\*:[^\n]+\n>\n/m, "");

    expect(normalized).toBe(previous);
  });

  it("locks one exact owner-only CookedBatchProjection for reads and mutations", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const projectionSection = extractSection(
      addendum,
      "### `CookedBatchProjection`",
      "### snapshot-v2 complete success `data`",
    );
    const projectionExample = extractFirstJsonObject(projectionSection);

    expect(
      extractDeclaredInlineKeys(
        projectionSection,
        projectionDeclarationStart,
        projectionDeclarationEnd,
      ),
    ).toEqual(projectionFields);
    expect(Object.keys(projectionExample)).toEqual(projectionFields);
    expect(addendum).toContain("GET item과 모든 cooked-batch mutation 성공 `data`가 그대로 공유");
    expect(projectionSection).toContain("위 15개 field는 권한을 통과한 item에서 항상 존재하며 field를 omit하지 않는다");
    expect(projectionSection).toContain("`recipe_thumbnail_url`은 thumbnail이 없으면 `null`");
    expect(projectionSection).toContain("active reason이 `consumed|consumed_unweighed`일 때만 `status=eaten`");
    expect(projectionSection).toContain("`finished_weight_g`와 `remaining_weight_g`는 known이면 number이며 missing/unrecoverable이면 둘 다 `null`");
    expect(projectionSection).toContain("`depleted_reason`은 available이면 `null`, depleted이면 `consumed|discarded|mixed|consumed_unweighed|discarded_unweighed|mixed_unweighed`");
    expect(projectionSection).toContain("legacy row에서 증명할 수 없는 새 field는 explicit `null`");
    expect(projectionSection).toContain("servings·이름·content로 g 또는 snapshot을 추론하지 않는다");
    expect(projectionSection).toContain("같은 값으로 `cancel_current`가 가능한 경우에만 그 event UUID");
  });

  it("rejects an extra key inside the CookedBatchProjection declaration", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const mutatedAddendum = addendum.replace(
      "Exact field set (15 keys): `id`",
      "Exact field set (15 keys): `unexpected_before_id`, `id`",
    );
    expect(mutatedAddendum).not.toBe(addendum);
    expect(mutatedAddendum).toContain("`unexpected_before_id`");
    const projectionSection = extractSection(
      addendum,
      "### `CookedBatchProjection`",
      "### snapshot-v2 complete success `data`",
    );
    const mutatedProjectionSection = extractSection(
      mutatedAddendum,
      "### `CookedBatchProjection`",
      "### snapshot-v2 complete success `data`",
    );

    expect(
      extractDeclaredInlineKeys(
        `prefix \`ignored_key\`\n${projectionSection}\nsuffix \`ignored_key\``,
        projectionDeclarationStart,
        projectionDeclarationEnd,
      ),
    ).toEqual(projectionFields);

    expect(() => {
      expect(
        extractDeclaredInlineKeys(
          `prefix \`ignored_key\`\n${mutatedProjectionSection}\nsuffix \`ignored_key\``,
          projectionDeclarationStart,
          projectionDeclarationEnd,
        ),
      ).toEqual(projectionFields);
    }).toThrow();
  });

  it("locks exact snapshot-v2 complete and batch mutation success data with replay", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const completeFields = [
      "session_id",
      "contract_version",
      "mode",
      "status",
      "cooked_batch",
      "meals_updated",
      "pantry_removed",
      "cook_count",
    ];
    const completeSection = extractSection(
      addendum,
      "### snapshot-v2 complete success `data`",
      "### cooked-batch mutation success `data`",
    );
    const mutationSection = extractSection(
      addendum,
      "### cooked-batch mutation success `data`",
      "### `GET /cooked-batches` owner-only list와 pagination",
    );
    const completeExample = extractFirstJsonObject(completeSection);
    const mutationExample = extractFirstJsonObject(mutationSection);

    expect(Object.keys(completeExample)).toEqual(completeFields);
    expect(Object.keys(completeExample.cooked_batch)).toEqual(projectionFields);
    expect(Object.keys(mutationExample)).toEqual(["action", "batch", "event_id"]);
    expect(Object.keys(mutationExample.batch)).toEqual(projectionFields);
    expect(completeSection).toContain("`contract_version=\"snapshot_v2\"`");
    expect(completeSection).toContain("standalone은 `meals_updated=0`");
    expect(mutationSection).toContain("Exact mutation success field set (3 keys): `action`, `batch`, `event_id`");
    expect(mutationSection).toContain("`action=set_finished_weight|mark_unrecoverable|discard|adjust|close|cancel_current`");
    expect(mutationSection).toContain("`set_finished_weight`만 `event_id=null`");
    expect(mutationSection).toContain("`mark_unrecoverable|discard|adjust|close|cancel_current`은 resulting append-only event UUID");
    expect(addendum).toContain("최초 HTTP status와 canonical JSON 기준 byte-equivalent `data`");
  });

  it("locks owner-only cooked-batch pagination, filtering and legacy-null semantics", () => {
    const api = read(apiPath);
    const addendum = extractCookedBatchAddendum(api);
    const listSection = extractSection(
      addendum,
      "### `GET /cooked-batches` owner-only list와 pagination",
      "### 인증·소유권·validation·conflict와 zero-write",
    );
    const inheritedListSection = extractSection(
      api,
      "### `GET /cooked-batches`\n",
      "### `PATCH /cooked-batches/{id}/weight`",
    );

    expect(listSection).toContain("`availability=loggable|all`; default는 `loggable`");
    expect(listSection).toContain("`loggable`은 owner + `weight_status=known` + `batch_status=available` + `remaining_weight_g>0`인 row만 뜻한다");
    expect(listSection).toContain("`all`도 owner row만 반환한다");
    expect(listSection).toContain("default `20`, maximum `50`");
    expect(listSection).toContain("`cooked_at DESC, id DESC`");
    expect(listSection).toContain("cursor는 이 tuple과 exact `availability` filter에 묶인 opaque string");
    expect(
      extractDeclaredInlineKeys(
        listSection,
        listContainerDeclarationStart,
        listContainerDeclarationEnd,
      ),
    ).toEqual(["items", "next_cursor", "has_next"]);
    expect(listSection).toContain("다른 owner row는 item과 cursor boundary 계산 모두에서 제외");
    expect(inheritedListSection).toContain("batch만 반환하는 filter다");
    expect(inheritedListSection).toContain("`all`도 owner row만 반환한다");
    expect(api).not.toContain("우선 반환");
  });

  it("rejects an extra key inside the cooked-batch list container declaration", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const mutatedAddendum = addendum.replace(
      "`items`, `next_cursor`, `has_next`.",
      "`items`, `next_cursor`, `has_next`, `unexpected_after_has_next`.",
    );
    expect(mutatedAddendum).not.toBe(addendum);
    expect(mutatedAddendum).toContain("`unexpected_after_has_next`");
    const listSection = extractSection(
      addendum,
      "### `GET /cooked-batches` owner-only list와 pagination",
      "### 인증·소유권·validation·conflict와 zero-write",
    );
    const mutatedListSection = extractSection(
      mutatedAddendum,
      "### `GET /cooked-batches` owner-only list와 pagination",
      "### 인증·소유권·validation·conflict와 zero-write",
    );

    expect(
      extractDeclaredInlineKeys(
        `prefix \`ignored_key\`\n${listSection}\nsuffix \`ignored_key\``,
        listContainerDeclarationStart,
        listContainerDeclarationEnd,
      ),
    ).toEqual(["items", "next_cursor", "has_next"]);

    expect(() => {
      expect(
        extractDeclaredInlineKeys(
          `prefix \`ignored_key\`\n${mutatedListSection}\nsuffix \`ignored_key\``,
          listContainerDeclarationStart,
          listContainerDeclarationEnd,
        ),
      ).toEqual(["items", "next_cursor", "has_next"]);
    }).toThrow();
  });

  it("separates 404 nondisclosure, 422 validation and exact 409 conflicts with zero writes", () => {
    const api = read(apiPath);
    const addendum = extractCookedBatchAddendum(api);
    const errorSection = extractSection(
      addendum,
      "### 인증·소유권·validation·conflict와 zero-write",
      "- 이 addendum은 endpoint 목록이나 DB authority를 바꾸지 않는다.",
    );
    const errorRows = errorSection
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("exact public result"))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

    expect(errorRows).toEqual([
      ["unauthenticated", "`401 UNAUTHORIZED`", "0"],
      [
        "missing 또는 other-owner private session, batch, pantry row",
        "동일 `404 RESOURCE_NOT_FOUND` + `fields=[]`",
        "0; 존재·owner·state 비공개",
      ],
      [
        "duplicate pantry ID, body enum/format 오류, pinned target mismatch, malformed filter/cursor/limit",
        "`422 VALIDATION_ERROR`",
        "0",
      ],
      [
        "stale `expected_revision`, invalid lifecycle/state, bounds 초과, later-event/current-closure conflict",
        "`409 CONFLICT`",
        "0",
      ],
      [
        "unrecoverable weight/known restore/marked event reversal",
        "`409 WEIGHT_UNRECOVERABLE`",
        "0",
      ],
      [
        "adjustment가 0 도달·finished 초과·depleted reopen 시도",
        "`409 BATCH_ADJUSTMENT_INVALID`",
        "0",
      ],
      [
        "same key + different canonical payload",
        "`409 IDEMPOTENCY_KEY_REUSED`",
        "0",
      ],
      ["required key 누락", "`428 IDEMPOTENCY_KEY_REQUIRED`", "0"],
      ["key가 UUID 형식 아님", "`400 INVALID_IDEMPOTENCY_KEY`", "0"],
    ]);
    expect(errorSection).toContain("공통 `{ code, message, fields[] }` shape");
    expect(errorSection).toContain("private missing/other-owner 분기는 status/code/message/`fields=[]`를 구분하지 않는다");
    expect(errorSection).toContain("모든 failure는 pantry/batch/event/session/claim/Meal/cook-count/XP write 0");
    expect(api).toContain("duplicate pantry ID 또는 pinned target mismatch는 `422 VALIDATION_ERROR`");
    expect(api).toContain("missing/other-owner private pantry row는 동일 `404 RESOURCE_NOT_FOUND` + `fields=[]`");
    expect(api).not.toContain("duplicate/missing/other-owner row는 409/422");
  });

  it("does not expose server-only authority metadata in the new public projection", () => {
    const addendum = extractCookedBatchAddendum(read(apiPath));
    const projectionSection = addendum.slice(
      addendum.indexOf("### `CookedBatchProjection`"),
      addendum.indexOf("### snapshot-v2 complete success `data`"),
    );

    const publicExamples = [
      extractFirstJsonObject(projectionSection),
      extractFirstJsonObject(
        extractSection(
          addendum,
          "### snapshot-v2 complete success `data`",
          "### cooked-batch mutation success `data`",
        ),
      ),
      extractFirstJsonObject(
        extractSection(
          addendum,
          "### cooked-batch mutation success `data`",
          "### `GET /cooked-batches` owner-only list와 pagination",
        ),
      ),
    ];
    const serializedExamples = JSON.stringify(publicExamples);

    for (const forbidden of [
      "recipe_content_snapshot_id",
      "account_generation",
      "payload_hash",
      "replay_checksum",
      "claim_id",
      "operation_id",
    ]) {
      expect(serializedExamples).not.toContain(`\"${forbidden}\"`);
    }
    expect(projectionSection).toContain("비공개");
  });

  it("retains the #8 contract lock without promoting overall workflow approval", () => {
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
    const automation = JSON.parse(
      read("docs/workpacks/cooked-batch-weight-ledger/automation-spec.json"),
    );
    const status = workflow.items.find(
      (item: { id: string }) => item.id === "cooked-batch-weight-ledger",
    );

    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
    const currentProjection = `${workItem.notes}\n${status.notes}`;
    expect(currentProjection).toContain("019fe194-62d9-7ed2-9116-b820873bd48b");
    expect(currentProjection).toContain("APPROVE");
    expect(currentProjection).toContain("635763041d6420c648e2b55336e6caa9f1f9143c");
    expect(currentProjection).toContain("overall approval and verification remain pending");
    expect(automation.backend.verify_commands).toContain(
      "pnpm validate:workpack -- --slice cooked-batch-weight-ledger",
    );
    expect(status.pr_path).toBe("https://github.com/netsus/homecook/pull/1291");
  });
});
