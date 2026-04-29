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
  const presentation = getRecipePresentation(recipe);
  const badgeLabel =
    recipe.save_count > 100 ? "🔥 인기" : formatRecipeSourceLabel(recipe.source_type);

  return (
    <Link
      className="group flex min-h-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_10px_24px_rgba(33,37,41,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(33,37,41,0.14)]"
      href={`/recipe/${recipe.id}`}
      prefetch={false}
    >
      <div
        className="relative overflow-hidden"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(rgba(33,37,41,0.03),rgba(33,37,41,0.18)),url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                aspectRatio: "16/9",
              }
            : {
                aspectRatio: "16/9",
                background: presentation.gradient,
              }
        }
      >
        {!recipe.thumbnail_url ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center text-5xl"
          >
            {presentation.emoji}
          </span>
        ) : null}
        <Badge
          variant="brand"
          className="absolute left-3 top-3 rounded-full border-0 bg-white/92 px-2.5 py-1 text-[10px] font-bold text-[#0B6F6C] shadow-[0_4px_12px_rgba(33,37,41,0.12)]"
        >
          {badgeLabel}
        </Badge>
        <span
          aria-label="북마크"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/94 text-[#0B6F6C] shadow-[0_4px_12px_rgba(33,37,41,0.14)]"
          data-testid="recipe-card-bookmark"
        >
          ♡
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-4 py-3.5">
        <h3 className="line-clamp-2 text-[16px] font-extrabold leading-snug text-[#212529]">
          {recipe.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-[#495057]">
          <span>
            ⭐
            <span className="ml-1 text-[#212529]">
              {formatCount(recipe.like_count)}
            </span>
          </span>
          <span className="text-[#E9ECEF]">·</span>
          <span>{formatCount(recipe.save_count)}저장</span>
          <span className="text-[#E9ECEF]">·</span>
          <span>기본 {recipe.base_servings}인</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-bold text-[#495057]"
            >
              {tag}
            </span>
          ))}
          {remainingTagCount ? (
            <span className="rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-bold text-[#495057]">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function getRecipePresentation(recipe: RecipeCardItem) {
  const emojiByTag = [
    { keyword: "김치", emoji: "🥘" },
    { keyword: "찌개", emoji: "🍲" },
    { keyword: "밥", emoji: "🍚" },
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
    "linear-gradient(135deg,#E6F8F7,#FFF4D6)",
    "linear-gradient(135deg,#F1F8E9,#E6F8F7)",
    "linear-gradient(135deg,#FFE8D6,#E6F8F7)",
    "linear-gradient(135deg,#E8F0FF,#FFF4D6)",
  ];

  return {
    emoji,
    gradient: gradients[index % gradients.length]!,
  };
}
