import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  GET,
  type RecipeBookRecipesDbClient,
} from "@/app/api/v1/recipe-books/[book_id]/recipes/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createRecipeImageInternalClient: () => null,
  createRouteHandlerClient: mocks.route,
}));
vi.mock("@/lib/mock/recipes", () => ({ isQaFixtureModeEnabled: () => false }));

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const BOOK_ID = "550e8400-e29b-41d4-a716-446655440003";
const RECIPE_ID = "550e8400-e29b-41d4-a716-446655440004";
const ADDED_AT = "2026-10-20T08:00:00.000Z";

type Mode = "saved" | "canonical" | "foreign-canonical" | "empty" | "guest" | "forbidden";

function fixture(mode: Mode = "saved") {
  const requests: URL[] = [];
  const sdk = createClient("http://recipe-book-recipes-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push(url);
        expect(init?.method ?? "GET").toBe("GET");

        const table = url.pathname.split("/").at(-1);
        let data: unknown;

        if (table === "users") {
          data = [{
            id: OWNER_ID,
            nickname: "fixture",
            email: null,
            profile_image_url: null,
            settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION },
          }];
        } else if (table === "recipe_books") {
          data = [{
            id: BOOK_ID,
            user_id: mode === "forbidden" ? OTHER_USER_ID : OWNER_ID,
            book_type: mode === "canonical" || mode === "foreign-canonical" ? "my_added" : "saved",
          }];
        } else if (table === "recipe_book_items") {
          data = mode === "empty" ? [] : [{
            id: "item-1",
            recipe_id: RECIPE_ID,
            added_at: ADDED_AT,
            recipes: { id: RECIPE_ID },
          }];
        } else if (table === "recipes") {
          data = [{
            id: RECIPE_ID,
            title: "유튜브 된장찌개",
            thumbnail_url: null,
            created_by: mode === "foreign-canonical" ? OTHER_USER_ID : OWNER_ID,
            tags: ["한식"],
            view_count: 7,
            base_servings: 2,
            created_at: ADDED_AT,
            recipe_sources: {
              extraction_meta_json: mode === "canonical" || mode === "foreign-canonical"
                ? { youtube_saved_canonical_bridge: true }
                : {},
            },
          }];
        } else if (table === "recipe_steps") {
          data = [{ recipe_id: RECIPE_ID, duration_seconds: 300 }];
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

  const client: RecipeBookRecipesDbClient = sdk;
  mocks.route.mockResolvedValue({
    from: sdk.from.bind(sdk),
    auth: {
      getUser: async () => ({
        data: {
          user: mode === "guest"
            ? null
            : { id: OWNER_ID, app_metadata: {}, user_metadata: {} },
        },
        error: null,
      }),
    },
  });

  return { client, requests };
}

function request() {
  return new NextRequest(`http://localhost/api/v1/recipe-books/${BOOK_ID}/recipes`);
}

const context = { params: Promise.resolve({ book_id: BOOK_ID }) };

describe("recipe book recipes native projection contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("infers exact nullable fields, enums, and recipe relations from the real SDK", () => {
    const { client } = fixture();
    const books = client.from("recipe_books").select("id, user_id, book_type");
    const items = client.from("recipe_book_items").select("id, recipe_id, added_at, recipes!inner(id)");
    const recipes = client.from("recipes").select("id, thumbnail_url, created_by, recipe_sources(extraction_meta_json)");
    const steps = client.from("recipe_steps").select("recipe_id, duration_seconds");

    expectTypeOf<Awaited<typeof books>["data"]>().toEqualTypeOf<Array<{
      id: string; user_id: string; book_type: "my_added" | "saved" | "liked" | "custom";
    }> | null>();
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{
      id: string; recipe_id: string; added_at: string; recipes: { id: string };
    }> | null>();
    expectTypeOf<Awaited<typeof recipes>["data"]>().toEqualTypeOf<Array<{
      id: string; thumbnail_url: string | null; created_by: string | null;
      recipe_sources: { extraction_meta_json: unknown } | null;
    }> | null>();
    expectTypeOf<Awaited<typeof steps>["data"]>().toEqualTypeOf<Array<{
      recipe_id: string; duration_seconds: number | null;
    }> | null>();
    expect(books.then).toBeTypeOf("function");
    expect(items.then).toBeTypeOf("function");
    expect(recipes.then).toBeTypeOf("function");
    expect(steps.then).toBeTypeOf("function");
  });

  it.each<Mode>(["saved", "canonical", "foreign-canonical", "empty", "guest", "forbidden"])(
    "preserves %s ownership, visibility, canonical link, and empty behavior",
    async (mode) => {
      const { requests } = fixture(mode);
      const response = await GET(request(), context);
      const body = await response.json();

      expect(response.status).toBe(mode === "guest" ? 401 : mode === "forbidden" ? 403 : 200);
      if (mode === "guest" || mode === "forbidden") {
        expect(body).toMatchObject({ success: false, data: null, error: { fields: [] } });
      } else if (mode === "empty") {
        expect(body).toEqual({ success: true, data: { items: [], next_cursor: null, has_next: false }, error: null });
      } else {
        expect(body.data.items).toEqual([expect.objectContaining({
          recipe_id: RECIPE_ID,
          title: "유튜브 된장찌개",
          total_duration_seconds: 300,
          added_at: ADDED_AT,
        })]);
        const item = body.data.items[0];
        if (mode === "canonical") {
          expect(item.detail_href).toBe(`/recipes/youtube/saved/${RECIPE_ID}`);
        } else {
          expect(item).not.toHaveProperty("detail_href");
        }
      }

      const tables = requests.map(url => url.pathname.split("/").at(-1));
      expect(tables).toEqual(
        mode === "guest"
          ? []
          : mode === "forbidden"
            ? ["users", "users", "recipe_books"]
            : mode === "empty"
              ? ["users", "users", "recipe_books", "recipe_book_items"]
              : mode === "saved"
                ? ["users", "users", "recipe_books", "recipe_book_items", "recipes", "recipe_steps"]
                : ["users", "users", "recipe_books", "recipes", "recipe_steps"],
      );

      if (mode === "guest") return;
      expect(Object.fromEntries(requests[2].searchParams)).toEqual({
        select: "id,user_id,book_type",
        id: `eq.${BOOK_ID}`,
      });
      if (mode === "forbidden") return;
      if (mode === "canonical" || mode === "foreign-canonical") {
        expect(Object.fromEntries(requests[3].searchParams)).toEqual({
          select: "id,title,thumbnail_url,created_by,tags,view_count,base_servings,created_at,recipe_sources(extraction_meta_json)",
          created_by: `eq.${OWNER_ID}`,
          source_type: "in.(youtube,manual)",
          order: "created_at.desc,id.desc",
          limit: "21",
        });
      } else {
        expect(Object.fromEntries(requests[3].searchParams)).toEqual({
          select: "id,recipe_id,added_at,recipes!inner(id)",
          book_id: `eq.${BOOK_ID}`,
          order: "added_at.desc,id.desc",
          limit: "21",
        });
      }
    },
  );
});
