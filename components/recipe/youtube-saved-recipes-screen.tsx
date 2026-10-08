"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { fetchYoutubeSavedRecipes } from "@/lib/api/youtube-saved-recipes";
import type { YoutubeSavedRecipeSummary } from "@/types/youtube-saved-recipe";

export function YoutubeSavedRecipesScreen() {
  const [items, setItems] = useState<YoutubeSavedRecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchYoutubeSavedRecipes().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) setItems(result.data.drafts);
      else setError(result.error ?? { code: "UNKNOWN_ERROR", message: "레시피를 불러오지 못했어요." });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-4 py-6 sm:px-8">
      <Link className="text-sm text-[var(--text-2)]" href="/mypage?restore=recipebook-tab">← 나의 레시피북</Link>
      <header className="mb-6 mt-6">
        <p className="text-sm text-[var(--text-3)]">나만 볼 수 있어요</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">유튜브에서 가져온 레시피</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">분량이 확인되지 않은 재료도 그대로 보관해요. 레시피를 열어 언제든 수정할 수 있어요.</p>
      </header>
      {loading ? <p aria-live="polite" role="status">레시피를 불러오는 중이에요…</p> : error ? (
        <div className="rounded-2xl border border-[var(--line)] p-5" role="alert">
          <p>{error.message}</p>
          {error.code === "UNAUTHORIZED" ? (
            <Link className="mt-3 inline-block font-semibold text-[var(--brand)]" href="/login?next=%2Frecipes%2Fyoutube%2Fsaved">로그인하고 돌아오기</Link>
          ) : (
            <button className="mt-3 min-h-11 font-semibold text-[var(--brand)]" onClick={() => setAttempt((value) => value + 1)} type="button">다시 시도</button>
          )}
        </div>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line)] p-6">
          <h2 className="font-semibold">아직 보관한 레시피가 없어요</h2>
          <p className="mt-2 text-sm text-[var(--text-2)]">유튜브 추출 결과에서 저장을 눌러 보관해 보세요.</p>
          <Link className="mt-4 inline-block font-semibold text-[var(--brand)]" href="/recipes/new/youtube">유튜브 레시피 가져오기</Link>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.draft_id}>
              <Link className="block h-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--brand)]" href={`/recipes/youtube/saved/${item.draft_id}`}>
                <h2 className="break-words text-lg font-semibold text-[var(--foreground)]">{item.title}</h2>
                <span className="mt-3 block text-sm text-[var(--brand)]">레시피 보기 · 수정</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
