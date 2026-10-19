import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type PantryBundlesDbClient } from "@/app/api/v1/pantry/bundles/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";
import { buildPantryBundles } from "@/lib/server/pantry";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const bundle = "550e8400-e29b-41d4-a716-446655440002";
const ingredient = "550e8400-e29b-41d4-a716-446655440003";
type Mode = "success" | "empty-bundles" | "empty-items" | "guest" | "users-error" | "bundles-error" | "items-error" | "pantry-error";
function fixture(mode: Mode = "success") {
  const requests: URL[] = [];
  const sdk = createClient("http://pantry-bundles-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "ingredient_bundles") data = mode === "empty-bundles" ? [] : [{ id: bundle, name: "기본", display_order: 0 }];
      else if (table === "ingredient_bundle_items") data = mode === "empty-items" ? [] : [{ bundle_id: bundle, ingredient_id: ingredient, ingredients: { standard_name: "소금" } }];
      else if (table === "pantry_items") data = [{ ingredient_id: ingredient }];
      else throw new Error(`unexpected fixture table: ${table}`);
      const failed = (table === "users" && mode === "users-error") || (table === "ingredient_bundles" && mode === "bundles-error")
        || (table === "ingredient_bundle_items" && mode === "items-error") || (table === "pantry_items" && mode === "pantry-error");
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: PantryBundlesDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("pantry bundle native projection contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact list fields and inner many-to-one ingredient object", () => {
    const { client } = fixture();
    const items = client.from("ingredient_bundle_items").select("bundle_id, ingredient_id, ingredients!inner(standard_name)");
    const pantry = client.from("pantry_items").select("ingredient_id");
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{ bundle_id: string; ingredient_id: string; ingredients: { standard_name: string } }> | null>();
    expectTypeOf<Awaited<typeof pantry>["data"]>().toEqualTypeOf<Array<{ ingredient_id: string | null }> | null>();
    expect(items.then).toBeTypeOf("function");
    expect(pantry.then).toBeTypeOf("function");
  });
  it("does not mistake nullable product pantry identities for a bundled ingredient", () => {
    const bundles = buildPantryBundles({ bundles: [{ id: bundle, name: "기본", display_order: 0 }],
      bundleItems: [{ bundle_id: bundle, ingredient_id: ingredient, ingredients: { standard_name: "소금" } }],
      pantryItems: [{ ingredient_id: null }],
    });
    expect(bundles[0].ingredients[0].is_in_pantry).toBe(false);
  });
  it.each<Mode>(["success", "empty-bundles", "empty-items", "guest", "users-error", "bundles-error", "items-error", "pantry-error"])("preserves %s read sequence and owner pantry filter", async mode => {
    const { requests } = fixture(mode);
    const response = await GET();
    const success = mode === "success" || mode === "empty-bundles" || mode === "empty-items";
    expect(response.status).toBe(success ? 200 : mode === "guest" ? 401 : 500);
    const result = await response.json();
    if (success) expect(result).toEqual({ success: true, error: null, data: { bundles: mode === "empty-bundles" ? [] : [{
      id: bundle, name: "기본", display_order: 0,
      ingredients: mode === "empty-items" ? [] : [{ ingredient_id: ingredient, standard_name: "소금", is_in_pantry: true }],
    }] } });
    else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const tables = requests.map(url => url.pathname.split("/").at(-1));
    expect(tables).toEqual(mode === "guest" ? [] : mode === "users-error" ? ["users"]
      : mode === "empty-bundles" || mode === "bundles-error" ? ["users", "users", "ingredient_bundles"]
      : mode === "empty-items" || mode === "items-error" ? ["users", "users", "ingredient_bundles", "ingredient_bundle_items"]
      : ["users", "users", "ingredient_bundles", "ingredient_bundle_items", "pantry_items"]);
    for (const url of requests) {
      const table = url.pathname.split("/").at(-1);
      if (table === "users") expect(url.searchParams.get("id")).toBe(`eq.${owner}`);
      else if (table === "ingredient_bundles") expect(Object.fromEntries(url.searchParams)).toEqual({ select: "id,name,display_order", order: "display_order.asc,id.asc" });
      else if (table === "ingredient_bundle_items") expect(Object.fromEntries(url.searchParams)).toEqual({
        select: "bundle_id,ingredient_id,ingredients!inner(standard_name)", bundle_id: `in.(${bundle})`,
      });
      else expect(Object.fromEntries(url.searchParams)).toEqual({ select: "ingredient_id", user_id: `eq.${owner}`, ingredient_id: `in.(${ingredient})` });
    }
  });
});
