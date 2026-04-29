"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchLeftovers,
  isLeftoverApiError,
  uneatLeftover,
} from "@/lib/api/leftovers";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { LeftoverListItemData } from "@/types/leftover";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";
type FeedbackTone = "error" | "status";

const FEEDBACK_AUTO_DISMISS_MS = 4000;

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
      className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
      data-testid="ate-list-card"
    >
      <div className="flex items-center gap-3">
        {item.recipe_thumbnail_url ? (
          <img
            alt=""
            className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] object-cover"
            src={item.recipe_thumbnail_url}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-fill)]">
            <span className="text-xl" aria-hidden="true">
              🍽️
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-[var(--foreground)]">
            {item.recipe_title}
          </p>
          {item.eaten_at ? (
            <p className="text-sm text-[var(--text-3)]">
              {formatEatenAt(item.eaten_at)} 다먹음
            </p>
          ) : null}
        </div>

        <button
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--brand-deep)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand-deep)] active:bg-[var(--brand-soft)] disabled:opacity-60"
          data-testid="uneat-button"
          disabled={anyMutating}
          onClick={() => onUneat(item.id)}
          style={{ minHeight: 44 }}
          type="button"
        >
          {isUneating ? "처리 중..." : "덜먹음"}
        </button>
      </div>
    </article>
  );
}

export function AteListScreen({
  initialAuthenticated = false,
}: AteListScreenProps) {
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
              : "덜먹음 처리에 실패했어요.",
          tone: "error",
        });
      } finally {
        setUneatingId(null);
      }
    },
    [uneatingId],
  );

  // Auth checking state
  if (authState === "checking") {
    return (
      <ContentState
        description="다먹은 목록에 접근하기 위해 로그인 상태를 확인하고 있어요."
        eyebrow="세션 확인"
        tone="loading"
        title="로그인 상태를 확인하고 있어요"
      />
    );
  }

  // Unauthorized state
  if (authState === "unauthorized") {
    return (
      <ContentState
        description="다먹은 목록을 확인하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
        eyebrow="로그인 필요"
        safeBottomPadding
        tone="gate"
        title="이 화면은 로그인이 필요해요"
      >
        <div className="space-y-3">
          <SocialLoginButtons nextPath="/leftovers/ate" />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/leftovers"
          >
            남은요리로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="ate-list-screen">
      {/* AppBar */}
      <div className="flex items-center gap-3">
        <Link
          aria-label="뒤로가기"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--foreground)]"
          href="/leftovers"
        >
          <svg fill="none" height="20" viewBox="0 0 12 20" width="12">
            <path
              d="M10 2L2 10l8 8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold text-[var(--foreground)]">
          다먹은 목록
        </h1>
      </div>

      {/* Feedback toast */}
      {feedback ? (
        <div
          className={[
            "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-deep)]"
              : "border-[var(--olive)] bg-[color:rgba(46,166,122,0.1)] text-[var(--olive)]",
          ].join(" ")}
          data-testid="feedback-toast"
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}

      {/* Loading */}
      {screenState === "loading" ? (
        <div className="flex flex-col gap-3" data-testid="ate-list-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="border border-[var(--line)]"
              height={88}
              rounded="lg"
            />
          ))}
        </div>
      ) : null}

      {/* Error */}
      {screenState === "error" ? (
        <ContentState
          actionLabel="다시 시도"
          description={errorMessage ?? "잠시 후 다시 시도해주세요."}
          onAction={() => {
            void loadAteList();
          }}
          title="다먹은 목록을 불러오지 못했어요"
          tone="error"
        />
      ) : null}

      {/* Empty */}
      {screenState === "empty" ? (
        <ContentState
          actionLabel="남은요리로 돌아가기"
          description="남은요리에서 다먹음 처리하면 여기에 기록돼요"
          onAction={() => {
            window.location.href = "/leftovers";
          }}
          title="다먹은 기록이 없어요"
          tone="empty"
        />
      ) : null}

      {/* Ready: ate list */}
      {screenState === "ready" ? (
        <div className="flex flex-col gap-3" data-testid="ate-item-list">
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
  );
}
