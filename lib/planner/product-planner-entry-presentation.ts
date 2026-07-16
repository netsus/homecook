import {
  FOOD_PRODUCT_BASIS_UNITS,
  type FoodProductBasisUnit,
  type FoodProductData,
  type FoodProductNutrientValue,
} from "@/types/food-product";
import type { MealListItemData } from "@/types/meal";
import type { PlannerMealData } from "@/types/planner";
import type {
  MealProductPlannerEntryData,
  ProductPlannerEntryData,
} from "@/types/product-planner-entry";

export type PlannerDisplayEntry =
  | { key: string; entry_type: "recipe"; recipe: PlannerMealData }
  | { key: string; entry_type: "product"; product: ProductPlannerEntryData };

export type MealScreenDisplayEntry =
  | { key: string; entry_type: "recipe"; recipe: MealListItemData }
  | { key: string; entry_type: "product"; product: MealProductPlannerEntryData };

function uniqueProducts<T extends { id: string }>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function mergePlannerEntries(
  recipes: PlannerMealData[],
  products: ProductPlannerEntryData[],
): PlannerDisplayEntry[] {
  return [
    ...recipes.map((recipe) => ({
      key: `recipe:${recipe.id}`,
      entry_type: "recipe" as const,
      recipe,
    })),
    ...uniqueProducts(products).map((product) => ({
      key: `product:${product.id}`,
      entry_type: "product" as const,
      product,
    })),
  ];
}

export function mergeMealScreenEntries(
  recipes: MealListItemData[],
  products: MealProductPlannerEntryData[],
): MealScreenDisplayEntry[] {
  return [
    ...recipes.map((recipe) => ({
      key: `recipe:${recipe.id}`,
      entry_type: "recipe" as const,
      recipe,
    })),
    ...uniqueProducts(products).map((product) => ({
      key: `product:${product.id}`,
      entry_type: "product" as const,
      product,
    })),
  ];
}

function isPositiveAmount(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function buildCompatibleFoodProductUnits(
  product: Pick<FoodProductData, "basis_relations" | "nutrition">,
) {
  const basisUnit = product.nutrition.basis.unit;
  return FOOD_PRODUCT_BASIS_UNITS.filter((candidate) => {
    if (candidate === basisUnit) return true;

    const matches = product.basis_relations.filter((relation) => {
      if (!isPositiveAmount(relation.from.amount) || !isPositiveAmount(relation.to.amount)) {
        return false;
      }
      return (
        (relation.from.unit === basisUnit && relation.to.unit === candidate) ||
        (relation.to.unit === basisUnit && relation.from.unit === candidate)
      );
    });
    return matches.length === 1;
  });
}

export function formatProductUnit(unit: FoodProductBasisUnit) {
  if (unit === "serving") return "회";
  if (unit === "package") return "팩";
  if (unit === "ml") return "mL";
  return "g";
}

function isObserved(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

export function formatProductExpectedEnergy(
  value: FoodProductNutrientValue | undefined,
) {
  if (value?.status === "complete" && isObserved(value.amount)) {
    return `예상 열량 ${formatAmount(value.amount)} kcal`;
  }
  if (value?.status === "partial" && isObserved(value.known_amount)) {
    return `예상 열량 최소 ${formatAmount(value.known_amount)} kcal`;
  }
  return "예상 열량 정보 준비 중";
}

const CORE_NUTRIENT_META = [
  { code: "carbohydrate_g", label: "탄수화물", unit: "g" },
  { code: "protein_g", label: "단백질", unit: "g" },
  { code: "fat_g", label: "지방", unit: "g" },
  { code: "sodium_mg", label: "나트륨", unit: "mg" },
] as const;

function directQuantityScale(
  product: Pick<FoodProductData, "basis_relations" | "nutrition">,
  quantity?: { amount: number; unit: FoodProductBasisUnit },
) {
  if (!quantity || !isPositiveAmount(quantity.amount)) return 1;
  const basis = product.nutrition.basis;
  if (!isPositiveAmount(basis.amount)) return null;
  if (quantity.unit === basis.unit) return quantity.amount / basis.amount;

  const relations = product.basis_relations.filter((relation) =>
    isPositiveAmount(relation.from.amount) &&
    isPositiveAmount(relation.to.amount) &&
    ((relation.from.unit === basis.unit && relation.to.unit === quantity.unit) ||
      (relation.to.unit === basis.unit && relation.from.unit === quantity.unit)),
  );
  if (relations.length !== 1) return null;
  const relation = relations[0];
  const basisAmount = relation.from.unit === basis.unit
    ? (quantity.amount / relation.to.amount) * relation.from.amount
    : (quantity.amount / relation.from.amount) * relation.to.amount;
  return basisAmount / basis.amount;
}

function scaleNutrientValue(value: FoodProductNutrientValue | undefined, scale: number | null) {
  if (!value || scale === null) return value;
  return {
    ...value,
    amount: isObserved(value.amount) ? value.amount * scale : value.amount,
    known_amount: isObserved(value.known_amount) ? value.known_amount * scale : value.known_amount,
  };
}

export function formatFoodProductExpectedEnergy(
  product: Pick<FoodProductData, "basis_relations" | "nutrition">,
  quantity?: { amount: number; unit: FoodProductBasisUnit },
) {
  const scale = directQuantityScale(product, quantity);
  return formatProductExpectedEnergy(
    scaleNutrientValue(product.nutrition.values.energy_kcal, scale),
  );
}

export function getFoodProductCoreNutritionLines(
  product: Pick<FoodProductData, "basis_relations" | "nutrition">,
  quantity?: { amount: number; unit: FoodProductBasisUnit },
) {
  const scale = directQuantityScale(product, quantity);
  return CORE_NUTRIENT_META.map(({ code, label, unit }) => {
    const value = scaleNutrientValue(product.nutrition.values[code], scale);
    if (value?.status === "complete" && isObserved(value.amount)) {
      return `${label} ${formatAmount(value.amount)} ${unit}`;
    }
    if (value?.status === "partial" && isObserved(value.known_amount)) {
      return `${label} 최소 ${formatAmount(value.known_amount)} ${unit}`;
    }
    return `${label} 정보 준비 중`;
  });
}

export function formatProductQuantity({
  amount,
  unit,
}: {
  amount: number;
  unit: FoodProductBasisUnit;
}) {
  return `${formatAmount(amount)}${formatProductUnit(unit)}`;
}
