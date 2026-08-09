import type { NextResponse } from "next/server";

import { AUTH_FLOW_COOKIE_NAME } from "@/lib/server/full-local-auth/flow-ledger";

interface CookieStoreReader {
  getAll(): Array<{ name: string }>;
}

interface ExactSupabaseAuthCookieScope {
  authUrl?: string;
  storageKey?: string;
}

const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[A-Za-z0-9_-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

export function getSupabaseAuthStorageKey(authUrl: string) {
  const hostnameLabel = new URL(authUrl).hostname.split(".")[0]?.trim();
  if (!hostnameLabel) {
    throw new Error("Supabase auth URL hostname이 비어 있어요.");
  }

  return `sb-${hostnameLabel}-auth-token`;
}

function matchesExactSupabaseAuthCookie(name: string, storageKey: string) {
  return name === storageKey
    || name === `${storageKey}-code-verifier`
    || new RegExp(`^${storageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`).test(name);
}

export function expireSupabaseAuthCookies(
  response: NextResponse,
  request: Request,
  cookieStore?: CookieStoreReader | null,
  exactScope?: ExactSupabaseAuthCookieScope,
) {
  const exactStorageKey = exactScope?.storageKey
    ?? (exactScope?.authUrl ? getSupabaseAuthStorageKey(exactScope.authUrl) : null);
  const requestCookieNames = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim().split("=", 1)[0])
    .filter((name): name is string => Boolean(name));
  const storeCookieNames = cookieStore?.getAll().map((cookie) => cookie.name) ?? [];

  for (const name of new Set([...requestCookieNames, ...storeCookieNames])) {
    if (
      exactStorageKey
        ? !matchesExactSupabaseAuthCookie(name, exactStorageKey)
        : !SUPABASE_AUTH_COOKIE_PATTERN.test(name)
    ) {
      continue;
    }

    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}

export function expireAuthFlowCookie(response: NextResponse) {
  response.cookies.set(AUTH_FLOW_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  return response;
}
