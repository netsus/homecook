// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchIngredients } from "@/lib/api/ingredients";
import { createManualRecipe, uploadRecipeImage, type RecipeImageUploadData } from "@/lib/api/manual-recipe";
import { suggestRecipeTags } from "@/lib/api/recipe";
import { compressRecipeImageFile } from "@/lib/recipe-image-compression";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import type { ApiResponse } from "@/types/api";

const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

vi.mock("@/lib/api/manual-recipe", () => ({
  createManualRecipe: vi.fn(),
  uploadRecipeImage: vi.fn(),
}));

vi.mock("@/lib/api/recipe", () => ({
  suggestRecipeTags: vi.fn(),
}));

vi.mock("@/lib/recipe-image-compression", () => ({
  compressRecipeImageFile: vi.fn(async (file: File) => file),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

const mockStorageRemove = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({ remove: mockStorageRemove }),
    },
  }),
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

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "column-breakfast",
  slotName: "아침",
  initialAuthenticated: true,
} as const;

describe("ManualRecipeCreateScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterReplace.mockReset();
    mockStorageRemove.mockClear();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(fetchCookingMethods).mockReset();
    vi.mocked(fetchIngredients).mockReset();
    vi.mocked(createManualRecipe).mockReset();
    vi.mocked(uploadRecipeImage).mockReset();
    vi.mocked(suggestRecipeTags).mockReset();
    vi.mocked(compressRecipeImageFile).mockReset();
    vi.mocked(compressRecipeImageFile).mockImplementation(async (file: File) => file);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:manual-recipe-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-prep",
            code: "prep",
            label: "준비",
            color_key: "gray",
            is_system: true,
          },
        ],
      },
      error: null,
    });
    vi.mocked(fetchIngredients).mockResolvedValue({
      success: true,
      data: {
        items: [{ id: "ing-onion", standard_name: "양파", category: "채소" }],
      },
      error: null,
    });
    vi.mocked(suggestRecipeTags).mockResolvedValue({
      success: true,
      data: {
        suggested_tags: [
          {
            normalized_key: "초보가능",
            label: "초보가능",
            kind: "semantic",
            source: "system_suggested",
            confidence: 0.7,
          },
          {
            normalized_key: "한식",
            label: "한식",
            kind: "semantic",
            source: "system_suggested",
            confidence: 0.8,
          },
        ],
        tags: ["초보가능", "한식"],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("adds selected modal ingredients into the main form with quantity and g/ml unit controls", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));

    expect(screen.queryByLabelText("양파 수량")).toBeNull();

    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));

    const amountInput = await screen.findByLabelText("양파 수량");
    expect((amountInput as HTMLInputElement).value).toBe("100");
    expect(screen.getByRole("button", { name: "양파 g" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await user.click(screen.getByRole("button", { name: "양파 ml" }));

    expect(screen.getByRole("button", { name: "양파 ml" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("renders the desktop embedded form without nesting its own web shell", () => {
    installMatchMedia(true);

    const { container } = render(
      <ManualRecipeCreateScreen
        {...DEFAULT_PROPS}
        onRequestClose={vi.fn()}
        presentation="embedded"
      />,
    );

    expect(screen.getByTestId("manual-recipe-embedded")).toBeTruthy();
    expect(screen.getByLabelText("요리 이름")).toBeTruthy();
    expect(container.querySelector(".web-menu-add-shell")).toBeNull();
    expect(screen.queryByText("HOMECOOK")).toBeNull();
  });

  it("places the desktop embedded save button at the bottom as a larger CTA", () => {
    installMatchMedia(true);

    render(
      <ManualRecipeCreateScreen
        {...DEFAULT_PROPS}
        onRequestClose={vi.fn()}
        presentation="embedded"
      />,
    );

    const embeddedManual = screen.getByTestId("manual-recipe-embedded");
    expect(embeddedManual.querySelector(".web-menu-add-embedded-actions")).toBeNull();

    const footer = embeddedManual.querySelector(".web-manual-footer");
    expect(footer).toBeTruthy();
    const saveButton = within(footer as HTMLElement).getByRole("button", { name: "저장" });
    expect(saveButton.className).toContain("web-manual-save-button");
    expect(saveButton.className).toContain("web-button-lg");
  });

  it("places the standalone desktop save button at the bottom as a larger CTA", () => {
    installMatchMedia(true);

    const { container } = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const manualHead = container.querySelector(".web-manual-head");
    expect(manualHead).toBeTruthy();
    expect(within(manualHead as HTMLElement).queryByRole("button", { name: "저장" })).toBeNull();

    const footer = container.querySelector(".web-manual-card .web-manual-footer");
    expect(footer).toBeTruthy();
    const saveButton = within(footer as HTMLElement).getByRole("button", { name: "저장" });
    expect(saveButton.className).toContain("web-manual-save-button");
    expect(saveButton.className).toContain("web-button-lg");
  });

  it("does not show a non-interactive default step placeholder", async () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(fetchCookingMethods).toHaveBeenCalled();
    });

    expect(screen.queryByText("STEP 1")).toBeNull();
    expect(screen.getByText("만들기를 추가해주세요.")).toBeTruthy();
    expect(screen.getByTestId("manual-step-composer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "준비" })).toBeTruthy();
  });

  it("uses the tighter mobile manual-create controls requested for meal add", async () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const ingredientAddButton = screen.getByRole("button", { name: "+ 재료 추가하기" });
    expect(screen.getByRole("heading", { name: "기본 정보" }).className).toContain("font-bold");
    expect(ingredientAddButton.className).not.toContain("w-full");
    expect(ingredientAddButton.className).not.toContain("border-dashed");

    const composer = await screen.findByTestId("manual-step-composer");
    const methodRail = composer.querySelector("[aria-label='조리방법 선택']");
    expect(methodRail?.className).toContain("scrollbar-hide");
  });

  it("shows the target date and meal tag in the mobile header area", () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const targetTag = screen.getByTestId("manual-mobile-target-tag");
    expect(targetTag.textContent?.trim()).toBe("4/18 아침");
    expect(targetTag.className).toContain("rounded-[var(--radius-chip)]");
    expect(targetTag.className).not.toContain("brand-deep");
  });

  it("does not leave oversized blank space under the mobile step composer", async () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const composer = await screen.findByTestId("manual-step-composer");
    expect(composer.className).not.toContain("mb-28");
    expect(composer.className).toContain("mb-4");
  });

  it("shows inline validation instead of the bottom save requirements box after invalid save", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    expect(screen.queryByTestId("manual-save-requirements")).toBeNull();

    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getByText("요리 이름을 입력해주세요.")).toBeTruthy();
    expect(screen.getByText("재료를 1개 이상 추가해주세요.")).toBeTruthy();
    expect(screen.getByText("만들기를 추가해주세요.")).toBeTruthy();
  });

  it("uses plus and minus controls around base servings without going below one", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.click(screen.getByRole("button", { name: "기준 인분 늘리기" }));

    expect(
      within(screen.getByRole("group", { name: "기준 인분 조절" })).getByText("3인분"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "기준 인분 줄이기" }));
    await user.click(screen.getByRole("button", { name: "기준 인분 줄이기" }));
    await user.click(screen.getByRole("button", { name: "기준 인분 줄이기" }));

    expect(
      within(screen.getByRole("group", { name: "기준 인분 조절" })).getByText("1인분"),
    ).toBeTruthy();
  });

  it("requires choosing a cooking method before adding an inline cooking step", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-stir",
            code: "stir_fry",
            label: "볶기",
            color_key: "orange",
            is_system: true,
          },
        ],
      },
      error: null,
    });

    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await screen.findByRole("button", { name: "볶기" });
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(screen.getByText("조리법을 선택해 주세요.")).toBeTruthy();
    expect(screen.queryByText("1.")).toBeNull();
  });

  it("adds cooking steps inline with the selected cooking method color", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-stir",
            code: "stir_fry",
            label: "볶기",
            color_key: "orange",
            is_system: true,
          },
          {
            id: "method-boil",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_system: true,
          },
        ],
      },
      error: null,
    });

    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const composer = await screen.findByTestId("manual-step-composer");
    await user.click(screen.getByRole("button", { name: "볶기" }));
    await user.type(
      screen.getByLabelText("만들기 1 설명"),
      "양파를 투명해질 때까지 볶아요",
    );
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(composer).toBeTruthy();
    expect(screen.getByText("양파를 투명해질 때까지 볶아요")).toBeTruthy();
    expect(screen.getAllByText("볶기")[1].getAttribute("style")).toContain(
      getCookingMethodColor("orange"),
    );
    expect(screen.getByLabelText("만들기 2 설명")).toBeTruthy();
    expect(screen.getByRole("button", { name: "볶기" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    await user.type(screen.getByLabelText("만들기 2 설명"), "물을 붓고 끓여요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(screen.getByText("조리법을 선택해 주세요.")).toBeTruthy();
    expect(screen.queryByText("2.")).toBeNull();
  });

  it("lets selected ingredient chips deselect from the summary under categories", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    await user.click(onionCheckbox);

    const addButton = screen.getByRole("button", {
      name: "선택한 재료 1개 추가",
    });
    expect(addButton.className).toContain("bg-[var(--wave1-mint-contrast)]");

    await user.click(onionCheckbox);

    expect((onionCheckbox as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByRole("button", {
        name: "선택한 재료 0개 추가",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("choosing an image calls upload helper and shows preview with uploading state", async () => {
    // Keep upload pending so we can observe the uploading state
    let resolveUpload!: (value: ApiResponse<RecipeImageUploadData>) => void;
    vi.mocked(uploadRecipeImage).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });

    await user.upload(fileInput, file);

    expect(uploadRecipeImage).toHaveBeenCalledWith(file);
    expect(screen.getByTestId("manual-image-preview")).toBeTruthy();
    expect(screen.getByTestId("manual-image-uploading-indicator")).toBeTruthy();

    // Resolve the upload so the component settles
    resolveUpload({
      success: true,
      data: { thumbnail_url: "https://cdn.test/thumb.jpg", storage_path: "recipe-images/user/abc.jpg" },
      error: null,
    });

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });
    expect(screen.getByTestId("manual-image-remove-button")).toBeTruthy();
    expect(screen.queryByTestId("manual-image-uploading-indicator")).toBeNull();
  });

  it("compresses the selected image before uploading it", async () => {
    const compressedFile = new File(["small"], "photo-compressed.jpg", {
      type: "image/jpeg",
    });
    vi.mocked(compressRecipeImageFile).mockResolvedValue(compressedFile);
    vi.mocked(uploadRecipeImage).mockResolvedValue({
      success: true,
      data: {
        thumbnail_url: "https://cdn.test/compressed.jpg",
        storage_path: "recipe-images/user/compressed.jpg",
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    const originalFile = new File([new Uint8Array(2 * 1024 * 1024)], "photo.jpg", {
      type: "image/jpeg",
    });

    await user.upload(fileInput, originalFile);

    await waitFor(() => {
      expect(compressRecipeImageFile).toHaveBeenCalledWith(originalFile);
    });
    expect(uploadRecipeImage).toHaveBeenCalledWith(compressedFile);
  });

  it("keeps the latest image when an older upload resolves last", async () => {
    let resolveFirst!: (value: ApiResponse<RecipeImageUploadData>) => void;
    let resolveSecond!: (value: ApiResponse<RecipeImageUploadData>) => void;
    vi.mocked(uploadRecipeImage)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-latest-img",
        title: "최신 이미지 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    const firstFile = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["second"], "second.jpg", { type: "image/jpeg" });

    await user.upload(fileInput, firstFile);
    await user.upload(fileInput, secondFile);

    resolveSecond({
      success: true,
      data: {
        thumbnail_url: "https://cdn.test/second.jpg",
        storage_path: "recipe-images/user/second.jpg",
      },
      error: null,
    });

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    resolveFirst({
      success: true,
      data: {
        thumbnail_url: "https://cdn.test/first.jpg",
        storage_path: "recipe-images/user/first.jpg",
      },
      error: null,
    });

    await waitFor(() => {
      expect(mockStorageRemove).toHaveBeenCalledWith(["user/first.jpg"]);
    });

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "최신 이미지 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));

    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "최신 이미지로 준비하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].thumbnail_url).toBe(
      "https://cdn.test/second.jpg",
    );
  });

  it("removes an uploaded image from storage when the unsaved form unmounts", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue({
      success: true,
      data: {
        thumbnail_url: "https://cdn.test/discard.jpg",
        storage_path: "recipe-images/user/discard.jpg",
      },
      error: null,
    });

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "discard.png", { type: "image/png" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    view.unmount();

    expect(mockStorageRemove).toHaveBeenCalledWith(["user/discard.jpg"]);
  });

  it("removes an upload that finishes after the unsaved form unmounts", async () => {
    let resolveUpload!: (value: ApiResponse<RecipeImageUploadData>) => void;
    vi.mocked(uploadRecipeImage).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "slow.png", { type: "image/png" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-uploading-indicator")).toBeTruthy();
    });

    view.unmount();

    resolveUpload({
      success: true,
      data: {
        thumbnail_url: "https://cdn.test/slow.jpg",
        storage_path: "recipe-images/user/slow.jpg",
      },
      error: null,
    });

    await waitFor(() => {
      expect(mockStorageRemove).toHaveBeenCalledWith(["user/slow.jpg"]);
    });
  });

  it("successful save includes thumbnail_url from uploaded image", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue({
      success: true,
      data: { thumbnail_url: "https://cdn.test/thumb.jpg", storage_path: "recipe-images/user/abc.jpg" },
      error: null,
    });
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-new",
        title: "테스트 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          { id: "method-prep", code: "prep", label: "준비", color_key: "gray", is_system: true },
        ],
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    // Upload an image
    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "pic.png", { type: "image/png" }));
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    // Fill required fields: title
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "테스트 요리");

    // Add an ingredient
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));

    // Add a step
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파 썰기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    // Save
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    const callBody = vi.mocked(createManualRecipe).mock.calls[0][0];
    expect(callBody.thumbnail_url).toBe("https://cdn.test/thumb.jpg");
  });

  it("upload failure shows error with retry and clears the error after success", async () => {
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "NETWORK_ERROR", message: "네트워크 오류가 발생했어요.", fields: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { thumbnail_url: "https://cdn.test/thumb2.jpg", storage_path: "recipe-images/user/def.jpg" },
        error: null,
      });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    // Upload will fail.
    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["bad"], "fail.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-error")).toBeTruthy();
    });
    expect(screen.getByText("네트워크 오류가 발생했어요.")).toBeTruthy();
    expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();

    // Retry will succeed.
    await user.click(screen.getByTestId("manual-image-retry-button"));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });
    expect(screen.queryByTestId("manual-image-error")).toBeNull();
  });

  it("save without image works and does not include thumbnail_url", async () => {
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-no-img",
        title: "이미지 없는 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          { id: "method-prep", code: "prep", label: "준비", color_key: "gray", is_system: true },
        ],
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    // Fill required fields only. No image is selected.
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "이미지 없는 요리");

    // Add ingredient
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));

    // Add step
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "준비하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    // Save
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    const callBody = vi.mocked(createManualRecipe).mock.calls[0][0];
    expect(callBody.thumbnail_url).toBeUndefined();
    expect(uploadRecipeImage).not.toHaveBeenCalled();
  });

  it("shows suggested tags but omits tags from the save body until the user edits them", async () => {
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-suggested-tags",
        title: "태그 추천 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "태그 추천 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아 완성하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(await screen.findByRole("button", { name: "초보가능 삭제" })).toBeTruthy();
    expect(suggestRecipeTags).toHaveBeenCalledWith(expect.objectContaining({
      source_type: "manual",
      title: "태그 추천 요리",
    }));

    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].tags).toBeUndefined();
  });

  it("sends reviewed manual tags only after the user changes the tag editor", async () => {
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-reviewed-tags",
        title: "검수 태그 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "검수 태그 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아 완성하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    await user.click(await screen.findByRole("button", { name: "초보가능 삭제" }));
    await user.type(screen.getByLabelText("태그 추가"), "#원팬요리");
    await user.click(screen.getByRole("button", { name: "태그 추가하기" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].tags).toEqual([
      "한식",
      "원팬요리",
    ]);
  });

  it("does not let a late tag suggestion response overwrite user-edited tags", async () => {
    let resolveSuggestion!: (value: Awaited<ReturnType<typeof suggestRecipeTags>>) => void;
    vi.mocked(suggestRecipeTags).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSuggestion = resolve;
        }),
    );
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-stale-suggestion",
        title: "늦은 추천 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "늦은 추천 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아 완성하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    await waitFor(() => {
      expect(suggestRecipeTags).toHaveBeenCalled();
    });
    await user.type(screen.getByLabelText("태그 추가"), "원팬요리");
    await user.click(screen.getByRole("button", { name: "태그 추가하기" }));

    resolveSuggestion({
      success: true,
      data: {
        suggested_tags: [
          {
            normalized_key: "초보가능",
            label: "초보가능",
            kind: "semantic",
            source: "system_suggested",
            confidence: 0.7,
          },
        ],
        tags: ["초보가능"],
      },
      error: null,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "원팬요리 삭제" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "초보가능 삭제" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].tags).toEqual(["원팬요리"]);
  });

  it("keeps manual save available when tag suggestions fail without overwriting server tags", async () => {
    vi.mocked(suggestRecipeTags).mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: "TAG_SUGGESTION_FAILED",
        message: "태그 추천을 불러오지 못했어요.",
        fields: [],
      },
    });
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-tag-suggestion-failed",
        title: "추천 실패 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "추천 실패 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아 완성하기");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(await screen.findByText("태그 추천을 불러오지 못했어요.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].tags).toBeUndefined();
  });
});
