import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LOCAL_DEV_AUTH_FLAG = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH;
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

  it("keeps local dev auth disabled for remote Supabase projects", async () => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://geenkqiawwsvjrctvqhx.supabase.co";

    const { isLocalDevAuthEnabled } = await importLocalDevAuthModule();

    expect(isLocalDevAuthEnabled()).toBe(false);
  });
});
