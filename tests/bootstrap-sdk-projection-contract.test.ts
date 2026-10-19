import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ensurePublicUserRow, ensureUserBootstrapState, USER_BOOTSTRAP_VERSION,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { DEFAULT_PLANNER_COLUMN_NAMES } from "@/types/planner";

const ownerId = "550e8400-e29b-41d4-a716-446655440001";
const user = {
  id: ownerId, email: " HELLO@Example.com ",
  app_metadata: { provider: "google" }, user_metadata: { nickname: " demo " },
};
const userColumns = "id,nickname,email,profile_image_url,settings_json";
const bookColumns = "id,name,book_type,sort_order,cover_color_key,cover_image_url";
type Row = Record<string, unknown>;
type Table = "users" | "recipe_books" | "meal_plan_columns";
function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Exact HTTP request/response fixture only; no live DB, grants or RLS simulation.
function nativeFixture(options: {
  missingUser?: boolean; alreadyCurrent?: boolean; duplicateBooks?: boolean;
  failAt?: "users-read" | "book-insert";
  settingsJson?: unknown;
} = {}) {
  const tables: Record<Table, Row[]> = {
    users: options.missingUser ? [] : [{
      id: ownerId, nickname: "existing", email: null, profile_image_url: null,
      settings_json: Object.hasOwn(options, "settingsJson") ? options.settingsJson
        : { keep: true, user_bootstrap_version: options.alreadyCurrent ? USER_BOOTSTRAP_VERSION : 0 },
    }],
    recipe_books: [], meal_plan_columns: [],
  };
  const requests: Array<{ url: URL; method: string; body: Row | null }> = [];
  const sdk = createClient("http://bootstrap-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const raw: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      if (raw !== null && !isRow(raw)) throw new Error("unexpected fixture payload");
      const body = raw;
      requests.push({ url, method, body });
      const table = url.pathname.split("/").at(-1);
      if (table !== "users" && table !== "recipe_books" && table !== "meal_plan_columns") {
        throw new Error(`unexpected bootstrap table: ${table}`);
      }
      const duplicate = table === "recipe_books" && method === "POST" && options.duplicateBooks;
      const failed = (table === "users" && method === "GET" && options.failAt === "users-read")
        || (table === "recipe_books" && method === "POST" && options.failAt === "book-insert");
      let data: unknown;
      if (duplicate || failed) data = { code: duplicate ? "23505" : "42501", message: duplicate ? "duplicate key" : "fixture denied" };
      else if (method === "GET") data = tables[table];
      else if (method === "POST" && body) { tables[table].push(body); data = [body]; }
      else if (method === "PATCH" && table === "users" && body) {
        tables.users[0] = { ...tables.users[0], ...body }; data = [tables.users[0]];
      } else throw new Error(`unexpected bootstrap method: ${method}`);
      if (Array.isArray(data) && new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object+json")) {
        data = data[0] ?? null;
      }
      return new Response(JSON.stringify(data), {
        status: duplicate ? 409 : failed ? 403 : 200,
        headers: { "Content-Type": "application/json" },
      });
    } },
  });
  const client: UserBootstrapDbClient = sdk;
  return { client, requests, tables };
}

describe("bootstrap SDK selected projection contract", () => {
  it("types only actual selected phases, nullable columns and untrusted JSON", () => {
    const { client } = nativeFixture();
    const row = client.from("users").select("id, nickname, email, profile_image_url, settings_json")
      .match({ id: ownerId }).maybeSingle();
    const books = client.from("recipe_books").select("id, name, book_type, sort_order, cover_color_key, cover_image_url")
      .match({ user_id: ownerId }).order("sort_order", { ascending: true });
    expectTypeOf<NonNullable<Awaited<typeof row>["data"]>["settings_json"]>().toBeUnknown();
    expectTypeOf<NonNullable<Awaited<typeof row>["data"]>["email"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NonNullable<Awaited<typeof books>["data"]>[number]["cover_color_key"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NonNullable<Awaited<typeof books>["data"]>[number]["book_type"]>().toEqualTypeOf<"my_added" | "saved" | "liked" | "custom">();
    expect(row.then).toBeTypeOf("function");
    expect(books.then).toBeTypeOf("function");
  });

  it.each([null, "legacy-json", []])("preserves normalization of non-object JSON settings (%j)", async settingsJson => {
    const { client, requests } = nativeFixture({ settingsJson });
    expect((await ensureUserBootstrapState(client, ownerId)).settings_json)
      .toEqual({ user_bootstrap_version: USER_BOOTSTRAP_VERSION });
    expect(requests.at(-1)?.body?.settings_json).toEqual({ user_bootstrap_version: USER_BOOTSTRAP_VERSION });
  });

  it("reads the existing owner row with exactly the consumed projection and no writes", async () => {
    const { client, requests } = nativeFixture();
    expect(await ensurePublicUserRow(client, user)).toMatchObject({ id: ownerId, nickname: "existing" });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ select: userColumns, id: `eq.${ownerId}` });
  });

  it("preserves missing-user insert normalization and selected return fields", async () => {
    const { client, requests } = nativeFixture({ missingUser: true });
    expect(await ensurePublicUserRow(client, user)).toMatchObject({ id: ownerId, nickname: "demo", email: "hello@example.com" });
    expect(requests.map(({ method }) => method)).toEqual(["GET", "POST"]);
    const inserted = requests[1];
    expect(inserted.url.searchParams.get("select")).toBe(userColumns);
    expect(inserted.body).toEqual({
      id: ownerId, nickname: "demo", email: "hello@example.com", profile_image_url: null,
      social_provider: "google", social_id: ownerId, settings_json: {},
      created_at: expect.any(String), updated_at: expect.any(String), deleted_at: null,
    });
    expect(inserted.body?.created_at).toBe(inserted.body?.updated_at);
  });

  it("preserves default book/column writes, sorting, settings and final update order", async () => {
    const { client, requests, tables } = nativeFixture();
    const result = await ensureUserBootstrapState(client, ownerId);
    expect(result.settings_json).toEqual({ keep: true, user_bootstrap_version: USER_BOOTSTRAP_VERSION });
    expect(tables.recipe_books.map(({ book_type, sort_order }) => ({ book_type, sort_order }))).toEqual([
      { book_type: "my_added", sort_order: 0 }, { book_type: "saved", sort_order: 1 }, { book_type: "liked", sort_order: 2 },
    ]);
    expect(tables.meal_plan_columns.map(({ name, sort_order }) => ({ name, sort_order }))).toEqual(
      DEFAULT_PLANNER_COLUMN_NAMES.map((name, sort_order) => ({ name, sort_order })),
    );
    for (const request of requests) {
      const table = request.url.pathname.split("/").at(-1);
      expect(request.url.searchParams.get("select")).toBe(table === "users" ? userColumns : table === "recipe_books" ? bookColumns : "id,name,sort_order");
      if (request.method === "GET" && table !== "users") {
        expect(request.url.searchParams.get("user_id")).toBe(`eq.${ownerId}`);
        expect(request.url.searchParams.get("order")).toBe("sort_order.asc,id.asc");
      }
      if (request.method === "POST") expect(request.body?.user_id).toBe(ownerId);
    }
    const last = requests.at(-1);
    expect(last?.method).toBe("PATCH");
    expect(last?.url.searchParams.get("id")).toBe(`eq.${ownerId}`);
    expect(last?.body).toEqual({
      settings_json: { keep: true, user_bootstrap_version: USER_BOOTSTRAP_VERSION }, updated_at: expect.any(String),
    });
  });

  it("does not re-seed an already current user", async () => {
    const { client, requests } = nativeFixture({ alreadyCurrent: true });
    await ensureUserBootstrapState(client, ownerId);
    expect(requests.map(({ method }) => method)).toEqual(["GET"]);
  });

  it("retains duplicate-key tolerance without adding new write capabilities", async () => {
    const { client, requests } = nativeFixture({ duplicateBooks: true });
    expect((await ensureUserBootstrapState(client, ownerId)).settings_json).toMatchObject({ user_bootstrap_version: USER_BOOTSTRAP_VERSION });
    expect(requests.filter(({ method, url }) => method === "POST" && url.pathname.endsWith("/recipe_books"))).toHaveLength(3);
    expect(requests.at(-1)?.method).toBe("PATCH");
  });

  it.each(["users-read", "book-insert"] as const)("preserves %s failure before final settings publication", async (failAt) => {
    const { client, requests } = nativeFixture({ failAt });
    await expect(ensureUserBootstrapState(client, ownerId)).rejects.toThrow("fixture denied");
    expect(requests.some(({ method }) => method === "PATCH")).toBe(false);
  });
});
