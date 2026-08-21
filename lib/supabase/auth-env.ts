const AUTH_URL_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_URL";
const AUTH_KEY_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY";
const LOCAL_INTERNAL_URL_ENV = "LOCAL_SUPABASE_INTERNAL_URL";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const HOSTED_SUPABASE_SUFFIXES = [".supabase.co", ".supabase.in"];

export type AuthAuthority = "local";

export function getAuthAuthority(): AuthAuthority {
  const authority = process.env.HOMECOOK_AUTH_AUTHORITY?.trim();
  if (authority !== "local") {
    throw new Error(
      "HOMECOOK_AUTH_AUTHORITY는 local-only 계약에 따라 local이어야 해요.",
    );
  }
  return authority;
}

function requireNonEmpty(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} 환경 변수가 필요해요.`);
  }

  return normalized;
}

function isLoopbackHostname(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname);
}

function isHostedSupabaseHostname(hostname: string) {
  return HOSTED_SUPABASE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function parseUrl(value: string, name: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} 값은 유효한 URL이어야 해요.`);
  }

  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== "/"
  ) {
    throw new Error(`${name} 값에 path, 인증정보나 query를 넣을 수 없어요.`);
  }
  return parsed;
}

function normalizeLocalPublicAuthUrl(value: string) {
  const parsed = parseUrl(value, AUTH_URL_ENV);
  if (isHostedSupabaseHostname(parsed.hostname)) {
    throw new Error(`${AUTH_URL_ENV}는 Supabase Cloud hosted URL을 사용할 수 없어요.`);
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${AUTH_URL_ENV}의 HTTP origin은 loopback이어야 해요.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${AUTH_URL_ENV}는 loopback HTTP 또는 self-hosted HTTPS URL이어야 해요.`);
  }
  return parsed.origin;
}

function normalizeLoopbackAuthUrl(value: string) {
  const parsed = parseUrl(value, LOCAL_INTERNAL_URL_ENV);
  if (
    !isLoopbackHostname(parsed.hostname)
    || !["http:", "https:"].includes(parsed.protocol)
  ) {
    throw new Error(`${LOCAL_INTERNAL_URL_ENV} 값은 인증정보가 없는 loopback URL이어야 해요.`);
  }
  return parsed.origin;
}

export interface AuthSupabaseEnv {
  url: string;
  publishableKey: string;
  issuer: string;
  jwksUrl: string;
}

export function getAuthIssuer() {
  const url = normalizeLocalPublicAuthUrl(requireNonEmpty(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL,
    AUTH_URL_ENV,
  ));
  const derivedIssuer = `${url}/auth/v1`;
  const configuredIssuer
    = process.env.AUTH_SUPABASE_EXPECTED_ISSUER?.trim() || derivedIssuer;
  if (configuredIssuer !== derivedIssuer) {
    throw new Error(
      "AUTH_SUPABASE_EXPECTED_ISSUER는 local Auth issuer와 exact 일치해야 해요.",
    );
  }
  return derivedIssuer;
}

export function getAuthSupabaseEnv(): AuthSupabaseEnv {
  const issuer = getAuthIssuer();
  const url = issuer.slice(0, -"/auth/v1".length);
  const publishableKey = requireNonEmpty(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY,
    AUTH_KEY_ENV,
  );
  const derivedJwksUrl = `${issuer}/.well-known/jwks.json`;
  const configuredJwksUrl
    = process.env.AUTH_SUPABASE_JWKS_URL?.trim() || derivedJwksUrl;
  if (configuredJwksUrl !== derivedJwksUrl) {
    throw new Error(
      "AUTH_SUPABASE_JWKS_URL은 local Auth JWKS URL과 exact 일치해야 해요.",
    );
  }

  return { url, publishableKey, issuer, jwksUrl: derivedJwksUrl };
}

export function getAuthSupabaseServerEnv(): AuthSupabaseEnv {
  getAuthAuthority();
  const publicEnv = getAuthSupabaseEnv();
  return {
    ...publicEnv,
    url: normalizeLoopbackAuthUrl(requireNonEmpty(
      process.env[LOCAL_INTERNAL_URL_ENV],
      LOCAL_INTERNAL_URL_ENV,
    )),
  };
}

export function hasAuthSupabasePublicEnv() {
  try {
    getAuthSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}

export function getAuthSupabaseSecretKey() {
  getAuthAuthority();
  return process.env.LOCAL_SUPABASE_SECRET_KEY?.trim() || null;
}
