import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelServerAuthFlow,
  startServerAuthFlow,
} from "@/lib/auth/flow-client";

describe("server-issued auth flow client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success only for the wrapped start response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { started: true },
      error: null,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startServerAuthFlow({
      flowKind: "login",
      provider: "google",
    })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/auth/flow/start", expect.objectContaining({
      body: JSON.stringify({ flow_kind: "login", provider: "google" }),
      credentials: "same-origin",
      method: "POST",
    }));
  });

  it("fails closed for a non-success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      data: null,
      error: { code: "AUTH_FLOW_UNAVAILABLE", message: "maintenance", fields: [] },
    }), { status: 503 })));

    await expect(startServerAuthFlow({
      flowKind: "link",
      provider: "custom:naver",
    })).resolves.toEqual({ ok: false });
  });

  it("uses the current HttpOnly cookie when cancelling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { cancelled: true },
      error: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await cancelServerAuthFlow();

    expect(fetchMock).toHaveBeenCalledWith("/auth/flow/cancel", expect.objectContaining({
      credentials: "same-origin",
      method: "POST",
    }));
  });
});
