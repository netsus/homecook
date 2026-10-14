import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUANTITY_CONTRACT_HEADER } from "@/types/quantity-input";
const mocks = vi.hoisted(() => ({ client: vi.fn(), generation: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.client }));
vi.mock("@/lib/server/account-generation/profile-subject", () => ({ readProfileAccountGeneration: mocks.generation }));
const owner = "a1000000-0000-4000-8000-000000000001";
const source = { row_key: "a1000000-0000-4000-8000-000000000002", ingredient_id: "a1000000-0000-4000-8000-000000000003", food_product_id: null, food_product_nutrition_version_id: null };
const context = { ready: true, context_sha256: "a".repeat(64), raw_default_unit: "mL" };
function request(body: unknown = { sources: [source] }, header = true) {
  return new Request("http://fixture.invalid/api/v1/recipes/quantity-input-context", { method: "POST", headers: { "content-type": "application/json", ...(header ? { [QUANTITY_CONTRACT_HEADER]: "quantity-v4" } : {}) }, body: JSON.stringify(body) });
}
describe("bounded recipe quantity context read", () => {
  beforeEach(() => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    mocks.generation.mockReset().mockResolvedValue(3);
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ id: source.row_key, recipe_quantity_context: context }], error: null });
    mocks.client.mockReset().mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, rpc: mocks.rpc });
  });
  it("derives owner and generation on the server and forwards only fixed IDs to the existing read RPC", async () => {
    const { POST } = await import("@/app/api/v1/recipes/quantity-input-context/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ subject: { owner_uuid: owner, account_generation: 3 }, items: [{ ...source, context }] });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_recipe_product_nutrition_predecessors", {
      p_owner_uuid: owner, p_ingredients: [{ id: source.row_key, ingredient_id: source.ingredient_id,
        food_product_id: null, food_product_nutrition_version_id: null, quantity_options_requested: true }],
    });
  });
  it.each([{}, { sources: [] }, { sources: Array(201).fill(source) }, { owner_uuid: owner, sources: [source] }, { sources: [{ ...source, raw_value: "private text" }] }, { sources: [source, source] }, { sources: [{ ...source, food_product_id: source.row_key }] }])("rejects unbounded or fabricated input before any RPC: %j", async body => {
    const { POST } = await import("@/app/api/v1/recipes/quantity-input-context/route");
    expect((await POST(request(body))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires login and a negotiated header without issuing reads", async () => {
    const { POST } = await import("@/app/api/v1/recipes/quantity-input-context/route");
    expect((await POST(request(undefined, false))).status).toBe(422);
    mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc: mocks.rpc });
    expect((await POST(request())).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps stored input outside the response and reports ready=false when the web gate is OFF", async () => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    const { POST } = await import("@/app/api/v1/recipes/quantity-input-context/route");
    expect((await (await POST(request())).json()).data.items[0].context).toEqual({ ...context, ready: false });
  });
  it("fails closed when generation changes during the read or evidence is malformed", async () => {
    const { POST } = await import("@/app/api/v1/recipes/quantity-input-context/route");
    mocks.generation.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    expect((await POST(request())).status).toBe(409);
    mocks.rpc.mockResolvedValue({ data: [{ id: source.row_key, recipe_quantity_context: { ready: true, context_sha256: "bad" } }], error: null });
    expect((await POST(request())).status).toBe(500);
  });
});
