import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelSnapshotV2CookingSession, completeSnapshotV2CookingSession, createSnapshotV2CookingSession, fetchSnapshotV2CookMode } from "@/lib/api/cooking";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const RECIPE_UUID = "550e8400-e29b-41d4-a716-446655440001";
const BATCH_UUID = "550e8400-e29b-41d4-a716-446655440002";
const CLOSURE_EVENT_UUID = "550e8400-e29b-41d4-a716-446655440003";
const SECOND_SESSION_UUID = "550e8400-e29b-41d4-a716-446655440004";

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 }));
}

function validCompleteData() {
  return {
    session_id: UUID,
    contract_version: "snapshot_v2",
    mode: "standalone",
    status: "completed",
    cooked_batch: {
      id: BATCH_UUID,
      recipe_id: RECIPE_UUID,
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      status: "leftover",
      cooked_at: "2026-08-09T08:00:00.000Z",
      cooking_servings: 2,
      finished_weight_g: 640,
      remaining_weight_g: 640,
      weight_status: "known",
      batch_status: "available",
      depleted_reason: null,
      revision: 1,
      nutrition_calculation_status: "complete",
      current_unweighed_closure_event_id: null,
    },
    meals_updated: 0,
    pantry_removed: 1,
    cook_count: 1,
  };
}

function validCookModeData(sessionId = UUID, mode: "planner" | "standalone" = "standalone") {
  return {
    session_id: sessionId,
    contract_version: "snapshot_v2",
    mode,
    status: "in_progress",
    recipe: {
      id: RECIPE_UUID,
      title: "김치찌개",
      cooking_servings: 2,
      ingredients: [],
      steps: [],
    },
    pantry_candidates: [],
  };
}

describe("snapshot v2 cooking API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the same explicit UUID idempotency key for cancel replays", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ session_id: UUID, contract_version: "snapshot_v2", mode: "planner", status: "cancelled" }));

    await cancelSnapshotV2CookingSession(UUID, RECIPE_UUID);
    await cancelSnapshotV2CookingSession(UUID, RECIPE_UUID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(RECIPE_UUID);
    }
  });

  it("accepts only the exact snapshot-v2 start success shape", async () => {
    const valid = { session_id: UUID, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", content_summary: { recipe_id: RECIPE_UUID, title: "김치찌개", cooking_servings: 2 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response(valid));
    await expect(createSnapshotV2CookingSession({ mode: "standalone", recipe_id: RECIPE_UUID, expected_recipe_revision: 12, cooking_servings: 2 }, UUID)).resolves.toEqual(valid);

    for (const malformed of [
      { ...valid, session_id: "not-a-uuid" },
      { ...valid, mode: "guess" },
      { ...valid, content_summary: { ...valid.content_summary, recipe_id: "not-a-uuid" } },
      { ...valid, content_summary: { ...valid.content_summary, title: "" } },
      { ...valid, content_summary: { ...valid.content_summary, cooking_servings: 0 } },
      { ...valid, content_summary: undefined },
    ]) {
      fetchMock.mockImplementationOnce(() => response(malformed));
      await expect(createSnapshotV2CookingSession({ mode: "standalone", recipe_id: RECIPE_UUID, expected_recipe_revision: 12, cooking_servings: 2 }, UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects snapshot start responses that do not match standalone request semantics", async () => {
    const body = { mode: "standalone" as const, recipe_id: RECIPE_UUID, expected_recipe_revision: 12, cooking_servings: 2 };
    const valid = { session_id: UUID, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", content_summary: { recipe_id: RECIPE_UUID, title: "김치찌개", cooking_servings: 2 } };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const mismatched of [
      { ...valid, mode: "planner" },
      { ...valid, content_summary: { ...valid.content_summary, recipe_id: UUID } },
      { ...valid, content_summary: { ...valid.content_summary, cooking_servings: 3 } },
    ]) {
      fetchMock.mockImplementationOnce(() => response(mismatched));
      await expect(createSnapshotV2CookingSession(body, UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects a planner start response with a different mode", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({
      session_id: UUID,
      contract_version: "snapshot_v2",
      mode: "standalone",
      status: "in_progress",
      content_summary: { recipe_id: RECIPE_UUID, title: "김치찌개", cooking_servings: 2 },
    }));

    await expect(createSnapshotV2CookingSession({
      mode: "planner",
      meal_ids: [UUID],
      expected_meal_revisions: { [UUID]: 3 },
    }, UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("sends the exact cooked-batch completion payload and explicit replay key", async () => {
    const valid = validCompleteData();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response(valid));
    const body = {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight" as const,
      finished_weight_g: 640,
    };

    await expect(completeSnapshotV2CookingSession(UUID, body, BATCH_UUID, "standalone")).resolves.toEqual(valid);

    const [input, init] = fetchMock.mock.calls[0];
    expect(input).toBe(`/api/v1/cooking/session-attempts/${UUID}/complete`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(BATCH_UUID);
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("rejects completion responses with guessed or extra projection fields", async () => {
    const valid = {
      ...validCompleteData(),
      mode: "planner",
      meals_updated: 1,
      pantry_removed: 0,
      cooked_batch: {
        ...validCompleteData().cooked_batch,
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "missing",
        nutrition_calculation_status: "partial",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const malformed of [
      { ...valid, guessed_storage_context: "냉장" },
      { ...valid, session_id: RECIPE_UUID },
      { ...valid, cooked_batch: { ...valid.cooked_batch, owner_id: RECIPE_UUID } },
      { ...valid, cooked_batch: { ...valid.cooked_batch, revision: 0 } },
      { ...valid, cooked_batch: { ...valid.cooked_batch, weight_status: "guessed" } },
      { ...valid, cooked_batch: { ...valid.cooked_batch, weight_status: "known", finished_weight_g: null, remaining_weight_g: null } },
      { ...valid, cooked_batch: { ...valid.cooked_batch, weight_status: "known", finished_weight_g: 20, remaining_weight_g: 30 } },
      { ...valid, cooked_batch: { ...valid.cooked_batch, weight_status: "missing", finished_weight_g: -1, remaining_weight_g: -1 } },
    ]) {
      fetchMock.mockImplementationOnce(() => response(malformed));
      await expect(completeSnapshotV2CookingSession(UUID, {
        consumed_pantry_item_ids: [],
        weight_action: "weigh_later",
        finished_weight_g: null,
      }, BATCH_UUID, "planner")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects completion responses whose mode differs from the open session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({
      ...validCompleteData(),
      mode: "planner",
    }));

    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID, "standalone")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("uses the fetched open-session mode to reject a malformed terminal response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementationOnce(() => response(validCookModeData()));
    fetchMock.mockImplementationOnce(() => response({
      ...validCompleteData(),
      mode: "planner",
    }));
    fetchMock.mockImplementationOnce(() => response(validCompleteData()));

    await fetchSnapshotV2CookMode(UUID);
    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).resolves.toEqual(validCompleteData());

    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears the remembered mode after a successful cancel", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementationOnce(() => response(validCookModeData()));
    fetchMock.mockImplementationOnce(() => response({
      session_id: UUID,
      contract_version: "snapshot_v2",
      mode: "standalone",
      status: "cancelled",
    }));

    await fetchSnapshotV2CookMode(UUID);
    await cancelSnapshotV2CookingSession(UUID, BATCH_UUID);
    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }, BATCH_UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps remembered modes isolated by session id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementationOnce(() => response(validCookModeData(UUID, "standalone")));
    fetchMock.mockImplementationOnce(() => response(validCookModeData(SECOND_SESSION_UUID, "planner")));
    fetchMock.mockImplementationOnce(() => response(validCompleteData()));
    fetchMock.mockImplementationOnce(() => response({
      ...validCompleteData(),
      session_id: SECOND_SESSION_UUID,
      mode: "planner",
      meals_updated: 1,
    }));

    await fetchSnapshotV2CookMode(UUID);
    await fetchSnapshotV2CookMode(SECOND_SESSION_UUID);
    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).resolves.toMatchObject({ session_id: UUID, mode: "standalone" });
    await expect(completeSnapshotV2CookingSession(SECOND_SESSION_UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).resolves.toMatchObject({ session_id: SECOND_SESSION_UUID, mode: "planner" });
  });

  it("bounds remembered unfinished sessions and fails closed after eviction", async () => {
    const sessionIds = Array.from({ length: 33 }, (_, index) =>
      `550e8400-e29b-41d4-a716-${index.toString(16).padStart(12, "0")}`);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const sessionId = String(input).split("/").at(-2) ?? "";
      return response(validCookModeData(sessionId));
    });

    for (const sessionId of sessionIds) {
      await fetchSnapshotV2CookMode(sessionId);
    }
    const callsAfterReads = fetchMock.mock.calls.length;

    await expect(completeSnapshotV2CookingSession(sessionIds[0], {
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }, BATCH_UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterReads);

    const lastSessionId = sessionIds.at(-1)!;
    fetchMock.mockImplementationOnce(() => response({
      ...validCompleteData(),
      session_id: lastSessionId,
    }));
    await expect(completeSnapshotV2CookingSession(lastSessionId, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID)).resolves.toMatchObject({ session_id: lastSessionId });
  });

  it.each([
    ["cooking_servings", { cooking_servings: null }],
    ["weight_status", { weight_status: null, finished_weight_g: null, remaining_weight_g: null }],
    ["batch_status", { batch_status: null }],
    ["revision", { revision: null }],
    ["nutrition_calculation_status", { nutrition_calculation_status: null }],
  ])("rejects legacy-only null for %s on a newly completed v2 batch", async (_field, batchPatch) => {
    const valid = validCompleteData();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({
      ...valid,
      cooked_batch: { ...valid.cooked_batch, ...batchPatch },
    }));

    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID, "standalone")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    ["legacy eaten status", { status: "eaten" }],
    ["depleted status", { batch_status: "depleted", depleted_reason: "consumed" }],
    ["depleted reason", { depleted_reason: "consumed" }],
    ["current unweighed closure", { current_unweighed_closure_event_id: CLOSURE_EVENT_UUID }],
    ["already reduced known weight", { remaining_weight_g: 639 }],
  ])("rejects impossible initial completion state: %s", async (_case, batchPatch) => {
    const valid = validCompleteData();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({
      ...valid,
      cooked_batch: { ...valid.cooked_batch, ...batchPatch },
    }));

    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    }, BATCH_UUID, "standalone")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    [
      "set_finished_weight response is missing",
      { weight_status: "missing", finished_weight_g: null, remaining_weight_g: null },
      { consumed_pantry_item_ids: [], weight_action: "set_finished_weight" as const, finished_weight_g: 640 },
    ],
    [
      "set_finished_weight response has a different initial weight",
      { finished_weight_g: 620, remaining_weight_g: 620 },
      { consumed_pantry_item_ids: [], weight_action: "set_finished_weight" as const, finished_weight_g: 640 },
    ],
    [
      "weigh_later response is known",
      {},
      { consumed_pantry_item_ids: [], weight_action: "weigh_later" as const, finished_weight_g: null },
    ],
  ])("rejects request/response weight mismatch: %s", async (_case, batchPatch, body) => {
    const valid = validCompleteData();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({
      ...valid,
      cooked_batch: { ...valid.cooked_batch, ...batchPatch },
    }));

    await expect(completeSnapshotV2CookingSession(
      UUID,
      body,
      BATCH_UUID,
      "standalone",
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("accepts the exact initial missing-weight projection for weigh-later", async () => {
    const valid = validCompleteData();
    const missing = {
      ...valid,
      cooked_batch: {
        ...valid.cooked_batch,
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "missing",
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response(missing));

    await expect(completeSnapshotV2CookingSession(UUID, {
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }, BATCH_UUID, "standalone")).resolves.toEqual(missing);
  });
});
