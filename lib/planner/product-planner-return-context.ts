import {
  FOOD_PRODUCT_BASIS_UNITS,
  FOOD_PRODUCT_CORE_NUTRIENTS,
  FOOD_PRODUCT_OPTIONAL_NUTRIENTS,
  type FoodProductBasisUnit,
  type FoodProductListSource,
  type FoodProductNutrientCode,
} from "@/types/food-product";

export const PRODUCT_PLANNER_RETURN_CONTEXT_KEY =
  "homecook.food-product-planner-return-context.v1";

const UNITS = new Set<string>(FOOD_PRODUCT_BASIS_UNITS);
const NUTRIENTS = new Set<string>([
  ...FOOD_PRODUCT_CORE_NUTRIENTS,
  ...FOOD_PRODUCT_OPTIONAL_NUTRIENTS,
]);

export interface FoodProductDraftContext {
  name: string;
  brand: string;
  basisAmount: string;
  basisUnit: FoodProductBasisUnit;
  labelBasisText: string;
  energy: string;
  nutrients: Partial<Record<Exclude<FoodProductNutrientCode, "energy_kcal">, string>>;
}

interface BaseReturnContext {
  version: 1;
  planDate: string;
  columnId: string;
  slotName: string;
}

export interface ProductPickerReturnContext extends BaseReturnContext {
  kind: "picker";
  query: string;
  source: FoodProductListSource;
  productId: string | null;
  quantityAmount: string;
  quantityUnit: FoodProductBasisUnit | null;
}

export interface ProductCreateReturnContext extends BaseReturnContext {
  kind: "create";
  query: string;
  source: FoodProductListSource;
  draft: FoodProductDraftContext;
  productId?: string;
  action?: "edit";
}

export interface ProductMealEntryReturnContext extends BaseReturnContext {
  kind: "meal-entry";
  entryId: string;
  action: "edit" | "delete";
  quantityAmount?: string;
  quantityUnit?: FoodProductBasisUnit;
}

export type ProductPlannerReturnContext =
  | ProductPickerReturnContext
  | ProductCreateReturnContext
  | ProductMealEntryReturnContext;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeText(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.length <= max;
}

function isUnit(value: unknown): value is FoodProductBasisUnit {
  return typeof value === "string" && UNITS.has(value);
}

function isSource(value: unknown): value is FoodProductListSource {
  return value === "all" || value === "public_dataset" || value === "manual";
}

function isBase(value: Record<string, unknown>) {
  return (
    value.version === 1 &&
    isSafeText(value.planDate, 32) &&
    isSafeText(value.columnId, 160) &&
    isSafeText(value.slotName, 80)
  );
}

function isDraft(value: unknown): value is FoodProductDraftContext {
  if (!isPlainRecord(value)) return false;
  const exactKeys = Object.keys(value).sort();
  const modernKeys = ["name", "brand", "basisAmount", "basisUnit", "labelBasisText", "energy", "nutrients"].sort();
  const legacyKeys = ["name", "brand", "basisAmount", "basisUnit", "energy", "nutrients"].sort();
  const supportsModern =
    exactKeys.length === modernKeys.length &&
    exactKeys.every((key, index) => key === modernKeys[index]);
  const supportsLegacy =
    exactKeys.length === legacyKeys.length &&
    exactKeys.every((key, index) => key === legacyKeys[index]);
  if (!supportsModern && !supportsLegacy) {
    return false;
  }
  if (
    !isSafeText(value.name, 120) ||
    !isSafeText(value.brand, 120) ||
    !isSafeText(value.basisAmount, 40) ||
    !isUnit(value.basisUnit) ||
    (value.labelBasisText !== undefined && !isSafeText(value.labelBasisText, 120)) ||
    !isSafeText(value.energy, 40) ||
    !isPlainRecord(value.nutrients)
  ) {
    return false;
  }
  return Object.entries(value.nutrients).every(
    ([key, nutrientValue]) =>
      key !== "energy_kcal" && NUTRIENTS.has(key) && isSafeText(nutrientValue, 40),
  );
}

function parseContext(value: unknown): ProductPlannerReturnContext | null {
  if (!isPlainRecord(value) || !isBase(value) || typeof value.kind !== "string") return null;

  if (value.kind === "picker") {
    const modernKeys = [
      "version", "kind", "planDate", "columnId", "slotName", "query", "source",
      "productId", "quantityAmount", "quantityUnit",
    ];
    const legacyKeys = [
      "version", "kind", "planDate", "columnId", "slotName", "query",
      "productId", "quantityAmount", "quantityUnit",
    ];
    if (!hasExactKeys(value, modernKeys) && !hasExactKeys(value, legacyKeys)) return null;
    if (
      !isSafeText(value.query, 200) ||
      (value.source !== undefined && !isSource(value.source)) ||
      (value.productId !== null && !isSafeText(value.productId, 160)) ||
      !isSafeText(value.quantityAmount, 40) ||
      (value.quantityUnit !== null && !isUnit(value.quantityUnit))
    ) return null;
    return {
      ...value,
      source: isSource(value.source) ? value.source : "all",
    } as ProductPickerReturnContext;
  }

  if (value.kind === "create") {
    const modernKeys = [
      "version", "kind", "planDate", "columnId", "slotName", "query", "source", "draft",
    ];
    const editKeys = [
      "version", "kind", "planDate", "columnId", "slotName", "query", "source", "draft", "productId", "action",
    ];
    const legacyKeys = [
      "version", "kind", "planDate", "columnId", "slotName", "query", "draft",
    ];
    if (!hasExactKeys(value, modernKeys) && !hasExactKeys(value, legacyKeys) && !hasExactKeys(value, editKeys)) return null;
    if (
      !isSafeText(value.query, 200) ||
      (value.source !== undefined && !isSource(value.source)) ||
      !isDraft(value.draft) ||
      (value.productId !== undefined && !isSafeText(value.productId, 160)) ||
      (value.action !== undefined && value.action !== "edit") ||
      ((value.productId === undefined) !== (value.action === undefined))
    ) return null;
    return {
      ...value,
      source: isSource(value.source) ? value.source : "all",
      draft: {
        ...value.draft,
        labelBasisText:
          typeof value.draft.labelBasisText === "string" ? value.draft.labelBasisText : "",
      },
    } as ProductCreateReturnContext;
  }

  if (value.kind === "meal-entry") {
    const required = ["version", "kind", "planDate", "columnId", "slotName", "entryId", "action"];
    const optional = ["quantityAmount", "quantityUnit"];
    const keys = Object.keys(value);
    if (!required.every((key) => keys.includes(key)) || keys.some((key) => ![...required, ...optional].includes(key))) {
      return null;
    }
    if (
      !isSafeText(value.entryId, 160) ||
      (value.action !== "edit" && value.action !== "delete") ||
      (value.quantityAmount !== undefined && !isSafeText(value.quantityAmount, 40)) ||
      (value.quantityUnit !== undefined && !isUnit(value.quantityUnit))
    ) return null;
    return value as unknown as ProductMealEntryReturnContext;
  }

  return null;
}

export function clearProductPlannerReturnContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY);
  } catch {
    // Storage is an optional local return aid.
  }
}

export function readProductPlannerReturnContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = parseContext(JSON.parse(raw));
    if (!parsed) clearProductPlannerReturnContext();
    return parsed;
  } catch {
    clearProductPlannerReturnContext();
    return null;
  }
}

export function saveProductPlannerReturnContext(context: ProductPlannerReturnContext) {
  if (typeof window === "undefined") return;
  const safe = parseContext(context);
  if (!safe) {
    clearProductPlannerReturnContext();
    return;
  }
  try {
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify(safe));
  } catch {
    // URL fallback keeps navigation usable when session storage is unavailable.
  }
}
