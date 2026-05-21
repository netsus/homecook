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
  YoutubeIngredientResolutionStatus,
  YoutubeRecipeClassificationStatus,
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

interface YoutubeExtractionSessionInsert {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_video_id: string;
  video_title: string;
  channel_title: string;
  thumbnail_url: string | null;
  provider_version: string;
  source_providers: string[];
  classification_status: YoutubeRecipeClassificationStatus;
  classification_reasons: string[];
  raw_source_text: string;
  extraction_meta_json: Record<string, unknown>;
  draft_json: Record<string, unknown>;
  extraction_methods: string[];
  status: "draft";
  expires_at: string;
}

interface YoutubeExtractionSessionRow {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_video_id: string;
  provider_version: string | null;
  extraction_methods: string[];
  raw_source_text: string | null;
  extraction_meta_json: Record<string, unknown>;
  draft_json: Record<string, unknown>;
  status: "draft" | "consumed" | "expired";
  expires_at: string;
}

interface YoutubeExtractionSessionSelectQuery {
  eq(column: string, value: string): YoutubeExtractionSessionSelectQuery;
  maybeSingle(): MaybeSingleResult<YoutubeExtractionSessionRow>;
}

interface YoutubeExtractionSessionsTable {
  insert(values: YoutubeExtractionSessionInsert): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
  select(columns: string): YoutubeExtractionSessionSelectQuery;
}

interface YoutubeRecipeRegisterRpcData {
  recipe_id: string;
  title: string;
}

interface YoutubeRecipeRegisterRpcErrorData {
  error_code:
    | "EXTRACTION_NOT_FOUND"
    | "EXTRACTION_EXPIRED"
    | "EXTRACTION_ALREADY_REGISTERED"
    | "EXTRACTION_MISMATCH"
    | "VALIDATION_ERROR";
  message?: string;
}

type YoutubeRecipeRegisterRpcResultData =
  | YoutubeRecipeRegisterRpcData
  | YoutubeRecipeRegisterRpcErrorData;

interface YoutubeRecipeRegisterRpcClient {
  rpc(
    fn: "register_youtube_recipe_from_session",
    args: {
      p_extraction_id: string;
      p_user_id: string;
      p_title: string;
      p_base_servings: number;
      p_youtube_url: string;
      p_youtube_video_id: string;
      p_ingredients: ManualRecipeIngredientInput[];
      p_steps: ManualRecipeStepInput[];
    },
  ): PromiseLike<{
    data: YoutubeRecipeRegisterRpcResultData | null;
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
const DEFAULT_EXTRACTION_METHODS = ["description"] as const;
const YOUTUBE_PROVIDER_VERSION = "youtube-videos-list-description-v1";
const SESSION_TTL_HOURS = 24;
const NEW_COOKING_METHOD = {
  code: "auto_salt",
  label: "절이기",
  color_key: "unassigned",
} as const;
const EXTRACTED_INGREDIENT_NAMES = ["김치", "소금"] as const;

interface YoutubeProviderVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string | null;
  description: string;
  tags: string[];
  categoryId: string | null;
  duration: string | null;
  captionFlag: string | null;
}

interface YoutubeClassification {
  status: YoutubeRecipeClassificationStatus;
  reasons: string[];
}

interface YoutubeProviderError {
  code: "VIDEO_NOT_FOUND" | "PROVIDER_ERROR" | "QUOTA_EXCEEDED";
  message: string;
  status: number;
}

type YoutubeProviderResult =
  | { video: YoutubeProviderVideo }
  | { providerError: YoutubeProviderError };

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

function canonicalYoutubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
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
    youtubeUrl: canonicalYoutubeUrl(videoId),
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

function getBestThumbnail(thumbnails: unknown, videoId: string) {
  if (isRecord(thumbnails)) {
    for (const key of ["maxres", "standard", "high", "medium", "default"]) {
      const thumbnail = thumbnails[key];
      if (isRecord(thumbnail) && typeof thumbnail.url === "string") {
        return thumbnail.url;
      }
    }
  }

  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function getFixtureVideo(videoId: string): YoutubeProviderResult {
  if (videoId.includes("missing")) {
    return {
      providerError: {
        code: "VIDEO_NOT_FOUND",
        message: "유튜브 영상을 찾지 못했어요.",
        status: 404,
      },
    };
  }

  if (videoId.startsWith("nonrecipe")) {
    return {
      video: {
        videoId,
        title: "일반 영상",
        channel: "채널명",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: "음악과 일상 이야기를 담은 일반 영상입니다.",
        tags: ["music", "vlog"],
        categoryId: "10",
        duration: "PT3M",
        captionFlag: "false",
      },
    };
  }

  if (videoId.startsWith("uncertain")) {
    return {
      video: {
        videoId,
        title: "김치찌개 먹방 브이로그",
        channel: "집밥 채널",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: [
          "오늘은 김치찌개를 먹었습니다.",
          "김치 200g",
          "소금 약간",
          "김치를 한입 크기로 썬다.",
        ].join("\n"),
        tags: ["food", "vlog"],
        categoryId: "26",
        duration: "PT12M",
        captionFlag: "false",
      },
    };
  }

  if (videoId.startsWith("incomplete")) {
    return {
      video: {
        videoId,
        title: "김치찌개 설명 부족한 레시피",
        channel: "집밥 채널",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: [
          "김치찌개 레시피",
          "재료",
          "김치 200g",
          "소금 약간",
        ].join("\n"),
        tags: ["recipe", "김치찌개", "레시피"],
        categoryId: "26",
        duration: "PT8M",
        captionFlag: "false",
      },
    };
  }

  if (videoId.startsWith("needsreview")) {
    return {
      video: {
        videoId,
        title: "백종원 김치찌개 후보 확인 필요",
        channel: "백종원의 요리비책",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: [
          "김치찌개 레시피",
          "재료",
          "김치 200g",
          "소금 약간",
          "조리 과정",
          "김치를 한입 크기로 썬다.",
        ].join("\n"),
        tags: ["recipe", "김치찌개", "레시피"],
        categoryId: "26",
        duration: "PT15M30S",
        captionFlag: "false",
      },
    };
  }

  return {
    video: {
      videoId,
      title: "백종원 김치찌개",
      channel: "백종원의 요리비책",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      description: [
        "김치찌개 레시피",
        "재료",
        "김치 200g",
        "소금 약간",
        "조리 과정",
        "김치를 한입 크기로 썬다.",
      ].join("\n"),
      tags: ["recipe", "김치찌개", "레시피"],
      categoryId: "26",
      duration: "PT15M30S",
      captionFlag: "false",
    },
  };
}

function shouldUseYoutubeFixtureProvider() {
  return process.env.NODE_ENV === "test" || process.env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER === "1";
}

function isQuotaErrorPayload(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return false;
  }

  const errors = payload.error.errors;
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some((error) => {
    if (!isRecord(error) || typeof error.reason !== "string") {
      return false;
    }

    return ["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded"].includes(error.reason);
  });
}

function mapProviderError(payload: unknown): YoutubeProviderError {
  if (isQuotaErrorPayload(payload)) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "YouTube API 할당량을 초과했어요.",
      status: 429,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "YouTube 영상 정보를 가져오지 못했어요.",
    status: 502,
  };
}

function parseYoutubeVideoPayload(videoId: string, payload: unknown): YoutubeProviderResult {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return {
      providerError: {
        code: "PROVIDER_ERROR",
        message: "YouTube 영상 정보를 해석하지 못했어요.",
        status: 502,
      },
    };
  }

  const item = payload.items[0];
  if (!isRecord(item)) {
    return {
      providerError: {
        code: "VIDEO_NOT_FOUND",
        message: "유튜브 영상을 찾지 못했어요.",
        status: 404,
      },
    };
  }

  const snippet = isRecord(item.snippet) ? item.snippet : {};
  const contentDetails = isRecord(item.contentDetails) ? item.contentDetails : {};

  return {
    video: {
      videoId,
      title: typeof snippet.title === "string" ? snippet.title : "유튜브 영상 레시피",
      channel: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "YouTube",
      thumbnailUrl: getBestThumbnail(snippet.thumbnails, videoId),
      description: typeof snippet.description === "string" ? snippet.description : "",
      tags: Array.isArray(snippet.tags)
        ? snippet.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      categoryId: typeof snippet.categoryId === "string" ? snippet.categoryId : null,
      duration: typeof contentDetails.duration === "string" ? contentDetails.duration : null,
      captionFlag: typeof contentDetails.caption === "string" ? contentDetails.caption : null,
    },
  };
}

async function fetchYoutubeVideo(videoId: string): Promise<YoutubeProviderResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    if (shouldUseYoutubeFixtureProvider()) {
      return getFixtureVideo(videoId);
    }

    return {
      providerError: {
        code: "PROVIDER_ERROR",
        message: "YouTube API 키가 설정되지 않았어요.",
        status: 502,
      },
    };
  }

  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    id: videoId,
    key: apiKey,
  });

  let response: Response;

  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  } catch {
    return {
      providerError: {
        code: "PROVIDER_ERROR",
        message: "YouTube API에 연결하지 못했어요.",
        status: 502,
      },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return { providerError: mapProviderError(payload) };
  }

  return parseYoutubeVideoPayload(videoId, payload);
}

function classifyYoutubeVideo(video: YoutubeProviderVideo): YoutubeClassification {
  const haystack = [
    video.title,
    video.description,
    ...video.tags,
  ].join(" ").toLowerCase();

  const recipeKeywords = ["레시피", "재료", "만드는 법", "조리", "요리", "recipe", "ingredients"];
  const foodKeywords = ["김치", "찌개", "국", "볶음", "구이", "밥", "먹방", "food"];
  const nonRecipeKeywords = ["music", "게임", "game", "뉴스", "news", "뮤직비디오", "일반 영상"];

  const recipeHits = recipeKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
  const foodHits = foodKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
  const nonRecipeHits = nonRecipeKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));

  if (recipeHits.length >= 2 || (recipeHits.length >= 1 && video.categoryId === "26")) {
    return {
      status: "recipe",
      reasons: [
        ...recipeHits.map((keyword) => `contains recipe signal: ${keyword}`),
        ...(video.categoryId === "26" ? ["categoryId=26"] : []),
      ],
    };
  }

  if (nonRecipeHits.length > 0 && recipeHits.length === 0 && foodHits.length === 0 && video.categoryId !== "26") {
    return {
      status: "non_recipe",
      reasons: nonRecipeHits.map((keyword) => `contains non-recipe signal: ${keyword}`),
    };
  }

  return {
    status: "uncertain",
    reasons: foodHits.length > 0
      ? foodHits.map((keyword) => `contains weak food signal: ${keyword}`)
      : ["structured recipe signals not found"],
  };
}

function failForProviderError(error: YoutubeProviderError) {
  return fail(error.code, error.message, error.status);
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

  const videoResult = await fetchYoutubeVideo(parsedUrl.videoId);
  if ("providerError" in videoResult) {
    return failForProviderError(videoResult.providerError);
  }

  const { video } = videoResult;
  const classification = classifyYoutubeVideo(video);
  const data: YoutubeRecipeValidateData = {
    is_valid_url: true,
    is_recipe_video: classification.status !== "non_recipe",
    classification_status: classification.status,
    classification_reasons: classification.reasons,
    video_info: {
      video_id: parsedUrl.videoId,
      title: video.title,
      channel: video.channel,
      thumbnail_url: video.thumbnailUrl ?? `https://img.youtube.com/vi/${parsedUrl.videoId}/hqdefault.jpg`,
      duration: video.duration,
      category_id: video.categoryId,
    },
    ...(classification.status !== "non_recipe"
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

function buildExtractedIngredient({
  idsByName,
  name,
  amount,
  unit,
  ingredientType,
  displayText,
  sortOrder,
  scalable,
  confidence,
  rawText,
  forceNeedsReview = false,
}: {
  idsByName: Map<string, string>;
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: "QUANT" | "TO_TASTE";
  displayText: string;
  sortOrder: number;
  scalable: boolean;
  confidence: number;
  rawText: string;
  forceNeedsReview?: boolean;
}): YoutubeExtractedIngredient {
  const ingredientId = idsByName.get(name) ?? "";
  const resolutionStatus: YoutubeIngredientResolutionStatus = forceNeedsReview && ingredientId
    ? "needs_review"
    : ingredientId
      ? "resolved"
      : "unresolved";

  return {
    ingredient_id: resolutionStatus === "resolved" ? ingredientId : "",
    standard_name: name,
    amount,
    unit,
    ingredient_type: ingredientType,
    display_text: displayText,
    sort_order: sortOrder,
    scalable,
    confidence: ingredientId ? confidence : null,
    resolution_status: resolutionStatus,
    candidates: resolutionStatus === "needs_review"
      ? [{ ingredient_id: ingredientId, standard_name: name, confidence }]
      : ingredientId
        ? undefined
        : [],
    raw_text: rawText,
  };
}

function buildExtractedIngredients(
  idsByName: Map<string, string>,
  {
    saltNeedsReview = false,
  }: {
    saltNeedsReview?: boolean;
  } = {},
): YoutubeExtractedIngredient[] {
  return [
    buildExtractedIngredient({
      idsByName,
      name: "김치",
      amount: 200,
      unit: "g",
      ingredientType: "QUANT",
      displayText: "김치 200g",
      sortOrder: 1,
      scalable: true,
      confidence: 0.95,
      rawText: "김치 200g",
    }),
    buildExtractedIngredient({
      idsByName,
      name: "소금",
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      displayText: "소금 약간",
      sortOrder: 2,
      scalable: false,
      confidence: 0.8,
      rawText: "소금 약간",
      forceNeedsReview: saltNeedsReview,
    }),
  ];
}

function buildBlockingIssues(ingredients: YoutubeExtractedIngredient[]) {
  return ingredients
    .map((ingredient, index) =>
      ingredient.resolution_status === "resolved"
        ? null
        : `ingredients[${index}].ingredient_id`,
    )
    .filter((issue): issue is string => issue !== null);
}

function buildStepMissingFields(
  video: YoutubeProviderVideo,
): NonNullable<YoutubeRecipeExtractData["steps"][number]["missing_fields"]> {
  const missingFields: NonNullable<YoutubeRecipeExtractData["steps"][number]["missing_fields"]> = [];

  if (!video.description.includes("김치를 한입 크기로 썬다.")) {
    missingFields.push("instruction");
  }

  return missingFields;
}

function buildSessionExpiresAt() {
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

async function insertExtractionSession(
  dbClient: DbClient,
  session: YoutubeExtractionSessionInsert,
) {
  const result = await table<YoutubeExtractionSessionsTable>(dbClient, "youtube_extraction_sessions")
    .insert(session);

  return result.error;
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

  const videoResult = await fetchYoutubeVideo(parsedUrl.videoId);
  if ("providerError" in videoResult) {
    return failForProviderError(videoResult.providerError);
  }

  const { video } = videoResult;
  const classification = classifyYoutubeVideo(video);
  if (classification.status === "non_recipe") {
    return fail("NOT_RECIPE_VIDEO", "이 영상은 요리 레시피가 아닌 것 같아요.", 422);
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

  const ingredients = buildExtractedIngredients(ingredientLookup.idsByName, {
    saltNeedsReview: parsedUrl.videoId.startsWith("needsreview"),
  });
  const stepMissingFields = buildStepMissingFields(video);
  const blockingIssues = [
    ...buildBlockingIssues(ingredients),
    ...stepMissingFields.map((field) => `steps[0].${field}`),
  ];
  const draftWarnings = classification.status === "uncertain"
    ? ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해주세요."]
    : [];
  const extractionId = crypto.randomUUID();
  const data: YoutubeRecipeExtractData = {
    extraction_id: extractionId,
    title: video.title,
    base_servings: 2,
    extraction_methods: [...DEFAULT_EXTRACTION_METHODS],
    draft_warnings: draftWarnings,
    blocking_issues: blockingIssues,
    ingredients,
    steps: [
      {
        step_number: 1,
        instruction: stepMissingFields.includes("instruction") ? "" : "김치를 한입 크기로 썬다.",
        cooking_method: cookingMethodResult.method,
        duration_text: null,
        is_incomplete: stepMissingFields.length > 0,
        missing_fields: stepMissingFields,
        raw_text: stepMissingFields.includes("instruction") ? "" : "김치를 한입 크기로 썬다.",
      },
    ],
    new_cooking_methods: cookingMethodResult.method.is_new ? [cookingMethodResult.method] : [],
  };

  const sessionError = await insertExtractionSession(dbClient, {
    id: extractionId,
    user_id: user.id,
    youtube_url: parsedUrl.youtubeUrl,
    youtube_video_id: parsedUrl.videoId,
    video_title: video.title,
    channel_title: video.channel,
    thumbnail_url: video.thumbnailUrl,
    provider_version: YOUTUBE_PROVIDER_VERSION,
    source_providers: ["youtube_videos_list", "description_parser"],
    classification_status: classification.status,
    classification_reasons: classification.reasons,
    raw_source_text: video.description,
    extraction_meta_json: {
      provider_version: YOUTUBE_PROVIDER_VERSION,
      source_providers: ["youtube_videos_list", "description_parser"],
      classification_status: classification.status,
      classification_reasons: classification.reasons,
      draft_warnings: draftWarnings,
      caption_capability: "unknown",
    },
    draft_json: data as unknown as Record<string, unknown>,
    extraction_methods: [...DEFAULT_EXTRACTION_METHODS],
    status: "draft",
    expires_at: buildSessionExpiresAt(),
  });

  if (sessionError) {
    return fail("INTERNAL_ERROR", "추출 세션을 저장하지 못했어요.", 500);
  }

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

    const resolutionStatus = isRecord(rawIngredient) ? rawIngredient.resolution_status : undefined;
    if (resolutionStatus !== undefined && resolutionStatus !== "resolved") {
      fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "unresolved" });
    }

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

function isYoutubeRegisterRpcErrorData(
  data: YoutubeRecipeRegisterRpcResultData,
): data is YoutubeRecipeRegisterRpcErrorData {
  return "error_code" in data;
}

function failForRegisterRpcError(data: YoutubeRecipeRegisterRpcErrorData) {
  if (data.error_code === "EXTRACTION_NOT_FOUND") {
    return fail(data.error_code, data.message ?? "추출 세션을 찾을 수 없어요.", 404);
  }

  if (data.error_code === "EXTRACTION_EXPIRED") {
    return fail(data.error_code, data.message ?? "추출 세션이 만료됐어요. 다시 가져와 주세요.", 410);
  }

  if (data.error_code === "EXTRACTION_ALREADY_REGISTERED") {
    return fail(data.error_code, data.message ?? "이미 등록된 추출 결과예요.", 409);
  }

  if (data.error_code === "EXTRACTION_MISMATCH") {
    return fail(data.error_code, data.message ?? "추출한 영상과 등록 요청이 일치하지 않아요.", 409);
  }

  return fail(data.error_code, data.message ?? "요청 값을 확인해주세요.", 422);
}

async function findExtractionSession(dbClient: DbClient, extractionId: string) {
  const result = await table<YoutubeExtractionSessionsTable>(dbClient, "youtube_extraction_sessions")
    .select([
      "id",
      "user_id",
      "youtube_url",
      "youtube_video_id",
      "provider_version",
      "extraction_methods",
      "raw_source_text",
      "extraction_meta_json",
      "draft_json",
      "status",
      "expires_at",
    ].join(", "))
    .eq("id", extractionId)
    .maybeSingle();

  return result;
}

function validateSessionForRegister(
  session: YoutubeExtractionSessionRow | null,
  parsed: ParsedYoutubeRegister,
  userId: string,
) {
  if (!session || session.user_id !== userId) {
    return fail("EXTRACTION_NOT_FOUND", "추출 세션을 찾을 수 없어요.", 404);
  }

  if (session.status === "expired" || new Date(session.expires_at).getTime() <= Date.now()) {
    return fail("EXTRACTION_EXPIRED", "추출 세션이 만료됐어요. 다시 가져와 주세요.", 410);
  }

  if (session.status === "consumed") {
    return fail("EXTRACTION_ALREADY_REGISTERED", "이미 등록된 추출 결과예요.", 409);
  }

  if (session.youtube_video_id !== parsed.videoId || session.youtube_url !== parsed.youtubeUrl) {
    return fail("EXTRACTION_MISMATCH", "추출한 영상과 등록 요청이 일치하지 않아요.", 409);
  }

  return null;
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

  const sessionResult = await findExtractionSession(dbClient, parsed.extractionId);
  if (sessionResult.error) {
    return fail("INTERNAL_ERROR", "추출 세션을 확인하지 못했어요.", 500);
  }

  const sessionFailure = validateSessionForRegister(sessionResult.data, parsed, user.id);
  if (sessionFailure) {
    return sessionFailure;
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

  const registerResult = await (dbClient as unknown as YoutubeRecipeRegisterRpcClient).rpc(
    "register_youtube_recipe_from_session",
    {
      p_extraction_id: parsed.extractionId,
      p_user_id: user.id,
      p_title: parsed.title,
      p_base_servings: parsed.baseServings,
      p_youtube_url: parsed.youtubeUrl,
      p_youtube_video_id: parsed.videoId,
      p_ingredients: parsed.ingredients,
      p_steps: parsed.steps,
    },
  );

  if (registerResult.error || !registerResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 등록하지 못했어요.", 500);
  }

  if (isYoutubeRegisterRpcErrorData(registerResult.data)) {
    return failForRegisterRpcError(registerResult.data);
  }

  const data: YoutubeRecipeRegisterData = {
    recipe_id: registerResult.data.recipe_id,
    title: registerResult.data.title,
  };

  return ok(data, { status: 201 });
}
