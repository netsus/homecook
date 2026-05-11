"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { fetchPantryMatchRecipes } from "@/lib/api/recipe";
import type { PantryMatchRecipeItem } from "@/types/recipe";

export interface PantryMatchPickerProps {
  selectedRecipe: PantryMatchRecipeItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: PantryMatchRecipeItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onClose: () => void;
  onBack?: () => void;
  presentation?: "dialog" | "screen";
  slotLabel?: string;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Match Score Badge ───────────────────────────────────────────────────────

interface MatchScoreBadgeProps {
  score: number;
}

function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const percentage = Math.round(score * 100);
  const colorClass =
    percentage >= 80
      ? "bg-green-100 text-green-800"
      : percentage >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-gray-100 text-gray-800";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {percentage}% 일치
    </span>
  );
}

// ─── Pantry Recipe Card ──────────────────────────────────────────────────────

interface PantryRecipeCardProps {
  recipe: PantryMatchRecipeItem;
  onSelect: (recipe: PantryMatchRecipeItem) => void;
  presentation?: "dialog" | "screen";
}

function PantryRecipeCard({ recipe, onSelect, presentation = "dialog" }: PantryRecipeCardProps) {
  if (presentation === "screen") {
    const percentage = Math.round(recipe.match_score * 100);

    return (
      <button
        className="mb-2 flex w-full gap-3 rounded-[12px] border border-[#DEE2E6] bg-white p-3 text-left"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#E6F8F7] text-[28px]">
          {recipe.thumbnail_url ? (
            <Image
              alt=""
              className="h-full w-full object-cover"
              height={64}
              src={recipe.thumbnail_url}
              unoptimized
              width={64}
            />
          ) : (
            "🍳"
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[#212529]">
            {recipe.title}
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#F1F3F5]">
            <span
              className="block h-full rounded-full bg-[#2AC1BC]"
              style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }}
            />
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[11px] font-bold text-[#868E96]">
            <span className="text-[#20A8A4]">매칭 {percentage}%</span>
            <span>
              {recipe.matched_ingredients}/{recipe.total_ingredients}개 보유
            </span>
          </span>
          {recipe.missing_ingredients.length > 0 ? (
            <span className="mt-1 block truncate text-[11px] text-[#868E96]">
              부족 ·{" "}
              {recipe.missing_ingredients
                .slice(0, 3)
                .map((ingredient) => ingredient.standard_name)
                .join(", ")}
            </span>
          ) : null}
          <span className="sr-only">선택</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex-1 line-clamp-2 text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
          {recipe.title}
        </h3>
        <MatchScoreBadge score={recipe.match_score} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>
          {recipe.matched_ingredients}/{recipe.total_ingredients} 재료 보유
        </span>
      </div>
      {recipe.missing_ingredients.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-[var(--muted)]">부족한 재료:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {recipe.missing_ingredients.slice(0, 5).map((ingredient) => (
              <span
                key={ingredient.id}
                className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
              >
                {ingredient.standard_name}
              </span>
            ))}
            {recipe.missing_ingredients.length > 5 && (
              <span className="inline-flex items-center px-2 py-0.5 text-xs text-[var(--muted)]">
                +{recipe.missing_ingredients.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
      <button
        className="mt-3 h-11 w-full rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        선택
      </button>
    </div>
  );
}

// ─── Servings Modal ──────────────────────────────────────────────────────────

interface ServingsModalProps {
  recipe: PantryMatchRecipeItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  presentation?: "dialog" | "screen";
  slotLabel?: string;
}

function ServingsModal({
  recipe,
  isCreating,
  onConfirm,
  onCancel,
  presentation = "dialog",
  slotLabel,
}: ServingsModalProps) {
  const [servings, setServings] = useState(2);

  const handleConfirm = useCallback(() => {
    if (servings < 1) return;
    onConfirm(servings);
  }, [servings, onConfirm]);

  if (presentation === "screen") {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-black/42" onClick={onCancel}>
        <div
          aria-labelledby="servings-modal-title"
          aria-modal="true"
          className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="flex justify-center pb-4">
            <div className="h-1 w-9 rounded-full bg-[#DEE2E6]" />
          </div>
          <h2 className="text-[20px] font-bold text-[#212529]" id="servings-modal-title">
            플래너에 추가
          </h2>
          <p className="mt-1 text-[13px] text-[#868E96]">
            {slotLabel ? `${slotLabel}에 추가할 인분을 선택해주세요.` : "추가할 인분을 선택해주세요."}
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] p-2.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#E6F8F7] text-[22px]">
              🍳
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-[#212529]">
                {recipe.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-[#868E96]">
                선택 {servings}인분
              </span>
            </span>
          </div>
          {slotLabel ? (
            <div className="mt-3 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-3.5 py-3 text-[14px] font-bold text-[#495057]">
              {slotLabel}
            </div>
          ) : null}
          <p className="mt-3 text-[13px] font-bold text-[#495057]">인분</p>
          <div className="mt-3 [&>div]:w-full">
            <NumericStepperCompact
              disabled={isCreating}
              min={1}
              onChange={setServings}
              unit="인분"
              value={servings}
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              className="h-11 flex-1 rounded-[10px] border border-[#DEE2E6] bg-white text-[14px] font-bold text-[#495057]"
              disabled={isCreating}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="h-11 flex-1 rounded-[10px] bg-[#2AC1BC] text-[14px] font-bold text-white disabled:opacity-50"
              disabled={isCreating || servings < 1}
              onClick={handleConfirm}
              type="button"
            >
              {isCreating ? "추가 중..." : "추가하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onCancel}
    >
      <div
        aria-labelledby="servings-modal-title"
        aria-modal="true"
        className="glass-panel w-full max-w-md rounded-[24px] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2
          className="text-lg font-bold text-[var(--foreground)]"
          id="servings-modal-title"
        >
          계획 인분 입력
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{recipe.title}</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <NumericStepperCompact
            disabled={isCreating}
            min={1}
            onChange={setServings}
            unit="인분"
            value={servings}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <button
            className="h-11 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--foreground)] hover:bg-[var(--line)]"
            disabled={isCreating}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-11 flex-1 rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)] disabled:opacity-50"
            disabled={isCreating || servings < 1}
            onClick={handleConfirm}
            type="button"
          >
            {isCreating ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PantryMatchPicker({
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
  onClose,
  onBack,
  presentation = "dialog",
  slotLabel,
}: PantryMatchPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [recipes, setRecipes] = useState<PantryMatchRecipeItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPantryMatches = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const response = await fetchPantryMatchRecipes({ limit: 20 });

    if (!response.success || !response.data) {
      setLoadState("error");
      setErrorMessage(response.error?.message ?? "팬트리 기반 추천을 불러오지 못했어요.");
      setRecipes([]);
      return;
    }

    if (response.data.items.length === 0) {
      setLoadState("empty");
      setRecipes([]);
    } else {
      setLoadState("ready");
      setRecipes(response.data.items);
    }
  }, []);

  useEffect(() => {
    loadPantryMatches();
  }, [loadPantryMatches]);

  const content = (
    <>
      {loadState === "loading" && (
        <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
          추천 레시피 불러오는 중...
        </div>
      )}

      {loadState === "empty" && (
        <div className="py-8 text-center">
          <p className="text-base font-semibold text-[var(--foreground)]">
            추천 레시피가 없어요
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            팬트리에 재료를 추가하면 추천 레시피를 볼 수 있어요.
          </p>
        </div>
      )}

      {loadState === "error" && (
        <div
          className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {loadState === "ready" && recipes.length > 0 && (
        <div className={presentation === "screen" ? "" : "space-y-3"}>
          {recipes.map((recipe) => (
            <PantryRecipeCard
              key={recipe.id}
              onSelect={onRecipeSelect}
              presentation={presentation}
              recipe={recipe}
            />
          ))}
        </div>
      )}
    </>
  );

  if (presentation === "screen") {
    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-[112px] text-[#212529]">
        <div className="flex min-h-[52px] items-center border-b border-[#DEE2E6] bg-white px-2">
          <button
            aria-label="뒤로"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[28px] leading-none text-[#212529]"
            onClick={onBack ?? onClose}
            type="button"
          >
            ‹
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[#212529]">
            팬트리 기반 추천
          </h1>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>
        <div className="border-b border-[#DEE2E6] bg-[#E6F8F7] px-4 py-3.5">
          <p className="text-[12px] font-bold leading-[1.5] text-[#20A8A4]">
            팬트리에 있는 재료로 만들 수 있는 요리부터 보여드려요. 부족한 재료는 장보기 목록으로 모아보세요.
          </p>
        </div>
        <div className="p-3 pb-[112px]">{content}</div>
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            presentation="screen"
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
        <Wave1MobileBottomTab ariaLabel="팬트리 추천 하단 탭" currentTab="planner" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="pantry-match-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[24px] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-xl font-bold text-[var(--foreground)]"
            id="pantry-match-title"
          >
            팬트리 기반 추천
          </h2>
          <button
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--line)]"
            onClick={onClose}
            type="button"
          >
            <svg
              fill="none"
              height="20"
              viewBox="0 0 20 20"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 5L15 15M5 15L15 5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">{content}</div>
      </div>

      {selectedRecipe && (
        <ServingsModal
          isCreating={isCreating}
          onCancel={onServingsCancel}
          onConfirm={onServingsConfirm}
          presentation={presentation}
          recipe={selectedRecipe}
        />
      )}
    </div>
  );
}
