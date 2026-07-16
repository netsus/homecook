import {
  FOOD_PRODUCT_BASIS_UNITS,
  FOOD_PRODUCT_CORE_NUTRIENTS,
  FOOD_PRODUCT_OPTIONAL_NUTRIENTS,
  type FoodProductCreateInput,
  type FoodProductNutritionInput,
  type FoodProductPatchInput,
} from "@/types/food-product";

type ValidationField = { field: string; reason: string };
type ValidationFailure = {
  ok: false;
  code: "VALIDATION_ERROR" | "UNSUPPORTED_NUTRIENT";
  fields: ValidationField[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_NUTRIENTS = new Set<string>([
  ...FOOD_PRODUCT_CORE_NUTRIENTS,
  ...FOOD_PRODUCT_OPTIONAL_NUTRIENTS,
]);
const ALLOWED_BASIS_UNITS = new Set<string>(FOOD_PRODUCT_BASIS_UNITS);
const DATABASE_NUMERIC_MAX_EXCLUSIVE = 100_000_000;
const POSTGRES_UTC_CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,6})Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedFields(body: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(body)
    .filter((field) => !allowed.has(field))
    .sort()
    .map((field) => ({ field, reason: "unexpected" }));
}

function normalizeName(value: unknown, field: string, fields: ValidationField[]) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, reason: "required" });
    return "";
  }

  const normalized = value.trim();
  if (normalized.length > 200) {
    fields.push({ field, reason: "max_length" });
  }
  return normalized;
}

function normalizeBrand(value: unknown, field: string, fields: ValidationField[]) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    fields.push({ field, reason: "string_or_null" });
    return null;
  }

  const normalized = value.trim();
  if (normalized.length > 200) {
    fields.push({ field, reason: "max_length" });
  }
  return normalized.length === 0 ? null : normalized;
}

function parseNutrition(value: unknown):
  | { ok: true; value: FoodProductNutritionInput }
  | ValidationFailure {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "nutrition", reason: "required" }],
    };
  }

  const unexpectedNutrition = unexpectedFields(value, new Set(["basis", "values"]))
    .map(({ field, reason }) => ({ field: `nutrition.${field}`, reason }));
  const fields: ValidationField[] = [...unexpectedNutrition];
  const basis = isRecord(value.basis) ? value.basis : {};
  fields.push(...unexpectedFields(basis, new Set(["amount", "unit"]))
    .map(({ field, reason }) => ({ field: `nutrition.basis.${field}`, reason })));

  const basisAmount = basis.amount;
  if (typeof basisAmount !== "number" || !Number.isFinite(basisAmount) || basisAmount <= 0) {
    fields.push({ field: "nutrition.basis.amount", reason: "positive_number_required" });
  } else if (basisAmount >= DATABASE_NUMERIC_MAX_EXCLUSIVE) {
    fields.push({ field: "nutrition.basis.amount", reason: "numeric_range" });
  }

  const basisUnit = basis.unit;
  if (typeof basisUnit !== "string" || !ALLOWED_BASIS_UNITS.has(basisUnit)) {
    fields.push({ field: "nutrition.basis.unit", reason: "unsupported_unit" });
  }

  const values = isRecord(value.values) ? value.values : {};
  const unsupported = Object.keys(values)
    .filter((code) => !ALLOWED_NUTRIENTS.has(code))
    .sort()
    .map((code) => ({
      field: `nutrition.values.${code}`,
      reason: "unsupported_nutrient",
    }));
  if (unsupported.length > 0) {
    return { ok: false, code: "UNSUPPORTED_NUTRIENT", fields: unsupported };
  }

  const normalizedValues: Record<string, number | null> = {};
  for (const code of [...FOOD_PRODUCT_CORE_NUTRIENTS, ...FOOD_PRODUCT_OPTIONAL_NUTRIENTS]) {
    if (!(code in values)) continue;
    const nutrientValue = values[code];
    if (code === "energy_kcal" && nutrientValue === null) {
      fields.push({ field: `nutrition.values.${code}`, reason: "required" });
      continue;
    }
    if (nutrientValue === null && code !== "energy_kcal") {
      normalizedValues[code] = null;
      continue;
    }
    if (typeof nutrientValue !== "number" || !Number.isFinite(nutrientValue) || nutrientValue < 0) {
      fields.push({
        field: `nutrition.values.${code}`,
        reason: code === "energy_kcal"
          ? "finite_nonnegative_number_required"
          : "finite_nonnegative_number_or_null",
      });
      continue;
    }
    if (nutrientValue >= DATABASE_NUMERIC_MAX_EXCLUSIVE) {
      fields.push({ field: `nutrition.values.${code}`, reason: "numeric_range" });
      continue;
    }
    normalizedValues[code] = nutrientValue;
  }

  if (!("energy_kcal" in values)) {
    fields.push({ field: "nutrition.values.energy_kcal", reason: "required" });
  }
  if (fields.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }

  return {
    ok: true,
    value: {
      basis: {
        amount: basisAmount as number,
        unit: basisUnit as FoodProductNutritionInput["basis"]["unit"],
      },
      values: normalizedValues as FoodProductNutritionInput["values"],
    },
  };
}

export function parseProductCreateBody(body: unknown):
  | { ok: true; value: FoodProductCreateInput }
  | ValidationFailure {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "invalid_json" }],
    };
  }

  const unexpected = unexpectedFields(body, new Set(["name", "brand", "nutrition"]));
  if (unexpected.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields: unexpected };
  }

  const fields: ValidationField[] = [];
  const name = normalizeName(body.name, "name", fields);
  const brand = normalizeBrand(body.brand, "brand", fields);
  const nutrition = parseNutrition(body.nutrition);
  if (!nutrition.ok) {
    if (nutrition.code === "UNSUPPORTED_NUTRIENT") return nutrition;
    fields.push(...nutrition.fields);
  }
  if (fields.length > 0 || !nutrition.ok) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }

  return { ok: true, value: { name, brand, nutrition: nutrition.value } };
}

export function parseProductPatchBody(body: unknown):
  | { ok: true; value: FoodProductPatchInput; changesNutrition: boolean }
  | ValidationFailure {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "invalid_json" }],
    };
  }
  const unexpected = unexpectedFields(body, new Set(["name", "brand", "nutrition"]));
  if (unexpected.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields: unexpected };
  }
  if (Object.keys(body).length === 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "empty_patch" }],
    };
  }

  const fields: ValidationField[] = [];
  const patch: FoodProductPatchInput = {};
  if ("name" in body) patch.name = normalizeName(body.name, "name", fields);
  if ("brand" in body) patch.brand = normalizeBrand(body.brand, "brand", fields);
  if ("nutrition" in body) {
    const nutrition = parseNutrition(body.nutrition);
    if (!nutrition.ok) return nutrition;
    patch.nutrition = nutrition.value;
  }
  if (fields.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return { ok: true, value: patch, changesNutrition: "nutrition" in patch };
}

export interface ProductCursor {
  createdAt: string;
  id: string;
}

export function encodeProductCursor(cursor: ProductCursor) {
  return Buffer.from(JSON.stringify({ created_at: cursor.createdAt, id: cursor.id }), "utf8")
    .toString("base64url");
}

export function decodeProductCursor(value: string): ProductCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed) || typeof parsed.created_at !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (!UUID_PATTERN.test(parsed.id)) return null;
    const timestampMatch = POSTGRES_UTC_CURSOR_PATTERN.exec(parsed.created_at);
    if (!timestampMatch) return null;
    const millisecondIso = `${timestampMatch[1]}.${timestampMatch[2].padEnd(3, "0").slice(0, 3)}Z`;
    const date = new Date(millisecondIso);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== millisecondIso) return null;
    return { createdAt: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

export function parseProductListQuery(params: URLSearchParams):
  | { ok: true; value: { q: string; cursor: ProductCursor | null; limit: number } }
  | ValidationFailure {
  const fields: ValidationField[] = [];
  const q = params.get("q")?.trim() ?? "";
  const cursorValue = params.get("cursor")?.trim() ?? "";
  const cursor = cursorValue ? decodeProductCursor(cursorValue) : null;
  if (cursorValue && cursor === null) {
    fields.push({ field: "cursor", reason: "invalid_cursor" });
  }
  const limitValue = params.get("limit")?.trim();
  const limit = limitValue === undefined || limitValue === null || limitValue === ""
    ? 20
    : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    fields.push({ field: "limit", reason: "integer_between_1_and_50" });
  }
  if (fields.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return { ok: true, value: { q, cursor, limit } };
}
