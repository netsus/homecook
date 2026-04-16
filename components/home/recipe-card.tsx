import React from "react";
import Link from "next/link";

import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import type { RecipeCardItem } from "@/types/recipe";

interface RecipeCardProps {
  recipe: RecipeCardItem;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const remainingTagCount = Math.max(recipe.tags.length - 3, 0);

  return (
    <Link
      className="group flex min-h-full flex-col overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] transition hover:-translate-y-1"
      href={`/recipe/${recipe.id}`}
    >
      <div
        className="relative min-h-[110px] border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,108,60,0.22),rgba(255,249,242,0.85),rgba(46,166,122,0.18))]"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(rgba(26, 26, 46, 0.06), rgba(26, 26, 46, 0.22)), url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="absolute left-3 top-3 rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-deep)]">
          {formatRecipeSourceLabel(recipe.source_type)}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div className="space-y-1">
          <div className="recipe-card-tags-heading flex flex-wrap gap-x-2 gap-y-1">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-semibold tracking-[0.04em] text-[var(--olive)]"
              >
                #{tag}
              </span>
            ))}
            {remainingTagCount ? (
              <span className="text-[10px] font-semibold tracking-[0.04em] text-[var(--muted)]">
                +{remainingTagCount}
              </span>
            ) : null}
          </div>
          <div className="recipe-card-title-row flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 flex-1 text-base font-semibold text-[var(--foreground)]">
              {recipe.title}
            </h3>
            <span className="shrink-0 rounded-full border border-[color:rgba(255,108,60,0.14)] bg-[color:rgba(255,108,60,0.08)] px-2.5 py-1 text-[10px] font-semibold text-[#c84316]">
              기본 {recipe.base_servings}인분
            </span>
          </div>
        </div>
        <dl className="recipe-card-stats-pills mt-auto flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <div className="inline-flex items-center gap-1 rounded-full bg-[color:rgba(0,0,0,0.04)] px-2 py-1">
            <dt>조회</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.view_count)}
            </dd>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[color:rgba(0,0,0,0.04)] px-2 py-1">
            <dt>좋아요</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.like_count)}
            </dd>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[color:rgba(0,0,0,0.04)] px-2 py-1">
            <dt>저장</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.save_count)}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
