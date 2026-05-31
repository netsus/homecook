import React from "react";
import Link from "next/link";

import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import type { RecipeCardItem } from "@/types/recipe";

interface RecipeCardProps {
  isSaved?: boolean;
  onSave?: (recipe: RecipeCardItem) => void;
  recipe: RecipeCardItem;
}

export function RecipeCard({ isSaved = false, onSave, recipe }: RecipeCardProps) {
  const remainingTagCount = Math.max(recipe.tags.length - 3, 0);
  const presentation = getRecipePresentation(recipe);
  const badgeLabel =
    recipe.save_count > 100 ? "인기" : formatRecipeSourceLabel(recipe.source_type);

  return (
    <article className="group relative flex min-h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[0px_2px_8px_var(--shadow-color-soft)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_var(--shadow-color-medium)] active:scale-[0.99] active:shadow-[0px_4px_12px_var(--shadow-color-medium)]">
      <Link
        className="relative block overflow-hidden"
        href={`/recipe/${recipe.id}`}
      >
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: "16/9" }}
        >
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-105"
            data-slot="recipe-card-image-layer"
            style={
              recipe.thumbnail_url
                ? {
                    backgroundImage: `linear-gradient(var(--foreground-alpha-03),var(--foreground-alpha-18)),url(${recipe.thumbnail_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {
                    background: presentation.gradient,
                  }
            }
          >
            {!recipe.thumbnail_url ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 grid place-items-center text-[88px]"
              >
                {presentation.emoji}
              </span>
            ) : null}
          </div>
          <span className="absolute left-3 top-3 inline-flex min-h-6 items-center justify-center rounded-[var(--radius-badge)] bg-[var(--surface-alpha-92)] px-2 text-center text-[11px] font-bold leading-none text-[var(--brand)] shadow-[0_1px_4px_var(--shadow-color-medium)]">
            {badgeLabel}
          </span>
        </div>
      </Link>
      <button
        aria-label={`${recipe.title} 저장`}
        aria-pressed={isSaved}
        className={[
          "absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-alpha-94)] shadow-[0_1px_5px_var(--shadow-color-panel)]",
          isSaved ? "text-[var(--brand)]" : "text-[var(--text-2)]",
        ].join(" ")}
        data-testid="recipe-card-bookmark"
        onClick={() => onSave?.(recipe)}
        type="button"
      >
        <BookmarkIcon filled={isSaved} />
      </button>
      <div className="flex flex-1 flex-col gap-2 px-4 py-4">
        <Link href={`/recipe/${recipe.id}`}>
          <h3 className="line-clamp-2 text-[18px] font-bold leading-snug text-[var(--foreground)]">
            {recipe.title}
          </h3>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-[var(--text-2)]">
          <span className="inline-flex items-center gap-1">
            <EyeIcon />
            <span>조회 {formatCount(recipe.view_count)}</span>
          </span>
          <span>·</span>
          <span>저장 {formatCount(recipe.save_count)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)]"
            >
              {tag}
            </span>
          ))}
          {remainingTagCount ? (
            <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)]">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 3h12v18l-6-4-6 4V3z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-[var(--text-2)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function getRecipePresentation(recipe: RecipeCardItem) {
  const emojiByTag = [
    { keyword: "밥", emoji: "🍚" },
    { keyword: "김치", emoji: "🥘" },
    { keyword: "찌개", emoji: "🍲" },
    { keyword: "면", emoji: "🍜" },
    { keyword: "고기", emoji: "🥩" },
    { keyword: "채소", emoji: "🥬" },
  ];
  const sourceText = [recipe.title, ...recipe.tags].join(" ");
  const matched = emojiByTag.find((item) => sourceText.includes(item.keyword));
  const fallbackEmojis = ["🍳", "🥗", "🍛", "🥘"];
  const index = recipe.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const emoji = matched?.emoji ?? fallbackEmojis[index % fallbackEmojis.length]!;
  const gradients = [
    "linear-gradient(135deg,var(--accent-peach-soft) 0%,var(--accent-peach) 100%)",
    "linear-gradient(135deg,var(--brand-soft),var(--accent-gold-soft))",
    "linear-gradient(135deg,var(--accent-green-soft),var(--brand-soft))",
    "linear-gradient(135deg,var(--accent-blue-soft),var(--accent-gold-soft))",
  ];
  const gradient = /밥|김치/.test(sourceText)
    ? gradients[0]!
    : gradients[index % gradients.length]!;

  return {
    emoji,
    gradient,
  };
}
