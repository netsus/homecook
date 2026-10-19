import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type ShoppingShareTextDbClient } from "@/app/api/v1/shopping/lists/[list_id]/share-text/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const list = "550e8400-e29b-41d4-a716-446655440002";

function fixture(mode: "success" | "completed" | "null-join" | "empty" | "foreign" | "guest" | "missing" | "items-error" = "success") {
  const requests: URL[] = [];
  const sdk = createClient("http://shopping-share-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "shopping_lists") data = mode === "missing" ? null : {
        id: list, user_id: mode === "foreign" ? "other-owner" : owner,
        title: "", date_range_start: "2026-10-19", is_completed: mode === "completed",
      };
      else if (table === "shopping_list_items") data = mode === "items-error" ? { code: "42501", message: "fixture denied" }
        : mode === "empty" ? [] : [{ id: "item-1", display_text: "양파 2개", is_checked: true,
          is_pantry_excluded: false, sort_order: 0, ingredients: mode === "null-join" ? null : { category: "채소" } }];
      else throw new Error(`unexpected fixture table: ${table}`);
      return new Response(JSON.stringify(data), {
        status: table === "shopping_list_items" && mode === "items-error" ? 403 : 200,
        headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: ShoppingShareTextDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping share text native projection contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact list/single phases and required ingredient FK object", () => {
    const { client } = fixture();
    const lists = client.from("shopping_lists").select("id, user_id, title, date_range_start, is_completed").eq("id", list).maybeSingle();
    const items = client.from("shopping_list_items").select("id, display_text, is_checked, is_pantry_excluded, sort_order, ingredients(category)");
    expectTypeOf<Awaited<typeof lists>["data"]>().toEqualTypeOf<{
      id: string; user_id: string; title: string; date_range_start: string; is_completed: boolean;
    } | null>();
    expectTypeOf<NonNullable<Awaited<typeof items>["data"]>[number]>().toEqualTypeOf<{
      id: string; display_text: string; is_checked: boolean; is_pantry_excluded: boolean;
      sort_order: number; ingredients: { category: string };
    }>();
    expect(items.then).toBeTypeOf("function");
    expect(lists.then).toBeTypeOf("function");
  });

  it.each(["success", "completed", "null-join", "empty"] as const)("preserves %s read-only output and exact purchase filters", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new Request("http://localhost/share"), { params: Promise.resolve({ list_id: list }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, error: null,
      data: { text: mode === "empty" ? "📋 10/19 장보기" : "📋 10/19 장보기\n\n[채소]\n☑ 양파 2개" } });
    expect(requests.map(url => url.pathname.split("/").at(-1))).toEqual(["users", "users", "shopping_lists", "shopping_list_items"]);
    expect(Object.fromEntries(requests[2].searchParams)).toEqual({ select: "id,user_id,title,date_range_start,is_completed", id: `eq.${list}` });
    expect(Object.fromEntries(requests[3].searchParams)).toEqual({
      select: "id,display_text,is_checked,is_pantry_excluded,sort_order,ingredients(category)",
      shopping_list_id: `eq.${list}`, is_pantry_excluded: "eq.false", order: "sort_order.asc,id.asc",
    });
    for (const url of requests.slice(0, 2)) expect(url.searchParams.get("id")).toBe(`eq.${owner}`);
  });

  it.each(["foreign", "guest", "missing", "items-error"] as const)("preserves %s rejection without unauthorized later reads", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new Request("http://localhost/share"), { params: Promise.resolve({ list_id: list }) });
    expect(response.status).toBe(mode === "foreign" ? 403 : mode === "guest" ? 401 : mode === "missing" ? 404 : 500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { fields: [] } });
    expect(requests).toHaveLength(mode === "guest" ? 0 : mode === "items-error" ? 4 : 3);
  });
});
