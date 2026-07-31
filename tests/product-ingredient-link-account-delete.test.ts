import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260731110000_product_ingredient_link_contract_runtime.sql",
  "utf8",
);

describe("product ingredient link account cleanup", () => {
  it("removes owner-private references before deleting the private aggregate", () => {
    const ownerFence = migration.indexOf("v_owned_private_product_ids");
    const pantryDelete = migration.indexOf("delete from public.pantry_items");
    const shoppingDelete = migration.indexOf(
      "delete from public.shopping_list_items",
    );
    const refcount = migration.indexOf(
      "into v_remaining_private_reference_count",
      shoppingDelete,
    );
    const token = migration.indexOf(
      "homecook.private_product_cleanup_user_id",
      refcount,
    );
    const productDelete = migration.indexOf("delete from public.food_products");

    expect(ownerFence).toBeGreaterThan(-1);
    expect(pantryDelete).toBeGreaterThan(ownerFence);
    expect(shoppingDelete).toBeGreaterThan(ownerFence);
    expect(refcount).toBeGreaterThan(shoppingDelete);
    expect(token).toBeGreaterThan(refcount);
    expect(productDelete).toBeGreaterThan(token);
  });

  it("keeps public/shared aggregates and normal version deletion protected", () => {
    expect(migration).toMatch(
      /owner_user_id = p_user_id[\s\S]*visibility = 'private'/i,
    );
    expect(migration).toMatch(
      /owner_user_id is null[\s\S]*(?:preserve|보존)/i,
    );
    expect(migration).toMatch(
      /protect_food_product_nutrition_version[\s\S]*private_product_cleanup_user_id/i,
    );
    expect(migration).toMatch(
      /food_product_nutrition_versions[\s\S]*product_id[\s\S]*on delete cascade/i,
    );
    expect(migration).toMatch(
      /foreign key \(food_product_id, food_product_nutrition_version_id\)[\s\S]*on delete restrict/i,
    );
  });

  it("does not activate generation cleanup or grant account cleanup to users", () => {
    expect(migration).not.toMatch(
      /activate_account_generation_cleanup|account_generation_cleanup_enabled\s*=\s*true/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.delete_user_private_data\(uuid\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.delete_user_private_data\(uuid\)[\s\S]*to service_role/i,
    );
  });
});
