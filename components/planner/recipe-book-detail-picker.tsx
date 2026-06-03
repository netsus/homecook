"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { MealAddServingsModal } from "@/components/planner/meal-add-servings-modal";
import { MealAddTargetBadge } from "@/components/planner/meal-add-target-badge";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import {
  WebEmptyState,
  WebRecipeCard,
  WebSkeleton,
} from "@/components/web";
import { fetchRecipeBookRecipes } from "@/lib/api/recipe";
import { resolveRecipeImage } from "@/lib/recipe-image";
import type { RecipeBookRecipeItem, RecipeBookSummary } from "@/types/recipe";

type RecipeBookDetailPresentation = "dialog" | "screen" | "web" | "sheet";

export interface RecipeBookDetailPickerProps {
  book: RecipeBookSummary;
  selectedRecipe: RecipeBookRecipeItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: RecipeBookRecipeItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onBack: () => void;
  presentation?: RecipeBookDetailPresentation;
  slotLabel?: string;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Recipe Card ─────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: RecipeBookRecipeItem;
  onSelect: (recipe: RecipeBookRecipeItem) => void;
  presentation?: RecipeBookDetailPresentation;
}

function RecipeThumb({ recipe }: { recipe: RecipeBookRecipeItem }) {
  return (
    <Image
      alt=""
      className="h-full w-full object-cover"
      height={120}
      src={resolveRecipeImage(recipe)}
      unoptimized
      width={160}
    />
  );
}

function RecipeCard({ recipe, onSelect, presentation = "dialog" }: RecipeCardProps) {
  if (presentation === "screen" || presentation === "sheet") {
    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] text-left active:border-[var(--brand)] active:bg-[var(--brand-soft)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--surface-fill)]">
          <RecipeThumb recipe={recipe} />
        </div>
        <div className="p-2.5">
          <h3 className="truncate text-[13px] font-bold text-[var(--foreground)]">
            {recipe.title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
            {recipe.tags.slice(0, 2).join(" · ") || "저장한 레시피"}
          </p>
          <span className="mt-2 inline-flex rounded-[var(--radius-badge)] bg-[var(--brand-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--brand)]">
            선택
          </span>
        </div>
      </button>
    );
  }

  if (presentation === "web") {
    const meta = formatRecipeBookRecipeMeta(recipe.tags);

    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="web-picker-recipe-card"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <WebRecipeCard
          alt={recipe.title}
          imageSrc={resolveRecipeImage(recipe)}
          meta={meta}
          title={recipe.title}
        />
        <span className="web-picker-select-badge">선택</span>
      </button>
    );
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_var(--shadow-color-soft)]">
      <h3 className="line-clamp-2 text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
        {recipe.title}
      </h3>
      {recipe.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full bg-[var(--brand-alpha-10)] px-2 py-0.5 text-xs font-semibold text-[var(--brand)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        className="mt-3 h-[var(--control-height-md)] w-full rounded-[var(--radius-card)] bg-[var(--brand)] text-base font-semibold text-[var(--text-inverse)] hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        선택
      </button>
    </div>
  );
}

// ─── Servings Modal ───────────────────────────────────────

interface ServingsModalProps {
  recipe: RecipeBookRecipeItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  slotLabel?: string;
}

function ServingsModal({
  recipe,
  isCreating,
  onConfirm,
  onCancel,
  slotLabel,
}: ServingsModalProps) {
  return (
    <MealAddServingsModal
      initialServings={recipe.base_servings}
      isCreating={isCreating}
      metaText={`기본 ${recipe.base_servings}인분`}
      onCancel={onCancel}
      onConfirm={onConfirm}
      recipeTitle={recipe.title}
      targetLabel={slotLabel}
      thumbnail={<RecipeThumb recipe={recipe} />}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecipeBookDetailPicker({
  book,
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
  onBack,
  presentation = "dialog",
  slotLabel,
}: RecipeBookDetailPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [recipes, setRecipes] = useState<RecipeBookRecipeItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const response = await fetchRecipeBookRecipes(book.id, { limit: 20 });

    if (!response.success || !response.data) {
      setLoadState("error");
      setErrorMessage(response.error?.message ?? "레시피를 불러오지 못했어요.");
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
  }, [book.id]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const content = (
    <>
      {loadState === "loading" && (
        <div className={presentation === "web" ? "web-picker-grid web-picker-grid-four" : "py-8 text-center text-sm text-[var(--muted)]"} aria-busy="true">
          {presentation === "web" ? (
            Array.from({ length: 8 }).map((_, index) => (
              <WebSkeleton className="h-[190px]" key={index} />
            ))
          ) : (
            "레시피 불러오는 중..."
          )}
        </div>
      )}

      {loadState === "empty" && (
        presentation === "web" ? (
          <WebEmptyState
            description="레시피를 저장하면 이 레시피북에 추가돼요."
            icon="🍳"
            title="레시피가 없어요"
          />
        ) : (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              레시피가 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              레시피를 저장하면 이 레시피북에 추가돼요.
            </p>
          </div>
        )
      )}

      {loadState === "error" && (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {loadState === "ready" && recipes.length > 0 && (
        <div className={presentation === "screen" || presentation === "sheet" ? "grid grid-cols-2 gap-2.5" : presentation === "web" ? "web-picker-grid web-picker-grid-four" : "space-y-3"}>
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.recipe_id}
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
      <div className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton onClick={onBack} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            {book.name}
          </h1>
          <AppBackButtonSpacer />
        </div>
        {slotLabel ? (
          <div className="px-4 pt-3.5">
            <MealAddTargetBadge label={slotLabel} />
          </div>
        ) : null}
        <div className="p-3 pb-[112px]">{content}</div>
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
        <Wave1MobileBottomTab ariaLabel="레시피북 상세 하단 탭" currentTab="planner" />
      </div>
    );
  }

  if (presentation === "sheet") {
    return (
      <>
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
      </>
    );
  }

  if (presentation === "web") {
    return (
      <section className="web-picker-section" aria-label={`${book.name} 레시피`}>
        <div className="web-picker-section-head">
          <button
            aria-label="레시피북 목록으로"
            className="web-breadcrumb-link"
            onClick={onBack}
            type="button"
          >
            ‹ 레시피북 목록
          </button>
        </div>
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[var(--overlay-42)] p-4 backdrop-blur-[1px] lg:items-center lg:justify-center"
      onClick={onBack}
    >
      <div
        aria-labelledby="recipebook-detail-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[var(--radius-sheet)] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center gap-2">
          <AppBackButton onClick={onBack} />
          <h2
            className="flex-1 text-xl font-bold text-[var(--foreground)]"
            id="recipebook-detail-title"
          >
            {book.name}
          </h2>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">{content}</div>
      </div>

      {selectedRecipe && (
        <ServingsModal
          isCreating={isCreating}
          onCancel={onServingsCancel}
          onConfirm={onServingsConfirm}
          recipe={selectedRecipe}
        />
      )}
    </div>
  );
}

function formatRecipeBookRecipeMeta(tags: string[]) {
  const joined = tags.slice(0, 2).join(" · ");
  if (!joined) {
    return "저장한 레시피";
  }

  return joined.length > 20 ? `${joined.slice(0, 20)}...` : joined;
}
