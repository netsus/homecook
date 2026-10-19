import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { POST, type RecipeLikeDbClient } from "@/app/api/v1/recipes/[id]/like/route";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
vi.mock("@/lib/mock/recipes", () => ({ isQaFixtureModeEnabled: () => false }));

const RECIPE = "550e8400-e29b-41d4-a716-446655440001";
const OWNER = "550e8400-e29b-41d4-a716-446655440002";
const LIKE = "550e8400-e29b-41d4-a716-446655440003";
type Mode = "insert" | "delete" | "duplicate" | "guest" | "missing" | "lookup-error"
  | "insert-error" | "delete-error" | "refresh-error" | "duplicate-refresh-error";

function fixture(mode: Mode) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://like-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      requests.push({ url, method, body });
      const recipeRead = url.pathname === "/rest/v1/recipes";
      const deleting = mode === "delete" || mode === "delete-error";
      const refresh = recipeRead && requests.length > 1;
      const duplicate = mode === "duplicate" || mode === "duplicate-refresh-error";
      if ((!recipeRead && method === "GET" && mode === "lookup-error")
        || (method === "POST" && (duplicate || mode === "insert-error"))
        || (method === "DELETE" && mode === "delete-error")
        || (refresh && (mode === "refresh-error" || mode === "duplicate-refresh-error"))) {
        return new Response(JSON.stringify({ code: duplicate && method === "POST" ? "23505" : "42501", message: "fixture denied" }), { status: 400 });
      }
      const data = recipeRead ? mode === "missing" ? null : { id: RECIPE, like_count: refresh ? deleting ? -1 : 4 : 3 }
        : method === "GET" && !deleting ? null : { id: LIKE };
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk),
    auth: { getUser: async () => ({ data: { user: mode === "guest" ? null : { id: OWNER } } }) } });
  return { sdk, requests };
}

describe("recipe like actual SDK wire contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("directly accepts the default SDK and infers the actual selected rows", () => {
    const { sdk } = fixture("insert");
    const client: RecipeLikeDbClient = sdk;
    const recipe = client.from("recipes").select("id, like_count").maybeSingle();
    const like = client.from("recipe_likes").insert({ user_id: OWNER, recipe_id: RECIPE }).select("id").maybeSingle();
    expectTypeOf<Awaited<typeof recipe>["data"]>().toEqualTypeOf<{ id: string; like_count: number } | null>();
    expectTypeOf<Awaited<typeof like>["data"]>().toEqualTypeOf<{ id: string } | null>();
    expect(recipe.then).toBeTypeOf("function");
    expect(like.then).toBeTypeOf("function");
  });

  it("rejects invalid recipe IDs before constructing a client", async () => {
    const response = await POST(new Request("http://localhost/api/like", { method: "POST" }), { params: Promise.resolve({ id: "invalid" }) });
    expect(response.status).toBe(404);
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it.each<Mode>(["insert", "delete", "duplicate", "guest", "missing", "lookup-error",
    "insert-error", "delete-error", "refresh-error", "duplicate-refresh-error"])("preserves %s request order and response", async (mode) => {
    const { requests } = fixture(mode);
    const response = await POST(new Request("http://localhost/api/like", { method: "POST" }), { params: Promise.resolve({ id: RECIPE }) });
    const body = await response.json();
    const success = mode === "insert" || mode === "delete" || mode === "duplicate";
    expect(response.status).toBe(success ? 200 : mode === "guest" ? 401 : mode === "missing" ? 404 : 500);
    if (success) expect(body).toEqual({ success: true, data: { is_liked: mode !== "delete", like_count: mode === "delete" ? 0 : 4 }, error: null });
    else expect(body).toMatchObject({ success: false, data: null, error: { fields: [] } });
    if (mode === "guest") { expect(requests).toEqual([]); return; }
    expect(requests[0].url.pathname).toBe("/rest/v1/recipes");
    expect(requests[0].url.searchParams.get("select")).toBe("id,like_count");
    expect(requests[0].url.searchParams.get("id")).toBe(`eq.${RECIPE}`);
    if (mode === "missing") { expect(requests).toHaveLength(1); return; }
    expect(requests[1].url.pathname).toBe("/rest/v1/recipe_likes");
    expect(requests[1].url.searchParams.get("recipe_id")).toBe(`eq.${RECIPE}`);
    expect(requests[1].url.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
    if (mode === "lookup-error") { expect(requests).toHaveLength(2); return; }
    const mutation = requests[2];
    expect(mutation.url.pathname).toBe("/rest/v1/recipe_likes");
    expect(mutation.url.searchParams.get("select")).toBe("id");
    if (mode === "delete" || mode === "delete-error") {
      expect(mutation.method).toBe("DELETE");
      expect(mutation.url.searchParams.get("id")).toBe(`eq.${LIKE}`);
      expect(mutation.url.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
    } else expect(mutation).toMatchObject({ method: "POST", body: { user_id: OWNER, recipe_id: RECIPE } });
    expect(requests).toHaveLength(mode === "insert-error" || mode === "delete-error" ? 3 : 4);
    if (requests.length === 4) {
      expect(requests[3].method).toBe("GET");
      expect(requests[3].url.pathname).toBe("/rest/v1/recipes");
      expect(requests[3].url.searchParams.get("id")).toBe(`eq.${RECIPE}`);
    }
  });
});
