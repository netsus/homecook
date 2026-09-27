"use client";

import React, { useState } from "react";
import Link from "next/link";
import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import { showActionConfirmation } from "@/stores/ui-store";

export function ManualRecipePublishAction({ recipeId, onPublished }: { recipeId: string; onPublished: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  async function publish() {
    if (pending) return;
    setPending(true); setError(null); setNeedsLogin(false);
    try {
      await fetchJson(`/api/v1/recipes/${encodeURIComponent(recipeId)}/publish`, { method: "POST" });
      onPublished();
      showActionConfirmation("공개했어요. 홈에서 검색하고 링크로 공유할 수 있어요.");
    } catch (cause) {
      setNeedsLogin(isApiFetchError(cause) && (cause.status === 401 || cause.code === "ACCOUNT_SESSION_STALE"));
      setError(cause instanceof Error ? cause.message : "공개하지 못했어요. 다시 시도해 주세요.");
    } finally { setPending(false); }
  }
  return <div id="recipe-publish" className="space-y-2">
    <button className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand)] px-3 text-sm font-bold text-[var(--brand)] disabled:opacity-50" disabled={pending} onClick={() => void publish()} type="button">
      {pending ? "공개 준비 중…" : "공개하여 검색·공유하기"}
    </button>
    {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error} {needsLogin ? <Link className="underline" href={`/login?next=${encodeURIComponent(`/recipe/${recipeId}#recipe-publish`)}`}>다시 로그인</Link> : null}</p> : null}
  </div>;
}
