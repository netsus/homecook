"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import { RecipeCard } from "@/components/home/recipe-card";
import { ContentState } from "@/components/shared/content-state";
import { fetchJson } from "@/lib/api/fetch-json";
import type { RecipeListData, RecipeSortKey } from "@/types/recipe";

const SORT_OPTIONS: Array<{ label: string; value: RecipeSortKey }> = [
  { label: "조회수순", value: "view_count" },
  { label: "좋아요순", value: "like_count" },
  { label: "저장순", value: "save_count" },
  { label: "플래너 등록순", value: "plan_count" },
];

type ScreenState = "loading" | "ready" | "empty" | "error";

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      setScreenState("loading");

      const params = new URLSearchParams({
        sort,
      });

      if (deferredQuery.trim()) {
        params.set("q", deferredQuery.trim());
      }

      const data = await fetchJson<RecipeListData>(`/api/v1/recipes?${params}`);
      setRecipes(data);
      setScreenState(data.items.length ? "ready" : "empty");
    } catch {
      setRecipes(null);
      setScreenState("error");
    }
  }, [deferredQuery, sort]);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes, deferredQuery, sort]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
      <section className="space-y-5">
        <div className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                Home / Discovery
              </p>
              <h2 className="display mt-2 text-4xl text-[var(--brand-deep)]">
                오늘 만들 집밥을 바로 찾으세요
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
                제목으로 빠르게 찾고, 정렬 기준을 바꾸며, 상세로 바로
                들어갑니다. 첫 슬라이스에서는 탐색과 로그인 게이트까지
                정확하게 연결합니다.
              </p>
            </div>
            <div className="rounded-[22px] border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--muted)]">
              재료 필터는 다음 슬라이스에서 연결
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="glass-panel flex items-center rounded-[22px] border border-[var(--line)] bg-white/70 px-4">
              <span className="visually-hidden">레시피 제목 검색</span>
              <input
                className="w-full bg-transparent py-4 outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="레시피 제목 검색"
                value={query}
              />
            </label>
            <label className="glass-panel rounded-[22px] border border-[var(--line)] bg-white/70 px-4">
              <span className="visually-hidden">정렬 기준</span>
              <select
                className="w-full bg-transparent py-4 outline-none"
                onChange={(event) =>
                  setSort(event.target.value as RecipeSortKey)
                }
                value={sort}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {screenState === "loading" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="glass-panel min-h-80 animate-pulse rounded-[28px] bg-white/60"
              />
            ))}
          </div>
        ) : null}

        {screenState === "error" ? (
          <ContentState
            actionLabel="다시 시도"
            description="Supabase 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
            onAction={() => void loadRecipes()}
            title="레시피를 불러오지 못했어요"
          />
        ) : null}

        {screenState === "empty" ? (
          <ContentState
            actionLabel="검색 초기화"
            description="조건에 맞는 레시피가 없어요."
            onAction={() => setQuery("")}
            title="다른 조합을 찾아보세요"
          />
        ) : null}

        {screenState === "ready" && recipes ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recipes.items.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <div className="glass-panel rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Slice Scope
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li>HOME 목록 조회</li>
            <li>제목 검색</li>
            <li>정렬 변경</li>
            <li>RECIPE_DETAIL 조회</li>
            <li>로그인 게이트 + 소셜 로그인</li>
          </ul>
        </div>
        <div className="glass-panel rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Ready States
          </p>
          <dl className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <div className="flex justify-between gap-4">
              <dt>검색어</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {deferredQuery.trim() || "없음"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>정렬</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {SORT_OPTIONS.find((option) => option.value === sort)?.label}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>목록 상태</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {screenState}
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
