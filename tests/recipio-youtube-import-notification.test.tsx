// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipioYoutubeImportScreen } from "@/components/recipe/recipio-youtube-import-screen";
import { checkRecipioYoutubeDuplicate } from "@/lib/api/recipio-youtube-import";
import * as youtubeApi from "@/lib/api/youtube-import";
import { YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY } from
  "@/lib/youtube-extraction-client-state";
import type { YoutubeRecipeExtractData } from "@/types/recipe";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/lib/api/recipio-youtube-import", () => ({
  checkRecipioYoutubeDuplicate: vi.fn(),
}));

vi.mock("@/lib/api/youtube-import", () => ({
  extractYoutubeRecipe: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
  validateYoutubeUrl: vi.fn(),
}));

const extractionId = "550e8400-e29b-41d4-a716-446655441201";
const youtubeUrl = "https://www.youtube.com/watch?v=X9CqUvteeMo";

function buildExtractData(): YoutubeRecipeExtractData {
  return {
    extraction_id: extractionId,
    title: "백종원 불어묵 꼬마김밥",
    base_servings: 1,
    thumbnail_url: "https://i.ytimg.com/vi/X9CqUvteeMo/hqdefault.jpg",
    tags: ["꼬마김밥"],
    extraction_methods: ["description"],
    draft_warnings: [],
    blocking_issues: [],
    ingredients: [{
      draft_ingredient_id: "550e8400-e29b-41d4-a716-446655441301",
      ingredient_id: "550e8400-e29b-41d4-a716-446655440013",
      standard_name: "어묵",
      amount: 2,
      unit: "장",
      ingredient_type: "QUANT",
      display_text: "어묵 2장",
      component_label: "김밥 속재료",
      sort_order: 1,
      scalable: true,
      confidence: 0.91,
      resolution_status: "resolved",
      raw_text: "어묵 2장",
    }],
    steps: [{
      step_number: 1,
      instruction: "어묵을 잘게 썰어 볶아요.",
      component_label: "김밥 속재료",
      cooking_method: {
        id: "550e8400-e29b-41d4-a716-446655440218",
        code: "stir_fry",
        label: "볶기",
        color_key: "orange",
        is_new: false,
      },
      duration_text: "5분",
      is_incomplete: false,
      missing_fields: [],
    }],
    new_cooking_methods: [],
  };
}

describe("Recipio Quick Import notification handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    routerPush.mockReset();
    vi.mocked(checkRecipioYoutubeDuplicate).mockResolvedValue({
      success: true,
      data: { is_duplicate: false, recipe: null },
      error: null,
    });
    vi.mocked(youtubeApi.extractYoutubeRecipe).mockResolvedValue({
      success: true,
      data: buildExtractData(),
      error: null,
    });
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockResolvedValue({
      success: true,
      data: { recipe_id: "recipe-registered", title: "백종원 불어묵 꼬마김밥" },
      error: null,
    });
  });

  afterEach(() => cleanup());

  it("suppresses the current-screen delivery key after successful registration without changing the public response", async () => {
    const registered = vi.fn();
    window.addEventListener("homecook:youtube-extraction-session-registered", registered);
    const user = userEvent.setup();

    render(<RecipioYoutubeImportScreen />);
    await user.type(screen.getByLabelText("유튜브 링크"), youtubeUrl);
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    await waitFor(() => {
      expect(registered).toHaveBeenCalledTimes(1);
    });
    expect((registered.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ extractionId });
    expect(JSON.parse(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY) ?? "[]",
    )).toEqual([extractionId]);
    expect(await screen.findByText("레시피 저장 완료")).toBeTruthy();

    window.removeEventListener("homecook:youtube-extraction-session-registered", registered);
  });

  it("keeps the async notification unseen when the register response is lost before client acknowledgement", async () => {
    vi.mocked(youtubeApi.registerYoutubeRecipe).mockResolvedValueOnce({
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: "응답을 확인하지 못했어요.", fields: [] },
    });
    const registered = vi.fn();
    window.addEventListener("homecook:youtube-extraction-session-registered", registered);
    const user = userEvent.setup();

    render(<RecipioYoutubeImportScreen />);
    await user.type(screen.getByLabelText("유튜브 링크"), youtubeUrl);
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    expect(await screen.findByText("응답을 확인하지 못했어요.")).toBeTruthy();
    expect(registered).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY)).toBeNull();

    window.removeEventListener("homecook:youtube-extraction-session-registered", registered);
  });
});
