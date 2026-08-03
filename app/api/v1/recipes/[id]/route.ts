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
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import {
  buildTemporarilyUnavailableRecipeNutrition,
  buildUnavailableRecipeNutrition,
} from "@/lib/nutrition/recipe-nutrition-presentation";
import {
  mapRecipeNutritionSnapshot,
  type RecipeNutritionSnapshotRow,
} from "@/lib/server/recipe-nutrition-snapshot";
import {
  normalizeExpectedRecipeImageStorageOrigin,
  readRecipeImageProjection,
  resolveRecipeImageReadUrl,
} from "@/lib/server/recipe-image-read";
import {
  isMissingStepCookingMethodsRelation,
  RECIPE_STEP_SELECT_LEGACY,
  RECIPE_STEP_SELECT_WITH_METHODS,
} from "@/lib/server/recipe-step-method-select";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  calculateRecipeDraftNutrition,
  callFuturePropagationRpc,
  isUuid,
  parseRecipeFuturePatchRequest,
  projectRecipeDeleteData,
  projectRecipePatchData,
  readRequiredIdempotencyKey,
  RecipeDraftNutritionValidationError,
  type FuturePropagationRpcClient,
  type RecipeDraftNutritionClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import { formatBootstrapErrorMessage } from "@/lib/server/user-bootstrap";
import {
  createRecipeFuturePropagationInternalClient,
  createRemoteCompatibilityServiceRoleClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
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

const RECIPE_IMAGE_READ_URL_TTL_SECONDS = 300;

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

function readExpectedStorageOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) {
    throw new Error("managed recipe image read configuration is invalid");
  }
  return normalizeExpectedRecipeImageStorageOrigin(configuredUrl);
}

async function readCurrentRecipeNutritionSnapshot(
  dbClient: NonNullable<
    ReturnType<typeof createRemoteCompatibilityServiceRoleClient>
  > |
    Awaited<ReturnType<typeof createRouteHandlerClient>>,
  recipeId: string,
) {
  try {
    return await dbClient
      .from("recipe_nutrition_snapshots")
      .select(
        "id, base_servings, scalable_values_json, fixed_values_json, nutrient_status_json, calculation_status, calculation_quality, reflected_ingredient_count, target_ingredient_count, warnings_json, sources_json, calculated_at",
      )
      .eq("recipe_id", recipeId)
      .eq("is_current", true)
      .maybeSingle();
  } catch {
    return { data: null, error: { code: "SNAPSHOT_READ_FAILED" } };
  }
}

function projectRecipeNutritionSnapshot(value: unknown) {
  try {
    return mapRecipeNutritionSnapshot(value as RecipeNutritionSnapshotRow);
  } catch {
    return buildTemporarilyUnavailableRecipeNutrition();
  }
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
    const normalizedUrl = normalizeFoodSafetyImageUrl(photo.url);
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

  const normalizedThumbnailUrl = normalizeFoodSafetyImageUrl(thumbnailUrl);
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
    const normalizedUrl = normalizeFoodSafetyImageUrl(url);
    if (!normalizedUrl || !isUsableImageUrl(normalizedUrl)) {
      return;
    }

    addPhoto({
      url: normalizedUrl,
      role: normalizePhotoRole(candidate.role),
      label: typeof candidate.label === "string" ? candidate.label.trim() || null : null,
      width: normalizePositiveNumber(candidate.width),
      height: normalizePositiveNumber(candidate.height),
    });
  });

  return photos;
}

async function incrementRecipeViewCountWithFallback(
  serviceClient: NonNullable<
    ReturnType<typeof createRemoteCompatibilityServiceRoleClient>
  >,
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
        ? {
            ...getQaFixtureRecipeDetail(),
            nutrition: buildUnavailableRecipeNutrition(),
          }
        : {
            ...MOCK_RECIPE_DETAIL,
            nutrition: buildUnavailableRecipeNutrition(),
          },
    );
  }

  try {
    const routeClient = await createRouteHandlerClient({
      anonymousPublicReadScope: "recipe-detail",
    });
    const recipeResult = await routeClient
      .from("recipes")
      .select(
        "id, title, description, thumbnail_url, base_servings, tags, source_type, created_by, view_count, like_count, save_count, plan_count, cook_count",
      )
      .eq("id", id)
      .maybeSingle();

    if (recipeResult.error || !recipeResult.data) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const serviceClient = createRemoteCompatibilityServiceRoleClient();
    const dbClient = routeClient;
    const legacyThumbnailUrl = recipeResult.data.thumbnail_url;
    const imageReadPromise = serviceClient
      ? readRecipeImageProjection({
          client: serviceClient,
          recipeId: id,
        }).then((projection) =>
          projection
            ? resolveRecipeImageReadUrl({
                client: serviceClient,
                expectedOwnerUuid: recipeResult.data?.created_by ?? null,
                expectedStorageOrigin: readExpectedStorageOrigin(),
                projection,
                signedUrlTtlSeconds: RECIPE_IMAGE_READ_URL_TTL_SECONDS,
              })
            : legacyThumbnailUrl
        )
      : Promise.resolve(legacyThumbnailUrl);

    const [
      sourceResult,
      ingredientsResult,
      nutritionSnapshotResult,
      authResult,
      resolvedThumbnailUrl,
    ] = await Promise.all([
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
      readCurrentRecipeNutritionSnapshot(serviceClient ?? routeClient, id),
      routeClient.auth.getUser(),
      imageReadPromise,
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

    if (user) {
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

    const thumbnailUrl = normalizeFoodSafetyImageUrl(resolvedThumbnailUrl);
    const detail: RecipeDetail = {
      id: recipeResult.data.id,
      title: recipeResult.data.title,
      description: recipeResult.data.description,
      thumbnail_url: thumbnailUrl,
      photos: buildRecipePhotos(
        thumbnailUrl,
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
      nutrition: nutritionSnapshotResult.error
        ? buildTemporarilyUnavailableRecipeNutrition()
        : nutritionSnapshotResult.data
          ? projectRecipeNutritionSnapshot(nutritionSnapshotResult.data)
          : buildUnavailableRecipeNutrition(),
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

async function readRecipeMutationAuthority(
  routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  user: { created_at: string; id: string },
) {
  const verifiedSession = await readVerifiedAccountGenerationSession(
    routeClient,
    user,
  );
  if (
    !verifiedSession.ok
    || verifiedSession.sessionAuthority.ownerUuid !== user.id
  ) {
    return {
      ok: false as const,
      response: fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409),
    };
  }

  const serviceClient = createRecipeFuturePropagationInternalClient();
  if (!serviceClient) {
    return {
      ok: false as const,
      response: fail("INTERNAL_ERROR", "레시피를 변경하지 못했어요.", 500),
    };
  }

  return {
    ok: true as const,
    serviceClient: serviceClient as unknown as FuturePropagationRpcClient,
    sessionAuthority: verifiedSession.sessionAuthority,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const idempotency = readRequiredIdempotencyKey(request, "Idempotency-Key");
  if (!idempotency.ok) {
    return idempotency.response;
  }

  const { id: recipeId } = await context.params;
  if (!isUuid(recipeId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }
  const parsed = parseRecipeFuturePatchRequest(body);
  if (!parsed.ok) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해 주세요.",
      422,
      parsed.fields,
    );
  }

  const authority = await readRecipeMutationAuthority(routeClient, user);
  if (!authority.ok) {
    return authority.response;
  }

  let nutrition;
  try {
    nutrition = await calculateRecipeDraftNutrition(
      authority.serviceClient as unknown as RecipeDraftNutritionClient,
      {
        recipeId,
        baseRecipeRevision: parsed.value.baseRecipeRevision,
        draft: parsed.value.draft,
      },
    );
  } catch (error) {
    if (error instanceof RecipeDraftNutritionValidationError) {
      return fail("VALIDATION_ERROR", "레시피 영양 입력을 확인해 주세요.", 422, [
        { field: "draft.ingredients", reason: "invalid_nutrition_input" },
      ]);
    }
    return fail("INTERNAL_ERROR", "레시피 영양 정보를 확인하지 못했어요.", 500);
  }

  const result = await callFuturePropagationRpc(
    authority.serviceClient,
    "write_recipe_future_plan_change",
    {
      ...buildSessionAuthorityRpcArgs(authority.sessionAuthority),
      p_recipe_id: recipeId,
      p_base_recipe_revision: parsed.value.baseRecipeRevision,
      p_draft: parsed.value.draft,
      p_nutrition_snapshot: nutrition.nutritionSnapshot,
      p_nutrition_predecessor_guard: nutrition.predecessorGuard,
      p_future_plan_strategy: parsed.value.futurePlanStrategy,
      p_impact_token: parsed.value.impactToken,
      p_image_object_id: parsed.value.imageObjectId,
      p_idempotency_key: idempotency.key,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectRecipePatchData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "레시피를 변경하지 못했어요.", 500);
}

export async function DELETE(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const idempotency = readRequiredIdempotencyKey(request, "Idempotency-Key");
  if (!idempotency.ok) {
    return idempotency.response;
  }

  const { id: recipeId } = await context.params;
  if (!isUuid(recipeId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const authority = await readRecipeMutationAuthority(routeClient, user);
  if (!authority.ok) {
    return authority.response;
  }

  const result = await callFuturePropagationRpc(
    authority.serviceClient,
    "write_personal_recipe_core",
    {
      ...buildSessionAuthorityRpcArgs(authority.sessionAuthority),
      p_operation: "delete",
      p_recipe_id: recipeId,
      p_source_recipe_id: null,
      p_base_recipe_revision: null,
      p_draft: null,
      p_nutrition_snapshot: null,
      p_tags: null,
      p_image_object_id: null,
      p_expected_cleanup_generation: null,
      p_idempotency_key: idempotency.key,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectRecipeDeleteData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "레시피를 삭제하지 못했어요.", 500);
}
