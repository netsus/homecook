import Link from "next/link";

import { formatCount } from "@/lib/recipe";
import type { RecipeCardItem } from "@/types/recipe";

interface RecipeCardProps {
  recipe: RecipeCardItem;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link
      className="glass-panel group flex flex-col overflow-hidden rounded-[28px] transition hover:-translate-y-1"
      href={`/recipe/${recipe.id}`}
    >
      <div
        className="relative min-h-44 border-b border-[var(--line)] bg-gradient-to-br from-[#ffd6b8] via-[#fff8ef] to-[#dce8bf]"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(rgba(18, 18, 18, 0.12), rgba(18, 18, 18, 0.26)), url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="absolute left-4 top-4 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-deep)]">
          {recipe.source_type}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div>
          <h3 className="display text-2xl text-[var(--brand-deep)]">
            {recipe.title}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            기본 {recipe.base_servings}인분
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[var(--olive)]"
            >
              #{tag}
            </span>
          ))}
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-2 text-xs text-[var(--muted)]">
          <div className="rounded-[18px] bg-white/70 px-3 py-2">
            <dt>조회</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatCount(recipe.view_count)}
            </dd>
          </div>
          <div className="rounded-[18px] bg-white/70 px-3 py-2">
            <dt>좋아요</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatCount(recipe.like_count)}
            </dd>
          </div>
          <div className="rounded-[18px] bg-white/70 px-3 py-2">
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
