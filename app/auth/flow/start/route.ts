import { cookies } from "next/headers";

import { fail, ok } from "@/lib/api/response";
import { AUTH_FLOW_COOKIE_NAME } from "@/lib/server/full-local-auth/flow-ledger";
import {
  consumeAuthFlowStartLimit,
  isSameOriginPost,
} from "@/lib/server/full-local-auth/request";
import {
  cancelAuthFlowAttempt,
  startAuthFlowAttempt,
} from "@/lib/server/full-local-auth/runtime";
import { createAuthServerComponentClient } from "@/lib/supabase/server";

const PROVIDERS = new Set(["google", "kakao", "custom:naver"]);
const FLOW_KINDS = new Set(["login", "link"]);
const RECOVERABLE_TERMINAL_FAILURES = new Set(["expired", "invalid"]);

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return fail("FORBIDDEN", "허용되지 않은 요청이에요.", 403);
  }
  if (!consumeAuthFlowStartLimit(request)) {
    return fail("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  let body: { flow_kind?: unknown; provider?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 400);
  }
  if (
    !FLOW_KINDS.has(body.flow_kind as string)
    || !PROVIDERS.has(body.provider as string)
  ) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 400);
  }

  if (body.flow_kind === "link") {
    const supabase = await createAuthServerComponentClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  try {
    const cookieStore = await cookies();
    const existingFlow = cookieStore.get(AUTH_FLOW_COOKIE_NAME)?.value;
    if (existingFlow) {
      const cancelled = await cancelAuthFlowAttempt(existingFlow);
      if (
        !cancelled.ok
        && !RECOVERABLE_TERMINAL_FAILURES.has(cancelled.reason)
      ) {
        throw new Error("Previous Auth flow could not be terminalized");
      }
    }
    const started = await startAuthFlowAttempt({
      flowKind: body.flow_kind as "login" | "link",
      provider: body.provider as "google" | "kakao" | "custom:naver",
    });
    const response = ok({
      started: true,
      expires_at: started.expiresAt,
    });
    response.cookies.set(AUTH_FLOW_COOKIE_NAME, started.cookieValue, {
      httpOnly: true,
      maxAge: started.maxAge,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    return response;
  } catch {
    return fail(
      "AUTH_FLOW_UNAVAILABLE",
      "로그인 준비 작업 중이에요. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
}
