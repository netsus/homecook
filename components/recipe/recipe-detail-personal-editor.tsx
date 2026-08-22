"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  PersonalRecipeEditorShell,
  RecipeEditorBaseServingsControl,
  RecipeEditorDiscardDialog,
  usePersonalRecipeEditorShell,
} from "@/components/recipe/personal-recipe-editor-shell";
import { RecipeFutureImpactSaveFlow } from "@/components/recipe/recipe-future-impact-save-flow";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import {
  createPersonalRecipeFromSource,
  isPersonalRecipeApiError,
} from "@/lib/api/personal-recipe";
import { createRecipeEditorImageDraft, type RecipeEditorDraft } from "@/lib/personal-recipe-editor";
import type { RecipeEditContext, RecipeEditDraft } from "@/types/recipe";
import { useAuthGateStore } from "@/stores/ui-store";

interface RecipeDetailPersonalEditorProps {
  editContext: RecipeEditContext;
  mode: "edit" | "fork";
  onClose: () => void;
  onSaved: (result: { id: string; revision: number }) => void;
  recipeId: string;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  resumeContext?: RecipeEditContext | null;
}

function cloneDraft(draft: RecipeEditDraft): RecipeEditDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: draft.steps.map((step) => ({
      ...step,
      cooking_method_ids: [...step.cooking_method_ids],
      ingredients_used: step.ingredients_used.map((ingredient) => ({ ...ingredient })),
    })),
  };
}

function toEditorShellDraft(
  draft: RecipeEditDraft,
  imageObjectId: string | null,
): RecipeEditorDraft {
  return {
    title: `${draft.title}\u0000${draft.description ?? ""}`,
    baseServings: draft.base_servings,
    ingredients: draft.ingredients.map((ingredient, index) => ({
      amount: ingredient.amount,
      draftId: `${ingredient.ingredient_id}:${index}`,
      ingredientType: ingredient.ingredient_type,
      sortOrder: index + 1,
      source: ingredient.food_product_id
        ? {
            kind: "product" as const,
            productId: ingredient.food_product_id,
            productNutritionVersionId: ingredient.food_product_nutrition_version_id,
          }
        : {
            kind: "ingredient" as const,
            ingredientId: ingredient.ingredient_id,
          },
      standardName: ingredient.display_text ?? ingredient.ingredient_id,
      unit: ingredient.unit,
    })),
    steps: draft.steps.map((step, index) => ({
      cookingMethodId: step.cooking_method_id,
      draftId: String(step.step_number),
      instruction: step.instruction,
      sortOrder: index + 1,
    })),
    tags: [],
    image: imageObjectId
      ? createRecipeEditorImageDraft({
          image_object_id: imageObjectId,
          read_url: "",
          read_url_expires_at: "",
          state: "attached",
        })
      : createRecipeEditorImageDraft(),
  };
}

export function RecipeDetailPersonalEditor({
  editContext,
  mode,
  onClose,
  onSaved,
  recipeId,
  returnFocusRef,
  resumeContext = null,
}: RecipeDetailPersonalEditorProps) {
  const initialDraft = useMemo(
    () => cloneDraft(editContext.draft),
    [editContext],
  );
  const [draft, setDraft] = useState(() => cloneDraft(
    resumeContext?.draft ?? editContext.draft,
  ));
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [isCreatingDerivedRecipe, setIsCreatingDerivedRecipe] = useState(false);
  const [createDerivedRecipeError, setCreateDerivedRecipeError] = useState<string | null>(null);
  const openAuthGate = useAuthGateStore((state) => state.open);
  const authGateOpen = useAuthGateStore((state) => state.isOpen);
  const saveContext = resumeContext ?? editContext;
  const initialShellDraft = useMemo(
    () => toEditorShellDraft(initialDraft, editContext.image_object_id),
    [editContext.image_object_id, initialDraft],
  );
  const shellDraft = useMemo(
    () => toEditorShellDraft(draft, editContext.image_object_id),
    [draft, editContext.image_object_id],
  );
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fallbackOpenerRef = useRef<HTMLElement | null>(null);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const controller = usePersonalRecipeEditorShell({
    accessState: "ready",
    cleanupState: "idle",
    context: mode === "fork" ? "public-fork" : "personal-edit",
    draft: shellDraft,
    initialDraft: initialShellDraft,
    onCancel: onClose,
    onDiscard: () => {
      onClose();
      return true;
    },
    onRetryCleanup: () => undefined,
    onSubmit: async () => undefined,
  });
  const createKeyRef = useRef<string | null>(null);

  useEffect(() => {
    createKeyRef.current = null;
    setCreateDerivedRecipeError(null);
  }, [draft, mode, recipeId, saveContext.base_recipe_revision, saveContext.image_object_id]);

  useLayoutEffect(() => {
    const explicitReturnTarget = returnFocusRef?.current ?? null;
    if (!returnFocusRef) {
      fallbackOpenerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    return () => {
      requestAnimationFrame(() => {
        const opener = explicitReturnTarget ?? fallbackOpenerRef.current;
        if (opener?.isConnected) opener.focus();
        fallbackOpenerRef.current = null;
      });
    };
  }, [returnFocusRef]);

  useDialogBoundary({
    active: !authGateOpen && !controller.isDiscardDialogOpen && !impactDialogOpen,
    dialogRef,
    initialFocusRef: titleRef,
    onClose: controller.requestCancel,
  });

  const submitDerivedRecipe = async () => {
    if (isCreatingDerivedRecipe || draft.title.trim() === "") {
      return;
    }

    setIsCreatingDerivedRecipe(true);
    setCreateDerivedRecipeError(null);
    const idempotencyKey = createKeyRef.current ?? crypto.randomUUID();
    createKeyRef.current = idempotencyKey;

    try {
      const result = await createPersonalRecipeFromSource({
        originRecipeId: recipeId,
        baseRecipeRevision: saveContext.base_recipe_revision,
        draft,
        imageObjectId: saveContext.image_object_id,
      }, idempotencyKey);
      onSaved(result);
    } catch (error) {
      if (
        isPersonalRecipeApiError(error)
        && (error.status === 401 || (error.status === 409 && error.code === "ACCOUNT_SESSION_STALE"))
      ) {
        if (mode === "fork") {
          openAuthGate({ recipeId, type: "recipe-fork" });
          return;
        }

        openAuthGate({
          editContext: {
            base_recipe_revision: saveContext.base_recipe_revision,
            draft,
            image_object_id: saveContext.image_object_id,
          },
          recipeId,
          type: "recipe-edit-save",
        });
        return;
      }

      setCreateDerivedRecipeError(
        "새 레시피를 저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.",
      );
    } finally {
      setIsCreatingDerivedRecipe(false);
    }
  };

  return (
    <div
      aria-labelledby="recipe-detail-personal-editor-title"
      aria-modal="true"
      className="fixed inset-0 z-40 overflow-y-auto bg-[var(--surface-fill)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]"
      data-testid="recipe-detail-personal-editor"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="mx-auto max-w-2xl rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-2)]">
        <PersonalRecipeEditorShell
          context={mode === "fork" ? "public-fork" : "personal-edit"}
          controller={controller}
          presentation="integrated"
        >
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--brand)]">
                {mode === "fork" ? "공개 레시피" : "내 레시피"}
              </p>
              <h2 className="text-xl font-bold text-[var(--foreground)]" id="recipe-detail-personal-editor-title">
                {mode === "fork" ? "내 레시피로 수정" : "레시피 편집"}
              </h2>
            </div>
            <button
              aria-label="편집 닫기"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] text-xl text-[var(--foreground)]"
              onClick={controller.requestCancel}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="mt-5 space-y-5">
            <label className="block space-y-2 text-sm font-bold text-[var(--foreground)]">
              <span>레시피 제목</span>
              <input
                className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none focus:border-[var(--brand)]"
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))}
                ref={titleRef}
                value={draft.title}
              />
            </label>

            <label className="block space-y-2 text-sm font-bold text-[var(--foreground)]">
              <span>레시피 설명</span>
              <textarea
                className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-base outline-none focus:border-[var(--brand)]"
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  description: event.target.value === "" ? null : event.target.value,
                }))}
                value={draft.description ?? ""}
              />
            </label>

            <section aria-labelledby="recipe-editor-servings">
              <h3 className="mb-2 text-sm font-bold text-[var(--foreground)]" id="recipe-editor-servings">기준 인분</h3>
              <RecipeEditorBaseServingsControl
                onChange={(baseServings) => setDraft((current) => ({
                  ...current,
                  base_servings: baseServings,
                }))}
                value={draft.base_servings}
              />
            </section>

            <section aria-labelledby="recipe-editor-ingredients" className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--foreground)]" id="recipe-editor-ingredients">재료</h3>
              {draft.ingredients.map((ingredient, index) => (
                <div className="grid grid-cols-[1fr_minmax(5rem,0.6fr)] gap-2" key={`${ingredient.ingredient_id}:${index}`}>
                  <label className="space-y-1 text-xs font-semibold text-[var(--text-2)]">
                    <span>재료 {index + 1} 수량</span>
                    <input
                      className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base text-[var(--foreground)]"
                      inputMode="decimal"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index
                          ? { ...item, amount: event.target.value === "" ? null : Number(event.target.value) }
                          : item),
                      }))}
                      type="number"
                      value={ingredient.amount ?? ""}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-[var(--text-2)]">
                    <span>단위</span>
                    <input
                      className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base text-[var(--foreground)]"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index
                          ? { ...item, unit: event.target.value === "" ? null : event.target.value }
                          : item),
                      }))}
                      value={ingredient.unit ?? ""}
                    />
                  </label>
                </div>
              ))}
            </section>

            <section aria-labelledby="recipe-editor-steps" className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--foreground)]" id="recipe-editor-steps">만들기</h3>
              {draft.steps.map((step, index) => (
                <label className="block space-y-1 text-xs font-semibold text-[var(--text-2)]" key={step.step_number}>
                  <span>단계 {step.step_number}</span>
                  <textarea
                    className="min-h-20 w-full rounded-[var(--radius-control)] border border-[var(--line)] p-3 text-base text-[var(--foreground)]"
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      steps: current.steps.map((item, itemIndex) => itemIndex === index
                        ? { ...item, instruction: event.target.value }
                        : item),
                    }))}
                    value={step.instruction}
                  />
                </label>
              ))}
            </section>

            {createDerivedRecipeError ? (
              <div
                className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,white)] p-3 text-sm text-[var(--foreground)] outline-none"
                role="alert"
                tabIndex={-1}
              >
                {createDerivedRecipeError}
              </div>
            ) : null}

            {mode === "edit" ? (
              <div className="space-y-3">
                <RecipeFutureImpactSaveFlow
                  actionDisabled={!hasChanges || draft.title.trim() === ""}
                  baseRecipeRevision={saveContext.base_recipe_revision}
                  draft={draft}
                  enabled
                  imageObjectId={saveContext.image_object_id}
                  onDialogOpenChange={setImpactDialogOpen}
                  onSaved={(result) => {
                    onClose();
                    onSaved(result);
                  }}
                  onUnauthorized={(pendingEditContext) => openAuthGate({
                    editContext: pendingEditContext,
                    recipeId,
                    type: "recipe-edit-save",
                  })}
                  recipeId={recipeId}
                  resumePreview={Boolean(resumeContext)}
                />
                <button
                  className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isCreatingDerivedRecipe || draft.title.trim() === ""}
                  onClick={() => {
                    void submitDerivedRecipe();
                  }}
                  type="button"
                >
                  {isCreatingDerivedRecipe ? "새 레시피 저장 중..." : "새 레시피로 저장"}
                </button>
              </div>
            ) : (
              <button
                className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-[var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCreatingDerivedRecipe || draft.title.trim() === ""}
                onClick={() => {
                  void submitDerivedRecipe();
                }}
                type="button"
              >
                {isCreatingDerivedRecipe ? "내 레시피 저장 중..." : "내 레시피로 저장"}
              </button>
            )}
          </div>
        </PersonalRecipeEditorShell>
      </div>

      <RecipeEditorDiscardDialog
        onDiscard={() => void controller.discard()}
        onStay={controller.stay}
        open={controller.isDiscardDialogOpen}
      />
    </div>
  );
}
