import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LOCAL_DEV_AUTH_FLAG = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH;
const ORIGINAL_LOCAL_GOOGLE_OAUTH_FLAG = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function importLocalDevAuthModule() {
  vi.resetModules();

  return import("@/lib/auth/local-dev-auth");
}

describe("local dev auth helpers", () => {
  afterEach(() => {
    vi.resetModules();

    if (ORIGINAL_LOCAL_DEV_AUTH_FLAG === undefined) {
      delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH;
    } else {
      process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = ORIGINAL_LOCAL_DEV_AUTH_FLAG;
    }

    if (ORIGINAL_LOCAL_GOOGLE_OAUTH_FLAG === undefined) {
      delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH;
    } else {
      process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH = ORIGINAL_LOCAL_GOOGLE_OAUTH_FLAG;
    }

    if (ORIGINAL_SUPABASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
    }
  });

  it("enables local dev auth only when the flag is on and Supabase points to localhost", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    const { isLocalDevAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalDevAuthEnabled()).toBe(true);
  });

  it("enables local dev auth when local Supabase is exposed through a private LAN IP", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://192.168.0.11:54321";

    const { isLocalDevAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalDevAuthEnabled()).toBe(true);
  });

  it("keeps local dev auth disabled for remote Supabase projects", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://geenkqiawwsvjrctvqhx.supabase.co";

    const { isLocalDevAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalDevAuthEnabled()).toBe(false);
  });

  it("returns the seeded local demo accounts in a stable order", async () => {
    const { getLocalDevAuthAccounts, getLocalDevAuthCredentials } = await importLocalDevAuthModule();

    expect(getLocalDevAuthAccounts()).toEqual([
      expect.objectContaining({
        id: "main",
        email: "local-tester@homecook.local",
        password: "homecook-local-dev",
      }),
      expect.objectContaining({
        id: "other",
        email: "local-other@homecook.local",
        password: "homecook-local-peer",
      }),
    ]);
    expect(getLocalDevAuthCredentials("other")).toEqual({
      email: "local-other@homecook.local",
      password: "homecook-local-peer",
      nickname: "로컬 다른 유저",
    });
  });

  it("enables local Google OAuth only when the public flag is on in local dev auth mode", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    const { isLocalGoogleOAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalGoogleOAuthEnabled()).toBe(true);
  });

  it("keeps local Google OAuth disabled when the local public flag is missing", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    const { isLocalGoogleOAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalGoogleOAuthEnabled()).toBe(false);
  });
});
