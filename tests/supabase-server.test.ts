import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const createServerClient = vi.fn();
const createClient = vi.fn();
const getSupabaseEnv = vi.fn();
const getServiceRoleKey = vi.fn();
const cookieGetAll = vi.fn();
const cookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv,
  getServiceRoleKey,
}));

describe("supabase server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    cookies.mockReset();
    createServerClient.mockReset();
    createClient.mockReset();
    getSupabaseEnv.mockReset();
    getServiceRoleKey.mockReset();
    cookieGetAll.mockReset();
    cookieSet.mockReset();

    cookies.mockResolvedValue({
      getAll: cookieGetAll,
      set: cookieSet,
    });
    cookieGetAll.mockReturnValue([]);
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:54321",
      anonKey: "anon-key",
    });
    getServiceRoleKey.mockReturnValue(null);
  });

  it("does not throw when server-page auth reads trigger cookie writes", async () => {
    cookieSet.mockImplementation(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    });

    createServerClient.mockImplementation((_url, _anonKey, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: "sb-access-token",
              value: "next-token",
              options: { path: "/" },
            },
          ]);

          return {
            data: {
              user: {
                id: "user-1",
              },
            },
          };
        },
      },
    }));

    const { getServerAuthUser } = await import("@/lib/supabase/server");

    await expect(getServerAuthUser()).resolves.toEqual({
      id: "user-1",
    });
  });
});
