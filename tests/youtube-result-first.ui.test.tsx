// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import * as extractionApi from "@/lib/api/youtube-extraction-jobs";
import * as youtubeApi from "@/lib/api/youtube-import";
import * as savedRecipeApi from "@/lib/api/youtube-saved-recipes";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/menu/add/youtube",
}));
vi.mock("@/lib/api/cooking-methods", () => ({ fetchCookingMethods: vi.fn() }));
vi.mock("@/lib/api/meal", () => ({ createMealSafe: vi.fn() }));
vi.mock("@/lib/api/youtube-import", () => ({
  validateYoutubeUrl: vi.fn(),
  extractYoutubeRecipe: vi.fn(),
  createYoutubeCandidateDraft: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
  registerYoutubeIngredient: vi.fn(),
  registerYoutubeIngredientsBulk: vi.fn(),
}));
vi.mock("@/lib/api/youtube-extraction-jobs", () => ({
  fetchYoutubeExtractionSession: vi.fn(),
}));
vi.mock("@/lib/api/youtube-saved-recipes", () => ({
  ensureYoutubeSavedRecipe: vi.fn(),
  fetchYoutubeSavedRecipe: vi.fn(),
  updateYoutubeSavedRecipe: vi.fn(),
}));

describe("YouTube result-first UI", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "false");
    window.history.replaceState({}, "", "/menu/add/youtube");
    routerReplace.mockReset();
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockReset();
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe).mockReset();
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.mocked(fetchCookingMethods).mockResolvedValue({ success: true, data: { methods: [] }, error: null });
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockResolvedValue({
      success: true,
      data: {
        draft_id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        created_at: "2026-10-08T00:00:00.000Z",
        updated_at: "2026-10-08T00:00:00.000Z",
        content: {
          title: "엄마표 된장찌개",
          base_servings: 2,
          tags: ["한식", "찌개"],
          ingredients: [
            { row_id: "22222222-2222-4222-8222-222222222222", source_draft_ingredient_id: null, standard_name: "두부", quantity_mode: "quantity", amount: 200, unit: "g", display_text: "두부 200g", component_label: null },
            { row_id: "33333333-3333-4333-8333-333333333333", source_draft_ingredient_id: null, standard_name: "시골 된장", quantity_mode: "unknown", amount: null, unit: null, display_text: "시골 된장", component_label: null },
          ],
          steps: [{ row_id: "44444444-4444-4444-8444-444444444444", source_step_index: 0, instruction: "냄비에 재료를 넣고 끓인다.", component_label: null, duration_text: "10분" }],
        },
        source: { extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
      },
      error: null,
    });
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mockImplementation(async (_id, revision, content) => ({
      success: true,
      data: {
        draft_id: "11111111-1111-4111-8111-111111111111",
        revision: revision + 1,
        created_at: "2026-10-08T00:00:00.000Z",
        updated_at: "2026-10-08T00:01:00.000Z",
        content,
        source: { extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
      },
      error: null,
    }));
    vi.mocked(extractionApi.fetchYoutubeExtractionSession).mockResolvedValue({
      success: true,
      data: {
        status: "draft",
        recipe_id: null,
        recipe_path: null,
        draft: {
          extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "엄마표 된장찌개",
          base_servings: 2,
          thumbnail_url: null,
          tags: ["한식", "찌개"],
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: ["ingredients[1].ingredient_id"],
          ingredients: [
            {
              draft_ingredient_id: "",
              ingredient_id: "tofu",
              standard_name: "두부",
              amount: 200,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "두부 200g",
              sort_order: 1,
              scalable: true,
              confidence: 1,
              resolution_status: "resolved",
              raw_text: "두부 200g",
            },
            {
              draft_ingredient_id: "draft-doenjang",
              ingredient_id: "",
              standard_name: "",
              amount: null,
              unit: null,
              ingredient_type: "TO_TASTE",
              display_text: "시골 된장",
              sort_order: 2,
              scalable: false,
              confidence: 0.3,
              resolution_status: "unresolved",
              raw_text: "시골 된장",
              quantity_review_required: true,
            },
          ],
          steps: [{
            step_number: 1,
            instruction: "냄비에 재료를 넣고 끓인다.",
            cooking_method: {
              id: "method-boil",
              code: "boil",
              label: "끓이기",
              color_key: "orange",
              is_new: false,
            },
            duration_text: "10분",
            is_incomplete: false,
            missing_fields: [],
            raw_text: "냄비에 재료를 넣고 끓인다.",
          }],
          new_cooking_methods: [],
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof extractionApi.fetchYoutubeExtractionSession>>);
  });

  afterEach(() => cleanup());

  it("shows a read-only result first and keeps edits when returning from ingredient controls", async () => {
    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId=""
        initialExtractionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        planDate=""
        slotName=""
      />,
    );

    expect(await screen.findByRole("heading", { name: "엄마표 된장찌개" })).toBeTruthy();
    expect(screen.getByText("기본 2인분")).toBeTruthy();
    expect(screen.getByText("시골 된장")).toBeTruthy();
    expect(screen.getByText("분량 확인 필요")).toBeTruthy();
    expect(screen.queryByLabelText("두부 수량")).toBeNull();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    const amountInput = screen.getByLabelText("두부 수량");
    expect((screen.getByLabelText("시골 된장 수량") as HTMLInputElement).value).toBe("");
    const rawNameInput = screen.getByLabelText("시골 된장 재료명");
    await user.clear(rawNameInput);
    await user.type(rawNameInput, "집된장");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가" }));
    await user.type(screen.getByLabelText("확인할 재료 재료명"), "다진 마늘");
    expect(screen.getByRole("button", { name: "다진 마늘 g" }).getAttribute("aria-pressed")).toBe("false");
    await user.type(screen.getByLabelText("다진 마늘 수량"), "2");
    expect((screen.getByLabelText("다진 마늘 단위 직접 입력") as HTMLInputElement).value).toBe("");
    await user.type(screen.getByLabelText("다진 마늘 단위 직접 입력"), "큰술");
    await user.clear(amountInput);
    await user.type(amountInput, "250");
    await user.click(screen.getByRole("button", { name: "수정 완료" }));

    expect(screen.queryByLabelText("두부 수량")).toBeNull();
    expect(screen.getByText("250g")).toBeTruthy();
    expect(screen.getAllByText("분량 확인 필요")).toHaveLength(1);
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "만들기 수정" }));
    await user.click(screen.getByRole("button", { name: "만들기 수정" }));
    const stepDialog = screen.getByRole("dialog");
    const instruction = within(stepDialog).getByPlaceholderText("만들기 설명을 입력하세요");
    await user.clear(instruction);
    await user.type(instruction, "두부를 넣고 한소끔 끓인다.");
    await user.click(within(stepDialog).getByRole("button", { name: "수정 완료" }));

    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    const savedContent = vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2];
    expect(savedContent.ingredients[1]).toMatchObject({
      standard_name: "집된장",
      quantity_mode: "unknown",
      amount: null,
      unit: null,
    });
    expect(savedContent.ingredients[2]).toMatchObject({
      standard_name: "다진 마늘",
      source_draft_ingredient_id: null,
      quantity_mode: "quantity",
      amount: 2,
      unit: "큰술",
    });
    expect(savedContent.ingredients[0].quantity_mode).toBe("quantity");
    expect(savedContent.steps[0].instruction).toBe("두부를 넣고 한소끔 끓인다.");
    expect(youtubeApi.registerYoutubeRecipe).not.toHaveBeenCalled();
  });

  it("hydrates saved catalog links and does not restore a source link after the user renames a row", async () => {
    const draftId = "11111111-1111-4111-8111-111111111112";
    const resolvedRowId = "22222222-2222-4222-8222-222222222223";
    const ambiguousRowId = "33333333-3333-4333-8333-333333333334";
    const unresolvedRowId = "44444444-4444-4444-8444-444444444445";
    const savedResult = {
      draft_id: draftId,
      revision: 1,
      created_at: "2026-10-10T00:00:00.000Z",
      updated_at: "2026-10-10T00:00:00.000Z",
      content: {
        title: "연결 상태 레시피",
        base_servings: 2,
        tags: [],
        ingredients: [
          {
            row_id: resolvedRowId,
            source_draft_ingredient_id: "55555555-5555-4555-8555-555555555556",
            standard_name: "두부",
            quantity_mode: "quantity" as const,
            amount: 200,
            unit: "g",
            display_text: "두부 200g",
            component_label: null,
          },
          {
            row_id: ambiguousRowId,
            source_draft_ingredient_id: "66666666-6666-4666-8666-666666666667",
            standard_name: "파",
            quantity_mode: "quantity" as const,
            amount: 1,
            unit: "대",
            display_text: "파 1대",
            component_label: null,
          },
          {
            row_id: unresolvedRowId,
            source_draft_ingredient_id: "77777777-7777-4777-8777-777777777778",
            standard_name: "영상 속 양념",
            quantity_mode: "unknown" as const,
            amount: null,
            unit: null,
            display_text: "영상 속 양념",
            component_label: null,
          },
        ],
        steps: [{
          row_id: "88888888-8888-4888-8888-888888888889",
          source_step_index: 0,
          instruction: "섞는다.",
          component_label: null,
          duration_text: null,
        }],
      },
      ingredient_links: {
        [resolvedRowId]: {
          ingredient_id: "99999999-9999-4999-8999-999999999991",
          resolution_status: "resolved" as const,
          candidates: [],
        },
        [ambiguousRowId]: {
          ingredient_id: null,
          resolution_status: "needs_review" as const,
          candidates: [
            { ingredient_id: "99999999-9999-4999-8999-999999999992", standard_name: "대파", confidence: 1 },
            { ingredient_id: "99999999-9999-4999-8999-999999999993", standard_name: "쪽파", confidence: 1 },
          ],
        },
        [unresolvedRowId]: {
          ingredient_id: null,
          resolution_status: "unresolved" as const,
          candidates: [],
        },
      },
      source: {
        extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
        youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
        youtube_video_id: "abcdefghijk",
        thumbnail_url: null,
      },
    };
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe).mockResolvedValueOnce({
      success: true,
      data: savedResult,
      error: null,
    });
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mockImplementationOnce(async (_id, revision, content) => ({
      success: true,
      data: {
        ...savedResult,
        revision: revision + 1,
        content,
        ingredient_links: Object.fromEntries(content.ingredients.map((ingredient) => [
          ingredient.row_id,
          {
            ingredient_id: ingredient.row_id === resolvedRowId
              ? "99999999-9999-4999-8999-999999999991"
              : null,
            resolution_status: ingredient.row_id === resolvedRowId ? "resolved" : "unresolved",
            candidates: [],
          },
        ])),
      },
      error: null,
    }));

    const user = userEvent.setup();
    const view = render(
      <YoutubeImportScreen
        columnId=""
        entryContext="standalone"
        initialSavedDraftId={draftId}
        planDate=""
        slotName=""
      />,
    );

    expect(await screen.findByRole("heading", { name: "연결 상태 레시피" })).toBeTruthy();
    expect(screen.getByText("두부")).toBeTruthy();
    expect(screen.getByText("200g")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getByRole("button", { name: "대파 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "쪽파 선택" })).toBeTruthy();
    expect(screen.getAllByText("원문 이름으로 보관해요")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "쪽파 선택" }));
    expect(screen.queryByRole("button", { name: "대파 선택" })).toBeNull();

    const selectedNameInput = screen.getByLabelText("쪽파 재료명");
    await user.clear(selectedNameInput);
    await user.type(selectedNameInput, "사용자 양념");
    await user.click(screen.getByRole("button", { name: "수정 완료" }));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    await waitFor(() => expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1));
    const savedContent = vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][2];
    expect(savedContent.ingredients[1]).toMatchObject({
      standard_name: "사용자 양념",
      source_draft_ingredient_id: null,
      amount: 1,
      unit: "대",
    });
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe).mockResolvedValueOnce({
      success: true,
      data: {
        ...savedResult,
        revision: 2,
        content: savedContent,
        ingredient_links: Object.fromEntries(savedContent.ingredients.map((ingredient) => [
          ingredient.row_id,
          {
            ingredient_id: ingredient.row_id === resolvedRowId
              ? "99999999-9999-4999-8999-999999999991"
              : null,
            resolution_status: ingredient.row_id === resolvedRowId ? "resolved" : "unresolved",
            candidates: [],
          },
        ])),
      },
      error: null,
    });
    view.unmount();
    render(
      <YoutubeImportScreen
        columnId=""
        entryContext="standalone"
        initialSavedDraftId={draftId}
        planDate=""
        slotName=""
      />,
    );
    expect(await screen.findByText("사용자 양념")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "대파 선택" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    expect(screen.getAllByText("원문 이름으로 보관해요")).toHaveLength(2);
  });

  it("requires an explicit latest read before saving a conflicted result with a new revision and key", async () => {
    const savedResult = {
      draft_id: "22222222-2222-4222-8222-222222222222",
      revision: 3,
      created_at: "2026-10-08T00:00:00.000Z",
      updated_at: "2026-10-08T00:00:00.000Z",
      content: {
        title: "보관한 된장찌개",
        base_servings: 2,
        tags: ["한식"],
        ingredients: [{
          row_id: "33333333-3333-4333-8333-333333333333",
          source_draft_ingredient_id: "55555555-5555-4555-8555-555555555555",
          standard_name: "집된장",
          quantity_mode: "unknown" as const,
          amount: null,
          unit: null,
          display_text: "집된장",
          component_label: null,
        }],
        steps: [{
          row_id: "44444444-4444-4444-8444-444444444444",
          source_step_index: 0,
          instruction: "끓인다.",
          component_label: null,
          duration_text: null,
        }],
      },
      source: {
        extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
        youtube_video_id: "abcdefghijk",
        thumbnail_url: null,
      },
    };
    const latestResult = {
      ...savedResult,
      revision: 4,
      content: {
        ...savedResult.content,
        title: "서버의 최신 된장찌개",
        ingredients: [{ ...savedResult.content.ingredients[0], standard_name: "서버 된장" }],
      },
    };
    vi.mocked(savedRecipeApi.fetchYoutubeSavedRecipe)
      .mockResolvedValueOnce({ success: true, data: savedResult, error: null })
      .mockResolvedValueOnce({ success: true, data: latestResult, error: null });
    vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "STALE_REVISION", message: "stale", fields: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ...latestResult, revision: 5 },
        error: null,
      });

    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId=""
        entryContext="standalone"
        initialSavedDraftId={savedResult.draft_id}
        planDate=""
        slotName=""
      />,
    );

    expect(await screen.findByRole("heading", { name: "보관한 된장찌개" })).toBeTruthy();
    expect(savedRecipeApi.ensureYoutubeSavedRecipe).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "변경사항 저장" })).toBeNull();
    expect(screen.getByText("분량 확인 필요")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    const savedNameInput = screen.getByLabelText("집된장 재료명");
    await user.clear(savedNameInput);
    await user.type(savedNameInput, "시골 된장");
    await user.click(screen.getByRole("button", { name: "수정 완료" }));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect(await screen.findByRole("heading", { name: "다른 곳에서 변경됐어요" })).toBeTruthy();
    expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "최신 내용 불러오기" }));
    expect(await screen.findByRole("heading", { name: "서버의 최신 된장찌개" })).toBeTruthy();
    expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    const latestNameInput = screen.getByLabelText("서버 된장 재료명");
    await user.clear(latestNameInput);
    await user.type(latestNameInput, "최종 된장");
    await user.click(screen.getByRole("button", { name: "수정 완료" }));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    await waitFor(() => expect(savedRecipeApi.updateYoutubeSavedRecipe).toHaveBeenCalledTimes(2));
    const firstKey = vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[0][3];
    const retryKey = vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[1][3];
    expect(retryKey).not.toBe(firstKey);
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[1][1]).toBe(4);
    expect(vi.mocked(savedRecipeApi.updateYoutubeSavedRecipe).mock.calls[1][2].ingredients[0])
      .toMatchObject({
        standard_name: "최종 된장",
        source_draft_ingredient_id: null,
        quantity_mode: "unknown",
        amount: null,
        unit: null,
      });
  });

  it("shows a truthful automatic-save error and retries with the same idempotency key", async () => {
    const successfulEnsure = {
      success: true as const,
      data: {
        draft_id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        created_at: "2026-10-08T00:00:00.000Z",
        updated_at: "2026-10-08T00:00:00.000Z",
        content: { title: "엄마표 된장찌개", base_servings: 2, tags: [], ingredients: [], steps: [] },
        source: { extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
      },
      error: null,
    };
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockReset();
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockResolvedValueOnce({
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: "연결이 끊겼어요.", fields: [] },
    }).mockResolvedValueOnce(successfulEnsure);
    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId=""
        initialExtractionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        planDate=""
        slotName=""
      />,
    );

    expect(await screen.findByRole("heading", { name: "레시피 저장을 마치지 못했어요" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    const firstKey = vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mock.calls[0][1];
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "엄마표 된장찌개" })).toBeTruthy();
    expect(vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mock.calls[1][1]).toBe(firstKey);
    expect(routerReplace).toHaveBeenCalledWith("/recipes/youtube/saved/11111111-1111-4111-8111-111111111111");
  });

  it("keeps the extracted draft behind a saving state until the server confirms persistence", async () => {
    let resolveEnsure!: (value: Awaited<ReturnType<typeof savedRecipeApi.ensureYoutubeSavedRecipe>>) => void;
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockReturnValueOnce(new Promise((resolve) => {
      resolveEnsure = resolve;
    }));

    render(
      <YoutubeImportScreen
        columnId=""
        initialExtractionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        planDate=""
        slotName=""
      />,
    );

    expect(await screen.findByText("추출한 레시피를 내 레시피에 저장하는 중이에요…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "엄마표 된장찌개" })).toBeNull();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();

    await act(async () => {
      resolveEnsure({
        success: true,
        data: {
          draft_id: "11111111-1111-4111-8111-111111111111",
          revision: 1,
          created_at: "2026-10-08T00:00:00.000Z",
          updated_at: "2026-10-08T00:00:00.000Z",
          content: { title: "엄마표 된장찌개", base_servings: 2, tags: [], ingredients: [], steps: [] },
          source: { extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
        },
        error: null,
      });
    });

    expect(await screen.findByRole("heading", { name: "엄마표 된장찌개" })).toBeTruthy();
  });

  it("offers login with the current extraction URL when automatic persistence is unauthorized", async () => {
    vi.mocked(savedRecipeApi.ensureYoutubeSavedRecipe).mockResolvedValueOnce({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
    });
    window.history.replaceState({}, "", "/menu/add/youtube?extractionId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    render(
      <YoutubeImportScreen
        columnId=""
        initialExtractionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        planDate=""
        slotName=""
      />,
    );

    const login = await screen.findByRole("link", { name: "로그인하고 돌아오기" });
    expect(login.getAttribute("href")).toBe(
      "/login?next=%2Fmenu%2Fadd%2Fyoutube%3FextractionId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("keeps the ingredient editor open when the responsive layout remounts", async () => {
    let desktop = false;
    const listeners = new Set<() => void>();
    const mediaQuery = {
      get matches() { return desktop; },
      media: "(min-width: 1024px)",
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQuery),
    });
    const user = userEvent.setup();
    render(
      <YoutubeImportScreen
        columnId=""
        initialExtractionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        planDate=""
        slotName=""
      />,
    );

    await screen.findByRole("heading", { name: "엄마표 된장찌개" });
    await user.click(screen.getByRole("button", { name: "재료 수정" }));
    const nameInput = screen.getByLabelText("시골 된장 재료명");
    await user.clear(nameInput);
    await user.type(nameInput, "구수한 집된장");

    act(() => {
      desktop = true;
      listeners.forEach((listener) => listener());
    });

    expect(await screen.findByRole("button", { name: "수정 완료" })).toBeTruthy();
    expect((screen.getByLabelText("구수한 집된장 재료명") as HTMLInputElement).value)
      .toBe("구수한 집된장");
  });
});
