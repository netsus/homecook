import Link from "next/link";
import React from "react";

export function YoutubeSavedRecipesLink() {
  return (
    <Link
      className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--foreground)]"
      href="/recipes/youtube/saved"
    >
      <span>
        <span className="block text-sm font-semibold">유튜브에서 가져온 레시피</span>
        <span className="mt-1 block text-xs text-[var(--text-3)]">내가 보관한 결과를 보고 수정해요</span>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
