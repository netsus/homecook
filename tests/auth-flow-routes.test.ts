import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelAuthFlowAttempt,
  cookieGet,
  getUser,
  startAuthFlowAttempt,
} = vi.hoisted(() => ({
  cancelAuthFlowAttempt: vi.fn(),
  cookieGet: vi.fn(),
  getUser: vi.fn(),
  startAuthFlowAttempt: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock("@/lib/server/full-local-auth/runtime", () => ({
  cancelAuthFlowAttempt,
  startAuthFlowAttempt,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAuthServerComponentClient: async () => ({
    auth: { getUser },
  }),
}));

describe("auth flow routes", () => {
  beforeEach(() => {
    cancelAuthFlowAttempt.mockReset();
    cookieGet.mockReset();
    getUser.mockReset();
    startAuthFlowAttempt.mockReset();
    vi.unstubAllEnvs();
    startAuthFlowAttempt.mockResolvedValue({
      cookieValue: "signed-flow-cookie",
      expiresAt: "2026-08-01T12:15:00.000Z",
      maxAge: 900,
    });
    cancelAuthFlowAttempt.mockResolvedValue({ ok: true });
  });

  it("rejects a cross-site start before touching the ledger", async () => {
    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "google" }),
    }));

    expect(response.status).toBe(403);
    expect(startAuthFlowAttempt).not.toHaveBeenCalled();
  });

  it("issues a secure host-only HttpOnly cookie after a valid login ledger insert", async () => {
    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "custom:naver" }),
    }));

    expect(response.status).toBe(200);
    expect(startAuthFlowAttempt).toHaveBeenCalledWith({
      flowKind: "login",
      provider: "custom:naver",
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /__Host-homecook-auth-flow=signed-flow-cookie.*Path=\/.*Max-Age=900.*Secure.*HttpOnly.*SameSite=lax/i,
    );
  });

  it("accepts the public app origin even when the local handler URL stays on localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr/path?ignored=1");

    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("http://localhost:3100/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "kakao" }),
    }));

    expect(response.status).toBe(200);
    expect(startAuthFlowAttempt).toHaveBeenCalledWith({
      flowKind: "login",
      provider: "kakao",
    });
  });

  it("starts a new flow when the existing auth-flow cookie is already expired", async () => {
    cookieGet.mockReturnValue({ value: "expired-flow-cookie" });
    cancelAuthFlowAttempt.mockResolvedValueOnce({ ok: false, reason: "expired" });

    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "google" }),
    }));

    expect(response.status).toBe(200);
    expect(cancelAuthFlowAttempt).toHaveBeenCalledWith("expired-flow-cookie");
    expect(startAuthFlowAttempt).toHaveBeenCalledWith({
      flowKind: "login",
      provider: "google",
    });
  });

  it("starts a new flow when the existing auth-flow cookie is invalid", async () => {
    cookieGet.mockReturnValue({ value: "invalid-flow-cookie" });
    cancelAuthFlowAttempt.mockResolvedValueOnce({ ok: false, reason: "invalid" });

    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "kakao" }),
    }));

    expect(response.status).toBe(200);
    expect(cancelAuthFlowAttempt).toHaveBeenCalledWith("invalid-flow-cookie");
    expect(startAuthFlowAttempt).toHaveBeenCalledWith({
      flowKind: "login",
      provider: "kakao",
    });
  });

  it("fails closed when the existing auth-flow cookie cannot be terminalized for availability reasons", async () => {
    cookieGet.mockReturnValue({ value: "stuck-flow-cookie" });
    cancelAuthFlowAttempt.mockResolvedValueOnce({ ok: false, reason: "unavailable" });

    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "login", provider: "google" }),
    }));

    expect(response.status).toBe(503);
    expect(startAuthFlowAttempt).not.toHaveBeenCalled();
  });

  it("requires an authenticated user before starting a link flow", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/auth/flow/start/route");
    const response = await POST(new Request("https://app.mumeok.kr/auth/flow/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ flow_kind: "link", provider: "kakao" }),
    }));

    expect(response.status).toBe(401);
    expect(startAuthFlowAttempt).not.toHaveBeenCalled();
  });

  it("terminalizes the current flow and expires its cookie on cancel", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr");
    cookieGet.mockReturnValue({ value: "signed-flow-cookie" });
    const { POST } = await import("@/app/auth/flow/cancel/route");
    const response = await POST(new Request("http://localhost:3100/auth/flow/cancel", {
      method: "POST",
      headers: { origin: "https://app.mumeok.kr" },
    }));

    expect(response.status).toBe(200);
    expect(cancelAuthFlowAttempt).toHaveBeenCalledWith("signed-flow-cookie");
    expect(response.headers.get("set-cookie")).toMatch(
      /__Host-homecook-auth-flow=;.*Max-Age=0/i,
    );
  });
});
