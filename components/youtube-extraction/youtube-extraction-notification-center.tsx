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
import {
  forgetYoutubeExtractionRegistrationAck,
  readPendingYoutubeExtractionRegistrationAcks,
  trackYoutubeExtractionJob,
  YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT,
  YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY,
  YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT,
} from "@/lib/youtube-extraction-client-state";
import type {
  YoutubeExtractionJobData,
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
    const consumed = Boolean(item.result?.recipe_path);
    return {
      body: consumed
        ? "이미 등록한 레시피예요"
        : "추출 결과를 확인하고 레시피로 등록할 수 있어요.",
      title: consumed ? "이미 등록한 레시피예요" : "레시피 추출이 끝났어요",
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

function formatCompletedAt(completedAt: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(completedAt));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = Number(values.hour);
  const displayHour = hour % 12 || 12;

  return `${values.year}년 ${values.month}월 ${values.day}일 ${hour < 12 ? "오전" : "오후"} ${displayHour}:${values.minute}`;
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
      className="relative inline-flex h-[44px] min-h-[44px] w-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--foreground)] transition-colors hover:bg-[var(--surface-fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] motion-reduce:transition-none"
      onClick={() => setOpen(true)}
      data-youtube-extraction-trigger={placement}
      type="button"
    >
      <BellIcon filled={unseenCount > 0} />
      {unseenCount > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger-strong)] px-1 text-[10px] font-bold leading-none text-[var(--text-inverse)]">
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
    <article aria-label={itemTitle(item)} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 border-b border-[var(--wave1-border)] py-3 last:border-0 sm:grid-cols-[56px_minmax(0,1fr)] sm:py-4" data-youtube-job-id={item.job_id}>
      <div className="relative h-12 w-12 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-fill)] sm:h-14 sm:w-14">
        <Image alt="" fill sizes="(max-width: 639px) 48px, 56px" src={item.thumbnail_url} unoptimized />
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className={item.status === "succeeded" ? "text-[var(--success)]" : "text-[var(--danger)]"}>
            {item.status === "succeeded" ? "✓" : "!"}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-bold text-[var(--foreground)]">{itemTitle(item)}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{copy.body}</p>
            {item.completed_at ? (
              <time
                aria-label={`완료 시각 ${formatCompletedAt(item.completed_at)}`}
                className="mt-1 block text-xs text-[var(--muted)]"
                dateTime={item.completed_at}
              >
                {formatCompletedAt(item.completed_at)}
              </time>
            ) : null}
          </div>
        </div>
      </div>
      {destination || item.can_retry ? (
        <div className="col-span-2 flex min-w-0 flex-wrap gap-2 sm:col-start-2 sm:col-end-3">
          {destination ? (
            <Link className="inline-flex min-h-11 w-full min-w-0 items-center justify-center whitespace-normal break-keep rounded-full bg-[var(--brand-primary)] px-4 py-2 text-center text-sm font-bold leading-5 text-[var(--foreground)] sm:w-auto" href={destination}>
              {item.result?.review_path ? "결과 확인" : "레시피 보기"}
            </Link>
          ) : null}
          {item.can_retry ? (
            <button className="min-h-11 w-full min-w-0 whitespace-normal break-keep rounded-full border border-[var(--wave1-border)] px-4 py-2 text-sm font-bold leading-5 sm:w-auto" onClick={() => onRetry(item)} type="button">
              {retryLabel(item)}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ActiveJobRow({ job }: { job: YoutubeExtractionJobData }) {
  const processing = job.status === "processing";
  return (
    <article className="border-b border-[var(--wave1-border)] py-4" data-youtube-active-job-id={job.job_id}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-[var(--brand-deep)]">↻</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            {processing ? "레시피 추출 중" : "추출 대기 중"}
          </h3>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            이 화면을 닫아도 작업은 계속돼요.
          </p>
        </div>
      </div>
    </article>
  );
}

function appendUniqueItems(
  current: YoutubeExtractionNotificationItem[],
  incoming: YoutubeExtractionNotificationItem[],
) {
  const byId = new Map(current.map((item) => [item.job_id, item]));
  incoming.forEach((item) => byId.set(item.job_id, item));
  return [...byId.values()];
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
  const [seenMutationError, setSeenMutationError] = useState(false);
  const [hiddenToastIds, setHiddenToastIds] = useState<string[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [hasHeaderTrigger, setHasHeaderTrigger] = useState(false);
  const [activeJobs, setActiveJobs] = useState<YoutubeExtractionJobData[]>([]);
  const [unseenNextCursor, setUnseenNextCursor] = useState<string | null>(null);
  const [archiveItems, setArchiveItems] = useState<YoutubeExtractionNotificationItem[]>([]);
  const [archiveNextCursor, setArchiveNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [registrationAckIds, setRegistrationAckIds] = useState<string[]>(
    () => readPendingYoutubeExtractionRegistrationAcks(),
  );
  const [registrationAckRevision, setRegistrationAckRevision] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerBeforeOpenRef = useRef<HTMLElement | null>(null);
  const deliveredRef = useRef(new Set<string>());
  const registrationAckInFlightRef = useRef(new Set<string>());
  const registrationAckRetryRef = useRef(new Set<string>());
  const unseenTabRef = useRef<HTMLButtonElement>(null);
  const archiveTabRef = useRef<HTMLButtonElement>(null);
  const displayedItems = view === "archive" ? archiveItems : items;
  const displayedNextCursor = view === "archive" ? archiveNextCursor : unseenNextCursor;

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

  const refresh = useCallback(async (
    nextView: YoutubeExtractionNotificationView,
    options: { background?: boolean } = {},
  ) => {
    if (!authenticated) return;
    if (!options.background) {
      setLoading(true);
      setLoadError(null);
    }
    const result = await fetchYoutubeExtractionNotifications(nextView);
    if (!options.background) setLoading(false);
    if (!result.success || !result.data) {
      if (result.error?.code === "UNAUTHORIZED") {
        setAuthExpired(true);
        setAuthenticatedLocal(false);
        setItems([]);
        return;
      }
      if (!options.background) {
        setLoadError(result.error?.message ?? "알림을 불러오지 못했어요.");
      }
      return;
    }
    if (nextView === "archive") {
      setArchiveItems(result.data.items);
      setArchiveNextCursor(result.data.next_cursor);
    } else {
      setItems(result.data.items);
      setUnseenNextCursor(result.data.next_cursor);
    }
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
        const value = JSON.parse(window.sessionStorage.getItem(YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY) ?? "[]") as unknown;
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
      setActiveJobs(results
        .flatMap(({ result }) => result.success && result.data ? [result.data] : [])
        .filter((job) => job.status === "queued" || job.status === "processing"));
      const hasTerminal = results.some(({ result }) => result.success && result.data
        && !activeIds.includes(result.data.job_id));
      window.sessionStorage.setItem(
        YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY,
        JSON.stringify(activeIds),
      );
      if (hasTerminal) await refresh("unseen-completed", { background: view === "archive" });
      if (activeIds.length > 0 && current) {
        timer = window.setTimeout(pollPending, 5000);
      }
    };

    void pollPending();
    window.addEventListener(YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT, pollPending);
    return () => {
      current = false;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT, pollPending);
    };
  }, [authenticated, refresh, view]);

  useEffect(() => {
    const keys = items
      .filter((item) => item.seen_at === null
        && !hiddenToastIds.includes(item.job_id)
        && item.delivered_at === null
        && !deliveredRef.current.has(item.delivery_key))
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
    const unseenIds = displayedItems
      .filter((item) => item.seen_at === null)
      .map((item) => item.job_id);
    if (unseenIds.length === 0 || !listRef.current) return;

    const expose = async (jobIds: string[]) => {
      if (jobIds.length === 0) return;
      const result = await markYoutubeExtractionSeen(jobIds);
      if (result.success && result.data) {
        markSeenInStore(jobIds);
        setSeenMutationError(false);
      } else {
        setSeenMutationError(true);
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      void expose(unseenIds);
      return;
    }
    const unseen = new Set(unseenIds);
    const observer = new IntersectionObserver((entries) => {
      const exposed = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => (entry.target as HTMLElement).dataset.youtubeJobId ?? "")
        .filter((jobId) => unseen.has(jobId));
      void expose(exposed).then(() => {
        exposed.forEach((jobId) => unseen.delete(jobId));
      });
    }, { root: listRef.current, threshold: 0.35 });
    listRef.current.querySelectorAll<HTMLElement>("[data-youtube-job-id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [displayedItems, markSeenInStore, open]);

  useEffect(() => {
    if (open) return;
    const previousTrigger = triggerBeforeOpenRef.current;
    const fallbackTrigger = document.querySelector<HTMLElement>(
      "[data-youtube-extraction-trigger='header'], [data-youtube-extraction-trigger='global']",
    );
    (previousTrigger?.isConnected ? previousTrigger : fallbackTrigger)?.focus();
  }, [open]);

  useEffect(() => {
    const queueRegisteredSessionAck = (event: Event) => {
      const extractionId = (event as CustomEvent<{ extractionId?: unknown }>).detail?.extractionId;
      if (typeof extractionId !== "string") return;
      const matchingIds = items
        .filter((item) => item.result?.extraction_id === extractionId)
        .map((item) => item.job_id);
      setRegistrationAckIds((current) => [...new Set([...current, extractionId])]);
      if (matchingIds.length > 0) {
        setHiddenToastIds((current) => [...new Set([...current, ...matchingIds])]);
      }
    };
    window.addEventListener(YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT, queueRegisteredSessionAck);
    return () => window.removeEventListener(
      YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT,
      queueRegisteredSessionAck,
    );
  }, [items]);

  useEffect(() => {
    if (!authenticated || registrationAckIds.length === 0) return;
    let current = true;

    const reconcile = async (extractionId: string) => {
      if (registrationAckInFlightRef.current.has(extractionId)) {
        registrationAckRetryRef.current.add(extractionId);
        return;
      }
      registrationAckInFlightRef.current.add(extractionId);
      let matchingItem = view === "unseen-completed"
        ? items.find((item) => item.result?.extraction_id === extractionId)
        : undefined;
      let cursor: string | null = null;

      try {
        if (!matchingItem) {
          const firstPage = await fetchYoutubeExtractionNotifications("unseen-completed", {
            limit: 50,
          });
          if (!firstPage.success || !firstPage.data) return;
          matchingItem = firstPage.data.items.find(
            (item) => item.result?.extraction_id === extractionId,
          );
          cursor = firstPage.data.next_cursor;
        }
        while (!matchingItem && cursor && current) {
          const page = await fetchYoutubeExtractionNotifications("unseen-completed", {
            cursor,
            limit: 50,
          });
          if (!page.success || !page.data) break;
          matchingItem = page.data.items.find(
            (item) => item.result?.extraction_id === extractionId,
          );
          cursor = page.data.next_cursor;
        }

        if (!matchingItem && current) {
          const firstArchivePage = await fetchYoutubeExtractionNotifications("archive", {
            limit: 50,
          });
          if (!firstArchivePage.success || !firstArchivePage.data) return;
          matchingItem = firstArchivePage.data.items.find(
            (item) => item.result?.extraction_id === extractionId,
          );
          cursor = firstArchivePage.data.next_cursor;
          while (!matchingItem && cursor && current) {
            const page = await fetchYoutubeExtractionNotifications("archive", {
              cursor,
              limit: 50,
            });
            if (!page.success || !page.data) return;
            matchingItem = page.data.items.find(
              (item) => item.result?.extraction_id === extractionId,
            );
            cursor = page.data.next_cursor;
          }
        }

        if (!matchingItem || !current) return;
        if (matchingItem.seen_at !== null) {
          forgetYoutubeExtractionRegistrationAck(extractionId);
          setRegistrationAckIds((ids) => ids.filter((id) => id !== extractionId));
          setHiddenToastIds((ids) => [...new Set([...ids, matchingItem!.job_id])]);
          markSeenInStore([matchingItem.job_id]);
          return;
        }
        const seen = await markYoutubeExtractionSeen([matchingItem.job_id]);
        if (!current) return;
        if (seen.success && seen.data && seen.data.seen_count > 0) {
          forgetYoutubeExtractionRegistrationAck(extractionId);
          setRegistrationAckIds((ids) => ids.filter((id) => id !== extractionId));
          setHiddenToastIds((ids) => [...new Set([...ids, matchingItem!.job_id])]);
          markSeenInStore([matchingItem.job_id]);
          return;
        }
        setHiddenToastIds((ids) => ids.filter((id) => id !== matchingItem!.job_id));
      } finally {
        registrationAckInFlightRef.current.delete(extractionId);
        if (registrationAckRetryRef.current.delete(extractionId)) {
          setRegistrationAckRevision((value) => value + 1);
        }
      }
    };

    registrationAckIds.forEach((extractionId) => void reconcile(extractionId));
    return () => {
      current = false;
    };
  }, [
    authenticated,
    items,
    markSeenInStore,
    registrationAckIds,
    registrationAckRevision,
    view,
  ]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void refresh("unseen-completed", { background: view === "archive" })
          .finally(() => setRegistrationAckRevision((value) => value + 1));
      }
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

  const visibleToastItems = useMemo(
    () => items
      .filter((item) => item.seen_at === null
        && item.delivered_at === null
        && !hiddenToastIds.includes(item.job_id)),
    [hiddenToastIds, items],
  );

  useEffect(() => {
    if (visibleToastItems.length === 0) return;
    const timer = window.setTimeout(() => {
      setHiddenToastIds((current) => [...new Set([
        ...current,
        ...visibleToastItems.map((item) => item.job_id),
      ])]);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [visibleToastItems]);

  const handleView = useCallback((nextView: YoutubeExtractionNotificationView) => {
    setView(nextView);
    void refresh(nextView);
  }, [refresh, setView]);

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const views: YoutubeExtractionNotificationView[] = ["unseen-completed", "archive"];
    const currentView = event.currentTarget.id === "youtube-extraction-archive-tab"
      ? "archive"
      : "unseen-completed";
    const currentIndex = views.indexOf(currentView);
    const nextView = event.key === "Home"
      ? views[0]
      : event.key === "End"
        ? views[views.length - 1]
        : event.key === "ArrowRight"
          ? views[(currentIndex + 1) % views.length]
          : views[(currentIndex - 1 + views.length) % views.length];
    handleView(nextView);
    (nextView === "archive" ? archiveTabRef.current : unseenTabRef.current)?.focus();
  }, [handleView]);

  const handleRetry = useCallback(async (item: YoutubeExtractionNotificationItem) => {
    if (!item.can_retry || retryingId) return;
    setRetryingId(item.job_id);
    const result = await enqueueYoutubeExtraction({ retry_job_id: item.job_id });
    setRetryingId(null);
    if (result.success && result.data) {
      trackYoutubeExtractionJob(result.data.job_id);
      setOpen(false);
      setView("unseen-completed");
      void refresh("unseen-completed");
    } else {
      setLoadError(result.error?.message ?? "다시 시도하지 못했어요.");
    }
  }, [refresh, retryingId, setOpen, setView]);

  const handleToastSeen = useCallback((item: YoutubeExtractionNotificationItem) => {
    void markYoutubeExtractionSeen([item.job_id]).then((result) => {
      if (result.success && result.data) {
        markSeenInStore([item.job_id]);
        setSeenMutationError(false);
      } else {
        setSeenMutationError(true);
      }
    });
  }, [markSeenInStore]);

  const handleLoadMore = useCallback(async () => {
    if (!displayedNextCursor || loadingMore) return;
    const list = listRef.current;
    const scrollTop = list?.scrollTop ?? 0;
    setLoadingMore(true);
    setLoadError(null);
    const result = await fetchYoutubeExtractionNotifications(view, { cursor: displayedNextCursor });
    setLoadingMore(false);
    if (!result.success || !result.data) {
      setLoadError(result.error?.message ?? "알림을 더 불러오지 못했어요.");
      return;
    }
    const page = result.data;
    if (view === "archive") {
      setArchiveItems((current) => appendUniqueItems(current, page.items));
      setArchiveNextCursor(page.next_cursor);
    } else {
      setItems(appendUniqueItems(items, page.items));
      setUnseenNextCursor(page.next_cursor);
    }
    if (list) {
      list.scrollTop = scrollTop;
      list.focus({ preventScroll: true });
    }
  }, [displayedNextCursor, items, loadingMore, setItems, view]);

  if (authExpired) {
    const returnPath = typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}`;
    return (
      <aside aria-label="로그인 안내" aria-live="polite" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 mx-auto max-w-sm rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-floating)] sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0 sm:w-[360px]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[var(--foreground)]">로그인이 필요해요</p>
            <p className="mt-1 text-sm text-[var(--muted)]">로그인하면 추출 작업을 이어서 확인할 수 있어요.</p>
          </div>
          <button aria-label="로그인 안내 닫기" className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-[var(--muted)]" onClick={() => setAuthExpired(false)} type="button">×</button>
        </div>
        <Link className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-[var(--foreground)]" href={`/login?next=${encodeURIComponent(returnPath)}`}>
          로그인하고 돌아오기
        </Link>
      </aside>
    );
  }

  if (!authenticated) return null;

  return (
    <>
      {!hasHeaderTrigger ? (
        <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+68px)] z-[110] rounded-full bg-[var(--surface)] shadow-sm sm:right-[80px] sm:top-[calc(env(safe-area-inset-top)+16px)]">
          <YoutubeExtractionNotificationTrigger placement="global" />
        </div>
      ) : null}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 mx-auto flex max-w-sm flex-col gap-2 sm:bottom-auto sm:left-auto sm:right-5 sm:top-[calc(env(safe-area-inset-top)+84px)] sm:mx-0 sm:w-[360px]" data-testid="youtube-notification-toast-stack">
        {visibleToastItems.length > 0 ? (() => {
          const item = visibleToastItems[0];
          const grouped = visibleToastItems.length > 1;
          const copy = grouped ? null : statusCopy(item);
          const destination = grouped ? null : item.result?.review_path ?? item.result?.recipe_path;
          const groupedOutcome = grouped
            ? new Set(visibleToastItems.map(({ status }) => status)).size > 1
              ? "mixed"
              : item.status
            : item.status;
          return (
            <article aria-atomic="true" className="pointer-events-auto rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-floating)]" data-youtube-notification-toast key={visibleToastItems.map(({ job_id }) => job_id).join(":")}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={groupedOutcome === "mixed" ? "text-[var(--muted)]" : groupedOutcome === "succeeded" ? "text-[var(--success)]" : "text-[var(--danger)]"} data-outcome={groupedOutcome} data-testid="youtube-notification-toast-icon">{groupedOutcome === "mixed" ? "•" : groupedOutcome === "succeeded" ? "✓" : "!"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--foreground)]">{grouped ? `레시피 추출 ${visibleToastItems.length}건이 끝났어요` : copy?.title}</p>
                  {grouped || copy?.body !== copy?.title ? (
                    <p className="mt-1 break-words text-sm text-[var(--muted)]">{grouped ? "완료·실패 결과를 알림 목록에서 확인해 주세요." : copy?.body}</p>
                  ) : null}
                  {!grouped && itemTitle(item) !== "YouTube 레시피" ? <p className="mt-1 break-words text-xs text-[var(--muted)]">{itemTitle(item)}</p> : null}
                </div>
                <button aria-label="toast 닫기" className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-[var(--muted)]" onClick={() => setHiddenToastIds((current) => [...new Set([...current, ...visibleToastItems.map(({ job_id }) => job_id)])])} type="button">×</button>
              </div>
              {grouped ? (
                <button className="mt-3 min-h-11 rounded-full bg-[var(--brand-soft)] px-4 text-sm font-bold text-[var(--foreground)]" onClick={() => setOpen(true)} type="button">알림 보기</button>
              ) : destination ? (
                <Link className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--brand-soft)] px-4 text-sm font-bold text-[var(--foreground)]" href={destination} onClick={() => handleToastSeen(item)}>
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
        })() : null}
      </div>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-[500] flex items-end bg-[var(--overlay-35)] p-0 sm:items-stretch sm:justify-end" data-testid="youtube-notification-overlay" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }} style={{ top: "var(--youtube-notification-safe-area-top, env(safe-area-inset-top))" }}>
          <section aria-labelledby="youtube-extraction-notifications-title" aria-modal="true" className="flex max-h-full w-full flex-col overflow-hidden rounded-t-[24px] bg-[var(--surface)] shadow-[var(--shadow-floating)] sm:h-full sm:max-w-[420px] sm:rounded-none" ref={dialogRef} role="dialog" style={{ paddingBottom: "var(--youtube-notification-safe-area-bottom, env(safe-area-inset-bottom))" }}>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--wave1-border)] px-4 py-3">
              <h2 className="text-lg font-bold" id="youtube-extraction-notifications-title">YouTube 추출 알림</h2>
              <button aria-label="알림 닫기" className="min-h-11 min-w-11 rounded-full text-xl" onClick={() => setOpen(false)} ref={closeButtonRef} type="button">×</button>
            </div>
            <p className="shrink-0 px-4 pt-3 text-sm text-[var(--muted)]">진행 중 {activeJobs.length} · 새 소식 {items.filter((item) => item.seen_at === null).length}</p>
            <div aria-label="알림 보기" className="grid shrink-0 grid-cols-2 gap-1 border-b border-[var(--wave1-border)] p-2" role="tablist">
              <button aria-controls="youtube-extraction-unseen-panel" aria-selected={view === "unseen-completed"} className="min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-bold aria-selected:bg-[var(--brand-soft)] aria-selected:text-[var(--foreground)]" id="youtube-extraction-unseen-tab" onClick={() => handleView("unseen-completed")} onKeyDown={handleTabKeyDown} ref={unseenTabRef} role="tab" tabIndex={view === "unseen-completed" ? 0 : -1} type="button">새 알림</button>
              <button aria-controls="youtube-extraction-archive-panel" aria-selected={view === "archive"} className="min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-bold aria-selected:bg-[var(--brand-soft)] aria-selected:text-[var(--foreground)]" id="youtube-extraction-archive-tab" onClick={() => handleView("archive")} onKeyDown={handleTabKeyDown} ref={archiveTabRef} role="tab" tabIndex={view === "archive" ? 0 : -1} type="button">지난 알림</button>
            </div>
            <div aria-labelledby={view === "archive" ? "youtube-extraction-archive-tab" : "youtube-extraction-unseen-tab"} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 focus:outline-none" data-testid="youtube-notification-list" id={view === "archive" ? "youtube-extraction-archive-panel" : "youtube-extraction-unseen-panel"} ref={listRef} role="tabpanel" tabIndex={-1}>
              {seenMutationError ? <div className="py-3 text-center"><p className="text-sm text-[var(--danger)]" role="status">확인 상태를 저장하지 못했어요.</p><button className="mt-2 min-h-11 rounded-full border border-[var(--wave1-border)] px-4 text-sm font-bold" onClick={() => {
                const unseenIds = items.filter((item) => item.seen_at === null).map((item) => item.job_id);
                void markYoutubeExtractionSeen(unseenIds).then((result) => {
                  if (result.success && result.data) {
                    markSeenInStore(unseenIds);
                    setSeenMutationError(false);
                  }
                });
              }} type="button">확인 상태 다시 저장</button></div> : null}
              {loading ? <p aria-live="polite" className="py-8 text-center text-sm text-[var(--muted)]">알림을 불러오는 중이에요…</p> : null}
              {loadError ? <div className="py-8 text-center"><p role="status">{loadError}</p><button className="mt-3 min-h-11 rounded-full border px-4 font-bold" onClick={() => refresh(view)} type="button">다시 불러오기</button></div> : null}
              {!loading && !loadError && view === "unseen-completed" ? activeJobs.map((job) => <ActiveJobRow job={job} key={job.job_id} />) : null}
              {!loading && !loadError && displayedItems.length === 0 && (view === "archive" || activeJobs.length === 0) ? (
                <p className="py-12 text-center text-sm text-[var(--muted)]">
                  {view === "archive" ? "완료된 추출 작업이 없어요." : "표시할 알림이 없어요."}
                </p>
              ) : null}
              {!loading && !loadError ? displayedItems.map((item) => <NotificationRow item={item} key={item.job_id} onRetry={handleRetry} />) : null}
              {!loading && !loadError && displayedNextCursor ? (
                <button className="my-4 min-h-11 w-full rounded-full border border-[var(--wave1-border)] px-4 text-sm font-bold text-[var(--foreground)]" disabled={loadingMore} onClick={handleLoadMore} type="button">
                  {loadingMore ? "불러오는 중…" : "알림 더 보기"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
