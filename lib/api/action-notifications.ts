import { fetchJson } from "@/lib/api/fetch-json";
import type { ActionNotification, ActionNotificationPage } from "@/types/action-notification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isActionNotificationTarget(path: unknown): path is string {
  return typeof path === "string" && /^\/(?:planner|meal|shopping|pantry|leftovers|recipe)(?:[/?]|$)/.test(path)
    && !path.includes("\\") && !/[\u0000-\u001f]/.test(path);
}
function validItem(item: ActionNotification) {
  return item && UUID.test(item.id) && typeof item.title === "string" && typeof item.message === "string"
    && isActionNotificationTarget(item.target_path) && Number.isFinite(Date.parse(item.created_at))
    && (item.seen_at === null || Number.isFinite(Date.parse(item.seen_at)));
}
export async function fetchActionNotifications(view: "unseen" | "archive", cursor?: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ view, limit: "30" });
  if (cursor) params.set("cursor", cursor);
  const data = await fetchJson<ActionNotificationPage>(`/api/v1/users/me/action-notifications?${params}`, { cache: "no-store", signal });
  if (!data || !Array.isArray(data.items) || data.items.length > 30 || !data.items.every(validItem)
    || typeof data.has_next !== "boolean" || (data.next_cursor !== null && typeof data.next_cursor !== "string")
    || !Number.isSafeInteger(data.unread_count) || data.unread_count < 0) throw new Error("알림 응답을 확인하지 못했어요.");
  return data;
}
export async function markActionNotificationsSeen(ids: string[]) {
  const data = await fetchJson<{ seen_ids: string[]; unread_count: number }>("/api/v1/users/me/action-notifications/seen", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }),
  });
  if (!Number.isSafeInteger(data?.unread_count) || data.unread_count < 0 || !Array.isArray(data?.seen_ids) || data.seen_ids.some(id => !UUID.test(id) || !ids.includes(id))) throw new Error("읽음 상태를 확인하지 못했어요.");
  return data;
}
