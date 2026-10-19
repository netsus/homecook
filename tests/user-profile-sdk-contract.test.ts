import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { UsersMeDbClient } from "@/app/api/v1/users/me/route";
import type { UserSettingsDbClient } from "@/app/api/v1/users/me/settings/route";

const owner = "550e8400-e29b-41d4-a716-446655440001";
const columns = "id, nickname, email, profile_image_url, social_provider, settings_json";
function fixture(denied = false) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://profile-sdk.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method: init?.method ?? "GET", body });
      const row = { id: owner, nickname: "집밥러", email: null, profile_image_url: null,
        social_provider: "google", settings_json: { keep: 1, screen_wake_lock: false } };
      const data = denied ? { code: "42501", message: "fixture denied" }
        : body && typeof body === "object" ? { ...row, ...body } : row;
      return new Response(JSON.stringify(data), {
        status: denied ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  return { sdk, requests };
}

describe("profile and preference SDK contracts", () => {
  it("uses the same native client for profile projection and owner-scoped nickname update", async () => {
    const { sdk, requests } = fixture();
    const client: UsersMeDbClient = sdk;
    expect(client).toBe(sdk);
    const read = client.from("users").select(columns).eq("id", owner).maybeSingle();
    expectTypeOf<NonNullable<Awaited<typeof read>["data"]>["settings_json"]>().toBeUnknown();
    expectTypeOf<NonNullable<Awaited<typeof read>["data"]>["email"]>().toEqualTypeOf<string | null>();
    expect((await read).data).toMatchObject({ id: owner, nickname: "집밥러" });
    const patch = { nickname: "새집밥러", updated_at: "2026-10-20T00:00:00Z" };
    expect((await client.from("users").update(patch).eq("id", owner).select(columns).maybeSingle()).data)
      .toMatchObject({ nickname: "새집밥러" });
    expect(requests.map(({ url, method }) => [url.pathname, method, Object.fromEntries(url.searchParams)]))
      .toEqual(["GET", "PATCH"].map(method => ["/rest/v1/users", method,
        { select: columns.replaceAll(" ", ""), id: `eq.${owner}` }]));
    expect(requests[1].body).toEqual(patch);
  });

  it("keeps preference JSON unknown and writes only the existing owner-scoped update", async () => {
    const { sdk, requests } = fixture();
    const client: UserSettingsDbClient = sdk;
    expect(client).toBe(sdk);
    const read = client.from("users").select("settings_json").eq("id", owner).maybeSingle();
    expectTypeOf<NonNullable<Awaited<typeof read>["data"]>["settings_json"]>().toBeUnknown();
    expect((await read).data).toMatchObject({ settings_json: { keep: 1 } });
    const patch = { settings_json: { keep: 1, screen_wake_lock: true }, updated_at: "2026-10-20T00:00:00Z" };
    expect((await client.from("users").update(patch).eq("id", owner).select("settings_json").maybeSingle()).data)
      .toMatchObject({ settings_json: patch.settings_json });
    expect(requests.map(({ url, method }) => [method, Object.fromEntries(url.searchParams)]))
      .toEqual(["GET", "PATCH"].map(method => [method, { select: "settings_json", id: `eq.${owner}` }]));
    expect(requests[1].body).toEqual(patch);
  });

  it("preserves a native denial without performing a follow-up request", async () => {
    const { sdk, requests } = fixture(true);
    const client: UsersMeDbClient = sdk;
    expect(await client.from("users").select(columns).eq("id", owner).maybeSingle())
      .toMatchObject({ data: null, error: { code: "42501" } });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
  });
});
