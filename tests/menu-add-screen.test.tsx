// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import { fetchIngredients } from "@/lib/api/ingredients";
import * as recipeApi from "@/lib/api/recipe";
import * as youtubeApi from "@/lib/api/youtube-import";
import * as savedRecipeApi from "@/lib/api/youtube-saved-recipes";
import type { YoutubeRecipeExtractData } from "@/types/recipe";
import type { YoutubeSavedRecipeResult } from "@/types/youtube-saved-recipe";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/menu-add",
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBooks: vi.fn(),
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

vi.mock("@/lib/api/youtube-saved-recipes", () => ({
  ensureYoutubeSavedRecipe: vi.fn(),
  fetchYoutubeSavedRecipe: vi.fn(),
  updateYoutubeSavedRecipe: vi.fn(),
}));

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "550e8400-e29b-41d4-a716-446655440050",
  slotName: "아침",
} as const;

const EXTRACTION_IDS = {
  default: "20000000-0000-4000-8000-000000000001",
  visualQuantity: "20000000-0000-4000-8000-000000000002",
  multiParent: "20000000-0000-4000-8000-000000000003",
  unresolved: "20000000-0000-4000-8000-000000000005",
  legacyUnresolved: "20000000-0000-4000-8000-000000000006",
  caption: "20000000-0000-4000-8000-000000000007",
  authorComment: "20000000-0000-4000-8000-000000000008",
  partial: "20000000-0000-4000-8000-000000000009",
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const savedResults = new Map<string, YoutubeSavedRecipeResult>();
const savedDraftIds = new Map<string, string>();

function stableUuid(prefix: string, index: number) {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function buildSavedResult(
  draft: YoutubeRecipeExtractData,
  youtubeUrl: string,
): YoutubeSavedRecipeResult {
  const existingDraftId = savedDraftIds.get(draft.extraction_id);
  if (existingDraftId) {
    const existing = savedResults.get(existingDraftId);
    if (!existing) throw new Error(`saved draft index is inconsistent: ${existingDraftId}`);
    return existing;
  }
  const draftId = stableUuid("70000000", savedDraftIds.size + 1);
  savedDraftIds.set(draft.extraction_id, draftId);

  const ingredients = draft.ingredients.map((ingredient, index) => {
    const quantityConfirmationStatus = (
      ingredient as typeof ingredient & { quantity_confirmation_status?: string }
    ).quantity_confirmation_status;
    const sourceId = UUID_PATTERN.test(ingredient.draft_ingredient_id)
      ? ingredient.draft_ingredient_id
      : null;
    const rowId = sourceId ?? stableUuid("71000000", index + 1);
    const needsReview = ingredient.quantity_review_required === true
      && ingredient.quantity_user_confirmed !== true;
    const quantityMode = needsReview
      ? "unknown" as const
      : quantityConfirmationStatus === "cleared_to_taste"
        ? "to_taste" as const
        : ingredient.ingredient_type === "TO_TASTE"
          && ingredient.quantity_review_required !== true
          && ["text_explicit", "visual_explicit", "user_entered"].includes(ingredient.quantity_source ?? "")
          ? "to_taste" as const
          : ingredient.amount !== null && Boolean(ingredient.unit?.trim())
            ? "quantity" as const
            : "unknown" as const;

    return {
      row_id: rowId,
      source_draft_ingredient_id: sourceId,
      standard_name: ingredient.standard_name.trim() || ingredient.raw_text?.trim() || "재료",
      quantity_mode: quantityMode,
      amount: ingredient.amount,
      unit: ingredient.unit,
      display_text: ingredient.display_text || ingredient.quantity_raw_text || null,
      component_label: ingredient.component_label ?? null,
    };
  });
  const ingredientLinks = Object.fromEntries(ingredients.map((ingredient) => [
    ingredient.row_id,
    {
      ingredient_id: null,
      resolution_status: "unresolved" as const,
      candidates: [],
    },
  ]));
  const videoId = new URL(youtubeUrl).searchParams.get("v") ?? "";
  const result: YoutubeSavedRecipeResult = {
    draft_id: draftId,
    revision: 1,
    created_at: "2026-10-11T00:00:00.000Z",
    updated_at: "2026-10-11T00:00:00.000Z",
    content: {
      title: draft.title.trim(),
      base_servings: Math.max(1, draft.base_servings),
      tags: draft.tags,
      ingredients,
      steps: draft.steps.map((step, index) => ({
        row_id: stableUuid("72000000", index + 1),
        source_step_index: index,
        instruction: step.instruction.trim(),
        component_label: step.component_label ?? null,
        duration_text: step.duration_text,
      })),
    },
    ingredient_links: ingredientLinks,
    source: {
      extraction_id: draft.extraction_id,
      youtube_url: youtubeUrl,
      youtube_video_id: videoId,
      thumbnail_url: draft.thumbnail_url,
    },
  };
  savedResults.set(result.draft_id, result);
  return result;
}

function findExtractedDraft(extractionId: string) {
  const extractionMock = vi.mocked(youtubeApi.extractYoutubeRecipe).mock;
  for (const [index, settled] of extractionMock.settledResults.entries()) {
    if (settled.type === "fulfilled" && settled.value.success
      && settled.value.data?.extraction_id === extractionId) {
      return {
        draft: settled.value.data,
        youtubeUrl: extractionMock.calls[index]?.[0].youtube_url ?? "",
      };
    }
  }

  const candidateMock = vi.mocked(youtubeApi.createYoutubeCandidateDraft).mock;
  for (const settled of candidateMock.settledResults) {
    if (settled.type !== "fulfilled" || !settled.value.success
      || settled.value.data?.draft.extraction_id !== extractionId) continue;
    const parentIndex = extractionMock.settledResults.findIndex(
      (parent) => parent.type === "fulfilled" && parent.value.success
        && parent.value.data?.extraction_id === settled.value.data?.parent_extraction_id,
    );
    if (parentIndex < 0) {
      throw new Error(`candidate draft resolved before its parent extraction: ${extractionId}`);
    }
    return {
      draft: settled.value.data.draft,
      youtubeUrl: extractionMock.calls[parentIndex]?.[0].youtube_url ?? "",
    };
  }

  throw new Error(`ensureYoutubeSavedRecipe called before a matching extraction: ${extractionId}`);
}

function mockVisualQuantityExtract(ingredientOverrides = {}) {
  vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
    success: true,
    data: {
      extraction_id: EXTRACTION_IDS.visualQuantity,
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
    vi.stubEnv("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES", "1");
    installMatchMedia(false);
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(fetchIngredients).mockReset();
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
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockReset();
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe).mockReset();
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mockReset();
    savedResults.clear();
    savedDraftIds.clear();
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockImplementation(
      async (extractionId, idempotencyKey) => {
        if (!UUID_PATTERN.test(extractionId)) {
          throw new Error(`ensureYoutubeSavedRecipe received an invalid extraction id: ${extractionId}`);
        }
        if (!UUID_PATTERN.test(idempotencyKey)) {
          throw new Error(`ensureYoutubeSavedRecipe received an invalid idempotency key: ${idempotencyKey}`);
        }
        const { draft, youtubeUrl } = findExtractedDraft(extractionId);
        if ((draft.multi_recipe_status && draft.multi_recipe_status !== "single")
          || (draft.recipe_candidates?.length ?? 0) > 0) {
          return {
            success: false,
            data: null,
            error: {
              code: "CONFLICT",
              message: "저장 결과가 변경됐어요. 최신 내용을 다시 확인해 주세요.",
              fields: [],
            },
          };
        }
        return { success: true, data: buildSavedResult(draft, youtubeUrl), error: null };
      },
    );
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe).mockImplementation(async (draftId) => {
      const saved = savedResults.get(draftId);
      if (!saved) throw new Error(`fetchYoutubeSavedRecipe received an unknown draft id: ${draftId}`);
      return { success: true, data: saved, error: null };
    });
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mockImplementation(
      async (draftId, revision, content, idempotencyKey) => {
        if (!UUID_PATTERN.test(idempotencyKey)) {
          throw new Error(`updateYoutubeSavedRecipe received an invalid idempotency key: ${idempotencyKey}`);
        }
        const saved = savedResults.get(draftId);
        if (!saved || saved.revision !== revision) {
          throw new Error(`updateYoutubeSavedRecipe received stale or unknown state: ${draftId}@${revision}`);
        }
        if (!content.title.trim() || content.ingredients.some((ingredient) => !UUID_PATTERN.test(ingredient.row_id))) {
          throw new Error("updateYoutubeSavedRecipe received invalid editable content");
        }
        const updated: YoutubeSavedRecipeResult = {
          ...saved,
          revision: revision + 1,
          updated_at: "2026-10-11T00:01:00.000Z",
          content,
        };
        savedResults.set(draftId, updated);
        return { success: true, data: updated, error: null };
      },
    );
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
        extraction_id: EXTRACTION_IDS.default,
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
    vi.unstubAllEnvs();
  });

  it("opens the mobile YouTube import screen from the option tile", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");

    expect((youtubeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(youtubeButton);

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "유튜브 가져오기" })).toBeNull();
    expect(screen.getByRole("heading", { name: "유튜브 가져오기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(screen.getByLabelText("유튜브 URL")).toBeTruthy();
  });

  it("keeps the mobile YouTube review step scrollable", async () => {
    const { container } = render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { name: "백종원 김치찌개" })).toBeTruthy();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.default,
      expect.stringMatching(UUID_PATTERN),
    );
    expect(vi.mocked(youtubeApi.validateYoutubeUrl).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(youtubeApi.extractYoutubeRecipe).mock.invocationCallOrder[0]);
    expect(vi.mocked(youtubeApi.extractYoutubeRecipe).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mock.invocationCallOrder[0]);

    const shell = container.querySelector(".yt-mobile-import-shell");
    const scrollRegion = container.querySelector(".yt-mobile-import-scroll");
    expect(shell?.className).toContain("h-dvh");
    expect(shell?.className).toContain("overflow-hidden");
    expect(scrollRegion?.className).toContain("overflow-y-auto");
    expect(scrollRegion?.className).toContain("overscroll-y-contain");
  });

  // ─── Wave1 acceptance tests ─────────────────────────────────────────────────

  it("renders the mobile option list with correct data-testids (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const grid = screen.getByTestId("menu-add-option-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("flex");

    // Planner options deliberately exclude leftovers; cooked food is recorded
    // from the meal-log add sheet instead.
    expect(screen.getByTestId("menu-add-option-search")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-recipebook")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-pantry")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-product")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-youtube")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-manual")).toBeTruthy();
    expect(screen.queryByTestId("menu-add-option-leftover")).toBeNull();
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

  it("uses matching typography for YouTube and manual option tiles while giving recipebook a cover cue", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const recipeBookButton = screen.getByTestId("menu-add-option-recipebook");
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");
    const manualButton = screen.getByTestId("menu-add-option-manual");
    const recipeBookCover = screen.getByTestId("menu-add-option-recipebook-cover");

    expect(youtubeButton.className).toContain("menu-add-option-card");
    expect(manualButton.className).toContain("menu-add-option-card");
    expect(recipeBookButton.className).toContain("menu-add-option-card");
    expect(recipeBookCover.className).toContain("menu-add-recipebook-cover");
    expect(recipeBookCover.className).toContain("mobile-recipebook-book-card-sky");
    expect(recipeBookCover.textContent).not.toContain("📖");
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

  it("marks recipe search as the active desktop option on first entry", () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const searchOption = screen.getByTestId("menu-add-option-search");
    const recipeBookOption = screen.getByTestId("menu-add-option-recipebook");

    expect(searchOption.className).toContain("web-menu-add-card-active");
    expect(recipeBookOption.className).not.toContain("web-menu-add-card-active");
    expect(screen.getByLabelText("레시피 검색")).toBeTruthy();
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

    expect(await screen.findByRole("heading", { name: "백종원 김치찌개" })).toBeTruthy();
    expect(screen.getByTestId("youtube-import-embedded")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "가져오기 화면 열기" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("does not pretend a multi-recipe parent can be saved as a recipe result", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.multiParent,
        title: "집밥 모음",
        base_servings: 1,
        thumbnail_url: "https://i.ytimg.com/vi/multi12345/hqdefault.jpg",
        tags: ["집밥"],
        extraction_methods: ["caption"],
        draft_warnings: ["영상 안에서 여러 요리 후보를 찾았어요. 저장할 요리를 먼저 선택해 주세요."],
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
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=multi12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { name: "레시피 저장을 마치지 못했어요" })).toBeTruthy();
    expect(screen.getByText("저장 결과가 변경됐어요. 최신 내용을 다시 확인해 주세요.")).toBeTruthy();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.multiParent,
      expect.stringMatching(UUID_PATTERN),
    );
    expect(youtubeApi.createYoutubeCandidateDraft).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("keeps an unresolved YouTube ingredient private and clears source provenance after rename", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.unresolved,
        title: "목살 양념구이",
        base_servings: 2,
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        tags: ["목살 양념구이"],
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: ["ingredients[0].ingredient_id"],
        ingredients: [
          {
            draft_ingredient_id: "11111111-1111-4111-8111-111111111112",
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

    expect(await screen.findByRole("heading", { name: "목살 양념구이" })).toBeTruthy();
    expect(screen.getByText("연겨자")).toBeTruthy();
    expect(screen.getByText("0.2스푼")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getByText("원문 이름으로 보관해요")).toBeTruthy();
    expect(screen.queryByTestId("register-ingredient-action")).toBeNull();

    const nameInput = screen.getByLabelText("연겨자 재료명");
    await user.clear(nameInput);
    await user.type(nameInput, "홀그레인 머스터드");
    await user.click(screen.getAllByRole("button", { name: "변경사항 저장" })[0]);

    await waitFor(() => expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1));
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])
      .toMatchObject({
        source_draft_ingredient_id: null,
        standard_name: "홀그레인 머스터드",
        quantity_mode: "quantity",
        amount: 0.2,
        unit: "스푼",
      });
    expect(youtubeApi.registerYoutubeIngredient).not.toHaveBeenCalled();
  });

  it("does not offer ingredient registration from empty search when the draft id is missing", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.legacyUnresolved,
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

    expect(await screen.findByRole("heading", { name: "목살 양념구이" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getByText("원문 이름으로 보관해요")).toBeTruthy();
    expect(screen.queryByTestId("register-ingredient-action")).toBeNull();

    await user.click(screen.getByRole("button", { name: "재료 검색으로 교체" }));

    const dialog = await screen.findByRole("dialog", { name: "재료로 검색" });
    expect(await within(dialog).findByText("검색 결과가 없어요")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "새 재료로 등록" })).toBeNull();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.legacyUnresolved,
      expect.stringMatching(UUID_PATTERN),
    );
    expect(youtubeApi.registerYoutubeIngredient).not.toHaveBeenCalled();
  });

  it("requires saved visual quantity confirmation before updating the private recipe", async () => {
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

    expect(await screen.findByRole("heading", { name: "두부조림" })).toBeTruthy();
    expect(screen.getByText("분량 확인 필요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "변경사항 저장" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getByTestId("quantity-review-11111111-1111-4111-8111-111111111111")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "수량 확인" }));

    await waitFor(() => {
      expect(screen.queryByTestId("quantity-review-11111111-1111-4111-8111-111111111111")).toBeNull();
    });
    await user.click(screen.getAllByRole("button", { name: "변경사항 저장" })[0]);

    await waitFor(() => {
      expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])
      .toMatchObject({
        source_draft_ingredient_id: "11111111-1111-4111-8111-111111111111",
        quantity_mode: "quantity",
        amount: 300,
        unit: "g",
      });
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();
  });

  it("keeps an inferred quantity review-required after automatic save", async () => {
    installMatchMedia(true);
    mockVisualQuantityExtract({
      quantity_source: "recipe_inferred",
      quantity_confidence: 0.48,
      quantity_raw_text: "영상 흐름과 재료 역할 기준 두부 300g 추정",
      quantity_evidence_refs: [
        {
          source_method: "visual",
          source_provider: "gemini",
          frame_ts_ms: 12000,
          snippet: "영상에서 두부 한 모를 사용하는 흐름",
          locator_hash: "hash-tofu-inferred",
        },
      ],
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=visual12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { name: "두부조림" })).toBeTruthy();
    expect(screen.getByText("분량 확인 필요")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getByTestId("quantity-review-11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect((screen.getByLabelText("두부 수량") as HTMLInputElement).value).toBe("300");
    expect(screen.queryByTestId("quantity-estimate-badge-11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("persists an edited review-required quantity through the saved recipe API", async () => {
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

    expect(await screen.findByRole("heading", { name: "두부조림" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    const amountInput = screen.getByLabelText("두부 수량");
    await user.clear(amountInput);
    await user.type(amountInput, "250");

    await user.click(screen.getAllByRole("button", { name: "변경사항 저장" })[0]);

    await waitFor(() => {
      expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])
      .toMatchObject({ quantity_mode: "quantity", amount: 250, unit: "g" });
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();
  });

  it("persists a review-required quantity cleared to taste through the saved recipe API", async () => {
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

    expect(await screen.findByRole("heading", { name: "두부조림" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    await user.click(screen.getByRole("button", { name: "약간으로 저장" }));
    await user.click(screen.getAllByRole("button", { name: "변경사항 저장" })[0]);

    await waitFor(() => {
      expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])
      .toMatchObject({ quantity_mode: "to_taste", amount: null, unit: null });
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();
  });

  it("keeps the desktop option rail limited to the current planner sources", () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-product")).toBeTruthy();
    expect(screen.queryByTestId("menu-add-option-leftover")).toBeNull();
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
    await user.click(screen.getByLabelText("뒤로 가기"));

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
    expect(screen.getByTestId("menu-add-option-pantry").textContent).toContain("팬트리에서 찾기");
    expect(screen.getByTestId("menu-add-option-product").textContent).toContain("완제품");
    expect(screen.getByTestId("menu-add-option-youtube").textContent).toContain("유튜브");
    expect(screen.queryByTestId("menu-add-option-leftover")).toBeNull();

    const manualBtn = screen.getByTestId("menu-add-option-manual");
    expect(manualBtn.textContent).toContain("✏️");
    expect(manualBtn.textContent).toContain("직접 등록");
    expect(manualBtn.textContent).not.toContain("4/18 아침");
    expect(manualBtn.textContent).not.toContain("대상 ·");
    expect(manualBtn.textContent).not.toContain("레시피 직접 작성");
  });

  // ─── Slice 27b: YouTube Source Fallback Frontend Tests ─────────────────────

  it("does not render extraction method chips when transcript was used", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.caption,
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

    expect(await screen.findByRole("heading", { name: "김치찌개 자막 보충 레시피" })).toBeTruthy();
    expect(screen.queryByTestId("extraction-method-chips")).toBeNull();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.caption,
      expect.stringMatching(UUID_PATTERN),
    );
  });

  it("does not render extraction method chips when author comments were used", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.authorComment,
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

    expect(await screen.findByRole("heading", { name: "작성자 댓글 보충 레시피" })).toBeTruthy();
    expect(screen.queryByTestId("extraction-method-chips")).toBeNull();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.authorComment,
      expect.stringMatching(UUID_PATTERN),
    );
  });

  it("does not render extraction method chips for description-only extraction", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));
    await user.type(
      screen.getByLabelText("유튜브 URL"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { name: "백종원 김치찌개" })).toBeTruthy();
    expect(screen.queryByTestId("extraction-method-chips")).toBeNull();
  });

  it("keeps a partial draft saved, guides step editing, and persists the added step", async () => {
    installMatchMedia(true);
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        extraction_id: EXTRACTION_IDS.partial,
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

    expect(await screen.findByRole("heading", { name: "김치찌개 부분 추출" })).toBeTruthy();
    expect(screen.getByText("추출된 만들기가 없어요.")).toBeTruthy();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledWith(
      EXTRACTION_IDS.partial,
      expect.stringMatching(UUID_PATTERN),
    );
    expect(screen.queryByRole("button", { name: "변경사항 저장" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "만들기 수정" }));
    expect(screen.getByTestId("partial-draft-guidance")).toBeTruthy();
    expect(screen.getByText("조리 과정을 직접 입력해 주세요")).toBeTruthy();

    expect(screen.queryByTestId("extraction-method-chips")).toBeNull();

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
    await user.click(screen.getAllByRole("button", { name: "변경사항 저장" })[0]);

    await waitFor(() => {
      expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2].steps)
      .toEqual([
        expect.objectContaining({
          source_step_index: null,
          instruction: "김치를 냄비에 넣고 끓인다",
        }),
      ]);
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();
  });
});
