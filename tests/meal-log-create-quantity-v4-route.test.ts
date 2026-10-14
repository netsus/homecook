import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/meal-log/entries/route";
import { QUANTITY_CONTRACT_HEADER } from "@/types/quantity-input";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
const owner = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/server/meal-log-route", () => ({
  authorizeMealLogRequest: async () => ({ ok: true, client: { rpc: mocks.rpc }, authorityArgs: { p_owner_uuid: owner } }),
  readMealLogJson: async (request: Request) => ({ ok: true, value: await request.json() }),
}));
const key = "11111111-1111-4111-8111-111111111114";
const entry = {
  id: "11111111-1111-4111-8111-111111111119", revision: 1, consumed_at: null,
  consumed_local_date: "2026-10-14", timezone_name_snapshot: "Asia/Seoul",
  meal_plan_column_id: "11111111-1111-4111-8111-111111111113", slot_name_snapshot: "점심",
  source: { type: "cooked_batch", id: "11111111-1111-4111-8111-111111111112" },
  quantity: { amount: 0.5, unit: "g" }, quantity_input: null, display_name: "이전 요리", display_brand: null,
  nutrition: { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null },
  created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z",
};
const scalar = { consumed_local_date: entry.consumed_local_date, timezone_name_snapshot: entry.timezone_name_snapshot,
  consumed_at: null, meal_plan_column_id: entry.meal_plan_column_id, source: entry.source, quantity: entry.quantity };
const raw = { schema_version: "quantity-v4", raw_value: "1/2", raw_unit: "g" };
const success = (value: unknown) => ({ data: { success: true, data: { entry: value }, error: null }, error: null });
function request(body: unknown) {
  return new Request("http://fixture.invalid/api/v1/meal-log/entries", { method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key, [QUANTITY_CONTRACT_HEADER]: "quantity-v4" },
    body: JSON.stringify(body) });
}
beforeEach(() => { mocks.rpc.mockReset(); vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("explicit raw meal creation and legacy compatibility", () => {
  it("does not let the legacy handled success erase raw input from an unconfirmed batch", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "create_legacy_leftover_meal_log_entry"
      ? success(entry) : { data: null, error: { message: "CONFLICT" } });
    const response = await POST(request({ ...scalar, quantity_input: raw }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_meal_log_entry", expect.objectContaining({
      p_owner_uuid: owner, p_action: "create", p_idempotency_key: key, p_payload: { ...scalar, quantity_input: raw },
    }));
  });
  it("preserves the exact fraction when the v4 writer accepts a fixed batch", async () => {
    const input = { ...raw, expected_batch_revision: 1 };
    const snapshot = { ...raw, numerator: "1", denominator: "2", normalized: entry.quantity, quality: "direct", reason: null,
      evidence_ids: [], source_versions: [], batch_basis: { batch_id: entry.source.id, revision: 1, cooking_servings: 4, finished_weight_g: 1000, weight_source: "estimated" } };
    mocks.rpc.mockImplementation(async (name: string) => success(name === "mutate_meal_log_entry" ? { ...entry, quantity_input: snapshot } : entry));
    const response = await POST(request({ ...scalar, quantity_input: input }));
    expect(response.status).toBe(201);
    expect((await response.json()).data.entry.quantity_input).toEqual(snapshot);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("mutate_meal_log_entry");
    expect(mocks.rpc.mock.calls[0][1].p_payload.quantity_input).toEqual(input);
  });
  it("returns the DB policy rejection without falling back to legacy success", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "create_legacy_leftover_meal_log_entry"
      ? success(entry) : { data: null, error: { message: "UNIT_POLICY_INACTIVE" } });
    const response = await POST(request({ ...scalar, quantity_input: raw }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("UNIT_POLICY_INACTIVE");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("mutate_meal_log_entry");
  });
  it("rejects raw requests before any RPC when web policy is OFF", async () => {
    for (const value of [undefined, "false"]) {
      vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", value);
      expect((await POST(request({ ...scalar, quantity_input: raw }))).status).toBe(422);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps scalar legacy creation and the same-key result replay available while OFF", async () => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    mocks.rpc.mockResolvedValue(success(entry));
    const responses = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await POST(request(scalar));
      expect(response.status).toBe(201); responses.push(await response.json());
    }
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[0].data.entry.quantity).toEqual(entry.quantity);
    expect(responses[0].data.entry).not.toHaveProperty("quantity_input");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const [name, args] of mocks.rpc.mock.calls) {
      expect(name).toBe("create_legacy_leftover_meal_log_entry");
      expect(args.p_idempotency_key).toBe(key); expect(args.p_payload).toEqual(scalar);
    }
  });
  it("retains the scalar handled-false fallback for known snapshot batches", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { handled: false }, error: null }).mockResolvedValueOnce(success(entry));
    expect((await POST(request(scalar))).status).toBe(201);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["create_legacy_leftover_meal_log_entry", "mutate_meal_log_entry"]);
    expect(mocks.rpc.mock.calls[1][1].p_payload).toEqual(scalar);
  });
  it("does not retry a failed scalar legacy request through another writer", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "CONFLICT" } });
    expect((await POST(request(scalar))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("create_legacy_leftover_meal_log_entry");
  });
});
