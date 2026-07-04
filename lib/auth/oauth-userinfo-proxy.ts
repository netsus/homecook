import { NextResponse } from "next/server";

type OAuthUserinfoProvider = "kakao" | "naver";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const PROVIDER_USERINFO_URLS: Record<OAuthUserinfoProvider, string> = {
  kakao: "https://kapi.kakao.com/v2/user/me",
  naver: "https://openapi.naver.com/v1/nid/me",
};

export async function proxyOAuthUserinfo(
  request: Request,
  provider: OAuthUserinfoProvider,
) {
  const authorization = request.headers.get("authorization");

  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization.trim())) {
    return json({ error: "missing_bearer_token" }, 401);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(PROVIDER_USERINFO_URLS[provider], {
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    });
  } catch {
    return json({ error: "provider_userinfo_failed" }, 502);
  }

  if (!upstreamResponse.ok) {
    return json({ error: "provider_userinfo_failed" }, 502);
  }

  let upstreamPayload: unknown;
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch {
    return json({ error: "provider_userinfo_failed" }, 502);
  }

  const normalized = provider === "naver"
    ? normalizeNaverUserinfo(upstreamPayload)
    : normalizeKakaoUserinfo(upstreamPayload);

  if (!normalized.sub) {
    return json({ error: "provider_userinfo_missing_sub" }, 502);
  }

  return json(normalized, 200);
}

function normalizeNaverUserinfo(payload: unknown) {
  const root = asRecord(payload);
  const response = asRecord(root.response);
  const email = readClaim(response.email);
  const avatarUrl = readClaim(response.profile_image);

  return compactClaims({
    sub: readClaim(response.id),
    email,
    email_verified: email ? true : undefined,
    name: readClaim(response.name),
    nickname: readClaim(response.nickname),
    avatar_url: avatarUrl,
    picture: avatarUrl,
  });
}

function normalizeKakaoUserinfo(payload: unknown) {
  const root = asRecord(payload);
  const account = asRecord(root.kakao_account);
  const profile = asRecord(account.profile);
  const nickname = readClaim(profile.nickname);
  const avatarUrl = readClaim(profile.profile_image_url) ?? readClaim(profile.thumbnail_image_url);

  return compactClaims({
    sub: readClaim(root.id),
    email: readClaim(account.email),
    email_verified: account.is_email_verified === true
      && account.is_email_valid !== false
      ? true
      : undefined,
    name: readClaim(account.name) ?? nickname,
    nickname,
    avatar_url: avatarUrl,
    picture: avatarUrl,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readClaim(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function compactClaims(claims: Record<string, string | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(claims).filter((entry): entry is [string, string | boolean] =>
      entry[1] !== undefined
    ),
  );
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}
