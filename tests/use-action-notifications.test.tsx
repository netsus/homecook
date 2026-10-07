// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionNotifications } from "@/components/notifications/use-action-notifications";
import * as api from "@/lib/api/action-notifications";
import { useActionNotificationStore } from "@/stores/action-notification-store";
import { HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET } from "@/lib/app-action-notifications";
import type { ActionNotificationPage } from "@/types/action-notification";
vi.mock("@/lib/api/action-notifications", () => ({ fetchActionNotifications: vi.fn(), markActionNotificationsSeen: vi.fn() }));
const auth = vi.hoisted(() => ({ callback: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => true }));
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowserClient: () => ({ auth: { onAuthStateChange: (callback: typeof auth.callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe: auth.unsubscribe } } }; } } }) }));
const id = "11111111-1111-4111-8111-111111111111";
const item = { id, event_type: "cooking_completed" as const, title: "김치찌개 2인분을 완성했어요", message: "요리 완료", target_path: "/leftovers", created_at: "2026-09-28T01:00:00Z", seen_at: null };
const page: ActionNotificationPage = { items: [item], next_cursor: null, has_next: false, unread_count: 1 };
const empty: ActionNotificationPage = { items: [], next_cursor: null, has_next: false, unread_count: 0 };
const onIdentityChange = vi.fn();
function Harness({ open = false, view = "unseen", authenticated = true }: { open?: boolean; view?: "unseen" | "archive"; authenticated?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const feed = useActionNotifications({ authenticated, open, view, listRef: ref, onIdentityChange });
  return <div ref={ref}><output data-testid="count">{feed.unreadCount}</output>{feed.items.map(row => <article key={row.id} data-app-action-notification-id={row.id}>{row.title}<span>{row.seen_at ? "읽음" : "안 읽음"}</span></article>)}{feed.error && <p>{feed.error}</p>}{feed.seenError && <button onClick={feed.retrySeen}>읽음 재시도</button>}<button onClick={feed.loadMore}>더 보기</button></div>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.mocked(api.fetchActionNotifications).mockReset().mockResolvedValue(page); vi.mocked(api.markActionNotificationsSeen).mockReset().mockResolvedValue({ seen_ids: [id], unread_count: 0 }); useActionNotificationStore.getState().setUnreadCount(0); onIdentityChange.mockReset(); auth.callback = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("persistent activity notification feed", () => {
  it("reloads saved server records after remount without local event replay", async () => {
    const first = render(<Harness />);
    expect(await screen.findByText(item.title)).toBeTruthy();
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(api.markActionNotificationsSeen).not.toHaveBeenCalled();
    first.unmount();
    render(<Harness />);
    expect(await screen.findByText(item.title)).toBeTruthy();
    expect(api.fetchActionNotifications).toHaveBeenCalledTimes(2);
  });
  it("acknowledges visible rows, uses server count, and fetches archive", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.mocked(api.markActionNotificationsSeen).mockResolvedValue({ seen_ids: [id], unread_count: 7 });
    const view = render(<Harness open />);
    expect(await screen.findByText("읽음")).toBeTruthy();
    expect(screen.getByTestId("count").textContent).toBe("7");
    vi.mocked(api.fetchActionNotifications).mockResolvedValue({ ...page, items: [{ ...item, seen_at: "2026-09-28T02:00:00Z" }], unread_count: 7 });
    view.rerender(<Harness open view="archive" />);
    await waitFor(() => expect(api.fetchActionNotifications).toHaveBeenLastCalledWith("archive", null));
    expect(await screen.findByText(item.title)).toBeTruthy();
  });
  it("marks only rows observed inside the open notification list", async () => {
    let visibilityChanged!: IntersectionObserverCallback;
    const observed: Element[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { visibilityChanged = callback; }
      observe(node: Element) { observed.push(node); }
      disconnect() {}
    });
    const other = { ...item, id: "22222222-2222-4222-8222-222222222222", title: "아직 화면 밖의 요리" };
    vi.mocked(api.fetchActionNotifications).mockResolvedValue({ ...page, items: [item, other], unread_count: 2 });
    render(<Harness open />);
    await waitFor(() => expect(observed).toHaveLength(2));
    expect(api.markActionNotificationsSeen).not.toHaveBeenCalled();
    act(() => visibilityChanged([
      { target: observed[0], isIntersecting: true } as IntersectionObserverEntry,
      { target: observed[1], isIntersecting: false } as IntersectionObserverEntry,
    ], {} as IntersectionObserver));
    await waitFor(() => expect(api.markActionNotificationsSeen).toHaveBeenCalledWith([id]));
    expect(screen.getByText(other.title).textContent).toContain("안 읽음");
  });
  it("treats local success events only as a server refresh signal", async () => {
    vi.mocked(api.fetchActionNotifications).mockResolvedValue(empty);
    render(<Harness />);
    await waitFor(() => expect(api.fetchActionNotifications).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new CustomEvent(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, { detail: { title: "forged local activity", message: "not authoritative" } })));
    await waitFor(() => expect(api.fetchActionNotifications).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("forged local activity")).toBeNull();
  });
  it("ignores previous-account read responses after explicit logout", async () => {
    const pending = deferred<ActionNotificationPage>();
    vi.mocked(api.fetchActionNotifications).mockReturnValue(pending.promise);
    render(<Harness />);
    act(() => window.dispatchEvent(new Event(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET)));
    await act(async () => pending.resolve(page));
    expect(screen.queryByText(item.title)).toBeNull();
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(onIdentityChange).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(api.fetchActionNotifications).toHaveBeenCalledOnce();
  });
  it("clears previous account rows and ignores its late acknowledgement", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const pending = deferred<{ seen_ids: string[]; unread_count: number }>();
    vi.mocked(api.markActionNotificationsSeen).mockReturnValue(pending.promise);
    render(<Harness open />);
    act(() => auth.callback?.("INITIAL_SESSION", { user: { id: "account-a", created_at: "2026-01-01" } }));
    expect(await screen.findByText(item.title)).toBeTruthy();
    await waitFor(() => expect(api.markActionNotificationsSeen).toHaveBeenCalled());
    vi.mocked(api.fetchActionNotifications).mockResolvedValue(empty);
    act(() => auth.callback?.("SIGNED_IN", { user: { id: "account-b", created_at: "2026-02-01" } }));
    await waitFor(() => expect(screen.queryByText(item.title)).toBeNull());
    await act(async () => pending.resolve({ seen_ids: [id], unread_count: 99 }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
  it("ignores an in-flight acknowledgement when authentication becomes false", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const pending = deferred<{ seen_ids: string[]; unread_count: number }>();
    vi.mocked(api.markActionNotificationsSeen).mockReturnValue(pending.promise);
    const view = render(<Harness open />);
    await waitFor(() => expect(api.markActionNotificationsSeen).toHaveBeenCalled());
    view.rerender(<Harness open authenticated={false} />);
    await act(async () => pending.resolve({ seen_ids: [id], unread_count: 99 }));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.queryByText(item.title)).toBeNull();
  });
  it("retains unread state after a failed acknowledgement and allows retry", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.mocked(api.markActionNotificationsSeen).mockRejectedValueOnce(new Error("offline"));
    render(<Harness open />);
    fireEvent.click(await screen.findByText("읽음 재시도"));
    expect(await screen.findByText("읽음")).toBeTruthy();
    expect(api.markActionNotificationsSeen).toHaveBeenCalledTimes(2);
  });
  it("serializes visible reads and prevents stale GET counts from restoring the badge", async () => {
    let visibilityChanged!: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { visibilityChanged = callback; }
      observe() {}
      disconnect() {}
    });
    const other = { ...item, id: "22222222-2222-4222-8222-222222222222", title: "장보기 완료" };
    const staleGet = deferred<ActionNotificationPage>();
    const firstSeen = deferred<{ seen_ids: string[]; unread_count: number }>();
    const secondSeen = deferred<{ seen_ids: string[]; unread_count: number }>();
    vi.mocked(api.fetchActionNotifications).mockResolvedValueOnce({ ...page, items: [item, other], unread_count: 2 })
      .mockReturnValueOnce(staleGet.promise).mockResolvedValue(empty);
    vi.mocked(api.markActionNotificationsSeen).mockReturnValueOnce(firstSeen.promise).mockReturnValueOnce(secondSeen.promise);
    render(<Harness open />);
    expect(await screen.findByText(item.title)).toBeTruthy();
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(api.fetchActionNotifications).toHaveBeenCalledTimes(2));
    const show = (id: string) => visibilityChanged([{ target: document.querySelector(`[data-app-action-notification-id="${id}"]`), isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    act(() => { show(item.id); show(other.id); });
    await waitFor(() => expect(api.markActionNotificationsSeen).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(api.fetchActionNotifications).toHaveBeenCalledTimes(2);
    await act(async () => staleGet.resolve({ ...page, unread_count: 99 }));
    expect(screen.getByTestId("count").textContent).toBe("2");
    await act(async () => firstSeen.resolve({ seen_ids: [item.id], unread_count: 1 }));
    await waitFor(() => expect(api.markActionNotificationsSeen).toHaveBeenCalledTimes(2));
    expect(api.markActionNotificationsSeen).toHaveBeenNthCalledWith(1, [item.id]);
    expect(api.markActionNotificationsSeen).toHaveBeenNthCalledWith(2, [other.id]);
    expect(screen.getByTestId("count").textContent).toBe("1");
    await act(async () => secondSeen.resolve({ seen_ids: [other.id], unread_count: 0 }));
    await waitFor(() => expect(api.fetchActionNotifications).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
  it("splits a failed multi-page read retry into at most 50 IDs per request", async () => {
    let visibilityChanged!: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { visibilityChanged = callback; }
      observe() {}
      disconnect() {}
    });
    const rows = Array.from({ length: 60 }, (_, i) => ({ ...item, id: `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, title: `완료 ${i + 1}` }));
    vi.mocked(api.fetchActionNotifications).mockResolvedValueOnce({ ...page, items: rows.slice(0, 30), has_next: true, next_cursor: "page-2", unread_count: 60 })
      .mockResolvedValueOnce({ ...page, items: rows.slice(30), unread_count: 60 });
    vi.mocked(api.markActionNotificationsSeen).mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async ids => ({ seen_ids: ids, unread_count: ids.length === 50 ? 10 : 0 }));
    render(<Harness open />);
    expect(await screen.findByText("완료 1")).toBeTruthy();
    fireEvent.click(screen.getByText("더 보기"));
    expect(await screen.findByText("완료 60")).toBeTruthy();
    act(() => visibilityChanged([...document.querySelectorAll("[data-app-action-notification-id]")].map(target => ({ target, isIntersecting: true } as IntersectionObserverEntry)), {} as IntersectionObserver));
    fireEvent.click(await screen.findByText("읽음 재시도"));
    await waitFor(() => expect(screen.getAllByText("읽음")).toHaveLength(60));
    expect(api.markActionNotificationsSeen).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.markActionNotificationsSeen).mock.calls.map(([ids]) => ids.length)).toEqual([50, 50, 10]);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
  it("does not refetch forever when a page has a continuation cursor", async () => {
    vi.mocked(api.fetchActionNotifications).mockResolvedValueOnce({ ...page, has_next: true, next_cursor: "page-2" }).mockResolvedValue({ ...page, items: [{ ...item, id: "22222222-2222-4222-8222-222222222222", title: "장보기 완료" }], unread_count: 2 });
    render(<Harness />);
    expect(await screen.findByText(item.title)).toBeTruthy();
    expect(api.fetchActionNotifications).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("더 보기"));
    expect(await screen.findByText("장보기 완료")).toBeTruthy();
    expect(screen.getByText(item.title)).toBeTruthy();
    expect(api.fetchActionNotifications).toHaveBeenLastCalledWith("unseen", "page-2");
  });
});
