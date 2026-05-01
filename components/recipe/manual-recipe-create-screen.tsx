"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { ModalHeader } from "@/components/shared/modal-header";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchIngredients } from "@/lib/api/ingredients";
import { createManualRecipe } from "@/lib/api/manual-recipe";
import { createMealSafe } from "@/lib/api/meal";
import type {
  CookingMethodItem,
  IngredientItem,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
} from "@/types/recipe";

interface ManualRecipeCreateScreenProps {
  initialAuthenticated?: boolean;
  planDate: string;
  columnId: string;
  slotName: string;
}

type ModalMode =
  | "none"
  | "ingredient-add"
  | "step-add"
  | "success"
  | "servings-input";

// Temporary ingredient type for UI state (before save)
interface TempIngredient extends ManualRecipeIngredientInput {
  tempId: string;
}

// Temporary step type for UI state (before save)
interface TempStep extends Omit<ManualRecipeStepInput, "cooking_method_id"> {
  tempId: string;
  cooking_method: CookingMethodItem | null;
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
  onSave: () => void;
  canSave: boolean;
  isSaving: boolean;
}

function AppBar({ onBack, onSave, canSave, isSaving }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="flex h-14 items-center gap-2 px-2">
        <button
          aria-label="뒤로 가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-white/60"
          onClick={onBack}
          type="button"
          disabled={isSaving}
        >
          <svg
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5L7 10L12 15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-[var(--foreground)]">
          직접 레시피 등록
        </h1>
        <button
          className={[
            "h-11 px-4 text-base font-semibold rounded-[var(--radius-sm)]",
            canSave && !isSaving
              ? "text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              : "text-[var(--text-4)] cursor-not-allowed",
          ].join(" ")}
          onClick={onSave}
          disabled={!canSave || isSaving}
          type="button"
        >
          {isSaving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient List ─────────────────────────────────────────────────────────

interface IngredientListProps {
  ingredients: TempIngredient[];
  onRemove: (tempId: string) => void;
}

function IngredientList({ ingredients, onRemove }: IngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] py-4">재료를 추가해주세요</p>
    );
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ing) => (
        <div
          key={ing.tempId}
          className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="text-base text-[var(--foreground)]">
              {ing.standard_name}
            </div>
            <div className="text-sm text-[var(--text-2)]">
              {ing.ingredient_type === "QUANT"
                ? `${ing.amount}${ing.unit}`
                : "약간"}
            </div>
          </div>
          <button
            aria-label={`${ing.standard_name} 삭제`}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-3)] hover:text-[var(--foreground)]"
            onClick={() => onRemove(ing.tempId)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Step List ───────────────────────────────────────────────────────────────

interface StepListProps {
  steps: TempStep[];
  onRemove: (tempId: string) => void;
}

function StepList({ steps, onRemove }: StepListProps) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] py-4">
        조리 과정을 추가해주세요
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.tempId}
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {step.step_number}.
                </span>
                {step.cooking_method && (
                  <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-xs font-semibold text-white">
                    {step.cooking_method.label}
                  </span>
                )}
              </div>
              <p className="text-base text-[var(--foreground)] whitespace-pre-wrap break-words">
                {step.instruction}
              </p>
            </div>
            <button
              aria-label={`스텝 ${step.step_number} 삭제`}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-3)] hover:text-[var(--foreground)]"
              onClick={() => onRemove(step.tempId)}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Ingredient Add Modal ────────────────────────────────────────────────────

interface IngredientAddModalProps {
  onClose: () => void;
  onAdd: (ingredient: Omit<TempIngredient, "tempId">) => void;
  availableIngredients: IngredientItem[];
  isLoadingIngredients: boolean;
  onSearchIngredients: (query: string) => void;
}

function IngredientAddModal({
  onClose,
  onAdd,
  availableIngredients,
  isLoadingIngredients,
  onSearchIngredients,
}: IngredientAddModalProps) {
  const [selectedIngredient, setSelectedIngredient] =
    useState<IngredientItem | null>(null);
  const [ingredientType, setIngredientType] = useState<"QUANT" | "TO_TASTE">(
    "QUANT"
  );
  const [amount, setAmount] = useState<string>("100");
  const [unit, setUnit] = useState<string>("g");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchIngredients(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearchIngredients]);

  const handleAdd = () => {
    if (!selectedIngredient) return;

    const newIngredient: Omit<TempIngredient, "tempId"> = {
      ingredient_id: selectedIngredient.id,
      standard_name: selectedIngredient.standard_name,
      ingredient_type: ingredientType,
      amount: ingredientType === "QUANT" ? parseFloat(amount) : null,
      unit: ingredientType === "QUANT" ? unit : null,
      scalable: ingredientType === "QUANT",
      display_text:
        ingredientType === "QUANT"
          ? `${selectedIngredient.standard_name} ${amount}${unit}`
          : `${selectedIngredient.standard_name} 약간`,
      sort_order: 0,
    };

    onAdd(newIngredient);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-6 sm:rounded-[20px]">
        <ModalHeader title="재료 추가" onClose={onClose} />
        <div className="mt-6 space-y-4">
          <input
            type="text"
            placeholder="재료 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base"
          />
          {!selectedIngredient && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {isLoadingIngredients ? (
                <p className="py-4 text-center text-sm text-[var(--muted)]">
                  재료 검색 중...
                </p>
              ) : availableIngredients.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--muted)]">
                  검색 결과가 없어요
                </p>
              ) : (
                availableIngredients.slice(0, 20).map((ing) => (
                  <button
                    key={ing.id}
                    className="w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-base hover:bg-[var(--surface-fill)]"
                    onClick={() => setSelectedIngredient(ing)}
                    type="button"
                  >
                    · {ing.standard_name}
                  </button>
                ))
              )}
            </div>
          )}
          {selectedIngredient && (
            <>
              <div className="rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-3">
                <div className="text-sm text-[var(--text-2)]">
                  선택된 재료
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-[var(--foreground)]">
                    {selectedIngredient.standard_name}
                  </div>
                  <button
                    onClick={() => setSelectedIngredient(null)}
                    className="text-sm text-[var(--brand)]"
                    type="button"
                  >
                    다시 선택
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={ingredientType === "QUANT"}
                    onChange={() => setIngredientType("QUANT")}
                  />
                  <span className="text-base">정량 (QUANT)</span>
                </label>
                {ingredientType === "QUANT" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="수량"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-base"
                    />
                    <input
                      type="text"
                      placeholder="단위"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-base"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={ingredientType === "TO_TASTE"}
                    onChange={() => setIngredientType("TO_TASTE")}
                  />
                  <span className="text-base">가감형 (TO_TASTE)</span>
                </label>
              </div>
            </>
          )}
        </div>
        <div className="mt-6">
          <Button fullWidth onClick={handleAdd} disabled={!selectedIngredient}>
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Add Modal ──────────────────────────────────────────────────────────

interface StepAddModalProps {
  onClose: () => void;
  onAdd: (step: Omit<TempStep, "tempId" | "step_number">) => void;
  cookingMethods: CookingMethodItem[];
  nextStepNumber: number;
}

function StepAddModal({
  onClose,
  onAdd,
  cookingMethods,
  nextStepNumber,
}: StepAddModalProps) {
  const [selectedMethod, setSelectedMethod] =
    useState<CookingMethodItem | null>(null);
  const [instruction, setInstruction] = useState("");

  const handleAdd = () => {
    if (!selectedMethod || !instruction.trim()) return;

    onAdd({
      instruction: instruction.trim(),
      cooking_method: selectedMethod,
      ingredients_used: [],
      heat_level: null,
      duration_seconds: null,
      duration_text: null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-6 sm:rounded-[20px]">
        <ModalHeader title="조리 과정 추가" onClose={onClose} />
        <div className="mt-6 space-y-4">
          <div>
            <div className="text-sm font-semibold text-[var(--text-2)]">
              스텝 번호: {nextStepNumber}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-[var(--text-2)]">
              조리방법 선택
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cookingMethods.map((method) => (
                <button
                  key={method.id}
                  className={[
                    "rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold",
                    selectedMethod?.id === method.id
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--foreground)]",
                  ].join(" ")}
                  onClick={() => setSelectedMethod(method)}
                  type="button"
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-[var(--text-2)]">
              조리 설명
            </div>
            <textarea
              placeholder="조리 설명을 입력하세요"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base"
            />
          </div>
        </div>
        <div className="mt-6">
          <Button
            fullWidth
            onClick={handleAdd}
            disabled={!selectedMethod || !instruction.trim()}
          >
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Success Modal ───────────────────────────────────────────────────────────

interface SuccessModalProps {
  recipeTitle: string;
  mealAddError: string | null;
  onMealAdd: () => void;
  onViewDetail: () => void;
  onClose: () => void;
}

function SuccessModal({
  recipeTitle,
  mealAddError,
  onMealAdd,
  onViewDetail,
  onClose,
}: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-6 sm:rounded-[20px]">
        <div className="mb-6 text-center">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            레시피 등록 완료
          </h2>
          <p className="mt-2 text-base text-[var(--text-2)]">
            &lsquo;{recipeTitle}&rsquo;가 등록됐어요
          </p>
        </div>
        {mealAddError && (
          <div
            className="mb-4 rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {mealAddError}
          </div>
        )}
        <div className="space-y-3">
          <Button fullWidth onClick={onMealAdd}>
            끼니에 추가
          </Button>
          <Button fullWidth variant="secondary" onClick={onViewDetail}>
            레시피 상세로 이동
          </Button>
          <Button fullWidth variant="neutral" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Servings Input Modal ────────────────────────────────────────────────────

interface ServingsInputModalProps {
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  defaultServings: number;
  isCreating: boolean;
  error: string | null;
}

function ServingsInputModal({
  onConfirm,
  onCancel,
  defaultServings,
  isCreating,
  error,
}: ServingsInputModalProps) {
  const [servings, setServings] = useState(defaultServings);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-6 sm:rounded-[20px]">
        <ModalHeader title="끼니에 추가" onClose={onCancel} />
        <div className="mt-6">
          <NumericStepperCompact
            value={servings}
            min={1}
            onChange={setServings}
            unit="인분"
            disabled={isCreating}
          />
        </div>
        {error && (
          <div
            className="mt-4 rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="mt-6">
          <Button
            fullWidth
            onClick={() => onConfirm(servings)}
            loading={isCreating}
            disabled={isCreating}
          >
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ManualRecipeCreateScreen({
  planDate,
  columnId,
  slotName,
}: ManualRecipeCreateScreenProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [baseServings, setBaseServings] = useState(2);
  const [ingredients, setIngredients] = useState<TempIngredient[]>([]);
  const [steps, setSteps] = useState<TempStep[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>("none");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);
  const [createdRecipeTitle, setCreatedRecipeTitle] = useState<string>("");

  // API data states
  const [cookingMethods, setCookingMethods] = useState<CookingMethodItem[]>(
    []
  );
  const [availableIngredients, setAvailableIngredients] = useState<
    IngredientItem[]
  >([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);

  // Meal add flow
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [mealAddError, setMealAddError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCookingMethods() {
      setIsLoadingMethods(true);
      const response = await fetchCookingMethods();
      if (response.success && response.data?.methods) {
        setCookingMethods(response.data.methods);
      }
      setIsLoadingMethods(false);
    }
    loadCookingMethods();
  }, []);

  const handleSearchIngredients = useCallback(async (query: string) => {
    setIsLoadingIngredients(true);
    const response = await fetchIngredients({ q: query });
    if (response.success && response.data?.items) {
      setAvailableIngredients(response.data.items);
    }
    setIsLoadingIngredients(false);
  }, []);

  const canSave =
    title.trim().length > 0 &&
    baseServings >= 1 &&
    ingredients.length > 0 &&
    steps.length > 0;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleAddIngredient = useCallback(
    (ingredient: Omit<TempIngredient, "tempId">) => {
      setIngredients((prev) => [
        ...prev,
        { ...ingredient, tempId: `temp-ing-${Date.now()}` },
      ]);
    },
    []
  );

  const handleRemoveIngredient = useCallback((tempId: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.tempId !== tempId));
  }, []);

  const handleAddStep = useCallback(
    (step: Omit<TempStep, "tempId" | "step_number">) => {
      setSteps((prev) => [
        ...prev,
        {
          ...step,
          tempId: `temp-step-${Date.now()}`,
          step_number: prev.length + 1,
        },
      ]);
    },
    []
  );

  const handleRemoveStep = useCallback((tempId: string) => {
    setSteps((prev) => {
      const updated = prev.filter((s) => s.tempId !== tempId);
      return updated.map((s, idx) => ({ ...s, step_number: idx + 1 }));
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    setSaveError(null);

    const response = await createManualRecipe({
      title: title.trim(),
      base_servings: baseServings,
      ingredients: ingredients.map((ing, idx) => ({
        ingredient_id: ing.ingredient_id,
        standard_name: ing.standard_name,
        amount: ing.amount,
        unit: ing.unit,
        ingredient_type: ing.ingredient_type,
        display_text: ing.display_text,
        scalable: ing.scalable,
        sort_order: idx + 1,
      })),
      steps: steps.map((step) => ({
        step_number: step.step_number,
        instruction: step.instruction,
        cooking_method_id: step.cooking_method?.id ?? "",
        ingredients_used: step.ingredients_used,
        heat_level: step.heat_level,
        duration_seconds: step.duration_seconds,
        duration_text: step.duration_text,
      })),
    });

    if (!response.success || !response.data) {
      setSaveError(response.error?.message ?? "레시피를 등록하지 못했어요.");
      setIsSaving(false);
      return;
    }

    setCreatedRecipeId(response.data.id);
    setCreatedRecipeTitle(response.data.title);
    setModalMode("success");
    setIsSaving(false);
  }, [canSave, title, baseServings, ingredients, steps]);

  const handleMealAdd = useCallback(() => {
    if (!planDate || !columnId) {
      setMealAddError("끼니 추가 정보가 없어요. 플래너에서 다시 시도해주세요.");
      return;
    }
    setMealAddError(null);
    setModalMode("servings-input");
  }, [planDate, columnId]);

  const handleServingsConfirm = useCallback(
    async (servings: number) => {
      if (!createdRecipeId) return;

      setIsCreatingMeal(true);
      setMealAddError(null);

      const response = await createMealSafe({
        recipe_id: createdRecipeId,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
      });

      if (!response.success) {
        setMealAddError(
          response.error?.message ?? "식사를 추가하지 못했어요."
        );
        setIsCreatingMeal(false);
        return;
      }

      const slotSuffix = slotName ? `?slot=${encodeURIComponent(slotName)}` : "";
      router.replace(`/planner/${planDate}/${columnId}${slotSuffix}`);
    },
    [createdRecipeId, planDate, columnId, slotName, router]
  );

  const handleViewDetail = useCallback(() => {
    if (!createdRecipeId) return;
    router.replace(`/recipe/${createdRecipeId}`);
  }, [createdRecipeId, router]);

  const handleSuccessClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      <AppBar
        onBack={handleBack}
        onSave={handleSave}
        canSave={canSave}
        isSaving={isSaving}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-2xl py-4 space-y-6">
          {/* Basic Info */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">
              📝 기본 정보
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="레시피명 (필수)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base placeholder:text-[var(--text-3)]"
              />
              <div className="flex items-center justify-between">
                <span className="text-base text-[var(--foreground)]">
                  기본 인분
                </span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="인분 줄이기"
                    className="flex h-11 w-11 items-center justify-center"
                    disabled={baseServings <= 1}
                    onClick={() =>
                      setBaseServings((prev) => Math.max(1, prev - 1))
                    }
                    type="button"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-white text-sm font-medium">
                      −
                    </span>
                  </button>
                  <span className="min-w-5 text-center font-bold">
                    {baseServings}
                  </span>
                  <button
                    aria-label="인분 늘리기"
                    className="flex h-11 w-11 items-center justify-center"
                    onClick={() => setBaseServings((prev) => prev + 1)}
                    type="button"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white">
                      +
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Ingredients */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">
              🥬 재료
            </h2>
            <IngredientList
              ingredients={ingredients}
              onRemove={handleRemoveIngredient}
            />
            <button
              className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--brand)] bg-transparent py-3 text-base font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              onClick={() => setModalMode("ingredient-add")}
              type="button"
            >
              + 재료 추가
            </button>
          </section>

          {/* Steps */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">
              👨‍🍳 조리 과정
            </h2>
            {isLoadingMethods ? (
              <p className="text-sm text-[var(--muted)] py-4">
                조리방법 불러오는 중...
              </p>
            ) : (
              <>
                <StepList steps={steps} onRemove={handleRemoveStep} />
                <button
                  className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--brand)] bg-transparent py-3 text-base font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                  onClick={() => setModalMode("step-add")}
                  type="button"
                >
                  + 조리 과정 추가
                </button>
              </>
            )}
          </section>

          {saveError && (
            <div
              className="rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {saveError}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modalMode === "ingredient-add" && (
        <IngredientAddModal
          onClose={() => setModalMode("none")}
          onAdd={handleAddIngredient}
          availableIngredients={availableIngredients}
          isLoadingIngredients={isLoadingIngredients}
          onSearchIngredients={handleSearchIngredients}
        />
      )}
      {modalMode === "step-add" && (
        <StepAddModal
          onClose={() => setModalMode("none")}
          onAdd={handleAddStep}
          cookingMethods={cookingMethods}
          nextStepNumber={steps.length + 1}
        />
      )}
      {modalMode === "success" && createdRecipeId && (
        <SuccessModal
          recipeTitle={createdRecipeTitle}
          mealAddError={mealAddError}
          onMealAdd={handleMealAdd}
          onViewDetail={handleViewDetail}
          onClose={handleSuccessClose}
        />
      )}
      {modalMode === "servings-input" && (
        <ServingsInputModal
          onConfirm={handleServingsConfirm}
          onCancel={() => setModalMode("success")}
          defaultServings={baseServings}
          isCreating={isCreatingMeal}
          error={mealAddError}
        />
      )}
    </div>
  );
}
