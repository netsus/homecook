import { runIngredientAiNutritionTick } from '@/lib/server/ingredient-ai-nutrition-worker';
const runtime = globalThis as typeof globalThis & {
  __homecookAiNutritionTimer?: ReturnType<typeof setTimeout>;
};
/** The full-local web server is long-running. The DB queue owns durability. */
export function startIngredientAiNutritionRuntime() {
  if (process.env.AI_NUTRITION_ESTIMATION_ENABLED !== '1' || runtime.__homecookAiNutritionTimer)
    return;
  const tick = async () => {
    try {
      await runIngredientAiNutritionTick();
    }
    catch { /* Durable DB jobs remain queued/retryable; never log provider text. */ }
    runtime.__homecookAiNutritionTimer = setTimeout(tick, 60000);
    runtime.__homecookAiNutritionTimer.unref?.();
  };
  runtime.__homecookAiNutritionTimer = setTimeout(tick, 5000);
  runtime.__homecookAiNutritionTimer.unref?.();
}
