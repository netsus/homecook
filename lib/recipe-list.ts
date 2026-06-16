import type { RecipeSortKey } from "@/types/recipe";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RecipeIngredientMatchRow {
  recipe_id: string;
  ingredient_id: string;
}

export interface RecipeListCursorRecipe {
  id: string;
  created_at: string;
  view_count: number;
  save_count: number;
  plan_count: number;
  cook_count: number;
}

export interface RecipeListCursorPayload {
  sort: RecipeSortKey;
  value: string | number;
  id: string;
}

function getCursorValue(sort: RecipeSortKey, recipe: RecipeListCursorRecipe) {
  if (sort === "latest") {
    return recipe.created_at;
  }

  return recipe[sort];
}

export function clampLimit(value: string | null) {
  if (!value) {
    return 20;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 40);
}

export function parseIngredientIds(value: string | null) {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const parsed: string[] = [];

  for (const token of value.split(",")) {
    const candidate = token.trim();

    if (!UUID_PATTERN.test(candidate) || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    parsed.push(candidate);
  }

  return parsed;
}

export function filterRecipeIdsByIngredients(
  rows: RecipeIngredientMatchRow[],
  ingredientIds: string[],
) {
  const requiredIds = new Set(ingredientIds);
  const matchedIngredientsByRecipe = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!requiredIds.has(row.ingredient_id)) {
      continue;
    }

    const current = matchedIngredientsByRecipe.get(row.recipe_id) ?? new Set<string>();
    current.add(row.ingredient_id);
    matchedIngredientsByRecipe.set(row.recipe_id, current);
  }

  return Array.from(matchedIngredientsByRecipe.entries())
    .filter(([, matchedIds]) => matchedIds.size === requiredIds.size)
    .map(([recipeId]) => recipeId);
}

export function encodeRecipeListCursor({
  sort,
  recipe,
}: {
  sort: RecipeSortKey;
  recipe: RecipeListCursorRecipe;
}) {
  return Buffer.from(
    JSON.stringify({
      sort,
      value: getCursorValue(sort, recipe),
      id: recipe.id,
    } satisfies RecipeListCursorPayload),
    "utf8",
  ).toString("base64url");
}

export function parseRecipeListCursor(
  value: string | null | undefined,
  activeSort: RecipeSortKey,
): RecipeListCursorPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const payload = parsed as Partial<RecipeListCursorPayload>;
    if (payload.sort !== activeSort || typeof payload.id !== "string" || payload.id.length === 0) {
      return null;
    }

    if (activeSort === "latest") {
      return typeof payload.value === "string" && payload.value.length > 0
        ? {
            sort: activeSort,
            value: payload.value,
            id: payload.id,
          }
        : null;
    }

    return typeof payload.value === "number" && Number.isFinite(payload.value)
      ? {
          sort: activeSort,
          value: payload.value,
          id: payload.id,
        }
      : null;
  } catch {
    return null;
  }
}
