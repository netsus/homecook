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
const NUTRIENT_STATUSES = new Set<string>(["complete", "partial", "unavailable"]);
const NUTRIENT_DISPLAY_MODES = new Set<string>(["total", "minimum"]);
const CALCULATION_STATUSES = new Set<string>(["complete", "partial", "unavailable"]);
const CALCULATION_QUALITIES = new Set<string>(["direct", "estimated", "mixed"]);
const DATABASE_NUMERIC_MAX_EXCLUSIVE = 100_000_000;

type ProductNutrition = FoodProductData["nutrition"];
type ProductNutrientValue = ProductNutrition["values"][string];
type ProductSource = ProductNutrition["sources"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFoodProductBasisUnit(value: unknown): value is FoodProductBasisUnit {
  return typeof value === "string" && ALLOWED_UNITS.has(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseReadBasis(
  value: unknown,
): { amount: number; unit: FoodProductBasisUnit } | null {
  if (
    !isRecord(value)
    || typeof value.amount !== "number"
    || !Number.isFinite(value.amount)
    || value.amount <= 0
    || !isFoodProductBasisUnit(value.unit)
  ) {
    return null;
  }
  return { amount: value.amount, unit: value.unit };
}

function isNutrientStatus(value: unknown): value is ProductNutrientValue["status"] {
  return typeof value === "string" && NUTRIENT_STATUSES.has(value);
}

function isNutrientDisplayMode(
  value: unknown,
): value is ProductNutrientValue["display_mode"] {
  return value === null
    || (typeof value === "string" && NUTRIENT_DISPLAY_MODES.has(value));
}

function parseNutrientValue(value: unknown): ProductNutrientValue | null {
  if (
    !isRecord(value)
    || (value.amount !== null
      && (typeof value.amount !== "number" || !Number.isFinite(value.amount)))
    || (value.known_amount !== null
      && (typeof value.known_amount !== "number" || !Number.isFinite(value.known_amount)))
    || !isNutrientStatus(value.status)
    || !isNutrientDisplayMode(value.display_mode)
  ) {
    return null;
  }
  return {
    amount: value.amount,
    known_amount: value.known_amount,
    status: value.status,
    display_mode: value.display_mode,
  };
}

function parseProductSource(value: unknown): ProductSource | null {
  if (
    !isRecord(value)
    || typeof value.provider !== "string"
    || !isNullableString(value.dataset)
    || !isNullableString(value.source_version)
    || !isNullableString(value.data_basis_date)
    || !isNullableString(value.license)
    || !isNullableString(value.source_url)
  ) {
    return null;
  }
  return {
    provider: value.provider,
    dataset: value.dataset,
    source_version: value.source_version,
    data_basis_date: value.data_basis_date,
    license: value.license,
    source_url: value.source_url,
  };
}

function isCalculationStatus(
  value: unknown,
): value is ProductNutrition["calculation_status"] {
  return typeof value === "string" && CALCULATION_STATUSES.has(value);
}

function isCalculationQuality(
  value: unknown,
): value is ProductNutrition["calculation_quality"] {
  return value === null
    || (typeof value === "string" && CALCULATION_QUALITIES.has(value));
}

function parseProductNutrition(value: unknown): ProductNutrition | null {
  if (
    !isRecord(value)
    || (value.label_basis_text !== undefined && !isNullableString(value.label_basis_text))
    || !isRecord(value.values)
    || !isCalculationStatus(value.calculation_status)
    || !isCalculationQuality(value.calculation_quality)
    || !Array.isArray(value.warnings)
    || !value.warnings.every((warning) => typeof warning === "string")
    || !Array.isArray(value.sources)
  ) {
    return null;
  }

  const basis = parseReadBasis(value.basis);
  if (!basis) return null;

  const values: ProductNutrition["values"] = {};
  for (const [code, nutrient] of Object.entries(value.values)) {
    const parsedNutrient = parseNutrientValue(nutrient);
    if (!parsedNutrient) return null;
    values[code] = parsedNutrient;
  }

  const sources: ProductSource[] = [];
  for (const source of value.sources) {
    const parsedSource = parseProductSource(source);
    if (!parsedSource) return null;
    sources.push(parsedSource);
  }

  const nutrition: ProductNutrition = {
    basis,
    values,
    calculation_status: value.calculation_status,
    calculation_quality: value.calculation_quality,
    warnings: [...value.warnings],
    sources,
  };
  if (value.label_basis_text !== undefined) {
    nutrition.label_basis_text = value.label_basis_text;
  }
  return nutrition;
}

function parseProductPlannerEntry(value: unknown): ProductPlannerEntryData | null {
  if (
    !isRecord(value)
    || value.entry_type !== "product"
    || typeof value.id !== "string"
    || typeof value.product_id !== "string"
    || typeof value.product_name !== "string"
    || !isNullableString(value.product_brand)
    || typeof value.plan_date !== "string"
    || typeof value.column_id !== "string"
    || value.workflow_status !== null
    || typeof value.product_nutrition_version_id !== "string"
    || !Array.isArray(value.basis_relations)
  ) {
    return null;
  }

  const quantity = parseReadBasis(value.quantity);
  const nutrition = parseProductNutrition(value.nutrition);
  if (!quantity || !nutrition) return null;

  const basisRelations: FoodProductData["basis_relations"] = [];
  for (const relation of value.basis_relations) {
    if (!isRecord(relation)) return null;
    const from = parseReadBasis(relation.from);
    const to = parseReadBasis(relation.to);
    if (!from || !to) return null;
    basisRelations.push({ from, to });
  }

  return {
    entry_type: value.entry_type,
    id: value.id,
    product_id: value.product_id,
    product_name: value.product_name,
    product_brand: value.product_brand,
    plan_date: value.plan_date,
    column_id: value.column_id,
    quantity,
    workflow_status: value.workflow_status,
    product_nutrition_version_id: value.product_nutrition_version_id,
    basis_relations: basisRelations,
    nutrition,
  };
}

export function parseProductPlannerEntries(value: unknown): ProductPlannerEntryData[] | null {
  if (!Array.isArray(value)) return null;
  const entries: ProductPlannerEntryData[] = [];
  for (const entry of value) {
    const parsedEntry = parseProductPlannerEntry(entry);
    if (!parsedEntry) return null;
    entries.push(parsedEntry);
  }
  return entries;
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
