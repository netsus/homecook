import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { UsersMeDeleteDbClient } from "@/app/api/v1/users/me/route";

describe("legacy delete native RPC consumed contract", () => {
  it("keeps raw JSON unknown and exact RPC args without assuming unused result fields", async () => {
    const requests: Array<{ url: URL; method: string; body: unknown }> = [];
    const sdk = createClient("http://delete-sdk.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        requests.push({ url: new URL(input instanceof Request ? input.url : String(input)),
          method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ deleted: "legacy-truthy" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    const db: UsersMeDeleteDbClient = sdk;
    expect(db).toBe(sdk);
    const args = { p_user_id: "fixture-owner", p_auth_identity_created_at: "2026-07-23T00:00:00Z" };
    const result = db.rpc("delete_user_private_data_with_generation_receipt", args);
    expectTypeOf<Awaited<typeof result>["data"]>().toBeUnknown();
    expect((await result).data).toEqual({ deleted: "legacy-truthy" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/rest/v1/rpc/delete_user_private_data_with_generation_receipt");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].body).toEqual(args);
  });
});
