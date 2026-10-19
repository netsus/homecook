import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  DELETE,
  type RecipeBookRecipeRemoveDbClient,
} from "@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route";

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  publicUser: vi.fn(),
  recordGrowth: vi.fn(),
  route: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRecipeFuturePropagationInternalClient: () => null,
  createRouteHandlerClient: mocks.route,
}));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: mocks.publicUser,
  ensureUserBootstrapState: mocks.bootstrap,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message,
}));
vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent: mocks.recordGrowth,
}));

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const BOOK_ID = "550e8400-e29b-41d4-a716-446655440003";
const RECIPE_ID = "550e8400-e29b-41d4-a716-446655440004";

type Mode = "saved" | "liked" | "foreign-owner" | "my-added" | "hidden-recipe";

function fixture(mode: Mode) {
  const requests: Array<{ body: string | undefined; method: string; url: URL }> = [];
  const sdk = createClient("http://recipe-book-delete-contract.invalid", "public-test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = init?.method ?? "GET";
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          method,
          url,
        });
        const table = url.pathname.split("/").at(-1);
        let data: unknown;

        if (table === "recipe_books") {
          data = {
            id: BOOK_ID,
            user_id: mode === "foreign-owner" ? OTHER_USER_ID : OWNER_ID,
            book_type: mode === "liked" ? "liked" : mode === "my-added" ? "my_added" : "saved",
          };
        } else if (table === "recipes") {
          data = method === "PATCH"
            ? { id: RECIPE_ID, like_count: mode === "liked" ? 1 : 0, save_count: mode === "saved" ? 1 : 0 }
            : mode === "hidden-recipe"
              ? null
              : {
                  id: RECIPE_ID,
                  title: "된장찌개",
                  thumbnail_url: null,
                  tags: [],
                  view_count: 0,
                  base_servings: 2,
                  created_by: OWNER_ID,
                  source_type: "manual",
                  recipe_sources: null,
                };
        } else if (table === "recipe_book_items") {
          data = method === "DELETE"
            ? { id: "saved-item" }
            : url.searchParams.has("book_id")
              ? { id: "saved-item" }
              : [{ id: "remaining-saved-item" }];
        } else if (table === "recipe_likes") {
          data = method === "DELETE"
            ? { id: "like-item" }
            : url.searchParams.has("user_id")
              ? { id: "like-item" }
              : [{ id: "remaining-like-item" }];
        } else {
          throw new Error(`unexpected fixture table: ${table}`);
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: OWNER_ID, app_metadata: {}, user_metadata: {} } },
        error: null,
      }),
    },
    from: sdk.from.bind(sdk),
  };
  mocks.route.mockResolvedValue(client);
  return { client, requests, sdk };
}

async function remove() {
  return DELETE(
    new Request(`http://localhost/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }) },
  );
}

describe("recipe book delete actual SDK contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bootstrap.mockResolvedValue(undefined);
    mocks.publicUser.mockResolvedValue({});
    mocks.recordGrowth.mockResolvedValue({ duplicate: false, error: null, recorded: true });
  });

  it("infers exact select, delete, remaining-count, and update phases from the SDK", () => {
    const { sdk } = fixture("saved");
    const client: RecipeBookRecipeRemoveDbClient = sdk;
    const selected = client.from("recipe_book_items").select("id")
      .eq("book_id", BOOK_ID).eq("recipe_id", RECIPE_ID).maybeSingle();
    const deleted = client.from("recipe_book_items").delete().eq("id", "saved-item")
      .eq("book_id", BOOK_ID).eq("recipe_id", RECIPE_ID).select("id").maybeSingle();
    const remaining = client.from("recipe_likes").select("id").eq("recipe_id", RECIPE_ID);
    const updated = client.from("recipes").update({ save_count: 1 }).eq("id", RECIPE_ID)
      .select("id, save_count").maybeSingle();

    expectTypeOf<Awaited<typeof selected>["data"]>().toEqualTypeOf<{ id: string } | null>();
    expectTypeOf<Awaited<typeof deleted>["data"]>().toEqualTypeOf<{ id: string } | null>();
    expectTypeOf<Awaited<typeof remaining>["data"]>().toEqualTypeOf<Array<{ id: string }> | null>();
    expectTypeOf<Awaited<typeof updated>["data"]>().toEqualTypeOf<{
      id: string; save_count: number;
    } | null>();
    expect([selected, deleted, remaining, updated].every(query => typeof query.then === "function"))
      .toBe(true);
  });

  it.each<Mode>(["saved", "liked", "foreign-owner", "my-added", "hidden-recipe"])(
    "preserves %s authority, mutation ordering, counts, and growth recording",
    async (mode) => {
      const { client, requests } = fixture(mode);
      const response = await remove();
      const body = await response.json();
      const success = mode === "saved" || mode === "liked";

      expect(response.status).toBe(success ? 200 : mode === "foreign-owner" || mode === "my-added" ? 403 : 404);
      if (success) {
        expect(body).toEqual({ success: true, data: { deleted: true }, error: null });
        expect(requests.map(request => [request.url.pathname.split("/").at(-1), request.method])).toEqual(
          mode === "liked"
            ? [["recipe_books", "GET"], ["recipes", "GET"], ["recipe_likes", "GET"],
                ["recipe_likes", "DELETE"], ["recipe_likes", "GET"], ["recipes", "PATCH"]]
            : [["recipe_books", "GET"], ["recipes", "GET"], ["recipe_book_items", "GET"],
                ["recipe_book_items", "DELETE"], ["recipe_book_items", "GET"], ["recipes", "PATCH"]],
        );
        expect(Object.fromEntries(requests[3].url.searchParams)).toEqual(
          mode === "liked"
            ? {
                id: "eq.like-item",
                user_id: `eq.${OWNER_ID}`,
                recipe_id: `eq.${RECIPE_ID}`,
                select: "id",
              }
            : {
                id: "eq.saved-item",
                book_id: `eq.${BOOK_ID}`,
                recipe_id: `eq.${RECIPE_ID}`,
                select: "id",
              },
        );
        expect(Object.fromEntries(requests[5].url.searchParams)).toEqual({
          id: `eq.${RECIPE_ID}`,
          select: mode === "liked" ? "id,like_count" : "id,save_count",
        });
        expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual(
          mode === "liked" ? { like_count: 1 } : { save_count: 1 },
        );
        expect(mocks.recordGrowth).toHaveBeenCalledWith(client, expect.objectContaining({
          activityType: "recipebook_recipe_removed",
          sourceId: mode === "liked" ? "like-item" : "saved-item",
          sourceMeta: { book_id: BOOK_ID, recipe_id: RECIPE_ID,
            removed_item_id: mode === "liked" ? "like-item" : "saved-item" },
          sourceTable: mode === "liked" ? "recipe_likes" : "recipe_book_items",
          userId: OWNER_ID,
        }));
      } else {
        expect(body).toMatchObject({ success: false, data: null, error: { fields: [] } });
        expect(requests.every(request => request.method === "GET")).toBe(true);
        expect(mocks.recordGrowth).not.toHaveBeenCalled();
      }
      expect(mocks.publicUser).toHaveBeenCalledWith(client, expect.objectContaining({ id: OWNER_ID }));
      expect(mocks.bootstrap).toHaveBeenCalledWith(client, OWNER_ID);
    },
  );
});
