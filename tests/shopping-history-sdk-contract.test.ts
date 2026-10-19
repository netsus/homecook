import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type ShoppingHistoryDbClient } from "@/app/api/v1/shopping/lists/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const first = "550e8400-e29b-41d4-a716-446655440003";
const second = "550e8400-e29b-41d4-a716-446655440002";
const time = "2026-10-19T12:00:00Z";
type Mode = "success" | "page" | "empty" | "guest" | "lists-error" | "items-error";
function fixture(mode: Mode = "success") {
  const requests: URL[] = [];
  const sdk = createClient("http://shopping-history-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "shopping_lists") data = mode === "empty" ? [] : [first, second].map(id => ({
        id, title: "목록", date_range_start: "2026-10-19", date_range_end: "2026-10-20",
        is_completed: true, completed_at: time, created_at: time,
      }));
      else if (table === "shopping_list_items") data = [false, true, false].map(is_pantry_excluded => ({ shopping_list_id: first, is_pantry_excluded }));
      else throw new Error(`unexpected fixture table: ${table}`);
      const failed = table === "shopping_lists" && mode === "lists-error" || table === "shopping_list_items" && mode === "items-error";
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: ShoppingHistoryDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping history native read contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact list rows and boolean count projections without writer capabilities", () => {
    const { client } = fixture();
    const lists = client.from("shopping_lists").select("id, completed_at");
    const items = client.from("shopping_list_items").select("shopping_list_id, is_pantry_excluded");
    expectTypeOf<Awaited<typeof lists>["data"]>().toEqualTypeOf<Array<{ id: string; completed_at: string | null }> | null>();
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{ shopping_list_id: string; is_pantry_excluded: boolean }> | null>();
    expect(lists.then).toBeTypeOf("function");
    expect(items.then).toBeTypeOf("function");
  });
  it.each<Mode>(["success", "page", "empty", "guest", "lists-error", "items-error"])("preserves %s owner cursor, limit and purchase counts", async mode => {
    const { requests } = fixture(mode);
    const url = new URL("http://localhost/shopping/lists?limit=1");
    if (mode === "page") url.searchParams.set("cursor", `${time}|${first}`);
    const response = await GET(new Request(url));
    const success = mode === "success" || mode === "page" || mode === "empty";
    expect(response.status).toBe(success ? 200 : mode === "guest" ? 401 : 500);
    const result = await response.json();
    if (mode === "empty") expect(result).toEqual({ success: true, data: { items: [], next_cursor: null, has_next: false }, error: null });
    else if (success) expect(result).toEqual({ success: true, error: null, data: {
      items: [{ id: first, title: "10/19~20", date_range_start: "2026-10-19", date_range_end: "2026-10-20",
        is_completed: true, completed_at: time, item_count: 2, created_at: time }],
      next_cursor: `${time}|${first}`, has_next: true,
    } });
    else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    if (mode === "guest") { expect(requests).toHaveLength(0); return; }
    expect(requests.slice(0, 3).map(request => request.pathname.split("/").at(-1))).toEqual(["users", "users", "shopping_lists"]);
    expect(Object.fromEntries(requests[2].searchParams)).toEqual({
      select: "id,title,date_range_start,date_range_end,is_completed,completed_at,created_at", user_id: `eq.${owner}`,
      order: "created_at.desc,id.desc", limit: "2",
      ...(mode === "page" ? { or: `(created_at.lt.${time},and(created_at.eq.${time},id.lt.${first}))` } : {}),
    });
    if (mode === "empty" || mode === "lists-error") expect(requests).toHaveLength(3);
    else {
      expect(requests).toHaveLength(4);
      expect(Object.fromEntries(requests[3].searchParams)).toEqual({ select: "shopping_list_id,is_pantry_excluded", shopping_list_id: `in.(${first})` });
    }
  });
});
