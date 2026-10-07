"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { fetchActionNotifications, markActionNotificationsSeen } from "@/lib/api/action-notifications";
import { isApiFetchError } from "@/lib/api/fetch-json";
import { HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET } from "@/lib/app-action-notifications";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useActionNotificationStore } from "@/stores/action-notification-store";
import type { ActionNotification } from "@/types/action-notification";

export function useActionNotifications({ authenticated, open, view, listRef, onIdentityChange }: {
  authenticated: boolean; open: boolean; view: "unseen" | "archive";
  listRef: RefObject<HTMLElement | null>; onIdentityChange: () => void;
}) {
  const [items, setItems] = useState<ActionNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenError, setSeenError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const requestRef = useRef(0);
  const canReadRef = useRef(true);
  const seenPending = useRef(new Set<string>());
  const seenQueue = useRef(Promise.resolve());
  const refreshAfterSeen = useRef(false);
  const onIdentityRef = useRef(onIdentityChange);
  onIdentityRef.current = onIdentityChange;
  const unreadCount = useActionNotificationStore(state => state.unreadCount);
  const setUnreadCount = useActionNotificationStore(state => state.setUnreadCount);
  const currentView = open ? view : "unseen";

  useEffect(() => {
    let owner: string | null = null;
    const reset = (canRead: boolean) => {
      ++epochRef.current; ++requestRef.current;
      canReadRef.current = canRead;
      seenPending.current.clear(); refreshAfterSeen.current = false;
      setItems([]); setCursor(null); setUnreadCount(0); setError(null); setSeenError(false); setLoading(false);
      setEpoch(epochRef.current);
      onIdentityRef.current();
    };
    const loggedOut = () => reset(false);
    window.addEventListener(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET, loggedOut);
    const subscription = hasSupabasePublicEnv() ? getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const next = session?.user ? `${session.user.id}:${session.user.created_at}` : null;
      if (event === "SIGNED_OUT" || (owner !== null && owner !== next)) reset(Boolean(next));
      else if (next && !canReadRef.current) reset(true);
      owner = next;
    }).data.subscription : null;
    const identityCounter = epochRef;
    const requestCounter = requestRef;
    return () => { ++identityCounter.current; ++requestCounter.current; subscription?.unsubscribe(); window.removeEventListener(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET, loggedOut); setUnreadCount(0); };
  }, [setUnreadCount]);

  const refresh = useCallback(async (append = false) => {
    if (!authenticated || !canReadRef.current) return;
    if (seenPending.current.size) { refreshAfterSeen.current = true; return; }
    const request = ++requestRef.current;
    setLoading(true); setError(null);
    try {
      const page = await fetchActionNotifications(currentView, append ? cursor : null);
      if (request !== requestRef.current) return;
      setItems(current => append ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.has_next ? page.next_cursor : null);
      setUnreadCount(page.unread_count);
    } catch (reason) {
      if (request !== requestRef.current) return;
      if (isApiFetchError(reason) && (reason.status === 401 || reason.code === "ACCOUNT_SESSION_STALE")) {
        ++epochRef.current; setItems([]); setCursor(null); setUnreadCount(0);
      }
      setError("활동 알림을 불러오지 못했어요.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [authenticated, currentView, cursor, setUnreadCount]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    ++requestRef.current;
    setItems([]); setCursor(null); setError(null); setSeenError(false);
    if (!authenticated) {
      ++epochRef.current; seenPending.current.clear(); refreshAfterSeen.current = false;
      setUnreadCount(0); setLoading(false); return;
    }
    void refreshRef.current();
    const requestCounter = requestRef;
    return () => { ++requestCounter.current; };
  }, [authenticated, currentView, epoch, setUnreadCount]);
  useEffect(() => {
    if (!authenticated) return;
    const refreshNow = () => { if (document.visibilityState !== "hidden") void refreshRef.current(); };
    window.addEventListener(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, refreshNow);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);
    return () => {
      window.removeEventListener(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, refreshNow);
      window.removeEventListener("focus", refreshNow); window.removeEventListener("online", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [authenticated]);

  const markSeen = useCallback((ids: string[]) => {
    const pending = [...new Set(ids)].filter(id => !seenPending.current.has(id));
    if (!pending.length) return;
    pending.forEach(id => seenPending.current.add(id));
    const identity = epochRef.current;
    // Serialize read mutations and split loaded pages to the API's 50-ID limit.
    // A read mutation invalidates earlier list responses as well as other reads.
    seenQueue.current = seenQueue.current.then(async () => {
      if (identity !== epochRef.current) return;
      ++requestRef.current;
      setLoading(false);
      try {
        for (let offset = 0; offset < pending.length; offset += 50) {
          const result = await markActionNotificationsSeen(pending.slice(offset, offset + 50));
          if (identity !== epochRef.current) return;
          const acknowledged = new Set(result.seen_ids);
          setItems(current => current.map(item => acknowledged.has(item.id) ? { ...item, seen_at: item.seen_at ?? new Date().toISOString() } : item));
          setUnreadCount(result.unread_count);
        }
        setSeenError(false);
      } catch { if (identity === epochRef.current) setSeenError(true); }
      finally {
        if (identity === epochRef.current) {
          pending.forEach(id => seenPending.current.delete(id));
          if (!seenPending.current.size && refreshAfterSeen.current) {
            refreshAfterSeen.current = false;
            void refreshRef.current();
          }
        }
      }
    });
    return seenQueue.current;
  }, [setUnreadCount]);
  useEffect(() => {
    if (!open || !authenticated || !listRef.current || seenError) return;
    const unseen = new Set(items.filter(item => item.seen_at === null).map(item => item.id));
    if (!unseen.size) return;
    if (typeof IntersectionObserver === "undefined") { void markSeen([...unseen]); return; }
    const observer = new IntersectionObserver(entries => {
      const ids = entries.filter(entry => entry.isIntersecting).map(entry => (entry.target as HTMLElement).dataset.appActionNotificationId ?? "").filter(id => unseen.has(id));
      ids.forEach(id => unseen.delete(id));
      void markSeen(ids);
    }, { root: listRef.current, threshold: 0.35 });
    listRef.current.querySelectorAll<HTMLElement>("[data-app-action-notification-id]").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [authenticated, items, listRef, markSeen, open, seenError]);
  return { items, loading, error, unreadCount, hasMore: cursor !== null, epoch, epochRef, seenError,
    refresh: () => refreshRef.current(), loadMore: () => refreshRef.current(true),
    retrySeen: () => { setSeenError(false); void markSeen(items.filter(item => item.seen_at === null).map(item => item.id)); } };
}
