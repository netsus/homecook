"use client";

import Image from "next/image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { RecipeTagEditor } from "@/components/recipe/recipe-tag-editor";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import { groupCookingMethodsByCategory } from "@/lib/cooking-method-taxonomy";
import { COOKING_UNIT_OPTIONS } from "@/lib/recipe-units";
import {
  getRecipeEditorContextPolicy,
  isRecipeEditorDraftDirty,
  type RecipeEditorDraft,
  type RecipeEditorCleanupState,
  type RecipeEditorContext,
} from "@/lib/personal-recipe-editor";
import type {
  CookingMethodItem,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
} from "@/types/recipe";

interface RecipeEditorBaseServingsControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function RecipeEditorBaseServingsControl({
  value,
  onChange,
}: RecipeEditorBaseServingsControlProps) {
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
          className="flex h-11 w-11 items-center justify-center disabled:opacity-40"
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
          className="flex h-11 w-11 items-center justify-center"
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

export interface RecipeEditorIngredientRow extends ManualRecipeIngredientInput {
  tempId: string;
}

interface RecipeEditorIngredientListProps {
  ingredients: RecipeEditorIngredientRow[];
  showValidationError: boolean;
  onChange: (
    tempId: string,
    patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
  ) => void;
  onRemove: (tempId: string) => void;
}

export function RecipeEditorIngredientList({
  ingredients,
  showValidationError,
  onChange,
  onRemove,
}: RecipeEditorIngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <p
        className={[
          "mb-2 text-[12px] font-medium leading-[1.4]",
          showValidationError ? "text-[var(--danger)]" : "text-[var(--text-3)]",
        ].join(" ")}
      >
        재료를 1개 이상 추가해 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ingredient) => (
        <div
          key={ingredient.tempId}
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
        >
          <div className="grid grid-cols-[minmax(3.5rem,1fr)_4.25rem_auto_2.5rem] items-center gap-1.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                {ingredient.standard_name}
              </div>
            </div>
            <input
              aria-label={`${ingredient.standard_name} 수량`}
              className="h-11 min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-2 text-right text-[14px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              inputMode="decimal"
              min={0}
              onChange={(event) => {
                const value = event.target.value;
                onChange(ingredient.tempId, {
                  amount: value === "" ? 0 : Number(value),
                  unit: ingredient.unit ?? "g",
                });
              }}
              type="number"
              value={ingredient.amount ?? 0}
            />
            <div
              aria-label={`${ingredient.standard_name} 단위`}
              className="flex shrink-0 gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-0.5"
              role="group"
            >
              {COOKING_UNIT_OPTIONS.map((option) => (
                <button
                  key={option}
                  aria-label={`${ingredient.standard_name} ${option}`}
                  aria-pressed={(ingredient.unit ?? "g") === option}
                  className={[
                    "h-11 min-w-11 rounded-[var(--radius-sm)] px-1.5 text-[14px] font-semibold transition",
                    (ingredient.unit ?? "g") === option
                      ? "bg-[var(--brand)] text-[var(--text-inverse)]"
                      : "text-[var(--text-2)] hover:bg-[var(--surface)]",
                  ].join(" ")}
                  onClick={() =>
                    onChange(ingredient.tempId, {
                      amount: ingredient.amount ?? 0,
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
              aria-label={`${ingredient.standard_name} 삭제`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px] leading-none text-[var(--text-3)] hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]"
              onClick={() => onRemove(ingredient.tempId)}
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

export interface RecipeEditorStepRow
  extends Omit<ManualRecipeStepInput, "cooking_method_id"> {
  tempId: string;
  step_number: number;
  cooking_method: CookingMethodItem | null;
}

interface RecipeEditorStepListProps {
  steps: RecipeEditorStepRow[];
  showValidationError: boolean;
  onRemove: (tempId: string) => void;
}

export function RecipeEditorStepList({
  steps,
  showValidationError,
  onRemove,
}: RecipeEditorStepListProps) {
  if (steps.length === 0) {
    return (
      <p
        className={[
          "mb-2 text-[12px] font-medium leading-[1.4]",
          showValidationError ? "text-[var(--danger)]" : "text-[var(--text-3)]",
        ].join(" ")}
      >
        만들기를 추가해 주세요.
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
            borderLeft: `4px solid ${getCookingMethodColor(step.cooking_method)}`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {step.step_number}.
                </span>
                {step.cooking_method ? (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[var(--text-inverse)]"
                    style={{
                      backgroundColor: getCookingMethodColor(step.cooking_method),
                    }}
                  >
                    {step.cooking_method.label}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap break-words text-base text-[var(--foreground)]">
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

interface RecipeEditorStepComposerProps {
  cookingMethods: CookingMethodItem[];
  nextStepNumber: number;
  onAdd: (step: Omit<RecipeEditorStepRow, "tempId" | "step_number">) => void;
}

export function RecipeEditorStepComposer({
  cookingMethods,
  nextStepNumber,
  onAdd,
}: RecipeEditorStepComposerProps) {
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
    if (!instruction.trim()) {
      return;
    }

    if (!selectedMethod) {
      setMethodError("조리법을 선택해 주세요.");
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
    setSelectedMethodId("");
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
          조리방법을 먼저 골라 주세요
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
                  const color = getCookingMethodColor(method);
                  const isSelected = selectedMethod?.id === method.id;

                  return (
                    <button
                      key={method.id}
                      aria-pressed={isSelected}
                      className="h-11 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition"
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
          "mt-2 flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] text-[13px] font-semibold",
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

interface RecipeEditorImageSectionProps {
  variant: "desktop" | "mobile";
  imageStatus: "idle" | "uploading" | "uploaded" | "failed";
  imagePreviewUrl: string | null;
  imageError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReplace: () => void;
  onRemove: () => void;
  onRetry: () => void;
  actionsDisabled?: boolean;
}

export function RecipeEditorImageSection({
  variant,
  imageStatus,
  imagePreviewUrl,
  imageError,
  fileInputRef,
  onSelectFile,
  onReplace,
  onRemove,
  onRetry,
  actionsDisabled = false,
}: RecipeEditorImageSectionProps) {
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (imageStatus === "failed" && imageError) {
      errorRef.current?.focus();
    }
  }, [imageError, imageStatus]);

  if (variant === "desktop") {
    return (
      <section className="web-manual-section" data-testid="manual-image-upload-section-desktop">
        <div className="web-manual-section-head">
          <h2>이미지</h2>
          <span>선택사항</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="manual-image-file-input"
          onChange={onSelectFile}
        />
        {imageStatus === "idle" ? (
          <Button
            className="web-manual-add-button"
            onClick={() => fileInputRef.current?.click()}
            variant="secondary"
          >
            사진 선택
          </Button>
        ) : null}
        {imageStatus !== "idle" && imagePreviewUrl ? (
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
                <Button disabled={actionsDisabled} onClick={onReplace} variant="secondary">교체</Button>
                <Button disabled={actionsDisabled} onClick={onRemove} variant="secondary">제거</Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {imageStatus === "failed" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              className="web-menu-add-error"
              data-testid="manual-image-error"
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {imageError}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button disabled={actionsDisabled} onClick={onRetry}>다시 시도</Button>
              <Button disabled={actionsDisabled} onClick={onRemove} variant="secondary">제거</Button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="bg-[var(--surface)] px-4 pb-4 pt-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]"
      data-testid="manual-image-upload-section"
    >
      <h2 className="mb-3 text-[16px] font-bold leading-[1.3] text-[var(--foreground)]">
        이미지
      </h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="manual-image-file-input"
        onChange={onSelectFile}
      />
      {imageStatus === "idle" ? (
        <button
          className="flex h-[100px] w-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-fill)] text-[13px] text-[var(--text-3)]"
          data-testid="manual-image-choose-button"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          사진 선택 (선택사항)
        </button>
      ) : null}
      {imageStatus !== "idle" && imagePreviewUrl ? (
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
                className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-2)] disabled:opacity-50"
                data-testid="manual-image-replace-button"
                disabled={actionsDisabled}
                onClick={onReplace}
                type="button"
              >
                교체
              </button>
              <button
                className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-2)] disabled:opacity-50"
                data-testid="manual-image-remove-button"
                disabled={actionsDisabled}
                onClick={onRemove}
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
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            {imageError}
          </div>
          <div className="flex gap-2">
            <button
              className="min-h-11 flex-1 rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[13px] font-semibold text-[var(--text-inverse)] disabled:opacity-50"
              data-testid="manual-image-retry-button"
              disabled={actionsDisabled}
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
            <button
              className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-2)] disabled:opacity-50"
              data-testid="manual-image-remove-button"
              disabled={actionsDisabled}
              onClick={onRemove}
              type="button"
            >
              제거
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface RecipeEditorTagSectionProps {
  variant: "desktop" | "mobile";
  tagSubmitError: string | null;
  isLoading: boolean;
  onChange: (nextTags: string[]) => void;
  onRefreshSuggestions: () => void;
  suggestedTags: string[];
  suggestionErrorMessage: string | null;
  tags: string[];
}

export function RecipeEditorTagSection({
  variant,
  tagSubmitError,
  isLoading,
  onChange,
  onRefreshSuggestions,
  suggestedTags,
  suggestionErrorMessage,
  tags,
}: RecipeEditorTagSectionProps) {
  if (variant === "desktop") {
    return (
      <section className="web-manual-section">
        <div className="web-manual-section-head">
          <h2>태그</h2>
          <span>선택사항</span>
        </div>
        <RecipeTagEditor
          errorMessage={tagSubmitError}
          hideHeader
          isLoading={isLoading}
          onChange={onChange}
          onRefreshSuggestions={onRefreshSuggestions}
          suggestedTags={suggestedTags}
          suggestionErrorMessage={suggestionErrorMessage}
          tags={tags}
        />
      </section>
    );
  }

  return (
    <section className="bg-[var(--surface)] px-4 pb-4 pt-5 md:rounded-[var(--radius-panel)] md:border md:border-[var(--line)]">
      <RecipeTagEditor
        errorMessage={tagSubmitError}
        isLoading={isLoading}
        onChange={onChange}
        onRefreshSuggestions={onRefreshSuggestions}
        suggestedTags={suggestedTags}
        suggestionErrorMessage={suggestionErrorMessage}
        tags={tags}
      />
    </section>
  );
}

type RecipeEditorSubmitIntent =
  | "save-current"
  | "save-as-new"
  | "save-private";

interface PersonalRecipeEditorShellOptions {
  accessState: "ready" | "loading" | "unauthorized" | "not-found" | "read-only";
  context: RecipeEditorContext;
  initialDraft: RecipeEditorDraft;
  draft: RecipeEditorDraft;
  cleanupState: RecipeEditorCleanupState;
  onCancel: (
    destination: ReturnType<typeof getRecipeEditorContextPolicy>["cancelDestination"],
  ) => void;
  onDiscard: (
    destination: ReturnType<typeof getRecipeEditorContextPolicy>["cancelDestination"],
  ) => boolean | void | Promise<boolean | void>;
  onRetryCleanup: () => void;
  onSubmit: (intent: RecipeEditorSubmitIntent) => Promise<void>;
}

interface PersonalRecipeEditorShellProps
  extends PersonalRecipeEditorShellOptions {
  children: React.ReactNode;
}

interface RecipeEditorDiscardDialogProps {
  busy?: boolean;
  open: boolean;
  onDiscard: () => void;
  onStay: () => void;
}

export function RecipeEditorDiscardDialog({
  busy = false,
  open,
  onDiscard,
  onStay,
}: RecipeEditorDiscardDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const stayEditingButtonRef = useRef<HTMLButtonElement | null>(null);
  const immediateReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    immediateReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => {
      if (immediateReturnFocusRef.current?.isConnected) {
        immediateReturnFocusRef.current.focus();
      }
      immediateReturnFocusRef.current = null;
    };
  }, [open]);

  useDialogBoundary({
    active: open,
    dialogRef,
    initialFocusRef: stayEditingButtonRef,
    onClose: onStay,
  });

  if (!open) {
    return null;
  }

  return (
    <div
      aria-label="변경사항을 버릴까요?"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-40)] px-4"
      role="dialog"
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-lg"
        ref={dialogRef}
      >
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          변경사항을 버릴까요?
        </h2>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          저장하지 않은 내용은 사라집니다.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className="relative inline-flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--wave1-mint-contrast)] bg-transparent px-5 text-base font-bold text-[var(--wave1-mint-contrast)] transition-colors hover:bg-[var(--wave1-mint-soft)] hover:text-[var(--wave1-mint-contrast-deep)] hover:border-[var(--wave1-mint-contrast-deep)] active:bg-[var(--wave1-mint-soft)]"
            onClick={onStay}
            ref={stayEditingButtonRef}
            type="button"
          >
            계속 편집
          </button>
          <button
            className="relative inline-flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--wave1-red-contrast)] px-5 text-base font-bold text-[var(--wave1-surface)] transition-colors hover:bg-[var(--wave1-red-contrast-deep)] hover:shadow-[var(--wave1-shadow-deep)] active:bg-[var(--wave1-red-contrast-deep)]"
            disabled={busy}
            onClick={onDiscard}
            type="button"
          >
            {busy ? "이미지 정리 중..." : "변경사항 버리기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getShellTitle(context: RecipeEditorContext) {
  switch (context) {
    case "personal-edit":
      return "내 레시피 편집";
    case "public-fork":
      return "내 레시피로 수정";
    case "planner-add":
      return "플래너용 레시피 등록";
    case "personal-create":
      return "내 레시피 등록";
  }
}

function getPrimaryLabel(context: RecipeEditorContext, submitState: "idle" | "submitting") {
  if (submitState === "submitting") {
    return "저장 중...";
  }

  return context === "public-fork" ? "내 레시피로 저장" : "저장";
}

function isSubmitIntentAllowed(
  context: RecipeEditorContext,
  intent: RecipeEditorSubmitIntent,
) {
  if (context === "personal-edit") {
    return intent === "save-current" || intent === "save-as-new";
  }

  return intent === "save-private";
}

export function usePersonalRecipeEditorShell({
  accessState,
  context,
  initialDraft,
  draft,
  cleanupState,
  onCancel,
  onDiscard,
  onRetryCleanup,
  onSubmit,
}: PersonalRecipeEditorShellOptions) {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const policy = getRecipeEditorContextPolicy(context);
  const dirty = isRecipeEditorDraftDirty(initialDraft, draft);
  const isSubmitting = submitState === "submitting";
  const hasCleanupFailure = cleanupState === "failed";
  const hasCleanupBlocker = cleanupState === "failed" || cleanupState === "running";
  const submitLatchRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  const onDiscardRef = useRef(onDiscard);
  const onRetryCleanupRef = useRef(onRetryCleanup);
  const onSubmitRef = useRef(onSubmit);
  onCancelRef.current = onCancel;
  onDiscardRef.current = onDiscard;
  onRetryCleanupRef.current = onRetryCleanup;
  onSubmitRef.current = onSubmit;

  const actions = useMemo(() => {
    if (context === "personal-edit") {
      return [
        {
          intent: "save-current" as const,
          label: getPrimaryLabel(context, submitState),
          variant: "primary" as const,
        },
        {
          intent: "save-as-new" as const,
          label: "새 레시피로 저장",
          variant: "secondary" as const,
        },
      ];
    }

    return [
      {
        intent: "save-private" as const,
        label: getPrimaryLabel(context, submitState),
        variant: "primary" as const,
      },
    ];
  }, [context, submitState]);

  const requestCancel = useCallback(() => {
    if (hasCleanupBlocker || isSubmitting) {
      return;
    }

    if (dirty) {
      setIsDiscardDialogOpen(true);
      return;
    }

    onCancelRef.current(policy.cancelDestination);
  }, [dirty, hasCleanupBlocker, isSubmitting, policy.cancelDestination]);

  const submit = useCallback(async (intent: RecipeEditorSubmitIntent) => {
    if (
      submitLatchRef.current
      || hasCleanupBlocker
      || !isSubmitIntentAllowed(context, intent)
    ) {
      return;
    }

    submitLatchRef.current = true;
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      await onSubmitRef.current(intent);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.",
      );
    } finally {
      submitLatchRef.current = false;
      setSubmitState("idle");
    }
  }, [context, hasCleanupBlocker]);

  const discard = useCallback(async () => {
    if (hasCleanupBlocker || isSubmitting) {
      return;
    }

    const outcome = await onDiscardRef.current(policy.cancelDestination);
    if (outcome !== false) {
      setIsDiscardDialogOpen(false);
    }
  }, [hasCleanupBlocker, isSubmitting, policy.cancelDestination]);

  const stay = useCallback(() => {
    setIsDiscardDialogOpen(false);
  }, []);

  const openDiscardDialog = useCallback(() => {
    if (!hasCleanupBlocker && !isSubmitting) {
      setIsDiscardDialogOpen(true);
    }
  }, [hasCleanupBlocker, isSubmitting]);

  const retryCleanup = useCallback(() => {
    onRetryCleanupRef.current();
  }, []);

  return {
    accessState,
    actions,
    cleanupState,
    dirty,
    discard,
    hasCleanupFailure,
    isDiscardDialogOpen,
    isSubmitting,
    openDiscardDialog,
    policy,
    requestCancel,
    retryCleanup,
    stay,
    submit,
    submitError,
    submitState,
  };
}

export type PersonalRecipeEditorShellController = ReturnType<
  typeof usePersonalRecipeEditorShell
>;

interface IntegratedPersonalRecipeEditorShellProps {
  children: React.ReactNode;
  context: RecipeEditorContext;
  controller: PersonalRecipeEditorShellController;
  feedbackPlacement?: "before-content" | "consumer";
  presentation: "integrated";
}

export function PersonalRecipeEditorShell(
  props:
    | PersonalRecipeEditorShellProps
    | IntegratedPersonalRecipeEditorShellProps,
) {
  if ("controller" in props) {
    return (
      <IntegratedPersonalRecipeEditorShell
        context={props.context}
        controller={props.controller}
        feedbackPlacement={props.feedbackPlacement}
      >
        {props.children}
      </IntegratedPersonalRecipeEditorShell>
    );
  }

  return <PersonalRecipeEditorShellOwned {...props} />;
}

function IntegratedPersonalRecipeEditorShell({
  children,
  context,
  controller,
  feedbackPlacement = "before-content",
}: Omit<IntegratedPersonalRecipeEditorShellProps, "presentation">) {
  return (
    <section
      aria-label={getShellTitle(context)}
      data-editor-context={context}
    >
      {feedbackPlacement === "before-content" ? (
        <PersonalRecipeEditorShellFeedback controller={controller} />
      ) : null}
      {children}
    </section>
  );
}

export function PersonalRecipeEditorShellFeedback({
  controller,
}: {
  controller: PersonalRecipeEditorShellController;
}) {
  const submitErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (controller.submitError) {
      submitErrorRef.current?.focus();
    }
  }, [controller.submitError]);

  return (
    <>
      {controller.submitError ? (
        <div
          className="m-4 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,white)] p-3 text-sm text-[var(--foreground)] outline-none"
          ref={submitErrorRef}
          role="alert"
          tabIndex={-1}
        >
          {controller.submitError}
        </div>
      ) : null}
      {controller.hasCleanupFailure ? (
        <div
          className="m-4 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,white)] p-3 text-sm text-[var(--foreground)]"
          role="alert"
        >
          <p>이미지 정리를 완료하지 못했어요.</p>
          <div className="mt-3">
            <Button onClick={controller.retryCleanup} variant="secondary">
              정리 다시 시도
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PersonalRecipeEditorShellOwned(
  props: PersonalRecipeEditorShellProps,
) {
  const { children, context } = props;
  const shell = usePersonalRecipeEditorShell(props);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const submitErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shell.submitError) {
      submitErrorRef.current?.focus();
    }
  }, [shell.submitError]);

  if (shell.accessState !== "ready") {
    const message =
      shell.accessState === "loading"
        ? "편집 권한 확인 중..."
        : shell.accessState === "unauthorized"
          ? "로그인이 필요해요."
          : shell.accessState === "not-found"
            ? "레시피를 찾을 수 없어요."
            : "이 레시피는 읽기 전용이에요.";

    return (
      <section className="space-y-4">
        <h1 className="text-[22px] font-bold text-[var(--foreground)]">
          {getShellTitle(context)}
        </h1>
        <div
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]"
          role={shell.accessState === "loading" ? "status" : "alert"}
        >
          {message}
        </div>
        <Button
          fullWidth
          onClick={shell.requestCancel}
          variant="secondary"
        >
          돌아가기
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-[22px] font-bold text-[var(--foreground)]">
          {getShellTitle(context)}
        </h1>
        {shell.submitError ? (
          <div
            className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,white)] p-3 text-sm text-[var(--foreground)] outline-none"
            ref={submitErrorRef}
            role="alert"
            tabIndex={-1}
          >
            {shell.submitError}
          </div>
        ) : null}
        {shell.hasCleanupFailure ? (
          <div
            className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,white)] p-3 text-sm text-[var(--foreground)]"
            role="alert"
          >
            <p>이미지 정리를 완료하지 못했어요.</p>
            <div className="mt-3">
              <Button onClick={shell.retryCleanup} variant="secondary">
                정리 다시 시도
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <div>{children}</div>

      <div className="flex flex-col gap-3">
        <button
          className="relative inline-flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--wave1-mint-contrast)] bg-transparent px-5 text-base font-bold text-[var(--wave1-mint-contrast)] transition-colors hover:bg-[var(--wave1-mint-soft)] hover:text-[var(--wave1-mint-contrast-deep)] hover:border-[var(--wave1-mint-contrast-deep)] active:bg-[var(--wave1-mint-soft)]"
          disabled={shell.isSubmitting || shell.cleanupState !== "idle"}
          onClick={shell.requestCancel}
          ref={cancelButtonRef}
          type="button"
        >
          취소
        </button>
        {shell.actions.map((action) => (
          <Button
            disabled={shell.isSubmitting || shell.cleanupState !== "idle"}
            fullWidth
            key={action.intent}
            onClick={() => void shell.submit(action.intent)}
            variant={action.variant}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <RecipeEditorDiscardDialog
        busy={shell.cleanupState === "running" || shell.isSubmitting}
        onDiscard={() => void shell.discard()}
        onStay={shell.stay}
        open={shell.isDiscardDialogOpen}
      />
    </section>
  );
}
