"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { fetchUserGamificationArchive } from "@/lib/api/user-gamification";
import type { UserGamificationNotificationData } from "@/types/user-gamification";

type ArchiveState = "loading" | "ready" | "empty" | "error";

interface GrowthArchiveSurfaceProps {
  className?: string;
  /** Avoid archive API calls before the user is authenticated. */
  enabled?: boolean;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

function formatTimestamp(value: string) {
  // Keep display deterministic by avoiding locale/timezone formatting.
  return value.slice(0, 10);
}

function toneLabel(type: UserGamificationNotificationData["notification_type"]) {
  if (type === "level_up") return "레벨업";
  if (type === "badge_unlocked") return "배지";
  if (type === "quest_completed") return "퀘스트";
  return "경험치";
}

export function GrowthArchiveSurface({
  className,
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: GrowthArchiveSurfaceProps) {
  const [items, setItems] = useState<UserGamificationNotificationData[]>([]);
  const [state, setState] = useState<ArchiveState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (nextCursor: string | null) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setState("loading");
      }

      try {
        const data = await fetchUserGamificationArchive({
          limit: pageSize,
          cursor: nextCursor,
        });

        const visibleItems = data.items.filter(
          (item) => item.delivery_channel !== "silent",
        );

        setItems((current) =>
          nextCursor ? [...current, ...visibleItems] : visibleItems,
        );
        setCursor(data.next_cursor);
        setHasNext(data.has_next);
        setState(() => {
          const total = nextCursor
            ? items.length + visibleItems.length
            : visibleItems.length;
          return total === 0 ? "empty" : "ready";
        });
      } catch {
        // Archive failures must not break MYPAGE core/progress surfaces.
        if (!nextCursor) {
          setState("error");
        }
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    },
    [items.length, pageSize],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void loadPage(null);
    // Load the first page once; follow-up pages are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <section
      aria-label="최근 성장 기록"
      className={[
        "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
        className ?? "",
      ].join(" ")}
      data-testid="growth-archive-surface"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          최근 성장 기록
        </p>
      </div>

      {state === "loading" ? (
        <div
          className="mt-3 grid gap-2"
          data-testid="growth-archive-loading"
        >
          {[0, 1, 2].map((index) => (
            <div
              className="h-12 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {state === "error" ? (
        <p
          className="mt-3 text-[12px] font-semibold leading-[1.4] text-[var(--text-3)]"
          data-testid="growth-archive-error"
        >
          성장 기록을 잠시 불러오지 못했어요. 마이페이지는 그대로 사용할 수 있어요.
        </p>
      ) : null}

      {state === "empty" ? (
        <p
          className="mt-3 text-[12px] font-semibold leading-[1.4] text-[var(--text-2)]"
          data-testid="growth-archive-empty"
        >
          아직 성장 기록이 없어요. 첫 저장, 첫 장보기, 첫 요리로 시작해 보세요.
        </p>
      ) : null}

      {state === "ready" ? (
        <>
          <ul className="mt-3 grid gap-2" data-testid="growth-archive-list">
            {items.map((item) => (
              <li
                className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-3 py-2"
                data-testid="growth-archive-item"
                key={item.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--text-2)]">
                    {toneLabel(item.notification_type)}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-[var(--text-3)]">
                    {formatTimestamp(item.created_at)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                  {item.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-semibold leading-[1.3] text-[var(--text-2)]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          {hasNext ? (
            <button
              className="mt-3 w-full rounded-[var(--radius-control)] bg-[var(--surface-fill)] py-2 text-[12px] font-extrabold text-[var(--text-2)] disabled:opacity-60"
              data-testid="growth-archive-load-more"
              disabled={loadingMore}
              onClick={() => void loadPage(cursor)}
              type="button"
            >
              {loadingMore ? "불러오는 중…" : "더 보기"}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
