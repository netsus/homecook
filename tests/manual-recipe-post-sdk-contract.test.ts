import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ManualRecipeDbClient } from "@/app/api/v1/recipes/route";

const mocks = vi.hoisted(() => ({ route: vi.fn(), internal: vi.fn(), bootstrap: vi.fn(), publicUser: vi.fn(), growth: vi.fn(), nutrition: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createRecipeFuturePropagationInternalClient: mocks.internal }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: mocks.publicUser, ensureUserBootstrapState: mocks.bootstrap,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message }));
vi.mock("@/app/api/v1/users/me/_account-generation", () => ({ readAccountGenerationCapability: async () => ({ ok: true, state: "legacy" }) }));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: mocks.growth }));
vi.mock("@/lib/server/recipe-nutrition-service", () => ({ recalculateRecipeNutritionSnapshot: mocks.nutrition }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: async () => ({ ok: true,
  sessionAuthority: { ownerUuid: "550e8400-e29b-41d4-a716-446655440001", authIdentityCreatedAt: "2026-10-19", sessionIssuedAt: "2026-10-19", sessionKeyHash: "a".repeat(64), hmacKeyVersion: 1 } }) }));
vi.mock("@/lib/server/recipe-content-snapshot-future-propagation", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/recipe-content-snapshot-future-propagation")>(),
  calculateRecipeDraftNutrition: async () => ({ nutritionSnapshot: {}, predecessorGuard: {} }),
}));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const recipe = "550e8400-e29b-41d4-a716-446655440002";
const ingredient = "550e8400-e29b-41d4-a716-446655440003";
const method = "550e8400-e29b-41d4-a716-446655440004";
const body = { title: "수동 등록", base_servings: 2,
  ingredients: [{ ingredient_id: ingredient, standard_name: "감자", amount: 10, unit: "g", ingredient_type: "QUANT", display_text: "감자 10g", scalable: true, sort_order: 1 }],
  steps: [{ step_number: 1, instruction: "끓인다", cooking_method_id: method, ingredients_used: [] }],
};
const draft = { title: body.title, description: null, base_servings: 2,
  ingredients: [{ ingredient_id: ingredient, amount: 10, unit: "g", ingredient_type: "QUANT", display_text: "감자 10g", scalable: true,
    component_label: null, food_product_id: null, food_product_nutrition_version_id: null }],
  steps: [{ step_number: 1, instruction: "끓인다", cooking_method_id: method, cooking_method_ids: [method], ingredients_used: [],
    component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
};

function fixture({ rpc = false, malformed = "", quantityError = false, rpcError = false } = {}) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://manual-post.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const verb = init?.method ?? "GET";
      requests.push({ url, method: verb, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown = null;
      let status = 200;
      if (table === "ingredients") data = [{ id: ingredient }];
      else if (table === "cooking_methods") data = [{ id: method, label: "끓이기" }];
      else if (table === "recipes" || table === "create_manual_recipe") {
        data = { id: recipe, title: body.title, source_type: malformed === "source" ? "youtube" : "manual",
          created_by: malformed === "owner" ? null : owner, base_servings: 2 };
        if (rpcError) { data = { code: "42501", message: "fixture denied" }; status = 403; }
      } else if (table === "recipe_ingredients" || table === "recipe_steps") return new Response(null, { status: 201 });
      else if (table === "read_recipe_snapshot_entrypoint_context") {
        data = { revision: 1, fork_context: { base_recipe_revision: 1, draft, image_object_id: null } };
        if (quantityError) { data = { code: "XX000", message: "quantity context failed" }; status = 500; }
      } else if (table === "write_personal_recipe_core") data = { id: recipe, revision: 2 };
      else throw new Error(`Unexpected SDK request ${url.pathname}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const auth = { getUser: async () => ({ data: { user: { id: owner } } }) };
  const client = rpc ? { from: sdk.from.bind(sdk), rpc: sdk.rpc.bind(sdk), auth } : { from: sdk.from.bind(sdk), auth };
  mocks.route.mockResolvedValue(client);
  mocks.internal.mockReturnValue(sdk);
  return { sdk, client, requests };
}
async function post(derived = false) {
  const { POST } = await import("@/app/api/v1/recipes/route");
  return POST(new Request("http://localhost/api/v1/recipes", { method: "POST", headers: {
    "content-type": "application/json", ...(derived ? { "Idempotency-Key": recipe } : {}),
  }, body: JSON.stringify(derived ? { origin_recipe_id: recipe, base_recipe_revision: 1, draft, image_object_id: null } : body) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue(undefined); mocks.publicUser.mockResolvedValue({}); mocks.nutrition.mockResolvedValue({});
});

describe("manual POST native SDK contract", () => {
  it("keeps native insert/select phases and the actual nullable owner/full source enum/unknown JSON", () => {
    const { sdk } = fixture();
    const client: ManualRecipeDbClient = sdk;
    const selected = client.from("recipes").insert({ title: body.title, base_servings: 2, source_type: "manual", created_by: owner, thumbnail_url: null, tags: [] })
      .select("id, title, source_type, created_by, base_servings").maybeSingle();
    const steps = client.from("recipe_steps").select("ingredients_used");
    expectTypeOf<NonNullable<Awaited<typeof selected>["data"]>["source_type"]>().toEqualTypeOf<"system" | "youtube" | "manual">();
    expectTypeOf<NonNullable<Awaited<typeof selected>["data"]>["created_by"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NonNullable<Awaited<typeof steps>["data"]>[number]["ingredients_used"]>().toEqualTypeOf<unknown>();
    expect(selected.then).toBeTypeOf("function"); expect(steps.then).toBeTypeOf("function");
  });
  it("preserves no-RPC recipe→ingredient→step writes and the same bootstrap/growth client", async () => {
    const { requests, client } = fixture();
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { id: recipe, source_type: "manual", created_by: owner } });
    expect(requests.map(({ url, method: verb }) => [url.pathname.split("/").at(-1), verb])).toEqual([
      ["ingredients", "GET"], ["cooking_methods", "GET"], ["recipes", "POST"], ["recipe_ingredients", "POST"], ["recipe_steps", "POST"],
    ]);
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ select: "id", id: `in.(${ingredient})` });
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({ select: "id,label", id: `in.(${method})` });
    expect(requests[2].url.searchParams.get("select")).toBe("id,title,source_type,created_by,base_servings");
    expect(requests[2].body).toMatchObject({ source_type: "manual", created_by: owner, title: body.title });
    expect(mocks.publicUser).toHaveBeenCalledWith(client, { id: owner });
    expect(mocks.growth).toHaveBeenCalledWith(client, expect.objectContaining({ sourceId: recipe }));
  });
  it.each(["source", "owner"])("fails closed on malformed persisted %s before child writes", async malformed => {
    const { requests } = fixture({ malformed });
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR" } });
    expect(requests).toHaveLength(3); expect(mocks.growth).not.toHaveBeenCalled(); expect(mocks.nutrition).not.toHaveBeenCalled();
  });
  it("uses the existing optional RPC instead of direct DML when available", async () => {
    const { requests } = fixture({ rpc: true });
    expect((await post()).status).toBe(201);
    expect(requests.map(({ url }) => url.pathname.split("/").at(-1))).toEqual(["ingredients", "cooking_methods", "create_manual_recipe"]);
    expect(requests[2].body).toMatchObject({ p_user_id: owner, p_title: body.title });
  });
  it("does not fall back to DML after an RPC error", async () => {
    const { requests } = fixture({ rpc: true, rpcError: true });
    expect((await post()).status).toBe(500);
    expect(requests.map(({ url }) => url.pathname.split("/").at(-1))).toEqual(["ingredients", "cooking_methods", "create_manual_recipe"]);
    expect(mocks.growth).not.toHaveBeenCalled();
  });
  it.each([false, true])("preserves derived quantity lookup then fork or stops on lookup error=%s", async quantityError => {
    const { requests } = fixture({ quantityError });
    const response = await post(true);
    expect(response.status).toBe(quantityError ? 409 : 201);
    expect(requests.map(({ url }) => url.pathname.split("/").at(-1))).toEqual(quantityError
      ? ["read_recipe_snapshot_entrypoint_context"] : ["read_recipe_snapshot_entrypoint_context", "write_personal_recipe_core"]);
    if (!quantityError) expect(await response.json()).toEqual({ success: true, data: { id: recipe, revision: 2 }, error: null });
    else {
      expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "UNIT_CONTEXT_STALE" } });
      expect(mocks.growth).not.toHaveBeenCalled();
    }
  });
});
