import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("recipe visibility security inventory", () => {
  it("keeps public read RPCs invoker-scoped and removes service-role execution", () => {
    const migration = read(
      "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
    );

    for (const signature of [
      "public.find_recipe_ids_by_public_tags(text, text)",
      "public.list_public_recipe_tags(text, text, boolean, integer)",
      "public.list_home_theme_recipes(integer, integer)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature}`,
      );
    }

    const publicReaderDefinitions = migration.slice(
      migration.indexOf(
        "create or replace function public.find_recipe_ids_by_public_tags",
      ),
    );
    expect(publicReaderDefinitions.match(/security invoker/gi)).toHaveLength(3);
    expect(publicReaderDefinitions).not.toMatch(
      /grant execute[\s\S]*to anon, authenticated, service_role/i,
    );
  });

  it("keeps public discovery reads request-scoped and private overlays service-scoped", () => {
    const list = read("app/api/v1/recipes/route.ts");
    const listGet = list.slice(
      list.indexOf("export async function GET"),
      list.indexOf("export async function POST"),
    );
    const detail = read("app/api/v1/recipes/[id]/route.ts");
    const themes = read("app/api/v1/recipes/themes/route.ts");
    const tags = read("app/api/v1/tags/route.ts");

    expect(listGet).toContain(
      "const recipeSearchDbClient = routeClient as unknown as RecipeSearchDbClient",
    );
    expect(listGet).toContain(
      "dbClient: serviceClient as unknown as RecipeCardUserStatusDbClient",
    );
    expect(detail).not.toContain(
      "const dbClient = serviceClient ?? routeClient",
    );
    expect(themes).toContain(
      "const themeDbClient = supabase as unknown as ThemeDbClient",
    );
    expect(themes).toContain(
      "const privateThemeDbClient = serviceClient as unknown as ThemeDbClient",
    );
    expect(themes).toMatch(
      /privateThemeDbClient[\s\S]*\.from\("meals"\)/,
    );
    expect(themes).toContain(
      "dbClient: serviceClient as unknown as RecipeCardUserStatusDbClient",
    );
    expect(tags).not.toContain("createServiceRoleClient");
  });
});
