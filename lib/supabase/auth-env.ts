const AUTH_URL_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_URL";
const AUTH_KEY_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY";
const LOCAL_INTERNAL_URL_ENV = "LOCAL_SUPABASE_INTERNAL_URL";
const STAGE4_CAPTURE_MODE_ENV = "HOMECOOK_STAGE4_CAPTURE_MODE";
const STAGE4_RESERVED_ISSUER = "https://auth.stage4.homecook.invalid/auth/v1";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const HOSTED_SUPABASE_SUFFIXES = [".supabase.co", ".supabase.in"];
const RAW_TRAILING_DOT_PATTERN = /(?:\.|%2e|\u3002|%e3%80%82|\uff0e|%ef%bc%8e|\uff61|%ef%bd%a1)$/iu;
const RAW_NONCANONICAL_DOT_PATTERN = /(?:%2e|\u3002|%e3%80%82|\uff0e|%ef%bc%8e|\uff61|%ef%bd%a1)/iu;

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

function requireRawNonEmpty(value: string | undefined, name: string) {
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} 환경 변수가 필요해요.`);
  }

  return value;
}

function isLoopbackHostname(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname);
}

function isHostedSupabaseHostname(hostname: string) {
  return HOSTED_SUPABASE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function rejectRawTrailingDotHostname(value: string, name: string) {
  const schemeEnd = value.indexOf("://");
  if (schemeEnd < 0) {
    return;
  }

  const authorityAndRest = value.slice(schemeEnd + 3);
  const authorityEnd = authorityAndRest.search(/[/?#]/u);
  const authority = authorityEnd < 0
    ? authorityAndRest
    : authorityAndRest.slice(0, authorityEnd);
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  const closingBracket = hostAndPort.startsWith("[")
    ? hostAndPort.indexOf("]")
    : -1;
  const rawHostname = closingBracket >= 0
    ? hostAndPort.slice(0, closingBracket + 1)
    : hostAndPort.split(":", 1)[0];
  if (RAW_TRAILING_DOT_PATTERN.test(rawHostname)) {
    throw new Error(`${name} hostname에는 trailing dot을 사용할 수 없어요.`);
  }
  if (RAW_NONCANONICAL_DOT_PATTERN.test(rawHostname)) {
    throw new Error(`${name} hostname에는 literal dot만 사용할 수 있어요.`);
  }
}

function parseUrl(value: string, name: string) {
  if (/[\u0000-\u0020\u007f]/u.test(value)) {
    throw new Error(`${name} 값에 ASCII control 또는 whitespace를 넣을 수 없어요.`);
  }
  if (!/^(?:http|https):\/\/[^/\\]/u.test(value)) {
    throw new Error(`${name} 값은 exact lowercase http:// or https:// prefix가 필요해요.`);
  }
  rejectRawTrailingDotHostname(value, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} 값은 유효한 URL이어야 해요.`);
  }

  if (parsed.hostname.endsWith(".")) {
    throw new Error(`${name} hostname에는 trailing dot을 사용할 수 없어요.`);
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

function parsePathUrl(value: string, name: string) {
  if (/[\u0000-\u0020\u007f]/u.test(value)) {
    throw new Error(`${name} 값에 ASCII control 또는 whitespace를 넣을 수 없어요.`);
  }
  if (!/^(?:http|https):\/\/[^/\\]/u.test(value)) {
    throw new Error(`${name} 값은 exact lowercase http:// or https:// prefix가 필요해요.`);
  }
  rejectRawTrailingDotHostname(value, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} 값은 유효한 URL이어야 해요.`);
  }
  if (parsed.hostname.endsWith(".")) {
    throw new Error(`${name} hostname에는 trailing dot을 사용할 수 없어요.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} 값에 인증정보나 query를 넣을 수 없어요.`);
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

function normalizeIssuerUrl(value: string, name: string) {
  const parsed = parsePathUrl(value, name);
  if (isHostedSupabaseHostname(parsed.hostname)) {
    throw new Error(`${name}는 Supabase Cloud hosted URL을 사용할 수 없어요.`);
  }
  if (parsed.pathname !== "/auth/v1") {
    throw new Error(`${name}는 exact /auth/v1 issuer URL이어야 해요.`);
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${name}의 HTTP issuer는 loopback이어야 해요.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name}는 loopback HTTP 또는 self-hosted HTTPS issuer여야 해요.`);
  }
  return parsed.toString();
}

function normalizeJwksUrl(value: string, name: string) {
  const parsed = parsePathUrl(value, name);
  if (isHostedSupabaseHostname(parsed.hostname)) {
    throw new Error(`${name}는 Supabase Cloud hosted URL을 사용할 수 없어요.`);
  }
  if (parsed.pathname !== "/auth/v1/.well-known/jwks.json") {
    throw new Error(`${name}는 exact JWKS URL이어야 해요.`);
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${name}의 HTTP JWKS URL은 loopback이어야 해요.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name}는 loopback HTTP 또는 self-hosted HTTPS JWKS URL이어야 해요.`);
  }
  return parsed.toString();
}

function isStage4ReservedIssuerOverride({
  configuredIssuer,
  configuredJwksUrl,
  publicAuthOrigin,
}: {
  configuredIssuer: string;
  configuredJwksUrl: string | null;
  publicAuthOrigin: string;
}) {
  if (process.env[STAGE4_CAPTURE_MODE_ENV]?.trim() !== "1") {
    return false;
  }
  if (configuredIssuer !== STAGE4_RESERVED_ISSUER || configuredJwksUrl === null) {
    return false;
  }
  const normalizedJwksUrl = normalizeJwksUrl(
    configuredJwksUrl,
    "AUTH_SUPABASE_JWKS_URL",
  );
  return normalizedJwksUrl === `${publicAuthOrigin}/auth/v1/.well-known/jwks.json`;
}

export interface AuthSupabaseEnv {
  url: string;
  publishableKey: string;
  issuer: string;
  jwksUrl: string;
}

export function getAuthIssuer() {
  const url = normalizeLocalPublicAuthUrl(requireRawNonEmpty(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL,
    AUTH_URL_ENV,
  ));
  const derivedIssuer = `${url}/auth/v1`;
  const configuredIssuerRaw = process.env.AUTH_SUPABASE_EXPECTED_ISSUER?.trim();
  const configuredIssuer = configuredIssuerRaw
    ? normalizeIssuerUrl(configuredIssuerRaw, "AUTH_SUPABASE_EXPECTED_ISSUER")
    : derivedIssuer;
  if (
    configuredIssuer !== derivedIssuer
    && !isStage4ReservedIssuerOverride({
      configuredIssuer,
      configuredJwksUrl: process.env.AUTH_SUPABASE_JWKS_URL?.trim() || null,
      publicAuthOrigin: url,
    })
  ) {
    throw new Error(
      "AUTH_SUPABASE_EXPECTED_ISSUER는 local Auth issuer와 exact 일치해야 해요.",
    );
  }
  return configuredIssuer;
}

export function getAuthSupabaseEnv(): AuthSupabaseEnv {
  const issuer = getAuthIssuer();
  const url = normalizeLocalPublicAuthUrl(requireRawNonEmpty(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL,
    AUTH_URL_ENV,
  ));
  const publishableKey = requireNonEmpty(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY,
    AUTH_KEY_ENV,
  );
  const derivedJwksUrl = `${issuer}/.well-known/jwks.json`;
  const configuredJwksRaw = process.env.AUTH_SUPABASE_JWKS_URL?.trim();
  const configuredJwksUrl = configuredJwksRaw
    ? normalizeJwksUrl(configuredJwksRaw, "AUTH_SUPABASE_JWKS_URL")
    : derivedJwksUrl;
  if (
    configuredJwksUrl !== derivedJwksUrl
    && !isStage4ReservedIssuerOverride({
      configuredIssuer: issuer,
      configuredJwksUrl,
      publicAuthOrigin: url,
    })
  ) {
    throw new Error(
      "AUTH_SUPABASE_JWKS_URL은 local Auth JWKS URL과 exact 일치해야 해요.",
    );
  }

  return { url, publishableKey, issuer, jwksUrl: configuredJwksUrl };
}

export function getAuthSupabaseServerEnv(): AuthSupabaseEnv {
  getAuthAuthority();
  const publicEnv = getAuthSupabaseEnv();
  return {
    ...publicEnv,
    url: normalizeLoopbackAuthUrl(requireRawNonEmpty(
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
