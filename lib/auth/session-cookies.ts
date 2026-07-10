import type { NextResponse } from "next/server";

interface CookieStoreReader {
  getAll(): Array<{ name: string }>;
}

const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[A-Za-z0-9_-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

export function expireSupabaseAuthCookies(
  response: NextResponse,
  request: Request,
  cookieStore?: CookieStoreReader | null,
) {
  const requestCookieNames = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim().split("=", 1)[0])
    .filter((name): name is string => Boolean(name));
  const storeCookieNames = cookieStore?.getAll().map((cookie) => cookie.name) ?? [];

  for (const name of new Set([...requestCookieNames, ...storeCookieNames])) {
    if (!SUPABASE_AUTH_COOKIE_PATTERN.test(name)) {
      continue;
    }

    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}
