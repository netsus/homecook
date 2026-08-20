"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  MealAddTargetBadge,
  formatMealAddTargetLabel,
} from "@/components/planner/meal-add-target-badge";
import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import {
  PersonalRecipeEditorShell,
  PersonalRecipeEditorShellFeedback,
  RecipeEditorBaseServingsControl,
  RecipeEditorDiscardDialog,
  RecipeEditorIngredientList,
  RecipeEditorImageSection,
  RecipeEditorStepComposer,
  RecipeEditorStepList,
  RecipeEditorTagSection,
  usePersonalRecipeEditorShell,
} from "@/components/recipe/personal-recipe-editor-shell";
import { Button } from "@/components/ui/button";
import { AppBackButton } from "@/components/shared/app-back-button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import {
  cancelRecipeImage,
  createManualRecipe,
  type RecipeImageUploadData,
  uploadRecipeImage,
} from "@/lib/api/manual-recipe";
import { createMealSafe } from "@/lib/api/meal";
import { suggestRecipeTags } from "@/lib/api/recipe";
import {
  cleanupRecipeEditorImage,
  createEmptyRecipeEditorDraft,
  createRecipeEditorImageDraft,
  type RecipeEditorDraft,
} from "@/lib/personal-recipe-editor";
import { buildReviewedRecipeTagsPayload } from "@/lib/recipe-tag-input";
import { compressRecipeImageFile } from "@/lib/recipe-image-compression";
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

const RECIPE_EDITOR_HISTORY_GUARD_KEY = "__homecookRecipeEditorGuard";

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

function isManagedRecipeImage(
  value: {
    image_object_id?: string;
    thumbnail_url?: string;
  } | null | undefined,
): value is {
  image_object_id: string;
  read_url: string;
} {
  return Boolean(value && typeof value.image_object_id === "string");
}

function isRetrySameKeyImageError(code: string | null) {
  return (
    code === "IMAGE_UPLOAD_IN_PROGRESS"
    || code === "NETWORK_ERROR"
  );
}

function isCreateImageError(code: string | null) {
  return (
    code === "IMAGE_NOT_FOUND"
    || code === "IMAGE_EXPIRED"
    || code === "IMAGE_VISIBILITY_MISMATCH"
    || code === "MANAGED_IMAGE_REFERENCE_REQUIRED"
  );
}

function formatUploadInProgressMessage(retryAfterSeconds: number) {
  return `이미지 업로드를 확인하는 중이에요. ${retryAfterSeconds}초 후 다시 시도해 주세요.`;
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
        <AppBackButton disabled={isDisabled} onClick={onBack} />
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
  const [isCreateOutcomeUnknown, setIsCreateOutcomeUnknown] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);
  const [createdRecipeTitle, setCreatedRecipeTitle] = useState<string>("");

  type UploadedRecipeImage = RecipeImageUploadData;
  type ImageUploadStatus = "idle" | "uploading" | "uploaded" | "failed";
  const [imageStatus, setImageStatus] = useState<ImageUploadStatus>("idle");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedRecipeImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageErrorCode, setImageErrorCode] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reviewedTags, setReviewedTags] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [areTagsDirty, setAreTagsDirty] = useState(false);
  const [tagSuggestionState, setTagSuggestionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [tagSuggestionError, setTagSuggestionError] = useState<string | null>(null);
  const [tagSubmitError, setTagSubmitError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadRequestIdRef = useRef(0);
  const tagSuggestionRequestIdRef = useRef(0);
  const areTagsDirtyRef = useRef(false);
  const pendingUploadIdempotencyKeyRef = useRef<string | null>(null);
  const processedUploadFileRef = useRef<File | null>(null);
  const isManagedReadUrlRefreshRetryRef = useRef(false);
  const uploadedImageRef = useRef<UploadedRecipeImage | null>(null);
  const createOwnedImageObjectIdRef = useRef<string | null>(null);
  const createOutcomeUnknownRef = useRef(false);
  const isMountedRef = useRef(true);
  const cleanupRetryActionRef = useRef<
    | { kind: "remove" }
    | { kind: "replace"; file: File }
    | null
  >(null);
  const cleanupInFlightImageObjectIdRef = useRef<string | null>(null);
  const cleanupCancelIntentRef = useRef<{
    imageObjectId: string;
    idempotencyKey: string;
  } | null>(null);
  const historyGuardActiveRef = useRef(false);
  const allowHistoryExitRef = useRef(false);
  const pendingHistoryExitRef = useRef<(() => void) | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const [imageCleanupState, setImageCleanupState] = useState<"idle" | "running" | "failed">("idle");

  // API data states
  const [cookingMethods, setCookingMethods] = useState<CookingMethodItem[]>(
    []
  );
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);

  // Meal add flow
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [mealAddError, setMealAddError] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktopViewport) {
      return;
    }

    const documentElement = document.documentElement;
    const previousDocumentHeight = documentElement.style.height;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousBodyHeight = document.body.style.height;
    const previousBodyInset = document.body.style.inset;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyWidth = document.body.style.width;

    documentElement.style.height = "100%";
    documentElement.style.overflow = "hidden";
    document.body.style.height = "100%";
    document.body.style.inset = "0";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";

    return () => {
      documentElement.style.height = previousDocumentHeight;
      documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.height = previousBodyHeight;
      document.body.style.inset = previousBodyInset;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.width = previousBodyWidth;
    };
  }, [isDesktopViewport]);

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
  const initialEditorDraftRef = useRef<RecipeEditorDraft>(
    createEmptyRecipeEditorDraft(),
  );
  const editorDraft = useMemo<RecipeEditorDraft>(() => ({
    title,
    baseServings,
    ingredients: ingredients.map((ingredient, index) => ({
      amount: ingredient.amount,
      draftId: ingredient.tempId,
      ingredientType: ingredient.ingredient_type,
      sortOrder: index + 1,
      source: {
        ingredientId: ingredient.ingredient_id || null,
        kind: "ingredient" as const,
      },
      standardName: ingredient.standard_name,
      unit: ingredient.unit,
    })),
    steps: steps.map((step, index) => ({
      cookingMethodId: step.cooking_method?.id ?? null,
      draftId: step.tempId,
      instruction: step.instruction,
      sortOrder: index + 1,
    })),
    tags: reviewedTags,
    image: isManagedRecipeImage(uploadedImage)
      ? createRecipeEditorImageDraft(uploadedImage)
      : {
          attachment: "unattached",
          imageObjectId: null,
          readUrl: imagePreviewUrl,
          readUrlExpiresAt: null,
          state: imageStatus,
        },
  }), [
    baseServings,
    imagePreviewUrl,
    imageStatus,
    ingredients,
    reviewedTags,
    steps,
    title,
    uploadedImage,
  ]);
  const isUploading =
    imageStatus === "uploading" || imageCleanupState === "running";
  const editorShell = usePersonalRecipeEditorShell({
    accessState: "ready",
    cleanupState: imageStatus === "uploading" ? "running" : imageCleanupState,
    context: "planner-add",
    draft: editorDraft,
    initialDraft: initialEditorDraftRef.current,
    onCancel: () => completeExit(),
    onDiscard: () => handleDiscardDraft(),
    onRetryCleanup: () => handleImageRetry(),
    onSubmit: async () => handleSave(),
  });
  const {
    dirty: hasDraftChanges,
    openDiscardDialog,
    requestCancel,
    stay,
  } = editorShell;
  const isImageLifecycleLocked = (
    isSaving
    || isCreateOutcomeUnknown
    || editorShell.isSubmitting
  );
  const openDiscardDialogRef = useRef(openDiscardDialog);
  openDiscardDialogRef.current = openDiscardDialog;

  const performExit = useCallback(() => {
    if (presentation === "embedded" && onRequestClose) {
      onRequestClose();
      return;
    }

    appReturn.goBack();
  }, [appReturn, onRequestClose, presentation]);

  const completeExit = useCallback(() => {
    if (historyGuardActiveRef.current) {
      pendingHistoryExitRef.current = performExit;
      allowHistoryExitRef.current = true;
      window.history.back();
      return;
    }

    performExit();
  }, [performExit]);

  const releaseHistoryGuard = useCallback((onReleased: () => void) => {
    if (historyGuardActiveRef.current) {
      pendingHistoryExitRef.current = onReleased;
      allowHistoryExitRef.current = true;
      window.history.back();
      return;
    }

    onReleased();
  }, []);

  const handleBack = useCallback(() => {
    if (imageStatus === "uploading" || createOutcomeUnknownRef.current) {
      return;
    }

    pendingNavigationRef.current = null;
    requestCancel();
  }, [imageStatus, requestCancel]);

  const requestAppNavigation = useCallback((
    href: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    if (
      editorShell.isSubmitting
      || editorShell.cleanupState !== "idle"
      || createOutcomeUnknownRef.current
    ) {
      event.preventDefault();
      return;
    }

    if (!hasDraftChanges) {
      return;
    }

    event.preventDefault();
    pendingNavigationRef.current = () => router.push(href);
    openDiscardDialog();
  }, [
    editorShell.cleanupState,
    editorShell.isSubmitting,
    hasDraftChanges,
    openDiscardDialog,
    router,
  ]);

  const handleStayEditing = useCallback(() => {
    pendingNavigationRef.current = null;
    stay();
  }, [stay]);

  useEffect(() => {
    if (!hasDraftChanges || historyGuardActiveRef.current) {
      return;
    }

    window.history.pushState(
      {
        ...(
          window.history.state && typeof window.history.state === "object"
            ? window.history.state
            : {}
        ),
        [RECIPE_EDITOR_HISTORY_GUARD_KEY]: true,
      },
      "",
      window.location.href,
    );
    historyGuardActiveRef.current = true;

    const handleHistoryBack = () => {
      if (!historyGuardActiveRef.current) {
        return;
      }

      if (allowHistoryExitRef.current) {
        historyGuardActiveRef.current = false;
        allowHistoryExitRef.current = false;
        const pendingExit = pendingHistoryExitRef.current;
        pendingHistoryExitRef.current = null;
        queueMicrotask(() => pendingExit?.());
        return;
      }

      window.history.pushState(
        {
          ...(
            window.history.state && typeof window.history.state === "object"
              ? window.history.state
              : {}
          ),
          [RECIPE_EDITOR_HISTORY_GUARD_KEY]: true,
        },
        "",
        window.location.href,
      );
      openDiscardDialogRef.current();
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", handleHistoryBack);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handleHistoryBack);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      pendingHistoryExitRef.current = null;
      allowHistoryExitRef.current = false;

      if (historyGuardActiveRef.current) {
        historyGuardActiveRef.current = false;
        const currentHistoryState = window.history.state;
        if (
          currentHistoryState &&
          typeof currentHistoryState === "object" &&
          RECIPE_EDITOR_HISTORY_GUARD_KEY in currentHistoryState
        ) {
          window.history.back();
        }
      }
    };
  }, [hasDraftChanges]);

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

  useEffect(() => {
    uploadedImageRef.current = uploadedImage;
  }, [uploadedImage]);

  const cancelManagedUploadBestEffort = useCallback((image: UploadedRecipeImage | null) => {
    if (
      !isManagedRecipeImage(image)
      || image.state === "attached_private"
      || image.state === "attached_public_shared"
    ) {
      return;
    }

    if (cleanupInFlightImageObjectIdRef.current === image.image_object_id) {
      return;
    }

    const existingIntent = cleanupCancelIntentRef.current;
    const idempotencyKey =
      existingIntent?.imageObjectId === image.image_object_id
        ? existingIntent.idempotencyKey
        : crypto.randomUUID();
    cleanupCancelIntentRef.current = {
      imageObjectId: image.image_object_id,
      idempotencyKey,
    };
    void Promise.resolve(
      cancelRecipeImage(image.image_object_id, { idempotencyKey }),
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const currentImage = uploadedImageRef.current;
      if (
        !currentImage
        || !isManagedRecipeImage(currentImage)
        || currentImage.image_object_id !== createOwnedImageObjectIdRef.current
      ) {
        cancelManagedUploadBestEffort(currentImage);
      }
    };
  }, [cancelManagedUploadBestEffort]);

  const revokePreviewUrl = useCallback((previewUrl: string | null) => {
    if (!previewUrl) return;
    try {
      URL.revokeObjectURL(previewUrl);
    } catch {
      return;
    }
  }, []);

  const clearImageSelection = useCallback(() => {
    uploadRequestIdRef.current += 1;
    isManagedReadUrlRefreshRetryRef.current = false;
    cleanupRetryActionRef.current = null;
    cleanupInFlightImageObjectIdRef.current = null;
    cleanupCancelIntentRef.current = null;
    uploadedImageRef.current = null;
    revokePreviewUrl(imagePreviewUrl);
    pendingUploadIdempotencyKeyRef.current = null;
    processedUploadFileRef.current = null;
    setImageCleanupState("idle");
    setImageStatus("idle");
    setImagePreviewUrl(null);
    setUploadedImage(null);
    setImageError(null);
    setImageErrorCode(null);
    setPendingFile(null);
  }, [imagePreviewUrl, revokePreviewUrl]);

  const failImageCleanup = useCallback((retryAction: { kind: "remove" } | { kind: "replace"; file: File }) => {
    cleanupRetryActionRef.current = retryAction;
    cleanupInFlightImageObjectIdRef.current = null;
    setImageCleanupState("failed");
    setImageStatus("failed");
    setImageErrorCode(null);
    setImageError("이미지 정리를 완료하지 못했어요. 다시 시도해 주세요.");
  }, []);

  const cleanupManagedImageForAction = useCallback(async (
    image: UploadedRecipeImage | null,
    retryAction: { kind: "remove" } | { kind: "replace"; file: File },
  ) => {
    if (!isManagedRecipeImage(image)) {
      cleanupRetryActionRef.current = null;
      setImageCleanupState("idle");
      return true;
    }

    if (cleanupInFlightImageObjectIdRef.current === image.image_object_id) {
      return false;
    }

    cleanupRetryActionRef.current = retryAction;
    cleanupInFlightImageObjectIdRef.current = image.image_object_id;
    setImageCleanupState("running");
    const existingIntent = cleanupCancelIntentRef.current;
    const idempotencyKey =
      existingIntent?.imageObjectId === image.image_object_id
        ? existingIntent.idempotencyKey
        : crypto.randomUUID();
    cleanupCancelIntentRef.current = {
      imageObjectId: image.image_object_id,
      idempotencyKey,
    };

    const cleanupResult = await cleanupRecipeEditorImage(
      createRecipeEditorImageDraft(image),
      {
        cancelOwnerUpload: async (imageObjectId, idempotencyKey) =>
          cancelRecipeImage(imageObjectId, { idempotencyKey }),
        idempotencyKey,
      },
    );

    if (cleanupResult !== "complete") {
      failImageCleanup(retryAction);
      return false;
    }

    cleanupRetryActionRef.current = null;
    cleanupInFlightImageObjectIdRef.current = null;
    cleanupCancelIntentRef.current = null;
    setImageCleanupState("idle");
    setImageError(null);
    setImageErrorCode(null);
    return true;
  }, [failImageCleanup]);

  const refreshManagedReadUrlIfExpired = useCallback(async () => {
    const currentImage = uploadedImageRef.current;
    const idempotencyKey = pendingUploadIdempotencyKeyRef.current;
    const replayFile = processedUploadFileRef.current;

    if (
      !isManagedRecipeImage(currentImage)
      || !idempotencyKey
      || !replayFile
    ) {
      return currentImage;
    }

    const expiresAt = Date.parse(currentImage.read_url_expires_at);
    if (Number.isNaN(expiresAt) || expiresAt > Date.now()) {
      return currentImage;
    }

    isManagedReadUrlRefreshRetryRef.current = false;
    setImageStatus("uploading");
    const result = await uploadRecipeImage(replayFile, { idempotencyKey });
    if (!result) {
      setImageStatus("failed");
      setImageErrorCode("INVALID_RESPONSE");
      setImageError("이미지를 다시 확인해 주세요.");
      return null;
    }
    if (result.success && result.data === null && "in_progress" in result) {
      isManagedReadUrlRefreshRetryRef.current = true;
      setImageStatus("failed");
      setImageErrorCode("IMAGE_UPLOAD_IN_PROGRESS");
      setImageError(formatUploadInProgressMessage(result.retry_after_seconds));
      return null;
    }

    if (!result.success || !result.data || !isManagedRecipeImage(result.data)) {
      isManagedReadUrlRefreshRetryRef.current = (
        !result.success && result.error?.code === "NETWORK_ERROR"
      );
      setImageStatus("failed");
      setImageErrorCode(result.success ? "INVALID_RESPONSE" : result.error?.code ?? null);
      setImageError(
        result.success
          ? "이미지를 다시 확인해 주세요."
          : result.error?.message ?? "이미지를 다시 확인해 주세요.",
      );
      return null;
    }

    isManagedReadUrlRefreshRetryRef.current = false;
    uploadedImageRef.current = result.data;
    setUploadedImage(result.data);
    setImagePreviewUrl(result.data.read_url);
    setImageStatus("uploaded");
    setImageError(null);
    setImageErrorCode(null);
    return result.data;
  }, []);

  const doUpload = useCallback(async (
    file: File,
    idempotencyKey: string,
    options?: {
      processedFile?: File;
      skipPreviousImageCleanup?: boolean;
    },
  ) => {
    const requestId = uploadRequestIdRef.current + 1;
    uploadRequestIdRef.current = requestId;
    const nextPreviewUrl = URL.createObjectURL(file);
    const previousUploadedImage = uploadedImageRef.current;

    isManagedReadUrlRefreshRetryRef.current = false;
    setImageCleanupState("idle");
    uploadedImageRef.current = null;
    if (!options?.skipPreviousImageCleanup) {
      cancelManagedUploadBestEffort(previousUploadedImage);
    }
    revokePreviewUrl(imagePreviewUrl);

    setImageStatus("uploading");
    setImageError(null);
    setImageErrorCode(null);
    setPendingFile(options?.processedFile ?? file);
    setUploadedImage(null);
    setImagePreviewUrl(nextPreviewUrl);

    const uploadFile = options?.processedFile ?? await compressRecipeImageFile(file);
    processedUploadFileRef.current = uploadFile;
    setPendingFile(uploadFile);

    if (!isMountedRef.current) {
      revokePreviewUrl(nextPreviewUrl);
      return;
    }

    if (uploadRequestIdRef.current !== requestId) {
      revokePreviewUrl(nextPreviewUrl);
      return;
    }

    const result = await uploadRecipeImage(uploadFile, { idempotencyKey });
    if (!result) {
      setImageStatus("failed");
      setImageErrorCode("INVALID_RESPONSE");
      setImageError("이미지를 업로드하지 못했어요.");
      return;
    }

    if (!isMountedRef.current) {
      revokePreviewUrl(nextPreviewUrl);
      if (result.success && result.data && isManagedRecipeImage(result.data)) {
        cancelManagedUploadBestEffort(result.data);
      }
      return;
    }

    if (uploadRequestIdRef.current !== requestId) {
      revokePreviewUrl(nextPreviewUrl);
      if (result.success && result.data && isManagedRecipeImage(result.data)) {
        cancelManagedUploadBestEffort(result.data);
      }
      return;
    }

    if (result.success && result.data === null && "in_progress" in result) {
      setImageStatus("failed");
      setImageErrorCode("IMAGE_UPLOAD_IN_PROGRESS");
      setImageError(formatUploadInProgressMessage(result.retry_after_seconds));
      return;
    }

    if (!result.success || !result.data) {
      setImageStatus("failed");
      setImageErrorCode(result.error?.code ?? null);
      setImageError(result.error?.message ?? "이미지를 업로드하지 못했어요.");
      return;
    }

    uploadedImageRef.current = result.data;
    setUploadedImage(result.data);
    setImageError(null);
    setImageErrorCode(null);
    revokePreviewUrl(nextPreviewUrl);
    if (isManagedRecipeImage(result.data)) {
      setImagePreviewUrl(result.data.read_url);
    } else {
      setImagePreviewUrl(result.data.thumbnail_url);
    }
    setImageStatus("uploaded");
    pendingUploadIdempotencyKeyRef.current = idempotencyKey;
  }, [
    cancelManagedUploadBestEffort,
    imagePreviewUrl,
    revokePreviewUrl,
  ]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const currentImage = uploadedImageRef.current;

    if (isManagedRecipeImage(currentImage)) {
      void (async () => {
        const cleaned = await cleanupManagedImageForAction(currentImage, {
          kind: "replace",
          file,
        });
        if (!cleaned) {
          return;
        }

        const idempotencyKey = crypto.randomUUID();
        pendingUploadIdempotencyKeyRef.current = idempotencyKey;
        void doUpload(file, idempotencyKey, {
          skipPreviousImageCleanup: true,
        });
      })();
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    pendingUploadIdempotencyKeyRef.current = idempotencyKey;
    void doUpload(file, idempotencyKey);
  }, [cleanupManagedImageForAction, doUpload]);

  const handleImageRetry = useCallback(() => {
    if (imageCleanupState === "failed") {
      const currentImage = uploadedImageRef.current;
      const retryAction = cleanupRetryActionRef.current;

      if (isManagedRecipeImage(currentImage) && retryAction) {
        void (async () => {
          const cleaned = await cleanupManagedImageForAction(currentImage, retryAction);
          if (!cleaned) {
            return;
          }

          if (retryAction.kind === "remove") {
            clearImageSelection();
            return;
          }

          const idempotencyKey = crypto.randomUUID();
          pendingUploadIdempotencyKeyRef.current = idempotencyKey;
          void doUpload(retryAction.file, idempotencyKey, {
            skipPreviousImageCleanup: true,
          });
        })();
        return;
      }
    }

    if (isManagedReadUrlRefreshRetryRef.current) {
      void refreshManagedReadUrlIfExpired();
      return;
    }

    const replayFile = processedUploadFileRef.current ?? pendingFile;
    if (replayFile) {
      const idempotencyKey = (
        isRetrySameKeyImageError(imageErrorCode)
        && pendingUploadIdempotencyKeyRef.current
      )
        ? pendingUploadIdempotencyKeyRef.current
        : crypto.randomUUID();
      pendingUploadIdempotencyKeyRef.current = idempotencyKey;
      void doUpload(replayFile, idempotencyKey, {
        processedFile: replayFile,
      });
    }
  }, [
    clearImageSelection,
    cleanupManagedImageForAction,
    doUpload,
    imageErrorCode,
    imageCleanupState,
    pendingFile,
    refreshManagedReadUrlIfExpired,
  ]);

  const handleImageRemove = useCallback(() => {
    const currentImage = uploadedImageRef.current;
    if (isManagedRecipeImage(currentImage)) {
      void (async () => {
        const cleaned = await cleanupManagedImageForAction(currentImage, {
          kind: "remove",
        });
        if (cleaned) {
          clearImageSelection();
        }
      })();
      return;
    }

    clearImageSelection();
  }, [clearImageSelection, cleanupManagedImageForAction]);

  const handleImageReplace = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleDiscardDraft = useCallback(async () => {
    if (cleanupInFlightImageObjectIdRef.current) {
      return false;
    }

    const currentImage = uploadedImageRef.current;
    if (isManagedRecipeImage(currentImage)) {
      const cleaned = await cleanupManagedImageForAction(currentImage, {
        kind: "remove",
      });
      if (!cleaned) {
        return false;
      }
      clearImageSelection();
    }

    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (pendingNavigation) {
      releaseHistoryGuard(pendingNavigation);
    } else {
      completeExit();
    }
    return true;
  }, [
    cleanupManagedImageForAction,
    clearImageSelection,
    completeExit,
    releaseHistoryGuard,
  ]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(imagePreviewUrl);
    };
  }, [imagePreviewUrl, revokePreviewUrl]);

  useEffect(() => {
    areTagsDirtyRef.current = areTagsDirty;
  }, [areTagsDirty]);

  const tagSuggestionInput = useMemo(() => {
    const trimmedTitle = title.trim();

    return {
      source_type: "manual" as const,
      title: trimmedTitle,
      base_servings: baseServings,
      ingredients: ingredients.map((ingredient) => ingredient.standard_name),
      steps: steps.map((step) => ({
        instruction: step.instruction,
      })),
      cooking_method_labels: steps
        .map((step) => step.cooking_method?.label)
        .filter((label): label is string => Boolean(label)),
    };
  }, [baseServings, ingredients, steps, title]);

  const canSuggestTags =
    tagSuggestionInput.title.length > 0 &&
    tagSuggestionInput.ingredients.length > 0 &&
    tagSuggestionInput.steps.length > 0;

  const loadTagSuggestions = useCallback(async () => {
    if (!canSuggestTags) {
      tagSuggestionRequestIdRef.current += 1;
      setSuggestedTags([]);
      setTagSuggestionState("idle");
      setTagSuggestionError(null);
      return;
    }

    const requestId = tagSuggestionRequestIdRef.current + 1;
    tagSuggestionRequestIdRef.current = requestId;
    setTagSuggestionState("loading");
    setTagSuggestionError(null);

    const response = await suggestRecipeTags(tagSuggestionInput);
    if (requestId !== tagSuggestionRequestIdRef.current) {
      return;
    }

    if (!response.success || !response.data) {
      setSuggestedTags([]);
      setTagSuggestionState("error");
      setTagSuggestionError("태그 추천을 불러오지 못했어요.");
      return;
    }

    const nextTags = response.data.tags;
    setSuggestedTags(nextTags);
    setTagSuggestionState("ready");
    setTagSuggestionError(null);
    if (!areTagsDirtyRef.current) {
      setReviewedTags(nextTags);
    }
  }, [canSuggestTags, tagSuggestionInput]);

  useEffect(() => {
    if (!canSuggestTags) {
      tagSuggestionRequestIdRef.current += 1;
      setSuggestedTags([]);
      setTagSuggestionState("idle");
      setTagSuggestionError(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadTagSuggestions();
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canSuggestTags, loadTagSuggestions]);

  const handleReviewedTagsChange = useCallback((nextTags: string[]) => {
    areTagsDirtyRef.current = true;
    setReviewedTags(nextTags);
    setAreTagsDirty(true);
    setTagSubmitError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (isUploading || createOutcomeUnknownRef.current) {
      return;
    }

    if (!canSave) {
      setShowValidationErrors(true);
      return;
    }

    setShowValidationErrors(false);
    setIsSaving(true);
    setImageError(null);
    setImageErrorCode(null);
    try {
      const activeImage = await refreshManagedReadUrlIfExpired();
      if (uploadedImageRef.current && !activeImage) {
        return;
      }

      const reviewedTagPayload = buildReviewedRecipeTagsPayload({
        isDirty: areTagsDirty,
        tags: reviewedTags,
      });
      const imagePayload = activeImage
        ? (
            isManagedRecipeImage(activeImage)
              ? { image_object_id: activeImage.image_object_id }
              : { thumbnail_url: activeImage.thumbnail_url }
          )
        : {};
      if (activeImage && isManagedRecipeImage(activeImage)) {
        createOwnedImageObjectIdRef.current = activeImage.image_object_id;
      }
      const response = await createManualRecipe({
        title: title.trim(),
        base_servings: baseServings,
        ...imagePayload,
        ...(reviewedTagPayload !== undefined ? { tags: reviewedTagPayload } : {}),
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

      const createSucceeded = Boolean(response?.success && response.data);
      const createOutcomeUnknown = Boolean(
        !response
        || (
          !response.success
          && (
            response.error?.code === "NETWORK_ERROR"
            || response.error?.code === "INVALID_RESPONSE"
          )
        )
      );
      const createFailedDefinitively = Boolean(
        response
        && !response.success
        && !createOutcomeUnknown
      );

      if (createSucceeded || createFailedDefinitively) {
        createOwnedImageObjectIdRef.current = null;
      }
      createOutcomeUnknownRef.current = createOutcomeUnknown;
      if (isMountedRef.current) {
        setIsCreateOutcomeUnknown(createOutcomeUnknown);
      }

      if (!isMountedRef.current) {
        if (createFailedDefinitively && activeImage) {
          cancelManagedUploadBestEffort(activeImage);
        }
        return;
      }

      if (!response) {
        throw new Error("저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.");
      }

      if (!response.success || !response.data) {
        if (response.error?.fields?.some((field) => field.field === "tags")) {
          setTagSubmitError(response.error.message);
        }
        if (isCreateImageError(response.error?.code ?? null)) {
          setImageStatus("failed");
          setImageErrorCode(response.error?.code ?? null);
          setImageError(response.error?.message ?? "이미지를 다시 확인해 주세요.");
          return;
        }
        throw new Error(
          response.error?.message
            ?? "저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.",
        );
      }

      const createdRecipe = response.data;
      isManagedReadUrlRefreshRetryRef.current = false;
      uploadedImageRef.current = null;
      pendingUploadIdempotencyKeyRef.current = null;
      processedUploadFileRef.current = null;
      setUploadedImage(null);
      releaseHistoryGuard(() => {
        initialEditorDraftRef.current = editorDraft;
        setCreatedRecipeId(createdRecipe.id);
        setCreatedRecipeTitle(createdRecipe.title);
        setModalMode("success");
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    isUploading,
    canSave,
    title,
    baseServings,
    areTagsDirty,
    reviewedTags,
    ingredients,
    steps,
    refreshManagedReadUrlIfExpired,
    cancelManagedUploadBestEffort,
    editorDraft,
    releaseHistoryGuard,
  ]);

  const handleMealAdd = useCallback(() => {
    if (!planDate || !columnId) {
      setMealAddError("끼니 추가 정보가 없어요. 플래너에서 다시 시도해 주세요.");
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
                요리 이름을 입력해 주세요.
              </span>
            ) : null}
          </label>
          <div className="web-manual-field web-manual-field-servings">
            <span>기준 수량</span>
            <RecipeEditorBaseServingsControl
              value={baseServings}
              onChange={setBaseServings}
            />
          </div>
        </div>
      </section>

      <RecipeEditorImageSection
        actionsDisabled={
          imageCleanupState === "running" || isImageLifecycleLocked
        }
        fileInputRef={imageInputRef}
        imageError={imageError}
        imagePreviewUrl={imagePreviewUrl}
        imageStatus={imageCleanupState === "failed" ? "uploaded" : imageStatus}
        onRemove={handleImageRemove}
        onReplace={handleImageReplace}
        onRetry={handleImageRetry}
        onSelectFile={handleImageSelect}
        variant="desktop"
      />

      <RecipeEditorTagSection
        isLoading={tagSuggestionState === "loading"}
        onChange={handleReviewedTagsChange}
        onRefreshSuggestions={() => void loadTagSuggestions()}
        suggestedTags={suggestedTags}
        suggestionErrorMessage={tagSuggestionError}
        tags={reviewedTags}
        tagSubmitError={tagSubmitError}
        variant="desktop"
      />

      <section className="web-manual-section">
        <div className="web-manual-section-head">
          <h2>재료</h2>
          <span>{ingredients.length}개 선택됨</span>
        </div>
        <RecipeEditorIngredientList
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
            <RecipeEditorStepList
              steps={steps}
              showValidationError={showValidationErrors}
              onRemove={handleRemoveStep}
            />
            <RecipeEditorStepComposer
              cookingMethods={cookingMethods}
              nextStepNumber={steps.length + 1}
              onAdd={handleAddStep}
            />
          </>
        )}
      </section>

    </>
  );
  const desktopManualFooter = (
    <div className="web-manual-footer">
      <WebButton
        className="web-manual-save-button"
        disabled={isImageLifecycleLocked || isUploading}
        fullWidth
        onClick={() => void editorShell.submit("save-private")}
        size="lg"
      >
        {isSaving ? "저장 중..." : "저장"}
      </WebButton>
    </div>
  );
  const desktopManualModals = (
    <>
      <RecipeEditorDiscardDialog
        busy={imageCleanupState === "running"}
        onDiscard={() => void editorShell.discard()}
        onStay={handleStayEditing}
        open={editorShell.isDiscardDialogOpen}
      />
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
        <PersonalRecipeEditorShell
          context="planner-add"
          controller={editorShell}
          presentation="integrated"
        >
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
        </PersonalRecipeEditorShell>
      );
    }

    return (
      <PersonalRecipeEditorShell
        context="planner-add"
        controller={editorShell}
        presentation="integrated"
      >
        <div className="web-menu-add-shell">
          <WebShell>
            <WebTopNav
              activeId="planner"
              onNavigate={requestAppNavigation}
            />
            <nav aria-label="직접 등록 경로" className="web-breadcrumb">
              <button
                className="web-breadcrumb-link"
                onClick={handleBack}
                type="button"
              >
                플래너
              </button>
              <span className="web-breadcrumb-sep">/</span>
              <span className="web-breadcrumb-link">{targetLabel}</span>
              <span className="web-breadcrumb-sep">/</span>
              <span className="web-breadcrumb-current">직접 등록</span>
            </nav>
            <div className="web-manual-head">
              <div>
                <p className="web-menu-add-eyebrow">직접 등록</p>
                <h1>새 레시피 직접 등록</h1>
                <p>요리 이름, 재료, 만들기를 입력해 저장해요.</p>
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
      </PersonalRecipeEditorShell>
    );
  }

  return (
    <PersonalRecipeEditorShell
      context="planner-add"
      controller={editorShell}
      feedbackPlacement="consumer"
      presentation="integrated"
    >
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-fill)] md:bg-[var(--background)]">
        <AppBar
          onBack={handleBack}
          onSave={() => void editorShell.submit("save-private")}
          isSaving={isSaving}
          isUploading={isUploading || isCreateOutcomeUnknown}
        />
        {editorShell.submitError || editorShell.hasCleanupFailure ? (
          <div
            className="shrink-0 bg-[var(--surface-fill)] md:bg-[var(--background)]"
            data-testid="manual-editor-feedback-region"
          >
            <div className="mx-auto max-w-2xl md:px-4">
              <PersonalRecipeEditorShellFeedback controller={editorShell} />
            </div>
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 scroll-pb-[96px] overflow-y-auto pb-[88px] md:px-4 md:pb-6 md:scroll-pb-6"
          data-testid="manual-editor-scroll-region"
        >
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
                  className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[14px] font-normal text-[var(--foreground)] placeholder:text-[var(--text-3)] focus:border-[var(--brand)] focus:outline-none"
                />
                {showValidationErrors && title.trim().length === 0 ? (
                  <span className="mt-1.5 block text-[12px] font-semibold leading-[1.4] text-[var(--danger)]">
                    요리 이름을 입력해 주세요.
                  </span>
                ) : null}
              </label>
              <div className="block max-w-[10.5rem]">
                <span className="mb-1.5 block text-[12px] font-medium leading-[1.4] text-[var(--text-3)]">
                  기준 인분
                </span>
                <RecipeEditorBaseServingsControl
                  value={baseServings}
                  onChange={setBaseServings}
                />
              </div>
            </div>
          </section>

          {/* Image Upload */}
          <RecipeEditorImageSection
            actionsDisabled={
              imageCleanupState === "running" || isImageLifecycleLocked
            }
            fileInputRef={imageInputRef}
            imageError={imageError}
            imagePreviewUrl={imagePreviewUrl}
            imageStatus={imageCleanupState === "failed" ? "uploaded" : imageStatus}
            onRemove={handleImageRemove}
            onReplace={handleImageReplace}
            onRetry={handleImageRetry}
            onSelectFile={handleImageSelect}
            variant="mobile"
          />

          <RecipeEditorTagSection
            isLoading={tagSuggestionState === "loading"}
            onChange={handleReviewedTagsChange}
            onRefreshSuggestions={() => void loadTagSuggestions()}
            suggestedTags={suggestedTags}
            suggestionErrorMessage={tagSuggestionError}
            tags={reviewedTags}
            tagSubmitError={tagSubmitError}
            variant="mobile"
          />

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
            <RecipeEditorIngredientList
              ingredients={ingredients}
              showValidationError={showValidationErrors}
              onChange={handleUpdateIngredient}
              onRemove={handleRemoveIngredient}
            />
            <button
              className="mt-2 flex h-11 w-fit items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
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
                <RecipeEditorStepList
                  steps={steps}
                  showValidationError={showValidationErrors}
                  onRemove={handleRemoveStep}
                />
                <RecipeEditorStepComposer
                  cookingMethods={cookingMethods}
                  nextStepNumber={steps.length + 1}
                  onAdd={handleAddStep}
                />
              </>
            )}
          </section>

        </div>
        </div>
        <Wave1MobileBottomTab
          ariaLabel="직접 등록 화면 하단 내비게이션"
          currentTab="planner"
          onTabClick={(_tabId, event) => {
            requestAppNavigation(
              event.currentTarget.getAttribute("href") ?? "/",
              event,
            );
          }}
        />

        {/* Modals */}
        <RecipeEditorDiscardDialog
          busy={imageCleanupState === "running"}
          onDiscard={() => void editorShell.discard()}
          onStay={handleStayEditing}
          open={editorShell.isDiscardDialogOpen}
        />
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
    </PersonalRecipeEditorShell>
  );
}
