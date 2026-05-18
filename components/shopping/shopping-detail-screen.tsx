"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { PantryReflectionPopup } from "@/components/shopping/pantry-reflection-popup";
import {
  completeShoppingList,
  fetchShoppingListDetail,
  fetchShoppingShareText,
  isShoppingApiError,
  reorderShoppingListItems,
  updateShoppingListItem,
} from "@/lib/api/shopping";
import type { ShoppingListDetail, ShoppingListItemSummary } from "@/types/shopping";

export interface ShoppingDetailScreenProps {
  listId: string;
  initialAuthenticated: boolean;
}

type ViewState = "loading" | "error" | "ready";

interface UpdateState {
  itemId: string;
  type: "check" | "exclude";
}

export function ShoppingDetailScreen({
  listId,
  initialAuthenticated,
}: ShoppingDetailScreenProps) {
  const router = useRouter();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [listDetail, setListDetail] = useState<ShoppingListDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [updatingItem, setUpdatingItem] = useState<UpdateState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareToast, setShareToast] = useState<{ type: "success" | "error" | "empty"; message: string } | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeToast, setCompleteToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPantryPopup, setShowPantryPopup] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/planner" });
  const shareToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShareToastTimer = useCallback(() => {
    if (shareToastTimeoutRef.current) {
      clearTimeout(shareToastTimeoutRef.current);
      shareToastTimeoutRef.current = null;
    }
  }, []);

  const scheduleShareToastClear = useCallback(() => {
    clearShareToastTimer();
    shareToastTimeoutRef.current = setTimeout(() => {
      setShareToast(null);
      shareToastTimeoutRef.current = null;
    }, 3000);
  }, [clearShareToastTimer]);

  useEffect(() => clearShareToastTimer, [clearShareToastTimer]);

  const markListReadOnly = useCallback((message: string) => {
    setListDetail((prev) =>
      prev
        ? {
            ...prev,
            is_completed: true,
            completed_at: prev.completed_at,
          }
        : prev,
    );
    setCompleteToast({ type: "error", message });
    setTimeout(() => setCompleteToast(null), 3000);
  }, []);

  const loadDetail = useCallback(async () => {
    setViewState("loading");
    setErrorMessage("");

    try {
      const data = await fetchShoppingListDetail(listId);
      setListDetail(data);
      setViewState("ready");
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          router.push(`/login?next=/shopping/lists/${listId}`);
          return;
        }
        setErrorMessage(error.message);
      } else {
        setErrorMessage("장보기 리스트를 불러올 수 없어요.");
      }
      setViewState("error");
    }
  }, [listId, router]);

  useEffect(() => {
    if (initialAuthenticated) {
      void loadDetail();
    }
  }, [initialAuthenticated, loadDetail]);

  const handleToggleCheck = useCallback(
    async (itemId: string, currentChecked: boolean) => {
      if (!listDetail || listDetail.is_completed) {
        return;
      }

      setUpdatingItem({ itemId, type: "check" });

      const newChecked = !currentChecked;

      // Optimistic update
      setListDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, is_checked: newChecked } : item
          ),
        };
      });

      try {
        const updatedItem = await updateShoppingListItem(listId, itemId, {
          is_checked: newChecked,
        });

        // Sync with server response
        setListDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? updatedItem : item
            ),
          };
        });
      } catch (error) {
        // Rollback on error
        setListDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? { ...item, is_checked: currentChecked } : item
            ),
          };
        });

        if (isShoppingApiError(error)) {
          if (error.status === 409) {
            markListReadOnly("완료된 장보기 기록은 수정할 수 없어요");
          } else {
            console.error(error.message);
          }
        }
      } finally {
        setUpdatingItem(null);
      }
    },
    [listId, listDetail, markListReadOnly]
  );

  const handleToggleExclude = useCallback(
    async (
      itemId: string,
      currentExcluded: boolean,
      currentChecked: boolean,
    ) => {
      if (!listDetail || listDetail.is_completed) {
        return;
      }

      setUpdatingItem({ itemId, type: "exclude" });

      const newExcluded = !currentExcluded;

      // Optimistic update - exclude→uncheck rule
      setListDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  is_pantry_excluded: newExcluded,
                  is_checked: newExcluded ? false : item.is_checked,
                }
              : item
          ),
        };
      });

      try {
        const updatedItem = await updateShoppingListItem(listId, itemId, {
          is_pantry_excluded: newExcluded,
        });

        // Sync with server response
        setListDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? updatedItem : item
            ),
          };
        });
      } catch (error) {
        // Rollback on error
        setListDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    is_pantry_excluded: currentExcluded,
                    is_checked: currentChecked,
                  }
                : item
            ),
          };
        });

        if (isShoppingApiError(error)) {
          if (error.status === 409) {
            markListReadOnly("완료된 장보기 기록은 수정할 수 없어요");
          } else {
            console.error(error.message);
          }
        }
      } finally {
        setUpdatingItem(null);
      }
    },
    [listId, listDetail, markListReadOnly]
  );

  const handleShare = useCallback(async () => {
    if (!listDetail) return;

    const hasPurchaseItems = listDetail.items.some((item) => !item.is_pantry_excluded);
    if (!hasPurchaseItems) {
      setShareToast({ type: "empty", message: "공유할 구매 항목이 없어요" });
      scheduleShareToastClear();
      return;
    }

    setIsSharing(true);
    clearShareToastTimer();
    setShareToast(null);

    try {
      const { text } = await fetchShoppingShareText(listId);

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ text });
          setShareToast({ type: "success", message: "공유되었습니다" });
        } catch (shareError) {
          if (!(shareError instanceof Error && shareError.name === "AbortError")) {
            await navigator.clipboard.writeText(text);
            setShareToast({ type: "success", message: "복사되었습니다" });
          }
        }
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareToast({ type: "success", message: "복사되었습니다" });
      } else {
        setShareToast({ type: "error", message: "이 환경에서는 공유할 수 없어요" });
      }
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          router.push(`/login?next=/shopping/lists/${listId}`);
          return;
        }
        setShareToast({ type: "error", message: error.message });
      } else {
        setShareToast({ type: "error", message: "공유 텍스트를 만들지 못했어요" });
      }
    } finally {
      setIsSharing(false);
      scheduleShareToastClear();
    }
  }, [clearShareToastTimer, listId, listDetail, router, scheduleShareToastClear]);

  const handleMoveItem = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      if (!listDetail || listDetail.is_completed) {
        return;
      }

      const purchaseItems = listDetail.items.filter((item) => !item.is_pantry_excluded);
      const currentIndex = purchaseItems.findIndex((item) => item.id === itemId);

      if (currentIndex === -1) {
        return;
      }

      if (direction === "up" && currentIndex === 0) {
        return;
      }

      if (direction === "down" && currentIndex === purchaseItems.length - 1) {
        return;
      }

      const oldItems = [...listDetail.items];
      const newPurchaseItems = [...purchaseItems];
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      // Swap items
      [newPurchaseItems[currentIndex], newPurchaseItems[newIndex]] = [
        newPurchaseItems[newIndex],
        newPurchaseItems[currentIndex],
      ];

      // Reconstruct full items list with purchase items in new order
      const excludedItems = listDetail.items.filter((item) => item.is_pantry_excluded);
      const newItems = [...newPurchaseItems, ...excludedItems];

      // Update local state immediately (optimistic)
      setListDetail((prev) => {
        if (!prev) return prev;
        return { ...prev, items: newItems };
      });

      // Calculate new sort_order values for all items
      const orders = newItems.map((item, index) => ({
        item_id: item.id,
        sort_order: index * 10,
      }));

      setIsReordering(true);
      setReorderError(null);

      try {
        await reorderShoppingListItems(listId, { orders });
        // Success: keep the new order
      } catch (error) {
        // Rollback on error
        setListDetail((prev) => {
          if (!prev) return prev;
          return { ...prev, items: oldItems };
        });

        if (isShoppingApiError(error)) {
          if (error.status === 409) {
            setReorderError("완료된 장보기 기록은 수정할 수 없어요");
            markListReadOnly("완료된 장보기 기록은 수정할 수 없어요");
          } else if (error.status === 401) {
            router.push(`/login?next=/shopping/lists/${listId}`);
            return;
          } else {
            setReorderError(error.message);
          }
        } else {
          setReorderError("순서 변경에 실패했어요");
        }

        setTimeout(() => setReorderError(null), 3000);
      } finally {
        setIsReordering(false);
      }
    },
    [listId, listDetail, markListReadOnly, router]
  );

  const handleCompleteClick = useCallback(() => {
    if (!listDetail || listDetail.is_completed) {
      return;
    }

    // Show pantry reflection popup
    setShowPantryPopup(true);
  }, [listDetail]);

  const handlePantryConfirm = useCallback(
    async (selectedItemIds: string[] | undefined) => {
      if (!listDetail || listDetail.is_completed) {
        return;
      }

      setShowPantryPopup(false);
      setIsCompleting(true);
      setCompleteToast(null);

      try {
        const body =
          selectedItemIds === undefined
            ? { add_to_pantry_item_ids: null }
            : { add_to_pantry_item_ids: selectedItemIds };

        const {
          completed,
          meals_updated,
          pantry_added = 0,
          pantry_added_item_ids = [],
        } = await completeShoppingList(listId, body);

        if (completed) {
          // Update local state to mark as completed and reflect pantry additions
          setListDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              is_completed: true,
              completed_at: new Date().toISOString(),
              items: prev.items.map((item) =>
                pantry_added_item_ids.includes(item.id)
                  ? { ...item, added_to_pantry: true }
                  : item
              ),
            };
          });

          const mealsText =
            meals_updated === 1 ? "1개 식사" : `${meals_updated}개 식사`;
          const pantryText =
            pantry_added === 0
              ? ""
              : pantry_added === 1
                ? ", 팬트리 1개 추가"
                : `, 팬트리 ${pantry_added}개 추가`;

          setCompleteToast({
            type: "success",
            message: `장보기를 완료했어요 (${mealsText}${pantryText})`,
          });
          setTimeout(() => setCompleteToast(null), 3000);
        }
      } catch (error) {
        if (isShoppingApiError(error)) {
          if (error.status === 401) {
            router.push(`/login?next=/shopping/lists/${listId}`);
            return;
          }
          if (error.status === 409) {
            markListReadOnly("이미 완료된 장보기 기록이에요");
            setCompleteToast({
              type: "error",
              message: "이미 완료된 장보기 기록이에요",
            });
          } else {
            setCompleteToast({
              type: "error",
              message: error.message,
            });
          }
        } else {
          setCompleteToast({
            type: "error",
            message: "장보기를 완료하지 못했어요",
          });
        }
        setTimeout(() => setCompleteToast(null), 3000);
      } finally {
        setIsCompleting(false);
      }
    },
    [listId, listDetail, markListReadOnly, router]
  );

  const handlePantryCancel = useCallback(() => {
    setShowPantryPopup(false);
  }, []);

  if (viewState === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col bg-[var(--wave1-surface)]"
        data-testid="shopping-detail-state-shell"
      >
        <div className="flex-1 px-4 py-6">
          <ContentState
            tone="loading"
            title="장보기 리스트를 불러오고 있어요..."
            description="잠시만 기다려주세요"
            variant="subtle"
          />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-white/60"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-[var(--wave1-surface)] px-4"
        data-testid="shopping-detail-state-shell"
      >
        <ContentState
          tone="error"
          title="장보기 리스트를 불러올 수 없어요"
          description={errorMessage || "다시 시도해주세요"}
          actionLabel="다시 시도"
          onAction={loadDetail}
          variant="panel"
        />
      </div>
    );
  }

  if (!listDetail) {
    return null;
  }

  const purchaseItems = listDetail.items.filter((item) => !item.is_pantry_excluded);
  const excludedItems = listDetail.items.filter((item) => item.is_pantry_excluded);
  const isEmpty = purchaseItems.length === 0;
  const isReadOnly = listDetail.is_completed;

  if (isMobileViewport) {
    return (
      <MobileShoppingDetailScreen
        completeToast={completeToast}
        detail={listDetail}
        excludedItems={excludedItems}
        isCompleting={isCompleting}
        isReadOnly={isReadOnly}
        isReordering={isReordering}
        isSharing={isSharing}
        onBack={appReturn.goBack}
        onComplete={handleCompleteClick}
        onMoveItem={handleMoveItem}
        onShare={handleShare}
        onToggleCheck={handleToggleCheck}
        onToggleExclude={handleToggleExclude}
        purchaseItems={purchaseItems}
        reorderError={reorderError}
        shareToast={shareToast}
        showPantryPopup={showPantryPopup}
        updatingItem={updatingItem}
        onPantryCancel={handlePantryCancel}
        onPantryConfirm={handlePantryConfirm}
      />
    );
  }

  const completedCount = purchaseItems.filter((item) => item.is_checked).length;
  const progressPercent = purchaseItems.length
    ? Math.round((completedCount / purchaseItems.length) * 100)
    : 100;

  return (
    <div className="min-h-screen bg-[var(--wave1-surface-fill)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--panel)] px-6 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button
            onClick={appReturn.goBack}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"
            type="button"
            aria-label="뒤로 가기"
          >
            <span className="text-lg">←</span>
          </button>
          <h1 className="text-base font-bold tracking-[-0.3px]">장보기 상세</h1>
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[var(--olive)] hover:bg-black/5 disabled:opacity-50"
            type="button"
            aria-label="공유(텍스트)"
          >
            {isSharing ? "공유 중..." : "공유"}
          </button>
        </div>
      </header>

      {shareToast && (
        <div
          className={`mx-auto mt-4 max-w-6xl rounded-xl px-4 py-3 text-sm font-semibold ${
            shareToast.type === "error"
              ? "bg-red-50 text-red-700"
              : shareToast.type === "empty"
                ? "bg-yellow-50 text-yellow-700"
                : "bg-green-50 text-green-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {shareToast.message}
        </div>
      )}

      {/* Title and date range */}
      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              {isReadOnly ? "Completed Shopping" : "Shopping List"}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-[-0.4px] text-[var(--foreground)]">
              {listDetail.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              <span>생성 {formatDate(listDetail.created_at)}</span>
              <span className="mx-2">·</span>
              <span>
                {formatDateRange(listDetail.date_range_start, listDetail.date_range_end)}
              </span>
            </p>
            {isReadOnly && listDetail.completed_at && (
              <p className="mt-2 text-sm font-semibold text-[var(--olive)]">
                ✓ 완료됨 ({formatDate(listDetail.completed_at)})
              </p>
            )}
          </div>

          {!isReadOnly ? (
            <div className="min-w-[260px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
              <div className="flex items-center justify-between text-sm font-semibold text-[var(--muted)]">
                <span>진행률</span>
                <span className="tabular-nums text-[var(--foreground)]">
                  {completedCount} / {purchaseItems.length} 항목 ({progressPercent}%)
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[var(--surface-fill)]">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Main content */}
      <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-28 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Empty state */}
        {isEmpty && (
          <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="mt-3 text-base font-semibold text-[var(--foreground)]">
              팬트리에 이미 있어서
            </p>
            <p className="text-base font-semibold text-[var(--foreground)]">
              장볼 재료가 없어요
            </p>
          </div>
        )}

        {/* Reorder error toast */}
        {reorderError && (
          <div
            className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            role="alert"
            aria-live="polite"
          >
            {reorderError}
          </div>
        )}

        {/* Complete toast */}
        {completeToast && (
          <div
            className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              completeToast.type === "error"
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
            role="status"
            aria-live="polite"
          >
            {completeToast.message}
          </div>
        )}

        <div className="min-w-0">
          {!isEmpty && (
            <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  {isReadOnly ? "구매한 재료" : "구매할 재료"} ({purchaseItems.length}개)
                </h3>
                <span className="text-xs font-semibold text-[var(--muted)]">
                  체크 · 제외 · 순서 변경
                </span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {purchaseItems.map((item, index) => (
                  <ShoppingItemCard
                    key={item.id}
                    item={item}
                    isReadOnly={isReadOnly}
                    isUpdating={updatingItem?.itemId === item.id}
                    isReordering={isReordering}
                    onToggleCheck={handleToggleCheck}
                    onToggleExclude={handleToggleExclude}
                    onMoveUp={index > 0 ? () => handleMoveItem(item.id, "up") : undefined}
                    onMoveDown={index < purchaseItems.length - 1 ? () => handleMoveItem(item.id, "down") : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {isReadOnly ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[color:rgba(46,166,122,0.08)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                완료된 장보기 기록은 수정할 수 없어요
              </p>
              <button
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--olive)] bg-white px-4 py-2 text-sm font-bold text-[var(--olive)]"
                onClick={() => router.push("/planner")}
                type="button"
              >
                플래너로 돌아가기
              </button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
              <p className="text-sm font-bold text-[var(--foreground)]">
                장보기를 마쳤나요?
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                완료하면 체크한 재료를 팬트리에 반영할 수 있어요.
              </p>
              <button
                onClick={handleCompleteClick}
                disabled={isCompleting}
                className="mt-5 w-full rounded-full bg-[var(--brand)] py-4 text-base font-bold text-white hover:brightness-95 disabled:opacity-50"
                type="button"
              >
                {isCompleting ? "완료 처리 중..." : "장보기 완료"}
              </button>
            </div>
          )}

          <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
            <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">
              팬트리 제외 항목 ({excludedItems.length}개)
            </h3>
            {excludedItems.length > 0 ? (
              <div className="space-y-3">
                {excludedItems.map((item) => (
                  <ShoppingItemCard
                    key={item.id}
                    item={item}
                    isReadOnly={isReadOnly}
                    isUpdating={updatingItem?.itemId === item.id}
                    onToggleCheck={handleToggleCheck}
                    onToggleExclude={handleToggleExclude}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[var(--muted)]">
                팬트리에서 제외된 재료가 없어요.
              </p>
            )}
          </section>
        </aside>
      </main>

      {/* Pantry reflection popup */}
      {showPantryPopup && listDetail && (
        <PantryReflectionPopup
          items={listDetail.items}
          onConfirm={handlePantryConfirm}
          onCancel={handlePantryCancel}
        />
      )}
    </div>
  );
}

function MobileShoppingDetailScreen({
  completeToast,
  detail,
  excludedItems,
  isCompleting,
  isReadOnly,
  isReordering,
  isSharing,
  onBack,
  onComplete,
  onMoveItem,
  onPantryCancel,
  onPantryConfirm,
  onShare,
  onToggleCheck,
  onToggleExclude,
  purchaseItems,
  reorderError,
  shareToast,
  showPantryPopup,
  updatingItem,
}: {
  completeToast: { type: "success" | "error"; message: string } | null;
  detail: ShoppingListDetail;
  excludedItems: ShoppingListItemSummary[];
  isCompleting: boolean;
  isReadOnly: boolean;
  isReordering: boolean;
  isSharing: boolean;
  onBack: () => void;
  onComplete: () => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onPantryCancel: () => void;
  onPantryConfirm: (selectedItemIds: string[] | undefined) => void;
  onShare: () => void;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  purchaseItems: ShoppingListItemSummary[];
  reorderError: string | null;
  shareToast: { type: "success" | "error" | "empty"; message: string } | null;
  showPantryPopup: boolean;
  updatingItem: UpdateState | null;
}) {
  const checkedCount = purchaseItems.filter((item) => item.is_checked).length;
  const remainingCount = purchaseItems.filter((item) => !item.is_checked).length;
  const progress = purchaseItems.length
    ? Math.round((checkedCount / purchaseItems.length) * 100)
    : 100;
  const [firstPurchaseItem, ...otherPurchaseItems] = purchaseItems;

  return (
    <div className="flex min-h-dvh flex-col bg-[#F8F9FA] text-[#212529]">
      <MobileShoppingAppBar
        isSharing={isSharing}
        onBack={onBack}
        onShare={onShare}
        title={detail.title}
      />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
        <section className="border-b border-[#DEE2E6] bg-white px-5 pb-5 pt-[18px]">
          <p className="text-[12px] font-semibold leading-[1.3] text-[#868E96]">
            {formatDateIsoDot(detail.created_at)} 생성
          </p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-[1.3] text-[#868E96]">
                {isReadOnly ? "방금 완료" : `사야 할 재료 ${remainingCount}개`}
              </p>
              <h2 className="mt-1 text-[20px] font-extrabold leading-[1.12] text-[#212529]">
                {isReadOnly ? "장보기 완료" : "장보기 진행 중"}
              </h2>
            </div>
            {!isReadOnly ? (
              <p className="shrink-0 text-[32px] font-extrabold leading-none text-[#2AC1BC]">
                {progress}%
              </p>
            ) : null}
          </div>
          {!isReadOnly ? (
            <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#E9ECEF]">
              <div
                className="h-full rounded-full bg-[#2AC1BC]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </section>

        {shareToast ? (
          <MobileToast message={shareToast.message} type={shareToast.type} />
        ) : null}
        {reorderError ? <MobileToast message={reorderError} type="error" /> : null}
        {completeToast && completeToast.message !== reorderError ? (
          <MobileToast message={completeToast.message} type={completeToast.type} />
        ) : null}
        {isReadOnly ? (
          <p className="mx-4 mt-3 rounded-[10px] bg-[#E6F8F7] px-4 py-3 text-[13px] font-bold text-[#20A8A4]">
            완료된 장보기 기록은 수정할 수 없어요
          </p>
        ) : null}

        <div className="px-4 py-5">
          <span className="absolute h-px w-px opacity-0">
            {isReadOnly ? "구매한 재료" : "구매할 재료"} ({purchaseItems.length}개)
          </span>
          <span className="absolute h-px w-px opacity-0">
            {formatDateRange(detail.date_range_start, detail.date_range_end)}
          </span>
          {isReadOnly && detail.completed_at ? (
            <span className="absolute h-px w-px opacity-0">
              ✓ 완료됨 ({formatDate(detail.completed_at)})
            </span>
          ) : null}
          <span className="absolute h-px w-px opacity-0">
            팬트리 제외 항목 ({excludedItems.length}개)
          </span>

          {firstPurchaseItem ? (
            <MobileShoppingSection
              count={1}
              isReadOnly={isReadOnly}
              isReordering={isReordering}
              items={[firstPurchaseItem]}
              label="냉장"
              onMoveItem={onMoveItem}
              onToggleCheck={onToggleCheck}
              onToggleExclude={onToggleExclude}
              purchaseItems={purchaseItems}
              updatingItem={updatingItem}
            />
          ) : null}

          {otherPurchaseItems.length > 0 ? (
            <MobileShoppingSection
              count={otherPurchaseItems.length}
              isReadOnly={isReadOnly}
              isReordering={isReordering}
              items={otherPurchaseItems}
              label="채소"
              onMoveItem={onMoveItem}
              onToggleCheck={onToggleCheck}
              onToggleExclude={onToggleExclude}
              purchaseItems={purchaseItems}
              updatingItem={updatingItem}
            />
          ) : null}

          {purchaseItems.length === 0 ? (
            <div className="py-8 text-center text-[15px] font-bold text-[#495057]">
              팬트리에 이미 있어서 장볼 재료가 없어요
            </div>
          ) : null}

          {excludedItems.length > 0 ? (
            <MobileShoppingSection
              count={excludedItems.length}
              isReadOnly={isReadOnly}
              isReordering={isReordering}
              items={excludedItems}
              label="팬트리에 이미 있어 제외"
              onMoveItem={onMoveItem}
              onToggleCheck={onToggleCheck}
              onToggleExclude={onToggleExclude}
              purchaseItems={purchaseItems}
              updatingItem={updatingItem}
            />
          ) : null}
        </div>
      </main>

      {!isReadOnly ? (
        <div className="fixed inset-x-0 bottom-[82px] z-20 border-t border-[#DEE2E6] bg-white px-4 py-4">
          <button
            className="flex h-[49px] w-full items-center justify-center rounded-[8px] bg-[#2AC1BC] text-[16px] font-bold text-white disabled:bg-[#DEE2E6]"
            disabled={isCompleting}
            onClick={onComplete}
            type="button"
          >
            {isCompleting ? "완료 중..." : "장보기 완료"}
          </button>
        </div>
      ) : null}

      <Wave1MobileBottomTab
        ariaLabel="장보기 상세 화면 하단 탐색"
        currentTab="planner"
      />

      {showPantryPopup ? (
        <PantryReflectionPopup
          items={detail.items}
          onCancel={onPantryCancel}
          onConfirm={onPantryConfirm}
        />
      ) : null}
    </div>
  );
}

function MobileShoppingAppBar({
  isSharing,
  onBack,
  onShare,
  title,
}: {
  isSharing: boolean;
  onBack: () => void;
  onShare: () => void;
  title: string;
}) {
  return (
    <header className="shrink-0 border-b border-[#DEE2E6] bg-white">
      <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#212529]"
          onClick={onBack}
          type="button"
        >
          <span aria-hidden="true" className="text-[26px] leading-none">
            ‹
          </span>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-extrabold leading-[1.3]">
          {title}
        </h1>
        <button
          aria-label="공유(텍스트)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8F9FA] text-[#495057] disabled:opacity-50"
          disabled={isSharing}
          onClick={onShare}
          type="button"
        >
          <MobileShareIcon />
        </button>
      </div>
    </header>
  );
}

function MobileShareIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[19px] w-[19px]"
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M10 3.2v9.1M6.8 6.4 10 3.2l3.2 3.2M5.3 9.5v5.8c0 .8.6 1.4 1.4 1.4h6.6c.8 0 1.4-.6 1.4-1.4V9.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MobileShoppingSection({
  count,
  isReadOnly,
  isReordering,
  items,
  label,
  onMoveItem,
  onToggleCheck,
  onToggleExclude,
  purchaseItems,
  updatingItem,
}: {
  count: number;
  isReadOnly: boolean;
  isReordering: boolean;
  items: ShoppingListItemSummary[];
  label: string;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  purchaseItems: ShoppingListItemSummary[];
  updatingItem: UpdateState | null;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[12px] font-extrabold leading-[1.3] text-[#868E96]">
        {label} · {count}
      </h3>
      <div className="overflow-hidden rounded-[10px] border border-[#DEE2E6] bg-white">
        {items.map((item) => {
          const purchaseIndex = purchaseItems.findIndex(
            (purchaseItem) => purchaseItem.id === item.id,
          );

          return (
            <MobileShoppingItemRow
              isReadOnly={isReadOnly}
              isReordering={isReordering}
              isUpdating={updatingItem?.itemId === item.id}
              item={item}
              key={item.id}
              onMoveDown={
                purchaseIndex >= 0 && purchaseIndex < purchaseItems.length - 1
                  ? () => onMoveItem(item.id, "down")
                  : undefined
              }
              onMoveUp={
                purchaseIndex > 0 ? () => onMoveItem(item.id, "up") : undefined
              }
              onToggleCheck={onToggleCheck}
              onToggleExclude={onToggleExclude}
            />
          );
        })}
      </div>
    </section>
  );
}

function MobileShoppingItemRow({
  isReadOnly,
  isReordering,
  isUpdating,
  item,
  onMoveDown,
  onMoveUp,
  onToggleCheck,
  onToggleExclude,
}: {
  isReadOnly: boolean;
  isReordering: boolean;
  isUpdating: boolean;
  item: ShoppingListItemSummary;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
}) {
  const itemName = item.display_text.replace(/\s+\d+.*$/, "");
  const amountText = formatAmountText(item);
  const canReorder = !isReadOnly && !item.is_pantry_excluded;

  return (
    <div className="relative flex min-h-[65px] items-center gap-3 border-b border-[#F1F3F5] px-4 py-2.5 last:border-b-0">
      {canReorder ? (
        <div className="absolute left-[3px] top-1/2 flex -translate-y-1/2 flex-col items-center justify-center gap-[2px] text-[#CED4DA]">
          <button
            aria-label={`${item.display_text} 위로 이동`}
            className="h-4 w-4 text-[10px] leading-none opacity-70 disabled:opacity-20"
            disabled={!onMoveUp || isReordering}
            onClick={onMoveUp}
            type="button"
          >
            ▲
          </button>
          <button
            aria-label={`${item.display_text} 아래로 이동`}
            className="h-4 w-4 text-[10px] leading-none opacity-70 disabled:opacity-20"
            disabled={!onMoveDown || isReordering}
            onClick={onMoveDown}
            type="button"
          >
            ▼
          </button>
        </div>
      ) : null}

      {!isReadOnly && !item.is_pantry_excluded ? (
        <button
          aria-checked={item.is_checked}
          aria-label={`${item.display_text} 구매 완료 표시`}
          className="flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-50"
          disabled={isUpdating}
          onClick={() => onToggleCheck(item.id, item.is_checked)}
          role="checkbox"
          type="button"
        >
          <span
            aria-hidden="true"
            className={[
              "flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] text-white",
              item.is_checked
                ? "border-[#2AC1BC] bg-[#2AC1BC]"
                : "border-[#DEE2E6] bg-white",
            ].join(" ")}
          >
            {item.is_checked ? "✓" : ""}
          </span>
        </button>
      ) : (
        <span
          aria-hidden="true"
          data-testid={`shopping-readonly-status-${item.id}`}
          className={[
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border text-[12px]",
            item.is_checked || item.is_pantry_excluded
              ? "border-[#2AC1BC] bg-[#E6F8F7] text-[#2AC1BC]"
              : "border-[#DEE2E6] text-transparent",
          ].join(" ")}
        >
          ✓
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.3] text-[#212529]">
          {itemName}
        </p>
        <p className="mt-[2px] truncate text-[11px] font-semibold leading-[1.3] text-[#868E96]">
          {amountText} · 1끼에 사용
        </p>
      </div>

      {!isReadOnly ? (
        <button
          aria-label={`${item.display_text} ${
            item.is_pantry_excluded ? "되살리기" : "이미있음"
          }`}
          className={[
            "flex h-[30px] w-[64px] shrink-0 items-center justify-center rounded-[8px] border bg-white px-0 text-[11px] font-extrabold disabled:opacity-50",
            item.is_pantry_excluded
              ? "border-[#2AC1BC] text-[#20A8A4]"
              : "border-[#DEE2E6] text-[#495057]",
          ].join(" ")}
          disabled={isUpdating}
          onClick={() =>
            onToggleExclude(item.id, item.is_pantry_excluded, item.is_checked)
          }
          type="button"
        >
          {item.is_pantry_excluded ? "되살리기" : "이미있음"}
        </button>
      ) : item.added_to_pantry ? (
        <span className="shrink-0 text-[11px] font-bold text-[#868E96]">
          팬트리 반영 완료
        </span>
      ) : null}
    </div>
  );
}

function MobileToast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error" | "empty";
}) {
  const isError = type === "error";

  return (
    <div
      className={[
        "mx-4 mt-3 rounded-[10px] px-4 py-3 text-[13px] font-bold",
        isError ? "bg-red-50 text-red-700" : "bg-[#E6F8F7] text-[#20A8A4]",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

interface ShoppingItemCardProps {
  item: ShoppingListItemSummary;
  isReadOnly: boolean;
  isUpdating: boolean;
  isReordering?: boolean;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function ShoppingItemCard({
  item,
  isReadOnly,
  isUpdating,
  isReordering = false,
  onToggleCheck,
  onToggleExclude,
  onMoveUp,
  onMoveDown,
}: ShoppingItemCardProps) {
  const amountText = item.amounts_json
    .map((a) => `${a.amount}${a.unit}`)
    .join(" + ");

  const showReorderButtons = !isReadOnly && (onMoveUp || onMoveDown);
  const showCheckButton = !isReadOnly && !item.is_pantry_excluded;
  const toggleLabel = item.is_pantry_excluded ? "되살리기" : "이미있음";

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-sm">
      {showReorderButtons && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp || isReordering}
            className="flex h-11 w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
            type="button"
            aria-label={`${item.display_text} 위로 이동`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 5L5 10H15L10 5Z" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown || isReordering}
            className="flex h-11 w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
            type="button"
            aria-label={`${item.display_text} 아래로 이동`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 15L15 10H5L10 15Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {showCheckButton ? (
        <button
          onClick={() => onToggleCheck(item.id, item.is_checked)}
          disabled={isUpdating}
          className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
          type="button"
          aria-label={`${item.display_text} 구매 완료 표시`}
          aria-checked={item.is_checked}
          role="checkbox"
        >
          <div
            className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
              item.is_checked
                ? "border-[var(--olive)] bg-[var(--olive)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            {item.is_checked && <span className="text-xs text-white">✓</span>}
          </div>
        </button>
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          <div
            className={[
              "flex h-6 w-6 items-center justify-center rounded-[6px] border text-xs",
              item.is_checked || item.is_pantry_excluded
                ? "border-[var(--brand)] bg-[color:rgba(42,193,188,0.10)] text-[var(--brand)]"
                : "border-[var(--line)] bg-[var(--surface-fill)] text-transparent",
            ].join(" ")}
            data-testid={`shopping-readonly-status-${item.id}`}
          >
            ✓
          </div>
        </div>
      )}

      <div className="flex-1">
        <p className={`text-base font-semibold ${item.is_checked ? "line-through opacity-60" : ""}`}>
          {item.display_text.replace(/\s+\d+.*$/, "")}
        </p>
        <p className="text-sm text-[var(--muted)]">{amountText}</p>
      </div>

      {!isReadOnly && (
        <button
          onClick={() =>
            onToggleExclude(item.id, item.is_pantry_excluded, item.is_checked)
          }
          disabled={isUpdating}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[var(--olive)] px-4 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-white disabled:opacity-50"
          type="button"
          aria-label={`${item.display_text} ${toggleLabel}`}
        >
          {toggleLabel}
        </button>
      )}

      {isReadOnly && item.added_to_pantry && (
        <span className="shrink-0 text-xs text-[var(--muted)]">
          팬트리 반영 완료
        </span>
      )}
    </div>
  );
}

function formatAmountText(item: ShoppingListItemSummary): string {
  return item.amounts_json.map((a) => `${a.amount}${a.unit}`).join(" + ");
}

function formatDateIsoDot(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "예정";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();

  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  }
  return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}
