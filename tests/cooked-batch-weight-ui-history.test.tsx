import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mergeCookedBatchPages,
  nextCookedBatchOperation,
} from "@/components/leftovers/cooked-batch-state";
import type { CookedBatchProjection } from "@/types/cooking";
import {
  discardCookedBatch,
  fetchCookedBatches,
} from "@/lib/api/cooking";

function item(id: string): CookedBatchProjection {
  return {
    id,
    recipe_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    recipe_title: id,
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-08-10T00:00:00.000Z",
    cooking_servings: 1,
    finished_weight_g: 100,
    remaining_weight_g: 100,
    weight_status: "known",
    batch_status: "available",
    depleted_reason: null,
    revision: 1,
    nutrition_calculation_status: "complete",
    current_unweighed_closure_event_id: null,
  };
}

describe("cooked batch client history", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps server order while suppressing only overlapping batch ids", () => {
    const first = item("11111111-1111-4111-8111-111111111111");
    const overlap = item("22222222-2222-4222-8222-222222222222");
    const next = item("33333333-3333-4333-8333-333333333333");

    expect(mergeCookedBatchPages([first, overlap], [overlap, next])).toEqual([
      first,
      overlap,
      next,
    ]);
  });

  it("reuses an idempotency key only for the same canonical payload", () => {
    const first = nextCookedBatchOperation(null, { action: "discard", discarded_g: 20, reason: "탐", expected_revision: 1 });
    const replay = nextCookedBatchOperation(first, { action: "discard", discarded_g: 20, reason: "탐", expected_revision: 1 });
    const corrected = nextCookedBatchOperation(first, { action: "discard", discarded_g: 10, reason: "탐", expected_revision: 1 });

    expect(replay.key).toBe(first.key);
    expect(corrected.key).not.toBe(first.key);
  });

  it("consumes the exact all-availability cursor container without decoding it", async () => {
    const batch = item("11111111-1111-4111-8111-111111111111");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { items: [batch], next_cursor: "opaque-cursor", has_next: true },
      error: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCookedBatches({ availability: "all", cursor: "opaque-cursor", limit: 20 });

    expect(result).toEqual({ items: [batch], next_cursor: "opaque-cursor", has_next: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("availability=all");
    expect(String(fetchMock.mock.calls[0][0])).toContain("cursor=opaque-cursor");
  });

  it("sends exact discard fields and the supplied replay key", async () => {
    const batch = item("11111111-1111-4111-8111-111111111111");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { action: "discard", batch, event_id: "22222222-2222-4222-8222-222222222222" },
      error: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await discardCookedBatch(batch.id, {
      discarded_g: 20,
      reason: "탐",
      expected_revision: 1,
    }, "33333333-3333-4333-8333-333333333333");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ discarded_g: 20, reason: "탐", expected_revision: 1 });
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("33333333-3333-4333-8333-333333333333");
  });
});
