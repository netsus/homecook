"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { ContentState } from "@/components/shared/content-state";
import {
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
            console.error("완료된 장보기 기록은 수정할 수 없어요.");
          } else {
            console.error(error.message);
          }
        }
      } finally {
        setUpdatingItem(null);
      }
    },
    [listId, listDetail]
  );

  const handleToggleExclude = useCallback(
    async (itemId: string, currentExcluded: boolean) => {
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
                    is_checked: currentExcluded ? false : item.is_checked,
                  }
                : item
            ),
          };
        });

        if (isShoppingApiError(error)) {
          if (error.status === 409) {
            console.error("완료된 장보기 기록은 수정할 수 없어요.");
          } else {
            console.error(error.message);
          }
        }
      } finally {
        setUpdatingItem(null);
      }
    },
    [listId, listDetail]
  );

  const handleShare = useCallback(async () => {
    if (!listDetail) return;

    const hasPurchaseItems = listDetail.items.some((item) => !item.is_pantry_excluded);
    if (!hasPurchaseItems) {
      setShareToast({ type: "empty", message: "공유할 구매 항목이 없어요" });
      setTimeout(() => setShareToast(null), 3000);
      return;
    }

    setIsSharing(true);
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
      setTimeout(() => setShareToast(null), 3000);
    }
  }, [listId, listDetail, router]);

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
    [listId, listDetail, router]
  );

  if (viewState === "loading") {
    return (
      <div className="flex min-h-screen flex-col">
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
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--panel)] px-4 py-3 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push("/");
              }
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"
            type="button"
            aria-label="뒤로 가기"
          >
            <span className="text-lg">←</span>
          </button>
          <h1 className="text-xl font-extrabold tracking-tight">장보기 상세</h1>
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
          className={`mx-4 mt-2 rounded-xl px-4 py-3 text-sm font-semibold ${
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
      <div className="border-b border-[var(--line)] px-4 py-4">
        <h2 className="text-lg font-bold">{listDetail.title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {formatDateRange(listDetail.date_range_start, listDetail.date_range_end)}
        </p>
        {isReadOnly && listDetail.completed_at && (
          <p className="mt-1 text-sm font-semibold text-[var(--olive)]">
            ✓ 완료됨 ({formatDate(listDetail.completed_at)})
          </p>
        )}
      </div>

      {/* Read-only notice */}
      {isReadOnly && (
        <div className="bg-[color:rgba(46,166,122,0.08)] px-4 py-3">
          <p className="text-sm text-[var(--muted)]">
            ℹ️ 완료된 장보기 기록은 수정할 수 없어요
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 px-4 py-6">
        {/* Empty state */}
        {isEmpty && (
          <div className="mb-6 text-center">
            <p className="text-2xl">🛒</p>
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

        {/* Purchase section */}
        {!isEmpty && (
          <section className="mb-6">
            <h3 className="mb-3 text-sm font-bold text-[var(--muted)]">
              {isReadOnly ? "구매한 재료" : "구매할 재료"} ({purchaseItems.length}개)
            </h3>
            <div className="space-y-3">
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

        {/* Excluded section */}
        {excludedItems.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-bold text-[var(--muted)]">
              팬트리 제외 항목 ({excludedItems.length}개)
            </h3>
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
          </section>
        )}
      </div>
    </div>
  );
}

interface ShoppingItemCardProps {
  item: ShoppingListItemSummary;
  isReadOnly: boolean;
  isUpdating: boolean;
  isReordering?: boolean;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (itemId: string, currentExcluded: boolean) => void;
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

      <button
        onClick={() => onToggleCheck(item.id, item.is_checked)}
        disabled={isReadOnly || isUpdating}
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

      <div className="flex-1">
        <p className={`text-base font-semibold ${item.is_checked ? "line-through opacity-60" : ""}`}>
          {item.display_text.replace(/\s+\d+.*$/, "")}
        </p>
        <p className="text-sm text-[var(--muted)]">{amountText}</p>
      </div>

      {!isReadOnly && (
        <button
          onClick={() => onToggleExclude(item.id, item.is_pantry_excluded)}
          disabled={isUpdating}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[var(--olive)] px-4 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-white disabled:opacity-50"
          type="button"
          aria-label={`${item.display_text} 팬트리 ${item.is_pantry_excluded ? "되살리기" : "제외"}`}
        >
          {item.is_pantry_excluded ? "되살리기" : "팬트리 제외"}
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
