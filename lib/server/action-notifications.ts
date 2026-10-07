import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { createActionNotificationsInternalClient, createRouteHandlerClient } from "@/lib/supabase/server";
import type { ActionNotification, ActionNotificationPage } from "@/types/action-notification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Cursor = { created_at: string; id: string };
export function decodeActionNotificationCursor(value: string): Cursor | null {
  if (value.length > 300) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof cursor?.created_at === "string" && Number.isFinite(Date.parse(cursor.created_at))
      && UUID.test(cursor.id) ? { created_at: cursor.created_at, id: cursor.id } : null;
  } catch { return null; }
}
export function projectActionNotificationPage(items: ActionNotification[], unreadCount: number, limit: number): ActionNotificationPage {
  const hasNext = items.length > limit;
  const page = items.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page,
    unread_count: unreadCount,
    has_next: hasNext,
    next_cursor: hasNext && last
      ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString("base64url") : null,
  };
}
async function authorize() {
  const route = await createRouteHandlerClient();
  const { data, error } = await route.auth.getUser();
  if (isAuthSessionMissingError(error)) {
    return { response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401) };
  }
  if (error) throw error;
  if (!data.user) return { response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401) };
  const verified = await readVerifiedAccountGenerationSession(route, data.user);
  if (!verified.ok) {
    // This verifier deliberately collapses transport and identity failures.
    // Fail closed without labelling a slow authority response as a stale session.
    return { response: fail("ACCOUNT_LIFECYCLE_MAINTENANCE", "알림을 불러오지 못했어요. 다시 시도해 주세요.", 503) };
  }
  if (verified.sessionAuthority.ownerUuid !== data.user.id) {
    return { response: fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409) };
  }
  const client = createActionNotificationsInternalClient();
  if (!client) throw new Error("Action notifications unavailable");
  return { client, args: buildSessionAuthorityRpcArgs(verified.sessionAuthority) };
}
function unavailable(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (/ACCOUNT_(SESSION|GENERATION)_STALE|ACCOUNT_DELETING|ACCOUNT_DELETION_PENDING/.test(message)) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }
  return createHybridAuthorityRouteError(error) ?? fail("SERVICE_UNAVAILABLE", "알림을 불러오지 못했어요. 다시 시도해 주세요.", 503);
}
export async function listActionNotifications(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "unseen";
    const limitText = params.get("limit") ?? "20";
    const limit = Number(limitText);
    const cursorText = params.get("cursor");
    const cursor = cursorText ? decodeActionNotificationCursor(cursorText) : null;
    if (!["unseen", "archive"].includes(view) || !/^\d+$/.test(limitText) || limit < 1 || limit > 50 || (cursorText !== null && !cursor)) {
      return fail("VALIDATION_ERROR", "알림 조회 조건을 확인해 주세요.", 422);
    }
    const auth = await authorize();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client!.rpc("list_action_notifications", {
      ...auth.args, p_view: view, p_limit: limit, p_cursor_created_at: cursor?.created_at ?? null, p_cursor_id: cursor?.id ?? null,
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.unread_count)) throw new Error("Invalid notification result");
    return ok(projectActionNotificationPage(data.items, data.unread_count, limit), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return unavailable(error); }
}
export async function markActionNotificationsSeen(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 50 || body.ids.some((id: unknown) => typeof id !== "string" || !UUID.test(id))) {
      return fail("VALIDATION_ERROR", "확인할 알림을 선택해 주세요.", 422);
    }
    const auth = await authorize();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client!.rpc("mark_action_notifications_seen", { ...auth.args, p_ids: [...new Set(body.ids)] });
    if (error) throw error;
    if (!data || !Array.isArray(data.seen_ids) || !Number.isSafeInteger(data.unread_count)) throw new Error("Invalid notification result");
    return ok(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return unavailable(error); }
}
