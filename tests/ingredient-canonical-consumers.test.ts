import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIngredientSearchName } from "@/lib/ingredient-search";

const { routeClient } = vi.hoisted(() => ({ routeClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: routeClient }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: vi.fn(), ensureUserBootstrapState: vi.fn(),
  formatBootstrapErrorMessage: (_: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: vi.fn() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const old = { id: id(1), standard_name: "슈가파우더", category: "채소", category_code: "root_stem" };
const canonical = { id: id(2), standard_name: "가루 설탕", category: "양념", category_code: null };
const unrelated = { id: id(3), standard_name: "슈가파우더 토핑", category: "양념", category_code: null };
const aliases = [{ ingredient_id: old.id, representative_ingredient_id: canonical.id,
  representative_standard_name: canonical.standard_name, representative_category: canonical.category,
  representative_category_code: canonical.category_code }];

function fixture(options: { failAliases?: boolean; directCollision?: boolean; largePantry?: boolean } = {}) {
  const calls: Array<{ table: string; column: string; value: unknown }> = [];
  const ingredients = [old, canonical, unrelated,
    ...(options.directCollision ? [{ id: id(4), standard_name: "슈가 파우더", category: "양념", category_code: null }] : [])]
    .map(row => ({ ...row, search_name: normalizeIngredientSearchName(row.standard_name) }));
  const pantry = [old, canonical].map((row, index) => ({
    id: id(100 + index), ingredient_id: row.id, user_id: "owner", created_at: "2026-10-08T00:00:00Z", ingredients: row,
  }));
  if (options.largePantry) pantry.unshift(...Array.from({ length: 1000 }, (_, index) => ({
    id: id(1000 + index), ingredient_id: id(5000 + index), user_id: "owner", created_at: "2026-10-08T00:00:00Z", ingredients: old,
  })));
  pantry.push({ ...pantry[0], id: id(199), user_id: "other" });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    from(table: string) {
      return { select(columns: string) {
        let rows: Record<string, unknown>[];
        if (table === "ingredients") rows = ingredients;
        else if (table === "ingredient_catalog_aliases") rows = aliases;
        else if (table === "ingredient_synonyms") rows = [
          { id: id(10), ingredient_id: canonical.id, synonym: "슈가파우더", search_name: "슈가파우더", ingredients: canonical },
          { id: id(11), ingredient_id: old.id, synonym: "파우더슈거", search_name: "파우더슈거", ingredients: old },
        ];
        else if (table === "pantry_items") rows = columns.includes("food_product") ? [] : pantry;
        else throw new Error(`unexpected table ${table}`);
        let start = 0; let end = 999;
        const query = {
          order: () => query,
          range: (from: number, to: number) => { start = from; end = to; return query; },
          eq: (column: string, value: unknown) => {
            calls.push({ table, column, value });
            rows = rows.filter(row => row[column] === value); return query;
          },
          in: (column: string, values: string[]) => {
            calls.push({ table, column, value: values });
            rows = rows.filter(row => values.includes(String(row[column]))); return query;
          },
          like: (column: string, pattern: string) => {
            const term = pattern.slice(1, -1).replace(/\\([%_\\])/g, "$1");
            rows = rows.filter(row => String(row[column]).includes(term)); return query;
          },
          then(onFulfilled: (result: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve(table === "ingredient_catalog_aliases" && options.failAliases
              ? { data: null, error: { message: "alias view unavailable" } }
              : { data: rows.slice(start, end + 1), error: null }).then(onFulfilled, onRejected);
          },
        };
        return query;
      } };
    },
  };
  routeClient.mockResolvedValue(client);
  return { calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  delete process.env.NEXT_PUBLIC_DISCOVERY_FILTER_MANUAL_MOCK;
});

describe("canonical ingredient search consumers", () => {
  it("returns one representative for an alias name while filtering by its real category", async () => {
    fixture();
    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/ingredients?q=슈가파우더&category=양념"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([canonical.id, unrelated.id]);
    expect(body.data.items[0]).toMatchObject({ standard_name: canonical.standard_name, category: canonical.category });
  });
  it("folds alias IDs even in an unfiltered catalog", async () => {
    fixture();
    const { GET } = await import("@/app/api/v1/ingredients/route");
    const body = await (await GET(new NextRequest("http://localhost/api/v1/ingredients"))).json();
    expect(body.data.items.map((row: { id: string }) => row.id).sort()).toEqual([canonical.id, unrelated.id].sort());
  });
  it("ranks a genuine canonical exact name above an old alias exact name", async () => {
    fixture({ directCollision: true });
    const { GET } = await import("@/app/api/v1/ingredients/route");
    const body = await (await GET(new NextRequest("http://localhost/api/v1/ingredients?q=슈가파우더"))).json();
    expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([id(4), canonical.id, unrelated.id]);
  });
  it.each(["가루 설탕", "슈가파우더", "파우더슈거"])("finds both old and current pantry references for %s without merging stored rows", async (name) => {
    const { calls } = fixture();
    const { GET } = await import("@/app/api/v1/pantry/route");
    const body = await (await GET(new NextRequest(`http://localhost/api/v1/pantry?q=${encodeURIComponent(name)}&category=양념`))).json();
    expect(body.success).toBe(true);
    expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([id(100), id(101)]);
    expect(body.data.items.map((row: { ingredient_id: string }) => row.ingredient_id)).toEqual([old.id, canonical.id]);
    expect(calls).toContainEqual({ table: "pantry_items", column: "user_id", value: "owner" });
  });
  it("uses the representative category on a category-only pantry query", async () => {
    fixture();
    const { GET } = await import("@/app/api/v1/pantry/route");
    const body = await (await GET(new NextRequest("http://localhost/api/v1/pantry?category=양념"))).json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0]).toMatchObject({
      standard_name: canonical.standard_name, category: canonical.category,
      category_group_code: body.data.items[1].category_group_code,
      category_code: body.data.items[1].category_code,
      category_label: body.data.items[1].category_label,
      ingredient_id: old.id, id: id(100), created_at: "2026-10-08T00:00:00Z",
    });
  });
  it("uses representative display metadata without filters while retaining each pantry identity", async () => {
    fixture();
    const { GET } = await import("@/app/api/v1/pantry/route");
    const body = await (await GET(new NextRequest("http://localhost/api/v1/pantry"))).json();
    expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([id(100), id(101)]);
    expect(body.data.items.map((row: { ingredient_id: string }) => row.ingredient_id)).toEqual([old.id, canonical.id]);
    expect(body.data.items.map((row: { standard_name: string }) => row.standard_name)).toEqual([canonical.standard_name, canonical.standard_name]);
    expect(body.data.items.map((row: { category: string }) => row.category)).toEqual([canonical.category, canonical.category]);
    expect(body.data.items[0].category_group_code).toEqual(body.data.items[1].category_group_code);
    expect(body.data.items[0].category_code).toEqual(body.data.items[1].category_code);
    expect(body.data.items[0].category_label).toEqual(body.data.items[1].category_label);
  });
  it("reads beyond the first pantry page before filtering by representative category", async () => {
    fixture({ largePantry: true });
    const { GET } = await import("@/app/api/v1/pantry/route");
    const body = await (await GET(new NextRequest("http://localhost/api/v1/pantry?category=양념"))).json();
    expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([id(100), id(101)]);
  });
  it.each(["ingredients", "pantry"])("fails closed on alias-view failure in %s", async (route) => {
    fixture({ failAliases: true });
    const { GET } = route === "ingredients" ? await import("@/app/api/v1/ingredients/route") : await import("@/app/api/v1/pantry/route");
    const response = await GET(new NextRequest(`http://localhost/api/v1/${route}?q=슈가파우더`));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  });
});
