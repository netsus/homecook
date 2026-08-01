import { cookies } from "next/headers";

import { fail, ok } from "@/lib/api/response";
import { AUTH_FLOW_COOKIE_NAME } from "@/lib/server/full-local-auth/flow-ledger";
import { isSameOriginPost } from "@/lib/server/full-local-auth/request";
import { cancelAuthFlowAttempt } from "@/lib/server/full-local-auth/runtime";

function expireFlowCookie(response: ReturnType<typeof ok>) {
  response.cookies.set(AUTH_FLOW_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return fail("FORBIDDEN", "허용되지 않은 요청이에요.", 403);
  }
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(AUTH_FLOW_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return fail("AUTH_FLOW_INVALID", "로그인 흐름을 확인할 수 없어요.", 409);
  }

  const cancelled = await cancelAuthFlowAttempt(cookieValue);
  if (!cancelled.ok) {
    return expireFlowCookie(fail(
      "AUTH_FLOW_INVALID",
      "로그인 흐름을 확인할 수 없어요.",
      409,
    ));
  }
  return expireFlowCookie(ok({ cancelled: true }));
}
