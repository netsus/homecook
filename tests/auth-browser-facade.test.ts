import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));
vi.mock("@/lib/supabase/auth-env", () => ({
  getAuthSupabaseEnv: () => ({
    url: "https://auth.mumeok.kr",
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

  it("keeps server-only Auth authority checks outside client-reachable env readers", () => {
    const browserSource = readFileSync("lib/supabase/browser.ts", "utf8");
    const envSource = readFileSync("lib/supabase/auth-env.ts", "utf8");
    const issuerStart = envSource.indexOf("export function getAuthIssuer()");
    const serverStart = envSource.indexOf(
      "export function getAuthSupabaseServerEnv()",
    );
    const availabilityStart = envSource.indexOf(
      "export function hasAuthSupabasePublicEnv()",
    );
    const secretStart = envSource.indexOf(
      "export function getAuthSupabaseSecretKey()",
    );
    const publicReaders = envSource.slice(issuerStart, serverStart);
    const serverReader = envSource.slice(serverStart, availabilityStart);
    const secretReader = envSource.slice(secretStart);

    expect(issuerStart).toBeGreaterThan(-1);
    expect(serverStart).toBeGreaterThan(issuerStart);
    expect(availabilityStart).toBeGreaterThan(serverStart);
    expect(secretStart).toBeGreaterThan(availabilityStart);
    expect(browserSource).toContain("getAuthSupabaseEnv");
    expect(browserSource).not.toMatch(
      /getAuthAuthority|getAuthSupabaseServerEnv|getAuthSupabaseSecretKey/u,
    );
    expect(publicReaders).not.toContain("getAuthAuthority();");
    expect(serverReader).toContain("getAuthAuthority();");
    expect(secretReader).toContain("getAuthAuthority();");
  });
});
