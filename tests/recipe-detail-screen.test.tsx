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
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useSearchParams: () => navigationMocks.searchParams(),
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

function installMatchMedia(matchesDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 1024px)" ? matchesDesktop : !matchesDesktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
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
    Reflect.deleteProperty(window, "matchMedia");
  });

  beforeEach(() => {
    fetchJson.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    hasSupabasePublicEnv.mockReset();
    fetchPlanner.mockReset();
    createMeal.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
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

    const loginDialog = await screen.findByRole("dialog", {
      name: "로그인이 필요한 작업이에요",
    });
    expect(loginDialog.getAttribute("data-app-overlay-shell")).toBe(
      "bottom-sheet",
    );
    expect(screen.getByText("로그인이 필요한 작업이에요")).toBeTruthy();
    expect(screen.queryByText("보호된 작업")).toBeNull();

    const closeButton = screen.getByRole("button", { name: "닫기" });
    expect(closeButton.className).toContain("h-[var(--control-height-md)]");
    expect(closeButton.classList.contains("w-11")).toBe(true);
    expect(closeButton.textContent).toBe("");
  });

  it("keeps recipe detail loading inside the desktop shell", () => {
    installMatchMedia(true);
    fetchJson.mockReturnValue(new Promise(() => {}));

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const skeleton = screen.getByTestId("recipe-detail-web-loading");
    expect(skeleton.closest(".web-recipe-detail")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "데스크탑 주요 메뉴" })).toBeTruthy();
  });

  it("uses return context for the desktop breadcrumb back link", async () => {
    installMatchMedia(true);
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        returnTo: "/mypage/recipe-books/book-my?type=my_added&name=내가 추가한 레시피",
        returnSurface: "mypage.recipebooks",
        restore: "recipebook-tab",
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", { name: MOCK_RECIPE_DETAIL.title });

    const breadcrumb = screen.getByRole("navigation", { name: "레시피 경로" });
    const backLink = within(breadcrumb).getByRole("link");
    expect(backLink.getAttribute("href")).toBe(
      "/mypage/recipe-books/book-my?type=my_added&name=%EB%82%B4%EA%B0%80+%EC%B6%94%EA%B0%80%ED%95%9C+%EB%A0%88%EC%8B%9C%ED%94%BC&returnSurface=mypage.recipebooks&restore=recipebook-tab",
    );
  });

  it("shows recipe detail load errors on the prototype-derived state shell", async () => {
    fetchJson.mockRejectedValue(new Error("recipe failed"));

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const heading = await screen.findByRole("heading", {
      name: "레시피 상세를 불러오지 못했어요",
    });

    expect(
      heading
        .closest("[data-state-kind='prototype-derived']")
        ?.getAttribute("data-state-tone"),
    ).toBe("error");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("keeps a single share action and places interactive chips above the ingredient section", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const shareButtons = await screen.findAllByRole("button", {
      name: "공유하기",
    });
    expect(shareButtons).toHaveLength(1);

    const likeButton = screen.getByRole("button", { name: "좋아요 203" });
    const ingredientTab = screen.getByRole("tab", { name: "재료" });

    expect(
      likeButton.compareDocumentPosition(ingredientTab) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("조회")).toBeNull();
    expect(screen.queryByText("요리완료")).toBeNull();
  });

  it("keeps the overview metrics row compact so hero actions stay closer to the first fold", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const likeButton = await screen.findByRole("button", { name: "좋아요 203" });
    const metricsRow = likeButton.closest(".recipe-overview-metrics-compact");

    expect(metricsRow).not.toBeNull();
    expect(metricsRow?.className).toContain("recipe-overview-metrics-compact");
    expect(metricsRow?.className).toContain("flex-wrap");
  });

  it("removes internal scaffolding cards and places primary CTA in a sticky bottom bar", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const plannerButton = await screen.findByRole("button", {
      name: "플래너에 추가",
    });
    const cookButton = screen.getByRole("button", { name: "요리하기" });

    const ctaBar = plannerButton.closest(".wave1-recipe-cta-bar");
    expect(ctaBar).not.toBeNull();
    expect(ctaBar?.contains(cookButton)).toBe(true);
    expect(screen.queryByText("Recipe Snapshot")).toBeNull();
    expect(screen.queryByText("Slice Note")).toBeNull();
  });

  it("routes the recipe cook CTA to standalone cook mode with selected servings", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "요리하기" }),
    );

    const pushedHref = mockRouterPush.mock.calls.at(-1)?.[0] as string;
    expect(pushedHref).toContain(
      `/cooking/recipes/${MOCK_RECIPE_DETAIL.id}/cook-mode?servings=${MOCK_RECIPE_DETAIL.base_servings}`,
    );
    expect(pushedHref).toContain("returnSurface=recipe.detail");
    expect(pushedHref).toContain("returnTo=");
  });

  it("uses level-one page headings and 44px touch targets for the hero actions", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: MOCK_RECIPE_DETAIL.title,
      }),
    ).toBeTruthy();

    expect((await screen.findByRole("button", { name: "좋아요 203" })).className).toContain(
      "bg-transparent",
    );
    expect((await screen.findByRole("button", { name: "저장" })).className).toContain(
      "text-[var(--text-inverse)]",
    );
    expect(
      (await screen.findByRole("button", { name: "플래너에 추가" })).className,
    ).toContain("min-h-[var(--control-height-md)]");
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

    const modal = await screen.findByRole("dialog", { name: "레시피 저장" });
    expect(modal.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    const modalScope = within(modal);

    expect(
      modalScope.getByRole("heading", { name: "레시피 저장" }),
    ).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /저장한 레시피/ })).toBeTruthy();
    expect(modalScope.getByRole("button", { name: /주말 파티/ })).toBeTruthy();
  });

  it("renders save modal without recipe preview and with prototype footer copy", async () => {
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

    // No recipe preview block
    expect(modalScope.queryByText(MOCK_RECIPE_DETAIL.title)).toBeNull();
    expect(modalScope.queryByText(MOCK_RECIPE_DETAIL.description!)).toBeNull();

    const saveButton = modalScope.getByRole("button", { name: "저장" });
    expect(saveButton.textContent).toBe("1개 레시피북에 추가 저장");
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

  it("lets already-saved books be unchecked and applies removal on final save", async () => {
    const detail = buildRecipeDetail({
      user_status: {
        is_liked: false,
        is_saved: true,
        saved_book_ids: ["book-saved"],
      },
    });
    const deleteRequests: string[] = [];

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchJson.mockImplementation((input: string, init?: RequestInit) => {
      if (!init?.method && input === `/api/v1/recipes/${MOCK_RECIPE_DETAIL.id}`) {
        return Promise.resolve(detail);
      }

      if (!init?.method && input === "/api/v1/recipe-books") {
        return Promise.resolve(buildSaveableBooks());
      }

      if (
        init?.method === "DELETE" &&
        input === `/api/v1/recipe-books/book-saved/recipes/${MOCK_RECIPE_DETAIL.id}`
      ) {
        deleteRequests.push(input);
        return Promise.resolve({ deleted: true });
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await findSaveActionButton());
    const modal = await screen.findByRole("dialog");
    const modalScope = within(modal);
    const saveButton = modalScope.getByRole("button", { name: "저장" }) as HTMLButtonElement;

    await waitFor(() => {
      expect(modalScope.getAllByText("이미 저장됨").length).toBeGreaterThan(0);
    });

    await userEvent.click(modalScope.getByRole("button", { name: /저장한 레시피/ }));

    await waitFor(() => {
      expect(saveButton.textContent).toContain("1개 저장 해제");
    });
    expect(saveButton.disabled).toBe(false);

    expect(deleteRequests).toEqual([]);

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(deleteRequests).toEqual([
      `/api/v1/recipe-books/book-saved/recipes/${MOCK_RECIPE_DETAIL.id}`,
    ]);
    expect(await screen.findByText("레시피북 저장을 변경했어요.")).toBeTruthy();
    expect((await findSaveActionButton()).getAttribute("aria-pressed")).toBe("false");
  });

  it("uses the recipe thumbnail for the mobile hero and shows icon-count hero actions", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const hero = await screen.findByTestId("recipe-detail-hero");
    expect(hero.getAttribute("style")).toContain(MOCK_RECIPE_DETAIL.thumbnail_url);

    const likeButton = await screen.findByRole("button", { name: "좋아요 203" });
    const saveButton = await screen.findByRole("button", { name: "저장" });
    const cookStatus = screen.getByRole("status", { name: "요리완료 34" });

    expect(likeButton.textContent).toBe("203");
    expect(saveButton.textContent).toBe("89");
    expect(cookStatus.textContent).toBe("34");
  });

  it("creates a custom recipe book and saves the recipe", async () => {
    const detail = buildRecipeDetail();
    const createdBookId = "book-fresh";
    let saveRequestBody: unknown = null;

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
        saveRequestBody = init.body ? JSON.parse(String(init.body)) : null;
        return Promise.resolve({
          saved: true,
          save_count: 91,
          book_ids: ["book-saved", createdBookId],
          created_book_ids: ["book-saved", createdBookId],
          already_saved_book_ids: [],
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

    await userEvent.click(
      modalScope.getByRole("button", { name: /새 레시피북 만들기/ }),
    );
    await userEvent.type(modalScope.getByPlaceholderText("레시피북 이름"), "새로운 책");
    await userEvent.click(modalScope.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(modalScope.getByRole("button", { name: /새로운 책/ })).toBeTruthy();
    });

    await userEvent.click(modalScope.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(await screen.findByText("레시피를 저장했어요.")).toBeTruthy();
    expect((await findSaveActionButton()).getAttribute("aria-pressed")).toBe("true");
    expect(saveRequestBody).toEqual({
      book_ids: ["book-saved", createdBookId],
    });
    await waitFor(() => {
      expect(within(screen.getByRole("button", { name: "저장" })).getByText("91")).toBeTruthy();
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

  it("displays hero action metrics with prototype like/save/cook stack", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByTestId("recipe-detail-hero");
    expect(screen.queryByText("요리완료")).toBeNull();
    expect(
      screen.getByRole("status", { name: /요리완료/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("status", { name: /플래너 등록/ })).toBeNull();
  });

  it("renders the bottom sticky CTA with planner-add and cook buttons", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    const plannerButton = await screen.findByRole("button", {
      name: "플래너에 추가",
    });
    const cookButton = screen.getByRole("button", { name: "요리하기" });

    const ctaBar = plannerButton.closest(".wave1-recipe-cta-bar");
    expect(ctaBar).not.toBeNull();
    expect(ctaBar?.contains(cookButton)).toBe(true);
    expect(ctaBar?.className).toContain("bottom-[calc(72px+env(safe-area-inset-bottom))]");
  });

  it("renders cooking step instructions with text-base font size", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    await userEvent.click(screen.getByRole("tab", { name: "만들기" }));

    const stepInstruction = screen.getByText(
      MOCK_RECIPE_DETAIL.steps[0]!.instruction,
    );
    expect(stepInstruction.className).toContain("text-base");
  });

  it("shows component labels as section headings on ingredients and steps", async () => {
    installMatchMedia(false);
    fetchJson.mockResolvedValue(
      buildRecipeDetail({
        ingredients: [
          {
            ...MOCK_RECIPE_DETAIL.ingredients[0]!,
            id: "recipe-ing-bread-flour",
            ingredient_id: "ing-bread-flour",
            standard_name: "강력분",
            display_text: "[빵 반죽] 강력분 170g",
            component_label: "빵 반죽",
            sort_order: 1,
          },
          {
            ...MOCK_RECIPE_DETAIL.ingredients[0]!,
            id: "recipe-ing-sugar",
            ingredient_id: "ing-sugar",
            standard_name: "설탕",
            display_text: "[빵 반죽] 설탕 15g",
            component_label: "빵 반죽",
            sort_order: 2,
          },
          {
            ...MOCK_RECIPE_DETAIL.ingredients[0]!,
            id: "recipe-ing-yolk",
            ingredient_id: "ing-yolk",
            standard_name: "달걀노른자",
            display_text: "[커스터드 크림] 달걀노른자 2개",
            component_label: "커스터드 크림",
            sort_order: 3,
          },
        ],
        steps: [
          {
            ...MOCK_RECIPE_DETAIL.steps[0]!,
            id: "step-bread-1",
            step_number: 1,
            instruction: "[빵 반죽] 밀가루와 설탕을 섞어 주세요.",
            component_label: "빵 반죽",
          },
          {
            ...MOCK_RECIPE_DETAIL.steps[0]!,
            id: "step-bread-2",
            step_number: 2,
            instruction: "[빵 반죽] 버터를 넣고 반죽해 주세요.",
            component_label: "빵 반죽",
          },
          {
            ...MOCK_RECIPE_DETAIL.steps[0]!,
            id: "step-custard-1",
            step_number: 3,
            instruction: "[커스터드 크림] 노른자와 설탕을 섞어 주세요.",
            component_label: "커스터드 크림",
          },
        ],
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    expect(screen.getAllByText("빵 반죽")).toHaveLength(1);
    expect(screen.getByText("커스터드 크림")).toBeTruthy();
    expect(screen.queryByText("[빵 반죽] 강력분 170g")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "만들기" }));

    expect(screen.getAllByText("빵 반죽")).toHaveLength(1);
    expect(screen.getByText("커스터드 크림")).toBeTruthy();
    expect(screen.queryByText("[빵 반죽] 밀가루와 설탕을 섞어 주세요.")).toBeNull();
  });

  it("does not display view_count in the metrics area", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    expect(screen.queryByText("조회")).toBeNull();
    expect(screen.queryByText("조회수")).toBeNull();
  });

  it("shows tag chips when recipe has tags", async () => {
    fetchJson.mockResolvedValue(
      buildRecipeDetail({ tags: ["한식", "찌개"] }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    const tagContainer = screen.getByTestId("recipe-detail-tags");
    expect(tagContainer).toBeTruthy();
    expect(screen.getByText("한식")).toBeTruthy();
    expect(screen.getByText("찌개")).toBeTruthy();
  });

  it("hides the tag row entirely when recipe has no tags", async () => {
    fetchJson.mockResolvedValue(buildRecipeDetail({ tags: [] }));

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    expect(screen.queryByTestId("recipe-detail-tags")).toBeNull();
  });

  it("shows YouTube source note for youtube recipes", async () => {
    fetchJson.mockResolvedValue(
      buildRecipeDetail({
        source_type: "youtube",
        source: {
          youtube_url: "https://www.youtube.com/watch?v=abc",
          youtube_video_id: "abc",
        },
      }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    expect(screen.getByTestId("recipe-youtube-source-note")).toBeTruthy();
    expect(screen.getByText("YouTube에서 가져온 레시피")).toBeTruthy();
  });

  it("does not show YouTube source note for non-youtube recipes", async () => {
    fetchJson.mockResolvedValue(
      buildRecipeDetail({ source_type: "manual" }),
    );

    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await screen.findByRole("heading", {
      level: 1,
      name: MOCK_RECIPE_DETAIL.title,
    });

    expect(screen.queryByTestId("recipe-youtube-source-note")).toBeNull();
  });
});
