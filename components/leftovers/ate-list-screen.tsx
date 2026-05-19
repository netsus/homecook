"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { useAppReturn } from "@/components/shared/use-app-return";
import {
  WebButton,
  WebEmptyState,
  WebErrorState,
  WebPageHeader,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import {
  fetchLeftovers,
  isLeftoverApiError,
  uneatLeftover,
} from "@/lib/api/leftovers";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { LeftoverListItemData } from "@/types/leftover";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";
type FeedbackTone = "error" | "status";

const FEEDBACK_AUTO_DISMISS_MS = 4000;
const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export interface AteListScreenProps {
  initialAuthenticated?: boolean;
}

function formatEatenAt(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatShortDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatLeftoverMeta(item: LeftoverListItemData) {
  const sourceLabel = item.source_meal_label ?? "연결 끼니 없음";
  return `${sourceLabel} · ${item.cooking_servings}인분`;
}

function getFallbackEmoji(title: string) {
  if (title.includes("밥")) return "🍚";
  if (title.includes("찌개")) return "🍲";
  return "🍽️";
}

function AteListCard({
  item,
  isUneating,
  anyMutating,
  onUneat,
}: {
  item: LeftoverListItemData;
  isUneating: boolean;
  anyMutating: boolean;
  onUneat: (id: string) => void;
}) {
  return (
    <article
      className="web-ate-row"
      data-testid="ate-list-card"
    >
      <div className="web-ate-thumb">
        {item.recipe_thumbnail_url ? (
          <Image
            alt=""
            height={54}
            src={item.recipe_thumbnail_url}
            unoptimized
            width={72}
          />
        ) : (
          <div className="web-ate-thumb-placeholder">
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
              <path d="M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
            </svg>
          </div>
        )}
      </div>

      <div className="web-ate-body">
        <p className="web-ate-title">{item.recipe_title}</p>
        <p className="web-ate-meta">
          {item.eaten_at ? `${formatEatenAt(item.eaten_at)} · ` : null}
          {formatLeftoverMeta(item)}
        </p>
      </div>

      <div className="web-ate-actions">
        <WebButton
          data-testid="uneat-button"
          disabled={anyMutating}
          onClick={() => onUneat(item.id)}
          size="sm"
          variant="ghost"
        >
          {isUneating ? "처리 중..." : "되돌리기"}
        </WebButton>
        <Link
          className="web-button web-button-tertiary web-button-sm"
          href={`/recipe/${item.recipe_id}`}
          prefetch={false}
        >
          다시 만들기
        </Link>
      </div>

      <Link
        aria-label={`${item.recipe_title} 레시피 보기`}
        className="web-ate-link"
        href={`/recipe/${item.recipe_id}`}
        prefetch={false}
      >
        <span aria-hidden="true">&gt;</span>
      </Link>
    </article>
  );
}

export function AteListScreen({
  initialAuthenticated = false,
}: AteListScreenProps) {
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/leftovers" });
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [items, setItems] = useState<LeftoverListItemData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uneatingId, setUneatingId] = useState<string | null>(null);

  // Feedback toast
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: FeedbackTone;
  } | null>(null);

  useEffect(() => {
    if (!feedback) return;

    const timer = setTimeout(() => setFeedback(null), FEEDBACK_AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [feedback]);

  // Auth check
  useEffect(() => {
    const e2eOverride = readE2EAuthOverride();

    if (typeof e2eOverride === "boolean") {
      setAuthState(e2eOverride ? "authenticated" : "unauthorized");
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
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (!mounted) return;
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
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // Load eaten items
  const loadAteList = useCallback(async () => {
    setScreenState("loading");
    setErrorMessage(null);

    try {
      const data = await fetchLeftovers("eaten");
      setItems(data.items);
      setScreenState(data.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (isLeftoverApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "다먹은 목록을 불러오지 못했어요.",
      );
      setScreenState("error");
    }
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadAteList();
  }, [authState, loadAteList]);

  // Uneat action
  const handleUneat = useCallback(
    async (leftoverId: string) => {
      if (uneatingId) return;
      setUneatingId(leftoverId);
      setFeedback(null);

      try {
        await uneatLeftover(leftoverId);
        setItems((current) => current.filter((item) => item.id !== leftoverId));
        setFeedback({
          message: "남은요리로 복귀됐어요",
          tone: "status",
        });

        // Check if list is now empty
        setItems((current) => {
          if (current.length === 0) {
            setScreenState("empty");
          }

          return current;
        });
      } catch (error) {
        if (isLeftoverApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }

        setFeedback({
          message:
            error instanceof Error
              ? error.message
              : "남은요리 복귀에 실패했어요.",
          tone: "error",
        });
      } finally {
        setUneatingId(null);
      }
    },
    [uneatingId],
  );
  const ateListSelfHref = buildReturnHref("/leftovers/ate", {
    returnSurface: "mypage.eaten-list",
    returnTo: appReturn.href,
  });
  const leftoversListHref = appReturn.href.startsWith("/leftovers")
    ? appReturn.href
    : buildReturnHref("/leftovers", {
        returnSurface: "leftovers.list",
        returnTo: appReturn.href,
      });

  if (isMobileViewport) {
    if (authState === "checking") {
      return (
        <AteListMobileStateShell
          appReturnHref={appReturn.href}
          leftoversListHref={leftoversListHref}
          testId="ate-list-mobile-auth-loading"
        >
          <div className="space-y-3 p-4" data-testid="ate-list-loading">
            {[1, 2].map((index) => (
              <div
                className="h-[76px] rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white"
                key={index}
              />
            ))}
          </div>
        </AteListMobileStateShell>
      );
    }

    if (authState === "unauthorized") {
      return (
        <AteListMobileStateShell
          appReturnHref={appReturn.href}
          leftoversListHref={leftoversListHref}
          testId="ate-list-mobile-auth-gate"
        >
          <div className="p-4">
            <ContentState
              description="다먹은 목록을 확인하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
              eyebrow="로그인 필요"
              safeBottomPadding
              tone="gate"
              title="이 화면은 로그인이 필요해요"
            >
              <div className="space-y-3">
                <SocialLoginButtons nextPath={ateListSelfHref} />
                <Link
                  className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[#DEE2E6] bg-white px-5 py-3 text-sm font-semibold text-[#495057]"
                  href={appReturn.href}
                >
                  이전 화면으로 돌아가기
                </Link>
              </div>
            </ContentState>
          </div>
        </AteListMobileStateShell>
      );
    }

    return (
      <AteListMobileView
        appReturnHref={appReturn.href}
        errorMessage={errorMessage}
        feedback={feedback}
        items={items}
        leftoversListHref={leftoversListHref}
        onRetry={loadAteList}
        onUneat={handleUneat}
        screenState={screenState}
        uneatingId={uneatingId}
      />
    );
  }

  return (
    <WebShell className="web-leftovers-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={<div className="web-profile-button">JY</div>}
      />
      <div className="web-leftovers-screen" data-testid="ate-list-screen">
        <nav aria-label="다먹은 목록 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href="/mypage">
            &lt; 마이페이지
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">다먹은 목록</span>
        </nav>

        <WebPageHeader
          actions={
            <Link className="web-button web-button-tertiary" href={leftoversListHref}>
              남은 요리
            </Link>
          }
          description="요리모드를 완료했거나 '다 먹었어요'를 누른 끼니가 기록됩니다."
          title="다먹은 목록"
        />

      {authState === "checking" ? (
        <WebEmptyState
          description="다먹은 목록에 접근하기 위해 로그인 상태를 확인하고 있어요."
          icon={<span aria-hidden="true">...</span>}
          title="로그인 상태를 확인하고 있어요"
        />
      ) : null}

      {authState === "unauthorized" ? (
        <WebEmptyState
          action={
            <div className="web-leftover-login-actions">
              <SocialLoginButtons nextPath={ateListSelfHref} />
              <Link className="web-button web-button-tertiary" href={appReturn.href}>
                이전 화면으로 돌아가기
              </Link>
            </div>
          }
          description="다먹은 목록을 확인하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
          icon={<span aria-hidden="true">!</span>}
          title="이 화면은 로그인이 필요해요"
        />
      ) : null}

      {authState === "authenticated" && feedback ? (
        <div
          className={[
            "web-leftover-feedback",
            feedback.tone === "error"
              ? "web-leftover-feedback-error"
              : "web-leftover-feedback-status",
          ].join(" ")}
          data-testid="feedback-toast"
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}

      {authState === "authenticated" && screenState === "loading" ? (
        <div className="web-ate-list" data-testid="ate-list-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <WebSkeleton
              key={i}
              height={88}
            />
          ))}
        </div>
      ) : null}

      {authState === "authenticated" && screenState === "error" ? (
        <WebErrorState
          action={
            <WebButton
              onClick={() => {
                void loadAteList();
              }}
              variant="secondary"
            >
              다시 시도
            </WebButton>
          }
          description={errorMessage ?? "잠시 후 다시 시도해주세요."}
          icon={<span aria-hidden="true">!</span>}
          title="다먹은 목록을 불러오지 못했어요"
        />
      ) : null}

      {authState === "authenticated" && screenState === "empty" ? (
        <WebEmptyState
          action={
            <Link className="web-button web-button-tertiary" href={leftoversListHref}>
              남은요리로 돌아가기
            </Link>
          }
          description="요리를 완료하거나 남은 요리에서 '다 먹었어요'를 누르면 여기에 기록됩니다."
          icon={<span aria-hidden="true">✓</span>}
          title="아직 다먹은 요리가 없어요"
        />
      ) : null}

      {authState === "authenticated" && screenState === "ready" ? (
        <div
          className="web-ate-list"
          data-testid="ate-item-list"
        >
          {items.map((item) => (
            <AteListCard
              key={item.id}
              anyMutating={uneatingId !== null}
              isUneating={uneatingId === item.id}
              item={item}
              onUneat={handleUneat}
            />
          ))}
        </div>
      ) : null}
      </div>
    </WebShell>
  );
}

function AteListMobileView({
  appReturnHref,
  errorMessage,
  feedback,
  items,
  leftoversListHref,
  onRetry,
  onUneat,
  screenState,
  uneatingId,
}: {
  appReturnHref: string;
  errorMessage: string | null;
  feedback: { message: string; tone: FeedbackTone } | null;
  items: LeftoverListItemData[];
  leftoversListHref: string;
  onRetry: () => void;
  onUneat: (id: string) => void;
  screenState: ScreenState;
  uneatingId: string | null;
}) {
  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      data-testid="ate-list-screen"
    >
      <MobileAppBar
        actionHref={leftoversListHref}
        actionLabel="남은 요리"
        backHref={appReturnHref}
        title="다먹은 요리"
      />

      {feedback ? <MobileFeedback feedback={feedback} /> : null}

      {screenState === "loading" ? (
        <div className="space-y-3 p-4" data-testid="ate-list-loading">
          {[1, 2].map((index) => (
            <div
              className="h-[76px] rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {screenState === "error" ? (
        <div className="p-4">
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            onAction={() => {
              void onRetry();
            }}
            title="다먹은 목록을 불러오지 못했어요"
            tone="error"
          />
        </div>
      ) : null}

      {screenState === "empty" ? (
        <div className="p-4">
          <ContentState
            actionLabel="남은요리로 돌아가기"
            description="먹은 기록이 여기에 모여요"
            onAction={() => {
              window.location.href = leftoversListHref;
            }}
            title="다먹은 기록이 없어요"
            tone="empty"
          />
        </div>
      ) : null}

      {screenState === "ready" ? (
        <div className="space-y-[10px] p-4" data-testid="ate-item-list">
          {items.map((item) => (
            <MobileAteCard
              anyMutating={uneatingId !== null}
              isUneating={uneatingId === item.id}
              item={item}
              key={item.id}
              onUneat={onUneat}
            />
          ))}
        </div>
      ) : null}

      <Wave1MobileBottomTab ariaLabel="다먹은 요리 하단 탭" currentTab="mypage" />
    </div>
  );
}

function AteListMobileStateShell({
  appReturnHref,
  children,
  leftoversListHref,
  testId,
}: {
  appReturnHref: string;
  children: React.ReactNode;
  leftoversListHref: string;
  testId: string;
}) {
  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      data-testid={testId}
    >
      <MobileAppBar
        actionHref={leftoversListHref}
        actionLabel="남은 요리"
        backHref={appReturnHref}
        title="다먹은 요리"
      />
      {children}
      <Wave1MobileBottomTab ariaLabel="다먹은 요리 하단 탭" currentTab="mypage" />
    </div>
  );
}

function MobileAteCard({
  anyMutating,
  isUneating,
  item,
  onUneat,
}: {
  anyMutating: boolean;
  isUneating: boolean;
  item: LeftoverListItemData;
  onUneat: (id: string) => void;
}) {
  return (
    <article
      className="rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-3"
      data-testid="ate-list-card"
    >
      <div className="flex items-center gap-3">
        <MobileDishThumb
          emoji={getFallbackEmoji(item.recipe_title)}
          src={item.recipe_thumbnail_url}
        />
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[14px] font-extrabold leading-[1.25] text-[#212529]">
            {item.recipe_title}
          </p>
          <p className="mt-0.5 text-[12px] font-medium leading-[1.25] text-[#868E96]">
            {formatShortDate(item.cooked_at)} 요리 · {formatLeftoverMeta(item)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="남은요리로 복귀"
            className="h-9 w-[96px] whitespace-nowrap rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white px-2 text-[11px] font-bold text-[#495057] disabled:opacity-60"
            data-testid="uneat-button"
            disabled={anyMutating}
            onClick={() => onUneat(item.id)}
            type="button"
          >
            {isUneating ? "처리 중..." : "남은 요리로"}
          </button>
        </div>
      </div>
    </article>
  );
}

function MobileDishThumb({
  emoji,
  src,
}: {
  emoji: string;
  src: string | null;
}) {
  if (src) {
    return (
      <Image
        alt=""
        className="h-14 w-14 shrink-0 rounded-[var(--radius-control)] object-cover"
        height={56}
        src={src}
        unoptimized
        width={56}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[#FFD8D8] text-[24px]">
      <span aria-hidden="true">{emoji}</span>
    </div>
  );
}

function MobileFeedback({
  feedback,
}: {
  feedback: { message: string; tone: FeedbackTone };
}) {
  return (
    <div
      className={[
        "mx-4 mt-2 rounded-[var(--radius-control)] px-4 py-3 text-center text-[13px] font-extrabold",
        feedback.tone === "error"
          ? "bg-[#FFF5F5] text-[#FF6B6B]"
          : "bg-[#E6FCF5] text-[#099268]",
      ].join(" ")}
      data-testid="feedback-toast"
      role="alert"
    >
      {feedback.message}
    </div>
  );
}

function MobileAppBar({
  actionHref,
  actionLabel,
  backHref,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  backHref: string;
  title: string;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <Link
        aria-label="뒤로가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start text-[#212529]"
        href={backHref}
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.3"
          viewBox="0 0 24 24"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[#212529]">
        {title}
      </h1>
      <Link
        className="absolute right-4 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#DEE2E6] bg-white px-3 text-[12px] font-extrabold text-[var(--brand)]"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
