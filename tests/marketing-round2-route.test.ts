import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createMarketingRound2InternalClient: client }));
afterEach(() => { vi.unstubAllEnvs(); client.mockReset(); });
describe("configured r2 endpoint", () => {
  it("is disabled by default without accessing a DB or private files", async () => {
    vi.stubEnv("MUMEOK_ROUND2_ENABLED", "false");
    const { POST } = await import("@/app/api/v1/marketing/round2/route");
    const response = await POST(new Request("https://app.mumeok.kr/api/v1/marketing/round2", { method: "POST", headers: { host: "app.mumeok.kr", origin: "https://app.mumeok.kr", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ROUND2_DISABLED");
    expect(client).not.toHaveBeenCalled();
  });
  it("responds to non-POST with the exact method error", async () => {
    const route = await import("@/app/api/v1/marketing/round2/route");
    for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const) {
      const response = await route[method](new Request("https://app.mumeok.kr/api/v1/marketing/round2", { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect(client).not.toHaveBeenCalled();
  });
  it("keeps the actual loopback preview POST disabled without any real collector access", async () => {
    vi.stubEnv("MUMEOK_ROUND2_ENABLED", "true");
    vi.stubEnv("MUMEOK_ROUND2_LOCAL_PREVIEW", "true");
    const { POST } = await import("@/app/api/v1/marketing/round2/route");
    const response = await POST(new Request("http://localhost:3000/api/v1/marketing/round2", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ROUND2_DISABLED");
    expect(client).not.toHaveBeenCalled();
  });
});
