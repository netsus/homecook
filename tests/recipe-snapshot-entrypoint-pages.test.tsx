import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const readRecipeSnapshotUiMode = vi.fn();
const readRecipeSnapshotForkContext = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const createServerComponentClient = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const cookies = vi.fn();

vi.mock("@/lib/server/recipe-snapshot-entrypoint", () => ({
  readRecipeSnapshotForkContext,
  readRecipeSnapshotUiMode,
}));
vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv }));
vi.mock("@/lib/supabase/server", () => ({
  createPublicDataClient: vi.fn(),
  createServerComponentClient,
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
    createServerComponentClient.mockReset();
    hasSupabasePublicEnv.mockReset();
    hasSupabasePublicEnv.mockReturnValue(false);
    readRecipeSnapshotForkContext.mockReset();
    readRecipeSnapshotUiMode.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    cookies.mockReset();
    cookies.mockResolvedValue({ get: vi.fn() });
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
    expect(markup).not.toContain("initialForkContext");
    expect(readRecipeSnapshotForkContext).not.toHaveBeenCalled();
    expect(markup).not.toContain("personal_recipe_v2");
    expect(markup).not.toContain("snapshot_v2_creation");
  });

  it("projects a fresh authenticated public fork context without raw capability props", async () => {
    const user = {
      created_at: "2026-08-01T00:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440001",
    };
    const authority = {
      authIdentityCreatedAt: user.created_at,
      hmacKeyVersion: 1,
      ownerUuid: user.id,
      sessionIssuedAt: "2026-08-22T00:00:00.000Z",
      sessionKeyHash: "a".repeat(64),
    };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    };
    const forkContext = {
      base_recipe_revision: 12,
      draft: {
        title: "공개 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      image_object_id: null,
    };
    hasSupabasePublicEnv.mockReturnValue(true);
    createServerComponentClient.mockResolvedValue(client);
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: authority,
    });
    readRecipeSnapshotUiMode.mockResolvedValue("snapshot_v2");
    readRecipeSnapshotForkContext.mockResolvedValue(forkContext);

    const { default: RecipePage } = await import("@/app/recipe/[id]/page");
    const element = await RecipePage({
      params: Promise.resolve({ id: "recipe-1" }),
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('&quot;initialForkContext&quot;');
    expect(markup).toContain('&quot;base_recipe_revision&quot;:12');
    expect(readRecipeSnapshotForkContext).toHaveBeenCalledWith({
      client: undefined,
      recipeId: "recipe-1",
      sessionAuthority: authority,
    });
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
