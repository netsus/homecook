"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  PersonalRecipeEditorShell,
  RecipeEditorBaseServingsControl,
  RecipeEditorDiscardDialog,
  usePersonalRecipeEditorShell,
} from "@/components/recipe/personal-recipe-editor-shell";
import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { changeRecipeIngredient, recipeIngredientGroupKey, toRecipeEditIngredient } from "@/lib/recipe-editor-ingredients";
import { getRecipeIngredientUnitOptions } from "@/lib/recipe-ingredient-units";
import { RecipeFutureImpactSaveFlow } from "@/components/recipe/recipe-future-impact-save-flow";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { DecimalInput } from "@/components/shared/decimal-input";
import { fetchUserProfile } from "@/lib/api/mypage";
import {
  createPersonalRecipeFromSource,
  isPersonalRecipeApiError,
} from "@/lib/api/personal-recipe";
import { createRecipeEditorImageDraft, type RecipeEditorDraft } from "@/lib/personal-recipe-editor";
import type { RecipeEditContext, RecipeEditDraft } from "@/types/recipe";
import { useAuthGateStore } from "@/stores/ui-store";

interface RecipeDetailPersonalEditorProps {
  editContext: RecipeEditContext;
  ingredientNames?: Record<string, string>;
  mode: "edit" | "fork";
  onClose: () => void;
  onSaved: (result: { id: string; revision: number }) => void;
  recipeId: string;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  resumeAction?: "same-id-save" | "save-as-new" | null;
  resumeContext?: RecipeEditContext | null;
}

function derivedRecipeErrorMessage(error: unknown, draft: RecipeEditDraft, ingredientNames: Record<string, string>) {
  if (!isPersonalRecipeApiError(error)) {
    return "새 레시피를 저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.";
  }
  if (error.status !== 422) return `${error.message} 입력한 내용은 유지했어요.`;
  const messages = (error.fields ?? []).slice(0, 3).map(({ field, reason }) => {
    const ingredientMatch = /^draft\.ingredients\[(\d+)\]/.exec(field);
    if (ingredientMatch) {
      const ingredient = draft.ingredients[Number(ingredientMatch[1])];
      const name = ingredient ? [ingredient.component_label,
        ingredientNames[ingredient.ingredient_id] || ingredient.display_text || `재료 ${Number(ingredientMatch[1]) + 1}`,
      ].filter(Boolean).join(" · ") : "재료";
      const detail = reason === "duplicate" ? "같은 구성에 같은 재료가 두 번 있어요."
        : field.endsWith(".amount") ? "수량을 0보다 크게 입력해 주세요."
        : field.endsWith(".unit") ? "단위를 확인해 주세요."
        : "재료 정보를 확인해 주세요.";
      return `${name}: ${detail}`;
    }
    const stepMatch = /^draft\.steps\[(\d+)\]/.exec(field);
    if (stepMatch) return `만들기 ${Number(stepMatch[1]) + 1}단계: ${field.endsWith(".instruction") ? "설명을 입력해 주세요." : "재료와 조리 방법을 확인해 주세요."}`;
    if (field === "draft.title") return "레시피 제목을 1~200자로 입력해 주세요.";
    if (field === "draft.base_servings") return "기준 인분을 1 이상의 정수로 입력해 주세요.";
    if (field === "draft.ingredients") return "재료의 수량과 단위, 선택한 제품 정보를 확인해 주세요.";
    return error.message;
  });
  return `${[...new Set(messages)].join(" ") || error.message} 입력한 내용은 유지했어요.`;
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

interface RemovedIngredient {
  key: number;
  ingredient: RecipeEditDraft["ingredients"][number];
  stepReferences: Array<{
    stepNumber: number;
    references: Array<{ index: number; ingredient: RecipeEditDraft["steps"][number]["ingredients_used"][number] }>;
  }>;
}

function ChangeBadge({ label }: { label: "수정" | "교체" | "추가" }) {
  return <span data-recipe-change={label} className="shrink-0 rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--brand)]">{label}</span>;
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
  ingredientNames = {},
  mode,
  onClose,
  onSaved,
  recipeId,
  returnFocusRef,
  resumeAction = null,
  resumeContext = null,
}: RecipeDetailPersonalEditorProps) {
  const initialDraft = useMemo(
    () => cloneDraft(editContext.draft),
    [editContext],
  );
  const [draft, setDraft] = useState(() => cloneDraft(
    resumeContext?.draft ?? editContext.draft,
  ));
  const [changeBaseline] = useState(() => cloneDraft(draft));
  const [ingredientKeys, setIngredientKeys] = useState(() => draft.ingredients.map((_, index) => index));
  const nextIngredientKey = useRef(draft.ingredients.length);
  const [removedIngredients, setRemovedIngredients] = useState<RemovedIngredient[]>([]);
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [ingredientPicker, setIngredientPicker] = useState<number | "add" | null>(null);
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [isCreatingDerivedRecipe, setIsCreatingDerivedRecipe] = useState(false);
  const [createDerivedRecipeError, setCreateDerivedRecipeError] = useState<string | null>(null);
  const openAuthGate = useAuthGateStore((state) => state.open);
  const authGateOpen = useAuthGateStore((state) => state.isOpen);
  const draftOwnerUuidRef = useRef<string | null>(null);
  useEffect(() => {
    let current = true;
    draftOwnerUuidRef.current = null;
    void fetchUserProfile().then((profile) => {
      if (current) draftOwnerUuidRef.current = profile.id;
    }).catch(() => {
      // An unverified draft owner must never be resumed after reauthentication.
    });
    return () => { current = false; };
  }, [recipeId]);
  const saveContext = resumeContext ?? editContext;
  const resumeSaveAsNew = mode === "edit" && resumeAction === "save-as-new";
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
  const saveErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (createDerivedRecipeError) saveErrorRef.current?.focus();
  }, [createDerivedRecipeError]);
  const fallbackOpenerRef = useRef<HTMLElement | null>(null);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const ingredientsValid = draft.ingredients.length > 0 && draft.ingredients.every((ingredient) =>
    ingredient.ingredient_type === "TO_TASTE"
      ? ingredient.amount === null && ingredient.unit === null
      : ingredient.amount !== null && Number.isFinite(ingredient.amount)
        && ingredient.amount > 0 && Boolean(ingredient.unit?.trim()),
  );
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
  }, [draft, mode, recipeId, resumeAction, saveContext.base_recipe_revision, saveContext.image_object_id]);

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
    active: !authGateOpen && !controller.isDiscardDialogOpen && !impactDialogOpen && ingredientPicker === null,
    dialogRef,
    initialFocusRef: titleRef,
    onClose: controller.requestCancel,
  });

  const submitDerivedRecipe = async () => {
    if (isCreatingDerivedRecipe || draft.title.trim() === "" || !ingredientsValid) {
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
          openAuthGate({
            recipeId,
            type: "recipe-fork",
            sourceOwnerUuid: draftOwnerUuidRef.current,
            editContext: {
              base_recipe_revision: saveContext.base_recipe_revision,
              draft,
              image_object_id: saveContext.image_object_id,
            },
          });
          return;
        }

        openAuthGate({
          editContext: {
            base_recipe_revision: saveContext.base_recipe_revision,
            draft,
            image_object_id: saveContext.image_object_id,
          },
          recipeId,
          type: "recipe-save-as-new",
          sourceOwnerUuid: draftOwnerUuidRef.current,
        });
        return;
      }

      setCreateDerivedRecipeError(derivedRecipeErrorMessage(error, draft, ingredientNames));
    } finally {
      setIsCreatingDerivedRecipe(false);
    }
  };

  const warnUnscopedStepReferences = (index: number) => {
    const previous = draft.ingredients[index];
    if (draft.ingredients.some((item, itemIndex) => itemIndex !== index && item.ingredient_id === previous.ingredient_id)
      && draft.steps.some((step) => !step.component_label?.trim()
        && step.ingredients_used.some((item) => item.ingredient_id === previous.ingredient_id))) {
      setIngredientError("여러 구성에 쓰는 재료예요. 구성이 표시되지 않은 만들기 단계는 그대로 두었으니 확인해 주세요.");
    }
  };

  const ingredientName = (ingredient: RecipeEditDraft["ingredients"][number], index: number) =>
    (ingredient.food_product_id ? ingredient.display_text : ingredientNames[ingredient.ingredient_id])
    || ingredient.display_text || `재료 ${index + 1}`;

  const removeIngredient = (index: number) => {
    warnUnscopedStepReferences(index);
    const nextDraft = changeRecipeIngredient(draft, index, null);
    setRemovedIngredients((current) => [...current, {
      key: ingredientKeys[index],
      ingredient: draft.ingredients[index],
      stepReferences: draft.steps.map((step, stepIndex) => ({
        stepNumber: step.step_number,
        references: step.ingredients_used.flatMap((ingredient, referenceIndex) =>
          nextDraft.steps[stepIndex].ingredients_used.includes(ingredient)
            ? [] : [{ index: referenceIndex, ingredient }]),
      })).filter((step) => step.references.length > 0),
    }]);
    setIngredientKeys((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setDraft(nextDraft);
  };

  const restoreIngredient = (removed: RemovedIngredient) => {
    if (draft.ingredients.some((item) => recipeIngredientGroupKey(item) === recipeIngredientGroupKey(removed.ingredient))) {
      setIngredientError("같은 구성에 이미 들어 있는 재료예요. 기존 재료를 확인해 주세요.");
      return;
    }
    const nextIndex = ingredientKeys.findIndex((key) => key > removed.key);
    const insertAt = nextIndex < 0 ? ingredientKeys.length : nextIndex;
    setIngredientKeys((current) => [...current.slice(0, insertAt), removed.key, ...current.slice(insertAt)]);
    setDraft((current) => ({
      ...current,
      ingredients: [...current.ingredients.slice(0, insertAt), removed.ingredient, ...current.ingredients.slice(insertAt)],
      steps: current.steps.map((step) => {
        const references = removed.stepReferences.find((item) => item.stepNumber === step.step_number)?.references;
        if (!references) return step;
        const restored = [...step.ingredients_used];
        for (const reference of references) {
          if (!restored.some((item) => item.ingredient_id === reference.ingredient.ingredient_id)) {
            restored.splice(Math.min(reference.index, restored.length), 0, reference.ingredient);
          }
        }
        return { ...step, ingredients_used: restored };
      }),
    }));
    setRemovedIngredients((current) => current.filter((item) => item.key !== removed.key));
    setIngredientError(null);
  };

  const pickerComponent = typeof ingredientPicker === "number"
    ? draft.ingredients[ingredientPicker]?.component_label?.trim() || null : null;
  const otherPickerIngredients = draft.ingredients.filter((item, index) => index !== ingredientPicker
    && (item.component_label?.trim() || null) === pickerComponent);

  return (
    <div
      aria-labelledby="recipe-detail-personal-editor-title"
      aria-modal="true"
      className="fixed inset-0 z-[120] overflow-y-auto bg-[var(--surface-fill)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]"
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
              <span className="flex items-center gap-2">레시피 제목 {draft.title !== changeBaseline.title ? <ChangeBadge label="수정" /> : null}</span>
              <input
                aria-label="레시피 제목"
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
              <span className="flex items-center gap-2">레시피 설명 {draft.description !== changeBaseline.description ? <ChangeBadge label="수정" /> : null}</span>
              <textarea
                aria-label="레시피 설명"
                className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-base outline-none focus:border-[var(--brand)]"
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  description: event.target.value === "" ? null : event.target.value,
                }))}
                value={draft.description ?? ""}
              />
            </label>

            <section aria-labelledby="recipe-editor-servings">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--foreground)]" id="recipe-editor-servings">기준 인분 {draft.base_servings !== changeBaseline.base_servings ? <ChangeBadge label="수정" /> : null}</h3>
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
              {draft.ingredients.map((ingredient, index) => {
                const name = ingredientName(ingredient, index);
                const baseline = changeBaseline.ingredients[ingredientKeys[index]];
                const change = !baseline ? "추가"
                  : baseline.ingredient_id !== ingredient.ingredient_id
                    || baseline.food_product_id !== ingredient.food_product_id
                    || baseline.food_product_nutrition_version_id !== ingredient.food_product_nutrition_version_id ? "교체"
                    : JSON.stringify(baseline) !== JSON.stringify(ingredient) ? "수정" : null;
                return (
                  <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--line)] px-2.5 py-2" key={ingredientKeys[index]} data-testid={`recipe-editor-ingredient-${index + 1}`}>
                    <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-sm font-bold">
                      <span className="shrink-0 text-[var(--text-2)]">{index + 1}.</span>
                      <span className="min-w-0 break-words">{name}</span>
                      {change ? <ChangeBadge label={change} /> : null}
                    </div>
                    {ingredient.component_label ? <p className="mb-1.5 text-xs text-[var(--text-2)]">{ingredient.component_label}</p> : null}
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-1.5">
                      <DecimalInput
                        aria-label={`재료 ${index + 1} 수량`}
                        className="h-11 min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-2 text-base text-[var(--foreground)]"
                        inputMode="decimal"
                        placeholder={ingredient.ingredient_type === "TO_TASTE" ? "약간" : "수량"}
                        onValueChange={(amount) => setDraft((current) => ({
                          ...current,
                          ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index
                            ? { ...item, ingredient_type: "QUANT", amount }
                            : item),
                        }))}
                        value={ingredient.amount}
                      />
                      <select
                        aria-label={`재료 ${index + 1} 단위`}
                        className="h-11 min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-1 text-base text-[var(--foreground)] disabled:bg-[var(--surface-fill)]"
                        disabled={Boolean(ingredient.food_product_id)}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index
                            ? { ...item, ingredient_type: "QUANT", unit: event.target.value || null }
                            : item),
                        }))}
                        value={ingredient.unit ?? ""}
                      >
                        <option disabled value="">{ingredient.ingredient_type === "TO_TASTE" ? "약간" : "단위"}</option>
                        {getRecipeIngredientUnitOptions(ingredient).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                      <button className="h-11 text-sm font-bold text-[var(--brand)]" type="button" onClick={() => { setIngredientError(null); setIngredientPicker(index); }}>교체</button>
                      <button aria-label={`${name} 삭제`} className="h-11 text-xl text-[var(--danger)]" type="button" onClick={() => removeIngredient(index)}>×</button>
                    </div>
                  </div>
                );
              })}
              {removedIngredients.map((removed) => (
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-2.5 text-sm text-[var(--text-2)]" key={removed.key}>
                  <span className="min-w-0 break-words">{removed.ingredient.component_label ? `${removed.ingredient.component_label} · ` : ""}{ingredientName(removed.ingredient, removed.key)} <span className="text-[var(--danger)]">삭제됨</span></span>
                  <button aria-label={`${ingredientName(removed.ingredient, removed.key)} 삭제 취소`} className="min-h-11 shrink-0 px-1 font-bold text-[var(--brand)]" type="button" onClick={() => restoreIngredient(removed)}>취소</button>
                </div>
              ))}
              <button className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] text-sm font-bold" type="button" onClick={() => { setIngredientError(null); setIngredientPicker("add"); }}>+ 재료 추가하기</button>
              {ingredientError ? <p role="alert" className="text-sm text-[var(--danger)]">{ingredientError}</p> : null}
              {!ingredientsValid && draft.ingredients.length > 0 ? <p role="status" className="text-sm text-[var(--danger)]">재료의 수량과 단위를 입력해 주세요.</p> : null}
              <p className="text-xs text-[var(--text-2)]">재료를 교체하면 기존 양을 유지해요. 제품의 기준 단위가 다르면 양을 다시 입력해 주세요. 아래 만들기 설명도 확인해 주세요.</p>
            </section>

            <section aria-labelledby="recipe-editor-steps" className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--foreground)]" id="recipe-editor-steps">만들기</h3>
              {draft.steps.map((step, index) => (
                <label className="block space-y-1 text-xs font-semibold text-[var(--text-2)]" key={step.step_number}>
                  <span className="flex items-center gap-2">단계 {step.step_number} {JSON.stringify(step) !== JSON.stringify(changeBaseline.steps[index]) ? <ChangeBadge label="수정" /> : null}</span>
                  <textarea
                    aria-label={`단계 ${step.step_number}`}
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
                ref={saveErrorRef}
                tabIndex={-1}
              >
                {createDerivedRecipeError}
              </div>
            ) : null}

            {mode === "edit" ? (
              <div className="space-y-3">
                {!resumeSaveAsNew ? (
                  <RecipeFutureImpactSaveFlow
                    actionDisabled={!hasChanges || draft.title.trim() === "" || !ingredientsValid}
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
                      sourceOwnerUuid: draftOwnerUuidRef.current,
                    })}
                    recipeId={recipeId}
                    resumePreview={resumeAction === "same-id-save" && Boolean(resumeContext)}
                  />
                ) : null}
                <button
                  className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-transparent px-4 font-semibold text-[var(--text-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isCreatingDerivedRecipe || draft.title.trim() === "" || !ingredientsValid}
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
                disabled={isCreatingDerivedRecipe || draft.title.trim() === "" || !ingredientsValid}
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
      {ingredientPicker !== null ? <RecipeIngredientAddModal
        enableProducts
        excludedIngredientIds={otherPickerIngredients.map((item) => item.ingredient_id)}
        single={ingredientPicker !== "add"}
        onClose={() => setIngredientPicker(null)}
        onAdd={(items) => {
          if (ingredientPicker !== "add" && items.length !== 1) {
            setIngredientError("교체할 재료를 하나만 선택해 주세요."); return;
          }
          const existing = new Set(otherPickerIngredients.map((item) => item.ingredient_id));
          if (items.some((item) => existing.has(item.ingredient_id))) {
            setIngredientError("이미 들어 있는 재료예요. 기존 재료의 양을 수정해 주세요."); return;
          }
          if (typeof ingredientPicker === "number") {
            warnUnscopedStepReferences(ingredientPicker);
          }
          if (ingredientPicker === "add") {
            const newKeys = items.map(() => nextIngredientKey.current++);
            setIngredientKeys((current) => [...current, ...newKeys]);
          }
          setDraft((current) => {
            return ingredientPicker === "add"
              ? { ...current, ingredients: [...current.ingredients, ...items.map(toRecipeEditIngredient)] }
              : changeRecipeIngredient(current, ingredientPicker, toRecipeEditIngredient(items[0]));
          });
        }}
      /> : null}
    </div>
  );
}
