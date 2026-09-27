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
});
