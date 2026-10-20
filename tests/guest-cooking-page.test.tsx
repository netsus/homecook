import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/cooking/recipes/[recipe_id]/cook-mode/page";
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server-initial-auth", () => ({ getInitialAuthenticatedFromServer: auth }));
vi.mock("@/components/cooking/recipe-cooking-entry", () => ({ RecipeCookingEntry: () => null }));
beforeEach(() => { auth.mockReset().mockResolvedValue(true); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
it("allows a guide-only URL without invoking account session creation or authentication", async () => {
  const page = await Page({ params: Promise.resolve({ recipe_id: "recipe-1" }), searchParams: Promise.resolve({ servings: "3", guest: "1" }) });
  expect(page.props).toMatchObject({ initialAuthenticated: false, recipeId: "recipe-1", servings: 3 });
  expect(auth).not.toHaveBeenCalled();
});
it("keeps authenticated direct links on their existing session entry", async () => {
  const page = await Page({ params: Promise.resolve({ recipe_id: "recipe-1" }), searchParams: Promise.resolve({ servings: "2" }) });
  expect(page.props).toMatchObject({ initialAuthenticated: true, recipeId: "recipe-1", servings: 2 });
  expect(auth).toHaveBeenCalledTimes(1);
});
