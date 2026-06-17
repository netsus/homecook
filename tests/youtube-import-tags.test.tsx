// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import * as youtubeApi from "@/lib/api/youtube-import";

const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

vi.mock("@/lib/api/youtube-import", () => ({
  validateYoutubeUrl: vi.fn(),
  extractYoutubeRecipe: vi.fn(),
  createYoutubeCandidateDraft: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
  registerYoutubeIngredient: vi.fn(),
  registerYoutubeIngredientsBulk: vi.fn(),
}));

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

function mockYoutubeDraft(tags = ["유튜브레시피", "디저트"]) {
  vi.mocked(youtubeApi.validateYoutubeUrl).mockResolvedValue({
    success: true,
    data: {
      is_valid_url: true,
      is_recipe_video: true,
      classification_status: "recipe",
      classification_reasons: [],
      video_info: {
        video_id: "recipe12345",
        title: "바삭 쿠키",
        channel: "테스트 채널",
        duration: "PT3M",
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
      },
    },
    error: null,
  });
  vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValue({
    success: true,
    data: {
      extraction_id: "ext-tags",
      title: "바삭 쿠키",
      base_servings: 2,
      thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
      tags,
      suggested_tags: tags.map((tag) => ({
        normalized_key: tag,
        label: tag,
        kind: tag === "유튜브레시피" ? "source" : "semantic",
        source: "system_suggested",
        confidence: 0.8,
      })),
      extraction_methods: ["description"],
      draft_warnings: [],
      blocking_issues: [],
      ingredients: [
        {
          draft_ingredient_id: "",
          ingredient_id: "ing-flour",
          standard_name: "밀가루",
          amount: 200,
          unit: "g",
          ingredient_type: "QUANT",
          display_text: "밀가루 200g",
          sort_order: 1,
          scalable: true,
          confidence: 0.9,
          resolution_status: "resolved",
          candidates: [],
          raw_text: "밀가루 200g",
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "반죽을 굽는다",
          cooking_method: {
            id: "method-bake",
            code: "bake",
            label: "굽기",
            color_key: "orange",
            is_new: false,
          },
          duration_text: "15분",
          is_incomplete: false,
          missing_fields: [],
          raw_text: "반죽을 굽는다",
        },
      ],
      new_cooking_methods: [],
    },
    error: null,
  });
}

describe("YoutubeImportScreen tag review", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterReplace.mockReset();
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-bake",
            code: "bake",
            label: "굽기",
            color_key: "orange",
            is_system: true,
          },
        ],
      },
      error: null,
    });
    vi.mocked(youtubeApi.validateYoutubeUrl).mockReset();
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockReset();
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockReset();
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockResolvedValue({
      success: true,
      data: {
        recipe_id: "recipe-youtube-tags",
        title: "바삭 쿠키",
      },
      error: null,
    });
    vi.mocked(youtubeApi.createYoutubeCandidateDraft).mockReset();
    vi.mocked(youtubeApi.registerYoutubeIngredient).mockReset();
    vi.mocked(youtubeApi.registerYoutubeIngredientsBulk).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows session tags and omits tags from register when unchanged", async () => {
    mockYoutubeDraft();

    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId="column-breakfast"
        initialYoutubeUrl="https://www.youtube.com/watch?v=recipe12345"
        planDate="2026-04-18"
        slotName="아침"
      />,
    );

    expect(await screen.findByRole("button", { name: "유튜브레시피 삭제" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(youtubeApi.registerYoutubeRecipe).mock.calls[0][0].tags).toBeUndefined();
  });

  it("sends reviewed tags when the user edits YouTube tags", async () => {
    mockYoutubeDraft();

    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId="column-breakfast"
        initialYoutubeUrl="https://www.youtube.com/watch?v=recipe12345"
        planDate="2026-04-18"
        slotName="아침"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "디저트 삭제" }));
    await user.type(screen.getByLabelText("태그 추가"), "#바삭");
    await user.click(screen.getByRole("button", { name: "태그 추가하기" }));
    await user.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() => {
      expect(youtubeApi.registerYoutubeRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(youtubeApi.registerYoutubeRecipe).mock.calls[0][0].tags).toEqual([
      "유튜브레시피",
      "바삭",
    ]);
  });
});
