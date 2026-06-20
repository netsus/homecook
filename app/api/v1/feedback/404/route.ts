import { headers } from "next/headers";

import { ok, fail } from "@/lib/api/response";
import { recordOperationalEvent, type OperationalEventsDbClient } from "@/lib/server/admin-events";
import { hashPrivateValue, normalizeRequestPath } from "@/lib/server/admin-log-sanitize";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

const MAX_FEEDBACK_LENGTH = 600;
const MAX_SUMMARY_LENGTH = 180;
const ANONYMOUS_ID_PATTERN = /^anon_[a-zA-Z0-9_-]{12,64}$/u;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const PHONE_PATTERN = /(?:\+?82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/gu;

interface NotFoundFeedbackBody {
  anonymous_id?: unknown;
  current_url?: unknown;
  message?: unknown;
  occurred_at?: unknown;
  referrer?: unknown;
}

interface NotFoundFeedbackData {
  received: true;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function sanitizeFeedbackText(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[이메일 제거]")
    .replace(URL_PATTERN, "[링크 제거]")
    .replace(PHONE_PATTERN, "[연락처 제거]")
    .replace(/\s+/gu, " ")
    .trim();
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

function normalizeAnonymousId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return ANONYMOUS_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeOccurredAt(value: unknown) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

async function readAuthUserId() {
  try {
    const routeClient = await createRouteHandlerClient();
    const authResult = await routeClient.auth.getUser();
    return authResult.data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function readJsonBody(request: Request): Promise<NotFoundFeedbackBody | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as NotFoundFeedbackBody
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const rawMessage = normalizeText(body?.message);

  if (!rawMessage) {
    return fail("VALIDATION_ERROR", "상황을 한 줄이라도 적어 주세요.", 400, [
      { field: "message", reason: "required" },
    ]);
  }

  if (rawMessage.length > MAX_FEEDBACK_LENGTH) {
    return fail("VALIDATION_ERROR", "피드백은 600자 안으로 적어 주세요.", 400, [
      { field: "message", reason: "max_length" },
    ]);
  }

  const serviceRoleClient = createServiceRoleClient();
  if (!serviceRoleClient) {
    return fail(
      "NOT_FOUND_FEEDBACK_WRITE_FAILED",
      "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }

  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const userId = await readAuthUserId();
  const feedbackText = truncate(sanitizeFeedbackText(rawMessage), MAX_FEEDBACK_LENGTH);
  const currentPath = normalizeRequestPath(normalizeText(body?.current_url)) ?? "/404";
  const referrerPath = normalizeRequestPath(normalizeText(body?.referrer)) ?? null;

  const stored = await recordOperationalEvent(
    serviceRoleClient as unknown as OperationalEventsDbClient,
    {
      actor_user_id: userId,
      error_code: "ROUTE_NOT_FOUND",
      event_type: "not_found_feedback",
      http_status: 404,
      message_summary: truncate(feedbackText, MAX_SUMMARY_LENGTH),
      metadata_json: {
        anonymous_id: userId ? null : normalizeAnonymousId(body?.anonymous_id),
        current_path: currentPath,
        feedback_text: feedbackText,
        is_authenticated: Boolean(userId),
        occurred_at: normalizeOccurredAt(body?.occurred_at),
        referrer_path: referrerPath,
        user_agent_hash: hashPrivateValue(userAgent),
      },
      request_path: currentPath,
      severity: "warn",
      source: "web",
    },
  );

  if (!stored) {
    return fail(
      "NOT_FOUND_FEEDBACK_WRITE_FAILED",
      "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      500,
    );
  }

  return ok<NotFoundFeedbackData>({ received: true });
}
