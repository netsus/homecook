// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { MOCK_RECIPE_DETAIL } from "@/lib/mock/recipes";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeBookListData,
  RecipeDetail,
  RecipeLikeData,
  RecipeSaveData,
} from "@/types/recipe";

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

function buildSaveableBooks(): RecipeBookListData {
  return {
    books: [
      {
        id: "book-saved",
        name: "저장한 레시피",
        book_type: "saved",
        recipe_count: 8,
        sort_order: 1,
      },
      {
        id: "book-custom",
        name: "주말 파티",
        book_type: "custom",
        recipe_count: 2,
        sort_order: 2,
      },
    ],
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

  it("opens the save modal with recipe books for authenticated users", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        return Promise.resolve(buildSaveableBooks());
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "저장" }));

    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);

    expect(
      modalScope.getByRole("heading", { name: "저장할 레시피북을 선택하세요" }),
    ).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /저장한 레시피/ })).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /주말 파티/ })).toBeTruthy();
  });

  it("creates a custom recipe book and saves the recipe", async () => {
    const detail = buildRecipeDetail();
    const createdBookId = "book-fresh";

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        return Promise.resolve(buildSaveableBooks());
      }

      if (init?.method === "POST" && input === "/api/v1/recipe-books") {
        return Promise.resolve({
          id: createdBookId,
          name: "새로운 책",
          book_type: "custom",
          recipe_count: 0,
          sort_order: 9,
          created_at: "2026-03-27T10:00:00Z",
          updated_at: "2026-03-27T10:00:00Z",
        });
      }

      if (init?.method === "POST" && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}/save`) {
        return Promise.resolve({
          saved: true,
          save_count: 90,
          book_id: createdBookId,
        } satisfies RecipeSaveData);
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "저장" }));
    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);

    await userEvent.type(modalScope.getByPlaceholderText("예: 주말 파티"), "새로운 책");
    await userEvent.click(modalScope.getByRole("button", { name: "생성" }));

    await waitFor(() => {
      expect(modalScope.getByRole("button", { name: /새로운 책/ })).toBeTruthy();
    });

    await userEvent.click(modalScope.getByRole("button", { name: /새로운 책/ }));
    await userEvent.click(modalScope.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(await screen.findByText("레시피를 저장했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장됨" })).toBeTruthy();
  });

  it("keeps the save modal open and shows an error when save fails", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        return Promise.resolve(buildSaveableBooks());
      }

      if (init?.method === "POST" && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}/save`) {
        return Promise.reject(new Error("이미 저장된 레시피예요."));
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "저장" }));
    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);

    await userEvent.click(modalScope.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(modalScope.getByText("이미 저장된 레시피예요.")).toBeTruthy();
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("replays the pending save action after login by reopening the save modal", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        return Promise.resolve(buildSaveableBooks());
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    window.localStorage.setItem(
      PENDING_ACTION_KEY,
      JSON.stringify({
        type: "save",
        recipeId: MOCK_RECIPE_DETAIL.id,
        redirectTo: `/recipe/${MOCK_RECIPE_DETAIL.id}`,
        createdAt: 1,
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    expect(
      await screen.findByRole("heading", { name: "저장할 레시피북을 선택하세요" }),
    ).toBeTruthy();
    expect(
      screen.getByText("로그인 완료. 저장할 레시피북을 선택해 주세요."),
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
