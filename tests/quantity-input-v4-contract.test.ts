import { describe, expect, it, vi } from "vitest";
import { isQuantityInputDraft, isQuantityInputSnapshot } from "@/lib/quantity-input";
import { parseMealLogMutationRequest, toMealLogRpcPayload } from "@/lib/server/meal-log";
import { parseMealLogNutritionPreviewQuery } from "@/lib/server/meal-log-nutrition-preview";
import { quantityInputWriteEnabled } from "@/lib/server/quantity-input";

const raw = { schema_version: "quantity-v4" as const, raw_value: "1/3", raw_unit: "mL" };
const body = { consumed_local_date: "2026-10-14", timezone_name_snapshot: "Asia/Seoul", consumed_at: null,
  meal_plan_column_id: "11111111-1111-4111-8111-111111111111", source: { type: "ingredient", id: "22222222-2222-4222-8222-222222222222" },
  quantity: { amount: 1 / 3, unit: "mL" }, quantity_input: raw };
describe("opt-in raw quantity contract", () => {
  it("keeps legacy exact keys and accepts raw fractions only in the new consumer", () => {
    expect(parseMealLogMutationRequest(body, "create").ok).toBe(false);
    const parsed = parseMealLogMutationRequest(body, "create", true);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(toMealLogRpcPayload(parsed.value)).toMatchObject({ quantity_input: raw, quantity: body.quantity });
    for (const patch of [{ raw_value: "1/0" }, { raw_value: "0.33" }, { raw_unit: "" }, { approved: true }, { expected_batch_revision: 1 }]) {
      expect(parseMealLogMutationRequest({ ...body, quantity_input: { ...raw, ...patch } }, "create", true).ok).toBe(false);
    }
  });
  it("uses the same rational validation for preview and mutation", () => {
    const query = new URLSearchParams({ source_type: "ingredient", source_id: body.source.id, amount: String(1 / 3), unit: "mL", raw_value: "1/3" });
    expect(parseMealLogNutritionPreviewQuery(query).ok).toBe(false);
    expect(parseMealLogNutritionPreviewQuery(query, true)).toMatchObject({ ok: true, value: { quantityInput: raw } });
    query.set("amount", "0.33");
    expect(parseMealLogNutritionPreviewQuery(query, true).ok).toBe(false);
    expect(isQuantityInputDraft({ ...raw, source_id: "not-trusted" }, body.quantity)).toBe(false);
    expect(parseMealLogMutationRequest({ ...body, quantity: { amount: 0.2, unit: "L" },
      quantity_input: { ...raw, raw_value: "200", raw_unit: "mL" } }, "create", true).ok).toBe(true);
    // Only the DB can prove a mass/volume or package relationship; source claims remain forbidden.
  });
  it("does not activate from a browser header or an unset/false environment", () => {
    const request = new Request("http://localhost", { headers: { "X-Homecook-Quantity-Contract": "quantity-v4" } });
    for (const value of [undefined, "false"]) {
      vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", value);
      expect(quantityInputWriteEnabled(request)).toBe(false);
    }
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    expect(quantityInputWriteEnabled(new Request("http://localhost"))).toBe(false);
    expect(quantityInputWriteEnabled(request)).toBe(true);
    vi.unstubAllEnvs();
  });
  it("reads frozen raw volume with unavailable normalization and rejects unrecorded claims", () => {
    const snapshot = { ...raw, numerator: "1", denominator: "3", normalized: null,
      quality: "unavailable", reason: "DENSITY_REQUIRED", evidence_ids: [], source_versions: [], batch_basis: null };
    expect(isQuantityInputSnapshot(snapshot)).toBe(true);
    expect(isQuantityInputSnapshot({ ...snapshot, approved: true })).toBe(false);
    expect(isQuantityInputSnapshot({ ...snapshot, denominator: "0" })).toBe(false);
    const displayed = { ...snapshot, display_quantity: { amount: 1 / 3000, unit: "L" } };
    expect(isQuantityInputSnapshot(displayed, displayed.display_quantity)).toBe(true);
    expect(isQuantityInputSnapshot(displayed, { amount: 1 / 3, unit: "L" })).toBe(false);
    expect(isQuantityInputSnapshot(displayed, { amount: 1 / 3000, unit: "g" })).toBe(false);
  });
});
