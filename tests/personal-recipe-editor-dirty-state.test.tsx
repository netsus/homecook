// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalRecipeEditorShell } from "@/components/recipe/personal-recipe-editor-shell";
import {
  createEmptyRecipeEditorDraft,
  isRecipeEditorDraftDirty,
  resolveRecipeEditorExit,
  type RecipeEditorDraft,
} from "@/lib/personal-recipe-editor";

const EMPTY_DRAFT = createEmptyRecipeEditorDraft();
const DIRTY_DRAFT = { ...EMPTY_DRAFT, title: "수정 중" };

describe("personal recipe editor dirty state", () => {
  afterEach(cleanup);

  it("uses canonical content equality and includes tags, order and managed image state", () => {
    const initial = createEmptyRecipeEditorDraft();

    expect(isRecipeEditorDraftDirty(initial, { ...initial })).toBe(false);
    expect(
      isRecipeEditorDraftDirty(initial, {
        ...initial,
        tags: ["한식"],
      }),
    ).toBe(true);
    expect(
      isRecipeEditorDraftDirty(initial, {
        ...initial,
        image: {
          attachment: "unattached",
          imageObjectId: "image-1",
          state: "uploaded_unlinked",
        },
      }),
    ).toBe(true);

    const withManagedImage = {
      ...initial,
      image: {
        attachment: "unattached" as const,
        imageObjectId: "image-1",
        readUrl: "https://signed.example/first",
        readUrlExpiresAt: "2099-01-01T00:00:00.000Z",
        state: "uploaded_unlinked" as const,
      },
    };
    expect(
      isRecipeEditorDraftDirty(withManagedImage, {
        ...withManagedImage,
        image: {
          ...withManagedImage.image,
          readUrl: "https://signed.example/replayed",
          readUrlExpiresAt: "2099-01-01T00:05:00.000Z",
        },
      }),
    ).toBe(false);

    const withRows = {
      ...initial,
      ingredients: [
        {
          amount: 100,
          draftId: "ingredient-1",
          ingredientType: "QUANT",
          sortOrder: 1,
          source: { ingredientId: "onion", kind: "ingredient" },
          standardName: "양파",
          unit: "g",
        },
      ],
      steps: [
        {
          cookingMethodId: "method-prep",
          draftId: "step-1",
          instruction: "양파를 썬다",
          sortOrder: 1,
        },
      ],
    } satisfies RecipeEditorDraft;
    expect(
      isRecipeEditorDraftDirty(withRows, {
        ...withRows,
        ingredients: [{ ...withRows.ingredients[0], amount: 120 }],
      }),
    ).toBe(true);
    expect(
      isRecipeEditorDraftDirty(withRows, {
        ...withRows,
        steps: [{ ...withRows.steps[0], cookingMethodId: "method-boil" }],
      }),
    ).toBe(true);
    expect(
      isRecipeEditorDraftDirty(withRows, {
        ...withRows,
        ingredients: [
          { ...withRows.ingredients[0], draftId: "replacement-ingredient-id" },
        ],
        steps: [{ ...withRows.steps[0], draftId: "replacement-step-id" }],
      }),
    ).toBe(false);

    const withProduct = {
      ...initial,
      ingredients: [
        {
          amount: 1,
          draftId: "product-1",
          ingredientType: "QUANT",
          sortOrder: 1,
          source: {
            kind: "product" as const,
            productId: "product-1",
            productNutritionVersionId: "nutrition-version-1",
          },
          standardName: "두부 1모",
          unit: "개",
        },
      ],
    } satisfies RecipeEditorDraft;
    expect(
      isRecipeEditorDraftDirty(withProduct, {
        ...withProduct,
        ingredients: [
          {
            ...withProduct.ingredients[0],
            source: {
              ...withProduct.ingredients[0].source,
              productNutritionVersionId: "nutrition-version-2",
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("shares one accessible stay-or-discard guard for dirty exits", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="personal-edit"
        draft={DIRTY_DRAFT}
        initialDraft={EMPTY_DRAFT}
        onCancel={onCancel}
        onDiscard={onDiscard}
        onRetryCleanup={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      >
        <div>편집 중</div>
      </PersonalRecipeEditorShell>,
    );

    const cancelButton = screen.getByRole("button", { name: "취소" });
    cancelButton.focus();
    await user.click(cancelButton);
    const dialog = screen.getByRole("dialog", { name: "변경사항을 버릴까요?" });
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const stayButton = screen.getByRole("button", { name: "계속 편집" });
    expect(stayButton).toBeTruthy();
    expect(document.activeElement).toBe(stayButton);
    expect(screen.getByRole("button", { name: "변경사항 버리기" })).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(cancelButton);

    await user.click(cancelButton);
    await user.click(screen.getByRole("button", { name: "변경사항 버리기" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("does not steal focus before the discard dialog has opened", () => {
    const existingButton = document.createElement("button");
    existingButton.textContent = "기존 포커스";
    document.body.append(existingButton);
    existingButton.focus();

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="personal-edit"
        draft={DIRTY_DRAFT}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onRetryCleanup={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      >
        <div>편집 중</div>
      </PersonalRecipeEditorShell>,
    );

    expect(document.activeElement).toBe(existingButton);
    existingButton.remove();
  });

  it("does not claim discard success while owner cleanup failed", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    expect(
      resolveRecipeEditorExit({
        cleanupState: "failed",
        dirty: true,
        hasUnattachedManagedImage: true,
      }),
    ).toBe("cleanup-blocked");
    expect(
      resolveRecipeEditorExit({
        cleanupState: "running",
        dirty: true,
        hasUnattachedManagedImage: true,
      }),
    ).toBe("cleanup-blocked");

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="failed"
        context="public-fork"
        draft={DIRTY_DRAFT}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={onDiscard}
        onRetryCleanup={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      >
        <div>편집 중</div>
      </PersonalRecipeEditorShell>,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "이미지 정리를 완료하지 못했어요",
    );
    expect(screen.getByRole("button", { name: "정리 다시 시도" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "변경사항 버리기" })).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("does not open the discard dialog while owner cleanup is running", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="running"
        context="public-fork"
        draft={DIRTY_DRAFT}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={onDiscard}
        onRetryCleanup={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      >
        <div>편집 중</div>
      </PersonalRecipeEditorShell>,
    );

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "정리 다시 시도" }),
    ).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
