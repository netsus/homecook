// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { MOCK_RECIPE_DETAIL } from "@/lib/mock/recipes";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";
import type { RecipeDetail, RecipeLikeData } from "@/types/recipe";

const fetchJson = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const hasSupabasePublicEnv = vi.fn();

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

vi.mock("@/components/auth/social-login-buttons-deferred", () => ({
  SocialLoginButtonsDeferred: ({ nextPath }: { nextPath: string }) => (
    <div>social-buttons:{nextPath}</div>
  ),
}));

function buildRecipeDetail(overrides?: Partial<RecipeDetail>): RecipeDetail {
  return {
    ...MOCK_RECIPE_DETAIL,
    user_status: {
      is_liked: false,
      is_saved: false,
      saved_book_ids: [],
    },
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("recipe detail screen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchJson.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    hasSupabasePublicEnv.mockReset();
    useAuthGateStore.setState({ isOpen: false, action: null });
    window.localStorage.clear();

    fetchJson.mockResolvedValue(MOCK_RECIPE_DETAIL);
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    hasSupabasePublicEnv.mockReturnValue(true);
  });

  it("opens the login gate when a protected action is clicked by a guest", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("로그인이 필요한 작업이에요")).toBeTruthy();
  });

  it("disables the like button while pending and updates the count from the API response", async () => {
    const detail = buildRecipeDetail();
    const deferred = createDeferred<RecipeLikeData>();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return deferred.promise;
      }

      expect(input).toBe(`/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`);
      return Promise.resolve(detail);
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const button = await screen.findByRole("button", {
      name: "♡ 좋아요 203",
    });

    await userEvent.click(button);

    expect(fetchJson).toHaveBeenCalledWith(
      `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}/like`,
      expect.objectContaining({ method: "POST" }),
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);

    deferred.resolve({
      is_liked: true,
      like_count: 204,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "♥ 좋아요 204" }),
      ).toBeTruthy();
    });
  });

  it("shows error feedback and keeps the previous like state when the request fails", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.reject(new Error("network"));
      }

      expect(input).toBe(`/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`);
      return Promise.resolve(detail);
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "♡ 좋아요 203" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("좋아요 처리에 실패했어요. 다시 시도해주세요."),
      ).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "좋아요 처리에 실패했어요. 다시 시도해주세요.",
    );

    expect(screen.getByRole("button", { name: "♡ 좋아요 203" })).toBeTruthy();
  });

  it("replays the pending like action after login and clears it", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          is_liked: true,
          like_count: 204,
        });
      }

      expect(input).toBe(`/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`);
      return Promise.resolve(detail);
    });
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

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}/like`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(
      await screen.findByText("로그인 완료. 좋아요를 반영했어요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "♥ 좋아요 204" })).toBeTruthy();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("shows OAuth failure feedback from the callback query string", async () => {
    render(
      <RecipeDetailScreen
        authError="oauth_failed"
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("로그인을 완료하지 못했어요. 다시 시도해주세요."),
      ).toBeTruthy();
    });
  });
});
