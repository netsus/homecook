// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import {
  cancelRecipeImage,
  createManualRecipe,
  uploadRecipeImage,
} from "@/lib/api/manual-recipe";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchIngredients } from "@/lib/api/ingredients";
import { suggestRecipeTags } from "@/lib/api/recipe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

const storageMocks = vi.hoisted(() => {
  const mockStorageRemove = vi.fn();
  return {
    getSupabaseBrowserClient: vi.fn(() => ({
      storage: {
        from: () => ({
          remove: mockStorageRemove,
        }),
      },
    })),
    mockStorageRemove,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: storageMocks.getSupabaseBrowserClient,
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

vi.mock("@/lib/recipe-image-compression", () => ({
  compressRecipeImageFile: vi.fn(async (file: File) => file),
}));

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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
  imageObjectId = "550e8400-e29b-41d4-a716-446655440030",
) {
  return {
    success: true,
    data: {
      image_object_id: imageObjectId,
      state: "uploaded_unlinked",
      read_url: "https://signed.example.com/private.png",
      read_url_expires_at: "2099-07-30T03:05:00.000Z",
    },
    error: null,
  } as unknown as UploadResult;
}

function legacyUploadSuccess() {
  return {
    success: true,
    data: {
      thumbnail_url: "https://cdn.test/legacy-thumbnail.jpg",
      storage_path: "recipe-images/user/legacy-thumbnail.jpg",
    },
    error: null,
  } as unknown as UploadResult;
}

async function fillRequiredManualRecipeFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("예: 김치찌개"), "이미지 테스트 요리");
  await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
  await user.click(await screen.findByRole("checkbox", { name: "양파" }));
  await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
  await user.click(screen.getByRole("button", { name: "준비" }));
  await user.type(screen.getByLabelText("만들기 1 설명"), "양파를 볶아요");
  await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
}

describe("recipe visibility consumers", () => {
  beforeEach(() => {
    installMatchMedia();
    storageMocks.mockStorageRemove.mockReset();
    storageMocks.getSupabaseBrowserClient.mockClear();
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
      data: { suggested_tags: [], tags: [] },
      error: null,
    });
    vi.mocked(createManualRecipe).mockResolvedValue({
      success: true,
      data: {
        id: "recipe-new",
        title: "이미지 테스트 요리",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      vi
        .fn()
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440101")
        .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440102")
        .mockReturnValue("550e8400-e29b-41d4-a716-446655440199"),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("saves managed uploads with image_object_id and never touches browser storage removal", async () => {
    vi.mocked(uploadRecipeImage).mockResolvedValue(managedUploadSuccess());

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["managed"], "managed.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-remove-button")).toBeTruthy();
    });
    await user.click(screen.getByTestId("manual-image-remove-button"));
    await fillRequiredManualRecipeFields(user);
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(cancelRecipeImage).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440030",
        {
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440102",
        },
      );
    });
    expect(storageMocks.mockStorageRemove).not.toHaveBeenCalled();
    expect(storageMocks.getSupabaseBrowserClient).not.toHaveBeenCalled();
  }, 10_000);

  it("saves managed uploads through image_object_id but keeps legacy uploads on thumbnail_url", async () => {
    const user = userEvent.setup();

    vi.mocked(uploadRecipeImage).mockResolvedValueOnce(
      managedUploadSuccess("550e8400-e29b-41d4-a716-446655440031"),
    );
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["managed"], "managed.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });
    await fillRequiredManualRecipeFields(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0]?.[0]).toMatchObject({
      image_object_id: "550e8400-e29b-41d4-a716-446655440031",
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0]?.[0]?.thumbnail_url).toBeUndefined();

    cleanup();
    vi.mocked(createManualRecipe).mockClear();
    vi.mocked(uploadRecipeImage).mockResolvedValueOnce(legacyUploadSuccess());
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);
    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["legacy"], "legacy.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-replace-button")).toBeTruthy();
    });
    await fillRequiredManualRecipeFields(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(createManualRecipe).toHaveBeenCalled();
    });
    expect(vi.mocked(createManualRecipe).mock.calls[0]?.[0]?.image_object_id).toBeUndefined();
    expect(vi.mocked(createManualRecipe).mock.calls[0]?.[0]).toMatchObject({
      thumbnail_url: "https://cdn.test/legacy-thumbnail.jpg",
    });
  }, 15_000);

  it("replays an in-progress upload with the same idempotency key", async () => {
    vi.mocked(uploadRecipeImage)
      .mockResolvedValueOnce({
        success: true,
        data: null,
        error: null,
        in_progress: true,
        retry_after_seconds: 17,
      } as unknown as UploadResult)
      .mockResolvedValueOnce(managedUploadSuccess(
        "550e8400-e29b-41d4-a716-446655440099",
      ));

    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.upload(
      screen.getByTestId("manual-image-file-input"),
      new File(["managed"], "managed.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("manual-image-retry-button")).toBeTruthy();
    });
    await user.click(screen.getByTestId("manual-image-retry-button"));

    expect(vi.mocked(uploadRecipeImage).mock.calls[0]?.[1]).toEqual({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
    });
    expect(vi.mocked(uploadRecipeImage).mock.calls[1]?.[1]).toEqual({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440101",
    });
  });
});
