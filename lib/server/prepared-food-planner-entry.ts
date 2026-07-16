import {
  FOOD_PRODUCT_BASIS_UNITS,
  type FoodProductBasisUnit,
  type FoodProductData,
} from "@/types/food-product";
import type {
  MealProductPlannerEntryData,
  ProductPlannerEntryCreateBody,
  ProductPlannerEntryData,
  ProductPlannerEntryPatchBody,
  ProductPlannerEntryQuantity,
} from "@/types/product-planner-entry";

type ValidationField = { field: string; reason: string };
type ValidationFailure = {
  ok: false;
  code: "VALIDATION_ERROR";
  fields: ValidationField[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_UNITS = new Set<string>(FOOD_PRODUCT_BASIS_UNITS);
const DATABASE_NUMERIC_MAX_EXCLUSIVE = 100_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedFields(body: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(body)
    .filter((field) => !allowed.has(field))
    .sort()
    .map((field) => ({ field, reason: "unexpected" }));
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseQuantity(value: unknown):
  | { ok: true; value: ProductPlannerEntryQuantity }
  | ValidationFailure {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "quantity", reason: "required" }],
    };
  }

  const fields = unexpectedFields(value, new Set(["amount", "unit"]))
    .map(({ field, reason }) => ({ field: `quantity.${field}`, reason }));
  if (
    typeof value.amount !== "number"
    || !Number.isFinite(value.amount)
    || value.amount <= 0
  ) {
    fields.push({ field: "quantity.amount", reason: "positive_number_required" });
  } else if (Math.round(value.amount * 10_000) <= 0) {
    fields.push({ field: "quantity.amount", reason: "numeric_precision" });
  } else if (value.amount >= DATABASE_NUMERIC_MAX_EXCLUSIVE) {
    fields.push({ field: "quantity.amount", reason: "numeric_range" });
  }
  if (typeof value.unit !== "string" || !ALLOWED_UNITS.has(value.unit)) {
    fields.push({ field: "quantity.unit", reason: "unsupported_unit" });
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };

  return {
    ok: true,
    value: {
      amount: value.amount as number,
      unit: value.unit as FoodProductBasisUnit,
    },
  };
}

export function parseProductPlannerEntryCreateBody(body: unknown):
  | { ok: true; value: ProductPlannerEntryCreateBody }
  | ValidationFailure {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "invalid_json" }],
    };
  }

  const fields = unexpectedFields(
    body,
    new Set(["product_id", "plan_date", "column_id", "quantity"]),
  );
  const productId = typeof body.product_id === "string" ? body.product_id.trim() : "";
  const planDate = typeof body.plan_date === "string" ? body.plan_date.trim() : "";
  const columnId = typeof body.column_id === "string" ? body.column_id.trim() : "";
  if (!UUID_PATTERN.test(productId)) fields.push({ field: "product_id", reason: "invalid_uuid" });
  if (!isValidDate(planDate)) fields.push({ field: "plan_date", reason: "invalid_date" });
  if (!UUID_PATTERN.test(columnId)) fields.push({ field: "column_id", reason: "invalid_uuid" });
  const quantity = parseQuantity(body.quantity);
  if (!quantity.ok) fields.push(...quantity.fields);
  if (fields.length > 0 || !quantity.ok) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return {
    ok: true,
    value: {
      product_id: productId,
      plan_date: planDate,
      column_id: columnId,
      quantity: quantity.value,
    },
  };
}

export function parseProductPlannerEntryPatchBody(body: unknown):
  | { ok: true; value: ProductPlannerEntryPatchBody }
  | ValidationFailure {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "invalid_json" }],
    };
  }
  const fields = unexpectedFields(body, new Set(["quantity"]));
  const quantity = parseQuantity(body.quantity);
  if (!quantity.ok) fields.push(...quantity.fields);
  if (fields.length > 0 || !quantity.ok) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return { ok: true, value: { quantity: quantity.value } };
}

type BasisRelation = FoodProductData["basis_relations"][number];

function isPositiveBasis(value: { amount: number; unit: FoodProductBasisUnit }) {
  return Number.isFinite(value.amount) && value.amount > 0 && ALLOWED_UNITS.has(value.unit);
}

export function resolveProductQuantityScale({
  quantity,
  basis,
  relations,
}: {
  quantity: ProductPlannerEntryQuantity;
  basis: { amount: number; unit: FoodProductBasisUnit };
  relations: BasisRelation[];
}): { ok: true; scale: number } | { ok: false; code: "NUTRITION_BASIS_MISMATCH" } {
  if (!isPositiveBasis(quantity) || !isPositiveBasis(basis)) {
    return { ok: false, code: "NUTRITION_BASIS_MISMATCH" };
  }
  if (quantity.unit === basis.unit) {
    return { ok: true, scale: quantity.amount / basis.amount };
  }

  const candidates = relations.flatMap((relation) => {
    if (!isPositiveBasis(relation.from) || !isPositiveBasis(relation.to)) return [];
    if (relation.from.unit === quantity.unit && relation.to.unit === basis.unit) {
      return [quantity.amount * relation.to.amount / relation.from.amount / basis.amount];
    }
    if (relation.to.unit === quantity.unit && relation.from.unit === basis.unit) {
      return [quantity.amount * relation.from.amount / relation.to.amount / basis.amount];
    }
    return [];
  });

  if (candidates.length !== 1 || !Number.isFinite(candidates[0]) || candidates[0]! <= 0) {
    return { ok: false, code: "NUTRITION_BASIS_MISMATCH" };
  }
  return { ok: true, scale: candidates[0]! };
}

function scaleNullable(value: number | null, scale: number) {
  return value === null ? null : value * scale;
}

export function scalePinnedProductNutrition(
  nutrition: FoodProductData["nutrition"],
  scale: number,
  quantity: ProductPlannerEntryQuantity,
): FoodProductData["nutrition"] {
  return {
    basis: { ...quantity },
    values: Object.fromEntries(
      Object.entries(nutrition.values).map(([code, value]) => [code, {
        ...value,
        amount: scaleNullable(value.amount, scale),
        known_amount: scaleNullable(value.known_amount, scale),
      }]),
    ),
    calculation_status: nutrition.calculation_status,
    calculation_quality: nutrition.calculation_quality,
    warnings: [...nutrition.warnings],
    sources: nutrition.sources.map((source) => ({ ...source })),
  };
}

export function dedupeProductPlannerEntries(entries: ProductPlannerEntryData[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function toMealProductPlannerEntry(
  entry: ProductPlannerEntryData,
): MealProductPlannerEntryData {
  return {
    entry_type: entry.entry_type,
    id: entry.id,
    product_id: entry.product_id,
    product_name: entry.product_name,
    product_brand: entry.product_brand,
    quantity: entry.quantity,
    workflow_status: entry.workflow_status,
    product_nutrition_version_id: entry.product_nutrition_version_id,
    basis_relations: entry.basis_relations,
    nutrition: entry.nutrition,
  };
}
