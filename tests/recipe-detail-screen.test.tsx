// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { MOCK_RECIPE_DETAIL } from "@/lib/mock/recipes";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";

const fetchJson = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const useSearchParams = vi.fn();

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParams(),
}));

describe("recipe detail screen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchJson.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    hasSupabasePublicEnv.mockReset();
    useSearchParams.mockReset();
    useAuthGateStore.setState({ isOpen: false, action: null });
    window.localStorage.clear();

    fetchJson.mockResolvedValue(MOCK_RECIPE_DETAIL);
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    hasSupabasePublicEnv.mockReturnValue(true);
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("opens the login gate when a protected action is clicked by a guest", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("로그인이 필요한 작업이에요")).toBeTruthy();
  });

  it("shows return-to-action feedback and clears pending action after login", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    window.localStorage.setItem(
      PENDING_ACTION_KEY,
      JSON.stringify({
        type: "like",
        recipeId: MOCK_RECIPE_DETAIL.id,
        redirectTo: `/recipe/${MOCK_RECIPE_DETAIL.id}`,
        createdAt: 1,
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    expect(
      await screen.findByText("로그인 완료. 좋아요 액션 위치로 돌아왔어요."),
    ).toBeTruthy();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("shows OAuth failure feedback from the callback query string", async () => {
    useSearchParams.mockReturnValue(
      new URLSearchParams("authError=oauth_failed"),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await waitFor(() => {
      expect(
        screen.getByText("로그인을 완료하지 못했어요. 다시 시도해주세요."),
      ).toBeTruthy();
    });
  });
});
