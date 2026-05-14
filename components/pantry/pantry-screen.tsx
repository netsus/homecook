"use client";

import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { PantryAddSheet } from "@/components/pantry/pantry-add-sheet";
import { PantryBundlePicker } from "@/components/pantry/pantry-bundle-picker";
import { PantryMobileScreen } from "@/components/pantry/pantry-mobile-screen";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  deletePantryItems,
  fetchPantryList,
  isPantryApiError,
} from "@/lib/api/pantry";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { PantryItem } from "@/types/pantry";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";

const SEARCH_DEBOUNCE_MS = 300;
const TOAST_DURATION_MS = 3000;

const CATEGORY_VISUAL: Record<string, string> = {
  채소: "🥬",
  육류: "🥩",
  해산물: "🐟",
  양념: "🧄",
  곡류: "🌾",
  유제품: "🧈",
  과일: "🍎",
  기타: "🥄",
};

export interface PantryScreenProps {
  initialAuthenticated?: boolean;
}

export function PantryScreen({
  initialAuthenticated = false,
}: PantryScreenProps) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [items, setItems] = useState<PantryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showBundlePicker, setShowBundlePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedQueryRef = useRef("");

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    items.forEach((item) => categorySet.add(item.category));
    return Array.from(categorySet).sort();
  }, [items]);

  const filteredCount = useMemo(() => {
    if (!activeCategory) return items.length;
    return items.filter((item) => item.category === activeCategory).length;
  }, [items, activeCategory]);

  const displayItems = useMemo(() => {
    if (!activeCategory) return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const loadItems = useCallback(
    async (query?: string, category?: string | null) => {
      try {
        const result = await fetchPantryList({
          q: query || undefined,
          category: category || undefined,
        });
        setItems(result.items);
        setViewState("ready");
      } catch (error) {
        if (isPantryApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }
        setViewState("error");
      }
    },
    [],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      searchTimerRef.current = setTimeout(() => {
        debouncedQueryRef.current = value;
        void loadItems(value, activeCategory);
      }, SEARCH_DEBOUNCE_MS);
    },
    [activeCategory, loadItems],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    debouncedQueryRef.current = "";
    void loadItems("", activeCategory);
  }, [activeCategory, loadItems]);

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      setActiveCategory(category);
      void loadItems(debouncedQueryRef.current, category);
    },
    [loadItems],
  );

  const handleSelectToggle = useCallback((ingredientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }
      return next;
    });
  }, []);

  const handleExitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const result = await deletePantryItems(Array.from(selectedIds));
      showToast(`${result.removed}개 재료가 삭제됐어요`, "success");
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.ingredient_id)));
      handleExitSelectMode();
    } catch {
      showToast("삭제에 실패했어요. 다시 시도해 주세요", "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedIds, showToast, handleExitSelectMode]);

  const handleAddComplete = useCallback(
    (addedCount: number) => {
      if (addedCount > 0) {
        showToast(`${addedCount}개 재료가 팬트리에 추가됐어요`, "success");
      }
      void loadItems(debouncedQueryRef.current, activeCategory);
    },
    [showToast, activeCategory, loadItems],
  );

  const handleBundleAddComplete = useCallback(
    (addedCount: number) => {
      if (addedCount > 0) {
        showToast(`${addedCount}개 재료를 팬트리에 추가했어요`, "success");
      }
      void loadItems(debouncedQueryRef.current, activeCategory);
    },
    [showToast, activeCategory, loadItems],
  );

  // Auth check effect
  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // Load items on auth
  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    void loadItems();
  }, [authState, loadItems]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // --- Render states ---

  if (authState === "checking") {
    return (
      <ContentState
        className="md:px-7"
        description="로그인 상태를 확인하고 있어요."
        tone="loading"
        title="잠시만 기다려주세요"
      />
    );
  }

  if (authState === "unauthorized") {
    return (
      <ContentState
        className="-mt-5 md:mt-0"
        description="집에 있는 재료를 등록하면 장보기 때 자동으로 빼줘요."
        eyebrow="팬트리 접근"
        safeBottomPadding
        title="이 화면은 로그인이 필요해요"
        tone="gate"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              로그인하면 팬트리 화면으로 바로 복귀해요.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
              보유 재료를 등록하면 장보기 목록에서 자동 제외됩니다.
            </p>
          </div>
          <SocialLoginButtons nextPath="/pantry" />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  if (viewState === "loading") {
    return <PantryLoadingSkeleton />;
  }

  if (viewState === "error") {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          팬트리를 불러올 수 없어요
        </h2>
        <button
          className="mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--surface)]"
          onClick={() => {
            setViewState("loading");
            void loadItems(debouncedQueryRef.current, activeCategory);
          }}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const isEmpty = items.length === 0 && !searchQuery && !activeCategory;
  const isSearchEmpty = displayItems.length === 0 && (searchQuery || activeCategory);
  const overlayNodes = (
    <>
      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 lg:items-center lg:justify-center"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-5 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-1 lg:hidden">
              <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
            </div>
            <div className="flex items-start justify-between gap-3 pt-3">
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                재료를 삭제할까요?
              </h3>
              <button
                aria-label="닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              삭제하면 장보기 목록에서 자동 제외되지 않아요
            </p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-deep)] text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => void handleDeleteConfirm()}
                type="button"
              >
                {isDeleting ? "삭제 중..." : `삭제 (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium shadow-lg transition-opacity ${
            toast.tone === "success"
              ? "bg-[var(--olive)] text-[var(--surface)]"
              : "bg-[var(--brand-deep)] text-[var(--surface)]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Add sheet */}
      {showAddSheet && (
        <PantryAddSheet
          existingIngredientIds={items.map((item) => item.ingredient_id)}
          onAdd={handleAddComplete}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {/* Bundle picker */}
      {showBundlePicker && (
        <PantryBundlePicker
          onAdd={handleBundleAddComplete}
          onClose={() => setShowBundlePicker(false)}
        />
      )}
    </>
  );

  if (isMobileViewport) {
    return (
      <>
        <PantryMobileScreen
          activeCategory={activeCategory}
          displayItems={displayItems}
          isSelectMode={isSelectMode}
          items={items}
          onCategoryChange={handleCategoryChange}
          onClearSearch={handleClearSearch}
          onExitSelectMode={handleExitSelectMode}
          onOpenAddSheet={() => setShowAddSheet(true)}
          onOpenBundlePicker={() => setShowBundlePicker(true)}
          onRequestDelete={() => setShowDeleteConfirm(true)}
          onSearchChange={handleSearch}
          onSelectToggle={handleSelectToggle}
          onStartSelectMode={() => setIsSelectMode(true)}
          searchQuery={searchQuery}
          selectedIds={selectedIds}
        />
        {overlayNodes}
      </>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              Pantry
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
              나의 팬트리
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              갖고 있는 재료를 정리하면 장보기에서 이미 있는 재료를 자동으로 제외해요.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              className="flex min-h-[44px] items-center justify-center rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--surface)] shadow-[var(--shadow-1)]"
              onClick={() => setShowAddSheet(true)}
              type="button"
            >
              재료 추가하기
            </button>
            <button
              className="flex min-h-[44px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-fill)] px-5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand)]"
              onClick={() => setShowBundlePicker(true)}
              type="button"
            >
              묶음으로 추가
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--muted)]">전체 재료</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
              {items.length}개 재료
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--muted)]">카테고리</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
              {categories.length}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--muted)]">현재 보기</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
              {displayItems.length}
            </p>
          </div>
        </div>
      </section>

      <section className="sticky top-4 z-10 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[var(--shadow-1)] backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              🔍
            </span>
            <input
              aria-label="팬트리 재료 검색"
              className="w-full rounded-full border border-[var(--line)] bg-[var(--surface)] py-3 pl-9 pr-9 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="재료 검색"
              role="searchbox"
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface-fill)] text-xs text-[var(--muted)]"
                onClick={handleClearSearch}
                type="button"
              >
                ✕
              </button>
            )}
          </div>
          {!isSelectMode ? (
            <button
              className="min-h-[44px] rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              onClick={() => setIsSelectMode(true)}
              type="button"
            >
              편집
            </button>
          ) : (
            <button
              aria-label="선택 모드 취소"
              className="min-h-[44px] rounded-full border border-[var(--line)] px-5 text-sm font-semibold text-[var(--foreground)]"
              onClick={handleExitSelectMode}
              type="button"
            >
              취소
            </button>
          )}
        </div>

        <div
          className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto"
          role="tablist"
        >
        <button
          aria-selected={!activeCategory}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
            !activeCategory
              ? "bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] font-semibold text-[var(--brand)]"
              : "bg-[var(--surface-fill)] text-[var(--text-2)]"
          }`}
          onClick={() => handleCategoryChange(null)}
          role="tab"
          type="button"
        >
          전체
        </button>
        {categories.map((category) => (
          <button
            aria-selected={activeCategory === category}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
              activeCategory === category
                ? "bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] font-semibold text-[var(--brand)]"
                : "bg-[var(--surface-fill)] text-[var(--text-2)]"
            }`}
            key={category}
            onClick={() => handleCategoryChange(category)}
            role="tab"
            type="button"
          >
            {category}
          </button>
        ))}
        </div>
      </section>

      {/* Empty state (no items at all) */}
      {isEmpty && (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <span className="text-4xl">🥗</span>
          <h2 className="mt-4 text-lg font-bold text-[var(--foreground)]">
            아직 등록한 재료가 없어요
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            재료를 추가하면 장보기 때{"\n"}이미 있는 재료를 자동 제외해요
          </p>
          <button
            className="mt-5 flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--surface)]"
            onClick={() => setShowAddSheet(true)}
            type="button"
          >
            재료 추가하기
          </button>
          <button
            className="mt-2 flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--olive)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--olive)]"
            onClick={() => setShowBundlePicker(true)}
            type="button"
          >
            묶음으로 추가
          </button>
        </div>
      )}

      {/* Search empty */}
      {isSearchEmpty && (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="text-base text-[var(--muted)]">
            {searchQuery
              ? `"${searchQuery}"에 해당하는 재료가 없어요`
              : "해당 카테고리의 재료가 없어요"}
          </p>
          {searchQuery && (
            <button
              className="mt-4 flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--olive)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--olive)]"
              onClick={handleClearSearch}
              type="button"
            >
              검색어 지우기
            </button>
          )}
        </div>
      )}

      {/* Item list */}
      {!isEmpty && !isSearchEmpty && (
        <>
          {/* Section header */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
              {activeCategory ? `${activeCategory} (${filteredCount})` : `보유 재료 (${items.length})`}
            </h2>
            {!isSelectMode ? (
              <button
                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                onClick={() => setIsSelectMode(true)}
                type="button"
              >
                편집
              </button>
            ) : (
              <button
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
                onClick={handleExitSelectMode}
                type="button"
              >
                취소
              </button>
            )}
          </div>

          {/* Select mode header */}
          {isSelectMode && selectedIds.size > 0 && (
            <div className="px-1">
              <span aria-live="polite" className="text-sm font-bold text-[var(--brand)]">
                {selectedIds.size}개 선택됨
              </span>
            </div>
          )}

          {/* Item cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayItems.map((item) => {
              const isSelected = selectedIds.has(item.ingredient_id);

              return (
                <div
                  className={`relative flex min-h-[166px] flex-col rounded-[var(--radius-lg)] p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] ${
                    isSelectMode && isSelected
                      ? "border-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]"
                      : "border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]"
                  }`}
                  key={item.id}
                  onClick={isSelectMode ? () => handleSelectToggle(item.ingredient_id) : undefined}
                  role={isSelectMode ? "checkbox" : undefined}
                  aria-checked={isSelectMode ? isSelected : undefined}
                  aria-label={isSelectMode ? `${item.standard_name} 선택` : undefined}
                  style={isSelectMode ? { cursor: "pointer" } : undefined}
                >
                  {isSelectMode && (
                    <span
                      className={`absolute left-3 top-3 z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs ${
                        isSelected
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                          : "border-[var(--line)] bg-[var(--surface)]"
                      }`}
                    >
                      {isSelected && "✓"}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="flex aspect-square w-full shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[#EAEDEF] text-3xl"
                  >
                    {CATEGORY_VISUAL[item.category] ?? CATEGORY_VISUAL.기타}
                  </span>
                  <div className="mt-3 min-w-0">
                    <p className="truncate text-sm font-semibold tracking-[-0.3px] text-[var(--foreground)]">
                      {item.standard_name}
                    </p>
                    <p className="mt-1 text-xs tracking-[-0.3px] text-[var(--text-3)]">
                      {item.category}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Select mode action bar */}
      {isSelectMode && (
        <div
          className="fixed inset-x-0 bottom-[calc(104px+env(safe-area-inset-bottom))] z-40 flex gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3"
          data-testid="pantry-delete-action-bar"
        >
          <button
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-deep)] text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
            disabled={selectedIds.size === 0}
            onClick={() => setShowDeleteConfirm(true)}
            type="button"
          >
            제거하기 ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 lg:items-center lg:justify-center"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-5 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-1 lg:hidden">
              <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
            </div>
            <div className="flex items-start justify-between gap-3 pt-3">
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                재료를 삭제할까요?
              </h3>
              <button
                aria-label="닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              삭제하면 장보기 목록에서 자동 제외되지 않아요
            </p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-deep)] text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => void handleDeleteConfirm()}
                type="button"
              >
                {isDeleting ? "삭제 중..." : `삭제 (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium shadow-lg transition-opacity ${
            toast.tone === "success"
              ? "bg-[var(--olive)] text-[var(--surface)]"
              : "bg-[var(--brand-deep)] text-[var(--surface)]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Add sheet */}
      {showAddSheet && (
        <PantryAddSheet
          existingIngredientIds={items.map((item) => item.ingredient_id)}
          onAdd={handleAddComplete}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {/* Bundle picker */}
      {showBundlePicker && (
        <PantryBundlePicker
          onAdd={handleBundleAddComplete}
          onClose={() => setShowBundlePicker(false)}
        />
      )}
    </div>
  );
}

function PantryLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <Skeleton height={24} rounded="md" width={120} />
        <div className="mt-2">
          <Skeleton height={14} rounded="md" width={100} />
        </div>
      </div>
      <Skeleton className="w-full" height={40} rounded="lg" />
      <div className="flex gap-2">
        <Skeleton height={32} rounded="full" width={56} />
        <Skeleton height={32} rounded="full" width={56} />
        <Skeleton height={32} rounded="full" width={64} />
        <Skeleton height={32} rounded="full" width={56} />
      </div>
      <div className="flex gap-2">
        <Skeleton className="flex-1" height={44} rounded="md" />
        <Skeleton className="flex-1" height={44} rounded="md" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton className="w-full" height={60} key={i} rounded="lg" />
        ))}
      </div>
    </div>
  );
}
