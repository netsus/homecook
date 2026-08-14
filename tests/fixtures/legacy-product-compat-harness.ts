import type {
  LegacyCompatibilityReceiptStore,
  LegacyProductPlannerRow,
} from "@/lib/server/legacy-product-compat";

export const OWNER_A = "550e8400-e29b-41d4-a716-446655440001";
export const OWNER_B = "550e8400-e29b-41d4-a716-446655440002";
export const COLUMN_A = "550e8400-e29b-41d4-a716-446655440011";
export const COLUMN_B = "550e8400-e29b-41d4-a716-446655440012";

export function legacyProductRows(): LegacyProductPlannerRow[] {
  return [
    {
      id: "550e8400-e29b-41d4-a716-446655440101",
      userId: OWNER_A,
      columnId: COLUMN_A,
      productId: "550e8400-e29b-41d4-a716-446655440201",
      productName: "A의 예전 요거트",
      productBrand: "옛 브랜드 A",
      quantity: { amount: 1, unit: "serving" },
      pinnedNutritionVersionId: "550e8400-e29b-41d4-a716-446655440301",
      currentNutritionVersionId: "550e8400-e29b-41d4-a716-446655440401",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440102",
      userId: OWNER_B,
      columnId: COLUMN_B,
      productId: "550e8400-e29b-41d4-a716-446655440202",
      productName: "B의 예전 두유",
      productBrand: "옛 브랜드 B",
      quantity: { amount: 250, unit: "ml" },
      pinnedNutritionVersionId: "550e8400-e29b-41d4-a716-446655440302",
      currentNutritionVersionId: "550e8400-e29b-41d4-a716-446655440402",
    },
  ];
}

export class MemoryLegacyCompatibilityReceiptStore<Result>
implements LegacyCompatibilityReceiptStore<Result> {
  private readonly receipts = new Map<string, { payloadHash: string; result: Result }>();

  async read(scope: string, key: string) {
    return this.receipts.get(`${scope}:${key}`) ?? null;
  }

  async commit(scope: string, key: string, payloadHash: string, result: Result) {
    this.receipts.set(`${scope}:${key}`, { payloadHash, result });
  }
}
