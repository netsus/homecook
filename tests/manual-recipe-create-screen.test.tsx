// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchIngredients } from "@/lib/api/ingredients";
import {
  cancelRecipeImage,
  createManualRecipe,
  uploadRecipeImage,
} from "@/lib/api/manual-recipe";
import { suggestRecipeTags } from "@/lib/api/recipe";
import { compressRecipeImageFile } from "@/lib/recipe-image-compression";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";

const mockRouterReplace = vi.fn();
const mockRouterPush = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

vi.mock("@/lib/api/manual-recipe", () => ({
  cancelRecipeImage: vi.fn(),
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

type UploadResult = Awaited<ReturnType<typeof uploadRecipeImage>>;

function managedUploadSuccess(
  overrides: Partial<{
    image_object_id: string;
    read_url: string;
    read_url_expires_at: string;
    state: string;
  }> = {},
) {
  return {
    success: true,
    data: {
      image_object_id:
        overrides.image_object_id ?? "550e8400-e29b-41d4-a716-446655440030",
      read_url: overrides.read_url ?? "https://signed.example.com/private.png",
      read_url_expires_at:
        overrides.read_url_expires_at ?? "2099-07-30T03:05:00.000Z",
      state: overrides.state ?? "uploaded_unlinked",
    },
    error: null,
  } as unknown as UploadResult;
}

async function fillMinimumManualRecipe(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  await user.type(screen.getByPlaceholderText("예: 김치찌개"), title);
  await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
  await user.click(await screen.findByRole("checkbox", { name: "양파" }));
  await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
  await screen.findByRole("button", { name: "준비" });
  await user.click(screen.getByRole("button", { name: "준비" }));
  await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
  await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
}

describe("ManualRecipeCreateScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterReplace.mockReset();
    mockRouterPush.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(fetchCookingMethods).mockReset();
    vi.mocked(fetchIngredients).mockReset();
    vi.mocked(cancelRecipeImage).mockReset();
    vi.mocked(cancelRecipeImage).mockResolvedValue({
      success: true,
      data: {
        image_object_id: "550e8400-e29b-41d4-a716-446655440030",
        state: "cleanup_pending",
      },
      error: null,
    });
    vi.mocked(createManualRecipe).mockReset();
    vi.mocked(uploadRecipeImage).mockReset();
    vi.mocked(suggestRecipeTags).mockReset();
    vi.mocked(compressRecipeImageFile).mockReset();
    vi.mocked(compressRecipeImageFile).mockImplementation(async (file: File) => file);
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      vi
        .fn()
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440101")
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440102")
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440103")
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440104")
        .mockReturnValue("550e8400-e29b-41d4-a716-446655440199"),
    );
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
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("uses the shared app back button in the mobile app bar", () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const backButton = screen.getByRole("button", { name: "뒤로 가기" });
    expect(backButton.className).toContain("h-[var(--app-back-button-size)]");
    expect(backButton.className).toContain("w-[var(--app-back-button-size)]");
    expect(backButton.className).toContain("rounded-[var(--app-back-button-radius)]");
    expect(backButton.querySelector("svg")?.getAttribute("class") ?? "").toContain(
      "h-[var(--app-back-button-icon-size)]",
    );
  });

  it("uses the shared dirty guard before closing the planner-add editor", async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    render(
      <ManualRecipeCreateScreen
        {...DEFAULT_PROPS}
        onRequestClose={onRequestClose}
        presentation="embedded"
      />,
    );

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "수정 중인 요리");
    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(
      screen.getByRole("dialog", { name: "변경사항을 버릴까요?" }),
    ).toBeTruthy();
    expect(onRequestClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("uses the dirty guard before a mobile bottom-tab navigation", async () => {
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "탭 이동 보호");
    await user.click(screen.getByRole("link", { name: "홈" }));

    expect(
      screen.getByRole("dialog", { name: "변경사항을 버릴까요?" }),
    ).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "변경사항 버리기" }));
    await waitFor(() => {
      expect(historyBack).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });

  it("uses the dirty guard before a desktop top-navigation link", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "웹 메뉴 보호");
    await user.click(screen.getByRole("link", { name: "홈" }));

    expect(
      screen.getByRole("dialog", { name: "변경사항을 버릴까요?" }),
    ).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("uses the same dirty guard for browser back and unload", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "브라우저 보호 요리");

    const unloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "변경사항을 버릴까요?" }),
      ).toBeTruthy();
    });
  });

  it("keeps browser back blocked while a managed upload is still pending", async () => {
    let resolveUpload!: (value: UploadResult) => void;
    vi.mocked(uploadRecipeImage).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["img"], "pending.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(uploadRecipeImage).toHaveBeenCalledOnce();
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(
      screen.queryByRole("dialog", { name: "변경사항을 버릴까요?" }),
    ).toBeNull();

    resolveUpload(managedUploadSuccess());
  });

  it("removes the browser history guard when a reverted draft becomes clean", async () => {
    const user = userEvent.setup();
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const historyPush = vi.spyOn(window.history, "pushState");
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const title = screen.getByPlaceholderText("예: 김치찌개");
    await user.type(title, "원복할 제목");

    await waitFor(() => {
      expect(historyPush).toHaveBeenCalledTimes(1);
    });

    await user.clear(title);

    await waitFor(() => {
      expect(historyBack).toHaveBeenCalledTimes(1);
    });
  });

  it("does not show a non-interactive default step placeholder", async () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(fetchCookingMethods).toHaveBeenCalled();
    });

    expect(screen.queryByText("STEP 1")).toBeNull();
    expect(screen.getByText("만들기를 추가해 주세요.")).toBeTruthy();
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

    expect(screen.getByText("요리 이름을 입력해 주세요.")).toBeTruthy();
    expect(screen.getByText("재료를 1개 이상 추가해 주세요.")).toBeTruthy();
    expect(screen.getByText("만들기를 추가해 주세요.")).toBeTruthy();
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
    let resolveUpload!: (value: UploadResult) => void;
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

    expect(uploadRecipeImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
    expect(screen.getByTestId("manual-image-preview")).toBeTruthy();
    expect(screen.getByTestId("manual-image-uploading-indicator")).toBeTruthy();

    // Resolve the upload so the component settles
    resolveUpload(managedUploadSuccess());

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
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440040",
        read_url: "https://signed.example.com/compressed.png",
      }),
    );

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
    expect(uploadRecipeImage).toHaveBeenCalledWith(
      compressedFile,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
  });

  it("keeps the latest image when an older upload resolves last", async () => {
    let resolveFirst!: (value: UploadResult) => void;
    let resolveSecond!: (value: UploadResult) => void;
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

    resolveSecond(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440050",
        read_url: "https://signed.example.com/second.png",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    resolveFirst(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440051",
        read_url: "https://signed.example.com/first.png",
      }),
    );

    await waitFor(() => {
      expect(cancelRecipeImage).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440051",
        { idempotencyKey: expect.any(String) },
      );
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
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].image_object_id).toBe(
      "550e8400-e29b-41d4-a716-446655440050",
    );
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].thumbnail_url).toBeUndefined();
  });

  it("cancels a managed upload when the unsaved form unmounts", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440060",
        read_url: "https://signed.example.com/discard.png",
      }),
    );

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "discard.png", { type: "image/png" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    view.unmount();

    expect(cancelRecipeImage).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440060",
      { idempotencyKey: expect.any(String) },
    );
  });

  it("cancels a managed upload that finishes after the unsaved form unmounts", async () => {
    let resolveUpload!: (value: UploadResult) => void;
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

    resolveUpload(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440061",
        read_url: "https://signed.example.com/slow.png",
      }),
    );

    await waitFor(() => {
      expect(cancelRecipeImage).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440061",
        { idempotencyKey: expect.any(String) },
      );
    });
  });

  it("cancels a managed upload even when the form unmounts right after upload success resolves", async () => {
    let resolveUpload!: (value: UploadResult) => void;
    vi.mocked(uploadRecipeImage).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "instant.png", { type: "image/png" }));

    await act(async () => {
      resolveUpload(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440062",
          read_url: "https://signed.example.com/instant.png",
        }),
      );
      await Promise.resolve();
    });

    view.unmount();

    expect(cancelRecipeImage).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440062",
      { idempotencyKey: expect.any(String) },
    );
  });

  it("does not double cancel after removing a managed upload and then unmounting", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440063",
        read_url: "https://signed.example.com/remove-once.png",
      }),
    );

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "remove-once.png", { type: "image/png" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-remove-button")).toBeTruthy();
    });
    await user.click(screen.getByTestId("manual-image-remove-button"));
    view.unmount();

    expect(
      vi.mocked(cancelRecipeImage).mock.calls.filter(
        ([imageObjectId]) => imageObjectId === "550e8400-e29b-41d4-a716-446655440063",
      ),
    ).toHaveLength(1);
  });

  it("does not start parallel owner cleanup for rapid duplicate remove clicks", async () => {
    let resolveCleanup!: (
      value: Awaited<ReturnType<typeof cancelRecipeImage>>,
    ) => void;
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440164",
        read_url: "https://signed.example.com/remove-latched.png",
      }),
    );
    vi.mocked(cancelRecipeImage).mockReturnValue(
      new Promise((resolve) => {
        resolveCleanup = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["img"], "remove-latched.png", { type: "image/png" }),
    );
    const removeButton = await screen.findByTestId("manual-image-remove-button");

    await act(async () => {
      removeButton.click();
      removeButton.click();
      await Promise.resolve();
    });

    expect(cancelRecipeImage).toHaveBeenCalledTimes(1);
    expect(removeButton).toHaveProperty("disabled", true);

    resolveCleanup({
      success: true,
      data: {
        image_object_id: "550e8400-e29b-41d4-a716-446655440164",
        state: "cleanup_pending",
      },
      error: null,
    });
  });

  it("keeps a managed image visible and replays owner cleanup with the same key after cancel failure", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440163",
        read_url: "https://signed.example.com/recoverable-cleanup.png",
      }),
    );
    vi.mocked(cancelRecipeImage)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: {
          code: "NETWORK_ERROR",
          message: "temporary",
          fields: [],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440163",
          state: "cleanup_pending",
        },
        error: null,
      });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(
      fileInput,
      new File(["img"], "recoverable-cleanup.png", { type: "image/png" }),
    );
    await screen.findByTestId("manual-image-remove-button");

    await user.click(screen.getByTestId("manual-image-remove-button"));

    expect(screen.getByTestId("manual-image-preview")).toBeTruthy();
    const cleanupAlert = screen.getByRole("alert");
    expect(cleanupAlert.textContent).toContain(
      "이미지 정리를 완료하지 못했어요",
    );
    expect(
      screen.getByTestId("manual-editor-feedback-region").contains(cleanupAlert),
    ).toBe(true);
    expect(
      screen.getByTestId("manual-editor-scroll-region").contains(cleanupAlert),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "정리 다시 시도" }));

    await waitFor(() => {
      expect(screen.queryByTestId("manual-image-preview")).toBeNull();
    });

    const cleanupCalls = vi.mocked(cancelRecipeImage).mock.calls.filter(
      ([imageObjectId]) =>
        imageObjectId === "550e8400-e29b-41d4-a716-446655440163",
    );
    expect(cleanupCalls).toHaveLength(2);
    const firstKey = cleanupCalls[0]?.[1]?.idempotencyKey;
    const secondKey = cleanupCalls[1]?.[1]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it("does not double cancel the previous managed image when replace starts and the form unmounts immediately", async () => {
    let resolveReplacement!: (value: UploadResult) => void;
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440064",
          read_url: "https://signed.example.com/original.png",
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveReplacement = resolve;
        }),
      );

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "original.png", { type: "image/png" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    await user.upload(fileInput, new File(["img"], "replacement.png", { type: "image/png" }));
    view.unmount();

    resolveReplacement(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440065",
        read_url: "https://signed.example.com/replacement.png",
      }),
    );

    await waitFor(() => {
      expect(
        vi.mocked(cancelRecipeImage).mock.calls.filter(
          ([imageObjectId]) => imageObjectId === "550e8400-e29b-41d4-a716-446655440064",
        ),
      ).toHaveLength(1);
    });
  });

  it("keeps a removed retry completion stale and cancels its managed object", async () => {
    let resolveRetry!: (value: UploadResult) => void;
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "NETWORK_ERROR", message: "네트워크 오류가 발생했어요.", fields: [] },
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
      );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["img"], "retry-remove.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();
    });

    const retryButton = screen.getByTestId("manual-image-retry-button");
    const removeButton = screen.getByTestId("manual-image-remove-button");
    await act(async () => {
      retryButton.click();
      removeButton.click();
      await Promise.resolve();
    });

    resolveRetry(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440066",
        read_url: "https://signed.example.com/retry-remove.png",
      }),
    );

    await waitFor(() => {
      expect(cancelRecipeImage).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440066",
        { idempotencyKey: expect.any(String) },
      );
    });
    expect(screen.getByTestId("manual-image-choose-button")).toBeTruthy();
    expect(screen.queryByTestId("manual-image-replace-button")).toBeNull();
  });

  it("successful save includes image_object_id from a managed upload", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440070",
        read_url: "https://signed.example.com/thumb.png",
      }),
    );
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
    expect(callBody.image_object_id).toBe("550e8400-e29b-41d4-a716-446655440070");
    expect(callBody.thumbnail_url).toBeUndefined();
  });

  it("refreshes an expired managed read URL with the same key and compressed bytes before save", async () => {
    const originalFile = new File(["original"], "expired.png", { type: "image/png" });
    const compressedFile = new File(["compressed"], "expired-compressed.png", {
      type: "image/png",
    });
    vi.mocked(compressRecipeImageFile).mockResolvedValue(compressedFile);
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440072",
          read_url: "https://signed.example.com/expired.png",
          read_url_expires_at: "2000-01-01T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440072",
          read_url: "https://signed.example.com/refreshed.png",
          read_url_expires_at: "2099-07-30T03:30:00.000Z",
        }),
      );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, originalFile);
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "만료 URL 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(uploadRecipeImage).toHaveBeenCalledTimes(2);
    });
    expect(uploadRecipeImage).toHaveBeenNthCalledWith(
      1,
      compressedFile,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
    expect(uploadRecipeImage).toHaveBeenNthCalledWith(
      2,
      compressedFile,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
    expect(cancelRecipeImage).not.toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440072",
    );
    expect(
      screen.getByRole("img", { name: "레시피 이미지 미리보기" }).getAttribute("src"),
    ).toBe("https://signed.example.com/refreshed.png");
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].image_object_id).toBe(
      "550e8400-e29b-41d4-a716-446655440072",
    );
  });

  it("retries an interrupted expired read URL refresh without cancelling its managed object", async () => {
    const compressedFile = new File(["compressed"], "expired-retry-compressed.png", {
      type: "image/png",
    });
    vi.mocked(compressRecipeImageFile).mockResolvedValue(compressedFile);
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440074",
          read_url: "https://signed.example.com/expired-retry.png",
          read_url_expires_at: "2000-01-01T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: {
          code: "NETWORK_ERROR",
          message: "네트워크 오류가 발생했어요.",
          fields: [],
        },
      })
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440074",
          read_url: "https://signed.example.com/expired-retry-refreshed.png",
          read_url_expires_at: "2099-07-30T03:30:00.000Z",
        }),
      );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["original"], "expired-retry.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "만료 URL 재시도 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();
    });
    await user.click(screen.getByTestId("manual-image-retry-button"));

    await waitFor(() => {
      expect(uploadRecipeImage).toHaveBeenCalledTimes(3);
    });
    expect(uploadRecipeImage).toHaveBeenNthCalledWith(
      2,
      compressedFile,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
    expect(uploadRecipeImage).toHaveBeenNthCalledWith(
      3,
      compressedFile,
      expect.objectContaining({
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
      }),
    );
    expect(cancelRecipeImage).not.toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440074",
    );
    expect(
      screen.getByRole("img", { name: "레시피 이미지 미리보기" }).getAttribute("src"),
    ).toBe("https://signed.example.com/expired-retry-refreshed.png");
  });

  it("upload failure shows error with retry and clears the error after success", async () => {
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "NETWORK_ERROR", message: "네트워크 오류가 발생했어요.", fields: [] },
      })
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440071",
          read_url: "https://signed.example.com/thumb2.png",
        }),
      );

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

  it("uses a fresh idempotency key when retrying a limited upload", async () => {
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: {
          code: "IMAGE_UPLOAD_LIMITED",
          message: "잠시 후 다시 시도해 주세요.",
          fields: [],
        },
      })
      .mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440073",
        }),
      );

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["limited"], "limited.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();
    });
    await user.click(screen.getByTestId("manual-image-retry-button"));

    await waitFor(() => {
      expect(uploadRecipeImage).toHaveBeenCalledTimes(2);
    });
    expect(vi.mocked(uploadRecipeImage).mock.calls[0]?.[1]).toEqual({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
    });
    expect(vi.mocked(uploadRecipeImage).mock.calls[1]?.[1]).toEqual({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440102",
    });
  });

  it("treats IMAGE_NOT_FOUND during save as an image-scoped recovery error", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440073",
        read_url: "https://signed.example.com/not-found.png",
      }),
    );
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: "IMAGE_NOT_FOUND",
        message: "이미지를 찾을 수 없어요.",
        fields: [],
      },
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const fileInput = screen.getByTestId("manual-image-file-input") as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "not-found.png", { type: "image/png" }));
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "이미지 찾기 실패");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.getByTestId("manual-image-error")).toBeTruthy();
    });
    expect(screen.getByText("이미지를 찾을 수 없어요.")).toBeTruthy();
    expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();
    expect(screen.queryByText("레시피를 등록하지 못했어요.")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("manual-image-error"));
    });
  });

  it("surfaces retryable save failures in the shared feedback region and focuses the summary", async () => {
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "저장에 실패했어요. 다시 시도해 주세요.",
        fields: [],
      },
    });

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "저장 실패 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByRole("button", { name: "준비" });
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    const saveAlert = await screen.findByRole("alert");
    expect(saveAlert.textContent).toContain("저장에 실패했어요. 다시 시도해 주세요.");
    expect(
      screen.getByTestId("manual-editor-feedback-region").contains(saveAlert),
    ).toBe(true);
    expect(
      screen.getByTestId("manual-editor-scroll-region").contains(saveAlert),
    ).toBe(false);
    await waitFor(() => {
      expect(document.activeElement).toBe(saveAlert);
    });
  });

  it("disables managed image replace and remove while recipe save is pending", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440074",
      }),
    );
    vi.mocked(createManualRecipe).mockReturnValue(
      new Promise(() => undefined),
    );
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["img"], "save-pending.png", { type: "image/png" }),
    );
    await screen.findByTestId("manual-image-replace-button");
    await fillMinimumManualRecipe(user, "저장 중 이미지 보호");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId("manual-image-replace-button")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByTestId("manual-image-remove-button")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not cancel a create-owned image when the form unmounts before a successful create response", async () => {
    let resolveCreate!: (
      value: Awaited<ReturnType<typeof createManualRecipe>>,
    ) => void;
    vi.mocked(uploadRecipeImage).mockResolvedValueOnce(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440076",
      }),
    );
    vi.mocked(createManualRecipe).mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["image"], "create-owned.png", { type: "image/png" }),
    );
    await screen.findByTestId("manual-image-replace-button");
    await fillMinimumManualRecipe(user, "생성 소유 성공");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalledOnce();
    });

    view.unmount();
    expect(cancelRecipeImage).not.toHaveBeenCalled();

    await act(async () => {
      resolveCreate({
        success: true,
        data: {
          id: "recipe-create-owned",
          title: "생성 소유 성공",
          source_type: "manual",
          created_by: "user-1",
          base_servings: 2,
        },
        error: null,
      });
      await Promise.resolve();
    });

    expect(cancelRecipeImage).not.toHaveBeenCalled();
  });

  it("cancels a create-owned image after unmount when create definitively rejects the image", async () => {
    let resolveCreate!: (
      value: Awaited<ReturnType<typeof createManualRecipe>>,
    ) => void;
    const imageObjectId = "550e8400-e29b-41d4-a716-446655440077";
    vi.mocked(uploadRecipeImage).mockResolvedValueOnce(
      managedUploadSuccess({ image_object_id: imageObjectId }),
    );
    vi.mocked(createManualRecipe).mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["image"], "create-failed.png", { type: "image/png" }),
    );
    await screen.findByTestId("manual-image-replace-button");
    await fillMinimumManualRecipe(user, "생성 소유 실패");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalledOnce();
    });

    view.unmount();
    expect(cancelRecipeImage).not.toHaveBeenCalled();

    await act(async () => {
      resolveCreate({
        success: false,
        data: null,
        error: {
          code: "IMAGE_NOT_FOUND",
          message: "이미지를 연결하지 못했어요.",
          fields: [],
        },
      });
      await Promise.resolve();
    });

    expect(cancelRecipeImage).toHaveBeenCalledTimes(1);
    expect(cancelRecipeImage).toHaveBeenCalledWith(
      imageObjectId,
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("does not cancel a create-owned image after unmount when the create outcome is unknown", async () => {
    let resolveCreate!: (
      value: Awaited<ReturnType<typeof createManualRecipe>>,
    ) => void;
    vi.mocked(uploadRecipeImage).mockResolvedValueOnce(
      managedUploadSuccess({
        image_object_id: "550e8400-e29b-41d4-a716-446655440079",
      }),
    );
    vi.mocked(createManualRecipe).mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    const user = userEvent.setup();
    const view = render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["image"], "create-unknown.png", { type: "image/png" }),
    );
    await screen.findByTestId("manual-image-replace-button");
    await fillMinimumManualRecipe(user, "생성 결과 미확인");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalledOnce();
    });

    view.unmount();
    expect(cancelRecipeImage).not.toHaveBeenCalled();

    await act(async () => {
      resolveCreate({
        success: false,
        data: null,
        error: {
          code: "NETWORK_ERROR",
          message: "등록 결과를 확인하지 못했어요.",
          fields: [],
        },
      });
      await Promise.resolve();
    });

    expect(createManualRecipe).toHaveBeenCalledOnce();
    expect(cancelRecipeImage).not.toHaveBeenCalled();
  });

  it.each(["NETWORK_ERROR", "INVALID_RESPONSE"])(
    "fails closed after a mounted unknown %s create outcome",
    async (errorCode) => {
      vi.mocked(uploadRecipeImage).mockResolvedValueOnce(
        managedUploadSuccess({
          image_object_id: "550e8400-e29b-41d4-a716-446655440080",
        }),
      );
      vi.mocked(createManualRecipe).mockResolvedValue({
        success: false,
        data: null,
        error: {
          code: errorCode,
          message: "등록 결과를 확인하지 못했어요.",
          fields: [],
        },
      });

      const user = userEvent.setup();
      render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
      await user.upload(
        screen.getByTestId("manual-image-file-input"),
        new File(["image"], "create-unknown-mounted.png", { type: "image/png" }),
      );
      await screen.findByTestId("manual-image-replace-button");
      await fillMinimumManualRecipe(user, "생성 결과 잠금");
      await user.click(screen.getByRole("button", { name: "저장" }));

      await screen.findByText("등록 결과를 확인하지 못했어요.");
      expect(screen.getByRole("button", { name: "저장" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByTestId("manual-image-replace-button")).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByTestId("manual-image-remove-button")).toHaveProperty(
        "disabled",
        true,
      );

      await user.click(screen.getByRole("button", { name: "저장" }));
      expect(createManualRecipe).toHaveBeenCalledOnce();
      expect(cancelRecipeImage).not.toHaveBeenCalled();
    },
  );

  it("save without image works and does not include image identity fields", async () => {
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
    expect(callBody.image_object_id).toBeUndefined();
    expect(callBody.thumbnail_url).toBeUndefined();
    expect(uploadRecipeImage).not.toHaveBeenCalled();
  });

  it("removes the dirty history guard before showing save success and navigating", async () => {
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-history-clean",
        title: "저장된 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await fillMinimumManualRecipe(user, "저장된 요리");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(historyBack).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("레시피 등록 완료")).toBeNull();

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText("레시피 등록 완료")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "레시피 상세로 이동" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/recipe/recipe-history-clean");
    expect(historyBack).toHaveBeenCalledTimes(1);
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
