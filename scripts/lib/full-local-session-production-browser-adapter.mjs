import { createBrowserClient } from "@supabase/ssr";

const DEFAULT_APP_ORIGIN = "https://app.mumeok.kr";
const DEFAULT_AUTH_ORIGIN = "https://auth.mumeok.kr";
const DEFAULT_LOGIN_URL = `${DEFAULT_APP_ORIGIN}/login?next=%2Fplanner`;
const DEFAULT_PLANNER_PAGE_URL = `${DEFAULT_APP_ORIGIN}/planner`;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_YOUTUBE_URL = "https://www.youtube.com/shorts/f0E0p1R26Vk";
const T65_WAIT_MS = 65 * 60 * 1_000;
const PUBLIC_API_KEY_CAPTURE_TIMEOUT_MS = 250;

const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const AUTH_BLOCK_STATUSES = new Set([401, 403]);
const AUTH_BLOCK_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const PRODUCTION_BROWSER_MANUAL_ACTION = [
  "Open the headed ephemeral browser at https://app.mumeok.kr/login?next=%2Fplanner.",
  "Operator clicks one existing social login button on the app.mumeok.kr UI and completes the provider flow manually.",
  "Success is accepted only after the browser returns through /auth/callback and lands on /planner.",
].join(" ");

function fail(message) {
  throw new Error(message);
}

function ensureDate(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail("Production browser canary clock is invalid.");
  }
  return value;
}

function ensureFetchImpl(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    fail("Production browser canary fetch implementation is unavailable.");
  }
  return fetchImpl;
}

function normalizeAppUrl(pathOrUrl, appOrigin = DEFAULT_APP_ORIGIN) {
  const url = new URL(pathOrUrl, appOrigin);
  if (url.origin !== appOrigin) {
    fail("Production browser canary may call only app.mumeok.kr routes.");
  }
  return url;
}

function normalizeAuthUrl(pathOrUrl, authOrigin = DEFAULT_AUTH_ORIGIN) {
  const url = new URL(pathOrUrl, authOrigin);
  if (url.origin !== authOrigin) {
    fail("Production browser canary auth origin must stay on auth.mumeok.kr.");
  }
  return url;
}

function ensureExactAuthOrigin(authOrigin) {
  if (authOrigin !== DEFAULT_AUTH_ORIGIN) {
    fail("Production browser canary auth origin must exactly equal https://auth.mumeok.kr.");
  }
  return authOrigin;
}

function createOpaqueHandle(prefix, counter) {
  return Object.freeze({
    id: `${prefix}-${counter}`,
    kind: prefix === "browser-session" ? "browser-session" : "planner-cleanup",
  });
}

function readHeaderCaseInsensitive(headers, name) {
  if (headers === null || typeof headers !== "object") return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function readRequestUrl(request) {
  if (request && typeof request.url === "function") return request.url();
  if (request && typeof request.url === "string") return request.url;
  return "";
}

function readRequestHeaders(request) {
  if (request && typeof request.allHeaders === "function") {
    return request.allHeaders();
  }
  if (request && typeof request.headers === "function") {
    return request.headers();
  }
  if (request && request.headers && typeof request.headers === "object") {
    return request.headers;
  }
  return {};
}

function cookieIdentity(cookie) {
  return `${cookie.domain ?? ""}|${cookie.path ?? "/"}|${cookie.name}`;
}

function normalizeCookieShadowEntry(cookie, appOrigin) {
  if (!cookie || typeof cookie.name !== "string" || typeof cookie.value !== "string") return null;
  const appUrl = new URL(appOrigin);
  return {
    domain: typeof cookie.domain === "string" && cookie.domain.length > 0
      ? cookie.domain.replace(/^\./u, "")
      : appUrl.hostname,
    expires: typeof cookie.expires === "number" ? cookie.expires : -1,
    httpOnly: cookie.httpOnly === true,
    name: cookie.name,
    path: typeof cookie.path === "string" && cookie.path.length > 0 ? cookie.path : "/",
    sameSite: typeof cookie.sameSite === "string" ? cookie.sameSite : undefined,
    secure: cookie.secure !== false,
    value: cookie.value,
  };
}

function mapSameSite(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  return "Lax";
}

function cookieHeaderFromShadow(cookies, appOrigin) {
  const host = new URL(appOrigin).hostname;
  const values = cookies
    .filter((cookie) => cookie.domain === host && typeof cookie.value === "string" && cookie.value.length > 0)
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  if (values.length === 0) {
    fail("Production browser canary could not capture an authenticated cookie snapshot.");
  }
  return values.join("; ");
}

async function defaultLaunchBrowser() {
  const playwright = await import("@playwright/test");
  return playwright.chromium.launch({ headless: false });
}

async function defaultWaitForManualLogin({
  page,
  plannerPageUrl = DEFAULT_PLANNER_PAGE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (page.url() === plannerPageUrl) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("Production browser canary manual login timed out.");
}

async function defaultWaitForDuration(durationMs) {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

function assertPlannerLanding(currentUrl, plannerPageUrl) {
  const expected = normalizeAppUrl(plannerPageUrl);
  const actual = normalizeAppUrl(currentUrl);
  if (actual.href !== expected.href) {
    fail("Production browser canary must return to the exact app.mumeok.kr planner page.");
  }
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isSuccessPayload(payload) {
  return Boolean(payload && payload.success === true);
}

function isBlockedResponse(response, payload) {
  const code = payload?.error?.code;
  if (AUTH_BLOCK_STATUSES.has(response.status)) return true;
  if (response.status === 409 && code === "ACCOUNT_SESSION_STALE") return true;
  return typeof code === "string" && AUTH_BLOCK_CODES.has(code);
}

function currentKstDate(now) {
  return new Date(ensureDate(now).getTime() + (9 * 60 * 60 * 1_000))
    .toISOString()
    .slice(0, 10);
}

function expiresAtToIso(expiresAtSeconds) {
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
    fail("Production browser canary session expiry is unavailable.");
  }
  return new Date(expiresAtSeconds * 1_000).toISOString();
}

export function validateConfiguredPublicAnonKey(value) {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    fail("Production browser canary public auth API key is invalid.");
  }
  if (value !== value.trim() || /[\u0000-\u001F\u007F\s]/u.test(value)) {
    fail("Production browser canary public auth API key is invalid.");
  }
  const normalized = value;
  if (/^sb_secret_/u.test(normalized)) {
    fail("Production browser canary public auth API key is invalid.");
  }
  if (/^sb_publishable_[A-Za-z0-9_-]{16,200}$/u.test(normalized)) {
    return normalized;
  }
  if (/^sb_/u.test(normalized)) {
    fail("Production browser canary public auth API key is invalid.");
  }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(normalized) && normalized.length >= 40) {
    return normalized;
  }
  fail("Production browser canary public auth API key is invalid.");
}

/**
 * The canary reports observed browser auth evidence, not privileged DB binding timestamps.
 *
 * @param {{
 *   appOrigin?: string;
 *   authOrigin?: string;
 *   createBrowserClientImpl?: typeof createBrowserClient;
 *   configuredPublicAnonKey?: string;
 *   fetchImpl?: typeof globalThis.fetch;
 *   launchBrowser?: (launchOptions: { headless: boolean }) => Promise<unknown>;
  *   loginUrl?: string;
  *   now?: () => Date;
  *   phase?: string;
 *   mealsPath?: string;
  *   plannerPageUrl?: string;
  *   plannerPath?: string;
  *   timeoutMs?: number;
  *   waitForDuration?: (durationMs: number) => Promise<void>;
  *   waitForManualLogin?: (input: {
 *     appOrigin: string;
 *     loginUrl: string;
 *     page: { url: () => string };
 *     plannerPageUrl: string;
 *     timeoutMs: number;
 *   }) => Promise<unknown>;
 *   youtubeExtractPath?: string;
 *   logoutPath?: string;
 *   pantryPath?: string;
 *   recipesPath?: string;
 * }} [options]
 */
export async function createProductionBrowserCanaryAdapter({
  appOrigin = DEFAULT_APP_ORIGIN,
  authOrigin = DEFAULT_AUTH_ORIGIN,
  createBrowserClientImpl = createBrowserClient,
  configuredPublicAnonKey,
  fetchImpl = globalThis.fetch,
  launchBrowser = defaultLaunchBrowser,
  loginUrl = DEFAULT_LOGIN_URL,
  now = () => new Date(),
  phase = "milestone-a-t65",
  mealsPath = "/api/v1/meals",
  plannerPageUrl = DEFAULT_PLANNER_PAGE_URL,
  plannerPath = "/api/v1/planner",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  waitForDuration = defaultWaitForDuration,
  waitForManualLogin = defaultWaitForManualLogin,
  youtubeExtractPath = "/api/v1/recipes/youtube/extract",
  logoutPath = "/api/v1/auth/logout",
  pantryPath = "/api/v1/pantry",
  recipesPath = "/api/v1/recipes?limit=1",
} = {}) {
  const safeFetch = ensureFetchImpl(fetchImpl);
  ensureExactAuthOrigin(authOrigin);
  normalizeAuthUrl(authOrigin, DEFAULT_AUTH_ORIGIN);
  const validatedConfiguredPublicAnonKey = validateConfiguredPublicAnonKey(configuredPublicAnonKey);

  const state = {
    authRequestListener: null,
    browser: null,
    cleanupCounter: 0,
    cleanupSecrets: new Map(),
    context: null,
    cookieShadow: [],
    freshLoginCompletedAtObserved: null,
    page: null,
    pendingAuthCaptureTasks: new Set(),
    plannerWriteTarget: null,
    publicApiKey: null,
    sessionCounter: 0,
    sessionSecrets: new Map(),
  };

  function createCookieBridge() {
    async function syncFromContext() {
      if (!state.context || typeof state.context.cookies !== "function") {
        fail("Production browser canary cookie reader is unavailable.");
      }
      let cookies;
      try {
        cookies = await state.context.cookies([appOrigin, authOrigin]);
      } catch {
        cookies = await state.context.cookies();
      }
      state.cookieShadow = cookies
        .map((cookie) => normalizeCookieShadowEntry(cookie, appOrigin))
        .filter(Boolean);
    }

    async function getAll() {
      await syncFromContext();
      return state.cookieShadow.map(({ name, value }) => ({ name, value }));
    }

    async function setAll(setCookies) {
      if (!state.context || typeof state.context.addCookies !== "function") {
        fail("Production browser canary cookie writer is unavailable.");
      }
      const nextShadow = [...state.cookieShadow];
      const playwrightCookies = [];
      for (const cookie of setCookies) {
        const path = cookie.options?.path ?? "/";
        const domain = cookie.options?.domain
          ? cookie.options.domain.replace(/^\./u, "")
          : new URL(appOrigin).hostname;
        const shadowEntry = {
          domain,
          expires: cookie.options?.maxAge === 0
            ? 1
            : typeof cookie.options?.maxAge === "number"
              ? Math.floor(Date.now() / 1_000) + cookie.options.maxAge
              : -1,
          httpOnly: cookie.options?.httpOnly === true,
          name: cookie.name,
          path,
          sameSite: mapSameSite(cookie.options?.sameSite),
          secure: cookie.options?.secure !== false,
          value: cookie.value,
        };
        const existingIndex = nextShadow.findIndex((entry) => cookieIdentity(entry) === cookieIdentity(shadowEntry));
        if (existingIndex >= 0) nextShadow.splice(existingIndex, 1);
        if (cookie.value) nextShadow.push(shadowEntry);
        playwrightCookies.push(
          cookie.options?.domain
            ? {
              domain,
              expires: shadowEntry.expires,
              httpOnly: shadowEntry.httpOnly,
              name: cookie.name,
              path,
              sameSite: shadowEntry.sameSite,
              secure: shadowEntry.secure,
              value: cookie.value,
            }
            : {
              expires: shadowEntry.expires,
              httpOnly: shadowEntry.httpOnly,
              name: cookie.name,
              sameSite: shadowEntry.sameSite,
              secure: shadowEntry.secure,
              url: appOrigin,
              value: cookie.value,
            },
        );
      }
      state.cookieShadow = nextShadow;
      await state.context.addCookies(playwrightCookies);
    }

    async function readCookieHeader() {
      await syncFromContext();
      return cookieHeaderFromShadow(state.cookieShadow, appOrigin);
    }

    return { getAll, readCookieHeader, syncFromContext, setAll };
  }

  function installPublicApiKeyCapture() {
    if (!state.context || typeof state.context.on !== "function") {
      fail("Production browser canary auth request observer is unavailable.");
    }
    const listener = (request) => {
      let captureTask;
      captureTask = Promise.resolve(readRequestUrl(request)).then(async (requestUrl) => {
        if (typeof requestUrl !== "string") return;
        let parsedUrl;
        try {
          parsedUrl = new URL(requestUrl);
        } catch {
          return;
        }
        if (parsedUrl.origin !== DEFAULT_AUTH_ORIGIN) return;
        if (!parsedUrl.pathname.startsWith("/auth/v1/")) return;
        const headers = await Promise.resolve(readRequestHeaders(request));
        const apiKey = readHeaderCaseInsensitive(headers, "apikey");
        if (typeof apiKey === "string" && apiKey.length > 0 && state.publicApiKey === null) {
          state.publicApiKey = apiKey;
        }
      }).catch(() => undefined).finally(() => {
        state.pendingAuthCaptureTasks.delete(captureTask);
      });
      state.pendingAuthCaptureTasks.add(captureTask);
    };
    state.authRequestListener = listener;
    state.context.on("request", listener);
  }

  async function waitForPublicApiKeyCapture() {
    const deadline = Date.now() + PUBLIC_API_KEY_CAPTURE_TIMEOUT_MS;
    while (typeof state.publicApiKey !== "string" || state.publicApiKey.length === 0) {
      if (state.pendingAuthCaptureTasks.size > 0) {
        await Promise.race([...state.pendingAuthCaptureTasks]);
        continue;
      }
      if (validatedConfiguredPublicAnonKey) {
        break;
      } else if (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      } else {
        break;
      }
    }
    if (typeof state.publicApiKey === "string"
      && validatedConfiguredPublicAnonKey
      && state.publicApiKey !== validatedConfiguredPublicAnonKey) {
      fail("Production browser canary public auth API key mismatch.");
    }
    if (typeof state.publicApiKey === "string" && state.publicApiKey.length > 0) {
      return state.publicApiKey;
    }
    if (validatedConfiguredPublicAnonKey) {
      return validatedConfiguredPublicAnonKey;
    }
    if (typeof state.publicApiKey !== "string" || state.publicApiKey.length === 0) {
      fail("Production browser canary public auth API key capture is unavailable.");
    }
    return state.publicApiKey;
  }

  async function createSupabaseTools() {
    const effectivePublicAnonKey = await waitForPublicApiKeyCapture();
    const cookies = createCookieBridge();
    const client = createBrowserClientImpl(authOrigin, effectivePublicAnonKey, {
      cookies: {
        getAll: cookies.getAll,
        setAll: cookies.setAll,
      },
      isSingleton: false,
    });
    return { client, cookies };
  }

  async function readObservedSessionEvidence(client) {
    const result = await client.auth.getSession();
    const session = result?.data?.session;
    if (!session || typeof session.expires_at !== "number") {
      fail("Production browser canary observed auth session is unavailable.");
    }
    return {
      observedSessionExpiresAtEpochMs: session.expires_at * 1_000,
      observedSessionExpiresAtIso: expiresAtToIso(session.expires_at),
    };
  }

  async function createObservedSessionSnapshot() {
    const { client, cookies } = await createSupabaseTools();
    const evidence = await readObservedSessionEvidence(client);
    const cookieHeader = await cookies.readCookieHeader();
    state.sessionCounter += 1;
    const handle = createOpaqueHandle("browser-session", state.sessionCounter);
    state.sessionSecrets.set(handle, {
      bindingCreatedAt: state.freshLoginCompletedAtObserved,
      cookieHeader,
      observedSessionExpiresAtEpochMs: evidence.observedSessionExpiresAtEpochMs,
      observedSessionExpiresAtIso: evidence.observedSessionExpiresAtIso,
    });
    return {
      bindingCreatedAt: state.freshLoginCompletedAtObserved,
      session: handle,
    };
  }

  async function protectedJson(sessionHandle, method, path, body) {
    const secret = state.sessionSecrets.get(sessionHandle);
    if (!secret) fail("Production browser canary session handle is invalid.");
    const url = normalizeAppUrl(path, appOrigin);
    const headers = {
      accept: "application/json",
      cookie: secret.cookieHeader,
    };
    if (JSON_METHODS.has(method)) headers["content-type"] = "application/json";
    const response = await safeFetch(url.href, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: "manual",
    });
    const payload = await parseJsonResponse(response);
    return { payload, response };
  }

  async function cleanupMeal(sessionHandle, cleanupHandle) {
    const secret = state.cleanupSecrets.get(cleanupHandle);
    if (!secret) fail("Production browser canary cleanup handle is invalid.");
    const result = await protectedJson(
      sessionHandle,
      "DELETE",
      `${mealsPath}/${encodeURIComponent(secret.mealId)}`,
    );
    if (result.response.status !== 204) return "FAIL";
    state.cleanupSecrets.delete(cleanupHandle);
    return "PASS";
  }

  function plannerPathForCurrentDate() {
    const planDate = currentKstDate(now);
    const separator = plannerPath.includes("?") ? "&" : "?";
    return `${plannerPath}${separator}start_date=${planDate}&end_date=${planDate}`;
  }

  function capturePlannerWriteTarget(payload) {
    const columnId = payload?.data?.columns?.find((column) => UUID_PATTERN.test(column?.id))?.id;
    const recipeId = payload?.data?.meals?.find((meal) => UUID_PATTERN.test(meal?.recipe_id))?.recipe_id;
    if (typeof columnId === "string") {
      state.plannerWriteTarget = {
        columnId,
        planDate: currentKstDate(now),
        recipeId: typeof recipeId === "string" ? recipeId : null,
      };
    }
  }

  async function ensurePlannerWriteTarget(sessionHandle) {
    const target = state.plannerWriteTarget;
    if (!target || !UUID_PATTERN.test(target.columnId)) {
      fail("Production browser canary planner column is unavailable.");
    }
    if (!target.recipeId) {
      const { payload, response } = await protectedJson(sessionHandle, "GET", recipesPath);
      const recipeId = payload?.data?.items?.find((item) => UUID_PATTERN.test(item?.id))?.id;
      if (!response.ok || !isSuccessPayload(payload) || typeof recipeId !== "string") {
        fail("Production browser canary recipe is unavailable for temporary meal verification.");
      }
      target.recipeId = recipeId;
    }
    return target;
  }

  return {
    async openSession() {
      if (!state.browser) {
        state.browser = await launchBrowser({ headless: false });
      }
      state.context = await state.browser.newContext({ storageState: undefined });
      installPublicApiKeyCapture();
      state.page = await state.context.newPage();
      await state.page.goto(loginUrl, { waitUntil: "domcontentloaded" });
      await waitForManualLogin({
        appOrigin,
        loginUrl,
        page: state.page,
        plannerPageUrl,
        timeoutMs,
      });
      assertPlannerLanding(state.page.url(), plannerPageUrl);
      await waitForPublicApiKeyCapture();
      state.freshLoginCompletedAtObserved = ensureDate(now).toISOString();
      if (phase === "milestone-a-t65") {
        const elapsedMs = ensureDate(now).getTime() - Date.parse(state.freshLoginCompletedAtObserved);
        const remainingMs = Math.max(0, T65_WAIT_MS - elapsedMs);
        if (remainingMs > 0) await waitForDuration(remainingMs);
        await state.page.bringToFront();
        assertPlannerLanding(state.page.url(), plannerPageUrl);
        await state.page.reload({ waitUntil: "domcontentloaded" });
        assertPlannerLanding(state.page.url(), plannerPageUrl);
      }
      return createObservedSessionSnapshot();
    },

    async readBindingExpiry(sessionHandle) {
      const secret = state.sessionSecrets.get(sessionHandle);
      if (!secret) fail("Production browser canary session handle is invalid.");
      // This is observed browser auth session evidence, not a privileged DB binding row timestamp.
      return secret.observedSessionExpiresAtIso;
    },

    async refreshSession(sessionHandle) {
      const oldSecret = state.sessionSecrets.get(sessionHandle);
      if (!oldSecret) fail("Production browser canary session handle is invalid.");

      const { client } = await createSupabaseTools();
      let currentEvidence = await readObservedSessionEvidence(client);
      if (currentEvidence.observedSessionExpiresAtEpochMs <= oldSecret.observedSessionExpiresAtEpochMs) {
        const refreshResult = await client.auth.refreshSession();
        if (refreshResult?.error || !refreshResult?.data?.session) {
          fail("Production browser canary observed auth refresh failed.");
        }
        currentEvidence = await readObservedSessionEvidence(client);
      }

      const snapshot = await createObservedSessionSnapshot();
      const newSecret = state.sessionSecrets.get(snapshot.session);
      if (!newSecret
        || newSecret.observedSessionExpiresAtEpochMs <= oldSecret.observedSessionExpiresAtEpochMs) {
        fail("Production browser canary observed auth expiry did not increase.");
      }
      if (await this.plannerRead(snapshot.session) !== "PASS") {
        state.sessionSecrets.delete(snapshot.session);
        fail("Production browser canary protected planner read failed after refresh.");
      }
      return snapshot.session;
    },

    async plannerRead(sessionHandle) {
      const { payload, response } = await protectedJson(
        sessionHandle,
        "GET",
        plannerPathForCurrentDate(),
      );
      if (!response.ok || !isSuccessPayload(payload)) return "FAIL";
      capturePlannerWriteTarget(payload);
      return "PASS";
    },

    async plannerWrite(sessionHandle) {
      const target = await ensurePlannerWriteTarget(sessionHandle);
      const body = {
        column_id: target.columnId,
        plan_date: target.planDate,
        planned_servings: 1,
        recipe_id: target.recipeId,
        source_path: "manual",
      };
      const { payload, response } = await protectedJson(
        sessionHandle,
        "POST",
        mealsPath,
        body,
      );
      if (!response.ok || !isSuccessPayload(payload) || !UUID_PATTERN.test(payload?.data?.id)) {
        fail("Production browser canary planner mutation failed.");
      }
      state.cleanupCounter += 1;
      const cleanupHandle = createOpaqueHandle("planner-cleanup", state.cleanupCounter);
      state.cleanupSecrets.set(cleanupHandle, { mealId: payload.data.id });
      return { cleanupHandle, status: "PASS" };
    },

    async plannerCleanup(sessionHandle, cleanupHandle) {
      return cleanupMeal(sessionHandle, cleanupHandle);
    },

    async pantryRead(sessionHandle) {
      const { payload, response } = await protectedJson(sessionHandle, "GET", pantryPath);
      return response.ok && isSuccessPayload(payload) ? "PASS" : "FAIL";
    },

    async youtubeExtract(sessionHandle, { url }) {
      if (url !== DEFAULT_YOUTUBE_URL) {
        fail("Production browser canary may extract only the exact reviewable YouTube URL.");
      }
      const { payload, response } = await protectedJson(
        sessionHandle,
        "POST",
        youtubeExtractPath,
        { youtube_url: url },
      );
      return response.ok && isSuccessPayload(payload) ? "PASS" : "FAIL";
    },

    async logout(sessionHandle) {
      const { payload, response } = await protectedJson(sessionHandle, "POST", logoutPath, {});
      if (!response.ok || !isSuccessPayload(payload)) return "FAIL";
      if (state.context?.clearCookies) await state.context.clearCookies();
      return "PASS";
    },

    async plannerReadAfterLogout(sessionHandle) {
      const { payload, response } = await protectedJson(
        sessionHandle,
        "GET",
        plannerPathForCurrentDate(),
      );
      return isBlockedResponse(response, payload) ? "BLOCKED" : "PASS";
    },

    async plannerWriteAfterLogout(sessionHandle) {
      const result = await protectedJson(
        sessionHandle,
        "POST",
        mealsPath,
        {},
      );
      return isBlockedResponse(result.response, result.payload) ? "BLOCKED" : "PASS";
    },

    async close() {
      state.cleanupSecrets.clear();
      state.pendingAuthCaptureTasks.clear();
      state.plannerWriteTarget = null;
      state.sessionSecrets.clear();
      if (state.context && typeof state.context.off === "function" && state.authRequestListener) {
        state.context.off("request", state.authRequestListener);
      }
      if (state.context?.close) await state.context.close();
      if (state.browser?.close) await state.browser.close();
      state.authRequestListener = null;
      state.browser = null;
      state.context = null;
      state.cookieShadow = [];
      state.freshLoginCompletedAtObserved = null;
      state.page = null;
      state.publicApiKey = null;
    },
  };
}
