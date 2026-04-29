import type {
  CookingModeIngredient,
  CookingModeStep,
  CookingReadyRecipe,
  CookingSessionCompleteBody,
  CookingSessionCreateBody,
} from "@/types/cooking";

export interface CookingReadyMealRow {
  id: string;
  recipe_id: string;
  plan_date: string;
  planned_servings: number;
}

export interface CookingRecipeSummaryRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

export interface CookingSessionCreateMealRow {
  id: string;
  user_id: string;
  recipe_id: string;
  status: string;
}

interface IngredientJoinRow {
  standard_name?: string | null;
}

export interface CookingIngredientRow {
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  display_text: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
  sort_order?: number | null;
  ingredients: IngredientJoinRow | IngredientJoinRow[] | null;
}

interface CookingMethodJoinRow {
  code?: string | null;
  label?: string | null;
  color_key?: string | null;
}

export interface CookingStepRow {
  step_number: number;
  instruction: string;
  ingredients_used: unknown;
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  cooking_methods: CookingMethodJoinRow | CookingMethodJoinRow[] | null;
}

export interface ParsedCookingSessionBody {
  recipe_id: string;
  meal_ids: string[];
  cooking_servings: number;
}

export interface ParseCookingSessionBodyResult {
  data: ParsedCookingSessionBody | null;
  fields: Array<{ field: string; reason: string }>;
}

export interface ParsedCookingSessionCompleteBody {
  consumed_ingredient_ids: string[];
}

export interface ParseCookingSessionCompleteBodyResult {
  data: ParsedCookingSessionCompleteBody | null;
  fields: Array<{ field: string; reason: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function todayDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCookingSessionBody(
  body: CookingSessionCreateBody,
): ParseCookingSessionBodyResult {
  const fields: Array<{ field: string; reason: string }> = [];
  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id.trim() : "";
  const rawMealIds = Array.isArray(body.meal_ids) ? body.meal_ids : [];
  const mealIds = [
    ...new Set(
      rawMealIds
        .map((mealId) => (typeof mealId === "string" ? mealId.trim() : ""))
        .filter((mealId) => mealId.length > 0),
    ),
  ];
  const cookingServings = body.cooking_servings;

  if (!recipeId) {
    fields.push({ field: "recipe_id", reason: "required" });
  } else if (!isUuid(recipeId)) {
    fields.push({ field: "recipe_id", reason: "invalid_uuid" });
  }

  if (mealIds.length === 0) {
    fields.push({ field: "meal_ids", reason: "required_non_empty" });
  } else if (mealIds.some((mealId) => !isUuid(mealId))) {
    fields.push({ field: "meal_ids", reason: "invalid_uuid" });
  }

  if (typeof cookingServings !== "number" || !Number.isInteger(cookingServings)) {
    fields.push({ field: "cooking_servings", reason: "invalid_integer" });
  } else if (cookingServings < 1) {
    fields.push({ field: "cooking_servings", reason: "min_value" });
  }

  if (fields.length > 0 || typeof cookingServings !== "number") {
    return {
      data: null,
      fields,
    };
  }

  return {
    data: {
      recipe_id: recipeId,
      meal_ids: mealIds,
      cooking_servings: cookingServings,
    },
    fields: [],
  };
}

export function parseCookingSessionCompleteBody(
  body: CookingSessionCompleteBody,
): ParseCookingSessionCompleteBodyResult {
  const rawConsumedIngredientIds = body.consumed_ingredient_ids ?? [];

  if (!Array.isArray(rawConsumedIngredientIds)) {
    return {
      data: null,
      fields: [{ field: "consumed_ingredient_ids", reason: "invalid_array" }],
    };
  }

  const consumedIngredientIds = [
    ...new Set(
      rawConsumedIngredientIds
        .map((ingredientId) => (typeof ingredientId === "string" ? ingredientId.trim() : ""))
        .filter((ingredientId) => ingredientId.length > 0),
    ),
  ];

  if (consumedIngredientIds.some((ingredientId) => !isUuid(ingredientId))) {
    return {
      data: null,
      fields: [{ field: "consumed_ingredient_ids", reason: "invalid_uuid" }],
    };
  }

  return {
    data: {
      consumed_ingredient_ids: consumedIngredientIds,
    },
    fields: [],
  };
}

export function buildReadyRecipes({
  meals,
  recipes,
}: {
  meals: CookingReadyMealRow[];
  recipes: CookingRecipeSummaryRow[];
}): CookingReadyRecipe[] {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const grouped = new Map<string, CookingReadyRecipe>();

  meals.forEach((meal) => {
    const recipe = recipeMap.get(meal.recipe_id);
    const existing = grouped.get(meal.recipe_id);

    if (existing) {
      existing.meal_ids.push(meal.id);
      existing.total_servings += meal.planned_servings;
      return;
    }

    grouped.set(meal.recipe_id, {
      recipe_id: meal.recipe_id,
      recipe_title: recipe?.title ?? "",
      recipe_thumbnail_url: recipe?.thumbnail_url ?? null,
      meal_ids: [meal.id],
      total_servings: meal.planned_servings,
    });
  });

  return [...grouped.values()];
}

export function scaleAmount({
  amount,
  baseServings,
  cookingServings,
  scalable,
}: {
  amount: number | null;
  baseServings: number;
  cookingServings: number;
  scalable: boolean;
}) {
  if (amount === null || !scalable || baseServings < 1) {
    return amount;
  }

  const scaled = (amount * cookingServings) / baseServings;
  return Number.isInteger(scaled) ? scaled : Number(scaled.toFixed(2));
}

function formatAmount(value: number | null) {
  if (value === null) {
    return null;
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
}

export function toCookingModeIngredient({
  row,
  baseServings,
  cookingServings,
}: {
  row: CookingIngredientRow;
  baseServings: number;
  cookingServings: number;
}): CookingModeIngredient {
  const ingredient = firstJoin(row.ingredients) ?? {};
  const amount = scaleAmount({
    amount: row.amount,
    baseServings,
    cookingServings,
    scalable: row.scalable,
  });
  const amountText = formatAmount(amount);

  return {
    ingredient_id: row.ingredient_id,
    standard_name: ingredient.standard_name ?? "",
    amount,
    unit: row.unit,
    display_text:
      row.ingredient_type === "QUANT" && amountText && row.unit
        ? `${ingredient.standard_name ?? ""} ${amountText}${row.unit}`
        : row.display_text,
    ingredient_type: row.ingredient_type,
    scalable: row.scalable,
  };
}

export function toCookingModeStep(row: CookingStepRow): CookingModeStep {
  const method = firstJoin(row.cooking_methods) ?? {};
  const ingredientsUsed = Array.isArray(row.ingredients_used) ? row.ingredients_used : [];

  return {
    step_number: row.step_number,
    instruction: row.instruction,
    cooking_method: {
      code: method.code ?? "",
      label: method.label ?? "",
      color_key: method.color_key ?? "unassigned",
    },
    ingredients_used: ingredientsUsed,
    heat_level: row.heat_level,
    duration_seconds: row.duration_seconds,
    duration_text: row.duration_text,
  };
}
