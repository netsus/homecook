import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerComponentClient: vi.fn(),
  hasSupabasePublicEnv: vi.fn(),
  readPlannerRecipeNutritionEntries: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerComponentClient: mocks.createServerComponentClient,
}));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: mocks.hasSupabasePublicEnv }));
vi.mock("@/lib/server/planner-nutrition-summary", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/planner-nutrition-summary")>(),
  readPlannerRecipeNutritionEntries: mocks.readPlannerRecipeNutritionEntries,
}));

import { loadPlannerMealNutritionForServer } from "@/lib/server/planner-meal-nutrition-view";

const range = { startDate: "2026-09-07", endDate: "2026-09-13" };

describe("planner RSC meal nutrition authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabasePublicEnv.mockReturnValue(true);
    mocks.readPlannerRecipeNutritionEntries.mockResolvedValue([{
      mealId: "meal-1", plannedServings: 2,
      entry: { values: { energy_kcal: { amount: 450, known_amount: null,
        status: "complete", display_mode: "total" } }, sources: ["private metadata"] },
    }]);
  });

  it("loads only the verified user's pins and serializes only display data", async () => {
    const db = { auth: { getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "verified-owner" } }, error: null,
    }) } };
    mocks.createServerComponentClient.mockResolvedValue(db);
    const result = await loadPlannerMealNutritionForServer(range);
    expect(db.auth.getUser).toHaveBeenCalledOnce();
    expect(mocks.readPlannerRecipeNutritionEntries).toHaveBeenCalledWith(db, "verified-owner", range);
    expect(result).toEqual({ "meal-1": { plannedServings: 2, totalWeightGrams: null, values: {
      energy_kcal: { amount: 450, known_amount: null, status: "complete", display_mode: "total" },
    } } });
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "unverified-owner" } }, error: { message: "secret auth detail" } },
  ])("does not query private nutrition when authentication fails", async (authResult) => {
    mocks.createServerComponentClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue(authResult) },
    });
    await expect(loadPlannerMealNutritionForServer(range)).resolves.toEqual({});
    expect(mocks.readPlannerRecipeNutritionEntries).not.toHaveBeenCalled();
  });

  it("returns an empty view when server configuration is absent", async () => {
    mocks.hasSupabasePublicEnv.mockReturnValue(false);
    await expect(loadPlannerMealNutritionForServer(range)).resolves.toEqual({});
    expect(mocks.createServerComponentClient).not.toHaveBeenCalled();
  });

  it("returns an empty view without exposing database failure details", async () => {
    mocks.createServerComponentClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "verified-owner" } }, error: null,
    }) } });
    mocks.readPlannerRecipeNutritionEntries.mockRejectedValue(new Error("private database payload"));
    await expect(loadPlannerMealNutritionForServer(range)).resolves.toEqual({});
  });
});
