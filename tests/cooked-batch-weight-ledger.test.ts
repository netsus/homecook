import { describe, expect, it, vi } from "vitest";

import {
  parseBatchAdjustmentRequest,
  parseBatchCloseRequest,
  parseBatchDiscardRequest,
  parseBatchWeightRequest,
  parseCookedBatchListQuery,
  projectCookedBatchGamification,
  projectCookedBatchMutationData,
} from "@/lib/server/cooked-batches";

const projectUserGamificationAfterProgressEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/user-gamification", () => ({
  projectUserGamificationAfterProgressEvent,
}));

const batchId = "550e8400-e29b-41d4-a716-446655440801";
const eventId = "550e8400-e29b-41d4-a716-446655440802";
const occurredAt = "2026-08-08T10:00:00.000Z";

const requiredEventCounts = {
  cooking_completed: 1,
  shopping_completed: 0,
  recipe_saved_distinct_ever: 0,
  custom_book_created: 0,
  planner_registered_first: 0,
  planner_registered_repeat: 0,
};

function createGamificationProjectionDb(eventCounts: Record<string, number>) {
  const rows: Record<string, Record<string, unknown>> = {
    user_progress_events: {
      id: eventId,
      xp_delta: 15,
      occurred_at: occurredAt,
      source_meta_json: { previous_level: 1 },
    },
    user_progress_summary: {
      total_xp: 15,
      event_counts: eventCounts,
      last_updated_at: occurredAt,
    },
  };

  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return query;
    },
  };
}

const batch = {
  id: batchId,
  recipe_id: "550e8400-e29b-41d4-a716-446655440803",
  recipe_title: "김치찌개",
  recipe_thumbnail_url: null,
  status: "leftover",
  cooked_at: "2026-08-08T10:00:00.000Z",
  cooking_servings: 4,
  finished_weight_g: 1480,
  remaining_weight_g: 1360,
  weight_status: "known",
  batch_status: "available",
  depleted_reason: null,
  revision: 2,
  nutrition_calculation_status: "partial",
  current_unweighed_closure_event_id: null,
};

describe("cooked batch mutation contract", () => {
  it("rejects an explicitly present empty list cursor", () => {
    expect(parseCookedBatchListQuery(new URLSearchParams("cursor="))).toEqual({
      ok: false,
      fields: [{ field: "cursor", reason: "invalid_cursor" }],
    });
  });

  it("rejects non-canonical or non-base64url cursor encodings", () => {
    const canonical = Buffer.from(JSON.stringify({
      v: 1,
      a: "loggable",
      t: "2026-08-08T10:00:00.000Z",
      i: batch.id,
    }), "utf8").toString("base64url");

    for (const cursor of [`${canonical}!`, `${canonical}=`, ` ${canonical}`, `${canonical}\n`]) {
      expect(parseCookedBatchListQuery(new URLSearchParams({ cursor }))).toEqual({
        ok: false,
        fields: [{ field: "cursor", reason: "invalid_cursor" }],
      });
    }
  });

  it("accepts only the official weight action shapes", () => {
    expect(parseBatchWeightRequest({
      action: "set_finished_weight",
      finished_weight_g: 1480,
      expected_revision: 1,
    })).toEqual({
      ok: true,
      value: {
        action: "set_finished_weight",
        finishedWeightG: 1480,
        expectedRevision: 1,
      },
    });
    expect(parseBatchWeightRequest({
      action: "mark_unrecoverable",
      expected_revision: 1,
      finished_weight_g: 1480,
    })).toEqual({
      ok: false,
      fields: [{ field: "body", reason: "unknown_field" }],
    });
  });

  it("rejects non-positive discard and adjustment-to-unknown request forms", () => {
    expect(parseBatchDiscardRequest({
      discarded_g: 0,
      reason: "상함",
      expected_revision: 2,
    }).ok).toBe(false);
    expect(parseBatchAdjustmentRequest({
      delta_g: 0,
      reason: "계량 보정",
      expected_revision: 2,
    }).ok).toBe(false);
  });

  it("locks close and cancel_current to their exact official fields", () => {
    expect(parseBatchCloseRequest({
      action: "close",
      closure_reason: "mixed",
      expected_revision: 1,
    }).ok).toBe(true);
    expect(parseBatchCloseRequest({
      action: "cancel_current",
      reverses_event_id: eventId,
      expected_revision: 2,
    }).ok).toBe(true);
    expect(parseBatchCloseRequest({
      action: "reopen",
      expected_revision: 2,
    }).ok).toBe(false);
  });

  it("returns the exact three-key mutation projection and strips internal authority", () => {
    expect(projectCookedBatchMutationData({
      action: "discard",
      batch,
      event_id: eventId,
      owner_uuid: "private",
      operation_id: "private",
      replay_checksum: "private",
    })).toEqual({ action: "discard", batch, event_id: eventId });
  });

  it.each([
    ["omits", requiredEventCounts, false],
    ["keeps", { ...requiredEventCounts, leftover_eaten: 2 }, true],
  ] as const)("%s the optional leftover event count without changing its value", async (
    _label,
    eventCounts,
    includesLeftoverCount,
  ) => {
    projectUserGamificationAfterProgressEvent.mockClear();

    await projectCookedBatchGamification(
      createGamificationProjectionDb(eventCounts),
      "550e8400-e29b-41d4-a716-446655440804",
      "cooking_completed",
      batchId,
    );

    const progress = projectUserGamificationAfterProgressEvent.mock.calls[0]?.[1]?.progress;
    expect(progress?.event_counts).toEqual(eventCounts);
    expect(Object.hasOwn(progress?.event_counts ?? {}, "leftover_eaten"))
      .toBe(includesLeftoverCount);
  });
});
