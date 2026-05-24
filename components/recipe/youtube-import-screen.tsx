"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { Button } from "@/components/ui/button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { AppBackButton } from "@/components/shared/app-back-button";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebCard,
  WebShell,
  WebTopNav,
} from "@/components/web";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import {
  validateYoutubeUrl,
  extractYoutubeRecipe,
  registerYoutubeRecipe,
  registerYoutubeIngredient,
} from "@/lib/api/youtube-import";
import { createMealSafe } from "@/lib/api/meal";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import { COOKING_UNIT_OPTIONS } from "@/lib/recipe-units";
import { YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON } from "@/lib/youtube-import-constants";
import type {
  CookingMethodItem,
  IngredientCategory,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
  YoutubeIngredientCandidate,
  YoutubeRecipeClassificationStatus,
  YoutubeVideoInfo,
  YoutubeExtractedIngredient,
  YoutubeExtractedStep,
} from "@/types/recipe";

// ─── Types ────────────────────────────────────────────────────────────────────

interface YoutubeImportScreenProps {
  initialYoutubeUrl?: string;
  onRequestClose?: () => void;
  planDate: string;
  columnId: string;
  presentation?: "screen" | "embedded";
  slotName: string;
}

type Step = "url-input" | "preview" | "non-recipe-warning" | "extracting" | "review" | "complete";

type ModalMode =
  | "none"
  | "ingredient-add"
  | "ingredient-edit"
  | "ingredient-register"
  | "step-add"
  | "step-edit"
  | "servings-input"
  | "register-error"
  | "confirm-back";

interface TempIngredient extends ManualRecipeIngredientInput {
  tempId: string;
  draft_ingredient_id?: string;
  confidence: number | null;
  resolution_status?: YoutubeExtractedIngredient["resolution_status"];
  candidates?: YoutubeExtractedIngredient["candidates"];
  raw_text?: string;
}

function formatIngredientDisplayText(ingredient: ManualRecipeIngredientInput) {
  if (ingredient.ingredient_type !== "QUANT") {
    return `${ingredient.standard_name} 약간`;
  }

  const amount = ingredient.amount ?? 0;
  const unit = ingredient.unit ?? "g";
  return `${ingredient.standard_name} ${amount}${unit}`;
}

function getIngredientUnitOptions(unit: string | null) {
  const currentUnit = unit?.trim();
  const baseOptions = [...COOKING_UNIT_OPTIONS];

  return currentUnit && !baseOptions.includes(currentUnit as (typeof COOKING_UNIT_OPTIONS)[number])
    ? [...baseOptions, currentUnit]
    : baseOptions;
}

function normalizeIngredient(ingredient: TempIngredient): TempIngredient {
  const amount =
    typeof ingredient.amount === "number" && ingredient.amount > 0
      ? ingredient.amount
      : 100;
  const unit = ingredient.unit ?? "g";

  return {
    ...ingredient,
    ingredient_type: "QUANT",
    amount,
    unit,
    display_text: formatIngredientDisplayText({
      ...ingredient,
      ingredient_type: "QUANT",
      amount,
      unit,
    }),
  };
}

interface TempStep extends Omit<ManualRecipeStepInput, "cooking_method_id"> {
  tempId: string;
  cooking_method: (CookingMethodItem & { is_new?: boolean }) | null;
  is_incomplete?: boolean;
  missing_fields?: YoutubeExtractedStep["missing_fields"];
  raw_text?: string;
}

function getYoutubeRegisterRequirements({
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

  if (title.trim().length === 0) requirements.push("레시피명");
  if (baseServings < 1) requirements.push("기본 인분");
  if (ingredients.length === 0) requirements.push("재료");
  if (steps.length === 0) requirements.push("조리 과정");
  if (ingredients.some((ingredient) => !isIngredientReadyForRegister(ingredient))) {
    requirements.push("확인 필요한 재료");
  }
  if (steps.some((step) => !isStepReadyForRegister(step))) {
    requirements.push("필수 조리 과정");
  }

  return requirements;
}

const STEP_FIELD_LABELS: Record<
  NonNullable<YoutubeExtractedStep["missing_fields"]>[number],
  string
> = {
  instruction: "조리 설명",
  cooking_method: "조리방법",
  duration: "시간",
  ingredients_used: "사용 재료",
};

const STEP_BLOCKING_FIELDS = new Set(["instruction", "cooking_method"]);

function isIngredientReadyForRegister(ingredient: TempIngredient) {
  const hasResolvedIngredient =
    typeof ingredient.ingredient_id === "string" &&
    ingredient.ingredient_id.trim().length > 0 &&
    (ingredient.resolution_status === undefined || ingredient.resolution_status === "resolved");

  if (!hasResolvedIngredient) {
    return false;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return true;
  }

  return (
    typeof ingredient.amount === "number" &&
    ingredient.amount > 0 &&
    typeof ingredient.unit === "string" &&
    ingredient.unit.trim().length > 0
  );
}

function getIngredientResolutionLabel(ingredient: TempIngredient) {
  if (ingredient.resolution_status === "needs_review") {
    return "확인이 필요한 재료";
  }

  if (ingredient.resolution_status === "unresolved") {
    return "재료를 찾지 못했어요";
  }

  return null;
}

function getIngredientName(ingredient: TempIngredient) {
  return ingredient.standard_name || ingredient.raw_text || "확인할 재료";
}

function getStepBlockingFields(step: TempStep) {
  const missingFields = step.missing_fields ?? [];

  return missingFields.filter((field) => STEP_BLOCKING_FIELDS.has(field));
}

function getStepWarningFields(step: TempStep) {
  const missingFields = step.missing_fields ?? [];

  return missingFields.filter((field) => !STEP_BLOCKING_FIELDS.has(field));
}

function isStepReadyForRegister(step: TempStep) {
  return (
    step.instruction.trim().length > 0 &&
    Boolean(step.cooking_method?.id) &&
    getStepBlockingFields(step).length === 0
  );
}

function formatStepFieldList(fields: NonNullable<YoutubeExtractedStep["missing_fields"]>) {
  return fields.map((field) => STEP_FIELD_LABELS[field]).join(", ");
}

function formatYoutubeBlockingIssue(issue: string) {
  if (issue === "ingredients") {
    return "재료를 하나 이상 추가해주세요.";
  }

  if (issue === "steps") {
    return "조리 과정을 하나 이상 추가해주세요.";
  }

  const ingredientMatch = issue.match(/^ingredients\[(\d+)\]\.ingredient_id$/u);
  if (ingredientMatch) {
    return `${Number(ingredientMatch[1]) + 1}번째 재료를 검색해서 확정해주세요.`;
  }

  const stepInstructionMatch = issue.match(/^steps\[(\d+)\]\.instruction$/u);
  if (stepInstructionMatch) {
    return `${Number(stepInstructionMatch[1]) + 1}번째 조리 설명을 입력해주세요.`;
  }

  return issue;
}

function getApiErrorMessage(defaultMessage: string, message?: string | null) {
  return message?.trim() || defaultMessage;
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

const YOUTUBE_STEP_LABELS = [
  { id: "url-input", label: "링크 입력" },
  { id: "preview", label: "미리보기" },
  { id: "extracting", label: "분석" },
  { id: "review", label: "검토" },
  { id: "complete", label: "완료" },
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

function getYoutubeStepIndex(step: Step) {
  if (step === "preview") return 1;
  if (step === "non-recipe-warning") return 2;
  if (step === "extracting") return 2;
  if (step === "review") return 3;
  if (step === "complete") return 4;
  return 0;
}

// ─── AppBar ───────────────────────────────────────────────────────────────────

interface AppBarProps {
  step: Step;
  onBack: () => void;
  onRegister?: () => void;
  canRegister?: boolean;
  isRegistering?: boolean;
}

function AppBar({ step, onBack, onRegister, canRegister, isRegistering }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-white">
      <div className="flex h-14 items-center gap-2 px-2">
        {step !== "complete" && (
          <AppBackButton
            ariaLabel="뒤로 가기"
            disabled={isRegistering}
            onClick={onBack}
          />
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-[var(--foreground)]">
          {step === "review" ? "추출 결과 확인" : "유튜브에서 가져오기"}
        </h1>
        {step === "review" && (
          <button
            className={[
              "h-[var(--control-height-md)] rounded-[var(--radius-sm)] px-4 text-base font-semibold",
              canRegister && !isRegistering
                ? "bg-[var(--wave1-mint-contrast)] text-white shadow-[var(--wave1-shadow-soft)] hover:bg-[var(--wave1-mint-contrast-deep)]"
                : "cursor-not-allowed bg-[#DEE2E6] text-[#ADB5BD]",
            ].join(" ")}
            onClick={onRegister}
            disabled={!canRegister || isRegistering}
            type="button"
          >
            {isRegistering ? "등록 중..." : "등록"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: URL Input ────────────────────────────────────────────────────────

interface UrlInputStepProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  isValidating: boolean;
  urlError: string | null;
}

function UrlInputStep({ url, onUrlChange, onSubmit, isValidating, urlError }: UrlInputStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="px-4 pt-6">
      <h2 className="text-xl font-semibold text-[var(--foreground)]">
        유튜브 영상에서
        <br />
        레시피를 가져와요
      </h2>
      <p className="mt-3 text-base text-[var(--text-2)]">
        영상 링크를 붙여넣으면
        <br />
        재료와 조리법을 자동 추출해요
      </p>
      <div className="mt-6">
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={isValidating}
          className={[
            "w-full rounded-[var(--radius-sm)] bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--text-3)] outline-none transition-colors",
            urlError
              ? "border-2 border-[var(--brand-deep)]"
              : "border border-transparent focus:border-2 focus:border-[var(--brand)]",
          ].join(" ")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onSubmit();
          }}
        />
        {urlError && (
          <p className="mt-2 text-sm text-[var(--brand)]">{urlError}</p>
        )}
      </div>
      <div className="mt-4">
        <Button
          fullWidth
          onClick={onSubmit}
          disabled={!url.trim()}
          loading={isValidating}
        >
          {isValidating ? "확인 중..." : "가져오기"}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1.5: Preview ───────────────────────────────────────────────────────

interface PreviewStepProps {
  videoInfo: YoutubeVideoInfo;
  onExtract: () => void;
  onReenter: () => void;
}

function PreviewStep({ videoInfo, onExtract, onReenter }: PreviewStepProps) {
  const [thumbError, setThumbError] = useState(false);

  return (
    <div className="px-4 pt-6">
      <h2 className="text-xl font-semibold text-[var(--foreground)]">
        이 영상에서 추출할까요?
      </h2>
      <p className="mt-3 text-base text-[var(--text-2)]">
        미리보기는 quota를 쓰지 않아요.
        <br />
        다음 단계에서 설명란을 확인해요.
      </p>
      <div className="mt-6 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
        <div className="relative aspect-video w-full bg-[var(--surface-fill)]">
          {!thumbError ? (
            <Image
              src={videoInfo.thumbnail_url}
              alt={videoInfo.title}
              fill
              className="object-cover"
              unoptimized
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-3)]">
              썸네일을 불러올 수 없어요
            </div>
          )}
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--text-3)]">{videoInfo.channel}</p>
          <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{videoInfo.title}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <Button fullWidth onClick={onExtract}>
          레시피 추출하기
        </Button>
        <Button fullWidth variant="neutral" onClick={onReenter}>
          다른 영상 입력
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1.5: Non-recipe Warning ─────────────────────────────────────────────

interface NonRecipeWarningStepProps {
  videoInfo: YoutubeVideoInfo;
  classificationReasons: string[];
  onReenter: () => void;
}

function NonRecipeWarningStep({
  videoInfo,
  classificationReasons,
  onReenter,
}: NonRecipeWarningStepProps) {
  const [thumbError, setThumbError] = useState(false);

  return (
    <div className="px-4 pt-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-fill)]">
        {!thumbError ? (
          <Image
            src={videoInfo.thumbnail_url}
            alt={videoInfo.title}
            fill
            className="object-cover"
            unoptimized
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--text-3)]">
            {/* Play icon placeholder */}
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
              <path d="M16 13l12 7-12 7V13z" fill="currentColor" />
            </svg>
            <span className="text-sm">썸네일을 불러올 수 없어요</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-[var(--text-3)]">{videoInfo.channel}</p>
        <p className="text-lg font-bold text-[var(--foreground)]">{videoInfo.title}</p>
      </div>
      <div className="mt-6 rounded-[var(--radius-md)] bg-[var(--brand-soft)] p-4">
        <p className="text-base text-[var(--foreground)]">
          이 영상은 요리 레시피로 보기 어려워요
        </p>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          레시피 영상 링크를 다시 입력해주세요.
        </p>
        {classificationReasons.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
            {classificationReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mt-4">
        <Button fullWidth variant="neutral" onClick={onReenter}>
          다시 입력
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Extraction Progress ──────────────────────────────────────────────

const EXTRACTION_STAGES = [
  { key: "description", label: "설명란 분석" },
] as const;

interface ExtractionProgressStepProps {
  videoTitle: string;
  elapsedMs: number;
}

function ExtractionProgressStep({ videoTitle, elapsedMs }: ExtractionProgressStepProps) {
  const showWaitMessage = elapsedMs > 15000;

  return (
    <div className="px-4 pt-8">
      <h2 className="text-xl font-semibold text-[var(--foreground)]">
        레시피를 분석하고 있어요
      </h2>
      <p className="mt-3 text-base text-[var(--text-2)]">{videoTitle}</p>
      <div className="mt-8 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
        {EXTRACTION_STAGES.map((stage, idx) => {
          return (
            <React.Fragment key={stage.key}>
              {idx > 0 && <div className="my-3 border-t border-[var(--line)]" />}
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <svg className="h-5 w-5 animate-spin text-[var(--brand)]" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-[var(--foreground)]">
                    {stage.label}
                  </p>
                  <p className="text-sm text-[var(--brand)]">
                    영상 설명과 메타데이터를 확인하는 중...
                  </p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-4">
        <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-fill)]" aria-hidden="true">
          <div
            className="h-full w-1/2 animate-pulse rounded-full bg-[var(--brand)]"
          />
        </div>
      </div>
      <p className="mt-3 text-center text-sm text-[var(--text-3)]">
        {showWaitMessage ? "추출이 조금 오래 걸리고 있어요. 잠시만 더 기다려주세요" : "잠시만 기다려주세요"}
      </p>
    </div>
  );
}

// ─── Step 2.5: Extraction Error ───────────────────────────────────────────────

interface ExtractionErrorStepProps {
  errorMessage: string;
  onRetry: () => void;
  onReenter: () => void;
}

function ExtractionErrorStep({ errorMessage, onRetry, onReenter }: ExtractionErrorStepProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <h2 className="text-xl font-semibold text-[var(--foreground)]">
        레시피 추출에 실패했어요
      </h2>
      <p className="mt-3 text-center text-base text-[var(--text-2)]">
        {errorMessage}
        <br />
        잠시 후 다시 시도해주세요
      </p>
      <div className="mt-6 w-full space-y-3">
        <Button fullWidth onClick={onRetry}>
          다시 시도
        </Button>
        <Button fullWidth variant="neutral" onClick={onReenter}>
          다른 영상 입력
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Review / Edit ────────────────────────────────────────────────────

interface ReviewStepProps {
  title: string;
  onTitleChange: (title: string) => void;
  baseServings: number;
  onServingsChange: (servings: number) => void;
  extractionMethods: string[];
  classificationStatus: YoutubeRecipeClassificationStatus | null;
  classificationReasons: string[];
  draftWarnings: string[];
  blockingIssues: string[];
  ingredients: TempIngredient[];
  steps: TempStep[];
  onUpdateIngredient: (
    tempId: string,
    patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
  ) => void;
  onResolveIngredientCandidate: (
    tempId: string,
    candidate: YoutubeIngredientCandidate,
  ) => void;
  onReplaceIngredient: (tempId: string) => void;
  onRegisterIngredient: (tempId: string) => void;
  onRemoveIngredient: (tempId: string) => void;
  onRemoveStep: (tempId: string) => void;
  onAddIngredient: () => void;
  onAddStep: () => void;
  onEditStep: (tempId: string) => void;
}

interface ReviewIngredientRowProps {
  ingredient: TempIngredient;
  showDivider: boolean;
  onUpdateIngredient: (
    tempId: string,
    patch: Pick<ManualRecipeIngredientInput, "amount" | "unit">,
  ) => void;
  onResolveIngredientCandidate: (
    tempId: string,
    candidate: YoutubeIngredientCandidate,
  ) => void;
  onReplaceIngredient: (tempId: string) => void;
  onRegisterIngredient: (tempId: string) => void;
  onRemoveIngredient: (tempId: string) => void;
}

function ReviewIngredientRow({
  ingredient,
  showDivider,
  onUpdateIngredient,
  onResolveIngredientCandidate,
  onReplaceIngredient,
  onRegisterIngredient,
  onRemoveIngredient,
}: ReviewIngredientRowProps) {
  const ingredientName = getIngredientName(ingredient);
  const resolutionLabel = getIngredientResolutionLabel(ingredient);
  const needsResolution = !isIngredientReadyForRegister(ingredient);
  const unitOptions = getIngredientUnitOptions(ingredient.unit);

  return (
    <div
      className={[
        "px-3 py-2.5",
        showDivider ? "border-t border-[var(--line)]" : "",
      ].join(" ")}
    >
      <div className="grid grid-cols-[minmax(3.5rem,1fr)_4.25rem_auto_2.5rem] items-center gap-1.5">
        <div className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[var(--foreground)]">
            {ingredientName}
          </span>
          {resolutionLabel ? (
            <span className="mt-1 block text-[12px] font-semibold text-[var(--danger)]">
              {resolutionLabel}
            </span>
          ) : null}
        </div>
        <input
          aria-label={`${ingredientName} 수량`}
          className="h-9 min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-2 text-right text-[14px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          inputMode="decimal"
          min={0}
          onChange={(event) => {
            const value = event.target.value;
            onUpdateIngredient(ingredient.tempId, {
              amount: value === "" ? 0 : Number(value),
              unit: ingredient.unit ?? "g",
            });
          }}
          type="number"
          value={ingredient.amount ?? 0}
        />
        <div
          aria-label={`${ingredientName} 단위`}
          className="flex shrink-0 gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-0.5"
          role="group"
        >
          {unitOptions.map((option) => (
            <button
              aria-label={`${ingredientName} ${option}`}
              aria-pressed={(ingredient.unit ?? "g") === option}
              className={[
                "h-9 min-w-9 rounded-[var(--radius-sm)] px-1.5 text-[14px] font-semibold transition",
                (ingredient.unit ?? "g") === option
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text-2)] hover:bg-[var(--surface)]",
              ].join(" ")}
              key={option}
              onClick={() =>
                onUpdateIngredient(ingredient.tempId, {
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
          aria-label={`${ingredientName} 삭제`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px] leading-none text-[var(--text-3)] hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]"
          onClick={() => onRemoveIngredient(ingredient.tempId)}
          type="button"
        >
          ×
        </button>
      </div>

      {needsResolution ? (
        <div className="mt-2 rounded-[var(--radius-card)] border border-[color:rgba(216,58,58,0.2)] bg-[color:rgba(216,58,58,0.06)] p-3">
          {ingredient.raw_text ? (
            <p className="text-[12px] text-[var(--text-2)]">
              원문: {ingredient.raw_text}
            </p>
          ) : null}
          {ingredient.resolution_status === "needs_review" &&
          (ingredient.candidates?.length ?? 0) > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {ingredient.candidates?.map((candidate) => (
                <button
                  className="rounded-[var(--radius-full)] border border-[var(--brand)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--brand)]"
                  key={candidate.ingredient_id}
                  onClick={() => onResolveIngredientCandidate(ingredient.tempId, candidate)}
                  type="button"
                >
                  {candidate.standard_name} 선택
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              className="text-[12px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              onClick={() => onReplaceIngredient(ingredient.tempId)}
              type="button"
            >
              재료 검색으로 교체
            </button>
            {ingredient.draft_ingredient_id ? (
              <button
                className="text-[12px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
                onClick={() => onRegisterIngredient(ingredient.tempId)}
                type="button"
                data-testid="register-ingredient-action"
              >
                새 재료로 등록
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ReviewCookingStepRowProps {
  step: TempStep;
  showDivider: boolean;
  onRemoveStep: (tempId: string) => void;
  onEditStep: (tempId: string) => void;
}

function ReviewCookingStepRow({
  step,
  showDivider,
  onRemoveStep,
  onEditStep,
}: ReviewCookingStepRowProps) {
  const blockingFields = getStepBlockingFields(step);
  const warningFields = getStepWarningFields(step);

  return (
    <div
      className={[
        "p-4",
        showDivider ? "border-t border-[var(--line)]" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {step.step_number}.
            </span>
            {step.cooking_method && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{
                  backgroundColor: getCookingMethodColor(
                    step.cooking_method.color_key,
                  ),
                }}
              >
                {step.cooking_method.label}
              </span>
            )}
            {step.cooking_method?.is_new && (
              <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand)]">
                신규
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-base text-[var(--foreground)]">
            {step.instruction || "조리 설명을 입력해주세요."}
          </p>
          {step.duration_text && (
            <p className="mt-1 text-sm text-[var(--text-3)]">{step.duration_text}</p>
          )}
        </div>
        <button
          aria-label={`스텝 ${step.step_number} 삭제`}
          className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center text-[var(--text-3)] hover:text-[var(--foreground)]"
          onClick={() => onRemoveStep(step.tempId)}
          type="button"
        >
          ×
        </button>
      </div>

      {blockingFields.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-card)] border border-[color:rgba(216,58,58,0.2)] bg-[color:rgba(216,58,58,0.06)] p-3">
          <p className="text-[12px] font-semibold text-[var(--danger)]">
            등록 전 필수 입력: {formatStepFieldList(blockingFields)}
          </p>
          {step.raw_text ? (
            <p className="mt-1 text-[12px] text-[var(--text-2)]">
              원문: {step.raw_text}
            </p>
          ) : null}
        </div>
      ) : null}
      {warningFields.length > 0 ? (
        <p className="mt-2 text-[12px] text-[var(--text-2)]">
          선택 확인 권장: {formatStepFieldList(warningFields)}
        </p>
      ) : null}
      <button
        className="mt-3 text-[13px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
        onClick={() => onEditStep(step.tempId)}
        type="button"
      >
        조리 과정 수정
      </button>
    </div>
  );
}

function ReviewStep({
  title,
  onTitleChange,
  baseServings,
  onServingsChange,
  extractionMethods,
  classificationStatus,
  classificationReasons,
  draftWarnings,
  blockingIssues,
  ingredients,
  steps,
  onUpdateIngredient,
  onResolveIngredientCandidate,
  onReplaceIngredient,
  onRegisterIngredient,
  onRemoveIngredient,
  onRemoveStep,
  onAddIngredient,
  onAddStep,
  onEditStep,
}: ReviewStepProps) {
  const registerRequirements = getYoutubeRegisterRequirements({
    title,
    baseServings,
    ingredients,
    steps,
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
      <p className="pt-4 text-base text-[var(--text-2)]">추출 결과를 확인해주세요</p>

      {/* Extraction method pills */}
      {extractionMethods.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {extractionMethods.map((method) => (
            <span
              key={method}
              className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-xs font-semibold text-white"
            >
              {method}
            </span>
          ))}
        </div>
      )}

      {classificationStatus === "uncertain" ? (
        <div
          className="mt-4 rounded-[var(--radius-card)] border border-[color:rgba(255,149,0,0.26)] bg-[color:rgba(255,149,0,0.08)] px-4 py-3"
          role="status"
        >
          <p className="text-[13px] font-semibold leading-[1.45] text-[var(--foreground)]">
            레시피 영상인지 확실하지 않아요. 추출 결과를 더 꼼꼼히 확인해주세요.
          </p>
          {classificationReasons.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--text-2)]">
              {classificationReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {draftWarnings.length > 0 ? (
        <div
          className="mt-4 rounded-[var(--radius-card)] border border-[color:rgba(255,149,0,0.26)] bg-[color:rgba(255,149,0,0.08)] px-4 py-3"
          role="status"
        >
          <p className="text-[13px] font-semibold leading-[1.45] text-[var(--foreground)]">
            자동 추출에서 확인이 필요한 부분이 있어요.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--text-2)]">
            {draftWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {blockingIssues.length > 0 && registerRequirements.length > 0 ? (
        <div
          className="mt-4 rounded-[var(--radius-card)] border border-[color:rgba(216,58,58,0.26)] bg-[color:rgba(216,58,58,0.08)] px-4 py-3"
          role="alert"
        >
          <p className="text-[13px] font-semibold leading-[1.45] text-[var(--danger)]">
            등록 전에 꼭 채워야 하는 항목이 있어요.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--danger)]">
            {blockingIssues.map((issue) => (
              <li key={issue}>{formatYoutubeBlockingIssue(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {registerRequirements.length > 0 ? (
        <div
          className="mt-4 rounded-[var(--radius-card)] bg-[#F8F9FA] px-4 py-3"
          data-testid="youtube-register-requirements"
          role="status"
        >
          <p className="text-[13px] font-semibold leading-[1.45] text-[#495057]">
            등록하려면 아래 항목을 확인해주세요.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {registerRequirements.map((requirement) => (
              <span
                className="rounded-[var(--radius-control)] bg-white px-2.5 py-1 text-[12px] font-medium text-[#495057]"
                key={requirement}
              >
                {requirement}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Title */}
      <div className="mt-6">
        <label className="text-sm font-medium text-[var(--text-2)]">레시피명</label>
        <input
          aria-label="레시피명"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition-colors focus:border-2 focus:border-[var(--brand)]"
        />
      </div>

      {/* Base servings */}
      <div className="mt-4">
        <label className="text-sm font-medium text-[var(--text-2)]">기본 인분</label>
        <div className="mt-1">
          <NumericStepperCompact
            value={baseServings}
            min={1}
            onChange={onServingsChange}
            unit="인분"
          />
        </div>
      </div>

      {/* Ingredients */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          재료 ({ingredients.length}개)
        </h3>
        {ingredients.length === 0 ? (
          <p className="py-4 text-sm text-[var(--muted)]">
            설명란에서 재료를 찾지 못했어요. 아래 버튼으로 직접 추가할 수 있어요
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]">
            {ingredients.map((ing, idx) => (
              <ReviewIngredientRow
                ingredient={ing}
                key={ing.tempId}
                onRemoveIngredient={onRemoveIngredient}
                onRegisterIngredient={onRegisterIngredient}
                onReplaceIngredient={onReplaceIngredient}
                onResolveIngredientCandidate={onResolveIngredientCandidate}
                onUpdateIngredient={onUpdateIngredient}
                showDivider={idx > 0}
              />
            ))}
          </div>
        )}
        <button
          className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--brand)] bg-transparent py-3 text-base font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/10"
          onClick={onAddIngredient}
          type="button"
        >
          + 재료 추가
        </button>
      </div>

      {/* Steps */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          조리 과정 ({steps.length}단계)
        </h3>
        {steps.length === 0 ? (
          <p className="py-4 text-sm text-[var(--muted)]">
            설명란에서 조리 과정을 찾지 못했어요. 아래 버튼으로 직접 추가할 수 있어요
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]">
            {steps.map((step, idx) => (
              <ReviewCookingStepRow
                key={step.tempId}
                onEditStep={onEditStep}
                onRemoveStep={onRemoveStep}
                showDivider={idx > 0}
                step={step}
              />
            ))}
          </div>
        )}
        <button
          className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--brand)] bg-transparent py-3 text-base font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/10"
          onClick={onAddStep}
          type="button"
        >
          + 조리 과정 추가
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Registration Complete ────────────────────────────────────────────

interface CompleteStepProps {
  recipeTitle: string;
  hasPlanContext: boolean;
  onMealAdd: () => void;
  onViewDetail: () => void;
  onClose: () => void;
}

function CompleteStep({ recipeTitle, hasPlanContext, onMealAdd, onViewDetail, onClose }: CompleteStepProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 shadow-[var(--shadow-2)]">
        <div className="text-center">
          <div className="mx-auto flex h-[var(--control-height-lg)] w-12 items-center justify-center">
            <svg className="h-[var(--control-height-lg)] w-12 text-[var(--brand)]" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="3" fill="none" />
              <path d="M14 24l7 7 13-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-[var(--foreground)]">
            레시피가 등록됐어요
          </h2>
          <p className="mt-2 text-base text-[var(--text-2)]">
            &lsquo;{recipeTitle}&rsquo;가
            <br />
            레시피북에 저장됐어요
          </p>
        </div>
        <div className="mt-6 space-y-3">
          {hasPlanContext && (
            <Button fullWidth onClick={onMealAdd}>
              이 끼니에 추가
            </Button>
          )}
          <Button fullWidth variant={hasPlanContext ? "secondary" : "primary"} onClick={onViewDetail}>
            레시피 상세 보기
          </Button>
          <button
            className="w-full py-3 text-center text-base text-[var(--text-2)]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Add Modal ─────────────────────────────────────────────────────────

interface StepAddModalProps {
  onClose: () => void;
  onAdd: (step: Omit<TempStep, "tempId" | "step_number">) => void;
  cookingMethods: CookingMethodItem[];
  nextStepNumber: number;
  initialStep?: TempStep | null;
}

function StepAddModal({
  onClose,
  onAdd,
  cookingMethods,
  nextStepNumber,
  initialStep = null,
}: StepAddModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<CookingMethodItem | null>(
    initialStep?.cooking_method ?? null,
  );
  const [instruction, setInstruction] = useState(initialStep?.instruction ?? "");
  const [durationText, setDurationText] = useState(initialStep?.duration_text ?? "");
  const isEditing = Boolean(initialStep);

  const handleAdd = () => {
    if (!selectedMethod || !instruction.trim()) return;
    onAdd({
      instruction: instruction.trim(),
      cooking_method: selectedMethod,
      ingredients_used: [],
      heat_level: null,
      duration_seconds: null,
      duration_text: durationText.trim() || null,
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
        className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <ModalHeader title={isEditing ? "조리 과정 수정" : "조리 과정 추가"} onClose={onClose} />
        <div className="mt-6 space-y-4">
          <div className="text-sm font-semibold text-[var(--text-2)]">스텝 번호: {nextStepNumber}</div>
          <div>
            <div className="mb-2 text-sm font-semibold text-[var(--text-2)]">조리방법 선택</div>
            <div className="grid grid-cols-2 gap-2">
              {cookingMethods.map((method) => {
                const color = getCookingMethodColor(method.color_key);
                const isSelected = selectedMethod?.id === method.id;

                return (
                  <button
                    key={method.id}
                    className="rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold"
                    onClick={() => setSelectedMethod(method)}
                    style={{
                      backgroundColor: isSelected
                        ? color
                        : `color-mix(in srgb, ${color} 12%, transparent)`,
                      borderColor: color,
                      color: isSelected ? "#fff" : "var(--foreground)",
                    }}
                    type="button"
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-[var(--text-2)]">조리 설명</div>
            <textarea
              placeholder="조리 설명을 입력하세요"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-[var(--text-2)]">시간 메모</div>
            <input
              className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base"
              onChange={(event) => setDurationText(event.target.value)}
              placeholder="예: 5분"
              type="text"
              value={durationText}
            />
          </div>
        </div>
        <div className="mt-6">
          <Button fullWidth onClick={handleAdd} disabled={!selectedMethod || !instruction.trim()}>
            {isEditing ? "수정 완료" : "추가"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ingredient Register Modal ──────────────────────────────────────────────

const INGREDIENT_CATEGORY_CHOICES: IngredientCategory[] = [
  "채소", "육류", "해산물", "양념", "유제품", "곡류", "기타",
];

interface IngredientRegisterModalProps {
  ingredient: TempIngredient;
  extractionId: string;
  onClose: () => void;
  onSuccess: (
    tempId: string,
    ingredientId: string,
    standardName: string,
  ) => void;
}

function IngredientRegisterModal({
  ingredient,
  extractionId,
  onClose,
  onSuccess,
}: IngredientRegisterModalProps) {
  const initialName = ingredient.standard_name || ingredient.raw_text || "";
  const [standardName, setStandardName] = useState(initialName);
  const [category, setCategory] = useState<IngredientCategory>("양념");
  const [defaultUnit, setDefaultUnit] = useState("");
  const [synonym, setSynonym] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = standardName.trim().length > 0 && !isSubmitting;

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!ingredient.draft_ingredient_id) return;

    setIsSubmitting(true);
    setError(null);

    const result = await registerYoutubeIngredient({
      extraction_id: extractionId,
      draft_ingredient_id: ingredient.draft_ingredient_id,
      standard_name: standardName.trim(),
      category,
      default_unit: defaultUnit.trim() || null,
      synonym: synonym.trim() || null,
    });

    setIsSubmitting(false);

    if (!result.success || !result.data) {
      const code = result.error?.code;
      if (code === "SESSION_EXPIRED") {
        setError("추출 세션이 만료됐어요. 다시 추출해주세요.");
      } else if (code === "CONFLICT") {
        setError(result.error?.message ?? "세션 상태가 변경됐어요. 다시 시도해주세요.");
      } else if (code === "UNAUTHORIZED") {
        setError("로그인이 필요해요.");
      } else if (code === "VALIDATION_ERROR") {
        setError(result.error?.message ?? "입력값을 확인해주세요.");
      } else {
        setError(result.error?.message ?? "재료를 등록하지 못했어요.");
      }
      return;
    }

    onSuccess(
      ingredient.tempId,
      result.data.ingredient.ingredient_id,
      result.data.ingredient.standard_name,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={handleClose}
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="ingredient-register-title"
        data-testid="ingredient-register-modal"
      >
        <ModalHeader title="새 재료 등록" titleId="ingredient-register-title" onClose={handleClose} />

        <div className="mt-5 space-y-4">
          {/* Standard name */}
          <div>
            <label className="text-sm font-semibold text-[var(--text-2)]">표준 재료명</label>
            <input
              autoFocus
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              onChange={(e) => setStandardName(e.target.value)}
              placeholder="예: 연겨자"
              type="text"
              value={standardName}
              data-testid="register-standard-name"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-semibold text-[var(--text-2)]">카테고리</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {INGREDIENT_CATEGORY_CHOICES.map((cat) => (
                <button
                  aria-pressed={category === cat}
                  className={[
                    "rounded-[var(--radius-full)] border px-3 py-1.5 text-sm font-semibold transition",
                    category === cat
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--foreground)]",
                  ].join(" ")}
                  key={cat}
                  onClick={() => setCategory(cat)}
                  type="button"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Default unit (optional) */}
          <div>
            <label className="text-sm font-semibold text-[var(--text-2)]">기본 단위 (선택)</label>
            <input
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              maxLength={20}
              onChange={(e) => setDefaultUnit(e.target.value)}
              placeholder="예: g, ml, 개"
              type="text"
              value={defaultUnit}
            />
          </div>

          {/* Synonym (optional) */}
          <div>
            <label className="text-sm font-semibold text-[var(--text-2)]">동의어 (선택)</label>
            <input
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              onChange={(e) => setSynonym(e.target.value)}
              placeholder="원문명을 동의어로 등록"
              type="text"
              value={synonym}
            />
          </div>

          {/* Error */}
          {error ? (
            <div
              className="rounded-[var(--radius-card)] border border-[color:rgba(216,58,58,0.26)] bg-[color:rgba(216,58,58,0.08)] px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
              data-testid="register-ingredient-error"
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <Button
            fullWidth
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={isSubmitting}
          >
            {isSubmitting ? "등록 중..." : "등록"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Register Error Modal ───────────────────────────────────────────────────

interface RegisterErrorModalProps {
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}

function RegisterErrorModal({ errorMessage, onRetry, onClose }: RegisterErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]">
        <ModalHeader title="레시피 등록 실패" onClose={onClose} />
        <p className="mt-4 text-base text-[var(--text-2)]">
          {errorMessage}
          <br />
          잠시 후 다시 시도해주세요
        </p>
        <div className="mt-6 space-y-3">
          <Button fullWidth onClick={onRetry}>
            다시 시도
          </Button>
          <Button fullWidth variant="neutral" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Back Modal ─────────────────────────────────────────────────────

interface ConfirmBackModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmBackModal({ onConfirm, onCancel }: ConfirmBackModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]">
        <ModalHeader title="수정 내용이 사라져요" onClose={onCancel} description="뒤로 가면 수정한 내용이 모두 사라져요." />
        <div className="mt-6 space-y-3">
          <Button fullWidth variant="destructive" onClick={onConfirm}>
            나가기
          </Button>
          <Button fullWidth variant="neutral" onClick={onCancel}>
            계속 수정
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Servings Input Modal ───────────────────────────────────────────────────

interface ServingsInputModalProps {
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  defaultServings: number;
  isCreating: boolean;
  error: string | null;
}

function ServingsInputModal({ onConfirm, onCancel, defaultServings, isCreating, error }: ServingsInputModalProps) {
  const [servings, setServings] = useState(defaultServings);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-6 sm:rounded-[var(--radius-sheet)]">
        <ModalHeader title="이 끼니에 추가" description="계획 인분을 정해주세요" onClose={onCancel} />
        <div className="mt-6">
          <NumericStepperCompact value={servings} min={1} onChange={setServings} unit="인분" disabled={isCreating} />
        </div>
        {error && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-red-300 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div className="mt-6">
          <Button fullWidth onClick={() => onConfirm(servings)} loading={isCreating} disabled={isCreating}>
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function YoutubeImportScreen({
  initialYoutubeUrl = "",
  onRequestClose,
  planDate,
  columnId,
  presentation = "screen",
  slotName,
}: YoutubeImportScreenProps) {
  const router = useRouter();
  const appReturn = useAppReturn({
    fallback:
      planDate && columnId
        ? `/planner/${planDate}/${columnId}${slotName ? `?slot=${encodeURIComponent(slotName)}` : ""}`
        : "/planner",
  });
  const isDesktopViewport = useDesktopViewport();
  const isEmbedded = presentation === "embedded";
  const internalHistoryDepthRef = useRef(0);
  const bypassPopGuardRef = useRef(false);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>("url-input");
  const [modalMode, setModalMode] = useState<ModalMode>("none");

  // Step 1 state
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);
  const [isValidating, setIsValidating] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Video info (from validate response)
  const [videoInfo, setVideoInfo] = useState<YoutubeVideoInfo | null>(null);
  const [classificationStatus, setClassificationStatus] =
    useState<YoutubeRecipeClassificationStatus | null>(null);
  const [classificationReasons, setClassificationReasons] = useState<string[]>([]);

  // Extraction state
  const [extractionStartTime, setExtractionStartTime] = useState(0);
  const [extractionElapsedMs, setExtractionElapsedMs] = useState(0);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [blockingIssues, setBlockingIssues] = useState<string[]>([]);

  // Step 3 state (review/edit)
  const [extractionId, setExtractionId] = useState("");
  const [title, setTitle] = useState("");
  const [baseServings, setBaseServings] = useState(1);
  const [extractionMethods, setExtractionMethods] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<TempIngredient[]>([]);
  const [steps, setSteps] = useState<TempStep[]>([]);
  const [replacingIngredientId, setReplacingIngredientId] = useState<string | null>(null);
  const [registeringIngredientId, setRegisteringIngredientId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  // Registration state
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registeredRecipeId, setRegisteredRecipeId] = useState<string | null>(null);
  const [registeredRecipeTitle, setRegisteredRecipeTitle] = useState("");

  // API data
  const [cookingMethods, setCookingMethods] = useState<CookingMethodItem[]>([]);

  // Meal add flow
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [mealAddError, setMealAddError] = useState<string | null>(null);

  // Load cooking methods on mount
  useEffect(() => {
    async function load() {
      const response = await fetchCookingMethods();
      if (response.success && response.data?.methods) {
        setCookingMethods(response.data.methods);
      }
    }
    load();
  }, []);

  // Elapsed time ticker for extraction
  useEffect(() => {
    if (currentStep !== "extracting") return;
    const interval = setInterval(() => {
      setExtractionElapsedMs(Date.now() - extractionStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentStep, extractionStartTime]);

  // History state management for browser back
  useEffect(() => {
    if (isEmbedded) return;

    function handlePopState() {
      if (bypassPopGuardRef.current) {
        return;
      }

      setCurrentStep((prev) => {
        if (prev === "review") {
          setModalMode("confirm-back");
          // Push state again to keep the user on the page
          window.history.pushState({ step: "review" }, "");
          internalHistoryDepthRef.current += 1;
          return prev;
        }
        if (prev === "preview") return "url-input";
        if (prev === "non-recipe-warning") return "url-input";
        if (prev === "extracting") return "url-input";
        if (prev === "complete") return "complete"; // No back from complete
        return prev;
      });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isEmbedded]);

  // Push history state on step change
  const pushStep = useCallback((step: Step) => {
    setCurrentStep(step);
    if (isEmbedded) return;

    window.history.pushState({ step }, "");
    internalHistoryDepthRef.current += 1;
  }, [isEmbedded]);

  const exitImportFlow = useCallback(() => {
    bypassPopGuardRef.current = true;
    if (onRequestClose) {
      onRequestClose();
      return;
    }

    appReturn.goBack();
  }, [appReturn, onRequestClose]);

  // ─── Step 1 handlers ───────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!youtubeUrl.trim()) return;

    setIsValidating(true);
    setUrlError(null);
    setDraftWarnings([]);
    setBlockingIssues([]);
    setExtractionError(null);

    const result = await validateYoutubeUrl({ youtube_url: youtubeUrl.trim() });

    if (!result.success || !result.data) {
      const fieldError = result.error?.fields?.find((f) => f.field === "youtube_url");
      setUrlError(fieldError?.reason === "invalid_url"
        ? "올바른 유튜브 URL을 입력해주세요"
        : result.error?.message ?? "URL을 확인하지 못했어요.");
      setIsValidating(false);
      return;
    }

    const nextClassificationStatus =
      result.data.classification_status ??
      (result.data.is_recipe_video ? "recipe" : "non_recipe");
    const nextClassificationReasons = result.data.classification_reasons ?? [];
    const isPreviewOnlyValidation =
      nextClassificationStatus === "uncertain" &&
      nextClassificationReasons.includes(YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON);

    setVideoInfo(result.data.video_info);
    setClassificationStatus(nextClassificationStatus);
    setClassificationReasons(nextClassificationReasons);
    setIsValidating(false);

    if (isPreviewOnlyValidation) {
      pushStep("preview");
    } else if (nextClassificationStatus !== "non_recipe" && result.data.is_recipe_video) {
      // Transition to extracting step; the effect below will fire the API call
      extractionFiredRef.current = false;
      setExtractionError(null);
      setExtractionStartTime(Date.now());
      setExtractionElapsedMs(0);
      pushStep("extracting");
    } else {
      pushStep("non-recipe-warning");
    }
  }, [youtubeUrl, pushStep]);

  // Auto-validate once on mount when a URL was supplied (e.g. planner 유튜브 가져오기 모달).
  // The modal already collected the URL and clicked "가져오기 화면 열기" — we should not
  // require the user to click "가져오기" again on this screen.
  const autoValidatedRef = useRef(false);
  useEffect(() => {
    if (autoValidatedRef.current) return;
    if (!initialYoutubeUrl.trim()) return;
    autoValidatedRef.current = true;
    handleValidate();
  }, [initialYoutubeUrl, handleValidate]);

  // ─── Extraction (triggered by entering "extracting" step) ──────────

  // Ref to avoid double-fire in StrictMode
  const extractionFiredRef = useRef(false);

  useEffect(() => {
    if (currentStep !== "extracting" || extractionFiredRef.current) return;
    extractionFiredRef.current = true;

    let cancelled = false;

    (async () => {
      const result = await extractYoutubeRecipe({ youtube_url: youtubeUrl.trim() });

      if (cancelled) return;

      if (!result.success || !result.data) {
        if (result.error?.code === "NOT_RECIPE_VIDEO") {
          setClassificationStatus("non_recipe");
          setClassificationReasons([result.error.message]);
          setExtractionError(null);
          pushStep("non-recipe-warning");
          return;
        }

        setExtractionError(
          getApiErrorMessage("레시피를 추출하지 못했어요.", result.error?.message),
        );
        return;
      }

      // Populate review state from extraction result
      const data = result.data;
      setExtractionId(data.extraction_id);
      setTitle(data.title);
      // Carry-forward: base_servings null default → 1
      setBaseServings(data.base_servings ?? 1);
      setExtractionMethods(data.extraction_methods ?? []);
      setDraftWarnings(data.draft_warnings ?? []);
      setBlockingIssues(data.blocking_issues ?? []);

      setIngredients(
        data.ingredients.map((ing: YoutubeExtractedIngredient, idx: number) => ({
          ...ing,
          ingredient_id: ing.ingredient_id ?? "",
          standard_name: ing.standard_name ?? "",
          display_text: ing.display_text ?? ing.raw_text ?? null,
          resolution_status: ing.resolution_status ?? "resolved",
          tempId: `yt-ing-${idx}`,
        })),
      );

      setSteps(
        data.steps.map((step: YoutubeExtractedStep, idx: number) => ({
          tempId: `yt-step-${idx}`,
          step_number: step.step_number,
          instruction: step.instruction,
          cooking_method: step.cooking_method
            ? {
                id: step.cooking_method.id,
                code: step.cooking_method.code,
                label: step.cooking_method.label,
                color_key: step.cooking_method.color_key,
                is_system: false,
                is_new: step.cooking_method.is_new,
              }
            : null,
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: step.duration_text,
          is_incomplete: step.is_incomplete,
          missing_fields: step.missing_fields ?? [],
          raw_text: step.raw_text,
        })),
      );

      pushStep("review");
    })();

    return () => { cancelled = true; };
  }, [currentStep, youtubeUrl, pushStep]);

  // Helper to initiate extraction from non-recipe warning proceed button
  const triggerExtraction = useCallback(() => {
    extractionFiredRef.current = false;
    setExtractionError(null);
    setExtractionStartTime(Date.now());
    setExtractionElapsedMs(0);
    pushStep("extracting");
  }, [pushStep]);

  // ─── Step 3 handlers ───────────────────────────────────────────────

  const handleAddIngredient = useCallback((newIngredients: ManualRecipeIngredientInput[]) => {
    if (replacingIngredientId) {
      const replacement = newIngredients[0];
      if (!replacement) return;

      setIngredients((prev) =>
        prev.map((ingredient) =>
          ingredient.tempId === replacingIngredientId
            ? normalizeIngredient({
                ...replacement,
                confidence: 1,
                resolution_status: "resolved",
                raw_text: ingredient.raw_text,
                sort_order: ingredient.sort_order,
                tempId: ingredient.tempId,
              })
            : ingredient,
        ),
      );
      setReplacingIngredientId(null);
      return;
    }

    setIngredients((prev) => [
      ...prev,
      ...newIngredients.map((ingredient, index) =>
        normalizeIngredient({
          ...ingredient,
          confidence: 1,
          resolution_status: "resolved",
          sort_order: prev.length + index + 1,
          tempId: `temp-ing-${Date.now()}-${index}`,
        }),
      ),
    ]);
  }, [replacingIngredientId]);

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

  const handleResolveIngredientCandidate = useCallback(
    (tempId: string, candidate: YoutubeIngredientCandidate) => {
      setIngredients((prev) =>
        prev.map((ingredient) =>
          ingredient.tempId === tempId
            ? normalizeIngredient({
                ...ingredient,
                ingredient_id: candidate.ingredient_id,
                standard_name: candidate.standard_name,
                confidence: candidate.confidence,
                resolution_status: "resolved",
              })
            : ingredient,
        ),
      );
    },
    [],
  );

  const handleReplaceIngredient = useCallback((tempId: string) => {
    setReplacingIngredientId(tempId);
    setModalMode("ingredient-add");
  }, []);

  const handleRegisterReplacingIngredient = useCallback(() => {
    if (!replacingIngredientId) return;
    const target = ingredients.find((ingredient) => ingredient.tempId === replacingIngredientId);
    if (!target?.draft_ingredient_id) return;
    setRegisteringIngredientId(replacingIngredientId);
    setReplacingIngredientId(null);
    setModalMode("ingredient-register");
  }, [ingredients, replacingIngredientId]);

  const handleRegisterIngredient = useCallback((tempId: string) => {
    setRegisteringIngredientId(tempId);
    setModalMode("ingredient-register");
  }, []);

  const canRegisterReplacingIngredient = replacingIngredientId
    ? ingredients.some(
        (ingredient) =>
          ingredient.tempId === replacingIngredientId && Boolean(ingredient.draft_ingredient_id),
      )
    : false;

  const handleIngredientRegistered = useCallback(
    (tempId: string, ingredientId: string, standardName: string) => {
      const targetIndex = ingredients.findIndex((ingredient) => ingredient.tempId === tempId);
      setIngredients((prev) =>
        prev.map((ingredient) =>
          ingredient.tempId === tempId
            ? {
                ...ingredient,
                ingredient_id: ingredientId,
                standard_name: standardName,
                resolution_status: "resolved",
                confidence: 1,
                candidates: [],
              }
            : ingredient,
        ),
      );
      if (targetIndex >= 0) {
        const ingredientIssue = `ingredients[${targetIndex}].ingredient_id`;
        setBlockingIssues((prev) => prev.filter((issue) => issue !== ingredientIssue));
      }
      setRegisteringIngredientId(null);
      setModalMode("none");
    },
    [ingredients],
  );

  const handleAddStep = useCallback((step: Omit<TempStep, "tempId" | "step_number">) => {
    if (editingStepId) {
      setSteps((prev) =>
        prev.map((currentStep) => {
          if (currentStep.tempId !== editingStepId) return currentStep;

          const remainingMissingFields = (currentStep.missing_fields ?? []).filter(
            (field) => field !== "instruction" && field !== "cooking_method",
          );

          return {
            ...currentStep,
            ...step,
            is_incomplete: remainingMissingFields.length > 0,
            missing_fields: remainingMissingFields,
          };
        }),
      );
      setEditingStepId(null);
      return;
    }

    setSteps((prev) => [
      ...prev,
      {
        ...step,
        is_incomplete: false,
        missing_fields: [],
        tempId: `temp-step-${Date.now()}`,
        step_number: prev.length + 1,
      },
    ]);
  }, [editingStepId]);

  const handleRemoveStep = useCallback((tempId: string) => {
    setSteps((prev) => {
      const updated = prev.filter((s) => s.tempId !== tempId);
      return updated.map((s, idx) => ({ ...s, step_number: idx + 1 }));
    });
  }, []);

  const canRegister =
    getYoutubeRegisterRequirements({
      title,
      baseServings,
      ingredients,
      steps,
    }).length === 0;

  // ─── Registration ──────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!canRegister) return;

    setIsRegistering(true);
    setRegisterError(null);

    const result = await registerYoutubeRecipe({
      extraction_id: extractionId,
      title: title.trim(),
      base_servings: baseServings,
      youtube_url: youtubeUrl.trim(),
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

    setIsRegistering(false);

    if (!result.success || !result.data) {
      setRegisterError(
        getApiErrorMessage("레시피를 등록하지 못했어요.", result.error?.message),
      );
      setModalMode("register-error");
      return;
    }

    setRegisteredRecipeId(result.data.recipe_id);
    setRegisteredRecipeTitle(result.data.title);
    pushStep("complete");
  }, [canRegister, extractionId, title, baseServings, youtubeUrl, ingredients, steps, pushStep]);

  // ─── Step 4 handlers ───────────────────────────────────────────────

  const hasPlanContext = Boolean(planDate && columnId);

  const handleMealAdd = useCallback(() => {
    if (!hasPlanContext) return;
    setMealAddError(null);
    setModalMode("servings-input");
  }, [hasPlanContext]);

  const handleServingsConfirm = useCallback(async (servings: number) => {
    if (!registeredRecipeId) return;

    setIsCreatingMeal(true);
    setMealAddError(null);

    const response = await createMealSafe({
      recipe_id: registeredRecipeId,
      plan_date: planDate,
      column_id: columnId,
      planned_servings: servings,
    });

    if (!response.success) {
      setMealAddError(response.error?.message ?? "식사를 추가하지 못했어요.");
      setIsCreatingMeal(false);
      return;
    }

    const slotSuffix = slotName ? `?slot=${encodeURIComponent(slotName)}` : "";
    router.replace(`/planner/${planDate}/${columnId}${slotSuffix}`);
  }, [registeredRecipeId, planDate, columnId, slotName, router]);

  const handleViewDetail = useCallback(() => {
    if (!registeredRecipeId) return;
    router.replace(`/recipe/${registeredRecipeId}`);
  }, [registeredRecipeId, router]);

  const handleClose = useCallback(() => {
    exitImportFlow();
  }, [exitImportFlow]);

  // ─── Back handling ─────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (currentStep === "review") {
      setModalMode("confirm-back");
    } else if (currentStep === "preview" || currentStep === "non-recipe-warning") {
      setCurrentStep("url-input");
    } else if (currentStep === "extracting" && extractionError) {
      setCurrentStep("url-input");
    } else {
      exitImportFlow();
    }
  }, [currentStep, exitImportFlow, extractionError]);

  const handleConfirmBack = useCallback(() => {
    setModalMode("none");
    exitImportFlow();
  }, [exitImportFlow]);

  // ─── Reenter / retry ──────────────────────────────────────────────

  const handleReenter = useCallback(() => {
    setYoutubeUrl("");
    setUrlError(null);
    setVideoInfo(null);
    setClassificationStatus(null);
    setClassificationReasons([]);
    setExtractionError(null);
    setDraftWarnings([]);
    setBlockingIssues([]);
    setReplacingIngredientId(null);
    setRegisteringIngredientId(null);
    setEditingStepId(null);
    setCurrentStep("url-input");
  }, []);

  const handleRetryExtraction = useCallback(() => {
    triggerExtraction();
  }, [triggerExtraction]);

  // ─── Render ────────────────────────────────────────────────────────

  const targetLabel = formatTargetLabel(planDate, slotName);
  const desktopStepIndex = getYoutubeStepIndex(currentStep);
  const editingStep = editingStepId
    ? steps.find((step) => step.tempId === editingStepId) ?? null
    : null;
  const desktopRegisterRequirements = getYoutubeRegisterRequirements({
    title,
    baseServings,
    ingredients,
    steps,
  });

  const DesktopImportFrame: React.ElementType<{
    children: React.ReactNode;
    className?: string;
  }> = isEmbedded ? "div" : WebCard;

  const desktopImportCard = (
    <DesktopImportFrame
      className={["web-yt-card", isEmbedded && "web-yt-card-embedded"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="web-yt-stepper" aria-label="유튜브 가져오기 단계">
        {YOUTUBE_STEP_LABELS.map((step, index) => (
          <span
            className={[
              "web-yt-step",
              index < desktopStepIndex ? "web-yt-step-done" : "",
              index === desktopStepIndex ? "web-yt-step-active" : "",
            ].join(" ")}
            key={step.id}
          >
            <span>{index + 1}</span>
            {step.label}
          </span>
        ))}
      </div>

      {currentStep === "url-input" ? (
        <section className="web-yt-content web-yt-url">
          <div>
            <h2>유튜브 링크를 붙여넣어 주세요</h2>
            <p>영상 설명, 자막, 화면 텍스트에서 재료와 조리법을 찾아요.</p>
          </div>
          <label className="web-manual-field web-manual-field-wide">
            <span>유튜브 URL</span>
            <input
              disabled={isValidating}
              inputMode="url"
              onChange={(event) => {
                setYoutubeUrl(event.target.value);
                setUrlError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && youtubeUrl.trim()) {
                  handleValidate();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              type="url"
              value={youtubeUrl}
            />
          </label>
          {urlError ? (
            <div className="web-menu-add-error" role="alert">
              {urlError}
            </div>
          ) : null}
          <div className="web-yt-actions">
            <WebButton
              disabled={!youtubeUrl.trim() || isValidating}
              onClick={handleValidate}
            >
              {isValidating ? "확인 중..." : "가져오기"}
            </WebButton>
          </div>
        </section>
      ) : null}

      {currentStep === "preview" && videoInfo ? (
        <section className="web-yt-content web-yt-warning">
          <div className="web-yt-video">
            <div className="web-yt-thumb">
              <Image
                alt={videoInfo.title}
                fill
                src={videoInfo.thumbnail_url}
                unoptimized
              />
            </div>
            <div>
              <p className="web-picker-subtle">{videoInfo.channel}</p>
              <h2>{videoInfo.title}</h2>
              <p>미리보기는 quota를 쓰지 않아요. 레시피 추출을 시작하면 설명란을 확인해요.</p>
            </div>
          </div>
          <div className="web-yt-actions">
            <WebButton onClick={triggerExtraction}>레시피 추출하기</WebButton>
            <WebButton onClick={handleReenter} variant="secondary">
              다른 영상 입력
            </WebButton>
          </div>
        </section>
      ) : null}

      {currentStep === "non-recipe-warning" && videoInfo ? (
        <section className="web-yt-content web-yt-warning">
          <div className="web-yt-video">
            <div className="web-yt-thumb">
              <Image
                alt={videoInfo.title}
                fill
                src={videoInfo.thumbnail_url}
                unoptimized
              />
            </div>
            <div>
              <p className="web-picker-subtle">{videoInfo.channel}</p>
              <h2>{videoInfo.title}</h2>
              <p>요리 레시피로 보기 어려워요. 다른 링크를 입력해주세요.</p>
              {classificationReasons.length > 0 ? (
                <ul>
                  {classificationReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <div className="web-yt-actions">
            <WebButton onClick={handleReenter} variant="secondary">
              다시 입력
            </WebButton>
          </div>
        </section>
      ) : null}

      {currentStep === "extracting" && !extractionError ? (
        <section className="web-yt-content">
          <ExtractionProgressStep
            videoTitle={videoInfo?.title ?? ""}
            elapsedMs={extractionElapsedMs}
          />
        </section>
      ) : null}

      {currentStep === "extracting" && extractionError ? (
        <section className="web-yt-content web-yt-error">
          <h2>레시피 추출에 실패했어요</h2>
          <p>{extractionError}</p>
          <div className="web-yt-actions">
            <WebButton onClick={handleRetryExtraction}>다시 시도</WebButton>
            <WebButton onClick={handleReenter} variant="secondary">
              다른 영상 입력
            </WebButton>
          </div>
        </section>
      ) : null}

      {currentStep === "review" ? (
        <section className="web-yt-content web-yt-review">
          <div>
            <h2>추출 결과를 확인해주세요</h2>
            <p>영상에서 찾은 재료와 조리 과정을 등록 전에 확인해요.</p>
          </div>
          {desktopRegisterRequirements.length > 0 ? (
            <div
              className="web-menu-add-error"
              data-testid="youtube-register-requirements"
              role="status"
            >
              등록 전 확인 필요: {desktopRegisterRequirements.join(", ")}
            </div>
          ) : null}
          {isEmbedded ? (
            <div className="web-yt-actions" data-testid="youtube-embedded-review-actions">
              <WebButton
                disabled={!canRegister || isRegistering}
                onClick={handleRegister}
              >
                {isRegistering ? "등록 중..." : "등록"}
              </WebButton>
            </div>
          ) : null}
          <ReviewStep
            title={title}
            onTitleChange={setTitle}
            baseServings={baseServings}
            onServingsChange={setBaseServings}
            extractionMethods={extractionMethods}
            classificationStatus={classificationStatus}
            classificationReasons={classificationReasons}
            draftWarnings={draftWarnings}
            blockingIssues={blockingIssues}
            ingredients={ingredients}
            steps={steps}
            onUpdateIngredient={handleUpdateIngredient}
            onResolveIngredientCandidate={handleResolveIngredientCandidate}
            onReplaceIngredient={handleReplaceIngredient}
            onRegisterIngredient={handleRegisterIngredient}
            onRemoveIngredient={handleRemoveIngredient}
            onRemoveStep={handleRemoveStep}
            onAddIngredient={() => setModalMode("ingredient-add")}
            onAddStep={() => setModalMode("step-add")}
            onEditStep={(tempId) => {
              setEditingStepId(tempId);
              setModalMode("step-edit");
            }}
          />
        </section>
      ) : null}

      {currentStep === "complete" && registeredRecipeId ? (
        <section className="web-yt-content web-yt-complete">
          <h2>레시피가 등록됐어요</h2>
          <p>&lsquo;{registeredRecipeTitle}&rsquo;가 레시피북에 저장됐어요.</p>
          <div className="web-yt-actions">
            {hasPlanContext ? (
              <WebButton onClick={handleMealAdd}>이 끼니에 추가</WebButton>
            ) : null}
            <WebButton
              onClick={handleViewDetail}
              variant={hasPlanContext ? "secondary" : "primary"}
            >
              레시피 상세 보기
            </WebButton>
            <WebButton onClick={handleClose} variant="ghost">
              닫기
            </WebButton>
          </div>
        </section>
      ) : null}
    </DesktopImportFrame>
  );

  const desktopModals = (
    <>
      {modalMode === "ingredient-add" && (
        <RecipeIngredientAddModal
          emptyActionLabel={canRegisterReplacingIngredient ? "새 재료로 등록" : undefined}
          onClose={() => {
            setReplacingIngredientId(null);
            setModalMode("none");
          }}
          onAdd={handleAddIngredient}
          onEmptyAction={canRegisterReplacingIngredient ? handleRegisterReplacingIngredient : undefined}
        />
      )}
      {(modalMode === "step-add" || modalMode === "step-edit") && (
        <StepAddModal
          onClose={() => {
            setEditingStepId(null);
            setModalMode("none");
          }}
          onAdd={handleAddStep}
          cookingMethods={cookingMethods}
          nextStepNumber={editingStep?.step_number ?? steps.length + 1}
          initialStep={editingStep}
        />
      )}
      {modalMode === "ingredient-register" && registeringIngredientId && (() => {
        const target = ingredients.find((i) => i.tempId === registeringIngredientId);
        if (!target) return null;
        return (
          <IngredientRegisterModal
            ingredient={target}
            extractionId={extractionId}
            onClose={() => {
              setRegisteringIngredientId(null);
              setModalMode("none");
            }}
            onSuccess={handleIngredientRegistered}
          />
        );
      })()}
      {modalMode === "register-error" && registerError && (
        <RegisterErrorModal
          errorMessage={registerError}
          onRetry={() => {
            setModalMode("none");
            handleRegister();
          }}
          onClose={() => setModalMode("none")}
        />
      )}
      {modalMode === "confirm-back" && (
        <ConfirmBackModal
          onConfirm={handleConfirmBack}
          onCancel={() => setModalMode("none")}
        />
      )}
      {modalMode === "servings-input" && (
        <ServingsInputModal
          onConfirm={handleServingsConfirm}
          onCancel={() => setModalMode("none")}
          defaultServings={baseServings}
          isCreating={isCreatingMeal}
          error={mealAddError}
        />
      )}
    </>
  );

  if (isDesktopViewport) {
    if (isEmbedded) {
      return (
        <div className="web-yt-embedded" data-testid="youtube-import-embedded">
          {desktopImportCard}
          {desktopModals}
        </div>
      );
    }

    return (
      <div className="web-menu-add-shell">
        <WebShell>
          <WebTopNav activeId="planner" items={WEB_NAV_ITEMS} />
          <nav aria-label="유튜브 가져오기 경로" className="web-breadcrumb">
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
            <span className="web-breadcrumb-current">유튜브 가져오기</span>
          </nav>

          <div className="web-yt-head">
            <div>
              <p className="web-menu-add-eyebrow">유튜브 가져오기</p>
              <h1>영상 링크에서 레시피를 추출해요</h1>
              <p>링크 입력부터 결과 검토까지 한 화면 흐름으로 이어집니다.</p>
            </div>
            <div className="web-manual-actions">
              {currentStep !== "complete" ? (
                <WebButton onClick={handleBack} variant="secondary">
                  뒤로
                </WebButton>
              ) : null}
              {currentStep === "review" ? (
                <WebButton
                  disabled={!canRegister || isRegistering}
                  onClick={handleRegister}
                >
                  {isRegistering ? "등록 중..." : "등록"}
                </WebButton>
              ) : null}
            </div>
          </div>

          {desktopImportCard}
        </WebShell>
        {desktopModals}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {currentStep !== "complete" && (
        <AppBar
          step={currentStep}
          onBack={handleBack}
          onRegister={handleRegister}
          canRegister={canRegister}
          isRegistering={isRegistering}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {currentStep === "url-input" && (
          <UrlInputStep
            url={youtubeUrl}
            onUrlChange={(val) => {
              setYoutubeUrl(val);
              setUrlError(null);
            }}
            onSubmit={handleValidate}
            isValidating={isValidating}
            urlError={urlError}
          />
        )}

        {currentStep === "preview" && videoInfo && (
          <PreviewStep
            videoInfo={videoInfo}
            onExtract={triggerExtraction}
            onReenter={handleReenter}
          />
        )}

        {currentStep === "non-recipe-warning" && videoInfo && (
          <NonRecipeWarningStep
            videoInfo={videoInfo}
            classificationReasons={classificationReasons}
            onReenter={handleReenter}
          />
        )}

        {currentStep === "extracting" && !extractionError && (
          <ExtractionProgressStep
            videoTitle={videoInfo?.title ?? ""}
            elapsedMs={extractionElapsedMs}
          />
        )}

        {currentStep === "extracting" && extractionError && (
          <ExtractionErrorStep
            errorMessage={extractionError}
            onRetry={handleRetryExtraction}
            onReenter={handleReenter}
          />
        )}

        {currentStep === "review" && (
          <ReviewStep
            title={title}
            onTitleChange={setTitle}
            baseServings={baseServings}
            onServingsChange={setBaseServings}
            extractionMethods={extractionMethods}
            classificationStatus={classificationStatus}
            classificationReasons={classificationReasons}
            draftWarnings={draftWarnings}
            blockingIssues={blockingIssues}
            ingredients={ingredients}
            steps={steps}
            onUpdateIngredient={handleUpdateIngredient}
            onResolveIngredientCandidate={handleResolveIngredientCandidate}
            onReplaceIngredient={handleReplaceIngredient}
            onRegisterIngredient={handleRegisterIngredient}
            onRemoveIngredient={handleRemoveIngredient}
            onRemoveStep={handleRemoveStep}
            onAddIngredient={() => setModalMode("ingredient-add")}
            onAddStep={() => setModalMode("step-add")}
            onEditStep={(tempId) => {
              setEditingStepId(tempId);
              setModalMode("step-edit");
            }}
          />
        )}

        {currentStep === "complete" && registeredRecipeId && (
          <CompleteStep
            recipeTitle={registeredRecipeTitle}
            hasPlanContext={hasPlanContext}
            onMealAdd={handleMealAdd}
            onViewDetail={handleViewDetail}
            onClose={handleClose}
          />
        )}
      </div>

      {/* Modals */}
      {modalMode === "ingredient-add" && (
        <RecipeIngredientAddModal
          emptyActionLabel={canRegisterReplacingIngredient ? "새 재료로 등록" : undefined}
          onClose={() => {
            setReplacingIngredientId(null);
            setModalMode("none");
          }}
          onAdd={handleAddIngredient}
          onEmptyAction={canRegisterReplacingIngredient ? handleRegisterReplacingIngredient : undefined}
        />
      )}
      {(modalMode === "step-add" || modalMode === "step-edit") && (
        <StepAddModal
          onClose={() => {
            setEditingStepId(null);
            setModalMode("none");
          }}
          onAdd={handleAddStep}
          cookingMethods={cookingMethods}
          nextStepNumber={editingStep?.step_number ?? steps.length + 1}
          initialStep={editingStep}
        />
      )}
      {modalMode === "ingredient-register" && registeringIngredientId && (() => {
        const target = ingredients.find((i) => i.tempId === registeringIngredientId);
        if (!target) return null;
        return (
          <IngredientRegisterModal
            ingredient={target}
            extractionId={extractionId}
            onClose={() => {
              setRegisteringIngredientId(null);
              setModalMode("none");
            }}
            onSuccess={handleIngredientRegistered}
          />
        );
      })()}
      {modalMode === "register-error" && registerError && (
        <RegisterErrorModal
          errorMessage={registerError}
          onRetry={() => {
            setModalMode("none");
            handleRegister();
          }}
          onClose={() => setModalMode("none")}
        />
      )}
      {modalMode === "confirm-back" && (
        <ConfirmBackModal
          onConfirm={handleConfirmBack}
          onCancel={() => setModalMode("none")}
        />
      )}
      {modalMode === "servings-input" && (
        <ServingsInputModal
          onConfirm={handleServingsConfirm}
          onCancel={() => setModalMode("none")}
          defaultServings={baseServings}
          isCreating={isCreatingMeal}
          error={mealAddError}
        />
      )}
    </div>
  );
}
