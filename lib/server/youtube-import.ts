import type { User } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/response";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
  YoutubeExtractedCookingMethod,
  YoutubeExtractedIngredient,
  YoutubeRecipeExtractData,
  YoutubeRecipeRegisterData,
  YoutubeRecipeValidateData,
} from "@/types/recipe";

interface QueryError {
  code?: string;
  message: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface ValidationField {
  field: string;
  reason: string;
}

interface DbClient {
  from(table: string): unknown;
}

interface IdLookupRow {
  id: string;
}

interface IngredientLookupRow {
  id: string;
  standard_name: string;
}

interface ArrayLookupQuery<T> {
  in(column: string, values: string[]): ArrayLookupQuery<T>;
  then: ArrayQueryResult<T>["then"];
}

interface ArrayLookupTable<T> {
  select(columns: string): ArrayLookupQuery<T>;
}

interface CookingMethodRow {
  id: string;
  code: string;
  label: string;
  color_key: string;
  is_system: boolean;
}

interface CookingMethodSelectQuery {
  eq(column: string, value: string): CookingMethodSelectQuery;
  maybeSingle(): MaybeSingleResult<CookingMethodRow>;
}

interface CookingMethodInsertQuery {
  select(columns: string): CookingMethodInsertQuery;
  maybeSingle(): MaybeSingleResult<CookingMethodRow>;
}

interface CookingMethodsTable {
  select(columns: string): CookingMethodSelectQuery;
  insert(values: {
    code: string;
    label: string;
    color_key: string;
    is_system: false;
    display_order: number;
  }): CookingMethodInsertQuery;
}

interface RecipeInsertQuery {
  select(columns: string): RecipeInsertQuery;
  maybeSingle(): MaybeSingleResult<{
    id: string;
    title: string;
    source_type: "youtube";
    created_by: string;
    base_servings: number;
  }>;
}

interface RecipesTable {
  insert(values: {
    title: string;
    base_servings: number;
    source_type: "youtube";
    created_by: string;
  }): RecipeInsertQuery;
}

interface RecipeSourcesTable {
  insert(values: {
    recipe_id: string;
    youtube_url: string;
    youtube_video_id: string;
    extraction_methods: string[];
    extraction_meta_json: {
      extraction_id: string;
      provider: "mvp_stub";
    };
    raw_extracted_text: string;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface RecipeIngredientInsertRow {
  recipe_id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  scalable: boolean;
  sort_order: number;
}

interface RecipeIngredientsTable {
  insert(values: RecipeIngredientInsertRow[]): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface RecipeStepInsertRow {
  recipe_id: string;
  step_number: number;
  instruction: string;
  cooking_method_id: string;
  ingredients_used: ManualRecipeStepInput["ingredients_used"];
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

interface RecipeStepsTable {
  insert(values: RecipeStepInsertRow[]): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface ParsedYoutubeRegister {
  extractionId: string;
  title: string;
  baseServings: number;
  youtubeUrl: string;
  videoId: string;
  ingredients: ManualRecipeIngredientInput[];
  steps: ManualRecipeStepInput[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const DEFAULT_EXTRACTION_METHODS = ["description", "manual"] as const;
const NEW_COOKING_METHOD = {
  code: "auto_salt",
  label: "절이기",
  color_key: "unassigned",
} as const;
const EXTRACTED_INGREDIENT_NAMES = ["김치", "소금"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value.trim() : null;
}

function table<T>(dbClient: DbClient, tableName: string) {
  return dbClient.from(tableName) as T;
}

export function parseYoutubeUrl(value: unknown) {
  const rawUrl = typeof value === "string" ? value.trim() : "";

  if (!rawUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let videoId: string | null = null;

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  } else if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  return {
    youtubeUrl: rawUrl,
    videoId,
  };
}

function parseYoutubeUrlBody(rawBody: unknown) {
  if (!isRecord(rawBody)) {
    return null;
  }

  return parseYoutubeUrl(rawBody.youtube_url);
}

function buildInvalidUrlResponse() {
  return fail("INVALID_URL", "유효한 유튜브 URL을 입력해주세요.", 422, [
    { field: "youtube_url", reason: "invalid_url" },
  ]);
}

function buildFeatureDisabledResponse() {
  return fail("FEATURE_DISABLED", "유튜브 가져오기는 베타에서 준비 중이에요.", 404);
}

async function requireUser() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();

  return {
    routeClient,
    user: authResult.data.user as User | null,
  };
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function buildVideoInfo(videoId: string) {
  if (videoId.startsWith("nonrecipe")) {
    return {
      isRecipeVideo: false,
      title: "일반 영상",
      channel: "채널명",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  return {
    isRecipeVideo: true,
    title: "백종원 김치찌개",
    channel: "백종원의 요리비책",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export async function handleYoutubeValidate(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return buildFeatureDisabledResponse();
  }

  const { user } = await requireUser();

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const parsedUrl = parseYoutubeUrlBody(await readJson(request));
  if (!parsedUrl) {
    return buildInvalidUrlResponse();
  }

  const video = buildVideoInfo(parsedUrl.videoId);
  const data: YoutubeRecipeValidateData = {
    is_valid_url: true,
    is_recipe_video: video.isRecipeVideo,
    video_info: {
      video_id: parsedUrl.videoId,
      title: video.title,
      channel: video.channel,
      thumbnail_url: video.thumbnailUrl,
    },
    ...(video.isRecipeVideo
      ? {}
      : { message: "이 영상은 요리 레시피가 아닌 것 같아요" }),
  };

  return ok(data);
}

async function findIngredientIds(dbClient: DbClient) {
  const result = await table<ArrayLookupTable<IngredientLookupRow>>(dbClient, "ingredients")
    .select("id, standard_name")
    .in("standard_name", [...EXTRACTED_INGREDIENT_NAMES]);

  if (result.error || !result.data) {
    return {
      error: result.error ?? { message: "ingredient lookup failed" },
      idsByName: new Map<string, string>(),
    };
  }

  return {
    error: null,
    idsByName: new Map(result.data.map((row) => [row.standard_name, row.id])),
  };
}

async function ensureGeneratedCookingMethod(dbClient: DbClient) {
  const cookingMethodsTable = table<CookingMethodsTable>(dbClient, "cooking_methods");
  const existing = await cookingMethodsTable
    .select("id, code, label, color_key, is_system")
    .eq("code", NEW_COOKING_METHOD.code)
    .maybeSingle();

  if (existing.error) {
    return {
      error: existing.error,
      method: null,
    };
  }

  if (existing.data) {
    return {
      error: null,
      method: {
        ...existing.data,
        is_new: false,
      } satisfies YoutubeExtractedCookingMethod,
    };
  }

  const inserted = await cookingMethodsTable
    .insert({
      code: NEW_COOKING_METHOD.code,
      label: NEW_COOKING_METHOD.label,
      color_key: NEW_COOKING_METHOD.color_key,
      is_system: false,
      display_order: 999,
    })
    .select("id, code, label, color_key, is_system")
    .maybeSingle();

  if (inserted.error || !inserted.data) {
    return {
      error: inserted.error ?? { message: "cooking method insert failed" },
      method: null,
    };
  }

  return {
    error: null,
    method: {
      ...inserted.data,
      is_new: true,
    } satisfies YoutubeExtractedCookingMethod,
  };
}

function buildExtractedIngredients(idsByName: Map<string, string>): YoutubeExtractedIngredient[] {
  return [
    {
      ingredient_id: idsByName.get("김치") ?? "",
      standard_name: "김치",
      amount: 200,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "김치 200g",
      sort_order: 1,
      scalable: true,
      confidence: 0.95,
    },
    {
      ingredient_id: idsByName.get("소금") ?? "",
      standard_name: "소금",
      amount: null,
      unit: null,
      ingredient_type: "TO_TASTE",
      display_text: "소금 약간",
      sort_order: 2,
      scalable: false,
      confidence: 0.8,
    },
  ];
}

export async function handleYoutubeExtract(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return buildFeatureDisabledResponse();
  }

  const { routeClient, user } = await requireUser();

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const parsedUrl = parseYoutubeUrlBody(await readJson(request));
  if (!parsedUrl) {
    return buildInvalidUrlResponse();
  }

  if (parsedUrl.videoId.includes("fail")) {
    return fail("EXTRACTION_FAILED", "레시피를 추출하지 못했어요.", 500);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as DbClient;
  const ingredientLookup = await findIngredientIds(dbClient);
  if (ingredientLookup.error) {
    return fail("INTERNAL_ERROR", "재료 정보를 확인하지 못했어요.", 500);
  }

  const cookingMethodResult = await ensureGeneratedCookingMethod(dbClient);
  if (cookingMethodResult.error || !cookingMethodResult.method) {
    return fail("INTERNAL_ERROR", "조리방법을 준비하지 못했어요.", 500);
  }

  const video = buildVideoInfo(parsedUrl.videoId);
  const data: YoutubeRecipeExtractData = {
    extraction_id: crypto.randomUUID(),
    title: video.isRecipeVideo ? video.title : "유튜브 영상 레시피",
    base_servings: 2,
    extraction_methods: [...DEFAULT_EXTRACTION_METHODS],
    ingredients: buildExtractedIngredients(ingredientLookup.idsByName),
    steps: [
      {
        step_number: 1,
        instruction: "김치를 한입 크기로 썬다.",
        cooking_method: cookingMethodResult.method,
        duration_text: null,
      },
    ],
    new_cooking_methods: cookingMethodResult.method.is_new ? [cookingMethodResult.method] : [],
  };

  return ok(data);
}

function normalizeIngredient(row: Record<string, unknown>): ManualRecipeIngredientInput {
  return {
    ingredient_id: typeof row.ingredient_id === "string" ? row.ingredient_id.trim() : "",
    standard_name: typeof row.standard_name === "string" ? row.standard_name.trim() : "",
    amount: typeof row.amount === "number" ? row.amount : null,
    unit: normalizeNullableString(row.unit),
    ingredient_type: row.ingredient_type === "TO_TASTE" ? "TO_TASTE" : "QUANT",
    display_text: normalizeNullableString(row.display_text),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number.NaN,
    scalable: typeof row.scalable === "boolean" ? row.scalable : true,
  };
}

function normalizeIngredientsUsed(value: unknown): ManualRecipeStepInput["ingredients_used"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((ingredient) => {
    if (!isRecord(ingredient)) {
      return {
        ingredient_id: "",
        amount: null,
        unit: null,
        cut_size: null,
      };
    }

    return {
      ingredient_id: typeof ingredient.ingredient_id === "string" ? ingredient.ingredient_id.trim() : "",
      amount: typeof ingredient.amount === "number" ? ingredient.amount : null,
      unit: normalizeNullableString(ingredient.unit),
      cut_size: normalizeNullableString(ingredient.cut_size),
    };
  });
}

function normalizeStep(row: Record<string, unknown>): ManualRecipeStepInput {
  return {
    step_number: typeof row.step_number === "number" ? row.step_number : Number.NaN,
    instruction: typeof row.instruction === "string" ? row.instruction.trim() : "",
    cooking_method_id: typeof row.cooking_method_id === "string" ? row.cooking_method_id.trim() : "",
    ingredients_used: normalizeIngredientsUsed(row.ingredients_used),
    heat_level: normalizeNullableString(row.heat_level),
    duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    duration_text: normalizeNullableString(row.duration_text),
  };
}

function validateIngredient(
  ingredient: ManualRecipeIngredientInput,
  index: number,
  fields: ValidationField[],
) {
  if (!ingredient.ingredient_id) {
    fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "required" });
  } else if (!isUuid(ingredient.ingredient_id)) {
    fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "invalid_uuid" });
  }

  if (!ingredient.standard_name) {
    fields.push({ field: `ingredients[${index}].standard_name`, reason: "required" });
  }

  if (!Number.isInteger(ingredient.sort_order)) {
    fields.push({ field: `ingredients[${index}].sort_order`, reason: "invalid_integer" });
  }

  if (ingredient.ingredient_type === "QUANT") {
    if (typeof ingredient.amount !== "number" || ingredient.amount <= 0) {
      fields.push({ field: `ingredients[${index}].amount`, reason: "positive_number_required" });
    }

    if (!ingredient.unit) {
      fields.push({ field: `ingredients[${index}].unit`, reason: "required" });
    }

    return;
  }

  if (ingredient.amount !== null) {
    fields.push({ field: `ingredients[${index}].amount`, reason: "must_be_null" });
  }

  if (ingredient.unit !== null) {
    fields.push({ field: `ingredients[${index}].unit`, reason: "must_be_null" });
  }

  if (ingredient.scalable !== false) {
    fields.push({ field: `ingredients[${index}].scalable`, reason: "must_be_false" });
  }
}

function validateStep(
  step: ManualRecipeStepInput,
  index: number,
  ingredientIds: Set<string>,
  fields: ValidationField[],
) {
  if (!Number.isInteger(step.step_number) || step.step_number <= 0) {
    fields.push({ field: `steps[${index}].step_number`, reason: "positive_integer_required" });
  }

  if (!step.instruction) {
    fields.push({ field: `steps[${index}].instruction`, reason: "required" });
  }

  if (!step.cooking_method_id) {
    fields.push({ field: `steps[${index}].cooking_method_id`, reason: "required" });
  } else if (!isUuid(step.cooking_method_id)) {
    fields.push({ field: `steps[${index}].cooking_method_id`, reason: "invalid_uuid" });
  }

  if (step.duration_seconds !== null && (!Number.isInteger(step.duration_seconds) || step.duration_seconds < 0)) {
    fields.push({ field: `steps[${index}].duration_seconds`, reason: "non_negative_integer_required" });
  }

  step.ingredients_used.forEach((ingredient, ingredientIndex) => {
    if (!ingredient.ingredient_id) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "required",
      });
    } else if (!isUuid(ingredient.ingredient_id)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "invalid_uuid",
      });
    } else if (!ingredientIds.has(ingredient.ingredient_id)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "not_in_recipe_ingredients",
      });
    }

    if (ingredient.amount !== null && (typeof ingredient.amount !== "number" || ingredient.amount <= 0)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].amount`,
        reason: "positive_number_required",
      });
    }
  });
}

function parseYoutubeRegisterBody(rawBody: unknown) {
  const fields: ValidationField[] = [];

  if (!isRecord(rawBody)) {
    return {
      fields: [{ field: "body", reason: "invalid_object" }],
      parsed: null,
    };
  }

  const extractionId = typeof rawBody.extraction_id === "string" ? rawBody.extraction_id.trim() : "";
  if (!extractionId) {
    fields.push({ field: "extraction_id", reason: "required" });
  } else if (!isUuid(extractionId)) {
    fields.push({ field: "extraction_id", reason: "invalid_uuid" });
  }

  const parsedUrl = parseYoutubeUrl(rawBody.youtube_url);
  if (!parsedUrl) {
    fields.push({ field: "youtube_url", reason: "invalid_url" });
  }

  const title = typeof rawBody.title === "string" ? rawBody.title.trim() : "";
  if (!title) {
    fields.push({ field: "title", reason: "required" });
  } else if (title.length > 200) {
    fields.push({ field: "title", reason: "max_length" });
  }

  const baseServings = rawBody.base_servings;
  if (!isPositiveInteger(baseServings)) {
    fields.push({ field: "base_servings", reason: "positive_integer_required" });
  }

  const ingredientRecords = Array.isArray(rawBody.ingredients) ? rawBody.ingredients : [];
  if (!Array.isArray(rawBody.ingredients) || rawBody.ingredients.length === 0) {
    fields.push({ field: "ingredients", reason: "required" });
  }

  const ingredients = ingredientRecords.map((ingredient) =>
    normalizeIngredient(isRecord(ingredient) ? ingredient : {}),
  );
  const ingredientIds = new Set<string>();
  const ingredientSortOrders = new Set<number>();

  ingredients.forEach((ingredient, index) => {
    const rawIngredient = ingredientRecords[index];
    const ingredientType = isRecord(rawIngredient) ? rawIngredient.ingredient_type : undefined;

    if (ingredientType !== "QUANT" && ingredientType !== "TO_TASTE") {
      fields.push({ field: `ingredients[${index}].ingredient_type`, reason: "invalid_enum" });
    }

    validateIngredient(ingredient, index, fields);

    if (ingredientIds.has(ingredient.ingredient_id)) {
      fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "duplicate" });
    }
    ingredientIds.add(ingredient.ingredient_id);

    if (Number.isInteger(ingredient.sort_order)) {
      if (ingredientSortOrders.has(ingredient.sort_order)) {
        fields.push({ field: `ingredients[${index}].sort_order`, reason: "duplicate" });
      }
      ingredientSortOrders.add(ingredient.sort_order);
    }
  });

  const stepRecords = Array.isArray(rawBody.steps) ? rawBody.steps : [];
  if (!Array.isArray(rawBody.steps) || rawBody.steps.length === 0) {
    fields.push({ field: "steps", reason: "required" });
  }

  const steps = stepRecords.map((step) => normalizeStep(isRecord(step) ? step : {}));
  const stepNumbers = new Set<number>();

  steps.forEach((step, index) => {
    validateStep(step, index, ingredientIds, fields);

    if (Number.isInteger(step.step_number)) {
      if (stepNumbers.has(step.step_number)) {
        fields.push({ field: `steps[${index}].step_number`, reason: "duplicate" });
      }
      stepNumbers.add(step.step_number);
    }
  });

  if (steps.length > 0 && !stepNumbers.has(1)) {
    fields.push({ field: "steps[0].step_number", reason: "must_start_at_1" });
  }

  const parsed =
    fields.length === 0 && parsedUrl
      ? ({
          extractionId,
          title,
          baseServings: baseServings as number,
          youtubeUrl: parsedUrl.youtubeUrl,
          videoId: parsedUrl.videoId,
          ingredients,
          steps,
        } satisfies ParsedYoutubeRegister)
      : null;

  return { fields, parsed };
}

async function findMissingIds(
  dbClient: DbClient,
  tableName: "ingredients" | "cooking_methods",
  ids: string[],
) {
  const result = await table<ArrayLookupTable<IdLookupRow>>(dbClient, tableName)
    .select("id")
    .in("id", ids);

  if (result.error || !result.data) {
    return {
      error: result.error ?? { message: "lookup failed" },
      missingIds: [],
    };
  }

  const existingIds = new Set(result.data.map((row) => row.id));

  return {
    error: null,
    missingIds: ids.filter((id) => !existingIds.has(id)),
  };
}

function buildMissingIngredientFields(
  ingredients: ManualRecipeIngredientInput[],
  missingIds: string[],
) {
  const missingIdSet = new Set(missingIds);

  return ingredients
    .map((ingredient, index) =>
      missingIdSet.has(ingredient.ingredient_id)
        ? { field: `ingredients[${index}].ingredient_id`, reason: "not_found" }
        : null,
    )
    .filter((field): field is ValidationField => field !== null);
}

function buildMissingCookingMethodFields(
  steps: ManualRecipeStepInput[],
  missingIds: string[],
) {
  const missingIdSet = new Set(missingIds);

  return steps
    .map((step, index) =>
      missingIdSet.has(step.cooking_method_id)
        ? { field: `steps[${index}].cooking_method_id`, reason: "not_found" }
        : null,
    )
    .filter((field): field is ValidationField => field !== null);
}

function buildIngredientInsertRows(recipeId: string, ingredients: ManualRecipeIngredientInput[]) {
  return ingredients.map((ingredient) => ({
    recipe_id: recipeId,
    ingredient_id: ingredient.ingredient_id,
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredient_type: ingredient.ingredient_type,
    display_text: ingredient.display_text,
    scalable: ingredient.scalable,
    sort_order: ingredient.sort_order,
  })) satisfies RecipeIngredientInsertRow[];
}

function buildStepInsertRows(recipeId: string, steps: ManualRecipeStepInput[]) {
  return steps.map((step) => ({
    recipe_id: recipeId,
    step_number: step.step_number,
    instruction: step.instruction,
    cooking_method_id: step.cooking_method_id,
    ingredients_used: step.ingredients_used,
    heat_level: step.heat_level,
    duration_seconds: step.duration_seconds,
    duration_text: step.duration_text,
  })) satisfies RecipeStepInsertRow[];
}

function buildRawExtractedText(parsed: ParsedYoutubeRegister) {
  return [
    parsed.title,
    ...parsed.ingredients.map((ingredient) =>
      ingredient.display_text ?? ingredient.standard_name,
    ),
    ...parsed.steps.map((step) => step.instruction),
  ].join("\n");
}

export async function handleYoutubeRegister(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return buildFeatureDisabledResponse();
  }

  const { routeClient, user } = await requireUser();

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const { fields, parsed } = parseYoutubeRegisterBody(await readJson(request));
  if (!parsed) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, fields);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as DbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피를 등록하지 못했어요."),
      500,
    );
  }

  const ingredientIds = [...new Set(parsed.ingredients.map((ingredient) => ingredient.ingredient_id))];
  const ingredientLookup = await findMissingIds(dbClient, "ingredients", ingredientIds);
  if (ingredientLookup.error) {
    return fail("INTERNAL_ERROR", "레시피 재료를 확인하지 못했어요.", 500);
  }

  if (ingredientLookup.missingIds.length > 0) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해주세요.",
      422,
      buildMissingIngredientFields(parsed.ingredients, ingredientLookup.missingIds),
    );
  }

  const cookingMethodIds = [...new Set(parsed.steps.map((step) => step.cooking_method_id))];
  const cookingMethodLookup = await findMissingIds(dbClient, "cooking_methods", cookingMethodIds);
  if (cookingMethodLookup.error) {
    return fail("INTERNAL_ERROR", "조리방법을 확인하지 못했어요.", 500);
  }

  if (cookingMethodLookup.missingIds.length > 0) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해주세요.",
      422,
      buildMissingCookingMethodFields(parsed.steps, cookingMethodLookup.missingIds),
    );
  }

  const recipeResult = await table<RecipesTable>(dbClient, "recipes")
    .insert({
      title: parsed.title,
      base_servings: parsed.baseServings,
      source_type: "youtube",
      created_by: user.id,
    })
    .select("id, title, source_type, created_by, base_servings")
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 등록하지 못했어요.", 500);
  }

  const recipeId = recipeResult.data.id;
  const sourceResult = await table<RecipeSourcesTable>(dbClient, "recipe_sources")
    .insert({
      recipe_id: recipeId,
      youtube_url: parsed.youtubeUrl,
      youtube_video_id: parsed.videoId,
      extraction_methods: [...DEFAULT_EXTRACTION_METHODS],
      extraction_meta_json: {
        extraction_id: parsed.extractionId,
        provider: "mvp_stub",
      },
      raw_extracted_text: buildRawExtractedText(parsed),
    });

  if (sourceResult.error) {
    return fail("INTERNAL_ERROR", "레시피 출처를 등록하지 못했어요.", 500);
  }

  const ingredientInsertResult = await table<RecipeIngredientsTable>(dbClient, "recipe_ingredients")
    .insert(buildIngredientInsertRows(recipeId, parsed.ingredients));

  if (ingredientInsertResult.error) {
    return fail("INTERNAL_ERROR", "레시피 재료를 등록하지 못했어요.", 500);
  }

  const stepInsertResult = await table<RecipeStepsTable>(dbClient, "recipe_steps")
    .insert(buildStepInsertRows(recipeId, parsed.steps));

  if (stepInsertResult.error) {
    return fail("INTERNAL_ERROR", "레시피 조리 순서를 등록하지 못했어요.", 500);
  }

  const data: YoutubeRecipeRegisterData = {
    recipe_id: recipeId,
    title: recipeResult.data.title,
  };

  return ok(data, { status: 201 });
}
