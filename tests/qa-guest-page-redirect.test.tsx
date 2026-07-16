import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn(async () => ({}));
const getServerAuthUser = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const readE2EAuthOverrideCookie = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/auth/e2e-auth-override", () => ({ readE2EAuthOverrideCookie }));
vi.mock("@/lib/feature-flags", () => ({ isYoutubeImportEnabled: () => true }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv }));
vi.mock("@/lib/supabase/server", () => ({ getServerAuthUser }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/planner/meal-screen", () => ({
  MealScreen: () => <div data-testid="meal-screen" />,
}));
vi.mock("@/components/shopping/shopping-flow-screen", () => ({
  ShoppingFlowScreen: () => <div data-testid="shopping-flow-screen" />,
}));
vi.mock("@/components/planner/menu-add-screen", () => ({
  MenuAddScreen: () => <div data-testid="menu-add-screen" />,
}));
vi.mock("@/components/recipe/manual-recipe-create-screen", () => ({
  ManualRecipeCreateScreen: () => <div data-testid="manual-recipe-create-screen" />,
}));
vi.mock("@/components/recipe/youtube-import-screen", () => ({
  YoutubeImportScreen: () => <div data-testid="youtube-import-screen" />,
}));

async function importMealScreenPage() {
  return import("@/app/planner/[date]/[columnId]/page");
}

async function importShoppingFlowPage() {
  return import("@/app/shopping/flow/page");
}

async function importMenuAddPage() {
  return import("@/app/menu-add/page");
}

async function importManualRecipeCreatePage() {
  return import("@/app/menu/add/manual/page");
}

async function importYoutubeImportPage() {
  return import("@/app/menu/add/youtube/page");
}

describe("explicit QA guest page redirects without Supabase env", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerAuthUser.mockReset();
    hasSupabasePublicEnv.mockReset();
    readE2EAuthOverrideCookie.mockReset();
    notFound.mockClear();
    redirect.mockClear();
    hasSupabasePublicEnv.mockReturnValue(false);
    vi.stubGlobal("React", React);
  });

  it("redirects the meal screen QA guest while preserving the return path", async () => {
    readE2EAuthOverrideCookie.mockReturnValue("guest");
    const { default: MealScreenPage } = await importMealScreenPage();

    await expect(MealScreenPage({
      params: Promise.resolve({ date: "2026-04-18", columnId: "column-1" }),
      searchParams: Promise.resolve({ slot: "아침" }),
    })).rejects.toThrow("NEXT_REDIRECT:/login?next=");

    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=/));
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the existing env-less local meal screen behavior without an override", async () => {
    readE2EAuthOverrideCookie.mockReturnValue(null);
    const { default: MealScreenPage } = await importMealScreenPage();

    const result = await MealScreenPage({
      params: Promise.resolve({ date: "2026-04-18", columnId: "column-1" }),
      searchParams: Promise.resolve({ slot: "아침" }),
    });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("redirects the shopping flow QA guest without Supabase env", async () => {
    readE2EAuthOverrideCookie.mockReturnValue("guest");
    const { default: ShoppingFlowPage } = await importShoppingFlowPage();

    await expect(ShoppingFlowPage()).rejects.toThrow("NEXT_REDIRECT:/login?next=");

    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=/));
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the existing env-less local shopping flow behavior without an override", async () => {
    readE2EAuthOverrideCookie.mockReturnValue(null);
    const { default: ShoppingFlowPage } = await importShoppingFlowPage();

    const result = await ShoppingFlowPage();

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("redirects the menu-add QA guest without Supabase env", async () => {
    readE2EAuthOverrideCookie.mockReturnValue("guest");
    const { default: MenuAddPage } = await importMenuAddPage();

    await expect(MenuAddPage({
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_REDIRECT:/login?next=");

    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fmenu-add");
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the existing env-less local menu-add behavior without an override", async () => {
    readE2EAuthOverrideCookie.mockReturnValue(null);
    const { default: MenuAddPage } = await importMenuAddPage();

    const result = await MenuAddPage({
      searchParams: Promise.resolve({}),
    });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("redirects the manual recipe QA guest without Supabase env", async () => {
    readE2EAuthOverrideCookie.mockReturnValue("guest");
    const { default: ManualRecipeCreatePage } = await importManualRecipeCreatePage();

    await expect(ManualRecipeCreatePage({
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_REDIRECT:/login?next=");

    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fmenu%2Fadd%2Fmanual");
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the existing env-less local manual recipe behavior without an override", async () => {
    readE2EAuthOverrideCookie.mockReturnValue(null);
    const { default: ManualRecipeCreatePage } = await importManualRecipeCreatePage();

    const result = await ManualRecipeCreatePage({
      searchParams: Promise.resolve({}),
    });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("redirects the YouTube import QA guest without Supabase env", async () => {
    readE2EAuthOverrideCookie.mockReturnValue("guest");
    const { default: YoutubeImportPage } = await importYoutubeImportPage();

    await expect(YoutubeImportPage({
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_REDIRECT:/login?next=");

    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fmenu%2Fadd%2Fyoutube");
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the existing env-less local YouTube import behavior without an override", async () => {
    readE2EAuthOverrideCookie.mockReturnValue(null);
    const { default: YoutubeImportPage } = await importYoutubeImportPage();

    const result = await YoutubeImportPage({
      searchParams: Promise.resolve({}),
    });

    expect(result).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(getServerAuthUser).not.toHaveBeenCalled();
  });
});
