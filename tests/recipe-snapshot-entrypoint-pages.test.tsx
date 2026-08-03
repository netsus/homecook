import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readRecipeSnapshotUiMode = vi.fn();
const getServerAuthUser = vi.fn();
const cookies = vi.fn();

vi.mock("@/lib/server/recipe-snapshot-entrypoint", () => ({
  readRecipeSnapshotUiMode,
}));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createPublicDataClient: vi.fn(),
  getServerAuthUser,
}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/recipe/recipe-detail-screen", () => ({
  RecipeDetailScreen: (props: Record<string, unknown>) => (
    <div data-testid="recipe-page-props">{JSON.stringify(props)}</div>
  ),
}));
vi.mock("@/components/planner/meal-screen", () => ({
  MealScreen: (props: Record<string, unknown>) => (
    <div data-testid="meal-page-props">{JSON.stringify(props)}</div>
  ),
}));

describe("actual recipe snapshot page entrypoints", () => {
  beforeEach(() => {
    vi.resetModules();
    readRecipeSnapshotUiMode.mockReset();
    getServerAuthUser.mockReset();
    cookies.mockReset();
    cookies.mockResolvedValue({ get: vi.fn() });
    getServerAuthUser.mockResolvedValue(null);
  });

  it("supplies only the derived UI mode to the real RECIPE_DETAIL screen", async () => {
    readRecipeSnapshotUiMode.mockResolvedValue("snapshot_v2");
    const { default: RecipePage } = await import("@/app/recipe/[id]/page");
    const element = await RecipePage({
      params: Promise.resolve({ id: "recipe-1" }),
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('&quot;recipeSnapshotUiMode&quot;:&quot;snapshot_v2&quot;');
    expect(markup).not.toContain("personal_recipe_v2");
    expect(markup).not.toContain("snapshot_v2_creation");
  });

  it("supplies the fail-closed derived mode to the real MEAL_SCREEN", async () => {
    readRecipeSnapshotUiMode.mockResolvedValue("legacy_v1");
    const { default: MealScreenPage } = await import(
      "@/app/planner/[date]/[columnId]/page"
    );
    const element = await MealScreenPage({
      params: Promise.resolve({ date: "2026-08-04", columnId: "column-1" }),
      searchParams: Promise.resolve({ slot: "저녁" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('&quot;recipeSnapshotUiMode&quot;:&quot;legacy_v1&quot;');
    expect(markup).not.toContain("personal_recipe_v2");
    expect(markup).not.toContain("snapshot_v2_creation");
  });
});
