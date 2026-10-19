import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { PATCH, DELETE, type RecipeBookDetailDbClient } from "@/app/api/v1/recipe-books/[book_id]/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const book = "550e8400-e29b-41d4-a716-446655440002";
const selected = "id,name,book_type,sort_order,cover_color_key,cover_image_url,created_at,updated_at";
type Mode = "success" | "guest" | "foreign" | "system" | "missing" | "items-error" | "book-error";

function fixture(mode: Mode = "success") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://book-metadata-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users" && method === "GET") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "recipe_books" && method === "GET") data = mode === "missing" ? null : {
        id: book, user_id: mode === "foreign" ? "other-owner" : owner, book_type: mode === "system" ? "saved" : "custom",
      };
      else if (table === "recipe_book_items") data = [{ book_id: book, recipes: { id: "recipe-1" } }];
      else if (table === "recipe_books" && method === "PATCH") data = {
        id: book, name: "새 북", book_type: "custom", sort_order: 2, cover_color_key: null, cover_image_url: null,
        created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
      };
      else if (table === "recipe_books" && method === "DELETE") data = null;
      else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      const failed = (table === "recipe_book_items" && mode === "items-error")
        || (table === "recipe_books" && method !== "GET" && mode === "book-error");
      if (method === "DELETE" && !failed) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: RecipeBookDetailDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("recipe book metadata native contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers real book enum, nullable covers, FK object and no-return delete", () => {
    const { client } = fixture();
    const updated = client.from("recipe_books").update({ name: "새 북", updated_at: "fixture-time" })
      .select("book_type, cover_color_key, cover_image_url").maybeSingle();
    const items = client.from("recipe_book_items").select("book_id, recipes!inner(id)");
    const deleted = client.from("recipe_books").delete().eq("id", book);
    expectTypeOf<NonNullable<Awaited<typeof updated>["data"]>>().toEqualTypeOf<{
      book_type: "my_added" | "saved" | "liked" | "custom";
      cover_color_key: "sage" | "sky" | "coral" | "lavender" | "sand" | null; cover_image_url: string | null;
    }>();
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{ book_id: string; recipes: { id: string } }> | null>();
    expectTypeOf<Awaited<typeof deleted>["data"]>().toEqualTypeOf<null>();
    for (const query of [updated, items, deleted]) expect(query.then).toBeTypeOf("function");
  });
  describe.each(["PATCH", "DELETE"] as const)("%s", method => {
    it.each<Mode>(["success", "guest", "foreign", "system", "missing", "items-error", "book-error"])("preserves %s owner/custom guards and operation ordering", async mode => {
      const { requests } = fixture(mode);
      const context = { params: Promise.resolve({ book_id: book }) };
      const response = method === "PATCH" ? await PATCH(new Request("http://localhost/book", {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify({ name: " 새 북 ", cover_color_key: null, cover_image_url: "" }),
      }), context) : await DELETE(new Request("http://localhost/book", { method }), context);
      expect(response?.status).toBe(mode === "success" ? 200 : mode === "guest" ? 401 : mode === "foreign" || mode === "system" ? 403 : mode === "missing" ? 404 : 500);
      const result = await response?.json();
      if (mode === "success") expect(result).toMatchObject({ success: true, error: null,
        data: method === "PATCH" ? { id: book, name: "새 북", book_type: "custom", recipe_count: 1, cover_color_key: null, cover_image_url: null } : { deleted: true } });
      else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
      if (mode === "guest") { expect(requests).toHaveLength(0); return; }
      expect(requests.slice(0, 3).map(request => `${request.method} ${request.url.pathname.split("/").at(-1)}`)).toEqual(["GET users", "GET users", "GET recipe_books"]);
      expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,user_id,book_type", id: `eq.${book}` });
      if (mode === "foreign" || mode === "system" || mode === "missing") { expect(requests).toHaveLength(3); return; }
      expect(requests[3].url.pathname).toBe("/rest/v1/recipe_book_items");
      expect(requests[3].method).toBe(method === "PATCH" ? "GET" : "DELETE");
      expect(Object.fromEntries(requests[3].url.searchParams)).toEqual(method === "PATCH"
        ? { select: "book_id,recipes!inner(id)", book_id: `eq.${book}` } : { book_id: `eq.${book}` });
      if (mode === "items-error") { expect(requests).toHaveLength(4); return; }
      expect(requests).toHaveLength(5);
      expect(requests[4].method).toBe(method);
      expect(Object.fromEntries(requests[4].url.searchParams)).toEqual(method === "PATCH" ? { select: selected, id: `eq.${book}` } : { id: `eq.${book}` });
      if (method === "PATCH") expect(requests[4].body).toEqual({ name: "새 북", cover_color_key: null, cover_image_url: null, updated_at: expect.any(String) });
    });
  });
});
