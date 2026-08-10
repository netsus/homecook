import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFoodCatalogSearchFingerprint,
  decodeFoodCatalogSearchCursor,
  parseFoodCatalogSearchQuery,
} from "@/lib/server/food-catalog-search";

const ROOT = process.cwd();
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440011";

function source(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("planner-shell backend compatibility floor", () => {
  it("retains owner-scoped Planner reads and the pinned legacy product projection", () => {
    const plannerRoute = source("app/api/v1/planner/route.ts");
    const plannerEntryMigration = source(
      "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
    );

    expect(plannerRoute).toContain("export async function GET");
    expect(plannerRoute).toContain('name: "list_product_planner_entries"');
    expect(plannerRoute).toContain("p_user_id: user.id");
    expect(plannerRoute).toContain("product_entries: productEntries");
    expect(plannerRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);

    const readFunction = plannerEntryMigration.slice(
      plannerEntryMigration.indexOf("create function public.list_product_planner_entries"),
      plannerEntryMigration.indexOf("create function public.delete_owned_planner_column"),
    );
    expect(readFunction).toContain("perform public.assert_food_product_actor(p_user_id)");
    expect(readFunction).toContain("where entry.user_id = p_user_id");
    expect(readFunction).toContain("context.product_nutrition_version_id");
    expect(readFunction).toContain("context.product_name_snapshot");
    expect(readFunction).not.toContain("current_nutrition_version_id");
  });

  it("keeps planner nutrition GET-only while retaining legacy product server contracts", () => {
    const nutritionRoute = source("app/api/v1/planner/nutrition/route.ts");
    const collectionRoute = source("app/api/v1/product-planner-entries/route.ts");
    const itemRoute = source(
      "app/api/v1/product-planner-entries/[entry_id]/route.ts",
    );

    expect(nutritionRoute).toContain("export async function GET");
    expect(nutritionRoute).toContain("readPlannerNutritionSummary");
    expect(nutritionRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);

    expect(collectionRoute).toContain("export async function POST");
    expect(itemRoute).toContain("export async function PATCH");
    expect(itemRoute).toContain("export async function DELETE");
    expect(itemRoute).toContain('fail("UNAUTHORIZED"');
    expect(itemRoute).toContain('fail("FORBIDDEN"');
    expect(itemRoute).toContain('fail("RESOURCE_NOT_FOUND"');
    expect(itemRoute).toContain("p_user_id: required.user.id");
    expect(itemRoute).toContain("p_entry_id: required.entryId");
  });

  it("dual-decodes the versionless v1 product cursor without widening it to mixed search", () => {
    const fingerprint = buildFoodCatalogSearchFingerprint({
      q: "",
      types: ["food_product"],
      source: null,
    });
    const legacyCursor = Buffer.from(JSON.stringify({
      created_at: "2026-07-25T12:00:00.123456Z",
      id: PRODUCT_ID,
    }), "utf8").toString("base64url");

    expect(decodeFoodCatalogSearchCursor(legacyCursor, fingerprint)).toEqual({
      version: 1,
      created_at: "2026-07-25T12:00:00.123456Z",
      stable_id: PRODUCT_ID,
    });
    expect(parseFoodCatalogSearchQuery(new URLSearchParams({
      types: "food_product",
      cursor: legacyCursor,
    }))).toMatchObject({
      ok: true,
      value: {
        cursor: {
          version: 1,
          stable_id: PRODUCT_ID,
        },
      },
    });
    expect(parseFoodCatalogSearchQuery(new URLSearchParams({
      types: "ingredient,food_product",
      cursor: legacyCursor,
    }))).toMatchObject({
      ok: false,
      fields: [
        {
          field: "cursor",
          reason: "legacy_product_cursor_requires_food_product_only",
        },
      ],
    });
  });

  it.each([
    "app/api/v1/shopping/lists/[list_id]/items/[item_id]/route.ts",
    "app/api/v1/shopping/lists/[list_id]/items/bulk/route.ts",
    "app/api/v1/shopping/lists/[list_id]/items/reorder/route.ts",
  ])("blocks completed-shopping mutation before any item update: %s", (path) => {
    const route = source(path);
    const completedGuard = route.indexOf("if (listResult.data.is_completed)");
    const conflictResponse = route.indexOf(
      'return fail("CONFLICT", "완료된 장보기 기록은 수정할 수 없어요.", 409)',
      completedGuard,
    );
    const firstMutation = route.indexOf(".update(", completedGuard);

    expect(completedGuard).toBeGreaterThan(-1);
    expect(conflictResponse).toBeGreaterThan(completedGuard);
    expect(firstMutation).toBeGreaterThan(conflictResponse);
  });

  it("keeps owner nondisclosure inside the authenticated database boundary", () => {
    const authorizationMigration = source(
      "supabase/migrations/20260723090000_security_definer_mutation_authorization_hotfix.sql",
    );
    const plannerEntryMigration = source(
      "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
    );

    expect(authorizationMigration).toContain(
      "public.list_product_planner_entries(uuid, date, date, uuid)",
    );
    expect(authorizationMigration).toContain("authenticated-self");
    expect(authorizationMigration).toContain("array['authenticated', 'service_role']");
    expect(plannerEntryMigration).toContain("where id = p_entry_id and user_id = p_user_id");
    expect(plannerEntryMigration).toContain("where entry.user_id = p_user_id");
  });
});
