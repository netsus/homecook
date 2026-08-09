import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelSnapshotV2CookingSession, completeSnapshotV2CookingSession, createSnapshotV2CookingSession } from "@/lib/api/cooking";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const RECIPE_UUID = "550e8400-e29b-41d4-a716-446655440001";
const BATCH_UUID = "550e8400-e29b-41d4-a716-446655440002";

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 }));
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
    const valid = {
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response(valid));
    const body = {
      consumed_pantry_item_ids: [RECIPE_UUID],
      weight_action: "set_finished_weight" as const,
      finished_weight_g: 640,
    };

    await expect(completeSnapshotV2CookingSession(UUID, body, BATCH_UUID)).resolves.toEqual(valid);

    const [input, init] = fetchMock.mock.calls[0];
    expect(input).toBe(`/api/v1/cooking/session-attempts/${UUID}/complete`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(BATCH_UUID);
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("rejects completion responses with guessed or extra projection fields", async () => {
    const valid = {
      session_id: UUID,
      contract_version: "snapshot_v2",
      mode: "planner",
      status: "completed",
      cooked_batch: {
        id: BATCH_UUID,
        recipe_id: RECIPE_UUID,
        recipe_title: "김치찌개",
        recipe_thumbnail_url: null,
        status: "leftover",
        cooked_at: "2026-08-09T08:00:00.000Z",
        cooking_servings: null,
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "missing",
        batch_status: "available",
        depleted_reason: null,
        revision: 1,
        nutrition_calculation_status: null,
        current_unweighed_closure_event_id: null,
      },
      meals_updated: 1,
      pantry_removed: 0,
      cook_count: 1,
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
      }, BATCH_UUID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});
