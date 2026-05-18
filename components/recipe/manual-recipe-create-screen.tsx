"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { Button } from "@/components/ui/button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { createManualRecipe } from "@/lib/api/manual-recipe";
import { createMealSafe } from "@/lib/api/meal";
import { COOKING_UNIT_OPTIONS } from "@/lib/recipe-units";
import {
  WebButton,
  WebCard,
  WebShell,
  WebTopNav,
} from "@/components/web";
import type {
  CookingMethodItem,
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

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

function formatTargetLabel(planDate: string, slotName: string) {
  if (!planDate && !slotName) return "플래너";

  const dateLabel = planDate
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date(`${planDate}T00:00:00`))
    : "날짜 미지정";

  return slotName ? `${dateLabel} · ${slotName}` : dateLabel;
}

// Temporary ingredient type for UI state (before save)
interface TempIngredient extends ManualRecipeIngredientInput {
  tempId: string;
}

function formatIngredientDisplayText(ingredient: ManualRecipeIngredientInput) {
  if (ingredient.ingredient_type !== "QUANT") {
    return `${ingredient.standard_name} 약간`;
  }

  const amount = ingredient.amount ?? 0;
  const unit = ingredient.unit ?? "g";
  return `${ingredient.standard_name} ${amount}${unit}`;
}

function normalizeIngredient(ingredient: TempIngredient): TempIngredient {
  return {
    ...ingredient,
    ingredient_type: "QUANT",
    amount: ingredient.amount ?? 0,
    unit: ingredient.unit ?? "g",
    display_text: formatIngredientDisplayText({
      ...ingredient,
      ingredient_type: "QUANT",
      amount: ingredient.amount ?? 0,
      unit: ingredient.unit ?? "g",
    }),
  };
}

// Temporary step type for UI state (before save)
interface TempStep extends Omit<ManualRecipeStepInput, "cooking_method_id"> {
  tempId: string;
  cooking_method: CookingMethodItem | null;
}

function getManualSaveRequirements({
  title,
  baseServings,
  ingredients,
  steps,
}: {
  title: string;
  baseServings: number;
  ingredients: TempIngredient[];
  steps: TempStep[];
}) {
  const requirements: string[] = [];

  if (title.trim().length === 0) requirements.push("요리 이름");
  if (baseServings < 1) requirements.push("기준 인분");
  if (ingredients.length === 0) requirements.push("재료");
  if (steps.length === 0) requirements.push("조리법");

  return requirements;
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
    <div className="shrink-0 border-b border-[#DEE2E6] bg-white">
      <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#212529] hover:bg-[#F8F9FA]"
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
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[#212529]">
          직접 등록
        </h1>
        <button
          className={[
            "hidden h-11 rounded-[8px] px-4 text-base font-semibold lg:block",
            canSave && !isSaving
              ? "text-[#20A8A4] hover:bg-[#E6F8F7]"
              : "cursor-not-allowed text-[#ADB5BD]",
          ].join(" ")}
          onClick={onSave}
          disabled={!canSave || isSaving}
          type="button"
        >
          {isSaving ? "저장 중..." : "저장"}
        </button>
        <div aria-hidden="true" className="h-8 w-8 shrink-0 lg:hidden" />
      </div>
    </div>
  );
}

// ─── Ingredient List ─────────────────────────────────────────────────────────

interface IngredientListProps {
  ingredients: TempIngredient[];
  onChange: (
    tempId: string,
    patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
  ) => void;
  onRemove: (tempId: string) => void;
}

function IngredientList({ ingredients, onChange, onRemove }: IngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <div className="mb-3 rounded-[10px] bg-[#F8F9FA] px-4 py-3 text-[14px] font-medium leading-[1.5] text-[#868E96]">
        재료를 1개 이상 추가해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ing) => (
        <div
          key={ing.tempId}
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-[var(--foreground)]">
                {ing.standard_name}
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  aria-label={`${ing.standard_name} 수량`}
                  className="h-10 min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-3 text-right text-base font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => {
                    const value = event.target.value;
                    onChange(ing.tempId, {
                      amount: value === "" ? 0 : Number(value),
                      unit: ing.unit ?? "g",
                    });
                  }}
                  type="number"
                  value={ing.amount ?? 0}
                />
                <div
                  aria-label={`${ing.standard_name} 단위`}
                  className="flex shrink-0 gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-1"
                  role="group"
                >
                  {COOKING_UNIT_OPTIONS.map((option) => (
                    <button
                      aria-label={`${ing.standard_name} ${option}`}
                      aria-pressed={(ing.unit ?? "g") === option}
                      className={[
                        "h-9 min-w-10 rounded-[var(--radius-sm)] px-2 text-sm font-semibold transition",
                        (ing.unit ?? "g") === option
                          ? "bg-[var(--brand)] text-white"
                          : "text-[var(--text-2)] hover:bg-[var(--surface)]",
                      ].join(" ")}
                      key={option}
                      onClick={() =>
                        onChange(ing.tempId, {
                          amount: ing.amount ?? 0,
                          unit: option,
                        })
                      }
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
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
      <div className="rounded-[10px] bg-[#F8F9FA] px-4 py-3 text-[14px] font-medium leading-[1.5] text-[#868E96]">
        조리 과정을 추가해주세요.
      </div>
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

function SaveRequirementsNotice({ requirements }: { requirements: string[] }) {
  if (requirements.length === 0) {
    return null;
  }

  return (
    <div
      className="mx-4 rounded-[12px] bg-white px-4 py-3 text-[#495057] md:mx-0 md:border md:border-[#EDF0F2]"
      data-testid="manual-save-requirements"
      role="status"
    >
      <p className="text-[13px] font-semibold leading-[1.45] text-[#495057]">
        저장하려면 아래 항목을 채워주세요.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {requirements.map((requirement) => (
          <span
            className="rounded-[8px] bg-[#F1F3F5] px-2.5 py-1 text-[12px] font-medium text-[#495057]"
            key={requirement}
          >
            {requirement}
          </span>
        ))}
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-t-[20px] bg-[var(--surface)] p-6 sm:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
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
  const appReturn = useAppReturn({
    fallback:
      planDate && columnId
        ? `/planner/${planDate}/${columnId}${slotName ? `?slot=${encodeURIComponent(slotName)}` : ""}`
        : "/planner",
  });
  const isDesktopViewport = useDesktopViewport();
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
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);

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

  const saveRequirements = getManualSaveRequirements({
    title,
    baseServings,
    ingredients,
    steps,
  });
  const canSave = saveRequirements.length === 0;

  const handleBack = useCallback(() => {
    appReturn.goBack();
  }, [appReturn]);

  const handleAddIngredient = useCallback(
    (newIngredients: ManualRecipeIngredientInput[]) => {
      setIngredients((prev) => [
        ...prev,
        ...newIngredients.map((ingredient, index) =>
          normalizeIngredient({
            ...ingredient,
            sort_order: prev.length + index + 1,
            tempId: `temp-ing-${Date.now()}-${index}`,
          }),
        ),
      ]);
    },
    []
  );

  const handleUpdateIngredient = useCallback(
    (
      tempId: string,
      patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
    ) => {
      setIngredients((prev) =>
        prev.map((ingredient) =>
          ingredient.tempId === tempId
            ? normalizeIngredient({ ...ingredient, ...patch })
            : ingredient,
        ),
      );
    },
    [],
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
    appReturn.goBack();
  }, [appReturn]);

  const targetLabel = formatTargetLabel(planDate, slotName);

  if (isDesktopViewport) {
    return (
      <div className="web-menu-add-shell">
        <WebShell>
          <WebTopNav activeId="planner" items={WEB_NAV_ITEMS} />
          <nav aria-label="직접 등록 경로" className="web-breadcrumb">
            <button
              className="web-breadcrumb-link"
              onClick={handleBack}
              type="button"
            >
              Planner
            </button>
            <span className="web-breadcrumb-sep">/</span>
            <span className="web-breadcrumb-link">{targetLabel}</span>
            <span className="web-breadcrumb-sep">/</span>
            <span className="web-breadcrumb-current">직접 입력</span>
          </nav>
          <div className="web-manual-head">
            <div>
              <p className="web-menu-add-eyebrow">직접 등록</p>
              <h1>새 레시피를 직접 입력해요</h1>
              <p>기본 정보, 재료, 조리법을 입력한 뒤 플래너에 바로 추가할 수 있어요.</p>
            </div>
            <div className="web-manual-actions">
              <WebButton onClick={handleBack} variant="secondary">
                취소
              </WebButton>
              <WebButton disabled={!canSave || isSaving} onClick={handleSave}>
                {isSaving ? "저장 중..." : "저장"}
              </WebButton>
            </div>
          </div>

          <WebCard className="web-manual-card">
            <section className="web-manual-section">
              <div className="web-manual-section-head">
                <h2>기본 정보</h2>
                <span>{targetLabel}</span>
              </div>
              <div className="web-manual-fields">
                <label className="web-manual-field web-manual-field-wide">
                  <span>요리 이름</span>
                  <input
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 김치찌개"
                    type="text"
                    value={title}
                  />
                </label>
                <label className="web-manual-field">
                  <span>기준 인분</span>
                  <div className="web-stepper" aria-label="기준 인분" role="group">
                    <button
                      aria-label="인분 줄이기"
                      disabled={baseServings <= 1}
                      onClick={() => setBaseServings((value) => Math.max(1, value - 1))}
                      type="button"
                    >
                      −
                    </button>
                    <span>{baseServings}인분</span>
                    <button
                      aria-label="인분 늘리기"
                      onClick={() => setBaseServings((value) => value + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </label>
              </div>
            </section>

            <section className="web-manual-section">
              <div className="web-manual-section-head">
                <h2>재료</h2>
                <span>{ingredients.length}개 선택됨</span>
              </div>
              <IngredientList
                ingredients={ingredients}
                onChange={handleUpdateIngredient}
                onRemove={handleRemoveIngredient}
              />
              <WebButton
                className="web-manual-add-button"
                onClick={() => setModalMode("ingredient-add")}
                variant="secondary"
              >
                + 재료 추가하기
              </WebButton>
            </section>

            <section className="web-manual-section">
              <div className="web-manual-section-head">
                <h2>조리법</h2>
                <span>{steps.length}단계</span>
              </div>
              {isLoadingMethods ? (
                <p className="web-picker-subtle">조리방법 불러오는 중...</p>
              ) : (
                <>
                  <StepList steps={steps} onRemove={handleRemoveStep} />
                  <WebButton
                    className="web-manual-add-button"
                    onClick={() => setModalMode("step-add")}
                    variant="secondary"
                  >
                    + 조리 과정 추가
                  </WebButton>
                </>
              )}
            </section>

            {saveError ? (
              <div className="web-menu-add-error" role="alert">
                {saveError}
              </div>
            ) : null}

            <SaveRequirementsNotice requirements={saveRequirements} />
          </WebCard>
        </WebShell>

        {modalMode === "ingredient-add" && (
          <RecipeIngredientAddModal
            onClose={() => setModalMode("none")}
            onAdd={handleAddIngredient}
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

  return (
    <div className="flex h-screen flex-col bg-[#F8F9FA] md:bg-[var(--background)]">
      <AppBar
        onBack={handleBack}
        onSave={handleSave}
        canSave={canSave}
        isSaving={isSaving}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-[84px] md:px-4 md:pb-6">
        <div className="mx-auto max-w-2xl space-y-2 md:space-y-6 md:py-4">
          {/* Basic Info */}
          <section className="bg-white px-4 pb-4 pt-5 md:rounded-[16px] md:border md:border-[var(--line)]">
            <h2 className="mb-3 text-[16px] font-semibold leading-[1.3] text-[#212529]">
              기본 정보
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium leading-[1.4] text-[#868E96]">
                  요리 이름
                </span>
                <input
                  type="text"
                  placeholder="예: 김치찌개"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-[38px] w-full rounded-[8px] border border-[#DEE2E6] bg-white px-3.5 text-[14px] font-normal text-[#212529] placeholder:text-[#868E96] focus:border-[#2AC1BC] focus:outline-none"
                />
              </label>
              <label className="block max-w-[13rem]">
                <span className="mb-1.5 block text-[12px] font-medium leading-[1.4] text-[#868E96]">
                  기준 인분
                </span>
                <input
                  type="number"
                  min={1}
                  value={baseServings}
                  onChange={(e) =>
                    setBaseServings(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="h-[38px] w-full rounded-[8px] border border-[#DEE2E6] bg-white px-3.5 text-[14px] font-normal text-[#212529] focus:border-[#2AC1BC] focus:outline-none"
                />
              </label>
            </div>
          </section>

          {/* Ingredients */}
          <section className="bg-white px-4 pb-4 pt-5 md:rounded-[16px] md:border md:border-[var(--line)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold leading-[1.3] text-[#212529]">
                재료
              </h2>
              <span className="text-[12px] font-medium text-[#868E96]">
                {ingredients.length}개 선택됨
              </span>
            </div>
            <IngredientList
              ingredients={ingredients}
              onChange={handleUpdateIngredient}
              onRemove={handleRemoveIngredient}
            />
            <button
              className="flex h-[42px] w-full items-center justify-center rounded-[8px] border border-dashed border-[#2AC1BC] bg-[#E6F8F7] text-[13px] font-semibold text-[#20A8A4] hover:bg-[#E6F8F7]"
              onClick={() => setModalMode("ingredient-add")}
              type="button"
            >
              + 재료 추가하기
            </button>
          </section>

          {/* Steps */}
          <section className="bg-white px-4 py-5 md:rounded-[16px] md:border md:border-[var(--line)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold leading-[1.3] text-[#212529]">
                조리법
              </h2>
              <button
                className="text-[13px] font-semibold text-[#20A8A4] disabled:opacity-40"
                disabled={isLoadingMethods}
                onClick={() => setModalMode("step-add")}
                type="button"
              >
                + 단계
              </button>
            </div>
            {isLoadingMethods ? (
              <p className="py-4 text-sm text-[#868E96]">
                조리방법 불러오는 중...
              </p>
            ) : (
              <>
                <StepList steps={steps} onRemove={handleRemoveStep} />
                <button
                  className="mt-3 hidden min-h-[44px] w-full items-center justify-center rounded-[8px] border border-[#2AC1BC] bg-white py-3 text-[13px] font-semibold text-[#20A8A4] hover:bg-[#E6F8F7] lg:flex"
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
              className="mx-4 rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-700 md:mx-0"
              role="alert"
            >
              {saveError}
            </div>
          )}

          <SaveRequirementsNotice requirements={saveRequirements} />
        </div>

        <div className="border-t border-[#DEE2E6] bg-white px-4 py-4 lg:hidden">
          <button
            className={[
              "flex min-h-[48px] w-full items-center justify-center rounded-[8px] text-[16px] font-bold",
              canSave && !isSaving
                ? "bg-[#2AC1BC] text-white"
                : "bg-[#DEE2E6] text-[#ADB5BD]",
            ].join(" ")}
            disabled={!canSave || isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "저장 중..." : "완료"}
          </button>
        </div>
      </div>
      <Wave1MobileBottomTab
        ariaLabel="직접 등록 화면 하단 탐색"
        currentTab="planner"
      />

      {/* Modals */}
      {modalMode === "ingredient-add" && (
        <RecipeIngredientAddModal
          onClose={() => setModalMode("none")}
          onAdd={handleAddIngredient}
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
