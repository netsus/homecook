import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeCookedBatchCursor,
  encodeCookedBatchCursor,
  parseCookedBatchListQuery,
  projectCookedBatch,
} from "@/lib/server/cooked-batches";
import { projectLeftoverCompatibilityStatus } from "@/lib/server/leftovers";

const id = "550e8400-e29b-41d4-a716-446655440821";

describe("cooked batch reader compatibility", () => {
  it("isolates the ledger follow-up without weakening the default inventory run", () => {
    const baseRunner = readFileSync(
      join(process.cwd(), "scripts/run-recipe-snapshot-authority-postgres-integration.mjs"),
      "utf8",
    );
    const ledgerRunner = readFileSync(
      join(process.cwd(), "scripts/run-cooked-batch-weight-ledger-postgres-integration.mjs"),
      "utf8",
    );
    expect(baseRunner).toContain(
      'process.env.HOMECOOK_RECIPE_SNAPSHOT_SKIP_ACTIVE_SECURITY_INVENTORY === "1"',
    );
    expect(ledgerRunner).not.toContain(
      "HOMECOOK_RECIPE_SNAPSHOT_SKIP_ACTIVE_SECURITY_INVENTORY",
    );
  });

  it("uses loggable/20 defaults and rejects filter-bound cursor reuse", () => {
    expect(parseCookedBatchListQuery(new URLSearchParams())).toEqual({
      ok: true,
      value: { availability: "loggable", limit: 20, cursor: null },
    });
    const cursor = encodeCookedBatchCursor({
      availability: "loggable",
      cookedAt: "2026-08-08T10:00:00.000Z",
      id,
    });
    expect(decodeCookedBatchCursor(cursor, "all")).toBeNull();
  });

  it("projects discard and mixed depletion as legacy leftover, never eaten", () => {
    const base = {
      id,
      recipe_id: "550e8400-e29b-41d4-a716-446655440822",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      status: "eaten",
      cooked_at: "2026-08-08T10:00:00.000Z",
      cooking_servings: 4,
      finished_weight_g: 1000,
      remaining_weight_g: 0,
      weight_status: "known",
      batch_status: "depleted",
      depleted_reason: "discarded",
      revision: 3,
      nutrition_calculation_status: "complete",
      current_unweighed_closure_event_id: null,
    };
    expect(projectCookedBatch(base)?.status).toBe("leftover");
    expect(projectCookedBatch({ ...base, depleted_reason: "consumed" })?.status).toBe("eaten");
  });

  it("makes the legacy leftovers reader follow v2 batch authority", () => {
    expect(projectLeftoverCompatibilityStatus({
      recipe_content_snapshot_id: id,
      status: "eaten",
      batch_status: "depleted",
      depleted_reason: "discarded",
    })).toBe("leftover");
    expect(projectLeftoverCompatibilityStatus({
      recipe_content_snapshot_id: id,
      status: "leftover",
      batch_status: "depleted",
      depleted_reason: "consumed_unweighed",
    })).toBe("eaten");
  });

  it("keeps every unknown legacy authority field explicit null without fabricating grams", () => {
    const projected = projectCookedBatch({
      id,
      recipe_id: "550e8400-e29b-41d4-a716-446655440822",
      recipe_title: "옛날 찌개",
      recipe_thumbnail_url: null,
      status: "leftover",
      cooked_at: "2026-01-01T00:00:00.000Z",
      cooking_servings: null,
      finished_weight_g: null,
      remaining_weight_g: null,
      weight_status: null,
      batch_status: null,
      depleted_reason: null,
      revision: null,
      nutrition_calculation_status: null,
      current_unweighed_closure_event_id: null,
    });
    expect(projected).not.toBeNull();
    expect(projected?.finished_weight_g).toBeNull();
    expect(Object.keys(projected!)).toHaveLength(15);
  });
});
