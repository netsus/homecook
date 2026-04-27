import React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import type { RecipeCardItem } from "@/types/recipe";

interface RecipeCardProps {
  recipe: RecipeCardItem;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const remainingTagCount = Math.max(recipe.tags.length - 3, 0);

  return (
    <Link
      className="group flex min-h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-2)] transition hover:-translate-y-1"
      href={`/recipe/${recipe.id}`}
    >
      <div
        className="relative min-h-[110px] border-b border-[var(--line)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),color-mix(in_srgb,var(--background)_85%,transparent),color-mix(in_srgb,var(--olive)_18%,transparent))]"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent),color-mix(in srgb, var(--foreground) 22%, transparent)),url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <Badge variant="brand" className="absolute left-3 top-3 uppercase tracking-[0.16em]" style={{ color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}>
          {formatRecipeSourceLabel(recipe.source_type)}
        </Badge>
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
            <span
              className="shrink-0 rounded-[var(--radius-full)] border border-[color-mix(in_srgb,var(--brand)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-2.5 py-1 text-[10px] font-semibold"
              style={{ color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}
            >
              기본 {recipe.base_servings}인분
            </span>
          </div>
        </div>
        <dl className="recipe-card-stats-pills mt-auto flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <div className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-2 py-1">
            <dt>조회</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.view_count)}
            </dd>
          </div>
          <div className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-2 py-1">
            <dt>좋아요</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.like_count)}
            </dd>
          </div>
          <div className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-2 py-1">
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
