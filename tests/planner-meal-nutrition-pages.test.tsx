import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInitialAuthenticatedFromServer: vi.fn(),
  loadPlannerMealNutritionForServer: vi.fn(),
  getServerAuthUser: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/e2e-auth-override", () => ({ readE2EAuthOverrideCookie: () => null }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ getServerAuthUser: mocks.getServerAuthUser }));
vi.mock("@/lib/server/recipe-snapshot-entrypoint", () => ({ readRecipeSnapshotUiMode: () => "enabled" }));
vi.mock("@/lib/auth/server-initial-auth", () => ({
  getInitialAuthenticatedFromServer: mocks.getInitialAuthenticatedFromServer,
}));
vi.mock("@/lib/server/planner-meal-nutrition-view", () => ({
  loadPlannerMealNutritionForServer: mocks.loadPlannerMealNutritionForServer,
}));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/planner/planner-week-screen", () => ({ PlannerWeekScreen: () => null }));
vi.mock("@/components/planner/meal-screen", () => ({ MealScreen: () => null }));

import PlannerPage from "@/app/planner/page";
import MealScreenPage from "@/app/planner/[date]/[columnId]/page";

const nutrition = { "meal-1": { plannedServings: 1, values: {} } };
function childProps(page: React.ReactElement) {
  return (page.props as { children: React.ReactElement<Record<string, unknown>> }).children.props;
}

describe("planner page nutrition ranges", () => {
  afterEach(() => { vi.useRealTimers(); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
    mocks.getInitialAuthenticatedFromServer.mockResolvedValue(true);
    mocks.getServerAuthUser.mockResolvedValue({ id: "verified-owner" });
    mocks.loadPlannerMealNutritionForServer.mockResolvedValue(nutrition);
  });

  it("passes the exact selected week's display map to the weekly screen", async () => {
    const result = await PlannerPage({ searchParams: Promise.resolve({ date: "2026-08-31" }) });
    expect(mocks.loadPlannerMealNutritionForServer).toHaveBeenCalledWith({
      startDate: "2026-08-31", endDate: "2026-09-06",
    });
    expect(childProps(result).initialMealNutrition).toBe(nutrition);
  });

  it("uses the current week for an invalid URL date", async () => {
    await PlannerPage({ searchParams: Promise.resolve({ date: "2026-02-30" }) });
    expect(mocks.loadPlannerMealNutritionForServer).toHaveBeenCalledWith({
      startDate: "2026-09-07", endDate: "2026-09-13",
    });
  });

  it("does not read private nutrition for a guest page", async () => {
    mocks.getInitialAuthenticatedFromServer.mockResolvedValue(false);
    const result = await PlannerPage({ searchParams: Promise.resolve({}) });
    expect(mocks.loadPlannerMealNutritionForServer).not.toHaveBeenCalled();
    expect(childProps(result).initialMealNutrition).toEqual({});
  });

  it("passes the selected single day's display map to the meal screen", async () => {
    const result = await MealScreenPage({
      params: Promise.resolve({ date: "2026-09-09", columnId: "column-1" }),
      searchParams: Promise.resolve({ slot: "아침" }),
    });
    expect(mocks.loadPlannerMealNutritionForServer).toHaveBeenCalledWith({
      startDate: "2026-09-09", endDate: "2026-09-09",
    });
    expect(childProps(result).initialMealNutrition).toBe(nutrition);
  });
});
