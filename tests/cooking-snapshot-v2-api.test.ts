import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelSnapshotV2CookingSession, createSnapshotV2CookingSession } from "@/lib/api/cooking";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const RECIPE_UUID = "550e8400-e29b-41d4-a716-446655440001";

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
});
