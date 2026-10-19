import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { POST, type RecipeBookCreateDbClient } from "@/app/api/v1/recipe-books/route";
import type { RecipeBookCoverColorKey, RecipeBookType } from "@/types/recipe";

const mocks = vi.hoisted(() => ({
  route: vi.fn(), bootstrap: vi.fn(), bootstrapState: vi.fn(),
  progress: vi.fn(), growth: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
vi.mock("@/lib/mock/recipes", () => ({ isQaFixtureModeEnabled: () => false }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: mocks.bootstrap, ensureUserBootstrapState: mocks.bootstrapState,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message,
}));
vi.mock("@/lib/server/user-progress", () => ({ awardUserProgressEvent: mocks.progress }));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: mocks.growth }));

const OWNER = "550e8400-e29b-41d4-a716-446655440001";
const BOOK = "550e8400-e29b-41d4-a716-446655440002";
const AT = "2026-10-20T03:00:00.000Z";
type Mode = "success" | "guest" | "sort-error" | "insert-error" | "secondary-error";

function fixture(mode: Mode) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://book-create-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      requests.push({ url, method, body });
      expect(url.pathname).toBe("/rest/v1/recipe_books");
      if ((method === "GET" && mode === "sort-error") || (method === "POST" && mode === "insert-error")) {
        return new Response(JSON.stringify({ code: "42501", message: "fixture blocked" }), { status: 403 });
      }
      const data = method === "GET" ? [{ sort_order: 4 }] : {
        id: BOOK, name: "새 요리책", book_type: "custom", sort_order: 5,
        cover_color_key: null, cover_image_url: null, created_at: AT, updated_at: AT,
      };
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  const user = { id: OWNER, app_metadata: {}, user_metadata: {} };
  const client = { from: sdk.from.bind(sdk), auth: { getUser: async () => ({ data: { user: mode === "guest" ? null : user }, error: null }) } };
  mocks.route.mockResolvedValue(client);
  if (mode === "secondary-error") {
    mocks.progress.mockRejectedValue(new Error("progress unavailable"));
    mocks.growth.mockRejectedValue(new Error("growth unavailable"));
  }
  return { sdk, client, user, requests };
}

describe("recipe book create actual SDK contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("directly accepts the actual SDK and infers exact sort and created row fields", () => {
    const { sdk } = fixture("success");
    const client: RecipeBookCreateDbClient = sdk;
    const sort = client.from("recipe_books").select("sort_order");
    const inserted = client.from("recipe_books").insert({
      user_id: OWNER, name: "새 요리책", book_type: "custom", sort_order: 5,
      cover_color_key: "sage", cover_image_url: null,
    }).select("id, book_type, cover_color_key, created_at").maybeSingle();
    expectTypeOf<Awaited<typeof sort>["data"]>().toEqualTypeOf<Array<{ sort_order: number }> | null>();
    expectTypeOf<Awaited<typeof inserted>["data"]>().toEqualTypeOf<{
      id: string; book_type: RecipeBookType; cover_color_key: RecipeBookCoverColorKey | null; created_at: string;
    } | null>();
    expect(sort.then).toBeTypeOf("function");
    expect(inserted.then).toBeTypeOf("function");
  });

  it.each<Mode>(["success", "guest", "sort-error", "insert-error", "secondary-error"])(
    "preserves %s ordering, ownership and secondary failure behavior", async (mode) => {
      const { client, user, requests } = fixture(mode);
      const response = await POST(new Request("http://localhost/api/v1/recipe-books", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  새 요리책  " }),
      }));
      const body = await response.json();
      expect(response.status).toBe(mode === "guest" ? 401 : mode === "sort-error" || mode === "insert-error" ? 500 : 201);
      if (mode === "guest") {
        expect(requests).toEqual([]);
        expect(mocks.bootstrap).not.toHaveBeenCalled();
      } else {
        expect(mocks.bootstrap).toHaveBeenCalledWith(client, user);
        expect(mocks.bootstrapState).toHaveBeenCalledWith(client, OWNER);
        expect(requests[0].url.searchParams.get("select")).toBe("sort_order");
        expect(requests[0].url.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
        expect(requests[0].url.searchParams.get("order")).toBe("sort_order.desc");
        expect(requests[0].url.searchParams.get("limit")).toBe("1");
      }
      if (mode === "success" || mode === "secondary-error" || mode === "insert-error") {
        expect(requests[1]).toMatchObject({ method: "POST", body: {
          user_id: OWNER, name: "새 요리책", book_type: "custom", sort_order: 5,
          cover_color_key: "sage", cover_image_url: null,
        } });
        expect(requests[1].url.searchParams.get("select")).toBe("id,name,book_type,sort_order,cover_color_key,cover_image_url,created_at,updated_at");
      }
      if (mode === "success" || mode === "secondary-error") {
        expect(body).toEqual({ success: true, data: {
          id: BOOK, name: "새 요리책", book_type: "custom", recipe_count: 0, sort_order: 5,
          cover_color_key: "sage", cover_image_url: null, created_at: AT, updated_at: AT,
        }, error: null });
        expect(mocks.progress).toHaveBeenCalledWith(client, expect.objectContaining({
          userId: OWNER, eventType: "custom_book_created", sourceId: BOOK, occurredAt: AT,
        }));
        expect(mocks.growth).toHaveBeenCalledWith(client, expect.objectContaining({
          userId: OWNER, activityType: "recipebook_created", sourceKey: `recipebook_created:${BOOK}`,
          sourceId: BOOK, sourceMeta: { book_type: "custom" }, occurredAt: AT,
        }));
        expect(mocks.progress.mock.invocationCallOrder[0]).toBeLessThan(mocks.growth.mock.invocationCallOrder[0]);
      } else {
        expect(body).toMatchObject({ success: false, data: null, error: { fields: [] } });
        expect(mocks.progress).not.toHaveBeenCalled();
        expect(mocks.growth).not.toHaveBeenCalled();
      }
      expect(requests).toHaveLength(mode === "guest" ? 0 : mode === "sort-error" ? 1 : 2);
    },
  );
});
