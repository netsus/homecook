import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { POST, type CookingCancelDbClient } from "@/app/api/v1/cooking/sessions/[session_id]/cancel/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const session = "550e8400-e29b-41d4-a716-446655440002";
type Mode = "active" | "cancelled" | "completed" | "foreign" | "guest" | "missing" | "read-error" | "update-error" | "empty-update";
function fixture(mode: Mode = "active") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://cooking-cancel-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users" && method === "GET") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "cooking_sessions" && method === "GET") data = mode === "missing" ? null : {
        id: session, user_id: mode === "foreign" ? "other-owner" : owner,
        status: mode === "cancelled" || mode === "completed" ? mode : "in_progress",
      };
      else if (table === "cooking_sessions" && method === "PATCH") data = mode === "empty-update" ? null : { id: session, status: "cancelled" };
      else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      const failed = table === "cooking_sessions" && (method === "GET" && mode === "read-error" || method === "PATCH" && mode === "update-error");
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: CookingCancelDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("legacy cooking cancel native contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers the real three-state enum for selected update results", () => {
    const { client } = fixture();
    const update = client.from("cooking_sessions").update({ status: "cancelled" }).select("id, status").maybeSingle();
    expectTypeOf<Awaited<typeof update>["data"]>().toEqualTypeOf<{ id: string; status: "in_progress" | "completed" | "cancelled" } | null>();
    expect(update.then).toBeTypeOf("function");
  });
  it.each<Mode>(["active", "cancelled", "completed", "foreign", "guest", "missing", "read-error", "update-error", "empty-update"])("preserves %s idempotence, state and owner guards", async mode => {
    const { requests } = fixture(mode);
    const response = await POST(new Request("http://localhost/cancel", { method: "POST" }), { params: Promise.resolve({ session_id: session }) });
    const success = mode === "active" || mode === "cancelled";
    expect(response.status).toBe(success ? 200 : mode === "completed" ? 409 : mode === "foreign" ? 403 : mode === "guest" ? 401 : mode === "missing" ? 404 : 500);
    if (success) expect(await response.json()).toEqual({ success: true, data: { session_id: session, status: "cancelled" }, error: null });
    else expect(await response.json()).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const writes = requests.filter(request => request.method === "PATCH");
    const shouldWrite = mode === "active" || mode === "update-error" || mode === "empty-update";
    expect(writes).toHaveLength(shouldWrite ? 1 : 0);
    if (shouldWrite) {
      expect(writes[0].body).toEqual({ status: "cancelled" });
      expect(Object.fromEntries(writes[0].url.searchParams)).toEqual({ select: "id,status", id: `eq.${session}`, user_id: `eq.${owner}` });
    }
    if (mode === "guest") expect(requests).toHaveLength(0);
    else {
      expect(requests.slice(0, 3).map(request => request.url.pathname.split("/").at(-1))).toEqual(["users", "users", "cooking_sessions"]);
      expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,user_id,status", id: `eq.${session}` });
      if (!shouldWrite) expect(requests).toHaveLength(3);
    }
  });
});
