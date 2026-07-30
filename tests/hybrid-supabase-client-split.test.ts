import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/data-env", () => ({
  getDataSupabaseEnv: () => ({
    authority: "local",
    url: "http://127.0.0.1:8000",
    publishableKey: "local-publishable",
  }),
}));

describe("hybrid user-scoped Data client", () => {
  beforeEach(() => {
    createClient.mockReset();
    createClient.mockReturnValue({ kind: "local-data-client" });
  });

  it("uses a local publishable key and a remote user JWT without a secret fallback", async () => {
    const { createUserDataClient } = await import(
      "@/lib/supabase/data-server"
    );

    expect(createUserDataClient({
      accessToken: "remote-user-jwt",
      fetch: vi.fn(),
    })).toEqual({ kind: "local-data-client" });
    expect(createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:8000",
      "local-publishable",
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: expect.objectContaining({
          headers: {
            Authorization: "Bearer remote-user-jwt",
          },
        }),
      }),
    );
    expect(JSON.stringify(createClient.mock.calls[0])).not.toMatch(
      /service.role|secret/i,
    );
  });

  it("fails closed instead of creating an anonymous fallback client", async () => {
    const { createUserDataClient } = await import(
      "@/lib/supabase/data-server"
    );

    expect(() => createUserDataClient({
      accessToken: "",
      fetch: vi.fn(),
    })).toThrow(/remote user jwt/i);
    expect(createClient).not.toHaveBeenCalled();
  });
});
