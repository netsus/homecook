import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/meals/[meal_id]/recipe-snapshot/route";

const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mock.create }));
const mealId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ meal_id: mealId }) };
const request = new Request("http://localhost/api/v1/meals/" + mealId + "/recipe-snapshot");
const meal = {
  id: mealId, user_id: "owner", recipe_id: "recipe", planned_servings: 2, recipe_content_snapshot_id: "old-pin",
  recipe_content_snapshots: { id: "old-pin", recipe_id: "recipe", owner_user_id: "owner", title: "변경 전 레시피", base_servings: 2, ingredients_json: [], steps_json: [] },
};
function client(row: unknown = meal, user: { id: string } | null = { id: "owner" }, error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error }) };
  const instance = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from: vi.fn().mockReturnValue(query) };
  mock.create.mockResolvedValue(instance);
  return { instance, query };
}

beforeEach(() => vi.clearAllMocks());
describe("owned plan snapshot route", () => {
  it("returns the saved revision and scopes the query to the session owner", async () => {
    const { instance, query } = client();
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.title).toBe("변경 전 레시피");
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(instance.from).toHaveBeenCalledExactlyOnceWith("meals");
  });
  it("does not read data for a logged-out user", async () => {
    const { instance } = client(meal, null);
    expect((await GET(request, context)).status).toBe(401);
    expect(instance.from).not.toHaveBeenCalled();
  });
  it("hides another owner's plan even if a broken query returned it", async () => {
    client({ ...meal, user_id: "another" });
    expect((await GET(request, context)).status).toBe(404);
  });
  it("never falls back to current recipe content when a pin is absent", async () => {
    const { instance } = client({ ...meal, recipe_content_snapshot_id: null });
    const response = await GET(request, context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SNAPSHOT_UNAVAILABLE");
    expect(instance.from).not.toHaveBeenCalledWith("recipes");
  });
  it("preserves the authority outage status instead of reporting a missing plan", async () => {
    client(null, { id: "owner" }, { publicCode: "ACCOUNT_LIFECYCLE_MAINTENANCE", publicStatus: 503 });
    expect((await GET(request, context)).status).toBe(503);
  });
  const product = { ingredient_id: null, row_key: "00000000-0000-4000-8000-000000000010", source_kind: "food_product", food_product_id: "00000000-0000-4000-8000-000000000011",
    food_product_nutrition_version_id: "00000000-0000-4000-8000-000000000012", food_product_name: "원래 제품", food_product_brand: "등록업체",
    amount: 0.125, unit: "kg", ingredient_type: "QUANT", display_text: "원문 그대로", scalable: true, sort_order: 0 };
  function ingredientsClient(ingredients: object[], owner = "owner") {
    const row = { ...meal, planned_servings: 3, recipe_content_snapshots: { ...meal.recipe_content_snapshots, owner_user_id: owner, ingredients_json: ingredients } };
    const { instance, query } = client(row);
    const labels = { select: vi.fn().mockReturnThis(), in: vi.fn(async (_field: string, ids: Array<string | null>) => ids.includes(null)
      ? { data: null, error: { code: "22P02", message: "owned fixture null UUID rejected" } }
      : { data: ids.map(id => ({ id, standard_name: "두부" })), error: null }) };
    instance.from.mockImplementation(table => {
      if (table === "meals") return query;
      if (table === "ingredients") return labels;
      throw new Error("Unexpected current recipe/product lookup");
    });
    return { instance, query, labels };
  }
  it("skips label lookup for product-only snapshots and preserves the exact fixed product/version and scaled quantity", async () => {
    const { instance, labels } = ingredientsClient([product]);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.ingredients[0]).toMatchObject({ ingredient_id: null, source_kind: "food_product",
      food_product_id: product.food_product_id, food_product_nutrition_version_id: product.food_product_nutrition_version_id, amount: 0.1875, unit: "kg" });
    expect(instance.from).toHaveBeenCalledExactlyOnceWith("meals"); expect(labels.in).not.toHaveBeenCalled();
  });
  it("requests only distinct non-null ingredient IDs in a mixed saved snapshot", async () => {
    const general = { ingredient_id: "00000000-0000-4000-8000-000000000020", amount: 100, unit: "g", ingredient_type: "QUANT", scalable: true, sort_order: 1 };
    const { instance, labels } = ingredientsClient([product, general, general]);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(labels.in).toHaveBeenCalledExactlyOnceWith("id", [general.ingredient_id]);
    expect(instance.from.mock.calls.map(([name]) => name)).toEqual(["meals", "ingredients"]);
    expect((await response.json()).data.ingredients[1]).toMatchObject({ ingredient_id: general.ingredient_id, standard_name: "두부", amount: 150, unit: "g" });
  });
  it("still rejects a foreign private snapshot before looking up any labels", async () => {
    const { instance, labels } = ingredientsClient([product], "foreign-owner");
    expect((await GET(request, context)).status).toBe(409);
    expect(instance.from).toHaveBeenCalledExactlyOnceWith("meals"); expect(labels.in).not.toHaveBeenCalled();
  });
});
