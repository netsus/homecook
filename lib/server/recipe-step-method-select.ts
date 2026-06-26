export const RECIPE_STEP_SELECT_WITH_METHODS =
  "id, step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(id, code, label, color_key, category_code), recipe_step_cooking_methods(position, cooking_methods(id, code, label, color_key, category_code))";

export const RECIPE_STEP_SELECT_LEGACY =
  "id, step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(id, code, label, color_key, category_code)";

export const COOK_MODE_STEP_SELECT_WITH_METHODS =
  "step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(code, label, color_key, category_code), recipe_step_cooking_methods(position, cooking_methods(code, label, color_key, category_code))";

export const COOK_MODE_STEP_SELECT_LEGACY =
  "step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(code, label, color_key, category_code)";

export function isMissingStepCookingMethodsRelation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? String(error.message ?? "") : "";
  const details = "details" in error ? String(error.details ?? "") : "";

  return /recipe_step_cooking_methods|schema cache|relationship/i.test(
    `${message} ${details}`,
  );
}
