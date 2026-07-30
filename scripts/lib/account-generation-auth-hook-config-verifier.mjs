import path from "node:path";

export const ACCOUNT_GENERATION_AUTH_HOOK_CONFIG_URL_BASE =
  "https://api.supabase.com";
export const ACCOUNT_GENERATION_EXPECTED_BEFORE_USER_CREATED_HOOK_URI =
  "pg-functions://postgres/account_generation_auth_hook/before_user_created";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const KEYCHAIN_SECRET_PATTERN = /^([A-Za-z0-9._-]+):([A-Za-z0-9_-]+={0,2})$/u;

/**
 * @typedef {Record<string, string | undefined>} LooseEnvironment
 * @typedef {(filePath: string, encoding: string) => string} ReadTextFile
 * @typedef {() => string} ReadKeychainSecret
 * @typedef {{ status: number, json: () => Promise<unknown> }} MinimalFetchResponse
 * @typedef {(url: string, init: RequestInit) => Promise<MinimalFetchResponse>} MinimalFetch
 */

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0
    ? normalized
    : `${normalized}${"=".repeat(4 - remainder)}`;
  return Buffer.from(padded, "base64").toString("utf8");
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function isSafeToken(value) {
  return typeof value === "string"
    && value !== ""
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function readTextFile(readFile, filePath) {
  const content = readFile(filePath, "utf8");
  return typeof content === "string" ? content : String(content);
}

export function parseSupabaseCliAccessTokenKeychainSecret(secret) {
  const match = String(secret ?? "").match(KEYCHAIN_SECRET_PATTERN);
  if (!match) {
    throw new Error("Supabase CLI keychain secret is malformed");
  }
  if (/=.+/u.test(match[2].replace(/={0,2}$/u, ""))) {
    throw new Error("Supabase CLI keychain secret is malformed");
  }

  try {
    const token = decodeBase64Url(match[2]);
    if (!isSafeToken(token)) {
      throw new Error("invalid token");
    }
    const canonicalEncoded = encodeBase64Url(token);
    const normalizedInput = match[2].replace(/=+$/u, "");
    if (canonicalEncoded !== normalizedInput) {
      throw new Error("non-canonical encoding");
    }
    return token;
  } catch {
    throw new Error("Supabase CLI keychain secret is malformed");
  }
}

/**
 * @param {{ cwd: string, readFile: ReadTextFile }} options
 */
export function resolveAccountGenerationProjectRef({
  cwd,
  readFile,
}) {
  const projectRef = readTextFile(
    readFile,
    path.join(cwd, "supabase/.temp/project-ref"),
  ).trim();

  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error("Supabase project ref is invalid");
  }

  return projectRef;
}

/**
 * @param {{ env: LooseEnvironment, platform: string, readKeychainSecret: ReadKeychainSecret }} options
 */
export function resolveSupabaseManagementAccessToken({
  env,
  platform,
  readKeychainSecret,
}) {
  const envToken = env.SUPABASE_ACCESS_TOKEN;
  if (isSafeToken(envToken)) return envToken;

  if (platform === "darwin") {
    const keychainSecret = readKeychainSecret();
    return parseSupabaseCliAccessTokenKeychainSecret(keychainSecret);
  }

  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

/**
 * @param {{ projectRef: string, accessToken: string, timeoutMs?: number }} options
 */
export function buildAccountGenerationAuthHookConfigRequest({
  projectRef,
  accessToken,
  timeoutMs = 15_000,
}) {
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error("Supabase project ref is invalid");
  }
  ensureNonEmptyString(accessToken, "Supabase access token");

  return {
    url: `${ACCOUNT_GENERATION_AUTH_HOOK_CONFIG_URL_BASE}/v1/projects/${projectRef}/config/auth`,
    init: {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  };
}

/**
 * @param {unknown} payload
 */
export function assertAccountGenerationAuthHookConfigPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Supabase auth config payload is malformed");
  }

  if (typeof payload.hook_before_user_created_enabled !== "boolean") {
    throw new Error("Supabase auth config payload is malformed");
  }

  if (!payload.hook_before_user_created_enabled) {
    if (
      payload.hook_before_user_created_uri !== null
      && typeof payload.hook_before_user_created_uri !== "string"
    ) {
      throw new Error("Supabase auth config payload is malformed");
    }
    throw new Error("Before User Created Hook is disabled");
  }

  if (typeof payload.hook_before_user_created_uri !== "string") {
    throw new Error("Supabase auth config payload is malformed");
  }

  if (
    payload.hook_before_user_created_uri
      !== ACCOUNT_GENERATION_EXPECTED_BEFORE_USER_CREATED_HOOK_URI
  ) {
    throw new Error(
      "Before User Created Hook URI does not match the expected Postgres function",
    );
  }
}

/**
 * @param {{
 *   projectRef: string,
 *   accessToken: string,
 *   fetchImpl: MinimalFetch,
 *   timeoutMs?: number,
 * }} options
 */
export async function verifyAccountGenerationAuthHookConfig({
  projectRef,
  accessToken,
  fetchImpl,
  timeoutMs = 15_000,
}) {
  const request = buildAccountGenerationAuthHookConfigRequest({
    projectRef,
    accessToken,
    timeoutMs,
  });

  let response;
  try {
    response = await fetchImpl(request.url, request.init);
  } catch {
    throw new Error("Supabase auth config request failed");
  }

  if (!response || response.status !== 200) {
    throw new Error("Supabase auth config request failed");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Supabase auth config payload is malformed");
  }

  assertAccountGenerationAuthHookConfigPayload(payload);

  return {
    ok: true,
    readOnly: true,
    remoteWrites: 0,
    authHookConfigured: true,
    beforeUserCreatedHook: {
      enabled: true,
      uriMatchesExpected: true,
    },
  };
}
