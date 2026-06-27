import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  getQaFixtureRecipeDetail,
  isQaFixtureModeEnabled,
  MOCK_RECIPE_DETAIL,
  MOCK_RECIPE_ID,
} from "@/lib/mock/recipes";
import {
  mapRecipeUserStatus,
  normalizeRecipeIngredients,
  normalizeRecipeSteps,
} from "@/lib/recipe-detail";
import {
  isMissingStepCookingMethodsRelation,
  RECIPE_STEP_SELECT_LEGACY,
  RECIPE_STEP_SELECT_WITH_METHODS,
} from "@/lib/server/recipe-step-method-select";
import { formatBootstrapErrorMessage } from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeDetail, RecipePhoto, RecipePhotoRole, RecipeUserStatus } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface RecipeViewCountIncrementRow {
  id: string;
  view_count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePhotoRole(value: unknown): RecipePhotoRole {
  if (value === "primary" || value === "alternate" || value === "step") {
    return value;
  }

  return "unknown";
}

function normalizePositiveNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function isUsableImageUrl(value: string, { allowDataUri = false } = {}) {
  if (allowDataUri && value.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildRecipePhotos(
  thumbnailUrl: string | null,
  extractionMetaJson: unknown,
): RecipePhoto[] {
  const photos: RecipePhoto[] = [];
  const indexesByUrl = new Map<string, number>();
  const addPhoto = (photo: RecipePhoto) => {
    const normalizedUrl = photo.url.trim();
    if (!normalizedUrl) {
      return;
    }

    const existingIndex = indexesByUrl.get(normalizedUrl);
    if (existingIndex !== undefined) {
      const existing = photos[existingIndex];
      photos[existingIndex] = {
        ...existing,
        role: existing.role === "unknown" ? photo.role : existing.role,
        label: existing.label ?? photo.label ?? null,
        width: existing.width ?? photo.width ?? null,
        height: existing.height ?? photo.height ?? null,
      };
      return;
    }

    indexesByUrl.set(normalizedUrl, photos.length);
    photos.push({
      ...photo,
      url: normalizedUrl,
      label: photo.label ?? null,
      width: photo.width ?? null,
      height: photo.height ?? null,
    });
  };

  const normalizedThumbnailUrl = thumbnailUrl?.trim();
  if (
    normalizedThumbnailUrl &&
    isUsableImageUrl(normalizedThumbnailUrl, { allowDataUri: true })
  ) {
    addPhoto({
      url: normalizedThumbnailUrl,
      role: "primary",
    });
  }

  const candidates = isRecord(extractionMetaJson) &&
    Array.isArray(extractionMetaJson.image_candidates)
    ? extractionMetaJson.image_candidates
    : [];

  candidates.forEach((candidate) => {
    if (!isRecord(candidate) || typeof candidate.url !== "string") {
      return;
    }

    const url = candidate.url.trim();
    if (!isUsableImageUrl(url)) {
      return;
    }

    addPhoto({
      url,
      role: normalizePhotoRole(candidate.role),
      label: typeof candidate.label === "string" ? candidate.label.trim() || null : null,
      width: normalizePositiveNumber(candidate.width),
      height: normalizePositiveNumber(candidate.height),
    });
  });

  return photos;
}

async function incrementRecipeViewCountWithFallback(
  serviceClient: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  recipeId: string,
  initialViewCount: number,
) {
  let currentViewCount = initialViewCount;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextViewCount = currentViewCount + 1;
    const fallbackViewCountResult = await serviceClient
      .from("recipes")
      .update({ view_count: nextViewCount })
      .eq("id", recipeId)
      .eq("view_count", currentViewCount)
      .select("id, view_count")
      .maybeSingle() as {
        data: RecipeViewCountIncrementRow | null;
        error: unknown;
      };

    if (typeof fallbackViewCountResult.data?.view_count === "number") {
      return fallbackViewCountResult.data.view_count;
    }

    if (fallbackViewCountResult.error) {
      return nextViewCount;
    }

    const refreshedViewCountResult = await serviceClient
      .from("recipes")
      .select("id, view_count")
      .eq("id", recipeId)
      .maybeSingle() as {
        data: RecipeViewCountIncrementRow | null;
        error: unknown;
      };

    if (typeof refreshedViewCountResult.data?.view_count !== "number") {
      return nextViewCount;
    }

    currentViewCount = refreshedViewCountResult.data.view_count;
  }

  return currentViewCount + 1;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isQaFixtureModeEnabled() && id === MOCK_RECIPE_ID) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    return ok(
      authOverride === "authenticated"
        ? getQaFixtureRecipeDetail()
        : MOCK_RECIPE_DETAIL,
    );
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const serviceClient = createServiceRoleClient();
    const dbClient = serviceClient ?? routeClient;

    const [
      recipeResult,
      sourceResult,
      ingredientsResult,
      authResult,
    ] = await Promise.all([
      dbClient
        .from("recipes")
        .select(
          "id, title, description, thumbnail_url, base_servings, tags, source_type, view_count, like_count, save_count, plan_count, cook_count",
        )
        .eq("id", id)
        .maybeSingle(),
      dbClient
        .from("recipe_sources")
        .select("youtube_url, youtube_video_id, extraction_meta_json")
        .eq("recipe_id", id)
        .maybeSingle(),
      dbClient
        .from("recipe_ingredients")
        .select(
          "id, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name)",
        )
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
      routeClient.auth.getUser(),
    ]);

    let stepsResult = await dbClient
      .from("recipe_steps")
      .select(RECIPE_STEP_SELECT_WITH_METHODS)
      .eq("recipe_id", id)
      .order("step_number", { ascending: true }) as {
        data: Parameters<typeof normalizeRecipeSteps>[0];
        error: unknown;
      };

    if (stepsResult.error && isMissingStepCookingMethodsRelation(stepsResult.error)) {
      stepsResult = await dbClient
        .from("recipe_steps")
        .select(RECIPE_STEP_SELECT_LEGACY)
        .eq("recipe_id", id)
        .order("step_number", { ascending: true }) as {
          data: Parameters<typeof normalizeRecipeSteps>[0];
          error: unknown;
        };
    }

    if (recipeResult.error || !recipeResult.data) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    if (ingredientsResult.error || stepsResult.error) {
      return fail(
        "INTERNAL_ERROR",
        "레시피 상세를 불러오지 못했어요.",
        500,
      );
    }

    const user = authResult.data.user;
    let userStatus: RecipeUserStatus | null = null;

    if (user) {
      const userStatusClient = serviceClient ?? routeClient;
      const [likedResult, savedResult] = await Promise.all([
        userStatusClient
          .from("recipe_likes")
          .select("id")
          .eq("recipe_id", id)
          .eq("user_id", user.id)
          .limit(1),
        userStatusClient
          .from("recipe_book_items")
          .select("book_id, recipe_books!inner(book_type, user_id)")
          .eq("recipe_id", id)
          .eq("recipe_books.user_id", user.id)
          .in("recipe_books.book_type", ["saved", "custom"]),
      ]);

      userStatus = mapRecipeUserStatus(likedResult.data, savedResult.data);
    }

    const ingredients = normalizeRecipeIngredients(ingredientsResult.data);
    const steps = normalizeRecipeSteps(stepsResult.data);
    let viewCount = recipeResult.data.view_count + (serviceClient ? 1 : 0);
    let planCount = recipeResult.data.plan_count;

    try {
      const planCountResult = await dbClient
        .from("meals")
        .select("id", { count: "exact", head: true })
        .eq("recipe_id", id) as {
          count?: number | null;
          error?: unknown;
        };

      if (!planCountResult.error && typeof planCountResult.count === "number") {
        planCount = planCountResult.count;
      }
    } catch {
      planCount = recipeResult.data.plan_count;
    }

    if (serviceClient) {
      const viewCountResult = await serviceClient
        .rpc("increment_recipe_view_count", {
          p_recipe_id: id,
        })
        .maybeSingle() as {
          data: RecipeViewCountIncrementRow | null;
          error: unknown;
        };

      if (typeof viewCountResult.data?.view_count === "number") {
        viewCount = viewCountResult.data.view_count;
      } else {
        viewCount = await incrementRecipeViewCountWithFallback(
          serviceClient,
          id,
          recipeResult.data.view_count,
        );
      }
    }

    const detail: RecipeDetail = {
      id: recipeResult.data.id,
      title: recipeResult.data.title,
      description: recipeResult.data.description,
      thumbnail_url: recipeResult.data.thumbnail_url,
      photos: buildRecipePhotos(
        recipeResult.data.thumbnail_url,
        sourceResult.data?.extraction_meta_json,
      ),
      base_servings: recipeResult.data.base_servings,
      tags: recipeResult.data.tags ?? [],
      source_type: recipeResult.data.source_type,
      source: sourceResult.data
        ? {
            youtube_url: sourceResult.data.youtube_url,
            youtube_video_id: sourceResult.data.youtube_video_id,
          }
        : null,
      view_count: viewCount,
      like_count: recipeResult.data.like_count,
      save_count: recipeResult.data.save_count,
      plan_count: planCount,
      cook_count: recipeResult.data.cook_count,
      ingredients,
      steps,
      user_status: userStatus,
    };

    return ok(detail);
  } catch (error) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(error, "레시피 상세를 불러오지 못했어요."),
      500,
    );
  }
}
