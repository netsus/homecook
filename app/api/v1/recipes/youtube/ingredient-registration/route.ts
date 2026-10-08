import { after } from "next/server";
import { runIngredientAiNutritionTick } from "@/lib/server/ingredient-ai-nutrition-worker";
import { handleYoutubeIngredientRegistration } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  const response = await handleYoutubeIngredientRegistration(request);
  if (response.ok && process.env.AI_NUTRITION_ESTIMATION_ENABLED === "1") {
    after(async () => { try { await runIngredientAiNutritionTick(); } catch { /* Durable job retries on the periodic drain. */ } });
  }
  return response;
}
