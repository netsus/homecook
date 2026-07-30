const REMOTE_AUTH_URL_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_URL";
const REMOTE_AUTH_KEY_ENV = "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY";
const LEGACY_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const LEGACY_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function requireNonEmpty(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} 환경 변수가 필요해요.`);
  }

  return normalized;
}

function normalizeRemoteAuthUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${REMOTE_AUTH_URL_ENV} 값은 유효한 HTTPS URL이어야 해요.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${REMOTE_AUTH_URL_ENV} 값은 HTTPS URL이어야 해요.`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${REMOTE_AUTH_URL_ENV} 값에 인증정보나 query를 넣을 수 없어요.`);
  }

  return parsed.origin;
}

export interface AuthSupabaseEnv {
  url: string;
  publishableKey: string;
  issuer: string;
  jwksUrl: string;
}

export function getRemoteAuthIssuer() {
  const explicitUrl = process.env[REMOTE_AUTH_URL_ENV]?.trim();
  const authority = process.env.HOMECOOK_DATA_AUTHORITY?.trim() || "remote";
  if (authority !== "remote" && !explicitUrl) {
    throw new Error(
      `${REMOTE_AUTH_URL_ENV}를 local 전환에서 명시해야 해요.`,
    );
  }

  const url = normalizeRemoteAuthUrl(requireNonEmpty(
    explicitUrl || process.env[LEGACY_URL_ENV],
    explicitUrl ? REMOTE_AUTH_URL_ENV : LEGACY_URL_ENV,
  ));
  const derivedIssuer = `${url}/auth/v1`;
  const configuredIssuer
    = process.env.AUTH_SUPABASE_EXPECTED_ISSUER?.trim() || derivedIssuer;
  if (configuredIssuer !== derivedIssuer) {
    throw new Error(
      "AUTH_SUPABASE_EXPECTED_ISSUER는 remote Auth issuer와 exact 일치해야 해요.",
    );
  }

  return derivedIssuer;
}

export function getAuthSupabaseEnv(): AuthSupabaseEnv {
  const explicitUrl = process.env[REMOTE_AUTH_URL_ENV]?.trim();
  const explicitKey = process.env[REMOTE_AUTH_KEY_ENV]?.trim();
  const authority = process.env.HOMECOOK_DATA_AUTHORITY?.trim() || "remote";
  if (authority !== "remote" && (!explicitUrl || !explicitKey)) {
    throw new Error(
      `${REMOTE_AUTH_URL_ENV}와 ${REMOTE_AUTH_KEY_ENV}를 local 전환에서 명시해야 해요.`,
    );
  }

  const issuer = getRemoteAuthIssuer();
  const url = issuer.slice(0, -"/auth/v1".length);
  const publishableKey = requireNonEmpty(
    explicitKey || process.env[LEGACY_KEY_ENV],
    explicitKey ? REMOTE_AUTH_KEY_ENV : LEGACY_KEY_ENV,
  );
  const derivedJwksUrl = `${issuer}/.well-known/jwks.json`;
  const configuredJwksUrl
    = process.env.AUTH_SUPABASE_JWKS_URL?.trim() || derivedJwksUrl;
  if (configuredJwksUrl !== derivedJwksUrl) {
    throw new Error(
      "AUTH_SUPABASE_JWKS_URL은 remote Auth JWKS URL과 exact 일치해야 해요.",
    );
  }

  return {
    url,
    publishableKey,
    issuer,
    jwksUrl: derivedJwksUrl,
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
  const explicit = process.env.AUTH_SUPABASE_SECRET_KEY?.trim();
  if (explicit) {
    return explicit;
  }

  return getDataAuthorityForLegacySecret() === "remote"
    ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
    : null;
}

function getDataAuthorityForLegacySecret() {
  return process.env.HOMECOOK_DATA_AUTHORITY?.trim() || "remote";
}
