import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBatchWeightRequest, parseSnapshotV2CompleteRequest, projectCookedBatch } from "@/lib/server/cooked-batches";
import { isCookedWeightSummary, isMealLogWeightBasis } from "@/lib/cooking/cooked-weight-summary";
import { projectMealLogData } from "@/lib/server/meal-log";
import { projectMealLogNutritionPreview } from "@/lib/server/meal-log-nutrition-preview";
import { wantsCookedWeightEvidence, cookedWeightResponseHeaders } from "@/lib/cooking/cooked-weight-response-contract";
import { fetchMealLogNutritionPreview } from "@/lib/api/meal-log-preview";
import type { CookedBatchProjection } from "@/types/cooking";
const batch: CookedBatchProjection = { id: "550e8400-e29b-41d4-a716-446655440801", recipe_id: "550e8400-e29b-41d4-a716-446655440802",
  recipe_title: "음식", recipe_thumbnail_url: null, status: "leftover", cooked_at: "2026-10-13T00:00:00Z", cooking_servings: 2,
  finished_weight_g: 300, remaining_weight_g: 300, weight_status: "known", weight_source: "estimated", batch_status: "available",
  depleted_reason: null, revision: 1, nutrition_calculation_status: "partial", current_unweighed_closure_event_id: null };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("weight provenance request and reader boundary", () => {
  it("separates explicit reports from old set-weight and skip requests", () => {
    const old = parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300 });
    const explicit = parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300, weight_input_source: "reported_measured" });
    expect(old.ok && old.value.weightInputSource).toBeNull();
    expect(explicit.ok && explicit.value.weightInputSource).toBe("reported_measured");
    expect(parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null }).ok).toBe(true);
    expect(parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null, weight_input_source: "reported_measured" }).ok).toBe(false);
  });
  it("does not accept client prediction, learning eligibility, or arbitrary source enums", () => {
    for (const extra of [{ prediction: { totalGrams: 400 } }, { learning_eligible: true }, { weight_input_source: "measured" }, { weight_input_source: null }]) {
      expect(parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300, ...extra }).ok).toBe(false);
    }
    expect(parseBatchWeightRequest({ action: "set_finished_weight", finished_weight_g: 200, expected_revision: 1, weight_input_source: "reported_measured" }).ok).toBe(true);
    expect(parseBatchWeightRequest({ action: "mark_unrecoverable", expected_revision: 1, weight_input_source: "reported_measured" }).ok).toBe(false);
    expect(parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 1480,
      gross_weight_g: 1800, tare_weight_g: 320 }).ok).toBe(false);
  });
  it("continues reading frozen provenance with both web and DB capabilities OFF", () => {
    vi.stubEnv("HOMECOOK_COOKED_WEIGHT_EVIDENCE", "0");
    const evidence = { source: "reported_measured", predicted_g: 300, model_version: "bounded-weight-v1", reason_codes: ["boundary_unconfirmed"] };
    const projected = projectCookedBatch({ ...batch, finished_weight_g: 200, remaining_weight_g: 200, weight_source: "measured", weight_evidence: evidence, weight_evidence_enabled: true }, true);
    expect(projected?.weight_evidence).toEqual(evidence);
    expect(projected?.weight_evidence_enabled).toBe(false);
    expect(projected?.finished_weight_g).toBe(200);
    expect(projectCookedBatch(batch)?.weight_evidence).toBeUndefined();
  });
  it("denies malformed or private fields at the public summary boundary", () => {
    const evidence = { source: "legacy_unknown", predicted_g: null, model_version: null, reason_codes: [] };
    expect(isCookedWeightSummary(evidence)).toBe(true);
    expect(isCookedWeightSummary({ ...evidence, snapshot_input: { private_note: "hidden" } })).toBe(false);
    expect(isCookedWeightSummary({ ...evidence, source: "measured" })).toBe(false);
    expect(projectCookedBatch({ ...batch, weight_evidence: { ...evidence, predicted_g: -1 } }, true)).toBeNull();
  });
});


describe("compatible frozen meal weight evidence", () => {
  const input = { source: { type: "cooked_batch" as const, id: batch.id }, quantity: { amount: 100, unit: "g" } };
  const nutrition = { calculation_status: "complete" as const, calories_kcal: 500, carbohydrate_g: 50, protein_g: 25, fat_g: 10, sodium_mg: 500 };
  const basis = { schema_version: "cooked-weight-basis-v1" as const, batch_id: batch.id, recipe_content_snapshot_id: batch.recipe_id,
    finished_weight_g: 200, source: "conditional_estimate" as const, model_version: "bounded-weight-v2", prediction_id: batch.id, observation_id: null, batch_revision: 1 };
  const assumptions = ["mix_tags_imply_no_heat", "all_declared_inputs_retained", "unreported_drainage_leftovers_container_added_media_unknown"];
  it("validates a conditional frozen denominator independently of the predicted-g summary", () => {
    expect(isMealLogWeightBasis(basis)).toBe(true);
    const evidence = { ...nutrition, weight_basis: basis, weight_assumption_codes: assumptions };
    expect(projectMealLogNutritionPreview(evidence, input, true)?.nutrition).toEqual(evidence);
    expect(projectMealLogNutritionPreview(evidence, input)?.nutrition).toEqual(nutrition);
    expect(projectMealLogNutritionPreview({ ...evidence, weight_basis: { ...basis, batch_id: batch.recipe_id } }, input, true)).toBeNull();
    expect(projectMealLogNutritionPreview({ ...evidence, weight_basis: { ...basis, source: "reported_measured" } }, input, true)).toBeNull();
  });
  it("projects frozen conditional evidence on actual meal readers only after opt-in", () => {
    const evidence = { ...nutrition, weight_basis: basis, weight_assumption_codes: assumptions };
    const entry = { id: batch.recipe_id, revision: 1, consumed_at: null, consumed_local_date: "2026-10-13", timezone_name_snapshot: "Asia/Seoul",
      meal_plan_column_id: null, slot_name_snapshot: "식사", source: input.source, quantity: input.quantity, display_name: "요리", display_brand: null,
      nutrition: evidence, created_at: "2026-10-13T00:00:00Z", updated_at: "2026-10-13T00:00:00Z" };
    expect(projectMealLogData({ entry }, false, true)).toEqual({ entry });
    expect(projectMealLogData({ entry })).toEqual({ entry: { ...entry, nutrition } });
    const quantityInput = { schema_version: "quantity-v4", raw_value: "100", raw_unit: "g", numerator: "100", denominator: "1",
      normalized: { amount: 100, unit: "g" }, quality: "direct", reason: null, evidence_ids: [], source_versions: [], batch_basis: null };
    const withQuantity = { ...entry, quantity_input: quantityInput };
    expect(projectMealLogData({ entry: withQuantity })).toEqual({ entry: { ...entry, nutrition } });
    expect(projectMealLogData({ entry: withQuantity }, true)).toEqual({ entry: { ...withQuantity, nutrition } });
    expect(projectMealLogData({ entry: withQuantity }, false, true)).toEqual({ entry });
    expect(projectMealLogData({ entry: withQuantity }, true, true)).toEqual({ entry: withQuantity });
    expect(projectMealLogData({ entry: { ...entry, source: { type: "ingredient", id: batch.id } } }, false, true)).toBeNull();
  });
  it("requires exact display capability and leaves original DTOs for old or unknown requests", () => {
    for (const headers of [undefined, { "X-Homecook-Cooked-Weight-Contract": "evidence-v2" }]) {
      expect(wantsCookedWeightEvidence(new Request("http://fixture.invalid", { headers }))).toBe(false);
    }
    const headers = cookedWeightResponseHeaders({ "X-Existing-Fixture": "kept" });
    expect(headers.get("X-Existing-Fixture")).toBe("kept");
    expect(wantsCookedWeightEvidence(new Request("http://fixture.invalid", { headers }))).toBe(true);
    const value = { ...batch, weight_evidence: { source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [], assumption_codes: assumptions }, weight_evidence_enabled: true };
    expect(projectCookedBatch(value)).toEqual(batch);
    expect(projectCookedBatch(value, true)?.weight_evidence?.assumption_codes).toEqual(assumptions);
  });
  it("lets new preview clients read old-server DTOs and opted-in conditional evidence", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = (value: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: { ...input, nutrition: value }, error: null }) });
    fetcher.mockResolvedValue(response(nutrition));
    expect((await fetchMealLogNutritionPreview(input)).nutrition).toEqual(nutrition);
    const evidence = { ...nutrition, weight_basis: basis, weight_assumption_codes: assumptions };
    fetcher.mockResolvedValue(response(evidence));
    expect((await fetchMealLogNutritionPreview(input)).nutrition).toEqual(evidence);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("X-Homecook-Cooked-Weight-Contract")).toBe("evidence-v1");
  });
});
