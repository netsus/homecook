import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ route: vi.fn(), session: vi.fn(), rpc: vi.fn(), mode: vi.fn(), nutrition: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: api.route,
  createRecipeFuturePropagationInternalClient: () => ({ rpc: api.rpc, from: vi.fn() }) }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: api.session }));
vi.mock("@/lib/server/recipe-snapshot-entrypoint", async original => ({
  ...await original<typeof import("@/lib/server/recipe-snapshot-entrypoint")>(), readRecipeQuantityMode: api.mode,
}));
vi.mock("@/lib/server/recipe-content-snapshot-future-propagation", async original => ({
  ...await original<typeof import("@/lib/server/recipe-content-snapshot-future-propagation")>(), calculateRecipeDraftNutrition: api.nutrition,
}));

const owner = "c9000000-0000-4000-8000-000000000001";
const recipe = "c9000000-0000-4000-8000-000000000002";
const key = "c9000000-0000-4000-8000-000000000003";
const session = { ownerUuid: owner, authIdentityCreatedAt: "2026-01-01T00:00:00Z", sessionIssuedAt: "2026-10-15T00:00:00Z",
  sessionKeyHash: "b".repeat(64), hmacKeyVersion: 1 };
const body = { base_recipe_revision: 1, draft: { title: "개인 레시피 수정", base_servings: 2,
  ingredients: [{ ingredient_id: "c9000000-0000-4000-8000-000000000004", standard_name: "재료", amount: .25, unit: "kg",
    ingredient_type: "QUANT", scalable: true, sort_order: 0, quantity_input: {
      schema_version: "quantity-v4", raw_value: "1/4", raw_unit: "kg", expected_context_sha256: "a".repeat(64) } }],
  steps: [{ step_number: 1, instruction: "섞어요.", ingredients_used: [] }] },
  future_plan_strategy: "keep", impact_token: "original-preview-token" };
const result = { success: true, data: { id: recipe, revision: 2 }, error: null };
const requestBody = { ...body, draft: { ...body.draft, description: null }, image_object_id: null };
async function patch(value: unknown = body, quantityContract: string | null = "quantity-v4", requestKey = key, pathId = recipe) {
  const { PATCH } = await import("@/app/api/v1/recipes/[id]/route");
  const headers = new Headers({ "content-type": "application/json", "Idempotency-Key": requestKey });
  if (quantityContract) headers.set("X-Homecook-Quantity-Contract", quantityContract);
  return PATCH(new Request(`http://fixture.invalid/api/v1/recipes/${pathId}`, { method: "PATCH", headers, body: JSON.stringify(value) }),
    { params: Promise.resolve({ id: pathId }) });
}

describe("recipe PATCH exact original HTTP success replay", () => {
  beforeEach(() => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    api.route.mockReset().mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner, created_at: session.authIdentityCreatedAt } } }) } });
    api.session.mockReset().mockResolvedValue({ ok: true, sessionAuthority: session });
    api.mode.mockReset().mockResolvedValue(true);
    api.nutrition.mockReset().mockResolvedValue({ nutritionSnapshot: { calculation_version: "recipe-nutrition-v4" }, predecessorGuard: { recipe_ingredients: [] } });
    api.rpc.mockReset().mockImplementation(async name => ({ data: name === "read_recipe_future_patch_result" ? { state: "absent", result: null } : result, error: null }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads committed success before mutable revision/context preparation and invokes mutation only once", async () => {
    expect((await patch()).status).toBe(200);
    api.mode.mockRejectedValue(new Error("Current context changed after commit"));
    api.rpc.mockImplementation(async name => ({ data: name === "read_recipe_future_patch_result" ? { state: "succeeded", result } : result, error: null }));
    const replay = await patch(); expect(replay.status).toBe(200); expect(await replay.json()).toEqual(result);
    expect(api.mode).toHaveBeenCalledTimes(1); expect(api.nutrition).toHaveBeenCalledTimes(1);
    expect(api.rpc.mock.calls.filter(([name]) => name.startsWith("write_"))).toHaveLength(1);
  });

  it("uses one canonical recipe identity for uppercase and lowercase UUID paths", async () => {
    expect((await patch(body, "quantity-v4", key, recipe.toUpperCase())).status).toBe(200);
    api.rpc.mockResolvedValue({ data: { state: "succeeded", result }, error: null });
    expect((await patch(body, "quantity-v4", key, recipe.toUpperCase())).status).toBe(200);
    expect((await patch()).status).toBe(200);
    expect(api.rpc.mock.calls.every(([, args]) => args.p_recipe_id === recipe)).toBe(true);
    expect(api.nutrition).toHaveBeenCalledOnce();
  });

  it("recovers the same raw request while the environment is OFF without reading capability or preparing nutrition", async () => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    api.rpc.mockResolvedValue({ data: { state: "succeeded", result }, error: null });
    const response = await patch(); expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith("read_recipe_future_patch_result", expect.objectContaining({ p_recipe_id: recipe,
      p_request_body: requestBody, p_quantity_contract: "quantity-v4", p_idempotency_key: key, p_owner_uuid: owner }));
    expect(api.mode).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });

  it("binds the same normalized whole request to read and write while leaving prepared data separate", async () => {
    expect((await patch()).status).toBe(200);
    expect(api.rpc.mock.calls.map(([name]) => name)).toEqual(["read_recipe_future_patch_result", "write_recipe_future_plan_change_recoverable"]);
    const read = api.rpc.mock.calls[0][1]; const write = api.rpc.mock.calls[1][1];
    expect(read.p_request_body).toEqual(requestBody); expect(write.p_request_body).toBe(read.p_request_body);
    expect(write).toEqual({ ...read, p_nutrition_snapshot: { calculation_version: "recipe-nutrition-v4" }, p_nutrition_predecessor_guard: { recipe_ingredients: [] } });
    expect(read).not.toHaveProperty("p_nutrition_snapshot");
  });

  it("keeps a new absent raw request blocked while OFF after its valid authority/result read", async () => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    expect((await patch()).status).toBe(422);
    expect(api.session).toHaveBeenCalledOnce(); expect(api.rpc.mock.calls.map(([name]) => name)).toEqual(["read_recipe_future_patch_result"]);
    expect(api.mode).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });

  it("keeps static invalid raw requests outside session and receipt lookup", async () => {
    const invalid = structuredClone(body); invalid.draft.ingredients[0].quantity_input.raw_value = "1/0";
    expect((await patch(invalid)).status).toBe(422); expect(api.session).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  });

  it("requires current verified ownership even when a previous result exists and writes are OFF", async () => {
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    api.session.mockResolvedValue({ ok: false }); api.rpc.mockResolvedValue({ data: { state: "succeeded", result }, error: null });
    expect((await patch()).status).toBe(409); expect(api.rpc).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });

  it.each([
    ["IDEMPOTENCY_KEY_REUSED", 409], ["ACCOUNT_GENERATION_STALE", 409], ["RESOURCE_NOT_FOUND", 404], ["FORBIDDEN", 403], ["transport failed", 500],
  ])("does not turn reader error %s into an absent request", async (message, status) => {
    api.rpc.mockResolvedValue({ data: null, error: { message } });
    expect((await patch()).status).toBe(status); expect(api.rpc.mock.calls.map(([name]) => name)).toEqual(["read_recipe_future_patch_result"]);
    expect(api.mode).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });

  it.each([
    { state: "absent", result }, { state: "pending", result: null }, { state: "succeeded", result: null },
    { state: "succeeded", result: { ...result, data: { id: key, revision: 2 } } },
    { state: "succeeded", result: { ...result, data: { id: recipe, revision: 0 } } },
    { state: "absent", result: null, untrusted: true },
  ])("fails closed on malformed internal read $state/$result", async value => {
    api.rpc.mockResolvedValue({ data: value, error: null });
    expect((await patch()).status).toBe(500); expect(api.rpc).toHaveBeenCalledOnce();
    expect(api.mode).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });

  it("treats a thrown reader transport failure as an error without preparing or writing", async () => {
    api.rpc.mockRejectedValue(new Error("offline")); expect((await patch()).status).toBe(500);
    expect(api.mode).not.toHaveBeenCalled(); expect(api.nutrition).not.toHaveBeenCalled();
  });
});
