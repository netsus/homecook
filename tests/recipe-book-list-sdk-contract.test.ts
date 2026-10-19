import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type RecipeBookListReadDbClient } from "@/app/api/v1/recipe-books/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createRecipeImageInternalClient: () => null }));
vi.mock("@/lib/mock/recipes", () => ({ isQaFixtureModeEnabled: () => false }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const bookIds = ["550e8400-e29b-41d4-a716-446655440002", "550e8400-e29b-41d4-a716-446655440003", "550e8400-e29b-41d4-a716-446655440004", "550e8400-e29b-41d4-a716-446655440005"];
type Mode = "success" | "empty" | "guest" | "books-error" | "counts-error";
function fixture(mode: Mode = "success") {
  const requests: Array<{ url: URL; method: string; prefer: string | null }> = [];
  const sdk = createClient("http://book-list-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, prefer: new Headers(init?.headers).get("Prefer") });
      const table = url.pathname.split("/").at(-1);
      if (method === "HEAD") {
        if (mode === "counts-error" && table === "recipe_book_items") return new Response(null, { status: 403 });
        const count = table === "recipe_book_items" ? url.searchParams.get("book_id") === `eq.${bookIds[1]}` ? 2 : 3
          : table === "recipe_likes" ? 5 : table === "recipes" ? 7 : -1;
        if (count < 0) throw new Error(`unexpected count table: ${table}`);
        return new Response(null, { status: 200, headers: { "content-range": `0-0/${count}` } });
      }
      expect(method).toBe("GET");
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "recipe_books") data = mode === "empty" ? [] : ["my_added", "saved", "liked", "custom"].map((book_type, index) => ({
        id: bookIds[index], name: book_type, book_type, sort_order: index, cover_color_key: null, cover_image_url: null,
      }));
      else throw new Error(`unexpected fixture table: ${table}`);
      return new Response(JSON.stringify(table === "recipe_books" && mode === "books-error" ? { code: "42501", message: "fixture denied" } : data), {
        status: table === "recipe_books" && mode === "books-error" ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: RecipeBookListReadDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("recipe book list native head-count contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact selected nullable covers, real FK objects and count capability", () => {
    const { client } = fixture();
    const books = client.from("recipe_books").select("book_type, cover_color_key, cover_image_url");
    const counts = client.from("recipe_book_items").select("id, recipes!inner(id)", { count: "exact", head: true });
    expectTypeOf<NonNullable<Awaited<typeof books>["data"]>[number]["cover_image_url"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NonNullable<Awaited<typeof books>["data"]>[number]["book_type"]>().toEqualTypeOf<"my_added" | "saved" | "liked" | "custom">();
    expectTypeOf<Awaited<typeof counts>["count"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Awaited<typeof counts>["data"]>().toEqualTypeOf<Array<{ id: string; recipes: { id: string } }> | null>();
    expect(counts.then).toBeTypeOf("function");
    expect(books.then).toBeTypeOf("function");
  });
  it.each<Mode>(["success", "empty", "guest", "books-error", "counts-error"])("preserves %s owner, count-by-kind and failure boundary", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new Request("http://localhost/books"));
    expect(response.status).toBe(mode === "success" || mode === "empty" ? 200 : mode === "guest" ? 401 : 500);
    const result = await response.json();
    if (mode === "empty") expect(result).toEqual({ success: true, data: { books: [] }, error: null });
    else if (mode === "success") {
      expect(result.data.books.map((book: { recipe_count: number }) => book.recipe_count)).toEqual([7, 2, 5, 3]);
      expect(result.data.books.every((book: { cover_image_url: string | null }) => book.cover_image_url === null)).toBe(true);
    } else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    if (mode === "guest") { expect(requests).toHaveLength(0); return; }
    expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,name,book_type,sort_order,cover_color_key,cover_image_url",
      user_id: `eq.${owner}`, order: "sort_order.asc,id.asc" });
    if (mode === "empty" || mode === "books-error") { expect(requests).toHaveLength(3); return; }
    const heads = requests.filter(request => request.method === "HEAD");
    expect(heads).toHaveLength(4);
    for (const head of heads) {
      expect(head.prefer).toContain("count=exact");
      const table = head.url.pathname.split("/").at(-1);
      if (table === "recipe_book_items") {
        expect(head.url.searchParams.get("select")).toBe("id,recipes!inner(id)");
        expect([`eq.${bookIds[1]}`, `eq.${bookIds[3]}`]).toContain(head.url.searchParams.get("book_id"));
      } else if (table === "recipe_likes") expect(Object.fromEntries(head.url.searchParams)).toEqual({ select: "recipe_id,recipes!inner(id)", user_id: `eq.${owner}` });
      else expect(Object.fromEntries(head.url.searchParams)).toEqual({ select: "id", created_by: `eq.${owner}`, source_type: "in.(youtube,manual)" });
    }
  });
});
