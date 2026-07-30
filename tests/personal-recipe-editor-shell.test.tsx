// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PersonalRecipeEditorShell,
  RecipeEditorBaseServingsControl,
  RecipeEditorIngredientList,
  RecipeEditorStepComposer,
  usePersonalRecipeEditorShell,
} from "@/components/recipe/personal-recipe-editor-shell";
import { createEmptyRecipeEditorDraft } from "@/lib/personal-recipe-editor";

const EMPTY_DRAFT = createEmptyRecipeEditorDraft();

function PlannerSubmitProbe({
  cleanupState,
  onSubmit,
}: {
  cleanupState: "idle" | "running" | "failed";
  onSubmit: (
    intent: "save-current" | "save-as-new" | "save-private",
  ) => Promise<void>;
}) {
  const shell = usePersonalRecipeEditorShell({
    accessState: "ready",
    cleanupState,
    context: "planner-add",
    draft: EMPTY_DRAFT,
    initialDraft: EMPTY_DRAFT,
    onCancel: vi.fn(),
    onDiscard: vi.fn(),
    onRetryCleanup: vi.fn(),
    onSubmit,
  });

  return (
    <>
      <button onClick={() => void shell.submit("save-current")} type="button">
        잘못된 저장
      </button>
      <button onClick={() => void shell.submit("save-private")} type="button">
        올바른 저장
      </button>
    </>
  );
}

describe("personal recipe editor shell", () => {
  afterEach(cleanup);

  it("keeps pure form primitives independent from planner and persistence decisions", async () => {
    const user = userEvent.setup();
    const onBaseServingsChange = vi.fn();
    const onAddStep = vi.fn();

    render(
      <>
        <RecipeEditorBaseServingsControl
          onChange={onBaseServingsChange}
          value={2}
        />
        <RecipeEditorIngredientList
          ingredients={[]}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          showValidationError={false}
        />
        <RecipeEditorStepComposer
          cookingMethods={[
            {
              code: "prep",
              color_key: "gray",
              id: "method-prep",
              is_system: true,
              label: "준비",
            },
          ]}
          nextStepNumber={1}
          onAdd={onAddStep}
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "기준 인분 늘리기" }));
    await user.click(screen.getByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "두부를 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));

    expect(onBaseServingsChange).toHaveBeenCalledWith(3);
    expect(onAddStep).toHaveBeenCalledWith(
      expect.objectContaining({
        cooking_method: expect.objectContaining({ id: "method-prep" }),
        instruction: "두부를 준비해요",
      }),
    );
    expect(screen.queryByText(/플래너|Meal|저장 API/)).toBeNull();
  });

  it("keeps context-specific identity actions in the shell", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="personal-edit"
        draft={EMPTY_DRAFT}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onRetryCleanup={vi.fn()}
        onSubmit={onSubmit}
      >
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    expect(screen.getByRole("heading", { name: "내 레시피 편집" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith("save-current");
    expect(screen.getByRole("button", { name: "새 레시피로 저장" })).toBeTruthy();
  });

  it("owns fail-closed permission state and context destination", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const props = {
      cleanupState: "idle" as const,
      context: "public-fork" as const,
      draft: EMPTY_DRAFT,
      initialDraft: EMPTY_DRAFT,
      onCancel,
      onDiscard: vi.fn(),
      onRetryCleanup: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue(undefined),
    };
    const view = render(
      <PersonalRecipeEditorShell {...props} accessState="loading">
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    expect(screen.getByRole("status").textContent).toContain("권한 확인 중");
    expect(
      screen.queryByRole("button", { name: "내 레시피로 저장" }),
    ).toBeNull();

    view.rerender(
      <PersonalRecipeEditorShell {...props} accessState="ready">
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledWith("source-recipe-detail");
  });

  it("blocks duplicate submit while a durable save is pending", async () => {
    const user = userEvent.setup();
    const pendingSubmit = vi.fn(
      () => new Promise<void>(() => undefined),
    );
    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="public-fork"
        draft={{ ...EMPTY_DRAFT, title: "수정 중" }}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onRetryCleanup={vi.fn()}
        onSubmit={pendingSubmit}
      >
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    expect(screen.getByRole("button", { name: "저장 중..." })).toHaveProperty("disabled", true);
  });

  it("blocks cancel and discard while a durable save is pending", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const pendingSubmit = vi.fn(
      () => new Promise<void>(() => undefined),
    );
    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="public-fork"
        draft={{ ...EMPTY_DRAFT, title: "수정 중" }}
        initialDraft={EMPTY_DRAFT}
        onCancel={onCancel}
        onDiscard={onDiscard}
        onRetryCleanup={vi.fn()}
        onSubmit={pendingSubmit}
      >
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));

    const cancelButton = screen.getByRole("button", { name: "취소" });
    expect(cancelButton).toHaveProperty("disabled", true);
    await user.click(cancelButton);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "변경사항을 버릴까요?" }),
    ).toBeNull();
  });

  it("latches the first submit before the parent can rerender", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(
      () => new Promise<void>(() => undefined),
    );

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="public-fork"
        draft={{ ...EMPTY_DRAFT, title: "수정 중" }}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onRetryCleanup={vi.fn()}
        onSubmit={onSubmit}
      >
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    await user.dblClick(screen.getByRole("button", { name: "내 레시피로 저장" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("rejects a submit intent that does not belong to the editor context", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PlannerSubmitProbe cleanupState="idle" onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: "잘못된 저장" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "올바른 저장" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("save-private");
  });

  it("blocks shell submit while image cleanup is running or failed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlannerSubmitProbe cleanupState="running" onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: "올바른 저장" }));
    expect(onSubmit).not.toHaveBeenCalled();

    view.rerender(
      <PlannerSubmitProbe cleanupState="failed" onSubmit={onSubmit} />,
    );
    await user.click(screen.getByRole("button", { name: "올바른 저장" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables owned-shell save actions while image cleanup is blocked", () => {
    const props = {
      accessState: "ready" as const,
      context: "public-fork" as const,
      draft: EMPTY_DRAFT,
      initialDraft: EMPTY_DRAFT,
      onCancel: vi.fn(),
      onDiscard: vi.fn(),
      onRetryCleanup: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue(undefined),
    };
    const view = render(
      <PersonalRecipeEditorShell {...props} cleanupState="running">
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    expect(screen.getByRole("button", { name: "내 레시피로 저장" }))
      .toHaveProperty("disabled", true);

    view.rerender(
      <PersonalRecipeEditorShell {...props} cleanupState="failed">
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );
    expect(screen.getByRole("button", { name: "내 레시피로 저장" }))
      .toHaveProperty("disabled", true);
  });

  it("releases the submit latch when the async adapter rejects before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("save failed"));

    render(
      <PersonalRecipeEditorShell
        accessState="ready"
        cleanupState="idle"
        context="public-fork"
        draft={{ ...EMPTY_DRAFT, title: "수정 중" }}
        initialDraft={EMPTY_DRAFT}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onRetryCleanup={vi.fn()}
        onSubmit={onSubmit}
      >
        <div>공유 폼</div>
      </PersonalRecipeEditorShell>,
    );

    const submitButton = screen.getByRole("button", { name: "내 레시피로 저장" });
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("save failed");
    expect(document.activeElement).toBe(alert);
  });

  it("makes the existing planner-add screen consume a shared form primitive", () => {
    const source = readFileSync(
      join(process.cwd(), "components/recipe/manual-recipe-create-screen.tsx"),
      "utf8",
    );

    expect(source).toContain("RecipeEditorBaseServingsControl");
    expect(source).not.toContain("function BaseServingsStepper");
    expect(source).toContain("RecipeEditorIngredientList");
    expect(source).toContain("RecipeEditorStepList");
    expect(source).toContain("RecipeEditorStepComposer");
    expect(source).toContain("RecipeEditorImageSection");
    expect(source).toContain("RecipeEditorTagSection");
    expect(source).toContain("usePersonalRecipeEditorShell");
    expect(source).toContain("<PersonalRecipeEditorShell");
    expect(source).not.toContain("function IngredientList");
    expect(source).not.toContain("function StepList");
    expect(source).not.toContain("function StepInlineComposer");
    expect(source).not.toContain('import Image from "next/image"');
    expect(source).not.toContain(
      'import { RecipeTagEditor } from "@/components/recipe/recipe-tag-editor"',
    );
  });
});
