import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { readRecipeCardUserStatuses } from "@/lib/server/recipe-card-user-status";
import type { RecipeBookType } from "@/types/recipe";

const recipeId = "550e8400-e29b-41d4-a716-446655440001";
const emptyRecipeId = "550e8400-e29b-41d4-a716-446655440002";
const ownerId = "550e8400-e29b-41d4-a716-446655440020";
const bookId = "550e8400-e29b-41d4-a716-446655440011";
type JoinedItem = {
  recipe_id: string;
  book_id: string;
  recipe_books: { book_type: RecipeBookType; user_id: string };
};
const savedItem: JoinedItem = {
  recipe_id: recipeId,
  book_id: bookId,
  recipe_books: { book_type: "saved", user_id: ownerId },
};

function sdkClient(rows: JoinedItem[] = [savedItem], fail = false) {
  const requests: Array<{ url: URL; method: string }> = [];
  const fetchRead = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify(fail ? { code: "42501", message: "read denied" } : rows), {
      status: fail ? 403 : 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = createClient("http://recipe-status.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchRead },
  });
  return { client, requests };
}

describe("recipe card native joined-row contract", () => {
  it("preserves the exact non-null book join, request filters and saved status", async () => {
    const { client, requests } = sdkClient();
    const typedClient: Parameters<typeof readRecipeCardUserStatuses>[0]["dbClient"] = client;
    const projection = typedClient.from("recipe_book_items")
      .select("recipe_id, book_id, recipe_books!inner(book_type, user_id)")
      .in("recipe_id", [recipeId]).eq("recipe_books.user_id", ownerId)
      .in("recipe_books.book_type", ["saved", "custom"]);
    expectTypeOf<Awaited<typeof projection>["data"]>().toEqualTypeOf<JoinedItem[] | null>();
    expect(projection.then).toBeTypeOf("function");

    const statuses = await readRecipeCardUserStatuses({
      dbClient: typedClient, recipeIds: [recipeId, recipeId, emptyRecipeId], userId: ownerId,
    });

    expect([...statuses]).toEqual([
      [recipeId, { is_saved: true, saved_book_ids: [bookId] }],
      [emptyRecipeId, { is_saved: false, saved_book_ids: [] }],
    ]);
    expect(requests).toHaveLength(1);
    const { url, method } = requests[0];
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/rest/v1/recipe_book_items");
    expect(url.searchParams.get("select")).toBe("recipe_id,book_id,recipe_books!inner(book_type,user_id)");
    expect(url.searchParams.get("recipe_id")).toBe(`in.(${recipeId},${emptyRecipeId})`);
    expect(url.searchParams.get("recipe_books.user_id")).toBe(`eq.${ownerId}`);
    expect(url.searchParams.get("recipe_books.book_type")).toBe("in.(saved,custom)");
  });

  it.each([
    { name: "guest", recipeIds: [recipeId], userId: null },
    { name: "empty selection", recipeIds: [], userId: ownerId },
  ])("does not query for $name", async ({ recipeIds, userId }) => {
    const { client, requests } = sdkClient();
    const statuses = await readRecipeCardUserStatuses({ dbClient: client, recipeIds, userId });
    expect(requests).toHaveLength(0);
    expect([...statuses.values()].every(value => !value.is_saved && value.saved_book_ids.length === 0)).toBe(true);
  });

  it("preserves empty statuses on a read error", async () => {
    const { client, requests } = sdkClient([], true);
    const statuses = await readRecipeCardUserStatuses({ dbClient: client, recipeIds: [recipeId], userId: ownerId });
    expect(statuses.get(recipeId)).toEqual({ is_saved: false, saved_book_ids: [] });
    expect(requests).toHaveLength(1);
  });

  it("preserves defensive deduplication and ignores an unrequested recipe row", async () => {
    const { client } = sdkClient([savedItem, savedItem, { ...savedItem, recipe_id: emptyRecipeId }]);
    const statuses = await readRecipeCardUserStatuses({ dbClient: client, recipeIds: [recipeId], userId: ownerId });
    expect([...statuses]).toEqual([[recipeId, { is_saved: true, saved_book_ids: [bookId] }]]);
  });
});
