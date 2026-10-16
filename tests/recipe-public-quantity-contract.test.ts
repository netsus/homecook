import { AuthSessionMissingError, createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHybridAuthorityFetch } from "@/lib/server/hybrid-auth/gateway";
import { beginHybridAuthorityResponseBoundary } from "@/lib/server/hybrid-auth/route-error-context";

const mocks = vi.hoisted(() => ({ route: vi.fn(), increment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: mocks.route, createRemoteCompatibilityServiceRoleClient: () => null,
  createRecipeImageInternalClient: () => null, createRecipeFuturePropagationInternalClient: () => null,
  createRecipeViewInternalClient: () => ({ increment: mocks.increment }),
}));

const recipeId = "00000000-0000-4000-8000-000000000001", ingredientId = "00000000-0000-4000-8000-000000000002";
const snapshot = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g", numerator: "1", denominator: "3",
  normalized: { amount: 1 / 3, unit: "g" }, display_quantity: { amount: 1 / 3, unit: "g" }, quality: "direct", reason: null,
  evidence_ids: [], source_versions: [], batch_basis: null, context_sha256: "b".repeat(64) };

function publicRouteFixture({ privateRecipe = false } = {}) {
  const requests: URL[] = [], remote = vi.fn(), authority = vi.fn();
  const local = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); requests.push(url);
    const table = url.pathname.split("/").at(-1);
    let rows: object[] = [];
    if (table === "recipes" && !privateRecipe) rows = [{ id: recipeId, title: "공개 수량 레시피", description: null, thumbnail_url: null,
      base_servings: 2, tags: [], source_type: "manual", created_by: "00000000-0000-4000-8000-000000000003", visibility: "public", origin_recipe_id: null,
      deleted_at: null, revision: 1, view_count: 1, like_count: 0, save_count: 0, plan_count: 0, cook_count: 0 }];
    if (table === "recipe_ingredients") rows = [{ id: ingredientId, source_kind: "ingredient", ingredient_id: ingredientId,
      amount: 1 / 3, unit: "g", ingredient_type: "QUANT", display_text: null, component_label: null, scalable: true, sort_order: 0,
      ingredients: { standard_name: "식재료" }, ...(url.searchParams.get("select")?.split(",").includes("quantity_input") ? { quantity_input: snapshot } : {}) }];
    return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
  });
  const gateway = createHybridAuthorityFetch({ getAccessToken: async () => null, remoteLivenessFetch: remote, localUpstreamFetch: local,
    assertSessionAuthority: authority, auth: { issuer: "https://synthetic.invalid/auth/v1", url: "https://synthetic.invalid", publishableKey: "synthetic-key" },
    attestationSecret: "synthetic-fixture-secret-32-characters", anonymousPublicReadScope: "recipe-detail" });
  const client = createClient("http://127.0.0.1:1", "synthetic-key", { auth: { persistSession: false }, global: { fetch: gateway } });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
  mocks.route.mockImplementation(async () => { beginHybridAuthorityResponseBoundary(); return client; });
  return { requests, remote, authority, local };
}

async function readDetail(contract: boolean, preview = true) {
  const { GET } = await import("@/app/api/v1/recipes/[id]/route");
  const response = await GET(new Request(`https://synthetic.invalid/api/v1/recipes/${recipeId}${preview ? "?view=preview" : ""}`,
    { headers: contract ? { "X-Homecook-Quantity-Contract": "quantity-v4" } : {} }), { params: Promise.resolve({ id: recipeId }) });
  return { response, body: await response.json() };
}

describe("public recipe quantity contract through the actual API and anonymous gateway", () => {
  beforeEach(() => { mocks.route.mockReset(); mocks.increment.mockReset(); mocks.increment.mockResolvedValue({ data: null, error: null }); });
  it("returns public raw fraction metadata with the quantity header without requesting a session", async () => {
    const f = publicRouteFixture(), result = await readDetail(true);
    expect(result.response.status).toBe(200); expect(result.body.error).toBeNull();
    expect(result.body.data.ingredients[0].quantity_input).toEqual(snapshot);
    expect(f.remote).not.toHaveBeenCalled(); expect(f.authority).not.toHaveBeenCalled(); expect(mocks.increment).not.toHaveBeenCalled();
    expect(f.requests.find(x => x.pathname.endsWith("/recipe_ingredients"))?.searchParams.get("select")).toBe("quantity_input,id,source_kind,ingredient_id,amount,unit,ingredient_type,display_text,component_label,scalable,sort_order,ingredients(standard_name)");
  });
  it("preserves the old headerless DTO and ordinary detail view semantics", async () => {
    const f = publicRouteFixture(), result = await readDetail(false, false);
    expect(result.response.status).toBe(200); expect(result.body.data.ingredients[0]).not.toHaveProperty("quantity_input");
    expect(f.requests.find(x => x.pathname.endsWith("/recipe_ingredients"))?.searchParams.get("select")).not.toContain("quantity_input");
    expect(mocks.increment).toHaveBeenCalledExactlyOnceWith(recipeId);
  });
  it("preserves the anonymous RLS-empty private/foreign recipe response without reading child data", async () => {
    const f = publicRouteFixture({ privateRecipe: true }), result = await readDetail(true);
    expect(result.response.status).toBe(404); expect(result.body.data).toBeNull(); expect(result.body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(f.requests.some(x => x.pathname.endsWith("/recipe_ingredients"))).toBe(false); expect(mocks.increment).not.toHaveBeenCalled();
  });
});
