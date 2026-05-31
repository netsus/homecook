"use client";

import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { PantryAddSheet } from "@/components/pantry/pantry-add-sheet";
import { PantryBundlePicker } from "@/components/pantry/pantry-bundle-picker";
import { PantryMobileScreen } from "@/components/pantry/pantry-mobile-screen";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebCard,
  WebShell,
  WebSkeleton,
  WebTabButton,
  WebTabs,
  WebToolbar,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  addPantryItems,
  deletePantryItems,
  fetchIngredients,
  fetchPantryList,
  isPantryApiError,
} from "@/lib/api/pantry";
import { getIngredientCategoryEmoji } from "@/lib/ingredient-categories";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { PantryItem } from "@/types/pantry";
import type { IngredientItem } from "@/types/recipe";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
type PantryDisplayItem = {
  category: string;
  created_at: string | null;
  id: string;
  ingredient_id: string;
  isOwned: boolean;
  standard_name: string;
};

const TOAST_DURATION_MS = 3000;


const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
  const [ingredientCatalog, setIngredientCatalog] = useState<IngredientItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showMissingItems, setShowMissingItems] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [togglingIngredientIds, setTogglingIngredientIds] = useState<Set<string>>(new Set());
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showBundlePicker, setShowBundlePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const allDisplayItems = useMemo(() => {
    if (!showMissingItems) {
      return items.map(toOwnedDisplayItem);
    }

    return buildPantryDisplayItems({
      catalogItems: ingredientCatalog,
      ownedItems: items,
    });
  }, [ingredientCatalog, items, showMissingItems]);

  const searchedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim();

    if (!normalizedQuery) {
      return allDisplayItems;
    }

    return allDisplayItems.filter((item) =>
      item.standard_name.includes(normalizedQuery),
    );
  }, [allDisplayItems, searchQuery]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    searchedItems.forEach((item) => categorySet.add(item.category));
    return Array.from(categorySet).sort();
  }, [searchedItems]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of searchedItems) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }

    return counts;
  }, [searchedItems]);

  const displayItems = useMemo(() => {
    if (!activeCategory) return searchedItems;
    return searchedItems.filter((item) => item.category === activeCategory);
  }, [searchedItems, activeCategory]);

  const mobileDisplayItems = useMemo(
    () =>
      displayItems
        .filter((item) => item.isOwned)
        .map((item) => ({
          category: item.category,
          created_at: item.created_at ?? "",
          id: item.id,
          ingredient_id: item.ingredient_id,
          standard_name: item.standard_name,
        })),
    [displayItems],
  );

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const loadItems = useCallback(
    async () => {
      try {
        const result = await fetchPantryList();
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

  const loadIngredientCatalog = useCallback(async () => {
    try {
      const result = await fetchIngredients();
      setIngredientCatalog((prev) => mergeIngredientCatalog(prev, result.items));
    } catch {
      // The owned pantry list is still usable if the ingredient catalog fails.
    }
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    [],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      setActiveCategory(category);
    },
    [],
  );

  const handleShowMissingItemsChange = useCallback(
    (checked: boolean) => {
      setShowMissingItems(checked);

      if (checked) {
        void loadIngredientCatalog();
      }
    },
    [loadIngredientCatalog],
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
      void loadItems();
    },
    [showToast, loadItems],
  );

  const handleBundleAddComplete = useCallback(
    (addedCount: number) => {
      if (addedCount > 0) {
        showToast(`${addedCount}개 재료를 팬트리에 추가했어요`, "success");
      }
      void loadItems();
    },
    [showToast, loadItems],
  );

  const handleStockToggle = useCallback(
    async (displayItem: PantryDisplayItem) => {
      const ingredientId = displayItem.ingredient_id;

      if (togglingIngredientIds.has(ingredientId)) {
        return;
      }

      setTogglingIngredientIds((prev) => new Set(prev).add(ingredientId));
      setIngredientCatalog((prev) =>
        mergeIngredientCatalog(prev, [toIngredientItem(displayItem)]),
      );

      try {
        if (displayItem.isOwned) {
          setItems((prev) => prev.filter((item) => item.ingredient_id !== ingredientId));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(ingredientId);
            return next;
          });

          await deletePantryItems([ingredientId]);
          showToast(
            `${formatIngredientObject(displayItem.standard_name)} 미보유로 바꿨어요`,
            "success",
          );
          return;
        }

        const optimisticItem = toPantryItem(displayItem);
        setItems((prev) => mergePantryItems(prev, [optimisticItem]));

        const result = await addPantryItems([ingredientId]);
        if (result.items.length > 0) {
          setItems((prev) =>
            mergePantryItems(
              prev.filter((item) => item.ingredient_id !== ingredientId),
              result.items,
            ),
          );
        } else {
          void loadItems();
        }
        showToast(
          `${formatIngredientObject(displayItem.standard_name)} 보유로 바꿨어요`,
          "success",
        );
      } catch {
        if (displayItem.isOwned) {
          setItems((prev) => mergePantryItems(prev, [toPantryItem(displayItem)]));
        } else {
          setItems((prev) => prev.filter((item) => item.ingredient_id !== ingredientId));
        }
        showToast("보유 상태를 바꾸지 못했어요. 다시 시도해 주세요", "error");
      } finally {
        setTogglingIngredientIds((prev) => {
          const next = new Set(prev);
          next.delete(ingredientId);
          return next;
        });
      }
    },
    [loadItems, showToast, togglingIngredientIds],
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

  // --- Render states ---

  if (authState === "checking") {
    if (!isMobileViewport) {
      return <PantryDesktopLoadingShell />;
    }

    return (
      <>
        <ContentState
          className="md:px-7"
          description="로그인 상태를 확인하고 있어요."
          tone="loading"
          title="잠시만 기다려주세요"
        />
        <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
      </>
    );
  }

  if (authState === "unauthorized") {
    return (
      <>
        <ContentState
          className="-mt-5 md:mt-0"
          description="보유 재료를 등록하면 장보기 목록에서 자동으로 제외돼요."
          eyebrow="팬트리 접근"
          safeBottomPadding
          title="이 화면은 로그인이 필요해요"
          tone="gate"
        >
          <div className="space-y-3">
            <SocialLoginButtons nextPath="/pantry" />
            <Link
              className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              href="/"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </ContentState>
        {isMobileViewport ? (
          <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
        ) : null}
      </>
    );
  }

  if (viewState === "loading") {
    if (!isMobileViewport) {
      return <PantryDesktopLoadingShell />;
    }

    return (
      <>
        <PantryLoadingSkeleton />
        <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
      </>
    );
  }

  if (viewState === "error") {
    return (
      <>
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            팬트리를 불러올 수 없어요
          </h2>
          <button
            className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--surface)]"
            onClick={() => {
              setViewState("loading");
              void loadItems();
            }}
            type="button"
          >
            다시 시도
          </button>
        </div>
        {isMobileViewport ? (
          <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
        ) : null}
      </>
    );
  }

  const isEmpty = allDisplayItems.length === 0 && !searchQuery && !activeCategory;
  const isSearchEmpty = displayItems.length === 0 && (searchQuery || activeCategory);
  const overlayNodes = (
    <>
      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[var(--overlay-40)] p-4 lg:items-center lg:justify-center"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-5 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-1 lg:hidden">
              <div className="h-1 w-9 rounded-[var(--radius-badge)] bg-[var(--line)]" />
            </div>
            <div className="flex items-start justify-between gap-3 pt-3">
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                재료를 삭제할까요?
              </h3>
              <button
                aria-label="닫기"
                className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
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
                className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-deep)] text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
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
              ? "bg-[var(--brand)] text-[var(--surface)]"
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
          displayItems={mobileDisplayItems}
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
    <>
      <WebShell className="web-pantry-shell">
        <WebTopNav activeId="pantry" items={WEB_NAV_ITEMS} />
        <div className="web-screen web-pantry-screen">
          <header className="web-pantry-head">
            <div>
              <p className="web-menu-add-eyebrow">Pantry</p>
              <h1>나의 팬트리</h1>
              <p>
                갖고 있는 재료를 정리하면 장보기에서 이미 있는 재료를
                자동으로 제외해요.
              </p>
            </div>
            <div className="web-pantry-actions">
              <WebButton
                aria-label="묶음으로 추가"
                onClick={() => setShowBundlePicker(true)}
                variant="secondary"
              >
                묶음 추가
              </WebButton>
              <WebButton
                aria-label="재료 추가하기"
                onClick={() => setShowAddSheet(true)}
              >
                + 재료 추가
              </WebButton>
            </div>
          </header>

          <WebCard className="web-pantry-board">
            <WebTabs role="tablist">
              <WebTabButton
                active={!activeCategory}
                aria-label="전체"
                onClick={() => handleCategoryChange(null)}
              >
                전체 <span>{searchedItems.length}</span>
              </WebTabButton>
              {categories.map((category) => (
                <WebTabButton
                  active={activeCategory === category}
                  aria-label={category}
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                >
                  {category}{" "}
                  <span>{categoryCounts.get(category) ?? 0}</span>
                </WebTabButton>
              ))}
            </WebTabs>

            <WebToolbar className="web-pantry-toolbar">
              <label className="web-picker-search web-pantry-search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="팬트리 재료 검색"
                  onChange={(event) => handleSearch(event.target.value)}
                  placeholder="재료 검색"
                  role="searchbox"
                  type="text"
                  value={searchQuery}
                />
                {searchQuery ? (
                  <button
                    aria-label="검색어 지우기"
                    className="web-pantry-search-clear"
                    onClick={handleClearSearch}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </label>

              <div className="web-pantry-toolbar-actions">
                <label className="web-pantry-stock-toggle">
                  <input
                    checked={showMissingItems}
                    onChange={(event) =>
                      handleShowMissingItemsChange(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>없는 재료도 표시</span>
                </label>
                <span className="web-pantry-count" aria-live="polite">
                  {displayItems.length}개 표시
                  <span className="sr-only">
                    {" "}
                    {displayItems.length}개 재료
                  </span>
                  {isSelectMode ? (
                    <span className="sr-only"> {selectedIds.size}개 선택됨</span>
                  ) : null}
                </span>
                {isSelectMode ? (
                  <>
                    <WebButton onClick={handleExitSelectMode} variant="tertiary">
                      취소
                    </WebButton>
                    <WebButton
                      aria-label={`선택한 재료 ${selectedIds.size}개 제거하기`}
                      disabled={selectedIds.size === 0}
                      onClick={() => setShowDeleteConfirm(true)}
                      variant="secondary"
                    >
                      삭제 ({selectedIds.size})
                    </WebButton>
                  </>
                ) : (
                  <WebButton
                    onClick={() => setIsSelectMode(true)}
                    variant="tertiary"
                  >
                    편집
                  </WebButton>
                )}
              </div>
            </WebToolbar>

            {isEmpty ? (
              <div className="web-pantry-empty">
                <span aria-hidden="true">🥗</span>
                <h2>아직 등록한 재료가 없어요</h2>
                <p>재료를 추가하면 장보기 때 이미 있는 재료를 자동 제외해요.</p>
                <WebButton
                  aria-label="재료 추가하기"
                  onClick={() => setShowAddSheet(true)}
                >
                  + 재료 추가
                </WebButton>
              </div>
            ) : isSearchEmpty ? (
              <div className="web-pantry-empty">
                <span aria-hidden="true">⌕</span>
                <h2>
                  {searchQuery
                    ? `"${searchQuery}"에 해당하는 재료가 없어요`
                    : "해당 카테고리의 재료가 없어요"}
                </h2>
                {searchQuery ? (
                  <WebButton onClick={handleClearSearch} variant="secondary">
                    검색어 지우기
                  </WebButton>
                ) : null}
              </div>
            ) : (
              <div className="web-pantry-grid">
                {displayItems.map((item) => {
                  const isSelected = selectedIds.has(item.ingredient_id);
                  const isToggling = togglingIngredientIds.has(item.ingredient_id);

                  return (
                    <button
                      aria-checked={isSelectMode ? isSelected : item.isOwned}
                      aria-label={
                        isSelectMode
                          ? `${item.standard_name} 선택`
                          : item.isOwned
                            ? `${item.standard_name} 보유 해제`
                            : `${item.standard_name} 보유로 변경`
                      }
                      className={[
                        "web-pantry-card",
                        isSelectMode ? "web-pantry-card-selectable" : "web-pantry-card-toggle",
                        isSelected ? "web-pantry-card-selected" : "",
                        item.isOwned ? "" : "web-pantry-card-missing",
                        isToggling ? "web-pantry-card-pending" : "",
                      ].join(" ")}
                      disabled={isToggling}
                      key={item.ingredient_id}
                      onClick={() => {
                        if (isSelectMode) {
                          handleSelectToggle(item.ingredient_id);
                          return;
                        }

                        void handleStockToggle(item);
                      }}
                      role={isSelectMode ? "checkbox" : "switch"}
                      type="button"
                    >
                      {isSelectMode ? (
                        <span className="web-pantry-check" aria-hidden="true">
                          {isSelected ? "✓" : ""}
                        </span>
                      ) : null}
                      <span className="web-pantry-emoji" aria-hidden="true">
                        {getIngredientCategoryEmoji(item.category)}
                      </span>
                      <strong>{item.standard_name}</strong>
                      <small>{item.category}</small>
                      <span
                        className={[
                          "web-pantry-badge",
                          item.isOwned ? "" : "web-pantry-badge-missing",
                        ].join(" ")}
                      >
                        {isToggling ? "저장 중" : item.isOwned ? "보유" : "미보유"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </WebCard>
        </div>
      </WebShell>
      {overlayNodes}
    </>
  );
}

function toOwnedDisplayItem(item: PantryItem): PantryDisplayItem {
  return {
    category: item.category,
    created_at: item.created_at,
    id: item.id,
    ingredient_id: item.ingredient_id,
    isOwned: true,
    standard_name: item.standard_name,
  };
}

function toIngredientItem(item: PantryDisplayItem): IngredientItem {
  return {
    category: item.category,
    id: item.ingredient_id,
    standard_name: item.standard_name,
  };
}

function toPantryItem(item: PantryDisplayItem): PantryItem {
  return {
    category: item.category,
    created_at: item.created_at ?? new Date().toISOString(),
    id: item.isOwned ? item.id : `optimistic-${item.ingredient_id}`,
    ingredient_id: item.ingredient_id,
    standard_name: item.standard_name,
  };
}

function formatIngredientObject(name: string) {
  const trimmedName = name.trim();
  const lastCharCode = trimmedName.charCodeAt(trimmedName.length - 1);
  const isHangulSyllable = lastCharCode >= 0xac00 && lastCharCode <= 0xd7a3;
  const hasFinalConsonant = isHangulSyllable && (lastCharCode - 0xac00) % 28 !== 0;
  return `${name}${hasFinalConsonant ? "을" : "를"}`;
}

function buildPantryDisplayItems({
  catalogItems,
  ownedItems,
}: {
  catalogItems: IngredientItem[];
  ownedItems: PantryItem[];
}) {
  const ownedByIngredientId = new Map(
    ownedItems.map((item) => [item.ingredient_id, item]),
  );
  const displayByIngredientId = new Map<string, PantryDisplayItem>();

  for (const catalogItem of catalogItems) {
    const ownedItem = ownedByIngredientId.get(catalogItem.id);

    displayByIngredientId.set(catalogItem.id, {
      category: catalogItem.category,
      created_at: ownedItem?.created_at ?? null,
      id: ownedItem?.id ?? `missing-${catalogItem.id}`,
      ingredient_id: catalogItem.id,
      isOwned: Boolean(ownedItem),
      standard_name: catalogItem.standard_name,
    });
  }

  for (const ownedItem of ownedItems) {
    if (!displayByIngredientId.has(ownedItem.ingredient_id)) {
      displayByIngredientId.set(ownedItem.ingredient_id, toOwnedDisplayItem(ownedItem));
    }
  }

  return Array.from(displayByIngredientId.values()).sort(comparePantryDisplayItems);
}

function comparePantryDisplayItems(
  left: PantryDisplayItem,
  right: PantryDisplayItem,
) {
  const categoryCompare = left.category.localeCompare(right.category, "ko");
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  return left.standard_name.localeCompare(right.standard_name, "ko");
}

function mergeIngredientCatalog(
  currentItems: IngredientItem[],
  incomingItems: IngredientItem[],
) {
  const merged = new Map(currentItems.map((item) => [item.id, item]));

  for (const item of incomingItems) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.standard_name.localeCompare(right.standard_name, "ko"),
  );
}

function mergePantryItems(currentItems: PantryItem[], incomingItems: PantryItem[]) {
  const merged = new Map(currentItems.map((item) => [item.ingredient_id, item]));

  for (const item of incomingItems) {
    merged.set(item.ingredient_id, item);
  }

  return Array.from(merged.values()).sort((left, right) => {
    const createdAtCompare = right.created_at.localeCompare(left.created_at);
    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return left.id.localeCompare(right.id);
  });
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

function PantryDesktopLoadingShell() {
  return (
    <WebShell className="web-pantry-shell">
      <WebTopNav activeId="pantry" items={WEB_NAV_ITEMS} />
      <div className="web-screen web-pantry-screen" data-testid="pantry-skeleton">
        <header className="web-pantry-head">
          <div>
            <WebSkeleton height={14} width={72} />
            <div className="mt-3">
              <WebSkeleton height={40} width={180} />
            </div>
            <div className="mt-3">
              <WebSkeleton height={18} width={360} />
            </div>
          </div>
          <div className="web-pantry-actions">
            <WebSkeleton height={40} width={104} />
            <WebSkeleton height={40} width={112} />
          </div>
        </header>

        <WebCard className="web-pantry-board">
          <div className="web-pantry-loading-tabs">
            {[80, 88, 88, 88].map((width, index) => (
              <WebSkeleton height={44} key={index} width={width} />
            ))}
          </div>
          <WebToolbar className="web-pantry-toolbar">
            <WebSkeleton height={44} width="min(440px, 100%)" />
            <div className="web-pantry-toolbar-actions">
              <WebSkeleton height={36} width={128} />
              <WebSkeleton height={36} width={72} />
            </div>
          </WebToolbar>
          <div className="web-pantry-grid">
            {Array.from({ length: 10 }).map((_, index) => (
              <WebSkeleton height={166} key={index} />
            ))}
          </div>
        </WebCard>
      </div>
    </WebShell>
  );
}
