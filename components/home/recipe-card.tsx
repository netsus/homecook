import React from "react";
import Link from "next/link";

import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import { resolveRecipeImage } from "@/lib/recipe-image";
import type { RecipeCardItem } from "@/types/recipe";

interface RecipeCardProps {
  isSaved?: boolean;
  onOpen?: (recipe: RecipeCardItem) => void;
  onSave?: (recipe: RecipeCardItem) => void;
  recipe: RecipeCardItem;
}

export function RecipeCard({ isSaved = false, onOpen, onSave, recipe }: RecipeCardProps) {
  const imageSrc = resolveRecipeImage(recipe);
  const badgeLabel =
    recipe.save_count > 100 ? "인기" : formatRecipeSourceLabel(recipe.source_type);

  return (
    <article className="group relative flex min-h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[0px_2px_8px_var(--shadow-color-soft)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0px_4px_12px_var(--shadow-color-medium)] active:-translate-y-0.5 active:shadow-[0px_4px_12px_var(--shadow-color-medium)]">
      <Link
        className="relative block overflow-hidden"
        href={`/recipe/${recipe.id}`}
        onClick={() => onOpen?.(recipe)}
      >
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: "16/9" }}
        >
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-105"
            data-slot="recipe-card-image-layer"
            style={{
              backgroundImage: `linear-gradient(var(--foreground-alpha-03),var(--foreground-alpha-18)),url(${imageSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
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
        <Link href={`/recipe/${recipe.id}`} onClick={() => onOpen?.(recipe)}>
          <h3 className="line-clamp-2 text-[18px] font-bold leading-snug text-[var(--foreground)]">
            {recipe.title}
          </h3>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-[var(--text-3)]">
          <span>조회 {formatCount(recipe.view_count)}</span>
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
