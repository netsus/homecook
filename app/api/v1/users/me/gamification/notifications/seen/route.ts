import { fail, ok } from "@/lib/api/response";
import { markUserGamificationNotificationsSeen } from "@/lib/server/user-gamification";
import type { UserGamificationSeenData } from "@/types/user-gamification";

import { createAuthedGamificationClient } from "../../_helpers";

interface NotificationSeenBody {
  notification_ids?: unknown;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const parsedBody = await parseNotificationSeenBody(request);

  if (!parsedBody.ok) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, [
      { field: parsedBody.field, reason: parsedBody.reason },
    ]);
  }

  const { response, dbClient, user } =
    await createAuthedGamificationClient("알림 확인 상태를 저장하지 못했어요.");

  if (response) {
    return response;
  }

  const seenResult = await markUserGamificationNotificationsSeen(
    dbClient,
    user.id,
    parsedBody.notificationIds,
  );

  if (seenResult.error || !seenResult.data) {
    return fail("INTERNAL_ERROR", "알림 확인 상태를 저장하지 못했어요.", 500);
  }

  return ok<UserGamificationSeenData>(seenResult.data);
}

async function parseNotificationSeenBody(request: Request): Promise<
  | { ok: true; notificationIds: string[] }
  | { ok: false; field: string; reason: string }
> {
  let body: NotificationSeenBody;

  try {
    body = (await request.json()) as NotificationSeenBody;
  } catch {
    return { ok: false, field: "body", reason: "invalid_json" };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "body", reason: "invalid_object" };
  }

  if (!Array.isArray(body.notification_ids)) {
    return { ok: false, field: "notification_ids", reason: "invalid_type" };
  }

  const notificationIds: string[] = [];
  const seen = new Set<string>();

  for (const id of body.notification_ids) {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      return { ok: false, field: "notification_ids", reason: "invalid_uuid" };
    }

    if (!seen.has(id)) {
      seen.add(id);
      notificationIds.push(id);
    }
  }

  return { ok: true, notificationIds };
}
