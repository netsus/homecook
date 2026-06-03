// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import { fetchIngredients } from "@/lib/api/ingredients";
import * as mealApi from "@/lib/api/meal";
import * as recipeApi from "@/lib/api/recipe";
import * as youtubeApi from "@/lib/api/youtube-import";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: vi.fn(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipes: vi.fn(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        methods: [
          {
            id: "method-1",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_system: true,
          },
        ],
      },
      error: null,
    }),
  ),
}));

vi.mock("@/lib/api/youtube-import", () => ({
  validateYoutubeUrl: vi.fn(),
  extractYoutubeRecipe: vi.fn(),
  createYoutubeCandidateDraft: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
  registerYoutubeIngredient: vi.fn(),
}));

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "550e8400-e29b-41d4-a716-446655440050",
  slotName: "아침",
  initialAuthenticated: true,
} as const;

function installMatchMedia(matchesDesktop = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
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

function mockVisualQuantityExtract(ingredientOverrides = {}) {
  vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
    success: true,
    data: {
      extraction_id: "ext-visual-quantity",
      title: "두부조림",
      base_servings: 2,
      thumbnail_url: "https://i.ytimg.com/vi/visual12345/hqdefault.jpg",
      tags: ["두부조림"],
      extraction_methods: ["description"],
      draft_warnings: [],
      blocking_issues: [],
      ingredients: [
        {
          draft_ingredient_id: "11111111-1111-4111-8111-111111111111",
          ingredient_id: "ing-tofu",
          standard_name: "두부",
          amount: 300,
          unit: "g",
          ingredient_type: "QUANT",
          display_text: "두부 300g",
          sort_order: 1,
          scalable: true,
          confidence: 0.9,
          resolution_status: "resolved",
          candidates: [],
          raw_text: "두부",
          quantity_source: "visual_explicit",
          quantity_confidence: 0.86,
          quantity_raw_text: "화면 자막: 두부 300g",
          quantity_evidence_refs: [
            {
              source_method: "visual",
              source_provider: "gemini",
              frame_ts_ms: 12000,
              snippet: "두부 300g",
              locator_hash: "hash-tofu-300g",
            },
          ],
          quantity_review_required: true,
          quantity_user_confirmed: false,
          ...ingredientOverrides,
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "두부를 양념장에 졸인다",
          cooking_method: {
            id: "method-1",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_new: false,
          },
          duration_text: "10분",
          is_incomplete: false,
          missing_fields: [],
          raw_text: "두부를 양념장에 졸인다",
        },
      ],
      new_cooking_methods: [],
    },
    error: null,
  });
}

describe("MenuAddScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(leftoversApi.fetchLeftovers).mockReset();
    vi.mocked(fetchIngredients).mockReset();
    vi.mocked(mealApi.createMealSafe).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockResolvedValue({
      success: true,
      data: {
        has_next: false,
        items: [],
        next_cursor: null,
      },
      error: null,
    });
    vi.mocked(fetchIngredients).mockResolvedValue({
      success: true,
      data: { items: [] },
      error: null,
    });
    vi.mocked(youtubeApi.validateYoutubeUrl).mockReset();
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockReset();
    vi.mocked(youtubeApi.createYoutubeCandidateDraft).mockReset();
    vi.mocked(youtubeApi.registerYoutubeIngredient).mockReset();
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockReset();
    vi.mocked(youtubeApi.validateYoutubeUrl).mockResolvedValue({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "recipe",
        classification_reasons: [],
        video_info: {
          video_id: "recipe12345",
          title: "백종원 김치찌개",
          channel: "백종원의 요리비책",
          thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        },
      },
      error: null,
    });
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValue({
      success: true,
      data: {
        extraction_id: "ext-1",
        title: "백종원 김치찌개",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["김치찌개"],
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: [],
        ingredients: [
          {
            draft_ingredient_id: "draft-ing-1",
            ingredient_id: "ing-1",
            standard_name: "김치",
            amount: 200,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "김치 200g",
            sort_order: 1,
            scalable: true,
            confidence: 0.9,
            resolution_status: "resolved",
            candidates: [],
            raw_text: "김치 200g",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "김치를 끓인다",
            cooking_method: {
              id: "method-1",
              code: "boil",
              label: "끓이기",
              color_key: "red",
              is_new: false,
            },
            duration_text: "10분",
            is_incomplete: false,
            missing_fields: [],
            raw_text: "김치를 끓인다",
          },
        ],
        new_cooking_methods: [],
      },
      error: null,
    });
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockResolvedValue({
      success: true,
      data: {
        recipe_id: "recipe-yt-1",
        title: "백종원 김치찌개",
      },
      error: null,
    });
    vi.mocked(youtubeApi.registerYoutubeIngredient).mockResolvedValue({
      success: true,
      data: {
        ingredient: {
          ingredient_id: "ing-registered",
          standard_name: "연겨자",
          category: "양념",
          default_unit: null,
          resolution_status: "resolved",
        },
        synonym_status: "attached",
        warnings: [],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the mobile YouTube import screen from the option tile", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");

    expect((youtubeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(youtubeButton);

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "유튜브 가져오기" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "영상 링크에서 레시피를 추출해요" }),
    ).toBeTruthy();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(screen.getByLabelText("유튜브 URL")).toBeTruthy();
  });

  // ─── Wave1 acceptance tests ─────────────────────────────────────────────────

  it("renders the mobile option list with correct data-testids (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const grid = screen.getByTestId("menu-add-option-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("flex");

    // All six Wave1 options should be present.
    expect(screen.getByTestId("menu-add-option-search")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-recipebook")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-pantry")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-leftover")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-youtube")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-manual")).toBeTruthy();
  });

  it("opens and focuses the mobile recipe search picker from the search option tile (Wave1)", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-search"));

    expect(screen.getByRole("heading", { name: "검색으로 추가" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("레시피 검색"));
  });

  it("uses the web-style search row in the mobile recipe search field", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-search"));

    const icon = screen.getByTestId("recipe-search-submit-icon");
    const iconClass = icon.getAttribute("class") ?? "";
    expect(iconClass).toContain("h-5");
    expect(iconClass).toContain("w-5");
    expect(iconClass).not.toContain("rotate-[-12deg]");
    expect(screen.getByLabelText("레시피 검색")).toBeTruthy();
    expect(screen.getByRole("button", { name: "검색" })).toBeTruthy();
  });

  it("shows the mobile target context instead of the legacy secondary heading (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    expect(screen.getAllByText("4/18 아침").length).toBeGreaterThan(0);
    expect(screen.queryByText("대상")).toBeNull();
    expect(screen.queryByText("다른 방법으로 추가")).toBeNull();
  });

  it("opens the requested picker when source is provided by the planner sheet", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="leftover" />);

    const screenView = await screen.findByTestId("leftover-picker-screen");

    expect(screenView).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "남은 요리에서 추가" })).toBeNull();
    expect(leftoversApi.fetchLeftovers).toHaveBeenCalledWith("leftover");
  });

  it("returns from the leftover picker back button to the option list", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-leftover"));

    const pickerScreen = await screen.findByTestId("leftover-picker-screen");
    await user.click(within(pickerScreen).getByTestId("leftover-picker-back"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.queryByTestId("leftover-picker-screen")).toBeNull();
  });

  it("uses matching typography for YouTube and manual option tiles", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const recipeBookButton = screen.getByTestId("menu-add-option-recipebook");
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");
    const manualButton = screen.getByTestId("menu-add-option-manual");

    expect(youtubeButton.className).toBe(recipeBookButton.className);
    expect(manualButton.className).toBe(recipeBookButton.className);
  });

  it("keeps the desktop option rail visible while opening manual recipe create in the right panel", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    const embeddedManual = screen.getByTestId("manual-recipe-embedded");
    expect(embeddedManual).toBeTruthy();
    expect(embeddedManual.className).toContain("web-menu-add-embedded-manual");
    expect(embeddedManual.closest(".web-menu-add-picker-panel")).toBeTruthy();
    expect(screen.getByLabelText("요리 이름")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("switches back to recipe search when the desktop search option is clicked from another method", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));
    expect(screen.getByTestId("manual-recipe-embedded")).toBeTruthy();

    await user.click(screen.getByTestId("menu-add-option-search"));

    expect(screen.getByLabelText("레시피 검색")).toBeTruthy();
    expect(screen.queryByTestId("manual-recipe-embedded")).toBeNull();
  });

  it("resets the desktop picker by clicking the active option again", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));

    expect(screen.getByTestId("manual-recipe-embedded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "초기화" })).toBeNull();

    await user.click(screen.getByTestId("menu-add-option-manual"));

    expect(screen.queryByTestId("manual-recipe-embedded")).toBeNull();
    expect(screen.getByLabelText("레시피 검색")).toBeTruthy();
  });

  it("omits redundant desktop picker eyebrow copy", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));

    expect(screen.queryByText("현재 선택")).toBeNull();
    expect(screen.getByRole("heading", { name: "유튜브 가져오기" })).toBeTruthy();
  });

  it("keeps the mobile manual option routed to the standalone create screen", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));

    const pushedHref = mockRouterPush.mock.calls.at(-1)?.[0] as string;
    expect(pushedHref).toContain("/menu/add/manual?");
    expect(pushedHref).toContain(`date=${DEFAULT_PROPS.planDate}`);
    expect(pushedHref).toContain(`columnId=${DEFAULT_PROPS.columnId}`);
    expect(pushedHref).toContain(`slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`);
  });

  it("keeps the desktop option rail visible while opening YouTube import in the right panel", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.getByTestId("youtube-import-embedded")).toBeTruthy();
    expect(screen.getByLabelText("유튜브 URL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "가져오기" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "가져오기 화면 열기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다른 방법" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "유튜브 가져오기" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("keeps the desktop YouTube import review step inside the right panel", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    await waitFor(() => {
      expect(youtubeApi.validateYoutubeUrl).toHaveBeenCalledWith({
        youtube_url: "https://www.youtube.com/watch?v=recipe12345",
      });
      expect(youtubeApi.extractYoutubeRecipe).toHaveBeenCalledWith({
        youtube_url: "https://www.youtube.com/watch?v=recipe12345",
      });
    });

    expect(await screen.findByRole("heading", { name: "추출 결과를 확인해주세요" })).toBeTruthy();
    expect(screen.getByTestId("youtube-import-embedded")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "가져오기 화면 열기" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("promotes a selected multi-recipe YouTube candidate into the review form", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "parent-ext-1",
        title: "집밥 모음",
        base_servings: 1,
        thumbnail_url: "https://i.ytimg.com/vi/multi12345/hqdefault.jpg",
        tags: ["집밥"],
        extraction_methods: ["caption"],
        draft_warnings: ["영상 안에서 여러 요리 후보를 찾았어요. 저장할 요리를 먼저 선택해주세요."],
        blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
        ingredients: [],
        steps: [],
        new_cooking_methods: [],
        multi_recipe_status: "multiple",
        primary_candidate_id: "candidate-1",
        recipe_candidates: [
          {
            candidate_id: "candidate-1",
            title: "김치볶음밥",
            start_ms: 10_000,
            end_ms: 40_000,
            confidence: 0.84,
            ingredients: [],
            steps: [],
            draft_warnings: [],
            blocking_issues: [],
            evidence_refs: [],
          },
          {
            candidate_id: "candidate-2",
            title: "계란국",
            start_ms: 41_000,
            end_ms: 70_000,
            confidence: 0.88,
            ingredients: [
              {
                draft_ingredient_id: "draft-egg",
                ingredient_id: "ing-egg",
                standard_name: "계란",
                amount: 1,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "계란 1개",
                sort_order: 1,
                scalable: true,
                confidence: 0.9,
                resolution_status: "resolved",
                candidates: [],
                raw_text: "계란 1개",
              },
            ],
            steps: [],
            draft_warnings: [],
            blocking_issues: [],
            evidence_refs: [],
          },
        ],
      },
      error: null,
    });
    vi.mocked(youtubeApi.createYoutubeCandidateDraft).mockResolvedValueOnce({
      success: true,
      data: {
        parent_extraction_id: "parent-ext-1",
        candidate_id: "candidate-2",
        draft: {
          extraction_id: "child-ext-2",
          title: "계란국",
          base_servings: 1,
          thumbnail_url: "https://i.ytimg.com/vi/multi12345/hqdefault.jpg",
          tags: ["계란국"],
          extraction_methods: ["caption"],
          draft_warnings: [],
          blocking_issues: [],
          ingredients: [
            {
              draft_ingredient_id: "draft-egg",
              ingredient_id: "ing-egg",
              standard_name: "계란",
              amount: 1,
              unit: "개",
              ingredient_type: "QUANT",
              display_text: "계란 1개",
              sort_order: 1,
              scalable: true,
              confidence: 0.9,
              resolution_status: "resolved",
              candidates: [],
              raw_text: "계란 1개",
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "계란을 풀어 끓여요.",
              cooking_method: {
                id: "method-1",
                code: "boil",
                label: "끓이기",
                color_key: "red",
                is_new: false,
              },
              duration_text: null,
              is_incomplete: false,
              missing_fields: [],
              raw_text: "계란을 풀어 끓여요.",
            },
          ],
          new_cooking_methods: [],
          multi_recipe_status: "single",
          primary_candidate_id: "candidate-2",
        },
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=multi12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    const candidates = await screen.findByTestId("youtube-recipe-candidates");
    expect(within(candidates).getByText("요리 후보 2개")).toBeTruthy();
    expect(screen.getByText("저장할 요리를 먼저 선택해주세요.")).toBeTruthy();

    await user.click(screen.getByTestId("youtube-recipe-candidate-candidate-2"));

    await waitFor(() => {
      expect(youtubeApi.createYoutubeCandidateDraft).toHaveBeenCalledWith({
        extraction_id: "parent-ext-1",
        candidate_id: "candidate-2",
      });
    });
    expect(await screen.findByLabelText("계란 수량")).toBeTruthy();
    expect(screen.getByText("계란을 풀어 끓여요.")).toBeTruthy();
    expect(screen.queryByText("저장할 요리를 먼저 선택해주세요.")).toBeNull();
  });

  it("registers an unresolved YouTube ingredient from the review row", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "ext-new-ingredient",
        title: "목살 양념구이",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["목살 양념구이"],
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: ["ingredients[0].ingredient_id"],
        ingredients: [
          {
            draft_ingredient_id: "draft-mustard",
            ingredient_id: "",
            standard_name: "연겨자",
            amount: 0.2,
            unit: "스푼",
            ingredient_type: "QUANT",
            display_text: "연겨자 0.2스푼",
            sort_order: 1,
            scalable: true,
            confidence: 0.72,
            resolution_status: "unresolved",
            candidates: [],
            raw_text: "연겨자 0.2스푼",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "양념을 섞어 고기에 바른다",
            cooking_method: {
              id: "method-1",
              code: "mix",
              label: "섞기",
              color_key: "red",
              is_new: false,
            },
            duration_text: null,
            is_incomplete: false,
            missing_fields: [],
            raw_text: "양념을 섞어 고기에 바른다",
          },
        ],
        new_cooking_methods: [],
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByText("재료를 찾지 못했어요")).toBeTruthy();

    await user.click(screen.getByTestId("register-ingredient-action"));

    const dialog = await screen.findByTestId("ingredient-register-modal");
    expect((within(dialog).getByTestId("register-standard-name") as HTMLInputElement).value).toBe(
      "연겨자",
    );

    await user.click(within(dialog).getByRole("button", { name: "등록" }));

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeIngredient).toHaveBeenCalledWith({
        extraction_id: "ext-new-ingredient",
        draft_ingredient_id: "draft-mustard",
        standard_name: "연겨자",
        category: "양념",
        default_unit: null,
        synonym: "연겨자",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("재료를 찾지 못했어요")).toBeNull();
    });
    expect((screen.getByLabelText("연겨자 수량") as HTMLInputElement).value).toBe("0.2");
    expect(screen.getByRole("button", { name: "연겨자 스푼" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not offer ingredient registration from empty search when the draft id is missing", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "ext-legacy-unresolved",
        title: "목살 양념구이",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["목살 양념구이"],
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: ["ingredients[0].ingredient_id"],
        ingredients: [
          {
            draft_ingredient_id: "",
            ingredient_id: "",
            standard_name: "연겨자",
            amount: 0.2,
            unit: "스푼",
            ingredient_type: "QUANT",
            display_text: "연겨자 0.2스푼",
            sort_order: 1,
            scalable: true,
            confidence: 0.72,
            resolution_status: "unresolved",
            candidates: [],
            raw_text: "연겨자 0.2스푼",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "양념을 섞어 고기에 바른다",
            cooking_method: {
              id: "method-1",
              code: "mix",
              label: "섞기",
              color_key: "red",
              is_new: false,
            },
            duration_text: null,
            is_incomplete: false,
            missing_fields: [],
            raw_text: "양념을 섞어 고기에 바른다",
          },
        ],
        new_cooking_methods: [],
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByText("재료를 찾지 못했어요")).toBeTruthy();
    expect(screen.queryByTestId("register-ingredient-action")).toBeNull();

    await user.click(screen.getByRole("button", { name: "재료 검색으로 교체" }));

    const dialog = await screen.findByRole("dialog", { name: "재료로 검색" });
    expect(await within(dialog).findByText("검색 결과가 없어요")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "새 재료로 등록" })).toBeNull();
  });

  it("requires visual quantity confirmation before registering a YouTube recipe", async () => {
    installMatchMedia(true);
    mockVisualQuantityExtract();

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=visual12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect((await screen.findByTestId("quantity-source-yt-ing-0")).textContent).toContain("화면 확인");
    expect(screen.getByTestId("quantity-review-yt-ing-0")).toBeTruthy();
    const registerButton = screen.getByRole("button", { name: "등록" });
    expect((registerButton as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "수량 확인" }));

    await waitFor(() => {
      expect(screen.queryByTestId("quantity-review-yt-ing-0")).toBeNull();
    });
    expect((registerButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(registerButton);

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            expect.objectContaining({
              draft_ingredient_id: "11111111-1111-4111-8111-111111111111",
              amount: 300,
              unit: "g",
              quantity_confirmation_status: "confirmed_suggestion",
            }),
          ],
        }),
      );
    });
  });

  it("sends edited_quantity when a review-required quantity is changed", async () => {
    installMatchMedia(true);
    mockVisualQuantityExtract();

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=visual12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    const amountInput = await screen.findByLabelText("두부 수량");
    await user.clear(amountInput);
    await user.type(amountInput, "250");

    expect((await screen.findByTestId("quantity-source-yt-ing-0")).textContent).toContain("직접 입력");

    const registerButton = screen.getByRole("button", { name: "등록" });
    expect((registerButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(registerButton);

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            expect.objectContaining({
              amount: 250,
              unit: "g",
              quantity_confirmation_status: "edited_quantity",
            }),
          ],
        }),
      );
    });
  });

  it("sends cleared_to_taste when a review-required quantity is cleared", async () => {
    installMatchMedia(true);
    mockVisualQuantityExtract();

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=visual12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    await user.click(await screen.findByRole("button", { name: "약간으로 저장" }));

    const registerButton = screen.getByRole("button", { name: "등록" });
    expect((registerButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(registerButton);

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            expect.objectContaining({
              amount: null,
              unit: null,
              ingredient_type: "TO_TASTE",
              display_text: "두부 약간",
              quantity_confirmation_status: "cleared_to_taste",
            }),
          ],
        }),
      );
    });
  });

  it("keeps the desktop option rail visible while opening leftovers in the right panel", async () => {
    installMatchMedia(true);
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-leftover"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(await screen.findByTestId("leftover-picker-web")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "남은 요리에서 추가" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("returns from a source picker to the planner meal-add modal context", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        restore: "meal-add-modal",
        returnSurface: "planner.meal-add-modal",
        returnTo: `/planner?date=${DEFAULT_PROPS.planDate}&columnId=${DEFAULT_PROPS.columnId}&slot=${DEFAULT_PROPS.slotName}`,
      }),
    );

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="search" />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("뒤로"));

    const replacedHref = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
    expect(replacedHref).toContain("/planner?");
    expect(replacedHref).toContain(`date=${DEFAULT_PROPS.planDate}`);
    expect(replacedHref).toContain(`columnId=${DEFAULT_PROPS.columnId}`);
    expect(replacedHref).toContain("returnSurface=planner.meal-add-modal");
    expect(replacedHref).toContain("restore=meal-add-modal");
  });

  it("renders each option with emoji, label, and the unified target label", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("meal-add-target-badge").textContent).toContain("4/18 아침");
    expect(screen.getByTestId("menu-add-option-search").textContent).toContain("레시피 검색");
    expect(screen.getByTestId("menu-add-option-recipebook").textContent).toContain("레시피북");
    expect(screen.getByTestId("menu-add-option-pantry").textContent).toContain("팬트리 추천");
    expect(screen.getByTestId("menu-add-option-youtube").textContent).toContain("유튜브 가져오기");

    const leftoverBtn = screen.getByTestId("menu-add-option-leftover");
    expect(leftoverBtn.textContent).toContain("🍱");
    expect(leftoverBtn.textContent).toContain("남은 요리");
    expect(leftoverBtn.textContent).not.toContain("4/18 아침");
    expect(leftoverBtn.textContent).not.toContain("대상 ·");
    expect(leftoverBtn.textContent).not.toContain("남은 요리에서 추가");

    const manualBtn = screen.getByTestId("menu-add-option-manual");
    expect(manualBtn.textContent).toContain("✏️");
    expect(manualBtn.textContent).toContain("직접 등록");
    expect(manualBtn.textContent).not.toContain("4/18 아침");
    expect(manualBtn.textContent).not.toContain("대상 ·");
    expect(manualBtn.textContent).not.toContain("레시피 직접 작성");
  });

  it("adds a leftover dish to the current planner slot", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
          cooking_servings: 2,
          source_meal_label: "저녁",
          source_planned_servings: 2,
        },
      ],
    });
    vi.mocked(mealApi.createMealSafe).mockResolvedValue({
      success: true,
      data: {
        id: "meal-1",
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        status: "registered",
        is_leftover: true,
        leftover_dish_id: "leftover-1",
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /남은 요리/ }));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });
    expect(screen.getByText("4/17 저녁 2인분")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => {
      expect(screen.getByText("계획 인분 입력")).toBeTruthy();
    });
    await user.click(
      within(screen.getByRole("dialog", { name: "계획 인분 입력" })).getByRole(
        "button",
        { name: "추가하기" },
      ),
    );

    await waitFor(() => {
      expect(mealApi.createMealSafe).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        leftover_dish_id: "leftover-1",
      });
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      `/planner/${DEFAULT_PROPS.planDate}/${DEFAULT_PROPS.columnId}?slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
  });

  it("shows fallback metadata for leftover dishes without source meal data", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "된장찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
          cooking_servings: 0,
          source_meal_label: null,
          source_planned_servings: null,
        },
      ],
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="leftover" />);

    expect(await screen.findByText("된장찌개")).toBeTruthy();
    expect(screen.getByText("4/17 끼니 미상 인분 미상")).toBeTruthy();
  });

  // ─── Slice 27b: YouTube Source Fallback Frontend Tests ─────────────────────

  it("renders extraction_methods as Korean labels with caption chip when transcript used", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "ext-27b-caption",
        title: "김치찌개 자막 보충 레시피",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["김치찌개"],
        extraction_methods: ["description", "caption"],
        draft_warnings: [],
        blocking_issues: [],
        ingredients: [
          {
            draft_ingredient_id: "draft-ing-1",
            ingredient_id: "ing-1",
            standard_name: "김치",
            amount: 200,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "김치 200g",
            sort_order: 1,
            scalable: true,
            confidence: 0.9,
            resolution_status: "resolved",
            candidates: [],
            raw_text: "김치 200g",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "김치를 한입 크기로 썰어주세요.",
            cooking_method: {
              id: "method-1",
              code: "prep",
              label: "손질",
              color_key: "gray",
              is_new: false,
            },
            duration_text: null,
            is_incomplete: false,
            missing_fields: [],
            raw_text: "김치를 한입 크기로 썰어주세요.",
          },
        ],
        new_cooking_methods: [],
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=transcript123",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    const chips = await screen.findByTestId("extraction-method-chips");
    expect(within(chips).getByText("설명란")).toBeTruthy();
    expect(within(chips).getByText("자막")).toBeTruthy();
    expect(within(chips).queryByText("description")).toBeNull();
    expect(within(chips).queryByText("caption")).toBeNull();
  });

  it("renders comment extraction method as Korean label", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "ext-29-author-comment",
        title: "작성자 댓글 보충 레시피",
        base_servings: 1,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["오이"],
        extraction_methods: ["comment"],
        draft_warnings: [],
        blocking_issues: [],
        ingredients: [
          {
            draft_ingredient_id: "draft-ing-author-comment",
            ingredient_id: "ing-1",
            standard_name: "오이",
            amount: 1,
            unit: "개",
            ingredient_type: "QUANT",
            display_text: "오이 1개",
            sort_order: 1,
            scalable: true,
            confidence: 0.9,
            resolution_status: "resolved",
            candidates: [],
            raw_text: "오이 1개",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "오이를 소금에 절여 물기를 빼주세요.",
            cooking_method: {
              id: "method-1",
              code: "prep",
              label: "손질",
              color_key: "gray",
              is_new: false,
            },
            duration_text: null,
            is_incomplete: false,
            missing_fields: [],
            raw_text: "오이를 소금에 절여 물기를 빼주세요.",
          },
        ],
        new_cooking_methods: [],
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=authorcomment1",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    const chips = await screen.findByTestId("extraction-method-chips");
    expect(within(chips).getByText("작성자 댓글")).toBeTruthy();
    expect(within(chips).queryByText("comment")).toBeNull();
  });

  it("renders extraction_methods as Korean labels without caption chip for description-only", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    const chips = await screen.findByTestId("extraction-method-chips");
    expect(within(chips).getByText("설명란")).toBeTruthy();
    expect(within(chips).queryByText("자막")).toBeNull();
  });

  it("shows partial draft guidance when ingredients exist but steps are empty, keeps register disabled, and allows step add", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: "ext-27b-partial",
        title: "김치찌개 부분 추출",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["김치찌개"],
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: ["steps[0].instruction"],
        ingredients: [
          {
            draft_ingredient_id: "draft-ing-1",
            ingredient_id: "ing-1",
            standard_name: "김치",
            amount: 200,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "김치 200g",
            sort_order: 1,
            scalable: true,
            confidence: 0.9,
            resolution_status: "resolved",
            candidates: [],
            raw_text: "김치 200g",
          },
        ],
        steps: [],
        new_cooking_methods: [],
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=incomplete123",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    // Partial draft guidance should be visible
    expect(await screen.findByTestId("partial-draft-guidance")).toBeTruthy();
    expect(screen.getByText("조리 과정을 직접 입력해주세요")).toBeTruthy();

    // Register button must be disabled
    const registerButton = screen.getByRole("button", { name: "등록" });
    expect(registerButton).toBeInstanceOf(HTMLButtonElement);
    expect((registerButton as HTMLButtonElement).disabled).toBe(true);

    // extraction_methods should show 설명란 only (no 자막)
    const chips = screen.getByTestId("extraction-method-chips");
    expect(within(chips).getByText("설명란")).toBeTruthy();
    expect(within(chips).queryByText("자막")).toBeNull();

    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "끓이기" }));
    await user.type(
      within(dialog).getByPlaceholderText("만들기 설명을 입력하세요"),
      "김치를 냄비에 넣고 끓인다",
    );
    await user.click(within(dialog).getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(screen.queryByTestId("partial-draft-guidance")).toBeNull();
    });
    expect((registerButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(registerButton);

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalled();
    });
  });
});
