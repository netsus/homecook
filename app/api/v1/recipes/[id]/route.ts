import { readRecipeProductLabels } from "@/lib/server/recipe-product-labels";
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
  validateManagedRecipeImageReadTarget,
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
import { readRecipeSnapshotEntrypointContext } from
  "@/lib/server/recipe-snapshot-entrypoint";
import { formatBootstrapErrorMessage } from "@/lib/server/user-bootstrap";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import {
  createRecipeFuturePropagationInternalClient,
  createRecipeImageInternalClient,
  createRecipeViewInternalClient,
  createRemoteCompatibilityServiceRoleClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import type { RecipeDetail, RecipePhoto, RecipePhotoRole, RecipeUserStatus } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
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
  if (/^\/api\/v1\/recipes\/[0-9a-f-]{36}\/image$/i.test(value)) return true;
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

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isQaFixtureModeEnabled() && id === MOCK_RECIPE_ID) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    return ok(
      authOverride === "authenticated"
        ? {
            ...getQaFixtureRecipeDetail(),
            revision: 1,
            nutrition: buildUnavailableRecipeNutrition(),
          }
        : {
            ...MOCK_RECIPE_DETAIL,
            revision: 1,
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
        "id, title, description, thumbnail_url, base_servings, tags, source_type, created_by, visibility, origin_recipe_id, deleted_at, revision, view_count, like_count, save_count, plan_count, cook_count",
      )
      .eq("id", id)
      .maybeSingle();

    if (recipeResult.error) {
      return createHybridAuthorityRouteError(recipeResult.error)
        ?? fail("INTERNAL_ERROR", "레시피 상세를 불러오지 못했어요. 다시 시도해 주세요.", 500);
    }
    if (
      !recipeResult.data
      || (recipeResult.data.deleted_at !== null
        && recipeResult.data.deleted_at !== undefined)
    ) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const serviceClient = createRemoteCompatibilityServiceRoleClient();
    const dbClient = routeClient;
    const legacyThumbnailUrl = recipeResult.data.thumbnail_url;
    const imageClient = createRecipeImageInternalClient();
    const imageReadPromise = imageClient
      ? readRecipeImageProjection({
          client: imageClient,
          recipeId: id,
        }).then((projection) => {
          if (projection?.image_object_id) {
            validateManagedRecipeImageReadTarget({
              projection,
              expectedOwnerUuid: recipeResult.data?.created_by ?? null,
              expectedReferenceType: "recipe_thumbnail",
            });
            return `/api/v1/recipes/${id}/image`;
          }
          return projection
            ? resolveRecipeImageReadUrl({
                client: imageClient,
                expectedOwnerUuid: recipeResult.data?.created_by ?? null,
                expectedStorageOrigin: readExpectedStorageOrigin(),
                projection,
                signedUrlTtlSeconds: RECIPE_IMAGE_READ_URL_TTL_SECONDS,
              })
            : legacyThumbnailUrl;
        })
      : Promise.resolve(legacyThumbnailUrl);

    const authResult = await routeClient.auth.getUser();
    const ingredientColumns = authResult.data.user
      ? "id, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name), food_product_id, food_product_nutrition_version_id"
      : "id, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name)";
    const [
      sourceResult,
      ingredientsResult,
      nutritionSnapshotResult,
      resolvedThumbnailUrl,
      initialStepsResult,
    ] = await Promise.all([
      dbClient
        .from("recipe_sources")
        .select("youtube_url, youtube_video_id, extraction_meta_json")
        .eq("recipe_id", id)
        .maybeSingle(),
      dbClient
        .from("recipe_ingredients")
        .select(ingredientColumns)
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
      readCurrentRecipeNutritionSnapshot(serviceClient ?? routeClient, id),
      imageReadPromise,
      dbClient
        .from("recipe_steps")
        .select(RECIPE_STEP_SELECT_WITH_METHODS)
        .eq("recipe_id", id)
        .order("step_number", { ascending: true }),
    ]);

    let stepsResult = initialStepsResult as {
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
    if (
      recipeResult.data.visibility === "private"
      && recipeResult.data.created_by !== user?.id
    ) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }
    let entrypointContext: Awaited<ReturnType<
      typeof readRecipeSnapshotEntrypointContext
    >> | null = null;
    const canReadOwnerEditContext = Boolean(
      user
      && recipeResult.data.created_by === user.id
      && (recipeResult.data.visibility === "private"
        || (recipeResult.data.visibility === "public" && recipeResult.data.source_type === "manual"
          && recipeResult.data.origin_recipe_id === null))
      && recipeResult.data.deleted_at === null,
    );
    if (canReadOwnerEditContext && user) {
      const verifiedSession = await readVerifiedAccountGenerationSession(
        routeClient,
        user,
      );
      if (
        !verifiedSession.ok
        || verifiedSession.sessionAuthority.ownerUuid !== user.id
      ) {
        return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
      }
      try {
        entrypointContext = await readRecipeSnapshotEntrypointContext({
          recipeId: id,
          sessionAuthority: verifiedSession.sessionAuthority,
        });
      } catch {
        return fail(
          "INTERNAL_ERROR",
          "레시피 편집 정보를 불러오지 못했어요.",
          500,
        );
      }
    }

    const revision = entrypointContext?.revision ?? recipeResult.data.revision;
    if (!Number.isSafeInteger(revision) || Number(revision) <= 0) {
      return fail("INTERNAL_ERROR", "레시피 상세를 불러오지 못했어요.", 500);
    }
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

    // The public/authenticated select union has the same base row contract;
    // PostgREST's type-level select parser cannot infer conditional projections.
    const ingredientRows = (ingredientsResult.data ?? []) as unknown as NonNullable<
      Parameters<typeof normalizeRecipeIngredients>[0]
    >;
    const ingredients = normalizeRecipeIngredients(user
      ? await readRecipeProductLabels(dbClient, ingredientRows)
      : ingredientRows);
    const steps = normalizeRecipeSteps(stepsResult.data);
    let viewCount = recipeResult.data.view_count;
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

    // Picking a recipe is a read-only preview, not a detail-page visit.
    if (recipeResult.data.visibility === "public" && new URL(request.url).searchParams.get("view") !== "preview") {
      try {
        const viewClient = createRecipeViewInternalClient();
        const result = await viewClient?.increment(id);
        const recorded = result?.data;
        if (!result?.error && isRecord(recorded) && recorded.id === id
          && typeof recorded.view_count === "number"
          && Number.isSafeInteger(recorded.view_count) && recorded.view_count >= 0) {
          viewCount = recorded.view_count;
        }
      } catch {
        // Telemetry failure must not block reading or invent a successful increment.
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
      visibility: recipeResult.data.visibility as "public" | "private",
      origin_recipe_id: recipeResult.data.origin_recipe_id,
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
      revision: Number(revision),
      ...(entrypointContext
        ? { edit_context: entrypointContext.edit_context }
        : {}),
    };

    return ok(detail);
  } catch (error) {
    const authorityError = createHybridAuthorityRouteError(error);
    if (authorityError) return authorityError;
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

  return {
    ok: true as const,
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
  const serviceClient = createRecipeFuturePropagationInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "레시피를 변경하지 못했어요.", 500);
  }

  let nutrition;
  try {
    nutrition = await calculateRecipeDraftNutrition(
      serviceClient as unknown as RecipeDraftNutritionClient,
      {
        recipeId,
        ownerUserId: user.id,
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
    serviceClient as unknown as FuturePropagationRpcClient,
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
  const serviceClient = createRecipeFuturePropagationInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "레시피를 삭제하지 못했어요.", 500);
  }

  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
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
