import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));
vi.mock("@/lib/supabase/auth-env", () => ({
  getAuthSupabaseEnv: () => ({
    url: "https://auth.mumeok.com",
    publishableKey: "publishable",
  }),
}));

describe("browser Auth-only Supabase facade", () => {
  beforeEach(() => {
    vi.resetModules();
    createBrowserClient.mockReset();
    createBrowserClient.mockReturnValue({
      auth: { getUser: vi.fn() },
      from: vi.fn(),
      rpc: vi.fn(),
      storage: {},
    });
  });

  it("exposes Auth but rejects direct browser Data and Storage access", async () => {
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const client = getSupabaseBrowserClient();

    expect(client.auth.getUser).toBeTypeOf("function");
    expect(() => client.from("users")).toThrow(/Auth-only/i);
    expect(() => client.rpc("unsafe")).toThrow(/Auth-only/i);
    expect(() => client.storage).toThrow(/Auth-only/i);
  });
});
