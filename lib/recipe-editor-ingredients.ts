import { recipeIngredientSourceId, recipeIngredientSourceKind } from "@/lib/recipe-ingredient-source";
import type { ManualRecipeIngredientInput, RecipeEditDraft, RecipeEditIngredientDraft } from "@/types/recipe";

export function recipeIngredientGroupKey(ingredient: {
  ingredient_id: string | null;
  component_label?: string | null;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
}) {
  return JSON.stringify([recipeIngredientSourceKind(ingredient), recipeIngredientSourceId(ingredient), ingredient.component_label?.trim() || null]);
}

export function toRecipeEditIngredient(item: ManualRecipeIngredientInput): RecipeEditIngredientDraft {
  return {
    source_kind: recipeIngredientSourceKind(item), row_key: item.row_key ?? crypto.randomUUID(),
    ingredient_id: item.ingredient_id, amount: item.amount, unit: item.unit,
    ingredient_type: item.ingredient_type, display_text: item.standard_name,
    component_label: item.component_label?.trim() || null, scalable: item.scalable,
    food_product_id: item.food_product_id ?? null,
    food_product_nutrition_version_id: item.food_product_nutrition_version_id ?? null,
  };
}

export function recipeIngredientMatchesStepReference(
  ingredient: { row_key?: string; ingredient_id: string | null },
  reference: { row_key?: string; ingredient_id: string | null },
) {
  if (reference.row_key) return reference.row_key === ingredient.row_key;
  return ingredient.ingredient_id !== null && reference.ingredient_id === ingredient.ingredient_id;
}

export function withRecipeIngredientRowKeys(draft: RecipeEditDraft): RecipeEditDraft {
  const ingredients = draft.ingredients.map((ingredient) => ({
    ...ingredient, row_key: ingredient.row_key ?? crypto.randomUUID(),
    source_kind: recipeIngredientSourceKind(ingredient),
  }));
  return {
    ...draft, ingredients,
    steps: draft.steps.map((step) => ({
      ...step, ingredients_used: step.ingredients_used.map((reference) => {
        if (reference.row_key) return { ...reference };
        const candidates = ingredients.filter((ingredient) => recipeIngredientMatchesStepReference(ingredient, reference)
          && (!step.component_label?.trim() || ingredient.component_label?.trim() === step.component_label.trim()));
        return candidates.length === 1 ? { ...reference, row_key: candidates[0].row_key } : { ...reference };
      }),
    })),
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
    && recipeIngredientGroupKey(item) === recipeIngredientGroupKey({ ...replacement, component_label: previous.component_label }))) return draft;
  const bothGeneric = !previous.food_product_id && !replacement?.food_product_id;
  const sameProduct = Boolean(previous.food_product_id && previous.food_product_id === replacement?.food_product_id
    && previous.food_product_nutrition_version_id === replacement.food_product_nutrition_version_id);
  const keepQuantity = bothGeneric || sameProduct;
  const corrected = replacement ? {
    ...replacement,
    source_kind: recipeIngredientSourceKind(replacement),
    row_key: previous.row_key ?? replacement.row_key ?? crypto.randomUUID(),
    component_label: previous.component_label,
    ingredient_id: sameProduct ? previous.ingredient_id : replacement.ingredient_id,
    display_text: sameProduct ? previous.display_text : replacement.display_text,
    amount: keepQuantity ? previous.amount : null,
    unit: keepQuantity ? previous.unit : replacement.unit,
    ingredient_type: keepQuantity ? previous.ingredient_type : "QUANT" as const,
    scalable: previous.scalable,
  } : null;
  return {
    ...draft,
    ingredients: corrected
      ? draft.ingredients.map((item, itemIndex) => itemIndex === index ? corrected : item)
      : draft.ingredients.filter((_, itemIndex) => itemIndex !== index),
    steps: draft.steps.map((step) => {
      const legacyCandidates = draft.ingredients.filter((item) => previous.ingredient_id !== null
        && item.ingredient_id === previous.ingredient_id
        && (!step.component_label?.trim() || item.component_label?.trim() === step.component_label.trim()));
      const matches = (item: RecipeEditDraft["steps"][number]["ingredients_used"][number]) =>
        recipeIngredientMatchesStepReference(previous, item) && (Boolean(item.row_key)
          || (legacyCandidates.length === 1 && legacyCandidates[0] === previous));
      return {
        ...step,
        ingredients_used: corrected
          ? step.ingredients_used.map((item) => !matches(item) ? item : {
              ...item, row_key: corrected.row_key, ingredient_id: corrected.ingredient_id,
              amount: keepQuantity ? item.amount : null, unit: keepQuantity ? item.unit : null,
            })
          : step.ingredients_used.filter((item) => !matches(item)),
      };
    }),
  };
}
