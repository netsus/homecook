"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  enqueueYoutubeExtraction,
  fetchYoutubeExtractionJob,
  fetchYoutubeExtractionNotifications,
  markYoutubeExtractionDelivered,
  markYoutubeExtractionSeen,
} from "@/lib/api/youtube-extraction-jobs";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useYoutubeExtractionStore } from "@/stores/youtube-extraction-store";
import type {
  YoutubeExtractionNotificationItem,
  YoutubeExtractionNotificationView,
} from "@/types/youtube-extraction";

interface YoutubeExtractionNotificationCenterProps {
  initialAuthenticated?: boolean;
  resolveAuthenticatedOnClient?: boolean;
}

function BellIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg aria-hidden="true" fill={filled ? "currentColor" : "none"} height="22" viewBox="0 0 24 24" width="22">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function statusCopy(item: YoutubeExtractionNotificationItem) {
  if (item.status === "succeeded") {
    return {
      body: "추출 결과를 확인하고 레시피로 등록할 수 있어요.",
      title: "YouTube 레시피 추출이 완료됐어요",
    };
  }
  return {
    body: item.error?.message ?? "레시피를 추출하지 못했어요.",
    title: "YouTube 레시피 추출에 실패했어요",
  };
}

function itemTitle(item: YoutubeExtractionNotificationItem) {
  return item.video_title_snapshot?.trim() || "YouTube 레시피";
}

function retryLabel(item: YoutubeExtractionNotificationItem) {
  if (item.error?.code === "QUOTA_EXCEEDED") return "나중에 다시 시도";
  if (item.error?.code === "EXTRACTION_EXPIRED") return "다시 추출";
  return "다시 시도";
}

export function YoutubeExtractionNotificationTrigger({
  placement = "header",
}: {
  placement?: "global" | "header";
} = {}) {
  const authenticated = useYoutubeExtractionStore((state) => state.authenticated);
  const items = useYoutubeExtractionStore((state) => state.items);
  const setOpen = useYoutubeExtractionStore((state) => state.setOpen);
  const unseenCount = items.filter((item) => item.seen_at === null).length;
  const label = unseenCount > 0
    ? `YouTube 추출 알림 ${unseenCount}개`
    : "YouTube 추출 알림 없음";

  if (!authenticated) return null;

  return (
    <button
      aria-label={label}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--foreground)] transition-colors hover:bg-[var(--surface-fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] motion-reduce:transition-none"
      onClick={() => setOpen(true)}
      data-youtube-extraction-trigger={placement}
      type="button"
    >
      <BellIcon filled={unseenCount > 0} />
      {unseenCount > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold leading-none text-white">
          {unseenCount > 99 ? "99+" : unseenCount}
        </span>
      ) : null}
    </button>
  );
}

function NotificationRow({
  item,
  onRetry,
}: {
  item: YoutubeExtractionNotificationItem;
  onRetry: (item: YoutubeExtractionNotificationItem) => void;
}) {
  const copy = statusCopy(item);
  const destination = item.result?.review_path ?? item.result?.recipe_path;
  return (
    <article className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 border-b border-[var(--wave1-border)] py-4 last:border-0" data-youtube-job-id={item.job_id}>
      <div className="relative h-14 w-14 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-fill)]">
        <Image alt="" fill sizes="56px" src={item.thumbnail_url} unoptimized />
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className={item.status === "succeeded" ? "text-[var(--success)]" : "text-[var(--danger)]"}>
            {item.status === "succeeded" ? "✓" : "!"}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-bold text-[var(--foreground)]">{itemTitle(item)}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{copy.body}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {destination ? (
            <Link className="inline-flex min-h-11 items-center rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white" href={destination}>
              {item.result?.review_path ? "결과 확인" : "레시피 보기"}
            </Link>
          ) : null}
          {item.can_retry ? (
            <button className="min-h-11 rounded-full border border-[var(--wave1-border)] px-4 text-sm font-bold" onClick={() => onRetry(item)} type="button">
              {retryLabel(item)}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function YoutubeExtractionNotificationCenter({
  initialAuthenticated = true,
  resolveAuthenticatedOnClient = false,
}: YoutubeExtractionNotificationCenterProps = {}) {
  const items = useYoutubeExtractionStore((state) => state.items);
  const open = useYoutubeExtractionStore((state) => state.open);
  const view = useYoutubeExtractionStore((state) => state.view);
  const setAuthenticated = useYoutubeExtractionStore((state) => state.setAuthenticated);
  const setItems = useYoutubeExtractionStore((state) => state.setItems);
  const setOpen = useYoutubeExtractionStore((state) => state.setOpen);
  const setView = useYoutubeExtractionStore((state) => state.setView);
  const markSeenInStore = useYoutubeExtractionStore((state) => state.markSeen);
  const [authenticated, setAuthenticatedLocal] = useState(initialAuthenticated);
  const [authExpired, setAuthExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hiddenToastIds, setHiddenToastIds] = useState<string[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [hasHeaderTrigger, setHasHeaderTrigger] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerBeforeOpenRef = useRef<HTMLElement | null>(null);
  const deliveredRef = useRef(new Set<string>());

  useEffect(() => setAuthenticatedLocal(initialAuthenticated), [initialAuthenticated]);

  useEffect(() => {
    if (!resolveAuthenticatedOnClient) return;
    const override = readE2EAuthOverride();
    if (typeof override === "boolean") {
      setAuthenticatedLocal(override);
      if (override) setAuthExpired(false);
      return;
    }
    if (!hasSupabasePublicEnv()) {
      setAuthenticatedLocal(false);
      return;
    }
    let current = true;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (current) {
        setAuthenticatedLocal(Boolean(data.session));
        if (data.session) setAuthExpired(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthenticatedLocal(Boolean(session));
        if (session) setAuthExpired(false);
      },
    );
    return () => {
      current = false;
      subscription.unsubscribe();
    };
  }, [resolveAuthenticatedOnClient]);

  useEffect(() => setAuthenticated(authenticated), [authenticated, setAuthenticated]);

  useEffect(() => {
    const update = () => setHasHeaderTrigger(Boolean(
      document.querySelector("[data-youtube-extraction-trigger='header']"),
    ));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(async (nextView: YoutubeExtractionNotificationView) => {
    if (!authenticated) return;
    setLoading(true);
    setLoadError(null);
    const result = await fetchYoutubeExtractionNotifications(nextView);
    setLoading(false);
    if (!result.success || !result.data) {
      if (result.error?.code === "UNAUTHORIZED") {
        setAuthExpired(true);
        setAuthenticatedLocal(false);
        setItems([]);
        return;
      }
      setLoadError(result.error?.message ?? "알림을 불러오지 못했어요.");
      return;
    }
    setItems(result.data.items);
  }, [authenticated, setItems]);

  useEffect(() => {
    void refresh("unseen-completed");
  }, [authenticated, refresh]);

  useEffect(() => {
    if (!authenticated) return;
    let current = true;
    let timer: number | null = null;

    const readPendingIds = () => {
      try {
        const value = JSON.parse(window.sessionStorage.getItem("homecook.youtube-extraction-jobs") ?? "[]") as unknown;
        return Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [];
      } catch {
        return [];
      }
    };

    const pollPending = async () => {
      const ids = readPendingIds();
      if (ids.length === 0 || !current) return;
      const results = await Promise.all(ids.map(async (jobId) => ({
        jobId,
        result: await fetchYoutubeExtractionJob(jobId),
      })));
      if (!current) return;
      const activeIds = results
        .filter(({ result }) => result.success && result.data
          && (result.data.status === "queued" || result.data.status === "processing"))
        .map(({ jobId }) => jobId);
      const hasTerminal = results.some(({ result }) => result.success && result.data
        && !activeIds.includes(result.data.job_id));
      window.sessionStorage.setItem(
        "homecook.youtube-extraction-jobs",
        JSON.stringify(activeIds),
      );
      if (hasTerminal) await refresh("unseen-completed");
      if (activeIds.length > 0 && current) {
        timer = window.setTimeout(pollPending, 5000);
      }
    };

    void pollPending();
    return () => {
      current = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [authenticated, refresh]);

  useEffect(() => {
    const keys = items
      .filter((item) => item.seen_at === null
        && !hiddenToastIds.includes(item.job_id)
        && item.delivered_at === null
        && !deliveredRef.current.has(item.delivery_key))
      .slice(0, 1)
      .map((item) => item.delivery_key);
    if (keys.length === 0) return;
    keys.forEach((key) => deliveredRef.current.add(key));
    void markYoutubeExtractionDelivered(keys);
  }, [hiddenToastIds, items]);

  useEffect(() => {
    if (!open) return;
    triggerBeforeOpenRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const unseenIds = items.filter((item) => item.seen_at === null).map((item) => item.job_id);
    if (unseenIds.length === 0 || !listRef.current) return;

    const expose = (jobIds: string[]) => {
      if (jobIds.length === 0) return;
      markSeenInStore(jobIds);
      void markYoutubeExtractionSeen(jobIds);
    };
    if (typeof IntersectionObserver === "undefined") {
      expose(unseenIds);
      return;
    }
    const unseen = new Set(unseenIds);
    const observer = new IntersectionObserver((entries) => {
      const exposed = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => (entry.target as HTMLElement).dataset.youtubeJobId ?? "")
        .filter((jobId) => unseen.has(jobId));
      expose(exposed);
      exposed.forEach((jobId) => unseen.delete(jobId));
    }, { root: listRef.current, threshold: 0.35 });
    listRef.current.querySelectorAll<HTMLElement>("[data-youtube-job-id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items, markSeenInStore, open]);

  useEffect(() => {
    if (!open) triggerBeforeOpenRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void refresh(view);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("online", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("online", refreshOnFocus);
    };
  }, [refresh, view]);

  const visibleToasts = useMemo(
    () => items
      .filter((item) => item.seen_at === null && !hiddenToastIds.includes(item.job_id))
      .slice(0, 1),
    [hiddenToastIds, items],
  );

  useEffect(() => {
    const toast = visibleToasts.at(0);
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setHiddenToastIds((current) => current.includes(toast.job_id)
        ? current
        : [...current, toast.job_id]);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [visibleToasts]);

  const handleView = useCallback((nextView: YoutubeExtractionNotificationView) => {
    setView(nextView);
    void refresh(nextView);
  }, [refresh, setView]);

  const handleRetry = useCallback(async (item: YoutubeExtractionNotificationItem) => {
    if (!item.can_retry || retryingId) return;
    setRetryingId(item.job_id);
    const result = await enqueueYoutubeExtraction({ retry_job_id: item.job_id });
    setRetryingId(null);
    if (result.success) {
      setOpen(false);
      setView("unseen-completed");
      void refresh("unseen-completed");
    } else {
      setLoadError(result.error?.message ?? "다시 시도하지 못했어요.");
    }
  }, [refresh, retryingId, setOpen, setView]);

  const handleToastSeen = useCallback((item: YoutubeExtractionNotificationItem) => {
    markSeenInStore([item.job_id]);
    void markYoutubeExtractionSeen([item.job_id]);
  }, [markSeenInStore]);

  if (authExpired) {
    const returnPath = typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}`;
    return (
      <div aria-live="polite" className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+72px)] z-50 mx-auto max-w-sm rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-floating)]">
        <p className="font-bold text-[var(--foreground)]">로그인이 필요해요</p>
        <p className="mt-1 text-sm text-[var(--muted)]">로그인하면 추출 작업을 이어서 확인할 수 있어요.</p>
        <Link className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white" href={`/login?next=${encodeURIComponent(returnPath)}`}>
          로그인하고 돌아오기
        </Link>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <>
      {!hasHeaderTrigger ? (
        <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+68px)] z-[55] rounded-full bg-[var(--surface)] shadow-sm">
          <YoutubeExtractionNotificationTrigger placement="global" />
        </div>
      ) : null}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+124px)] z-50 mx-auto flex max-w-sm flex-col gap-2 sm:left-auto sm:right-5 sm:mx-0 sm:w-[360px]">
        {visibleToasts.map((item) => {
          const copy = statusCopy(item);
          const destination = item.result?.review_path ?? item.result?.recipe_path;
          return (
            <article aria-atomic="true" className="pointer-events-auto rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-floating)]" key={item.job_id}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={item.status === "succeeded" ? "text-[var(--success)]" : "text-[var(--danger)]"}>{item.status === "succeeded" ? "✓" : "!"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--foreground)]">{copy.title}</p>
                  <p className="mt-1 break-words text-sm text-[var(--muted)]">{itemTitle(item)}</p>
                </div>
                <button aria-label="toast 닫기" className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-[var(--muted)]" onClick={() => setHiddenToastIds((current) => [...current, item.job_id])} type="button">×</button>
              </div>
              {destination ? (
                <Link className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--brand-soft)] px-4 text-sm font-bold text-[var(--brand-deep)]" href={destination} onClick={() => handleToastSeen(item)}>
                  {item.result?.review_path ? "결과 확인" : "레시피 보기"}
                </Link>
              ) : item.can_retry ? (
                <button className="mt-3 min-h-11 rounded-full border border-[var(--wave1-border)] px-4 text-sm font-bold" onClick={() => {
                  handleToastSeen(item);
                  void handleRetry(item);
                }} type="button">
                  {retryLabel(item)}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/35 p-0 sm:items-stretch sm:justify-end" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <section aria-labelledby="youtube-extraction-notifications-title" aria-modal="true" className="flex max-h-[min(82dvh,720px)] w-full flex-col overflow-hidden rounded-t-[24px] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:h-full sm:max-h-none sm:max-w-[420px] sm:rounded-none" ref={dialogRef} role="dialog">
            <div className="flex items-center justify-between border-b border-[var(--wave1-border)] px-4 py-3">
              <h2 className="text-lg font-bold" id="youtube-extraction-notifications-title">YouTube 추출 알림</h2>
              <button aria-label="알림 닫기" className="min-h-11 min-w-11 rounded-full text-xl" onClick={() => setOpen(false)} ref={closeButtonRef} type="button">×</button>
            </div>
            <div aria-label="알림 보기" className="grid grid-cols-2 gap-1 border-b border-[var(--wave1-border)] p-2" role="tablist">
              <button aria-selected={view === "unseen-completed"} className="min-h-11 rounded-full px-3 text-sm font-bold aria-selected:bg-[var(--brand-soft)] aria-selected:text-[var(--brand-deep)]" onClick={() => handleView("unseen-completed")} role="tab" type="button">새 알림</button>
              <button aria-selected={view === "archive"} className="min-h-11 rounded-full px-3 text-sm font-bold aria-selected:bg-[var(--brand-soft)] aria-selected:text-[var(--brand-deep)]" onClick={() => handleView("archive")} role="tab" type="button">지난 알림</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" ref={listRef}>
              {loading ? <p aria-live="polite" className="py-8 text-center text-sm text-[var(--muted)]">알림을 불러오는 중이에요…</p> : null}
              {loadError ? <div className="py-8 text-center"><p role="status">{loadError}</p><button className="mt-3 min-h-11 rounded-full border px-4 font-bold" onClick={() => refresh(view)} type="button">다시 불러오기</button></div> : null}
              {!loading && !loadError && items.length === 0 ? <p className="py-12 text-center text-sm text-[var(--muted)]">표시할 알림이 없어요.</p> : null}
              {!loading && !loadError ? items.map((item) => <NotificationRow item={item} key={item.job_id} onRetry={handleRetry} />) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
