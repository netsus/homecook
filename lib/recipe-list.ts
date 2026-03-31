const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RecipeIngredientMatchRow {
  recipe_id: string;
  ingredient_id: string;
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
