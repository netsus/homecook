import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookingIngredientRow } from "@/lib/server/cooking";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.create, createRecipeFuturePropagationInternalClient: () => null }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: async () => {}, ensureUserBootstrapState: async () => {}, formatBootstrapErrorMessage: () => "확인 실패" }));
const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const quantity = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "L", numerator: "1", denominator: "3",
  normalized: { amount: 1000 / 3, unit: "ml" }, display_quantity: { amount: 1 / 3, unit: "L" }, quality: "direct", reason: null,
  evidence_ids: [], source_versions: [], batch_basis: null, context_sha256: "a".repeat(64) };
const ingredient: CookingIngredientRow = { id: id(2), ingredient_id: id(3), amount: 1 / 3, unit: "L", ingredient_type: "QUANT", scalable: true,
  display_text: "물 원문", ingredients: { standard_name: "물" }, quantity_input: quantity };

function client({ actor = id(1) as string | null, snapshot = false, foreign = false, product = false } = {}) {
  const row = product ? { ...ingredient, ingredient_id: null, row_key: id(2), source_kind: "food_product", food_product_id: id(5),
    food_product_nutrition_version_id: id(6), food_product_name: "저장 제품", food_product_brand: "저장 업체",
    quantity_input: { ...quantity, source_versions: [id(6)] } } : ingredient;
  const session = { id: id(4), user_id: foreign ? id(9) : id(1), status: "in_progress", contract_version: snapshot ? "snapshot_v2" : "legacy_v1",
    recipe_id: id(7), cooking_servings: 2, recipe_content_snapshot_id: snapshot ? id(8) : null,
    recipe_content_snapshots: snapshot ? { id: id(8), recipe_id: id(7), title: "저장 레시피", base_servings: 2,
      ingredients_json: [row], steps_json: [] } : null };
  const selects = new Map<string, ReturnType<typeof vi.fn>>();
  const from = vi.fn((table: string) => {
    const selected = vi.fn().mockReturnThis(); selects.set(table, selected);
    const result = () => ({ error: null, data: table === "recipes" ? { id: id(7), title: "레시피", base_servings: 2 }
      : table === "cooking_sessions" ? session
      : table === "cooking_session_meals" ? [{ meal_id: id(10), recipe_id: id(7), cooking_servings: 2 }]
      : table === "recipe_ingredients" ? [actor ? row : { ...row, quantity_input: undefined }]
      : table === "ingredients" ? [{ id: id(3), standard_name: "물" }] : [] });
    const query = { select: selected, eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => result()), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return query;
  });
  const result = { auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null } }) }, from,
    rpc: vi.fn(async () => ({ data: [], error: null })) };
  mocks.create.mockResolvedValue(result);
  return { ...result, selects, row };
}
beforeEach(() => vi.clearAllMocks());
describe("cooking quantity read routes", () => {
  it.each([false, true])("reads original metadata from the authenticated session source (snapshot=%s)", async snapshot => {
    const fixture = client({ snapshot });
    const { GET } = await import("@/app/api/v1/cooking/sessions/[session_id]/cook-mode/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/cooking/sessions/" + id(4) + "/cook-mode"), { params: Promise.resolve({ session_id: id(4) }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.recipe.ingredients[0]).toMatchObject({ amount: 1 / 3, display_text: "물 1/3L", quantity_input: quantity });
    if (!snapshot) expect(fixture.selects.get("recipe_ingredients")).toHaveBeenCalledWith(expect.stringContaining("quantity_input"));
  });
  it("preserves a nullable frozen product/version and avoids a null ingredient lookup", async () => {
    const fixture = client({ snapshot: true, product: true });
    const { GET } = await import("@/app/api/v1/cooking/sessions/[session_id]/cook-mode/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/cooking/sessions/" + id(4) + "/cook-mode"), { params: Promise.resolve({ session_id: id(4) }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.recipe.ingredients[0]).toMatchObject({ ingredient_id: null, row_key: id(2), food_product_id: id(5),
      food_product_nutrition_version_id: id(6), quantity_input: fixture.row.quantity_input });
    expect(fixture.from).not.toHaveBeenCalledWith("ingredients");
    expect(fixture.from).not.toHaveBeenCalledWith("food_products");
  });
  it.each([false, true])("preserves authenticated metadata and the existing anonymous projection (anonymous=%s)", async anonymous => {
    const fixture = client({ actor: anonymous ? null : id(1) });
    const { GET } = await import("@/app/api/v1/recipes/[id]/cook-mode/route");
    const response = await GET(new Request("http://localhost/api/v1/recipes/" + id(7) + "/cook-mode?servings=2"), { params: Promise.resolve({ id: id(7) }) });
    expect(response.status).toBe(200);
    const projected = (await response.json()).data.recipe.ingredients[0];
    if (anonymous) {
      expect(fixture.selects.get("recipe_ingredients")).toHaveBeenCalledWith("id, source_kind, ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name)");
      expect(projected).not.toHaveProperty("quantity_input");
      expect(projected.amount).toBe(.33);
    } else {
      expect(fixture.selects.get("recipe_ingredients")).toHaveBeenCalledWith(expect.stringContaining("quantity_input"));
      expect(projected).toMatchObject({ amount: 1 / 3, display_text: "물 1/3L", quantity_input: quantity });
    }
  });
  it.each(["guest", "foreign"])("keeps session access denied for %s", async kind => {
    const fixture = client({ actor: kind === "guest" ? null : id(1), foreign: kind === "foreign" });
    const { GET } = await import("@/app/api/v1/cooking/sessions/[session_id]/cook-mode/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/cooking/sessions/" + id(4) + "/cook-mode"), { params: Promise.resolve({ session_id: id(4) }) });
    expect(response.status).toBe(kind === "guest" ? 401 : 403);
    expect(fixture.from).not.toHaveBeenCalledWith("recipe_ingredients");
  });
});
