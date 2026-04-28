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
      className="group flex min-h-full flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-2)] transition hover:-translate-y-0.5"
      href={`/recipe/${recipe.id}`}
      prefetch={false}
    >
      <div
        className="relative bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),color-mix(in_srgb,var(--background)_85%,transparent),color-mix(in_srgb,var(--olive)_18%,transparent))]"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent),color-mix(in srgb, var(--foreground) 22%, transparent)),url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                aspectRatio: "16/9",
              }
            : { aspectRatio: "16/9" }
        }
      >
        {recipe.save_count > 100 ? (
          <Badge
            variant="brand"
            className="absolute left-3 top-3 text-[10px] font-bold"
          >
            🔥 인기
          </Badge>
        ) : (
          <Badge
            variant="brand"
            className="absolute left-3 top-3 uppercase tracking-[0.14em]"
            style={{
              color:
                "color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))",
            }}
          >
            {formatRecipeSourceLabel(recipe.source_type)}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-4 py-4">
        <h3 className="line-clamp-2 text-lg font-bold leading-snug text-[var(--foreground)]">
          {recipe.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
          <span>
            ⭐{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {formatCount(recipe.like_count)}
            </span>
          </span>
          <span className="text-[var(--line)]">·</span>
          <span>{formatCount(recipe.save_count)}저장</span>
          <span className="text-[var(--line)]">·</span>
          <span>기본 {recipe.base_servings}인</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-[var(--radius-full)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]"
            >
              {tag}
            </span>
          ))}
          {remainingTagCount ? (
            <span className="rounded-[var(--radius-full)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
