import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260731110000_product_ingredient_link_contract_runtime.sql";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("product ingredient link pantry and shopping runtime contract", () => {
  it("locks generic-versus-exact-product identity and deletion protection", () => {
    const sql = read(migrationPath);

    for (const table of ["pantry_items", "shopping_list_items"]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}[\\s\\S]*add column food_product_id uuid[\\s\\S]*add column food_product_nutrition_version_id uuid`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `${table}[\\s\\S]*check[\\s\\S]*ingredient_id is not null[\\s\\S]*food_product_id is null[\\s\\S]*food_product_nutrition_version_id is null[\\s\\S]*ingredient_id is null[\\s\\S]*food_product_id is not null[\\s\\S]*food_product_nutrition_version_id is not null`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}[\\s\\S]*foreign key \\(food_product_id, food_product_nutrition_version_id\\)[\\s\\S]*references public\\.food_product_nutrition_versions\\(product_id, id\\)[\\s\\S]*on delete restrict`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `create unique index[\\s\\S]*on public\\.${table}[\\s\\S]*food_product_id[\\s\\S]*food_product_nutrition_version_id[\\s\\S]*where ingredient_id is null`,
          "i",
        ),
      );
    }
  });

  it("extends pantry without replacing the existing ingredient contract", () => {
    const route = read("app/api/v1/pantry/route.ts");
    const types = read("types/pantry.ts");

    expect(types).toMatch(/ingredient_ids\?: unknown/);
    expect(types).toMatch(/product_items\?: unknown/);
    expect(types).toMatch(
      /food_product_id: string[\s\S]*food_product_nutrition_version_id: string/,
    );
    expect(types).toMatch(/product_added: number[\s\S]*product_items:/);
    expect(route).toMatch(/product_version_mismatch/);
    expect(route).toMatch(
      /product_items\[\$\{index\}\]\.food_product_nutrition_version_id/,
    );
    expect(route).toMatch(/RESOURCE_NOT_FOUND/);
    expect(route).toMatch(
      /item\.name[\s\S]*includes\(normalizedQuery\)[\s\S]*item\.brand/,
    );
    expect(route).toMatch(/if \(!category\)[\s\S]*product_items: productItems/);
  });

  it("pins and exposes shopping provenance while retaining all-null fail-closed", () => {
    const createRoute = read("app/api/v1/shopping/lists/route.ts");
    const detailRoute = read("app/api/v1/shopping/lists/[list_id]/route.ts");
    const completeRoute = read(
      "app/api/v1/shopping/lists/[list_id]/complete/route.ts",
    );
    const shoppingTypes = read("types/shopping.ts");

    expect(createRoute).toMatch(
      /food_product_id[\s\S]*food_product_nutrition_version_id/,
    );
    expect(detailRoute).toMatch(
      /source_type[\s\S]*food_product_id[\s\S]*food_product_nutrition_version_id/,
    );
    expect(shoppingTypes).toMatch(
      /source_type\?: "ingredient" \| "food_product" \| null/,
    );
    expect(completeRoute).toMatch(/ingredient_id[\s\S]*food_product_id/);
    expect(completeRoute).toMatch(/food_product_nutrition_version_id/);
    expect(completeRoute).toMatch(
      /hasPinnedIdentity[\s\S]*item\.ingredient_id[\s\S]*item\.food_product_id/,
    );
  });
});
