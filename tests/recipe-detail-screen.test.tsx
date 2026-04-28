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
const fetchPlanner = vi.fn();
const createMeal = vi.fn();

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlanner: (...args: unknown[]) => fetchPlanner(...args),
}));

vi.mock("@/lib/api/meal", () => ({
  createMeal: (...args: unknown[]) => createMeal(...args),
  isMealApiError: () => false,
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

async function findSaveActionButton() {
  const buttons = await screen.findAllByRole("button", { name: "저장" });
  const button = buttons.find(
    (node) => node.getAttribute("aria-pressed") !== null,
  );

  if (!button) {
    throw new Error("Could not find the save action button.");
  }

  return button;
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
    fetchPlanner.mockReset();
    createMeal.mockReset();
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
    expect(screen.queryByText("보호된 작업")).toBeNull();

    const closeButton = screen.getByRole("button", { name: "닫기" });
    expect(closeButton.classList.contains("h-8")).toBe(true);
    expect(closeButton.classList.contains("w-8")).toBe(true);
    expect(closeButton.textContent).toBe("");
  });

  it("keeps a single share action and places interactive chips above the ingredient section", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const shareButtons = await screen.findAllByRole("button", {
      name: "공유하기",
    });
    expect(shareButtons).toHaveLength(1);

    const likeButton = screen.getByRole("button", { name: "좋아요 203" });
    const ingredientHeading = screen.getByText("인분에 따라 재료량이 바뀝니다");

    expect(
      likeButton.compareDocumentPosition(ingredientHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("조회")).toBeNull();
    expect(screen.queryByText("요리완료")).toBeNull();
  });

  it("keeps the overview metrics row compact so hero actions stay closer to the first fold", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const shareButton = await screen.findByRole("button", { name: "공유하기" });
    const metricsRow = shareButton.closest(".recipe-overview-metrics-compact");

    expect(metricsRow).not.toBeNull();
    expect(metricsRow?.className).toContain("recipe-overview-metrics-compact");
    expect(metricsRow?.className).toContain("flex-wrap");
  });

  it("removes internal scaffolding cards and keeps primary actions above the recipe body", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const plannerButton = await screen.findByRole("button", {
      name: "플래너에 추가",
    });
    const ingredientHeading = screen.getByText("인분에 따라 재료량이 바뀝니다");

    expect(
      plannerButton.compareDocumentPosition(ingredientHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("Recipe Snapshot")).toBeNull();
    expect(screen.queryByText("Slice Note")).toBeNull();
  });

  it("uses level-one page headings and 44px touch targets for the hero actions", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: MOCK_RECIPE_DETAIL.title,
      }),
    ).toBeTruthy();

    for (const name of ["좋아요 203", "저장", "플래너에 추가"]) {
      expect((await screen.findByRole("button", { name })).className).toContain(
        "min-h-11",
      );
    }
  });

  it("marks TO_TASTE ingredients with a readable helper badge", async () => {
    fetchJson.mockResolvedValue(
      buildRecipeDetail({
        ingredients: [
          {
            id: "taste-1",
            ingredient_id: "ingredient-salt",
            standard_name: "소금",
            amount: null,
            unit: null,
            ingredient_type: "TO_TASTE",
            display_text: "소금 적당히",
            scalable: false,
            sort_order: 1,
          },
        ],
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    expect(await screen.findByText("취향껏")).toBeTruthy();
    expect(screen.getByText(/적당히/)).toBeTruthy();
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
      name: "좋아요 203",
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
        screen.getByRole("button", { name: "좋아요 204" }),
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
      await screen.findByRole("button", { name: "좋아요 203" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("좋아요 처리에 실패했어요. 다시 시도해주세요."),
      ).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "좋아요 처리에 실패했어요. 다시 시도해주세요.",
    );

    expect(screen.getByRole("button", { name: "좋아요 203" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "좋아요 204" })).toBeTruthy();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("replays the pending like action from the server-authenticated callback state", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: null } });
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

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}/like`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(
      await screen.findByText("로그인 완료. 좋아요를 반영했어요."),
    ).toBeTruthy();
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
      modalScope.getByRole("heading", { name: "레시피 저장" }),
    ).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /저장한 레시피/ })).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /주말 파티/ })).toBeTruthy();
  });

  it("shows load error UI and retries recipe-book loading", async () => {
    const detail = buildRecipeDetail();
    let recipeBookRequests = 0;

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        recipeBookRequests += 1;

        if (recipeBookRequests === 1) {
          return Promise.reject(new Error("레시피북 목록을 불러오지 못했어요."));
        }

        return Promise.resolve(buildSaveableBooks());
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "저장" }));
    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);

    await waitFor(() => {
      expect(
        modalScope.getByText("레시피북 목록을 불러오지 못했어요."),
      ).toBeTruthy();
    });

    await userEvent.click(modalScope.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(modalScope.getByRole("button", { name: /저장한 레시피/ })).toBeTruthy();
    });
    expect(recipeBookRequests).toBe(2);
  });

  it("disables save when the selected recipe book already contains the recipe", async () => {
    const detail = buildRecipeDetail({
      user_status: {
        is_liked: false,
        is_saved: true,
        saved_book_ids: ["book-saved"],
      },
    });

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

    await userEvent.click(await findSaveActionButton());
    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);
    const saveButton = modalScope.getByRole("button", { name: "저장" }) as HTMLButtonElement;

    await waitFor(() => {
      expect(
        modalScope.getByText("이미 선택한 레시피북에 저장된 레시피예요. 다른 레시피북을 선택해 주세요."),
      ).toBeTruthy();
    });
    expect(saveButton.disabled).toBe(true);

    await userEvent.click(modalScope.getByRole("button", { name: /주말 파티/ }));

    await waitFor(() => {
      expect(
        modalScope.queryByText("이미 선택한 레시피북에 저장된 레시피예요. 다른 레시피북을 선택해 주세요."),
      ).toBeNull();
    });
    expect(saveButton.disabled).toBe(false);
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

    const saveActionButton = await findSaveActionButton();
    expect(within(saveActionButton).getByText("89")).toBeTruthy();

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
    expect((await findSaveActionButton()).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(within(screen.getByRole("button", { name: "저장" })).getByText("90")).toBeTruthy();
    });
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
      await screen.findByRole("heading", { name: "레시피 저장" }),
    ).toBeTruthy();
    expect(
      screen.getByText("로그인 완료. 저장할 레시피북을 선택해 주세요."),
    ).toBeTruthy();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("replays the pending save action from the server-authenticated callback state", async () => {
    const detail = buildRecipeDetail();

    getSession.mockResolvedValue({ data: { session: null } });
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

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "레시피 저장" }),
    ).toBeTruthy();
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

  it("shows a toast with target date and meal slot name after a successful planner add", async () => {
    const COLUMN_ID = "col-breakfast";
    const COLUMN_NAME = "아침";

    // Build the expected toast string the same way the component does (locale-independent)
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const [, m, d] = todayKey.split("-").map(Number);
    const expectedToast = `${m}월 ${d}일 ${COLUMN_NAME}에 추가됐어요`;

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockResolvedValue(buildRecipeDetail());
    fetchPlanner.mockResolvedValue({
      columns: [{ id: COLUMN_ID, name: COLUMN_NAME, sort_order: 0 }],
      days: [],
    });
    createMeal.mockResolvedValue({});

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    // Sheet opens and loads columns
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();

    // Submit the sheet (scoped to dialog to avoid CTA button ambiguity)
    const submitButton = await within(dialog).findByRole("button", {
      name: "플래너에 추가",
    });
    await userEvent.click(submitButton);

    // Toast: exact contract format "N월 D일 끼니에 추가됐어요" (D3, no trailing period)
    await waitFor(() => {
      const statusElements = screen.getAllByRole("status");
      const toast = statusElements.find(
        (el) => el.textContent === expectedToast,
      );
      expect(toast).toBeTruthy();
    });
  });
});
