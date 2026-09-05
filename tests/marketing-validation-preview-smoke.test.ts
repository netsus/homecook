import { describe, expect, it, vi } from "vitest";

import {
  collectMarketingValidationPreviewSmoke,
} from "../scripts/marketing-validation-preview-smoke.mjs";

const PREVIEW_ORIGIN = "https://beta-preview.mumeok.kr";

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 200 ? JSON.stringify({ success: true }) : "", {
    status,
    headers: {
      ...(status === 200 ? { "content-type": "application/json" } : {}),
      ...headers,
    },
  });
}

function passingFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/beta") return response(200, { "content-type": "text/html" });
    if (url.pathname === "/api/v1/marketing/validation") {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ action: "view", honeypot: "" }));
      if (new Headers(init?.headers).get("origin") === "https://attacker.invalid") {
        return response(403);
      }
      return response(200, {
        "set-cookie": "mumeok_validation_session=00000000-0000-4000-8000-000000000001; Path=/api/v1/marketing/validation; HttpOnly; SameSite=Lax; Secure",
      });
    }
    return response(404);
  });
}

describe("marketing validation external preview smoke", () => {
  it("accepts an HTTPS preview whose session cookie is secure and internal service paths stay closed", async () => {
    const fetchImpl = passingFetch();
    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: PREVIEW_ORIGIN,
      fetchImpl,
    });

    expect(summary).toMatchObject({
      ready: true,
      blockers: [],
      checks: {
        landing: { ok: true, status: 200 },
        marketing_api: { ok: true, status: 200 },
        session_cookie: {
          expected_name: true,
          expected_path: true,
          http_only: true,
          ok: true,
          same_site_lax: true,
          secure: true,
        },
        origin_boundary: { ok: true, rejected_status: 403 },
        cors: { absent_or_exact: true, ok: true },
        direct_service_paths: { ok: true },
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(JSON.stringify(summary)).not.toContain("mumeok_validation_session=");
  });

  it("rejects non-HTTPS and production origins before making a request", async () => {
    const fetchImpl = passingFetch();

    const insecure = await collectMarketingValidationPreviewSmoke({
      previewOrigin: "http://beta-preview.mumeok.kr",
      fetchImpl,
    });
    const productionOrigins = [
      "https://app.mumeok.kr",
      "https://app.mumeok.kr:444",
      "https://app.mumeok.kr.",
      "https://auth.mumeok.kr:444",
    ];
    const productionResults = await Promise.all(productionOrigins.map((previewOrigin) => (
      collectMarketingValidationPreviewSmoke({ previewOrigin, fetchImpl })
    )));

    expect(insecure.ready).toBe(false);
    expect(insecure.blockers).toContain("PREVIEW_HTTPS_REQUIRED");
    for (const production of productionResults) {
      expect(production.ready).toBe(false);
      expect(production.blockers).toContain("PRODUCTION_ORIGIN_FORBIDDEN");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not echo credentials from an invalid preview origin", async () => {
    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: "https://operator:private-token@beta-preview.mumeok.kr",
      fetchImpl: passingFetch(),
    });

    expect(summary.ready).toBe(false);
    expect(summary.preview_origin).toBeNull();
    expect(JSON.stringify(summary)).not.toContain("private-token");
  });

  it("fails closed when the external response loses Secure or exposes an internal service path", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/beta") return response(200, { "content-type": "text/html" });
      if (url.pathname === "/api/v1/marketing/validation") {
        if (new Headers(init?.headers).get("origin") === "https://attacker.invalid") {
          return response(403);
        }
        return response(200, {
          "set-cookie": "mumeok_validation_session=id; Path=/api/v1/marketing/validation; HttpOnly; SameSite=Lax",
        });
      }
      if (url.pathname.startsWith("/rest/v1/")) return response(200);
      return response(404);
    });

    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: PREVIEW_ORIGIN,
      fetchImpl,
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "DIRECT_SERVICE_PATH_EXPOSED",
      "SESSION_COOKIE_SECURE_MISSING",
    ]));
    expect(summary.checks.direct_service_paths.exposed).toContain("/rest/v1/marketing_validation_sessions?select=id&limit=1");
  });

  it("does not accept an unrelated secure cookie in place of the marketing session cookie", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/beta") return response(200, { "content-type": "text/html" });
      if (url.pathname === "/api/v1/marketing/validation") {
        if (new Headers(init?.headers).get("origin") === "https://attacker.invalid") return response(403);
        return response(200, {
          "set-cookie": "unrelated_session=id; Path=/api/v1/marketing/validation; HttpOnly; SameSite=Lax; Secure",
        });
      }
      return response(404);
    });

    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: PREVIEW_ORIGIN,
      fetchImpl,
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "SESSION_COOKIE_NAME_MISSING",
      "SESSION_COOKIE_PATH_INVALID",
    ]));
  });

  it("requires the exact case-sensitive marketing cookie name and path value", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/beta") return response(200, { "content-type": "text/html" });
      if (url.pathname === "/api/v1/marketing/validation") {
        if (new Headers(init?.headers).get("origin") === "https://attacker.invalid") return response(403);
        return response(200, {
          "set-cookie": "MUMEOK_VALIDATION_SESSION=id; Path=/API/V1/MARKETING/VALIDATION; HttpOnly; SameSite=Lax; Secure",
        });
      }
      return response(404);
    });

    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: PREVIEW_ORIGIN,
      fetchImpl,
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "SESSION_COOKIE_NAME_MISSING",
      "SESSION_COOKIE_PATH_INVALID",
    ]));
  });

  it("turns network failures into a redacted fail-closed summary", async () => {
    const summary = await collectMarketingValidationPreviewSmoke({
      previewOrigin: PREVIEW_ORIGIN,
      fetchImpl: vi.fn(async () => {
        throw new Error("private-token-should-not-leak");
      }),
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toContain("PREVIEW_REQUEST_FAILED");
    expect(JSON.stringify(summary)).not.toContain("private-token-should-not-leak");
  });
});
