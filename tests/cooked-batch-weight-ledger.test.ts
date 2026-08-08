import { describe, expect, it } from "vitest";

import {
  parseBatchAdjustmentRequest,
  parseBatchCloseRequest,
  parseBatchDiscardRequest,
  parseBatchWeightRequest,
  parseCookedBatchListQuery,
  projectCookedBatchMutationData,
} from "@/lib/server/cooked-batches";

const batchId = "550e8400-e29b-41d4-a716-446655440801";
const eventId = "550e8400-e29b-41d4-a716-446655440802";

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
});
