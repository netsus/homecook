import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("recipe visibility public reader boundaries", () => {
  it("keeps public recipe list reads on the request-scoped RLS client", () => {
    const source = readSource("app/api/v1/recipes/route.ts");
    const getHandler = source.slice(
      source.indexOf("export async function GET"),
      source.indexOf("export async function POST"),
    );

    expect(getHandler).toContain("const recipeSearchDbClient = routeClient");
    expect(getHandler).not.toContain(
      "const supabase = createServiceRoleClient() ?? routeClient",
    );
    expect(source).toMatch(
      /\.from\("recipes"\)[\s\S]*?\.select\([\s\S]*?\.eq\("visibility", "public"\)[\s\S]*?\.is\("deleted_at", null\)/,
    );
  });

  it("authorizes detail from the request-scoped parent row before child reads", () => {
    const source = readSource("app/api/v1/recipes/[id]/route.ts");
    const getHandler = source.slice(source.indexOf("export async function GET"));
    const parentRead = getHandler.indexOf(
      "const recipeResult = await routeClient",
    );
    const childReads = getHandler.indexOf("const [");

    expect(parentRead).toBeGreaterThan(-1);
    expect(childReads).toBeGreaterThan(parentRead);
    expect(getHandler).not.toContain(
      "const dbClient = serviceClient ?? routeClient",
    );
  });

  it("keeps themes and tag aggregation on the request-scoped RLS client", () => {
    const themes = readSource("app/api/v1/recipes/themes/route.ts");
    const tags = readSource("app/api/v1/tags/route.ts");

    expect(themes).toContain("const supabase = routeClient");
    expect(themes).not.toContain(
      "const supabase = createServiceRoleClient() ?? routeClient",
    );
    expect(themes).toContain(
      "const serviceClient = createServiceRoleClient() ?? routeClient",
    );
    expect(themes).toContain(
      "const privateThemeDbClient = serviceClient as unknown as ThemeDbClient",
    );
    expect(tags).toContain(
      "const dbClient = routeClient as unknown as TagsDbClient",
    );
    expect(tags).not.toContain(
      "createServiceRoleClient() ?? routeClient",
    );
  });

  it("filters sitemap rows explicitly in addition to relying on RLS", () => {
    const source = readSource("app/sitemap.ts");

    expect(source).toMatch(
      /\.from\("recipes"\)[\s\S]*?\.select\("id, updated_at"\)[\s\S]*?\.eq\("visibility", "public"\)[\s\S]*?\.is\("deleted_at", null\)/,
    );
  });
});
