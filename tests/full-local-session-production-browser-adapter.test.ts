import { describe, expect, it } from "vitest";

import {
  PRODUCTION_BROWSER_MANUAL_ACTION,
  createProductionBrowserCanaryAdapter,
} from "../scripts/lib/full-local-session-production-browser-adapter.mjs";

function createBrowserFixture(initialUrl = "https://app.mumeok.kr/login?next=%2Fplanner") {
  const calls: Array<Record<string, unknown>> = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let currentUrl = initialUrl;
  let cookies = [
    { domain: "app.mumeok.kr", name: "sb-homecook-auth-token", path: "/", value: "old-access" },
    { domain: "app.mumeok.kr", name: "sb-homecook-auth-token.0", path: "/", value: "old-refresh" },
  ];

  function upsertCookie(nextCookie: Record<string, unknown>) {
    const normalized = {
      domain: String(nextCookie.domain ?? "app.mumeok.kr").replace(/^\./u, ""),
      name: String(nextCookie.name),
      path: String(nextCookie.path ?? "/"),
      value: String(nextCookie.value ?? ""),
    };
    const index = cookies.findIndex((cookie) =>
      cookie.domain === normalized.domain
      && cookie.name === normalized.name
      && cookie.path === normalized.path);
    if (index >= 0) cookies.splice(index, 1);
    if (normalized.value.length > 0) cookies.push(normalized);
  }

  const page = {
    async goto(target: string, options?: Record<string, unknown>) {
      currentUrl = target;
      calls.push({ kind: "goto", options, target });
    },
    url() {
      return currentUrl;
    },
  };

  const context = {
    async addCookies(nextCookies: Array<Record<string, unknown>>) {
      calls.push({ cookies: nextCookies, kind: "add-cookies" });
      nextCookies.forEach(upsertCookie);
    },
    async clearCookies() {
      calls.push({ kind: "clear-cookies" });
      cookies = [];
    },
    async close() {
      calls.push({ kind: "context-close" });
    },
    async cookies() {
      calls.push({ kind: "cookies" });
      return cookies.map((cookie) => ({ ...cookie }));
    },
    emitRequest(
      url: string,
      headers: Record<string, string>,
      options: { allHeadersDelayMs?: number; allHeadersHeaders?: Record<string, string> } = {},
    ) {
      for (const listener of listeners.get("request") ?? []) {
        listener({
          allHeaders: async () => {
            if (options.allHeadersDelayMs) {
              await new Promise((resolve) => setTimeout(resolve, options.allHeadersDelayMs));
            }
            return options.allHeadersHeaders ?? headers;
          },
          headers: () => headers,
          url: () => url,
        });
      }
    },
    newPage: async () => {
      calls.push({ kind: "new-page" });
      return page;
    },
    off(event: string, listener: (payload: unknown) => void) {
      listeners.get(event)?.delete(listener);
    },
    on(event: string, listener: (payload: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
    },
    setUrl(url: string) {
      currentUrl = url;
    },
  };

  const browser = {
    async close() {
      calls.push({ kind: "browser-close" });
    },
    async newContext(options?: Record<string, unknown>) {
      calls.push({ kind: "new-context", options });
      return context;
    },
  };

  return {
    browser,
    calls,
    context,
    getCookies() {
      return cookies.map((cookie) => ({ ...cookie }));
    },
    page,
  };
}

const FALLBACK_PUBLIC_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public-anon-key-signing-material.signature";
const PUBLISHABLE_PUBLIC_ANON_KEY =
  "sb_publishable_0123456789ABCD-EFGHIJKLMNOPQRSTUVWXYZabcdef";

describe("production browser canary adapter", () => {
  it("captures the public auth key, waits T+65, refreshes via supabase ssr cookies, and proves monotonic protected auth evidence", async () => {
    const browserFixture = createBrowserFixture();
    const fetchCalls: Array<Record<string, unknown>> = [];
    const clientCalls: Array<Record<string, unknown>> = [];
    let loggedOut = false;
    let nowMs = Date.parse("2026-08-11T05:00:00.000Z");
    let sessionExpiresAt = Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000);

    const adapter = await createProductionBrowserCanaryAdapter({
      createBrowserClientImpl: ((url: string, apiKey: string, options: Record<string, unknown>) => {
        clientCalls.push({ apiKey, options, url });
        return {
          auth: {
            async getSession() {
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
            async refreshSession() {
              await (options.cookies as {
                setAll: (cookies: Array<Record<string, unknown>>) => Promise<void>;
              }).setAll([
                {
                  name: "sb-homecook-auth-token",
                  options: { maxAge: 3600, path: "/" },
                  value: "new-access",
                },
                {
                  name: "sb-homecook-auth-token.0",
                  options: { maxAge: 3600, path: "/" },
                  value: "new-refresh",
                },
                {
                  name: "sb-homecook-auth-token.1",
                  options: { maxAge: 3600, path: "/" },
                  value: "chunk-tail",
                },
              ]);
              sessionExpiresAt = Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000);
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
          },
        };
      }) as never,
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        const cookie = String((init?.headers as Record<string, string> | undefined)?.cookie ?? "");
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetchCalls.push({ body, cookie, method, url });

        const oldCookieHeader = "sb-homecook-auth-token=old-access; sb-homecook-auth-token.0=old-refresh";
        const newCookieHeader = "sb-homecook-auth-token=new-access; sb-homecook-auth-token.0=new-refresh; sb-homecook-auth-token.1=chunk-tail";
        const blocked = loggedOut && (cookie === oldCookieHeader || cookie === newCookieHeader);

        if (url === "https://app.mumeok.kr/api/v1/planner?start_date=2026-08-11&end_date=2026-08-11" && method === "GET") {
          return blocked
            ? { async json() { return { data: null, error: { code: "UNAUTHORIZED", fields: [], message: "blocked" }, success: false }; }, ok: false, status: 401 } as Response
            : { async json() { return {
              data: {
                columns: [{ id: "550e8400-e29b-41d4-a716-446655440010" }],
                meals: [{ recipe_id: "550e8400-e29b-41d4-a716-446655440020" }],
              },
              error: null,
              success: true,
            }; }, ok: true, status: 200 } as Response;
        }
        if (url === "https://app.mumeok.kr/api/v1/meals" && method === "POST") {
          expect(body).toEqual(
            blocked
              ? {}
              : {
                column_id: "550e8400-e29b-41d4-a716-446655440010",
                plan_date: "2026-08-11",
                planned_servings: 1,
                recipe_id: "550e8400-e29b-41d4-a716-446655440020",
                source_path: "manual",
              },
          );
          return blocked
            ? { async json() { return { data: null, error: { code: "UNAUTHORIZED", fields: [], message: "blocked" }, success: false }; }, ok: false, status: 401 } as Response
            : { async json() { return { data: { id: "550e8400-e29b-41d4-a716-446655440030" }, error: null, success: true }; }, ok: true, status: 201 } as Response;
        }
        if (url === "https://app.mumeok.kr/api/v1/meals/550e8400-e29b-41d4-a716-446655440030" && method === "DELETE") {
          return { async json() { throw new Error("204 has no body"); }, ok: true, status: 204 } as unknown as Response;
        }
        if (url === "https://app.mumeok.kr/api/v1/pantry" && method === "GET") {
          return { async json() { return { data: { items: [] }, error: null, success: true }; }, ok: true, status: 200 } as Response;
        }
        if (url === "https://app.mumeok.kr/api/v1/recipes/youtube/extract" && method === "POST") {
          expect(body).toEqual({ youtube_url: "https://www.youtube.com/shorts/f0E0p1R26Vk" });
          return { async json() { return { data: { recipe: { title: "ok" } }, error: null, success: true }; }, ok: true, status: 200 } as Response;
        }
        if (url === "https://app.mumeok.kr/api/v1/auth/logout" && method === "POST") {
          loggedOut = true;
          return { async json() { return { data: { logged_out: true }, error: null, success: true }; }, ok: true, status: 200 } as Response;
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      },
      launchBrowser: (async (launchOptions: { headless: boolean }) => {
        browserFixture.calls.push({ kind: "launch", launchOptions });
        return browserFixture.browser;
      }) as never,
      now: () => new Date(nowMs),
      phase: "milestone-a-t65",
      waitForDuration: async (durationMs: number) => {
        expect(durationMs).toBe(65 * 60 * 1_000);
        nowMs += durationMs;
      },
      waitForManualLogin: async ({ page }: { page: { url: () => string } }) => {
        expect(page.url()).toContain("/login");
        browserFixture.context.emitRequest("https://auth.mumeok.kr/auth/v1/authorize", {
          apikey: "pk-live-public-captured-in-memory",
        });
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    const opened = await adapter.openSession();
    const oldSession = opened.session;
    const oldExpiry = await adapter.readBindingExpiry(oldSession);
    const newSession = await adapter.refreshSession(oldSession);
    const protectedFetchCountAfterRefresh = fetchCalls.length;
    const newExpiry = await adapter.readBindingExpiry(newSession);

    expect(opened.bindingCreatedAt).toBe("2026-08-11T05:00:00.000Z");
    expect(oldExpiry).toBe("2026-08-11T05:55:00.000Z");
    expect(newExpiry).toBe("2026-08-11T07:00:00.000Z");
    expect(newSession).not.toBe(oldSession);
    expect(protectedFetchCountAfterRefresh).toBe(1);
    expect(fetchCalls[0]).toMatchObject({
      cookie: "sb-homecook-auth-token=new-access; sb-homecook-auth-token.0=new-refresh; sb-homecook-auth-token.1=chunk-tail",
      method: "GET",
      url: "https://app.mumeok.kr/api/v1/planner?start_date=2026-08-11&end_date=2026-08-11",
    });
    expect(clientCalls).toHaveLength(3);
    expect(clientCalls.every((call) => call.url === "https://auth.mumeok.kr")).toBe(true);
    expect(clientCalls.every((call) => call.apiKey === "pk-live-public-captured-in-memory")).toBe(true);
    expect(clientCalls.every((call) => (call.options as { isSingleton?: boolean }).isSingleton === false)).toBe(true);
    expect(browserFixture.calls.find((call) => call.kind === "add-cookies")).toBeTruthy();
    expect(await adapter.plannerRead(newSession)).toBe("PASS");
    const plannerWrite = await adapter.plannerWrite(newSession);
    expect(plannerWrite.status).toBe("PASS");
    expect(await adapter.plannerCleanup(newSession, plannerWrite.cleanupHandle)).toBe("PASS");
    expect(await adapter.pantryRead(newSession)).toBe("PASS");
    expect(await adapter.youtubeExtract(newSession, { url: "https://www.youtube.com/shorts/f0E0p1R26Vk" })).toBe("PASS");
    expect(await adapter.logout(newSession)).toBe("PASS");
    expect(await adapter.plannerReadAfterLogout(oldSession)).toBe("BLOCKED");
    expect(await adapter.plannerWriteAfterLogout(oldSession)).toBe("BLOCKED");
    expect(await adapter.plannerReadAfterLogout(newSession)).toBe("BLOCKED");
    expect(await adapter.plannerWriteAfterLogout(newSession)).toBe("BLOCKED");
    expect(JSON.stringify({ opened, oldSession, newSession })).not.toMatch(
      /pk-live-public-captured-in-memory|old-access|new-access|new-refresh|chunk-tail/u,
    );

    await adapter.close();
  });

  it("continues the t65 login flow with the legacy JWT fallback anon key when auth request capture is absent", async () => {
    const browserFixture = createBrowserFixture();
    let nowMs = Date.parse("2026-08-11T05:00:00.000Z");
    let sessionExpiresAt = Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000);
    const createdKeys: string[] = [];
    const fetchCalls: Array<Record<string, unknown>> = [];

    const adapter = await createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: FALLBACK_PUBLIC_ANON_KEY,
      createBrowserClientImpl: ((url: string, apiKey: string, options: Record<string, unknown>) => {
        createdKeys.push(`${url}|${apiKey}`);
        return {
          auth: {
            async getSession() {
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
            async refreshSession() {
              await (options.cookies as {
                setAll: (cookies: Array<Record<string, unknown>>) => Promise<void>;
              }).setAll([
                {
                  name: "sb-homecook-auth-token",
                  options: { maxAge: 3600, path: "/" },
                  value: "fallback-new-access",
                },
                {
                  name: "sb-homecook-auth-token.0",
                  options: { maxAge: 3600, path: "/" },
                  value: "fallback-new-refresh",
                },
              ]);
              sessionExpiresAt = Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000);
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
          },
        };
      }) as never,
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        const cookie = String((init?.headers as Record<string, string> | undefined)?.cookie ?? "");
        fetchCalls.push({ cookie, method, url });
        return {
          async json() {
            return {
              data: {
                columns: [{ id: "550e8400-e29b-41d4-a716-446655440010" }],
                meals: [{ recipe_id: "550e8400-e29b-41d4-a716-446655440020" }],
              },
              error: null,
              success: true,
            };
          },
          ok: true,
          status: 200,
        } as Response;
      },
      launchBrowser: (async () => browserFixture.browser) as never,
      now: () => new Date(nowMs),
      phase: "milestone-a-t65",
      waitForDuration: async (durationMs: number) => {
        expect(durationMs).toBe(65 * 60 * 1_000);
        nowMs += durationMs;
      },
      waitForManualLogin: async () => {
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    const opened = await adapter.openSession();
    const refreshed = await adapter.refreshSession(opened.session);
    expect(opened.bindingCreatedAt).toBe("2026-08-11T05:00:00.000Z");
    expect(await adapter.readBindingExpiry(refreshed)).toBe("2026-08-11T07:00:00.000Z");
    expect(createdKeys).toEqual([
      `https://auth.mumeok.kr|${FALLBACK_PUBLIC_ANON_KEY}`,
      `https://auth.mumeok.kr|${FALLBACK_PUBLIC_ANON_KEY}`,
      `https://auth.mumeok.kr|${FALLBACK_PUBLIC_ANON_KEY}`,
    ]);
    expect(fetchCalls[0]?.url).toContain("/api/v1/planner?");
    await adapter.close();
  });

  it("fails closed when the captured auth key disagrees with the configured fallback key", async () => {
    const browserFixture = createBrowserFixture();
    let createClientCalls = 0;

    const adapter = await createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: FALLBACK_PUBLIC_ANON_KEY,
      createBrowserClientImpl: ((() => {
        createClientCalls += 1;
        throw new Error("must not create client");
      }) as unknown) as never,
      launchBrowser: (async () => browserFixture.browser) as never,
      phase: "milestone-a-24h",
      waitForManualLogin: async () => {
        browserFixture.context.emitRequest("https://auth.mumeok.kr/auth/v1/authorize", {
          apikey: "different-captured-public-key",
        });
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    await expect(adapter.openSession()).rejects.toThrow(/public auth API key/i);
    expect(createClientCalls).toBe(0);
    await adapter.close();
  });

  it("continues the login flow with the configured publishable fallback anon key when auth request capture is absent", async () => {
    const browserFixture = createBrowserFixture();
    const nowMs = Date.parse("2026-08-11T05:00:00.000Z");
    let sessionExpiresAt = Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000);
    const createdKeys: string[] = [];

    const adapter = await createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: PUBLISHABLE_PUBLIC_ANON_KEY,
      createBrowserClientImpl: ((url: string, apiKey: string) => {
        createdKeys.push(`${url}|${apiKey}`);
        return {
          auth: {
            async getSession() {
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
            async refreshSession() {
              sessionExpiresAt = Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000);
              return { data: { session: { expires_at: sessionExpiresAt } }, error: null };
            },
          },
        };
      }) as never,
      launchBrowser: (async () => browserFixture.browser) as never,
      now: () => new Date(nowMs),
      phase: "milestone-a-24h",
      waitForManualLogin: async () => {
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    const opened = await adapter.openSession();
    expect(opened.bindingCreatedAt).toBe("2026-08-11T05:00:00.000Z");
    expect(createdKeys[0]).toBe(`https://auth.mumeok.kr|${PUBLISHABLE_PUBLIC_ANON_KEY}`);
    await adapter.close();
  });

  it("rejects invalid configured public auth key formats", async () => {
    await expect(createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: "sb_secret_live_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    })).rejects.toThrow(/public auth API key is invalid/i);
    await expect(createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: "sb_arbitrary_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    })).rejects.toThrow(/public auth API key is invalid/i);
    await expect(createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: ` ${PUBLISHABLE_PUBLIC_ANON_KEY}`,
    })).rejects.toThrow(/public auth API key is invalid/i);
    await expect(createProductionBrowserCanaryAdapter({
      configuredPublicAnonKey: `sb_publishable_bad\u000akey`,
    })).rejects.toThrow(/public auth API key is invalid/i);
  });

  it("fails closed when a non-canonical auth origin is supplied", async () => {
    await expect(createProductionBrowserCanaryAdapter({
      authOrigin: "https://evil.example.com",
    })).rejects.toThrow(/exactly equal https:\/\/auth\.mumeok\.kr/u);
  });

  it("ignores lookalike auth hosts and non-auth-v1 paths when capturing the public key", async () => {
    const browserFixture = createBrowserFixture();
    let createClientCalls = 0;

    const adapter = await createProductionBrowserCanaryAdapter({
      createBrowserClientImpl: ((() => {
        createClientCalls += 1;
        throw new Error("must not create client");
      }) as unknown) as never,
      launchBrowser: (async () => browserFixture.browser) as never,
      phase: "milestone-a-24h",
      waitForManualLogin: async () => {
        browserFixture.context.emitRequest("https://auth.mumeok.kr.evil.example/auth/v1/authorize", {
          apikey: "lookalike-host-key",
        });
        browserFixture.context.emitRequest("https://auth.mumeok.kr/storage/v1/object", {
          apikey: "wrong-path-key",
        });
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    await expect(adapter.openSession()).rejects.toThrow(/public auth API key capture/u);
    expect(createClientCalls).toBe(0);
    await adapter.close();
  });

  it("blocks only exact ACCOUNT_SESSION_STALE conflicts after logout", async () => {
    const makeAdapter = async (code: string) => {
      const browserFixture = createBrowserFixture();
      const adapter = await createProductionBrowserCanaryAdapter({
        createBrowserClientImpl: (((url: string, apiKey: string) => {
          void url;
          void apiKey;
          return ({
          auth: {
            async getSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000) } }, error: null };
            },
            async refreshSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000) } }, error: null };
            },
          },
        });
        }) as unknown) as never,
        fetchImpl: async () => ({
          async json() {
            return { data: null, error: { code, fields: [], message: "blocked?" }, success: false };
          },
          ok: false,
          status: 409,
        }) as Response,
        launchBrowser: (async () => browserFixture.browser) as never,
        phase: "milestone-a-24h",
        waitForManualLogin: async () => {
          browserFixture.context.emitRequest("https://auth.mumeok.kr/auth/v1/authorize", {
            apikey: "pk-live-public-captured-in-memory",
          });
          browserFixture.context.setUrl("https://app.mumeok.kr/planner");
        },
      });
      return adapter;
    };

    const staleAdapter = await makeAdapter("ACCOUNT_SESSION_STALE");
    const staleOpened = await staleAdapter.openSession();
    expect(await staleAdapter.plannerReadAfterLogout(staleOpened.session)).toBe("BLOCKED");
    expect(await staleAdapter.plannerWriteAfterLogout(staleOpened.session)).toBe("BLOCKED");
    await staleAdapter.close();

    const conflictAdapter = await makeAdapter("COLUMN_LIMIT_REACHED");
    const conflictOpened = await conflictAdapter.openSession();
    expect(await conflictAdapter.plannerReadAfterLogout(conflictOpened.session)).toBe("PASS");
    expect(await conflictAdapter.plannerWriteAfterLogout(conflictOpened.session)).toBe("PASS");
    await conflictAdapter.close();
  });

  it("waits 65 minutes only for milestone-a-t65 and does not wait for 24h or 7d phases", async () => {
    async function openForPhase(phase: string) {
      const browserFixture = createBrowserFixture();
      let nowMs = Date.parse("2026-08-11T05:00:00.000Z");
      const waits: number[] = [];
      const adapter = await createProductionBrowserCanaryAdapter({
        createBrowserClientImpl: (((url: string, apiKey: string) => {
          void url;
          void apiKey;
          return ({
          auth: {
            async getSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000) } }, error: null };
            },
            async refreshSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000) } }, error: null };
            },
          },
        });
        }) as unknown) as never,
        launchBrowser: (async () => browserFixture.browser) as never,
        now: () => new Date(nowMs),
        phase,
        waitForDuration: async (durationMs: number) => {
          waits.push(durationMs);
          nowMs += durationMs;
        },
        waitForManualLogin: async () => {
          browserFixture.context.emitRequest("https://auth.mumeok.kr/auth/v1/authorize", {
            apikey: "pk-live-public-captured-in-memory",
          });
          browserFixture.context.setUrl("https://app.mumeok.kr/planner");
        },
      });
      await adapter.openSession();
      await adapter.close();
      return waits;
    }

    expect(await openForPhase("milestone-a-t65")).toEqual([65 * 60 * 1_000]);
    expect(await openForPhase("milestone-a-24h")).toEqual([]);
    expect(await openForPhase("milestone-b-7d")).toEqual([]);
  });

  it("prefers delayed allHeaders() capture over headers() fallback and waits for it before creating the client", async () => {
    const browserFixture = createBrowserFixture();
    const createdKeys: string[] = [];
    const adapter = await createProductionBrowserCanaryAdapter({
      createBrowserClientImpl: ((url: string, apiKey: string) => {
        createdKeys.push(`${url}|${apiKey}`);
        return {
          auth: {
            async getSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T05:55:00.000Z") / 1_000) } }, error: null };
            },
            async refreshSession() {
              return { data: { session: { expires_at: Math.floor(Date.parse("2026-08-11T07:00:00.000Z") / 1_000) } }, error: null };
            },
          },
        };
      }) as never,
      launchBrowser: (async () => browserFixture.browser) as never,
      phase: "milestone-a-24h",
      waitForManualLogin: async () => {
        browserFixture.context.emitRequest("https://auth.mumeok.kr/auth/v1/authorize", {
          apikey: "fallback-header-value",
        }, {
          allHeadersDelayMs: 10,
          allHeadersHeaders: { apikey: "delayed-allheaders-key" },
        });
        browserFixture.context.setUrl("https://app.mumeok.kr/planner");
      },
    });

    await adapter.openSession();
    expect(createdKeys).toEqual(["https://auth.mumeok.kr|delayed-allheaders-key"]);
    await adapter.close();
  });

  it("keeps manual action text callback-only and free of magic-link shortcuts", () => {
    expect(PRODUCTION_BROWSER_MANUAL_ACTION).toContain("https://app.mumeok.kr/login?next=%2Fplanner");
    expect(PRODUCTION_BROWSER_MANUAL_ACTION).toContain("/auth/callback");
    expect(PRODUCTION_BROWSER_MANUAL_ACTION).not.toContain("/auth/link/callback");
    expect(PRODUCTION_BROWSER_MANUAL_ACTION).not.toMatch(/magic.?link|keychain|env token|service role/iu);
  });
});
