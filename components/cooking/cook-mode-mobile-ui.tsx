"use client";

import React, { useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import type {
  CookingModeIngredient,
  CookingModeRecipe,
  CookingModeStep,
} from "@/types/cooking";

type MobileCookModeVariant = "planner" | "standalone";

interface MobileCookModeViewProps {
  recipe: CookingModeRecipe;
  variant: MobileCookModeVariant;
  screenTestId: string;
  contentTestId: string;
  titleTestId: string;
  servingsTestId: string;
  cancelButtonTestId: string;
  completeButtonTestId: string;
  controlsDisabled: boolean;
  onCancel: () => void;
  onComplete: () => void;
}

interface MethodVisual {
  bg: string;
  border: string;
  label: string;
  text: string;
}

const METHOD_VISUALS = {
  blanch: {
    bg: "#E8F5D8",
    border: "#A9E34B",
    label: "데치기",
    text: "#5C940D",
  },
  boil: { bg: "#FFEBEB", border: "#FF6B6B", label: "끓이기", text: "#C92A2A" },
  fry: { bg: "#FFF9DB", border: "#FFD43B", label: "튀기기", text: "#B38B00" },
  mix: { bg: "#D3F9D8", border: "#51CF66", label: "무치기", text: "#2B8A3E" },
  prep: { bg: "#F1F3F5", border: "#ADB5BD", label: "준비", text: "#495057" },
  roast: { bg: "#F1E8DC", border: "#A0826D", label: "굽기", text: "#7C5A3F" },
  steam: { bg: "#E0F0FF", border: "#74C0FC", label: "찌기", text: "#1971C2" },
  stirfry: { bg: "#FFF4E8", border: "#FFB347", label: "볶기", text: "#D97706" },
} as const satisfies Record<string, MethodVisual>;

const METHOD_ALIASES: Record<string, keyof typeof METHOD_VISUALS> = {
  bake: "fry",
  blanch: "blanch",
  blue: "steam",
  boil: "boil",
  brown: "roast",
  deep_fry: "fry",
  fry: "fry",
  gray: "prep",
  green: "mix",
  grill: "roast",
  mix: "mix",
  orange: "stirfry",
  other: "prep",
  prep: "prep",
  raw: "mix",
  red: "boil",
  roast: "roast",
  steam: "steam",
  stir_fry: "stirfry",
  stirfry: "stirfry",
  unassigned: "prep",
  yellow: "fry",
};

export function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobileViewport(query.matches);
    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

  return isMobileViewport;
}

export function MobileCookModeView({
  recipe,
  variant,
  screenTestId,
  contentTestId,
  titleTestId,
  servingsTestId,
  cancelButtonTestId,
  completeButtonTestId,
  controlsDisabled,
  onCancel,
  onComplete,
}: MobileCookModeViewProps) {
  const eyebrow =
    variant === "standalone" ? "요리 모드 · 독립 요리" : "요리 모드 · 4/23 점심";
  const currentTab = variant === "standalone" ? "home" : "planner";

  return (
    <div
      className="relative min-h-dvh overflow-hidden bg-[#0E1014] text-white"
      data-testid={screenTestId}
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
      }}
    >
      <div className="flex min-h-dvh flex-col pb-[96px]">
        <header className="flex items-center justify-between px-4 pb-[14px] pt-[52px]">
          <button
            aria-label="뒤로"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.10)] text-white"
            onClick={onCancel}
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <div className="min-w-0 flex-1 px-3 text-center">
            <p className="mb-0.5 text-[11px] font-bold leading-[1.3] text-white/65">
              {eyebrow}
            </p>
            <h1
              className="truncate text-[17px] font-black leading-[1.12] text-white/95 [font-family:var(--font-jua),-apple-system,sans-serif]"
              data-testid={titleTestId}
            >
              {recipe.title}
            </h1>
            <p
              className="text-[13px] font-bold leading-[1.2] text-white [font-family:var(--font-jua),-apple-system,sans-serif]"
              data-testid={servingsTestId}
            >
              {recipe.steps.length}단계
            </p>
          </div>
          <div aria-hidden="true" className="h-9 w-9" />
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
          data-testid={contentTestId}
        >
          <MobileStepList recipeTitle={recipe.title} steps={recipe.steps} />
          <MobileIngredientArchive ingredients={recipe.ingredients} />
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-[80px] z-40 mx-auto max-w-[430px] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.50))] px-4 pb-[18px] pt-3">
        <div className="flex items-center gap-2">
          <button
            className="flex h-14 shrink-0 items-center justify-center rounded-xl border-0 bg-[rgba(255,255,255,0.12)] px-5 text-[14px] font-bold text-white disabled:opacity-60"
            data-testid={cancelButtonTestId}
            disabled={controlsDisabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-xl border-0 bg-[#2AC1BC] px-4 text-[16px] font-extrabold leading-none text-white disabled:opacity-60 [font-family:var(--font-jua),-apple-system,sans-serif]"
            data-testid={completeButtonTestId}
            disabled={controlsDisabled}
            onClick={onComplete}
            type="button"
          >
            요리 완료
          </button>
        </div>
      </div>

      <Wave1MobileBottomTab
        ariaLabel="요리모드 하단 탭"
        currentTab={currentTab}
      />
    </div>
  );
}

function MobileStepList({
  recipeTitle,
  steps,
}: {
  recipeTitle: string;
  steps: CookingModeStep[];
}) {
  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm font-medium text-white/70">
        등록된 조리 과정이 없어요.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" data-testid="step-list">
      {steps.map((step) => {
        const method = getMethodVisual(step);
        const title = getMobileStepTitle(recipeTitle, step);

        return (
          <li
            className="rounded-2xl p-5 text-[#1A1A2E]"
            data-testid="step-item"
            key={step.step_number}
            style={{
              background: method.bg,
              borderLeft: `5px solid ${method.border}`,
            }}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-[3px] text-[11px] font-extrabold leading-[1.2] text-white"
                style={{ background: method.border }}
              >
                STEP {step.step_number}
              </span>
              <span
                className="rounded-full bg-white px-2 py-[3px] text-[11px] font-bold leading-[1.2]"
                style={{ color: method.text }}
              >
                {method.label}
              </span>
            </div>
            <h2 className="mb-2 text-[18px] font-extrabold leading-[1.3] [font-family:var(--font-jua),-apple-system,sans-serif]">
              {title}
            </h2>
            <p className="text-[15px] font-medium leading-[1.6] text-[#1A1A2E]">
              {step.instruction}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function MobileIngredientArchive({
  ingredients,
}: {
  ingredients: CookingModeIngredient[];
}) {
  if (ingredients.length === 0) {
    return null;
  }

  return (
    <section
      className="mt-[520px] pb-10"
      aria-labelledby="mobile-ingredients-heading"
    >
      <h2
        className="mb-3 text-sm font-bold text-white/70"
        id="mobile-ingredients-heading"
      >
        재료
      </h2>
      <ul className="flex flex-col gap-2" data-testid="ingredient-list">
        {ingredients.map((ingredient) => (
          <li
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-[#212529]"
            data-testid="ingredient-item"
            key={ingredient.ingredient_id}
          >
            <span className="text-sm font-semibold">
              {ingredient.standard_name}
            </span>
            <span className="text-sm font-medium text-[#495057]">
              {formatIngredientAmount(ingredient)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function getMethodVisual(step: CookingModeStep): MethodVisual {
  const key =
    step.cooking_method.color_key ||
    step.cooking_method.code ||
    step.cooking_method.label;
  const normalized = key?.toLowerCase().replace(/\s+/g, "_") ?? "prep";
  const methodKey = METHOD_ALIASES[normalized] ?? "prep";
  const visual = METHOD_VISUALS[methodKey];

  return {
    ...visual,
    label: step.cooking_method.label || visual.label,
  };
}

function getMobileStepTitle(recipeTitle: string, step: CookingModeStep) {
  const plannerTitles = ["재료 손질", "버무리기"];
  const standaloneTitles = [
    "양념장 만들기",
    "고기 재우기",
    "센불 볶기",
    "채소 넣기",
  ];

  if (recipeTitle.includes("닭가슴살")) {
    return plannerTitles[step.step_number - 1] ?? `${step.step_number}단계`;
  }

  if (recipeTitle.includes("제육")) {
    return standaloneTitles[step.step_number - 1] ?? `${step.step_number}단계`;
  }

  return `${step.step_number}단계`;
}

function formatIngredientAmount(ingredient: CookingModeIngredient) {
  if (ingredient.display_text) {
    return ingredient.display_text;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${ingredient.amount}${ingredient.unit ?? ""}`;
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M15 18 9 12l6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}
