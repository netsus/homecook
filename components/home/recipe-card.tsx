import React from "react";
import Link from "next/link";

import { formatCount } from "@/lib/recipe";
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
          {recipe.source_type}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div>
          <h3 className="line-clamp-2 text-base font-semibold text-[var(--foreground)]">
            {recipe.title}
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            기본 {recipe.base_servings}인분
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[color:rgba(46,166,122,0.1)] px-3 py-1 text-xs font-semibold text-[var(--olive)]"
            >
              #{tag}
            </span>
          ))}
          {remainingTagCount ? (
            <span className="rounded-full bg-[color:rgba(0,0,0,0.05)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-2 text-xs text-[var(--muted)]">
          <div className="rounded-[12px] bg-[color:rgba(0,0,0,0.03)] px-3 py-2">
            <dt>조회</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatCount(recipe.view_count)}
            </dd>
          </div>
          <div className="rounded-[12px] bg-[color:rgba(0,0,0,0.03)] px-3 py-2">
            <dt>좋아요</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatCount(recipe.like_count)}
            </dd>
          </div>
          <div className="rounded-[12px] bg-[color:rgba(0,0,0,0.03)] px-3 py-2">
            <dt>저장</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatCount(recipe.save_count)}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
