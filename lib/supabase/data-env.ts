export type DataAuthority = "local";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function requireNonEmpty(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} 환경 변수가 필요해요.`);
  }

  return normalized;
}

function normalizeLocalDataUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATA_SUPABASE_URL 값은 유효한 URL이어야 해요.");
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error("local Data/Storage URL은 loopback 주소여야 해요.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== "/"
  ) {
    throw new Error(
      "DATA_SUPABASE_URL 값은 path, 인증정보나 query가 없는 loopback URL이어야 해요.",
    );
  }
  return parsed.origin;
}

export function getDataAuthority(): DataAuthority {
  const authority = process.env.HOMECOOK_DATA_AUTHORITY?.trim();
  if (authority !== "local") {
    throw new Error(
      "HOMECOOK_DATA_AUTHORITY는 local-only 계약에 따라 local이어야 해요.",
    );
  }
  return authority;
}

export function getDataSupabaseEnv(): {
  authority: DataAuthority;
  url: string;
  publishableKey: string;
} {
  const authority = getDataAuthority();
  const url = normalizeLocalDataUrl(
    requireNonEmpty(process.env.DATA_SUPABASE_URL, "DATA_SUPABASE_URL"),
  );
  const publishableKey = requireNonEmpty(
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY,
    "DATA_SUPABASE_PUBLISHABLE_KEY",
  );
  return { authority, url, publishableKey };
}

export function getLocalShadowDataSupabaseEnv(): never {
  throw new Error("local-shadow Data authority는 local-only 계약에서 금지돼요.");
}

export function getDataSupabaseSecretKey() {
  getDataAuthority();
  return getLocalDataSupabaseSecretKey();
}

export function getLocalDataSupabaseSecretKey() {
  return process.env.DATA_SUPABASE_SECRET_KEY?.trim() || null;
}
