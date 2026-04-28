import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const createServerClient = vi.fn();
const createClient = vi.fn();
const getSupabaseEnv = vi.fn();
const getServiceRoleKey = vi.fn();
const cookieGetAll = vi.fn();
const cookieSet = vi.fn();

function readAllMigrationSql() {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");

  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n\n");
}

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv,
  getServiceRoleKey,
}));

describe("supabase server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    cookies.mockReset();
    createServerClient.mockReset();
    createClient.mockReset();
    getSupabaseEnv.mockReset();
    getServiceRoleKey.mockReset();
    cookieGetAll.mockReset();
    cookieSet.mockReset();

    cookies.mockResolvedValue({
      getAll: cookieGetAll,
      set: cookieSet,
    });
    cookieGetAll.mockReturnValue([]);
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:54321",
      anonKey: "anon-key",
    });
    getServiceRoleKey.mockReturnValue(null);
  });

  it("does not throw when server-page auth reads trigger cookie writes", async () => {
    cookieSet.mockImplementation(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    });

    createServerClient.mockImplementation((_url, _anonKey, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: "sb-access-token",
              value: "next-token",
              options: { path: "/" },
            },
          ]);

          return {
            data: {
              user: {
                id: "user-1",
              },
            },
          };
        },
      },
    }));

    const { getServerAuthUser } = await import("@/lib/supabase/server");

    await expect(getServerAuthUser()).resolves.toEqual({
      id: "user-1",
    });
  });
});

describe("supabase schema migrations", () => {
  it("defines the documented pantry_items table for pantry match recommendations", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.pantry_items\s*\(/i);
    expect(sql).toMatch(/user_id uuid not null references public\.users\(id\)/i);
    expect(sql).toMatch(/ingredient_id uuid not null references public\.ingredients\(id\)/i);
    expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*ingredient_id\s*\)/i);
  });

  it("defines the documented pantry bundle tables for pantry core", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.ingredient_bundles\s*\(/i);
    expect(sql).toMatch(/name varchar\(50\) not null/i);
    expect(sql).toMatch(/display_order integer not null default 0/i);
    expect(sql).toMatch(/create table if not exists public\.ingredient_bundle_items\s*\(/i);
    expect(sql).toMatch(/bundle_id uuid not null references public\.ingredient_bundles\(id\)/i);
    expect(sql).toMatch(/ingredient_id uuid not null references public\.ingredients\(id\)/i);
    expect(sql).toMatch(/unique\s*\(\s*bundle_id\s*,\s*ingredient_id\s*\)/i);
  });

  it("defines the documented shopping list tables for slice09 creation", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.shopping_lists\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.shopping_list_recipes\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.shopping_list_items\s*\(/i);
    expect(sql).toMatch(/shopping_list_id uuid not null references public\.shopping_lists\(id\)/i);
    expect(sql).toMatch(/added_to_pantry boolean not null default false/i);
    expect(sql).toMatch(/unique\s*\(\s*shopping_list_id\s*,\s*ingredient_id\s*\)/i);
    expect(sql).toMatch(/unique\s*\(\s*shopping_list_id\s*,\s*recipe_id\s*\)/i);
  });
});
