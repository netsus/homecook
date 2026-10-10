import React from "react";

export function RecipeDescription({ description }: { description: string | null }) {
  if (!description?.trim()) return null;

  return (
    <details className="my-3 text-sm text-[var(--text-2)]">
      <summary className="min-h-10 cursor-pointer py-2 font-medium">레시피 설명</summary>
      <p className="mt-2 whitespace-pre-line break-words leading-6">{description}</p>
    </details>
  );
}
