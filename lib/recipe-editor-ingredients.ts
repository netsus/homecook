import type { ManualRecipeIngredientInput, RecipeEditDraft, RecipeEditIngredientDraft } from "@/types/recipe";

export function toRecipeEditIngredient(item: ManualRecipeIngredientInput): RecipeEditIngredientDraft {
  return {
    ingredient_id: item.ingredient_id, amount: item.amount, unit: item.unit,
    ingredient_type: item.ingredient_type, display_text: item.standard_name,
    component_label: null, scalable: item.scalable,
    food_product_id: item.food_product_id ?? null,
    food_product_nutrition_version_id: item.food_product_nutrition_version_id ?? null,
  };
}

export function changeRecipeIngredient(
  draft: RecipeEditDraft,
  index: number,
  replacement: RecipeEditIngredientDraft | null,
): RecipeEditDraft {
  const previous = draft.ingredients[index];
  if (!previous) return draft;
  if (replacement && draft.ingredients.some((item, itemIndex) => itemIndex !== index
    && item.ingredient_id === replacement.ingredient_id)) return draft;
  const bothGeneric = !previous.food_product_id && !replacement?.food_product_id;
  const keepQuantity = bothGeneric || previous.unit === replacement?.unit;
  const corrected = replacement ? {
    ...replacement,
    component_label: previous.component_label,
    amount: keepQuantity ? previous.amount : null,
    unit: bothGeneric ? previous.unit : replacement.unit,
    ingredient_type: bothGeneric ? previous.ingredient_type : "QUANT" as const,
    scalable: previous.scalable,
  } : null;
  return {
    ...draft,
    ingredients: corrected
      ? draft.ingredients.map((item, itemIndex) => itemIndex === index ? corrected : item)
      : draft.ingredients.filter((_, itemIndex) => itemIndex !== index),
    steps: draft.steps.map((step) => ({
      ...step,
      ingredients_used: replacement
        ? step.ingredients_used.map((item) => item.ingredient_id === previous.ingredient_id
          ? { ...item, ingredient_id: replacement.ingredient_id,
              ...(!keepQuantity ? { amount: null, unit: null } : {}) } : item)
        : step.ingredients_used.filter((item) => item.ingredient_id !== previous.ingredient_id),
    })),
  };
}
