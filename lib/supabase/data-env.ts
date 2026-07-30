import {
  getAuthSupabaseEnv,
  getAuthSupabaseSecretKey,
  getRemoteAuthIssuer,
} from "./auth-env";

export type DataAuthority = "remote" | "local-shadow" | "local";

function requireNonEmpty(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} 환경 변수가 필요해요.`);
  }

  return normalized;
}

function parseDataAuthority(value: string | undefined): DataAuthority {
  const normalized = value?.trim() || "remote";
  if (
    normalized !== "remote"
    && normalized !== "local-shadow"
    && normalized !== "local"
  ) {
    throw new Error(
      "HOMECOOK_DATA_AUTHORITY는 remote, local-shadow, local 중 하나여야 해요.",
    );
  }

  return normalized;
}

function normalizeDataUrl(value: string, requireLoopback: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATA_SUPABASE_URL 값은 유효한 URL이어야 해요.");
  }

  const isLoopback = parsed.hostname === "127.0.0.1"
    || parsed.hostname === "localhost"
    || parsed.hostname === "::1"
    || parsed.hostname === "[::1]";
  if (requireLoopback && !isLoopback) {
    throw new Error(
      "production local Data/Storage URL은 loopback 주소여야 해요.",
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("DATA_SUPABASE_URL 값에 인증정보나 query를 넣을 수 없어요.");
  }

  return parsed.origin;
}

export function getDataAuthority(): DataAuthority {
  return parseDataAuthority(process.env.HOMECOOK_DATA_AUTHORITY);
}

export function getDataSupabaseEnv(): {
  authority: DataAuthority;
  url: string;
  publishableKey: string;
} {
  const authority = getDataAuthority();
  if (authority === "remote" || authority === "local-shadow") {
    const authEnv = getAuthSupabaseEnv();
    return {
      authority,
      url: authEnv.url,
      publishableKey: authEnv.publishableKey,
    };
  }

  const url = normalizeDataUrl(
    requireNonEmpty(process.env.DATA_SUPABASE_URL, "DATA_SUPABASE_URL"),
    process.env.NODE_ENV === "production",
  );
  const publishableKey = requireNonEmpty(
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY,
    "DATA_SUPABASE_PUBLISHABLE_KEY",
  );

  return { authority, url, publishableKey };
}

export function getDataSupabaseUrl() {
  const authority = getDataAuthority();
  if (authority === "remote" || authority === "local-shadow") {
    return getRemoteAuthIssuer().slice(0, -"/auth/v1".length);
  }

  return normalizeDataUrl(
    requireNonEmpty(process.env.DATA_SUPABASE_URL, "DATA_SUPABASE_URL"),
    process.env.NODE_ENV === "production",
  );
}

export function getLocalShadowDataSupabaseEnv() {
  if (getDataAuthority() !== "local-shadow") {
    throw new Error(
      "local shadow Data target은 local-shadow 모드에서만 사용할 수 있어요.",
    );
  }

  return {
    url: normalizeDataUrl(
      requireNonEmpty(process.env.DATA_SUPABASE_URL, "DATA_SUPABASE_URL"),
      process.env.NODE_ENV === "production",
    ),
    publishableKey: requireNonEmpty(
      process.env.DATA_SUPABASE_PUBLISHABLE_KEY,
      "DATA_SUPABASE_PUBLISHABLE_KEY",
    ),
  };
}

export function getDataSupabaseSecretKey() {
  const explicit = getLocalDataSupabaseSecretKey();
  if (explicit) {
    return explicit;
  }

  const authority = getDataAuthority();
  if (authority === "remote" || authority === "local-shadow") {
    return getAuthSupabaseSecretKey();
  }

  return null;
}

export function getLocalDataSupabaseSecretKey() {
  return process.env.DATA_SUPABASE_SECRET_KEY?.trim() || null;
}
