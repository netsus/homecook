import type { ShoppingListCreateBody } from "@/types/shopping";

export interface MealPreviewRow {
  id: string;
  status: string;
  shopping_list_id: string | null;
}

export interface ParsedShoppingMealConfig {
  meal_id: string;
  shopping_servings: number;
}

export interface ParseShoppingMealConfigsResult {
  valid_configs: ParsedShoppingMealConfig[];
  fields: Array<{ field: string; reason: string }>;
}

export interface IngredientAggregationInput {
  ingredient_id: string;
  standard_name: string;
  ingredient_type: "QUANT" | "TO_TASTE";
  amount: number | null;
  unit: string | null;
  display_text: string | null;
  planned_servings: number;
  shopping_servings: number;
}

export interface AggregatedShoppingIngredient {
  ingredient_id: string;
  standard_name: string;
  display_text: string;
  amounts_json: Array<{ amount: number; unit: string }>;
}

interface NumericPart {
  amount: number;
  unit: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONVERTIBLE_UNITS = new Map<
  string,
  {
    family: "mass" | "volume";
    base_unit: "g" | "ml";
    factor: number;
  }
>([
  ["g", { family: "mass", base_unit: "g", factor: 1 }],
  ["kg", { family: "mass", base_unit: "g", factor: 1000 }],
  ["ml", { family: "volume", base_unit: "ml", factor: 1 }],
  ["l", { family: "volume", base_unit: "ml", factor: 1000 }],
]);

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeUnitForConversion(unit: string) {
  return unit.trim().toLowerCase();
}

function formatAmount(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
}

function toPositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function extractToTasteText(standardName: string, displayText: string | null) {
  if (!displayText) {
    return "적당량";
  }

  const normalized = displayText.trim();

  if (!normalized) {
    return "적당량";
  }

  if (normalized.startsWith(standardName)) {
    const suffix = normalized.slice(standardName.length).trim();

    return suffix || "적당량";
  }

  return normalized;
}

export function isMealEligibleForShopping(row: MealPreviewRow) {
  return row.status === "registered" && row.shopping_list_id === null;
}

export function parseShoppingMealConfigs(body: ShoppingListCreateBody): ParseShoppingMealConfigsResult {
  const fields: Array<{ field: string; reason: string }> = [];
  const rawConfigs = body.meal_configs;

  if (!Array.isArray(rawConfigs) || rawConfigs.length === 0) {
    return {
      valid_configs: [],
      fields: [{ field: "meal_configs", reason: "required_non_empty" }],
    };
  }

  const deduped = new Map<string, ParsedShoppingMealConfig>();

  rawConfigs.forEach((config, index) => {
    const mealId = typeof config?.meal_id === "string" ? config.meal_id.trim() : "";
    const servings = toPositiveNumber(config?.shopping_servings);

    if (servings === null || !Number.isInteger(servings) || servings < 1) {
      fields.push({ field: `meal_configs[${index}].shopping_servings`, reason: "min_value" });
      return;
    }

    if (!mealId || !isUuid(mealId)) {
      return;
    }

    deduped.set(mealId, {
      meal_id: mealId,
      shopping_servings: servings,
    });
  });

  return {
    valid_configs: [...deduped.values()],
    fields,
  };
}

export function aggregateShoppingIngredients(
  inputs: IngredientAggregationInput[],
): AggregatedShoppingIngredient[] {
  const grouped = new Map<
    string,
    {
      standard_name: string;
      numeric: Map<string, NumericPart>;
      text: Set<string>;
    }
  >();

  inputs.forEach((input) => {
    const ingredientState = grouped.get(input.ingredient_id) ?? {
      standard_name: input.standard_name,
      numeric: new Map<string, NumericPart>(),
      text: new Set<string>(),
    };

    grouped.set(input.ingredient_id, ingredientState);

    if (
      input.ingredient_type !== "QUANT"
      || input.amount === null
      || input.unit === null
      || !Number.isFinite(input.amount)
      || input.amount <= 0
    ) {
      ingredientState.text.add(extractToTasteText(input.standard_name, input.display_text));
      return;
    }

    const plannedServings = input.planned_servings > 0 ? input.planned_servings : 1;
    const scaledAmount = (input.amount * input.shopping_servings) / plannedServings;

    if (!Number.isFinite(scaledAmount) || scaledAmount <= 0) {
      return;
    }

    const normalizedUnit = normalizeUnitForConversion(input.unit);
    const convertible = CONVERTIBLE_UNITS.get(normalizedUnit);

    if (convertible) {
      const baseAmount = scaledAmount * convertible.factor;
      const key = `${convertible.family}:${convertible.base_unit}`;
      const existing = ingredientState.numeric.get(key);

      ingredientState.numeric.set(key, {
        amount: (existing?.amount ?? 0) + baseAmount,
        unit: convertible.base_unit,
      });
      return;
    }

    const key = `raw:${input.unit}`;
    const existing = ingredientState.numeric.get(key);

    ingredientState.numeric.set(key, {
      amount: (existing?.amount ?? 0) + scaledAmount,
      unit: input.unit,
    });
  });

  return [...grouped.entries()]
    .map(([ingredientId, state]) => {
      const numericParts = [...state.numeric.values()]
        .filter((part) => part.amount > 0)
        .sort((left, right) => left.unit.localeCompare(right.unit, "ko-KR"));
      const textParts = [...state.text.values()].filter((part) => part.length > 0);

      const amounts_json = [
        ...numericParts.map((part) => ({
          amount: Number(formatAmount(part.amount)),
          unit: part.unit,
        })),
        ...textParts.map((part) => ({
          amount: 1,
          unit: part,
        })),
      ];

      if (amounts_json.length === 0) {
        return null;
      }

      const displayParts = [
        ...numericParts.map((part) => `${formatAmount(part.amount)}${part.unit}`),
        ...textParts,
      ];

      return {
        ingredient_id: ingredientId,
        standard_name: state.standard_name,
        display_text: `${state.standard_name} ${displayParts.join(" + ")}`,
        amounts_json,
      } satisfies AggregatedShoppingIngredient;
    })
    .filter((value): value is AggregatedShoppingIngredient => value !== null)
    .sort((left, right) => {
      const byName = left.standard_name.localeCompare(right.standard_name, "ko-KR");
      if (byName !== 0) {
        return byName;
      }

      return left.ingredient_id.localeCompare(right.ingredient_id);
    });
}

export function buildShoppingListTitle(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return `${month}/${day} 장보기`;
}
