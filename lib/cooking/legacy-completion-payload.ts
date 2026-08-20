export function canonicalizeLegacyConsumedIngredientIds(
  ingredientIds: readonly string[],
) {
  return [...new Set(ingredientIds)].sort();
}
