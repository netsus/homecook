"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { PantryReflectionPopup } from "@/components/shopping/pantry-reflection-popup";
import {
  WebButton,
  WebCard,
  WebShell,
  WebTopNav,
} from "@/components/web";
import {
  completeShoppingList,
  fetchShoppingListDetail,
  fetchShoppingShareText,
  isShoppingApiError,
  updateShoppingListItem,
} from "@/lib/api/shopping";
import type { ShoppingListDetail, ShoppingListItemSummary } from "@/types/shopping";

export interface ShoppingDetailScreenProps {
  listId: string;
  initialAuthenticated: boolean;
  navActiveId?: "planner" | "mypage";
  presentation?: "screen" | "embedded";
  onCompleted?: () => void;
  onRequestClose?: () => void;
}

type ViewState = "loading" | "error" | "ready";

interface UpdateState {
  itemId: string;
  type: "check" | "exclude";
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export function ShoppingDetailScreen({
  listId,
  initialAuthenticated,
  navActiveId = "planner",
  presentation = "screen",
  onCompleted,
  onRequestClose,
}: ShoppingDetailScreenProps) {
  const router = useRouter();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [listDetail, setListDetail] = useState<ShoppingListDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [updatingItem, setUpdatingItem] = useState<UpdateState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareToast, setShareToast] = useState<{ type: "success" | "error" | "empty"; message: string } | null>(null);
  const [isUpdatingAllPurchaseItems, setIsUpdatingAllPurchaseItems] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeToast, setCompleteToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPantryPopup, setShowPantryPopup] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/planner" });
  const shareToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEmbedded = presentation === "embedded";
  const handleBack = onRequestClose ?? appReturn.goBack;

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
              item.id === itemId ? { ...updatedItem, category: item.category } : item
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
              item.id === itemId ? { ...updatedItem, category: item.category } : item
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

  const handleToggleAllPurchaseItems = useCallback(async () => {
    if (!listDetail || listDetail.is_completed || isUpdatingAllPurchaseItems) {
      return;
    }

    const purchaseItems = listDetail.items.filter(
      (item) => !item.is_pantry_excluded,
    );
    if (purchaseItems.length === 0) {
      return;
    }

    const nextChecked = !purchaseItems.every((item) => item.is_checked);
    const targetItems = purchaseItems.filter(
      (item) => item.is_checked !== nextChecked,
    );
    if (targetItems.length === 0) {
      return;
    }

    const previousItems = listDetail.items;
    setIsUpdatingAllPurchaseItems(true);
    setCompleteToast(null);

    setListDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          !item.is_pantry_excluded ? { ...item, is_checked: nextChecked } : item,
        ),
      };
    });

    try {
      const updatedItems = await Promise.all(
        targetItems.map((item) =>
          updateShoppingListItem(listId, item.id, { is_checked: nextChecked }),
        ),
      );
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));

      setListDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => {
            const updated = updatedById.get(item.id);
            return updated ? { ...updated, category: item.category } : item;
          }),
        };
      });
    } catch (error) {
      setListDetail((prev) => (prev ? { ...prev, items: previousItems } : prev));

      if (isShoppingApiError(error)) {
        if (error.status === 409) {
          markListReadOnly("완료된 장보기 기록은 수정할 수 없어요");
        } else if (error.status === 401) {
          router.push(`/login?next=/shopping/lists/${listId}`);
          return;
        } else {
          setCompleteToast({
            type: "error",
            message: error.message,
          });
        }
      } else {
        setCompleteToast({
          type: "error",
          message: "전체 선택을 저장하지 못했어요",
        });
      }

      setTimeout(() => setCompleteToast(null), 3000);
    } finally {
      setIsUpdatingAllPurchaseItems(false);
    }
  }, [
    isUpdatingAllPurchaseItems,
    listDetail,
    listId,
    markListReadOnly,
    router,
  ]);

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
          onCompleted?.();
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
    [listId, listDetail, markListReadOnly, onCompleted, router]
  );

  const handlePantryCancel = useCallback(() => {
    setShowPantryPopup(false);
  }, []);

  if (viewState === "loading") {
    return (
      <ShoppingDetailSkeleton
        embedded={isEmbedded}
        mobile={isMobileViewport}
        navActiveId={navActiveId}
        onBack={handleBack}
      />
    );
  }

  if (viewState === "error") {
    if (isEmbedded) {
      return (
        <div
          className="web-shopping-detail-embedded"
          data-testid="shopping-detail-embedded"
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
        isSharing={isSharing}
        isUpdatingAllPurchaseItems={isUpdatingAllPurchaseItems}
        navActiveId={navActiveId}
        onBack={handleBack}
        onComplete={handleCompleteClick}
        onShare={handleShare}
        onToggleAllPurchaseItems={handleToggleAllPurchaseItems}
        onToggleCheck={handleToggleCheck}
        onToggleExclude={handleToggleExclude}
        purchaseItems={purchaseItems}
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
  const displayTitle = formatShoppingDisplayTitle(listDetail);

  if (isEmbedded) {
    return (
      <div
        className="web-shopping-detail-embedded"
        data-testid="shopping-detail-embedded"
      >
        <header className="web-shopping-detail-head">
          <div>
            <p className="web-menu-add-eyebrow">
              {isReadOnly ? "Completed Shopping" : "Shopping List"}
            </p>
            <h1>{displayTitle}</h1>
          </div>
          <div className="web-shopping-detail-actions">
            <WebButton onClick={handleBack} size="sm" variant="tertiary">
              목록으로
            </WebButton>
            <WebButton
              aria-label="공유(텍스트)"
              disabled={isSharing}
              onClick={handleShare}
              variant="secondary"
            >
              {isSharing ? "공유 중..." : "공유"}
            </WebButton>
          </div>
        </header>

        {shareToast ? (
          <StatusToast
            message={shareToast.message}
            tone={shareToast.type === "error" ? "error" : "success"}
          />
        ) : null}
        {completeToast ? (
          <StatusToast message={completeToast.message} tone={completeToast.type} />
        ) : null}

        {isReadOnly ? (
          <WebCard className="web-shopping-lock">
            <strong>완료된 장보기 기록은 수정할 수 없어요</strong>
            {listDetail.completed_at ? (
              <span>
                완료 {formatDate(listDetail.completed_at)}
                <span className="sr-only">
                  {" "}
                  ✓ 완료됨 ({formatDate(listDetail.completed_at)})
                </span>
              </span>
            ) : null}
          </WebCard>
        ) : (
          <WebCard className="web-shopping-progress">
            <div>
              <div className="web-shopping-progress-title-row">
                <span>장보기 진행 중</span>
                <span>{completedCount} / {purchaseItems.length} 항목</span>
              </div>
              <strong className="web-shopping-progress-count">
                <em>{progressPercent}%</em>
              </strong>
            </div>
            <span className="web-shopping-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </span>
          </WebCard>
        )}

        <div className="web-shopping-detail-layout">
          <section
            className="web-shopping-purchase-section"
            aria-labelledby="shopping-purchase-title"
          >
            <div className="web-shopping-section-head">
              <div>
                <h2 id="shopping-purchase-title">
                  {isReadOnly ? "구매한 재료" : "구매할 재료"}
                  <span className="sr-only">
                    {` ${isReadOnly ? "구매한 재료" : "구매할 재료"} (${purchaseItems.length}개)`}
                  </span>
                </h2>
                <p>{purchaseItems.length}개 항목</p>
              </div>
              {!isReadOnly ? (
                <div className="web-shopping-section-actions">
                  <PurchaseSelectAllControl
                    checked={
                      purchaseItems.length > 0 &&
                      purchaseItems.every((item) => item.is_checked)
                    }
                    disabled={
                      purchaseItems.length === 0 || isUpdatingAllPurchaseItems
                    }
                    onClick={handleToggleAllPurchaseItems}
                  />
                  <span>체크 · 제외</span>
                </div>
              ) : null}
            </div>

            {isEmpty ? (
              <div className="web-modal-panel">
                <p className="web-modal-copy">
                  팬트리에 이미 있어서 장볼 재료가 없어요.
                </p>
              </div>
            ) : (
              <ShoppingItemCategoryGroups
                isReadOnly={isReadOnly}
                items={purchaseItems}
                onToggleCheck={handleToggleCheck}
                onToggleExclude={handleToggleExclude}
                updatingItem={updatingItem}
              />
            )}
          </section>

          <aside className="web-shopping-detail-rail">
            {isReadOnly ? (
              <WebCard className="web-shopping-rail-card">
                <h2>읽기 전용</h2>
                <p>완료된 장보기 기록은 체크와 제외 상태를 바꿀 수 없어요.</p>
                <WebButton
                  onClick={handleBack}
                  variant="secondary"
                >
                  목록으로
                </WebButton>
              </WebCard>
            ) : (
              <WebCard className="web-shopping-rail-card">
                <h2>장보기를 마쳤나요?</h2>
                <p>완료하면 체크한 재료를 팬트리에 반영할 수 있어요.</p>
                <WebButton
                  disabled={isCompleting}
                  fullWidth
                  onClick={handleCompleteClick}
                >
                  {isCompleting ? "완료 처리 중..." : "장보기 완료"}
                </WebButton>
              </WebCard>
            )}

            <WebCard className="web-shopping-rail-card">
              <h2>
                팬트리에 있는 재료
                <span className="sr-only">
                  {` 팬트리에 있는 재료 (${excludedItems.length}개)`}
                </span>
              </h2>
              <p>{excludedItems.length}개 항목</p>
              {excludedItems.length > 0 ? (
                <ShoppingItemCategoryGroups
                  className="web-shopping-excluded-list"
                  isReadOnly={isReadOnly}
                  items={excludedItems}
                  onToggleCheck={handleToggleCheck}
                  onToggleExclude={handleToggleExclude}
                  updatingItem={updatingItem}
                />
              ) : (
                <p className="web-modal-copy">팬트리에 있는 재료가 없어요.</p>
              )}
            </WebCard>
          </aside>
        </div>

        {showPantryPopup && listDetail ? (
          <PantryReflectionPopup
            items={listDetail.items}
            onCancel={handlePantryCancel}
            onConfirm={handlePantryConfirm}
          />
        ) : null}
      </div>
    );
  }

  return (
    <WebShell className="web-shopping-shell" wide>
      <WebTopNav activeId={navActiveId} items={WEB_NAV_ITEMS} />
      <main className="web-screen web-shopping-detail-screen">
        <nav aria-label="장보기 상세 경로" className="web-breadcrumb">
          <button
            aria-label="이전 화면으로 돌아가기"
            className="web-breadcrumb-link"
            onClick={handleBack}
            type="button"
          >
            장보기
          </button>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">상세</span>
        </nav>

        <header className="web-shopping-detail-head">
          <div>
            <p className="web-menu-add-eyebrow">
              {isReadOnly ? "Completed Shopping" : "Shopping List"}
            </p>
            <h1>{displayTitle}</h1>
          </div>
          <div className="web-shopping-detail-actions">
            <WebButton
              aria-label="공유(텍스트)"
              disabled={isSharing}
              onClick={handleShare}
              variant="secondary"
            >
              {isSharing ? "공유 중..." : "공유"}
            </WebButton>
          </div>
        </header>

        {shareToast ? (
          <StatusToast
            message={shareToast.message}
            tone={shareToast.type === "error" ? "error" : "success"}
          />
        ) : null}
        {completeToast ? (
          <StatusToast message={completeToast.message} tone={completeToast.type} />
        ) : null}

        {isReadOnly ? (
          <WebCard className="web-shopping-lock">
            <strong>완료된 장보기 기록은 수정할 수 없어요</strong>
            {listDetail.completed_at ? (
              <span>
                완료 {formatDate(listDetail.completed_at)}
                <span className="sr-only">
                  {" "}
                  ✓ 완료됨 ({formatDate(listDetail.completed_at)})
                </span>
              </span>
            ) : null}
          </WebCard>
        ) : (
          <WebCard className="web-shopping-progress">
            <div>
              <div className="web-shopping-progress-title-row">
                <span>장보기 진행 중</span>
                <span>{completedCount} / {purchaseItems.length} 항목</span>
              </div>
              <strong className="web-shopping-progress-count">
                <em>{progressPercent}%</em>
              </strong>
            </div>
            <span className="web-shopping-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </span>
          </WebCard>
        )}

        <div className="web-shopping-detail-layout">
          <section
            className="web-shopping-purchase-section"
            aria-labelledby="shopping-purchase-title"
          >
            <div className="web-shopping-section-head">
              <div>
                <h2 id="shopping-purchase-title">
                  {isReadOnly ? "구매한 재료" : "구매할 재료"}
                  <span className="sr-only">
                    {` ${isReadOnly ? "구매한 재료" : "구매할 재료"} (${purchaseItems.length}개)`}
                  </span>
                </h2>
                <p>{purchaseItems.length}개 항목</p>
              </div>
              {!isReadOnly ? (
                <div className="web-shopping-section-actions">
                  <PurchaseSelectAllControl
                    checked={
                      purchaseItems.length > 0 &&
                      purchaseItems.every((item) => item.is_checked)
                    }
                    disabled={
                      purchaseItems.length === 0 || isUpdatingAllPurchaseItems
                    }
                    onClick={handleToggleAllPurchaseItems}
                  />
                  <span>체크 · 제외</span>
                </div>
              ) : null}
            </div>

            {isEmpty ? (
              <div className="web-modal-panel">
                <p className="web-modal-copy">
                  팬트리에 이미 있어서 장볼 재료가 없어요.
                </p>
              </div>
            ) : (
              <ShoppingItemCategoryGroups
                isReadOnly={isReadOnly}
                items={purchaseItems}
                onToggleCheck={handleToggleCheck}
                onToggleExclude={handleToggleExclude}
                updatingItem={updatingItem}
              />
            )}
          </section>

          <aside className="web-shopping-detail-rail">
            {isReadOnly ? (
              <WebCard className="web-shopping-rail-card">
                <h2>읽기 전용</h2>
                <p>완료된 장보기 기록은 체크와 제외 상태를 바꿀 수 없어요.</p>
                <WebButton
                  onClick={() => router.push("/planner")}
                  variant="secondary"
                >
                  플래너로 돌아가기
                </WebButton>
              </WebCard>
            ) : (
              <WebCard className="web-shopping-rail-card">
                <h2>장보기를 마쳤나요?</h2>
                <p>완료하면 체크한 재료를 팬트리에 반영할 수 있어요.</p>
                <WebButton
                  disabled={isCompleting}
                  fullWidth
                  onClick={handleCompleteClick}
                >
                  {isCompleting ? "완료 처리 중..." : "장보기 완료"}
                </WebButton>
              </WebCard>
            )}

            <WebCard className="web-shopping-rail-card">
              <h2>
                팬트리에 있는 재료
                <span className="sr-only">
                  {` 팬트리에 있는 재료 (${excludedItems.length}개)`}
                </span>
              </h2>
              <p>{excludedItems.length}개 항목</p>
              {excludedItems.length > 0 ? (
                <ShoppingItemCategoryGroups
                  className="web-shopping-excluded-list"
                  isReadOnly={isReadOnly}
                  items={excludedItems}
                  onToggleCheck={handleToggleCheck}
                  onToggleExclude={handleToggleExclude}
                  updatingItem={updatingItem}
                />
              ) : (
                <p className="web-modal-copy">팬트리에 있는 재료가 없어요.</p>
              )}
            </WebCard>
          </aside>
        </div>

        {showPantryPopup && listDetail ? (
          <PantryReflectionPopup
            items={listDetail.items}
            onCancel={handlePantryCancel}
            onConfirm={handlePantryConfirm}
          />
        ) : null}
      </main>
    </WebShell>
  );
}

function ShoppingDetailSkeleton({
  embedded = false,
  mobile,
  navActiveId,
  onBack,
}: {
  embedded?: boolean;
  mobile: boolean;
  navActiveId: "planner" | "mypage";
  onBack: () => void;
}) {
  if (mobile) {
    return (
      <div
        aria-busy="true"
        aria-label="장보기 상세를 불러오는 중"
        className="flex min-h-dvh flex-col bg-[var(--surface-fill)] text-[var(--foreground)]"
        data-testid="shopping-detail-skeleton"
      >
        <header className="shrink-0 border-b border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="grid min-h-[var(--control-height-xl)] grid-cols-[36px_1fr_36px] items-center gap-2 px-4 py-2.5">
            <button
              aria-label="뒤로 가기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--foreground)]"
              onClick={onBack}
              type="button"
            >
              <span aria-hidden="true" className="text-[26px] leading-none">
                ‹
              </span>
            </button>
            <h1 className="min-w-0 truncate text-center text-[18px] font-extrabold leading-[1.3]">
              장보기 상세
            </h1>
            <div aria-hidden="true" />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
          <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 pb-5 pt-[18px]">
            <div className="space-y-3">
              <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
              <div className="h-7 w-44 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-subtle)]" />
              <div className="h-4 w-56 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
            </div>
          </section>
          <section className="space-y-3 px-4 py-4">
            {[1, 2, 3, 4].map((index) => (
              <div
                className="flex min-h-[74px] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
                key={index}
              >
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
                  <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
                </div>
                <div className="h-8 w-16 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
              </div>
            ))}
          </section>
        </main>
      <Wave1MobileBottomTab
        ariaLabel="장보기 상세 화면 하단 내비게이션"
        currentTab={navActiveId}
      />
      </div>
    );
  }

  if (embedded) {
    return (
      <div
        aria-busy="true"
        aria-label="장보기 상세를 불러오는 중"
        className="web-shopping-detail-embedded"
        data-testid="shopping-detail-embedded-skeleton"
      >
        <div className="web-shopping-detail-head">
          <div>
            <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
            <div className="mt-4 h-8 w-56 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-subtle)]" />
            <div className="mt-3 h-4 w-72 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
          </div>
          <WebButton onClick={onBack} size="sm" variant="tertiary">
            목록으로
          </WebButton>
        </div>
        <div className="web-shopping-detail-layout">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((index) => (
              <div
                className="h-20 animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]"
                key={index}
              />
            ))}
          </div>
          <aside className="space-y-3">
            {[1, 2].map((index) => (
              <div
                className="h-28 animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]"
                key={index}
              />
            ))}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label="장보기 상세를 불러오는 중"
      className="min-h-screen bg-[var(--wave1-surface)]"
      data-testid="shopping-detail-skeleton"
    >
      <WebShell>
        <WebTopNav activeId={navActiveId} items={WEB_NAV_ITEMS} />
        <main className="mx-auto max-w-5xl px-5 py-8">
          <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
            <div className="mt-4 h-8 w-64 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-subtle)]" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded-full bg-[var(--surface-subtle)]" />
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((index) => (
                <div
                  className="h-20 animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]"
                  key={index}
                />
              ))}
            </div>
            <aside className="space-y-3">
              {[1, 2].map((index) => (
                <div
                  className="h-28 animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]"
                  key={index}
                />
              ))}
            </aside>
          </div>
        </main>
      </WebShell>
    </div>
  );
}

function MobileShoppingDetailScreen({
  completeToast,
  detail,
  excludedItems,
  isCompleting,
  isReadOnly,
  isSharing,
  isUpdatingAllPurchaseItems,
  navActiveId,
  onBack,
  onComplete,
  onPantryCancel,
  onPantryConfirm,
  onShare,
  onToggleAllPurchaseItems,
  onToggleCheck,
  onToggleExclude,
  purchaseItems,
  shareToast,
  showPantryPopup,
  updatingItem,
}: {
  completeToast: { type: "success" | "error"; message: string } | null;
  detail: ShoppingListDetail;
  excludedItems: ShoppingListItemSummary[];
  isCompleting: boolean;
  isReadOnly: boolean;
  isSharing: boolean;
  isUpdatingAllPurchaseItems: boolean;
  navActiveId: "planner" | "mypage";
  onBack: () => void;
  onComplete: () => void;
  onPantryCancel: () => void;
  onPantryConfirm: (selectedItemIds: string[] | undefined) => void;
  onShare: () => void;
  onToggleAllPurchaseItems: () => void;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  purchaseItems: ShoppingListItemSummary[];
  shareToast: { type: "success" | "error" | "empty"; message: string } | null;
  showPantryPopup: boolean;
  updatingItem: UpdateState | null;
}) {
  const checkedCount = purchaseItems.filter((item) => item.is_checked).length;
  const remainingCount = purchaseItems.filter((item) => !item.is_checked).length;
  const progress = purchaseItems.length
    ? Math.round((checkedCount / purchaseItems.length) * 100)
    : 100;
  const purchaseGroups = groupShoppingItemsByCategory(purchaseItems);
  const excludedGroups = groupShoppingItemsByCategory(excludedItems);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--surface-fill)] text-[var(--foreground)]" data-testid="shopping-detail-mobile">
      <MobileShoppingAppBar
        isCompleting={isCompleting}
        isReadOnly={isReadOnly}
        isSharing={isSharing}
        onBack={onBack}
        onComplete={onComplete}
        onShare={onShare}
        title={formatShoppingDisplayTitle(detail)}
      />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[104px] pt-[58px]">
        <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 pb-5 pt-[18px]">
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-[1.3] text-[var(--text-3)]">
                {isReadOnly ? "방금 완료" : `사야 할 재료 ${remainingCount}개`}
              </p>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <h2 className="text-[20px] font-extrabold leading-[1.12] text-[var(--foreground)]">
                  {isReadOnly ? "장보기 완료" : "장보기 진행 중"}
                </h2>
                {!isReadOnly ? (
                  <span className="shrink-0 text-[12px] font-extrabold leading-[1.2] text-[var(--text-3)]">
                    {checkedCount} / {purchaseItems.length} 항목
                  </span>
                ) : null}
              </div>
            </div>
            {!isReadOnly ? (
              <div className="shrink-0 text-right">
                <p className="text-[32px] font-extrabold leading-none text-[var(--brand)]">
                  {progress}%
                </p>
              </div>
            ) : null}
          </div>
          {!isReadOnly ? (
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--line-strong)]">
              <div
                className="h-full rounded-full bg-[var(--brand)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </section>

        {shareToast ? (
          <MobileToast message={shareToast.message} type={shareToast.type} />
        ) : null}
        {completeToast ? (
          <MobileToast message={completeToast.message} type={completeToast.type} />
        ) : null}
        {isReadOnly ? (
          <p className="mx-4 mt-3 rounded-[var(--radius-control)] bg-[var(--brand-soft)] px-4 py-3 text-[13px] font-bold text-[var(--brand)]">
            완료된 장보기 기록은 수정할 수 없어요
          </p>
        ) : null}

        <div className="px-4 py-5">
          <span className="absolute h-px w-px opacity-0">
            {isReadOnly ? "구매한 재료" : "구매할 재료"} ({purchaseItems.length}개)
          </span>
          {isReadOnly && detail.completed_at ? (
            <span className="absolute h-px w-px opacity-0">
              ✓ 완료됨 ({formatDate(detail.completed_at)})
            </span>
          ) : null}
          <span className="absolute h-px w-px opacity-0">
            팬트리에 있는 재료 ({excludedItems.length}개)
          </span>

          {!isReadOnly && purchaseItems.length > 0 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                구매할 재료
              </h3>
              <PurchaseSelectAllControl
                checked={purchaseItems.every((item) => item.is_checked)}
                disabled={isUpdatingAllPurchaseItems}
                onClick={onToggleAllPurchaseItems}
              />
            </div>
          ) : null}

          {purchaseGroups.map((group) => (
            <MobileShoppingSection
              count={group.items.length}
              isReadOnly={isReadOnly}
              items={group.items}
              key={group.category}
              label={group.category}
              onToggleCheck={onToggleCheck}
              onToggleExclude={onToggleExclude}
              updatingItem={updatingItem}
            />
          ))}

          {purchaseItems.length === 0 ? (
            <div className="py-8 text-center text-[15px] font-bold text-[var(--text-2)]">
              팬트리에 이미 있어서 장볼 재료가 없어요
            </div>
          ) : null}

          {excludedGroups.length > 0 ? (
            <section className="mt-6 rounded-[var(--radius-card)] bg-[var(--brand-soft)] p-3">
              <h3 className="mb-3 text-[14px] font-extrabold leading-[1.3] text-[var(--brand)]">
                팬트리에 있는 재료 · {excludedItems.length}
              </h3>
              {excludedGroups.map((group) => (
                <MobileShoppingSection
                  count={group.items.length}
                  isReadOnly={isReadOnly}
                  items={group.items}
                  key={group.category}
                  label={group.category}
                  onToggleCheck={onToggleCheck}
                  onToggleExclude={onToggleExclude}
                  updatingItem={updatingItem}
                  variant="pantry"
                />
              ))}
            </section>
          ) : null}
        </div>
      </main>

        <Wave1MobileBottomTab
          ariaLabel="장보기 상세 화면 하단 내비게이션"
          currentTab={navActiveId}
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
  isCompleting,
  isReadOnly,
  isSharing,
  onBack,
  onComplete,
  onShare,
  title,
}: {
  isCompleting: boolean;
  isReadOnly: boolean;
  isSharing: boolean;
  onBack: () => void;
  onComplete: () => void;
  onShare: () => void;
  title: string;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--foreground)]"
          onClick={onBack}
          type="button"
        >
          <span aria-hidden="true" className="text-[26px] leading-none">
            ‹
          </span>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-left text-[18px] font-extrabold leading-[1.3]">
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="공유(텍스트)"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[var(--text-2)] disabled:opacity-50"
            disabled={isSharing}
            onClick={onShare}
            type="button"
          >
            <MobileShareIcon />
          </button>
          {!isReadOnly ? (
            <button
              className="flex h-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-3 text-[13px] font-extrabold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)] disabled:text-[var(--text-4)]"
              disabled={isCompleting}
              onClick={onComplete}
              type="button"
            >
              {isCompleting ? "완료 중" : "장보기 완료"}
            </button>
          ) : null}
        </div>
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
  items,
  label,
  onToggleCheck,
  onToggleExclude,
  updatingItem,
  variant = "purchase",
}: {
  count: number;
  isReadOnly: boolean;
  items: ShoppingListItemSummary[];
  label: string;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  updatingItem: UpdateState | null;
  variant?: "purchase" | "pantry";
}) {
  const isPantry = variant === "pantry";

  return (
    <section className={isPantry ? "mb-3 last:mb-0" : "mb-4"}>
      <h3
        className={[
          "mb-2 text-[12px] font-extrabold leading-[1.3]",
          isPantry ? "text-[var(--brand)]" : "text-[var(--text-3)]",
        ].join(" ")}
      >
        {label} · {count}
      </h3>
      <div
        className={[
          "overflow-hidden rounded-[var(--radius-control)] border bg-[var(--surface)]",
          isPantry ? "border-[var(--brand-border)]" : "border-[var(--line-strong)]",
        ].join(" ")}
      >
        {items.map((item) => (
          <MobileShoppingItemRow
            isReadOnly={isReadOnly}
            isUpdating={updatingItem?.itemId === item.id}
            item={item}
            key={item.id}
            onToggleCheck={onToggleCheck}
            onToggleExclude={onToggleExclude}
          />
        ))}
      </div>
    </section>
  );
}

function MobileShoppingItemRow({
  isReadOnly,
  isUpdating,
  item,
  onToggleCheck,
  onToggleExclude,
}: {
  isReadOnly: boolean;
  isUpdating: boolean;
  item: ShoppingListItemSummary;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
}) {
  const itemName = item.display_text.replace(/\s+\d+.*$/, "");
  const amountText = formatAmountText(item);

  const canToggleCheck = !isReadOnly && !item.is_pantry_excluded && !isUpdating;

  return (
    <div
      className={[
        "relative flex min-h-[65px] items-center gap-3 border-b border-[var(--surface-subtle)] px-4 py-2.5 last:border-b-0",
        canToggleCheck ? "cursor-pointer active:bg-[var(--surface-fill)]" : "",
      ].join(" ")}
      onClick={() => {
        if (canToggleCheck) {
          onToggleCheck(item.id, item.is_checked);
        }
      }}
    >
      {!isReadOnly && !item.is_pantry_excluded ? (
        <button
          aria-checked={item.is_checked}
          aria-label={`${item.display_text} 구매 완료 표시`}
          className="flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-50"
          disabled={isUpdating}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCheck(item.id, item.is_checked);
          }}
          role="checkbox"
          type="button"
        >
          <span
            aria-hidden="true"
            className={[
              "flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] text-[var(--text-inverse)]",
              item.is_checked
                ? "border-[var(--brand)] bg-[var(--brand)]"
                : "border-[var(--line-strong)] bg-[var(--surface)]",
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
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-badge)] border text-[12px]",
            item.is_checked || item.is_pantry_excluded
              ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
              : "border-[var(--line-strong)] text-transparent",
          ].join(" ")}
        >
          ✓
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          {itemName}
        </p>
        <p className="mt-[2px] truncate text-[11px] font-semibold leading-[1.3] text-[var(--text-3)]">
          {amountText}
        </p>
      </div>

      {!isReadOnly ? (
        <button
          aria-label={`${item.display_text} ${
            item.is_pantry_excluded ? "되살리기" : "이미있음"
          }`}
          className={[
            "flex h-8 w-[76px] shrink-0 items-center justify-center rounded-full border border-[var(--brand)] bg-[var(--surface)] px-0 text-[12px] font-extrabold text-[var(--brand)] disabled:opacity-50",
          ].join(" ")}
          disabled={isUpdating}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExclude(item.id, item.is_pantry_excluded, item.is_checked);
          }}
          type="button"
        >
          {item.is_pantry_excluded ? "되살리기" : "이미있음"}
        </button>
      ) : item.added_to_pantry ? (
        <span className="shrink-0 text-[11px] font-bold text-[var(--text-3)]">
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
        "mx-4 mt-3 rounded-[var(--radius-control)] px-4 py-3 text-[13px] font-bold",
        isError ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand)]",
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
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
}

interface ShoppingItemCategoryGroup {
  category: string;
  items: ShoppingListItemSummary[];
  sortIndex: number;
}

const SHOPPING_CATEGORY_ORDER = [
  "채소",
  "과일",
  "육류",
  "해산물",
  "유제품",
  "곡류",
  "양념",
  "기타",
] as const;

const SHOPPING_CATEGORY_INDEX: Map<string, number> = new Map(
  SHOPPING_CATEGORY_ORDER.map((category, index) => [category, index]),
);

function normalizeShoppingCategory(rawCategory: string | null | undefined) {
  const category = rawCategory?.trim() ?? "";

  if (/채소|버섯|나물/.test(category)) return "채소";
  if (/과일/.test(category)) return "과일";
  if (/육류|축산|닭|돼지|소고기|쇠고기|계란|달걀/.test(category)) return "육류";
  if (/해산|수산|생선|어패|해조/.test(category)) return "해산물";
  if (/유제품|유가공|우유|치즈|버터|크림/.test(category)) return "유제품";
  if (/곡류|쌀|밀|두류|서류|전분|견과|종실|콩류/.test(category)) return "곡류";
  if (/조미|양념|소스|장류|유지|식용유|소금|설탕|식초/.test(category)) {
    return "양념";
  }

  return category || "기타";
}

function inferShoppingCategoryFromName(displayText: string) {
  if (/양파|대파|파|마늘|고추|배추|무|당근|감자|버섯|상추|깻잎|호박|오이|토마토/.test(displayText)) {
    return "채소";
  }
  if (/사과|배|딸기|바나나|레몬|라임|오렌지|귤/.test(displayText)) return "과일";
  if (/소고기|쇠고기|돼지고기|닭고기|베이컨|햄|계란|달걀/.test(displayText)) return "육류";
  if (/새우|오징어|조개|멸치|다시마|미역|김|생선/.test(displayText)) return "해산물";
  if (/우유|치즈|버터|크림|요거트|요구르트/.test(displayText)) return "유제품";
  if (/쌀|밥|면|밀가루|전분|빵|콩|두부|땅콩/.test(displayText)) return "곡류";
  if (/간장|된장|고추장|소금|설탕|식초|고춧가루|후추|기름|오일|소스|참기름/.test(displayText)) {
    return "양념";
  }
  return "기타";
}

function getShoppingItemCategory(item: ShoppingListItemSummary) {
  const normalized = normalizeShoppingCategory(item.category);
  return normalized === "기타"
    ? inferShoppingCategoryFromName(item.display_text)
    : normalized;
}

function groupShoppingItemsByCategory(items: ShoppingListItemSummary[]) {
  const groups = new Map<string, ShoppingItemCategoryGroup>();

  items.forEach((item) => {
    const category = getShoppingItemCategory(item);
    const existing = groups.get(category);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(category, {
      category,
      items: [item],
      sortIndex: SHOPPING_CATEGORY_INDEX.get(category) ?? SHOPPING_CATEGORY_ORDER.length,
    });
  });

  return [...groups.values()].sort((left, right) => {
    const byIndex = left.sortIndex - right.sortIndex;
    if (byIndex !== 0) return byIndex;
    return left.category.localeCompare(right.category, "ko");
  });
}

function ShoppingItemCategoryGroups({
  className,
  isReadOnly,
  items,
  onToggleCheck,
  onToggleExclude,
  updatingItem,
}: {
  className?: string;
  isReadOnly: boolean;
  items: ShoppingListItemSummary[];
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  updatingItem: UpdateState | null;
}) {
  return (
    <div className={["web-shopping-category-list", className ?? ""].join(" ")}>
      {groupShoppingItemsByCategory(items).map((group) => (
        <section className="web-shopping-category-section" key={group.category}>
          <h3 className="web-shopping-category-heading">
            {group.category}
            <span>{group.items.length}개</span>
          </h3>
          <div className="web-shopping-item-grid">
            {group.items.map((item) => (
              <ShoppingItemCard
                isReadOnly={isReadOnly}
                isUpdating={updatingItem?.itemId === item.id}
                item={item}
                key={item.id}
                onToggleCheck={onToggleCheck}
                onToggleExclude={onToggleExclude}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PurchaseSelectAllControl({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label="구매할 재료 전체 선택"
      className="shopping-select-all-control"
      disabled={disabled}
      onClick={onClick}
      role="checkbox"
      type="button"
    >
      <span aria-hidden="true">{checked ? "✓" : ""}</span>
      전체 선택
    </button>
  );
}

function StatusToast({
  message,
  tone,
}: {
  message: string;
  tone: "success" | "error" | "empty";
}) {
  return (
    <div
      aria-live="polite"
      className={[
        "web-shopping-toast",
        tone === "error" ? "web-shopping-toast-error" : "",
      ].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function ShoppingItemCard({
  item,
  isReadOnly,
  isUpdating,
  onToggleCheck,
  onToggleExclude,
}: ShoppingItemCardProps) {
  const amountText = item.amounts_json
    .map((a) => `${a.amount}${a.unit}`)
    .join(" + ");

  const showCheckButton = !isReadOnly && !item.is_pantry_excluded;
  const canToggleCheck = showCheckButton && !isUpdating;
  const toggleLabel = item.is_pantry_excluded ? "되살리기" : "이미있음";

  return (
    <article
      className={[
        "web-shopping-item-card",
        item.is_checked ? "web-shopping-item-card-checked" : "",
        item.is_pantry_excluded ? "web-shopping-item-card-excluded" : "",
        canToggleCheck ? "web-shopping-item-card-clickable" : "",
      ].join(" ")}
      onClick={() => {
        if (canToggleCheck) {
          onToggleCheck(item.id, item.is_checked);
        }
      }}
    >
      {showCheckButton ? (
        <button
          aria-checked={item.is_checked}
          aria-label={`${item.display_text} 구매 완료 표시`}
          className="web-shopping-check"
          disabled={isUpdating}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCheck(item.id, item.is_checked);
          }}
          role="checkbox"
          type="button"
        >
          {item.is_checked ? "✓" : ""}
        </button>
      ) : (
        <div
          aria-hidden="true"
          className="web-shopping-check web-shopping-check-static rounded-[var(--radius-badge)]"
          data-testid={`shopping-readonly-status-${item.id}`}
        >
          {item.is_checked || item.is_pantry_excluded ? "✓" : ""}
        </div>
      )}

      <div className="web-shopping-item-copy">
        <strong>{item.display_text.replace(/\s+\d+.*$/, "")}</strong>
        <small>{amountText}</small>
      </div>

      {!isReadOnly ? (
        <button
          aria-label={`${item.display_text} ${toggleLabel}`}
          className="web-shopping-exclude"
          disabled={isUpdating}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExclude(item.id, item.is_pantry_excluded, item.is_checked);
          }}
          type="button"
        >
          {toggleLabel}
        </button>
      ) : null}

      {isReadOnly && item.added_to_pantry ? (
        <span className="web-shopping-added">팬트리 반영 완료</span>
      ) : null}
    </article>
  );
}

function formatAmountText(item: ShoppingListItemSummary): string {
  return item.amounts_json.map((a) => `${a.amount}${a.unit}`).join(" + ");
}

function formatShoppingDisplayTitle(detail: ShoppingListDetail): string {
  const createdDate = new Date(detail.created_at);
  if (Number.isNaN(createdDate.getTime())) {
    return detail.title;
  }

  const month = createdDate.getMonth() + 1;
  const day = createdDate.getDate();
  const koreanDate = `${month}월 ${day}일`;
  const slashDate = `${month}/${day}`;

  if (detail.title.includes(koreanDate) || detail.title.includes(slashDate)) {
    return detail.title;
  }

  return `${koreanDate} · ${detail.title}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}
