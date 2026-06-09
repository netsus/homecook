"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  MealAddTargetBadge,
  formatMealAddTargetLabel,
} from "@/components/planner/meal-add-target-badge";
import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { Button } from "@/components/ui/button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { createManualRecipe, uploadRecipeImage } from "@/lib/api/manual-recipe";
import { createMealSafe } from "@/lib/api/meal";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import { groupCookingMethodsByCategory } from "@/lib/cooking-method-taxonomy";
import { compressRecipeImageFile } from "@/lib/recipe-image-compression";
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
  presentation?: "page" | "embedded";
  onRequestClose?: () => void;
  planDate: string;
  columnId: string;
  slotName: string;
}

type ModalMode =
  | "none"
  | "ingredient-add"
  | "success"
  | "servings-input";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

function formatTargetLabel(planDate: string, slotName: string) {
  return formatMealAddTargetLabel(planDate, slotName);
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
  if (steps.length === 0) requirements.push("만들기");

  return requirements;
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  isUploading?: boolean;
}

function AppBar({ onBack, onSave, isSaving, isUploading = false }: AppBarProps) {
  const isDisabled = isSaving || isUploading;

  return (
    <div className="shrink-0 border-b border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
          onClick={onBack}
          type="button"
          disabled={isDisabled}
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
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[var(--foreground)]">
          직접 등록
        </h1>
        <button
          className={[
            "h-[var(--control-height-md)] shrink-0 rounded-[var(--radius-control)] px-3 text-sm font-bold lg:px-4 lg:text-base",
            !isDisabled
              ? "bg-[var(--brand)] text-[var(--text-inverse)] shadow-[0_8px_18px_var(--brand-shadow-color)] hover:bg-[var(--brand-deep)]"
              : "cursor-not-allowed bg-[var(--surface-subtle)] text-[var(--text-4)]",
          ].join(" ")}
          onClick={onSave}
          disabled={isDisabled}
          type="button"
        >
          {isSaving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

interface BaseServingsStepperProps {
  value: number;
  onChange: (value: number) => void;
}

function BaseServingsStepper({ value, onChange }: BaseServingsStepperProps) {
  const updateValue = (nextValue: number) => {
    onChange(Math.max(1, nextValue));
  };

  return (
    <div
      aria-label="기준 인분 조절"
      className="inline-flex w-fit items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-2 py-1.5"
      role="group"
    >
      <div className="flex items-center gap-1.5">
        <button
          aria-label="기준 인분 줄이기"
          className="flex h-9 w-9 items-center justify-center disabled:opacity-40"
          disabled={value <= 1}
          onClick={() => updateValue(value - 1)}
          type="button"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-sm font-medium leading-none text-[var(--foreground)]">
            −
          </span>
        </button>
        <span
          aria-live="polite"
          className="min-w-11 text-center text-sm font-bold text-[var(--foreground)]"
        >
          {value}인분
        </span>
        <button
          aria-label="기준 인분 늘리기"
          className="flex h-9 w-9 items-center justify-center"
          onClick={() => updateValue(value + 1)}
          type="button"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold leading-none text-[var(--text-inverse)]">
            +
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient List ─────────────────────────────────────────────────────────

interface IngredientListProps {
  ingredients: TempIngredient[];
  showValidationError: boolean;
  onChange: (
    tempId: string,
    patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
  ) => void;
  onRemove: (tempId: string) => void;
}

function IngredientList({
  ingredients,
  showValidationError,
  onChange,
  onRemove,
}: IngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <p
        className={[
          "mb-2 text-[12px] font-medium leading-[1.4]",
          showValidationError ? "text-[var(--danger)]" : "text-[var(--text-3)]",
        ].join(" ")}
      >
        재료를 1개 이상 추가해주세요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ing) => (
        <div
          key={ing.tempId}
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
        >
          <div className="grid grid-cols-[minmax(3.5rem,1fr)_4.25rem_auto_2.5rem] items-center gap-1.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                {ing.standard_name}
              </div>
            </div>
            <input
              aria-label={`${ing.standard_name} 수량`}
              className="h-9 min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-2 text-right text-[14px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
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
              className="flex shrink-0 gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-0.5"
              role="group"
            >
              {COOKING_UNIT_OPTIONS.map((option) => (
                <button
                  aria-label={`${ing.standard_name} ${option}`}
                  aria-pressed={(ing.unit ?? "g") === option}
                  className={[
                    "h-9 min-w-9 rounded-[var(--radius-sm)] px-1.5 text-[14px] font-semibold transition",
                    (ing.unit ?? "g") === option
                      ? "bg-[var(--brand)] text-[var(--text-inverse)]"
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
            <button
              aria-label={`${ing.standard_name} 삭제`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px] leading-none text-[var(--text-3)] hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]"
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
  showValidationError: boolean;
  onRemove: (tempId: string) => void;
}

function StepList({ steps, showValidationError, onRemove }: StepListProps) {
  if (steps.length === 0) {
    return (
      <p
        className={[
          "mb-2 text-[12px] font-medium leading-[1.4]",
          showValidationError ? "text-[var(--danger)]" : "text-[var(--text-3)]",
        ].join(" ")}
      >
        만들기를 추가해주세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.tempId}
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4"
          style={{
            borderLeft: `4px solid ${getCookingMethodColor(step.cooking_method?.color_key)}`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {step.step_number}.
                </span>
                {step.cooking_method && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[var(--text-inverse)]"
                    style={{
                      backgroundColor: getCookingMethodColor(step.cooking_method.color_key),
                    }}
                  >
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
              className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center text-[var(--text-3)] hover:text-[var(--foreground)]"
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

// ─── Inline Step Composer ────────────────────────────────────────────────────

interface StepInlineComposerProps {
  onAdd: (step: Omit<TempStep, "tempId" | "step_number">) => void;
  cookingMethods: CookingMethodItem[];
  nextStepNumber: number;
}

function StepInlineComposer({
  onAdd,
  cookingMethods,
  nextStepNumber,
}: StepInlineComposerProps) {
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [methodError, setMethodError] = useState<string | null>(null);

  const selectedMethod =
    cookingMethods.find((method) => method.id === selectedMethodId) ?? null;
  const cookingMethodGroups = useMemo(
    () => groupCookingMethodsByCategory(cookingMethods),
    [cookingMethods],
  );

  const handleAdd = () => {
    if (!instruction.trim()) return;
    if (!selectedMethod) {
      setMethodError("조리방법을 선택해주세요.");
      return;
    }

    onAdd({
      instruction: instruction.trim(),
      cooking_method: selectedMethod,
      ingredients_used: [],
      heat_level: null,
      duration_seconds: null,
      duration_text: null,
    });
    setInstruction("");
    setMethodError(null);
  };

  return (
    <div
      className="mb-4 mt-3 scroll-mb-[120px] rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--surface)] p-3 md:mb-0"
      data-testid="manual-step-composer"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[var(--foreground)]">
          {nextStepNumber}단계 입력
        </span>
        <span className="text-[12px] font-medium text-[var(--text-3)]">
          조리방법을 먼저 골라주세요
        </span>
      </div>
      <div
        aria-label="조리방법 선택"
        className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-hide"
        role="group"
      >
        <div className="flex w-max gap-3">
          {cookingMethodGroups.map((group) => (
            <div className="shrink-0" key={group.label}>
              <p className="mb-1 px-1 text-[11px] font-bold text-[var(--text-3)]">
                {group.label}
              </p>
              <div className="flex gap-2">
                {group.items.map((method) => {
                  const color = getCookingMethodColor(method.color_key);
                  const isSelected = selectedMethod?.id === method.id;

                  return (
                    <button
                      key={method.id}
                      aria-pressed={isSelected}
                      className="h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition"
                      onClick={() => {
                        setSelectedMethodId(method.id);
                        setMethodError(null);
                      }}
                      style={{
                        backgroundColor: isSelected
                          ? color
                          : `color-mix(in srgb, ${color} 14%, transparent)`,
                        borderColor: color,
                        color: isSelected ? "var(--text-inverse)" : "var(--foreground)",
                      }}
                      type="button"
                    >
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <label className="mt-2 block">
        <span className="sr-only">만들기 설명</span>
        <textarea
          aria-label={`만들기 ${nextStepNumber} 설명`}
          className="min-h-[92px] w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-3 py-2.5 text-[14px] leading-[1.55] text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="만들기 설명을 입력하세요"
          rows={3}
          value={instruction}
        />
      </label>
      {methodError ? (
        <p className="mt-2 text-[12px] font-semibold text-[var(--danger)]">
          {methodError}
        </p>
      ) : null}
      <button
        className={[
          "mt-2 flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] text-[13px] font-semibold",
          selectedMethod && instruction.trim()
            ? "bg-[var(--brand)] text-[var(--text-inverse)]"
            : "bg-[var(--line-strong)] text-[var(--text-4)]",
        ].join(" ")}
        disabled={!instruction.trim()}
        onClick={handleAdd}
        type="button"
      >
        + 만들기 추가
      </button>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)] sm:items-center">
      <div className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]">
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
            className="mb-4 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)] sm:items-center">
      <div className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]">
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
            className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
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
  presentation = "page",
  onRequestClose,
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
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);
  const [createdRecipeTitle, setCreatedRecipeTitle] = useState<string>("");

  type ImageUploadStatus = "idle" | "uploading" | "uploaded" | "failed";
  const [imageStatus, setImageStatus] = useState<ImageUploadStatus>("idle");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedThumbnailUrl, setUploadedThumbnailUrl] = useState<string | null>(null);
  const [uploadedStoragePath, setUploadedStoragePath] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadRequestIdRef = useRef(0);
  const uploadedStoragePathRef = useRef<string | null>(null);
  const shouldCleanupUploadedImageRef = useRef(false);
  const isMountedRef = useRef(true);

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
    if (presentation === "embedded" && onRequestClose) {
      onRequestClose();
      return;
    }

    appReturn.goBack();
  }, [appReturn, onRequestClose, presentation]);

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

  const cleanupUploadedImage = useCallback((storagePath: string) => {
    const objectPath = storagePath.replace(/^recipe-images\//, "");
    try {
      void getSupabaseBrowserClient()
        .storage.from("recipe-images")
        .remove([objectPath])
        .catch(() => undefined);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    uploadedStoragePathRef.current = uploadedStoragePath;
  }, [uploadedStoragePath]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const storagePath = uploadedStoragePathRef.current;
      if (shouldCleanupUploadedImageRef.current && storagePath) {
        cleanupUploadedImage(storagePath);
      }
    };
  }, [cleanupUploadedImage]);

  const revokePreviewUrl = useCallback((previewUrl: string | null) => {
    if (!previewUrl) return;
    try {
      URL.revokeObjectURL(previewUrl);
    } catch {
      return;
    }
  }, []);

  const doUpload = useCallback(async (file: File) => {
    const requestId = uploadRequestIdRef.current + 1;
    uploadRequestIdRef.current = requestId;
    const nextPreviewUrl = URL.createObjectURL(file);

    if (uploadedStoragePath) {
      cleanupUploadedImage(uploadedStoragePath);
      shouldCleanupUploadedImageRef.current = false;
      uploadedStoragePathRef.current = null;
    }
    revokePreviewUrl(imagePreviewUrl);

    setImageStatus("uploading");
    setImageError(null);
    setPendingFile(file);
    setUploadedThumbnailUrl(null);
    setUploadedStoragePath(null);
    setImagePreviewUrl(nextPreviewUrl);

    const uploadFile = await compressRecipeImageFile(file);

    if (!isMountedRef.current) {
      revokePreviewUrl(nextPreviewUrl);
      return;
    }

    if (uploadRequestIdRef.current !== requestId) {
      revokePreviewUrl(nextPreviewUrl);
      return;
    }

    const result = await uploadRecipeImage(uploadFile);

    if (!isMountedRef.current) {
      revokePreviewUrl(nextPreviewUrl);
      if (result.success && result.data) {
        cleanupUploadedImage(result.data.storage_path);
      }
      return;
    }

    if (uploadRequestIdRef.current !== requestId) {
      revokePreviewUrl(nextPreviewUrl);
      if (result.success && result.data) {
        cleanupUploadedImage(result.data.storage_path);
      }
      return;
    }

    if (!result.success || !result.data) {
      shouldCleanupUploadedImageRef.current = false;
      uploadedStoragePathRef.current = null;
      setImageStatus("failed");
      setImageError(result.error?.message ?? "이미지를 업로드하지 못했어요.");
      return;
    }

    uploadedStoragePathRef.current = result.data.storage_path;
    shouldCleanupUploadedImageRef.current = true;
    setUploadedThumbnailUrl(result.data.thumbnail_url);
    setUploadedStoragePath(result.data.storage_path);
    setImageStatus("uploaded");
    setPendingFile(null);
  }, [
    cleanupUploadedImage,
    imagePreviewUrl,
    revokePreviewUrl,
    uploadedStoragePath,
  ]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    void doUpload(file);
  }, [doUpload]);

  const handleImageRetry = useCallback(() => {
    if (pendingFile) {
      void doUpload(pendingFile);
    }
  }, [doUpload, pendingFile]);

  const handleImageRemove = useCallback(() => {
    const storagePath = uploadedStoragePath ?? uploadedStoragePathRef.current;
    if (storagePath) {
      cleanupUploadedImage(storagePath);
    }
    revokePreviewUrl(imagePreviewUrl);
    shouldCleanupUploadedImageRef.current = false;
    uploadedStoragePathRef.current = null;
    setImageStatus("idle");
    setImagePreviewUrl(null);
    setUploadedThumbnailUrl(null);
    setUploadedStoragePath(null);
    setImageError(null);
    setPendingFile(null);
  }, [cleanupUploadedImage, imagePreviewUrl, revokePreviewUrl, uploadedStoragePath]);

  const handleImageReplace = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewUrl(imagePreviewUrl);
    };
  }, [imagePreviewUrl, revokePreviewUrl]);

  const isUploading = imageStatus === "uploading";

  const handleSave = useCallback(async () => {
    if (isUploading) {
      return;
    }

    if (!canSave) {
      setShowValidationErrors(true);
      setSaveError(null);
      return;
    }

    setShowValidationErrors(false);
    setIsSaving(true);
    setSaveError(null);

    const response = await createManualRecipe({
      title: title.trim(),
      base_servings: baseServings,
      thumbnail_url: uploadedThumbnailUrl ?? undefined,
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
    shouldCleanupUploadedImageRef.current = false;
    setModalMode("success");
    setIsSaving(false);
  }, [isUploading, canSave, title, baseServings, uploadedThumbnailUrl, ingredients, steps]);

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
  const desktopManualBody = (
    <>
      <section className="web-manual-section">
        <div className="web-manual-section-head">
          <h2>기본 정보</h2>
        </div>
        <div className="web-manual-fields">
          <label className="web-manual-field web-manual-field-wide">
            <span>요리 이름</span>
            <input
              aria-label="요리 이름"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 김치찌개"
              type="text"
              value={title}
            />
            {showValidationErrors && title.trim().length === 0 ? (
              <span className="text-[12px] font-semibold text-[var(--danger)]">
                요리 이름을 입력해주세요.
              </span>
            ) : null}
          </label>
          <div className="web-manual-field web-manual-field-servings">
            <span>기준 수량</span>
            <BaseServingsStepper
              value={baseServings}
              onChange={setBaseServings}
            />
          </div>
        </div>
      </section>

      <section className="web-manual-section" data-testid="manual-image-upload-section-desktop">
        <div className="web-manual-section-head">
          <h2>이미지</h2>
          <span>선택사항</span>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="manual-image-file-input"
          onChange={handleImageSelect}
        />
        {imageStatus === "idle" ? (
          <WebButton
            className="web-manual-add-button"
            onClick={() => imageInputRef.current?.click()}
            variant="secondary"
          >
            사진 선택
          </WebButton>
        ) : null}
        {(imageStatus === "uploading" || imageStatus === "uploaded") && imagePreviewUrl ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", borderRadius: "var(--radius-card)", background: "var(--surface-fill)" }}
              data-testid="manual-image-preview"
            >
              <Image
                src={imagePreviewUrl}
                alt="레시피 이미지 미리보기"
                fill
                className="object-cover"
                sizes="(min-width: 768px) 42rem, 100vw"
                unoptimized
              />
              {imageStatus === "uploading" ? (
                <div
                  style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--overlay-30)" }}
                  data-testid="manual-image-uploading-indicator"
                >
                  <span style={{ color: "var(--text-inverse)", fontSize: "13px", fontWeight: 600 }}>업로드 중...</span>
                </div>
              ) : null}
            </div>
            {imageStatus === "uploaded" ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <WebButton onClick={handleImageReplace} variant="secondary">교체</WebButton>
                <WebButton onClick={handleImageRemove} variant="secondary">제거</WebButton>
              </div>
            ) : null}
          </div>
        ) : null}
        {imageStatus === "failed" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="web-menu-add-error" role="alert" data-testid="manual-image-error">
              {imageError}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <WebButton onClick={handleImageRetry}>다시 시도</WebButton>
              <WebButton onClick={handleImageRemove} variant="secondary">제거</WebButton>
            </div>
          </div>
        ) : null}
      </section>

      <section className="web-manual-section">
        <div className="web-manual-section-head">
          <h2>재료</h2>
          <span>{ingredients.length}개 선택됨</span>
        </div>
        <IngredientList
          ingredients={ingredients}
          showValidationError={showValidationErrors}
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
          <h2>만들기</h2>
          <span>{steps.length}단계</span>
        </div>
        {isLoadingMethods ? (
          <p className="web-picker-subtle">조리방법 불러오는 중...</p>
        ) : (
          <>
            <StepList
              steps={steps}
              showValidationError={showValidationErrors}
              onRemove={handleRemoveStep}
            />
            <StepInlineComposer
              cookingMethods={cookingMethods}
              nextStepNumber={steps.length + 1}
              onAdd={handleAddStep}
            />
          </>
        )}
      </section>

      {saveError ? (
        <div className="web-menu-add-error" role="alert">
          {saveError}
        </div>
      ) : null}
    </>
  );
  const desktopManualFooter = (
    <div className="web-manual-footer">
      <WebButton
        className="web-manual-save-button"
        disabled={isSaving || isUploading}
        fullWidth
        onClick={handleSave}
        size="lg"
      >
        {isSaving ? "저장 중..." : "저장"}
      </WebButton>
    </div>
  );
  const desktopManualModals = (
    <>
      {modalMode === "ingredient-add" && (
        <RecipeIngredientAddModal
          onClose={() => setModalMode("none")}
          onAdd={handleAddIngredient}
          presentation="web"
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
    </>
  );

  if (isDesktopViewport) {
    if (presentation === "embedded") {
      return (
        <div
          className="web-menu-add-embedded web-menu-add-embedded-manual"
          data-testid="manual-recipe-embedded"
        >
          <div className="web-menu-add-embedded-form">
            {desktopManualBody}
            {desktopManualFooter}
          </div>

          {desktopManualModals}
        </div>
      );
    }

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
            <span className="web-breadcrumb-current">직접 등록</span>
          </nav>
          <div className="web-manual-head">
            <div>
              <p className="web-menu-add-eyebrow">직접 등록</p>
              <h1>새 레시피를 직접 등록해요</h1>
              <p>기본 정보, 재료, 만들기를 입력한 뒤 플래너에 바로 추가할 수 있어요.</p>
            </div>
            <div className="web-manual-actions">
              <WebButton onClick={handleBack} variant="secondary">
                취소
              </WebButton>
            </div>
          </div>

          <WebCard className="web-manual-card">
            {desktopManualBody}
            {desktopManualFooter}
          </WebCard>
        </WebShell>

        {desktopManualModals}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-fill)] md:bg-[var(--background)]">
      <AppBar
        onBack={handleBack}
        onSave={handleSave}
        isSaving={isSaving}
        isUploading={isUploading}
      />
      <div className="min-h-0 flex-1 scroll-pb-[96px] overflow-y-auto pb-[88px] md:px-4 md:pb-6 md:scroll-pb-6">
        <div className="mx-auto max-w-2xl space-y-2 md:space-y-6 md:py-4">
          {planDate || slotName ? (
            <div className="bg-[var(--surface)] px-4 pt-4 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]">
              <MealAddTargetBadge
                className="min-h-8"
                label={targetLabel}
                testId="manual-mobile-target-tag"
              />
            </div>
          ) : null}

          {/* Basic Info */}
          <section className="bg-[var(--surface)] px-4 pb-4 pt-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]">
            <h2 className="mb-3 text-[16px] font-bold leading-[1.3] text-[var(--foreground)]">
              기본 정보
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium leading-[1.4] text-[var(--text-3)]">
                  요리 이름
                </span>
                <input
                  type="text"
                  placeholder="예: 김치찌개"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[14px] font-normal text-[var(--foreground)] placeholder:text-[var(--text-3)] focus:border-[var(--brand)] focus:outline-none"
                />
                {showValidationErrors && title.trim().length === 0 ? (
                  <span className="mt-1.5 block text-[12px] font-semibold leading-[1.4] text-[var(--danger)]">
                    요리 이름을 입력해주세요.
                  </span>
                ) : null}
              </label>
              <div className="block max-w-[10.5rem]">
                <span className="mb-1.5 block text-[12px] font-medium leading-[1.4] text-[var(--text-3)]">
                  기준 인분
                </span>
                <BaseServingsStepper
                  value={baseServings}
                  onChange={setBaseServings}
                />
              </div>
            </div>
          </section>

          {/* Image Upload */}
          <section
            className="bg-[var(--surface)] px-4 pb-4 pt-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]"
            data-testid="manual-image-upload-section"
          >
            <h2 className="mb-3 text-[16px] font-bold leading-[1.3] text-[var(--foreground)]">
              이미지
            </h2>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-testid="manual-image-file-input"
              onChange={handleImageSelect}
            />
            {imageStatus === "idle" ? (
              <button
                className="flex h-[100px] w-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-fill)] text-[13px] text-[var(--text-3)]"
                data-testid="manual-image-choose-button"
                onClick={() => imageInputRef.current?.click()}
                type="button"
              >
                사진 선택 (선택사항)
              </button>
            ) : null}
            {(imageStatus === "uploading" || imageStatus === "uploaded") && imagePreviewUrl ? (
              <div className="space-y-2">
                <div
                  className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-fill)]"
                  data-testid="manual-image-preview"
                >
                  <Image
                    src={imagePreviewUrl}
                    alt="레시피 이미지 미리보기"
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 42rem, 100vw"
                    unoptimized
                  />
                  {imageStatus === "uploading" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--overlay-30)]">
                      <span className="text-[13px] font-semibold text-[var(--text-inverse)]" data-testid="manual-image-uploading-indicator">
                        업로드 중...
                      </span>
                    </div>
                  ) : null}
                </div>
                {imageStatus === "uploaded" ? (
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] py-2 text-[13px] font-medium text-[var(--text-2)]"
                      data-testid="manual-image-replace-button"
                      onClick={handleImageReplace}
                      type="button"
                    >
                      교체
                    </button>
                    <button
                      className="flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] py-2 text-[13px] font-medium text-[var(--text-2)]"
                      data-testid="manual-image-remove-button"
                      onClick={handleImageRemove}
                      type="button"
                    >
                      제거
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {imageStatus === "failed" ? (
              <div className="space-y-2">
                <div
                  className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-[13px] text-[var(--danger)]"
                  data-testid="manual-image-error"
                  role="alert"
                >
                  {imageError}
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-[var(--radius-control)] bg-[var(--brand)] py-2 text-[13px] font-semibold text-[var(--text-inverse)]"
                    data-testid="manual-image-retry-button"
                    onClick={handleImageRetry}
                    type="button"
                  >
                    다시 시도
                  </button>
                  <button
                    className="flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] py-2 text-[13px] font-medium text-[var(--text-2)]"
                    data-testid="manual-image-remove-button"
                    onClick={handleImageRemove}
                    type="button"
                  >
                    제거
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Ingredients */}
          <section className="bg-[var(--surface)] px-4 pb-4 pt-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[16px] font-bold leading-[1.3] text-[var(--foreground)]">
                재료
              </h2>
              <span className="text-[12px] font-medium text-[var(--text-3)]">
                {ingredients.length}개 선택됨
              </span>
            </div>
            <IngredientList
              ingredients={ingredients}
              showValidationError={showValidationErrors}
              onChange={handleUpdateIngredient}
              onRemove={handleRemoveIngredient}
            />
            <button
              className="mt-2 flex h-[42px] w-fit items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              onClick={() => setModalMode("ingredient-add")}
              type="button"
            >
              + 재료 추가하기
            </button>
          </section>

          {/* Steps */}
          <section className="bg-[var(--surface)] px-4 py-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[16px] font-bold leading-[1.3] text-[var(--foreground)]">
                만들기
              </h2>
              <span className="text-[12px] font-medium text-[var(--text-3)]">
                {steps.length}단계
              </span>
            </div>
            {isLoadingMethods ? (
              <p className="py-4 text-sm text-[var(--text-3)]">
                조리방법 불러오는 중...
              </p>
            ) : (
              <>
                <StepList
                  steps={steps}
                  showValidationError={showValidationErrors}
                  onRemove={handleRemoveStep}
                />
                <StepInlineComposer
                  cookingMethods={cookingMethods}
                  nextStepNumber={steps.length + 1}
                  onAdd={handleAddStep}
                />
              </>
            )}
          </section>

          {saveError && (
            <div
              className="mx-4 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)] md:mx-0"
              role="alert"
            >
              {saveError}
            </div>
          )}
        </div>

      </div>
      <Wave1MobileBottomTab
        ariaLabel="직접 등록 화면 하단 내비게이션"
        currentTab="planner"
      />

      {/* Modals */}
      {modalMode === "ingredient-add" && (
        <RecipeIngredientAddModal
          onClose={() => setModalMode("none")}
          onAdd={handleAddIngredient}
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
