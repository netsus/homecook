export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV === 'production') {
    const { startIngredientAiNutritionRuntime } = await import('./lib/server/ingredient-ai-nutrition-runtime');
    startIngredientAiNutritionRuntime();
  }
}
