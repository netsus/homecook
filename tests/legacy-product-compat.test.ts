import { describe, expect, it } from "vitest";

import {
  deleteLegacyProductPlannerRow,
  listLegacyProductPlannerRows,
  validateLegacyPlannerOwnerBootstrap,
} from "@/lib/server/legacy-product-compat";
import {
  COLUMN_A,
  COLUMN_B,
  legacyProductRows,
  OWNER_A,
  OWNER_B,
} from "./fixtures/legacy-product-compat-harness";

describe("legacy product planner compatibility", () => {
  it("returns only owner A pinned rows as read-only without current repin or recipe duplication", () => {
    const result = listLegacyProductPlannerRows({
      ownerId: OWNER_A,
      rows: legacyProductRows(),
      recipeMealIds: ["550e8400-e29b-41d4-a716-446655440999"],
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "550e8400-e29b-41d4-a716-446655440101",
        product_name: "A의 예전 요거트",
        product_brand: "옛 브랜드 A",
        product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440301",
        legacy_read_only: true,
      }),
    ]);
    expect(result[0]?.product_nutrition_version_id).not.toBe(
      "550e8400-e29b-41d4-a716-446655440401",
    );
    expect(result).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: OWNER_B })]),
    );
  });

  it("allows only owner delete and nondiscloses another owner's row with mutation zero", () => {
    const rows = legacyProductRows();
    const otherOwner = deleteLegacyProductPlannerRow({
      ownerId: OWNER_A,
      entryId: "550e8400-e29b-41d4-a716-446655440102",
      rows,
    });
    expect(otherOwner).toEqual({ ok: false, code: "RESOURCE_NOT_FOUND", mutationCount: 0 });
    expect(rows).toHaveLength(2);

    const owned = deleteLegacyProductPlannerRow({
      ownerId: OWNER_A,
      entryId: "550e8400-e29b-41d4-a716-446655440101",
      rows,
    });
    expect(owned).toEqual({ ok: true, deleted: true, mutationCount: 1 });
    expect(rows.map((row) => row.userId)).toEqual([OWNER_B]);
  });

  it("requires each bootstrapped planner column to match its auth owner", () => {
    expect(validateLegacyPlannerOwnerBootstrap({
      owners: [OWNER_A, OWNER_B],
      columns: [
        { id: COLUMN_A, userId: OWNER_A },
        { id: COLUMN_B, userId: OWNER_B },
      ],
      productRows: legacyProductRows(),
    })).toEqual({ ok: true });

    expect(validateLegacyPlannerOwnerBootstrap({
      owners: [OWNER_A, OWNER_B],
      columns: [
        { id: COLUMN_A, userId: OWNER_B },
        { id: COLUMN_B, userId: OWNER_B },
      ],
      productRows: legacyProductRows(),
    })).toEqual({ ok: false, reason: "column_owner_mismatch" });
  });
});
