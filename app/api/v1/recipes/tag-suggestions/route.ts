import { fail, ok } from "@/lib/api/response";
import {
  buildSuggestedRecipeTags,
  toRecipeTagLabels,
  type RecipeTagWrite,
} from "@/lib/server/recipe-tags";
import { createRouteHandlerClient } from "@/lib/supabase/server";

interface TagSuggestionBody {
  source_type?: "manual" | "system" | "youtube";
  title?: string;
  base_servings?: unknown;
  total_time_minutes?: unknown;
  ingredients?: unknown[];
  steps?: unknown[];
  cooking_method_labels?: unknown[];
  provider_tags?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readIngredientNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((ingredient) => {
      if (typeof ingredient === "string") {
        return ingredient.trim();
      }

      if (isRecord(ingredient)) {
        return readString(ingredient.standard_name ?? ingredient.name);
      }

      return "";
    })
    .filter(Boolean);
}

function readStepTexts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((step) => {
      if (typeof step === "string") {
        return step.trim();
      }

      if (isRecord(step)) {
        return readString(step.instruction ?? step.text);
      }

      return "";
    })
    .filter(Boolean);
}

function readTotalTimeMinutesFromSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const totalSeconds = value.reduce((sum, step) => {
    if (!isRecord(step) || typeof step.duration_seconds !== "number" || !Number.isFinite(step.duration_seconds)) {
      return sum;
    }

    return sum + Math.max(0, step.duration_seconds);
  }, 0);

  return totalSeconds > 0 ? Math.ceil(totalSeconds / 60) : null;
}

function readCookingMethodLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter(Boolean);
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter(Boolean);
}

function readPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function serializeSuggestedTag(tag: RecipeTagWrite) {
  return {
    normalized_key: tag.normalized_key,
    label: tag.label,
    kind: tag.kind,
    source: tag.source,
    confidence: tag.confidence,
  };
}

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();

  if (!authResult.data.user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  let body: TagSuggestionBody;

  try {
    body = (await request.json()) as TagSuggestionBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  if (!isRecord(body)) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_object" },
    ]);
  }

  const sourceType = body.source_type === "youtube" || body.source_type === "system"
    ? body.source_type
    : "manual";
  const suggestedTags = buildSuggestedRecipeTags({
    sourceType,
    title: readString(body.title),
    baseServings: readPositiveInteger(body.base_servings),
    totalTimeMinutes: readPositiveInteger(body.total_time_minutes) ?? readTotalTimeMinutesFromSteps(body.steps),
    ingredientNames: readIngredientNames(body.ingredients),
    stepTexts: readStepTexts(body.steps),
    cookingMethodLabels: readCookingMethodLabels(body.cooking_method_labels),
    providerTags: readStringList(body.provider_tags),
  });

  return ok({
    suggested_tags: suggestedTags.map(serializeSuggestedTag),
    tags: toRecipeTagLabels(suggestedTags),
  });
}
