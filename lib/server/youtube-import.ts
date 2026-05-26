import type { User } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/response";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import { isValidIngredientCategory } from "@/lib/ingredient-categories";
import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  selectPrimaryRecipeCandidate,
  type FlatDraftAdaptation,
  type FlatDraftIngredient,
} from "@/lib/server/youtube-description-parser";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { recordOperationalEventFromServiceRole } from "@/lib/server/admin-events";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON } from "@/lib/youtube-import-constants";
import type {
  IngredientCategory,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
  YoutubeExtractedCookingMethod,
  YoutubeExtractedIngredient,
  YoutubeIngredientRegistrationData,
  YoutubeIngredientRegistrationSynonymStatus,
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

type MatchSource = "direct" | "synonym";

interface IngredientMatch {
  standardName: string;
  source: MatchSource;
}

interface IngredientSynonymLookupRow {
  synonym: string;
  ingredients: IngredientLookupRow | IngredientLookupRow[] | null;
}

type IngredientMatchesByName = Map<string, Map<string, IngredientMatch>>;

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

interface YoutubeIngredientRegistrationRpcData {
  ingredient_id: string;
  standard_name: string;
  category: IngredientCategory;
  default_unit: string | null;
  synonym_status: YoutubeIngredientRegistrationSynonymStatus;
  warnings: string[] | null;
}

interface YoutubeIngredientRegistrationRpcClient {
  rpc(
    fn: "register_youtube_ingredient",
    args: {
      p_standard_name: string;
      p_category: IngredientCategory;
      p_default_unit: string | null;
      p_synonym: string | null;
    },
  ): PromiseLike<{
    data: YoutubeIngredientRegistrationRpcData | null;
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

interface ParsedYoutubeIngredientRegistration {
  extractionId: string;
  draftIngredientId: string;
  standardName: string;
  category: IngredientCategory;
  defaultUnit: string | null;
  synonym: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const DEFAULT_EXTRACTION_METHODS = ["description"] as const;
const YOUTUBE_PROVIDER_VERSION = "youtube-videos-list-description-v1";
const SESSION_TTL_HOURS = 24;
const CAPTION_TRANSCRIPT_RAW_SOURCE_HEADER = "--- caption transcript ---";
const OEMBED_PREVIEW_CLASSIFICATION_REASONS = [YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON];
const NEW_COOKING_METHOD = {
  code: "auto_salt",
  label: "절이기",
  color_key: "unassigned",
} as const;
const DEFAULT_STEP_METHOD_CODE = "prep";
type SystemStepMethodCode =
  | "prep"
  | "mix"
  | "grill"
  | "stir_fry"
  | "boil"
  | "deep_fry"
  | "steam"
  | "blanch";
type StepMethodCode = SystemStepMethodCode | typeof NEW_COOKING_METHOD.code;

type DescriptionSection = "ingredients" | "steps";
type YoutubeDescriptionParserVersion = "legacy" | "v2" | "shadow";

interface ParsedDescriptionIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: "QUANT" | "TO_TASTE";
  displayText: string;
  rawText: string;
  scalable: boolean;
  confidence: number;
}

interface ParsedRecipeDescription {
  ingredients: ParsedDescriptionIngredient[];
  steps: string[];
}

interface ParsedRecipeDescriptionForImport {
  recipe: ParsedRecipeDescription;
  parserVersion: YoutubeDescriptionParserVersion;
  selectionOutcome: string;
  draftWarnings: string[];
  blockingIssues: string[];
  includeIncompleteStepFallback: boolean;
  shadowResult?: {
    selectionOutcome: string;
    ingredientCount: number;
    stepCount: number;
    ingredientNames: string[];
    stepInstructions: string[];
    draftWarnings: string[];
    blockingIssues: string[];
  };
}

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

export type YoutubeTranscriptProviderStatus =
  | "available"
  | "unavailable"
  | "disabled"
  | "error";

export interface YoutubeTranscriptProviderContext {
  videoId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  captionCapability: "available" | "unavailable" | "unknown";
}

export interface YoutubeTranscriptProviderResult {
  status: YoutubeTranscriptProviderStatus;
  providerName?: string;
  transcriptText?: string | null;
  language?: string | null;
  trackKind?: "manual" | "auto" | "unknown" | null;
  reason?: string | null;
}

export interface YoutubeTranscriptProvider {
  name: string;
  fetchTranscript(context: YoutubeTranscriptProviderContext): Promise<YoutubeTranscriptProviderResult>;
}

interface YoutubePreviewVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string | null;
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

type YoutubePreviewResult =
  | { video: YoutubePreviewVideo }
  | { providerError: YoutubeProviderError };

interface TranscriptFallbackMeta {
  attempted: boolean;
  capability: "available" | "unavailable" | "unknown";
  provider: string | null;
  status:
    | "not_needed"
    | "capability_unavailable"
    | "disabled"
    | "unavailable"
    | "error"
    | "no_steps"
    | "used";
  reason: string | null;
  language: string | null;
  track_kind: string | null;
  step_count: number;
}

interface TranscriptFallbackResult {
  steps: string[];
  usedTranscript: boolean;
  rawTranscriptText: string | null;
  meta: TranscriptFallbackMeta;
}

const NOOP_TRANSCRIPT_PROVIDER: YoutubeTranscriptProvider = {
  name: "noop",
  async fetchTranscript() {
    return {
      status: "disabled",
      providerName: "noop",
      reason: "no_provider_configured",
    };
  },
};

let transcriptProviderForTest: YoutubeTranscriptProvider | null = null;

export function setYoutubeTranscriptProviderForTest(provider: YoutubeTranscriptProvider | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeTranscriptProviderForTest is only available in tests");
  }

  const previousProvider = transcriptProviderForTest;
  transcriptProviderForTest = provider;

  return () => {
    transcriptProviderForTest = previousProvider;
  };
}

function getYoutubeTranscriptProvider() {
  return transcriptProviderForTest ?? NOOP_TRANSCRIPT_PROVIDER;
}

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

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function hasControlCharacters(value: string) {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function normalizeOptionalLowercaseString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
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

  if (videoId.startsWith("transcript")) {
    return {
      video: {
        videoId,
        title: "김치찌개 자막 보충 레시피",
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
        captionFlag: "true",
      },
    };
  }

  if (videoId.startsWith("nocaption")) {
    return {
      video: {
        videoId,
        title: "김치찌개 자막 없는 레시피",
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
          "만들기",
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
        "만들기",
        "김치를 한입 크기로 썬다.",
      ].join("\n"),
      tags: ["recipe", "김치찌개", "레시피"],
      categoryId: "26",
      duration: "PT15M30S",
      captionFlag: "false",
    },
  };
}

function getFixturePreview(videoId: string): YoutubePreviewResult {
  const fixture = getFixtureVideo(videoId);

  if ("providerError" in fixture) {
    return fixture;
  }

  return {
    video: {
      videoId,
      title: fixture.video.title,
      channel: fixture.video.channel,
      thumbnailUrl: fixture.video.thumbnailUrl,
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
      captionFlag: typeof contentDetails.caption === "string" || typeof contentDetails.caption === "boolean"
        ? String(contentDetails.caption)
        : null,
    },
  };
}

function parseYoutubeOEmbedPayload(videoId: string, payload: unknown): YoutubePreviewResult {
  if (!isRecord(payload)) {
    return {
      providerError: {
        code: "PROVIDER_ERROR",
        message: "YouTube 영상 미리보기를 해석하지 못했어요.",
        status: 502,
      },
    };
  }

  return {
    video: {
      videoId,
      title: typeof payload.title === "string" ? payload.title : "유튜브 영상",
      channel: typeof payload.author_name === "string" ? payload.author_name : "YouTube",
      thumbnailUrl: typeof payload.thumbnail_url === "string"
        ? payload.thumbnail_url
        : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    },
  };
}

async function fetchYoutubePreview(
  videoId: string,
  youtubeUrl: string,
): Promise<YoutubePreviewResult> {
  if (shouldUseYoutubeFixtureProvider()) {
    return getFixturePreview(videoId);
  }

  const params = new URLSearchParams({
    url: youtubeUrl,
    format: "json",
  });

  let response: Response;

  try {
    response = await fetch(`https://www.youtube.com/oembed?${params.toString()}`);
  } catch {
    return {
      providerError: {
        code: "PROVIDER_ERROR",
        message: "YouTube 영상 미리보기에 연결하지 못했어요.",
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
    return {
      providerError: {
        code: response.status === 404 ? "VIDEO_NOT_FOUND" : "PROVIDER_ERROR",
        message: response.status === 404
          ? "유튜브 영상을 찾지 못했어요."
          : "YouTube 영상 미리보기를 가져오지 못했어요.",
        status: response.status === 404 ? 404 : 502,
      },
    };
  }

  return parseYoutubeOEmbedPayload(videoId, payload);
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

async function recordYoutubeProviderFailure(
  request: Request,
  userId: string,
  stage: "validate" | "extract" | "register",
  error: YoutubeProviderError | { code: string; status: number },
) {
  await recordOperationalEventFromServiceRole({
    event_type: "youtube_provider_failure",
    severity: error.status === 429 ? "warn" : "error",
    source: "youtube",
    actor_user_id: userId,
    request,
    http_status: error.status,
    error_code: error.code,
    message_summary: "YouTube provider request failed",
    metadata_json: { stage },
  });
}

function getRecipeDescriptionSection(line: string): DescriptionSection | null {
  const normalized = line
    .trim()
    .replace(/^[^\p{L}\p{N}#]+/u, "")
    .replace(/^[\[(【{]+|[\])】}]+$/gu, "")
    .replace(/\([^)]*\)/gu, "")
    .replace(/[：:]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();

  if (!normalized || normalized.length > 40) {
    return null;
  }

  if (/^(기본\s*)?(재료|준비\s*재료|재료\s*준비|준비물|ingredients?)(\s|$)/u.test(normalized)) {
    return "ingredients";
  }

  if (/^(순서|조리\s*(과정|순서|방법|법)|만드는\s*(법|방법|순서)|만들기|요리\s*(법|과정|순서)|레시피\s*순서|steps?|directions?|method)(\s|$)/u.test(normalized)) {
    return "steps";
  }

  return null;
}

function shouldStopDescriptionSection(line: string) {
  const normalized = line.trim().toLowerCase();

  return (
    normalized.startsWith("#")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.includes("bgm")
    || normalized.includes("instagram")
    || normalized.includes("제품 정보")
    || normalized.includes("구매 링크")
    || normalized.includes("출처")
    || normalized.includes("인스타")
    || normalized.includes("블로그")
    || normalized.includes("구독")
    || normalized.includes("좋아요")
    || normalized.includes("알림설정")
  );
}

function cleanDescriptionItemText(line: string) {
  return line
    .trim()
    .replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/u, "")
    .replace(/^[\s>]*(?:[^\p{L}\p{N}#]+)\s*/u, "")
    .replace(/^[\s>]*[-–—•·*]+\s*/u, "")
    .replace(/^[\s>]*\d+[.)]\s*/u, "")
    .replace(/^[\s>]*[①②③④⑤⑥⑦⑧⑨⑩]\s*/u, "")
    .trim();
}

function parseRecipeAmount(value: string) {
  const normalizedValue = value.trim();

  if (/[~-]/u.test(normalizedValue)) {
    const [firstValue] = normalizedValue.split(/[~-]/u);
    return parseRecipeAmount(firstValue);
  }

  if (normalizedValue.includes("/")) {
    const [numerator, denominator] = normalizedValue.split("/").map(Number);

    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const parsed = Number(normalizedValue.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeParsedIngredientName(value: string) {
  return value.replace(/[：:]+$/u, "").trim();
}

function parseDescriptionIngredientLine(
  line: string,
  {
    allowAmountless,
  }: {
    allowAmountless: boolean;
  },
): ParsedDescriptionIngredient | null {
  const rawText = line.trim();
  if (shouldStopDescriptionSection(rawText)) {
    return null;
  }

  const cleanText = cleanDescriptionItemText(rawText);

  if (!cleanText || cleanText.length > 80 || getRecipeDescriptionSection(cleanText) || shouldStopDescriptionSection(cleanText)) {
    return null;
  }

  const numericMatch = cleanText.match(/^(.+?)(?:\s*[：:]\s*|\s+)?([0-9]+\/[0-9]+|[0-9]+(?:[.,][0-9]+)?(?:\s*[~-]\s*[0-9]+(?:[.,][0-9]+)?)?)\s*([^\s\d()]+)?(?:\([^)]*\))?\s*$/u);
  if (numericMatch) {
    const amount = parseRecipeAmount(numericMatch[2]);
    const name = normalizeParsedIngredientName(numericMatch[1]);

    if (!name || amount === null) {
      return null;
    }

    return {
      name,
      amount,
      unit: numericMatch[3]?.trim() || null,
      ingredientType: "QUANT",
      displayText: cleanText,
      rawText,
      scalable: true,
      confidence: 0.95,
    };
  }

  const toTasteMatch = cleanText.match(/^(.+?)\s*(?:약간|조금|적당량|취향껏|취향에\s*따라|원하는\s*만큼)$/u);
  if (toTasteMatch) {
    const name = toTasteMatch[1].trim();

    if (!name) {
      return null;
    }

    return {
      name,
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      displayText: cleanText,
      rawText,
      scalable: false,
      confidence: 0.8,
    };
  }

  if (!allowAmountless || /[.!?。]|(습니다|주세요|합니다|됩니다|완성|넣어|버무려|자른|썬다|구워)/u.test(cleanText)) {
    return null;
  }

  return {
    name: cleanText,
    amount: null,
    unit: null,
    ingredientType: "TO_TASTE",
    displayText: cleanText,
    rawText,
    scalable: false,
    confidence: 0.8,
  };
}

function hasCookingAction(text: string) {
  return /(씻|자르|잘라|썰|썬다|볶아|볶고|볶아요|볶는다|끓|삶|굽|구워|버무|섞|넣|절여|절이|올려|발라|뿌려|익혀|튀겨|찐|쪄|데쳐|풀어|두르|맞춰|완성)/u.test(text);
}

function parseDescriptionStepLine(
  line: string,
  {
    requireCookingAction,
  }: {
    requireCookingAction: boolean;
  },
) {
  if (shouldStopDescriptionSection(line)) {
    return null;
  }

  const cleanText = cleanDescriptionItemText(line);

  if (!cleanText || cleanText.length < 5 || getRecipeDescriptionSection(cleanText) || shouldStopDescriptionSection(cleanText)) {
    return null;
  }

  if (requireCookingAction && !hasCookingAction(cleanText)) {
    return null;
  }

  return cleanText;
}

function uniqueParsedIngredients(ingredients: ParsedDescriptionIngredient[]) {
  const seen = new Set<string>();
  const uniqueIngredients: ParsedDescriptionIngredient[] = [];

  for (const ingredient of ingredients) {
    if (seen.has(ingredient.name)) {
      continue;
    }

    seen.add(ingredient.name);
    uniqueIngredients.push(ingredient);
  }

  return uniqueIngredients;
}

function parseRecipeDescription(description: string): ParsedRecipeDescription {
  const lines = description.split(/\r?\n/u);
  const ingredients: ParsedDescriptionIngredient[] = [];
  const steps: string[] = [];
  let section: DescriptionSection | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const nextSection = getRecipeDescriptionSection(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }

    if (shouldStopDescriptionSection(line)) {
      section = null;
      continue;
    }

    if (section === "ingredients") {
      const ingredient = parseDescriptionIngredientLine(line, { allowAmountless: true });
      if (ingredient) {
        ingredients.push(ingredient);
      }
      continue;
    }

    if (section === "steps") {
      const step = parseDescriptionStepLine(line, { requireCookingAction: false });
      if (step) {
        steps.push(step);
      }
    }
  }

  if (ingredients.length === 0) {
    for (const line of lines) {
      const ingredient = parseDescriptionIngredientLine(line, { allowAmountless: false });
      if (ingredient) {
        ingredients.push(ingredient);
      }
    }
  }

  if (steps.length === 0) {
    for (const line of lines) {
      const step = parseDescriptionStepLine(line, { requireCookingAction: true });
      if (step) {
        steps.push(step);
      }
    }
  }

  return {
    ingredients: uniqueParsedIngredients(ingredients),
    steps,
  };
}

function getYoutubeDescriptionParserVersion(): YoutubeDescriptionParserVersion {
  const rawValue = (
    process.env.HOMECOOK_YOUTUBE_DESCRIPTION_PARSER
    ?? process.env.HOMECOOK_YOUTUBE_PARSER_VERSION
    ?? "v2"
  ).trim();

  if (rawValue === "legacy" || rawValue === "v2" || rawValue === "shadow") {
    return rawValue;
  }

  return "v2";
}

function adaptFlatDraftIngredient(ingredient: FlatDraftIngredient): ParsedDescriptionIngredient {
  return {
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredientType: ingredient.ingredientType,
    displayText: ingredient.displayText,
    rawText: ingredient.rawText,
    scalable: ingredient.scalable,
    confidence: ingredient.confidence,
  };
}

function adaptFlatDraftRecipe(draft: FlatDraftAdaptation): ParsedRecipeDescription {
  return {
    ingredients: draft.ingredients.map(adaptFlatDraftIngredient),
    steps: draft.steps,
  };
}

function parseRecipeDescriptionV2(video: YoutubeProviderVideo) {
  const document = parseYoutubeRecipeDescription({
    title: video.title,
    description: video.description,
  });
  const selection = selectPrimaryRecipeCandidate(document);
  const draft = adaptCandidateToFlatDraft(selection);

  return {
    recipe: adaptFlatDraftRecipe(draft),
    selectionOutcome: selection.outcome,
    draftWarnings: draft.draftWarnings,
    blockingIssues: draft.blockingIssues,
    includeIncompleteStepFallback: draft.includeIncompleteStepFallback,
  };
}

function parseRecipeDescriptionForImport(video: YoutubeProviderVideo): ParsedRecipeDescriptionForImport {
  const parserVersion = getYoutubeDescriptionParserVersion();
  const legacyRecipe = parseRecipeDescription(video.description);

  if (parserVersion === "legacy") {
    return {
      recipe: legacyRecipe,
      parserVersion,
      selectionOutcome: "legacy",
      draftWarnings: [],
      blockingIssues: [],
      includeIncompleteStepFallback: true,
    };
  }

  const v2Result = parseRecipeDescriptionV2(video);

  if (parserVersion === "shadow") {
    return {
      recipe: legacyRecipe,
      parserVersion,
      selectionOutcome: "legacy_shadow_primary",
      draftWarnings: [],
      blockingIssues: [],
      includeIncompleteStepFallback: true,
      shadowResult: {
        selectionOutcome: v2Result.selectionOutcome,
        ingredientCount: v2Result.recipe.ingredients.length,
        stepCount: v2Result.recipe.steps.length,
        ingredientNames: v2Result.recipe.ingredients.map((ingredient) => ingredient.name),
        stepInstructions: v2Result.recipe.steps,
        draftWarnings: v2Result.draftWarnings,
        blockingIssues: v2Result.blockingIssues,
      },
    };
  }

  return {
    recipe: v2Result.recipe,
    parserVersion,
    selectionOutcome: v2Result.selectionOutcome,
    draftWarnings: v2Result.draftWarnings,
    blockingIssues: v2Result.blockingIssues,
    includeIncompleteStepFallback: v2Result.includeIncompleteStepFallback,
  };
}

function getCaptionCapability(
  captionFlag: string | null,
): YoutubeTranscriptProviderContext["captionCapability"] {
  const normalized = captionFlag?.trim().toLowerCase();

  if (normalized === "true") {
    return "available";
  }

  if (normalized === "false") {
    return "unavailable";
  }

  return "unknown";
}

function shouldAttemptTranscriptFallback(parsedRecipe: ParsedRecipeDescription) {
  return parsedRecipe.ingredients.length > 0 && parsedRecipe.steps.length === 0;
}

function buildTranscriptFallbackMeta({
  attempted,
  capability,
  provider,
  status,
  reason = null,
  language = null,
  trackKind = null,
  stepCount = 0,
}: {
  attempted: boolean;
  capability: TranscriptFallbackMeta["capability"];
  provider: string | null;
  status: TranscriptFallbackMeta["status"];
  reason?: string | null;
  language?: string | null;
  trackKind?: string | null;
  stepCount?: number;
}): TranscriptFallbackMeta {
  return {
    attempted,
    capability,
    provider,
    status,
    reason,
    language,
    track_kind: trackKind,
    step_count: stepCount,
  };
}

function parseTranscriptSteps(transcriptText: string) {
  const normalized = transcriptText.trim();

  if (!normalized) {
    return [];
  }

  return parseRecipeDescription(normalized).steps;
}

function buildRawSourceText(description: string, transcriptText: string | null) {
  const normalizedTranscript = transcriptText?.trim();

  if (!normalizedTranscript) {
    return description;
  }

  return [
    description,
    CAPTION_TRANSCRIPT_RAW_SOURCE_HEADER,
    normalizedTranscript,
  ].join("\n\n");
}

async function resolveTranscriptFallback(
  video: YoutubeProviderVideo,
  parsedRecipe: ParsedRecipeDescription,
  parsedUrl: { youtubeUrl: string; videoId: string },
): Promise<TranscriptFallbackResult> {
  const capability = getCaptionCapability(video.captionFlag);

  if (!shouldAttemptTranscriptFallback(parsedRecipe)) {
    return {
      steps: parsedRecipe.steps,
      usedTranscript: false,
      rawTranscriptText: null,
      meta: buildTranscriptFallbackMeta({
        attempted: false,
        capability,
        provider: null,
        status: "not_needed",
      }),
    };
  }

  if (capability === "unavailable") {
    return {
      steps: parsedRecipe.steps,
      usedTranscript: false,
      rawTranscriptText: null,
      meta: buildTranscriptFallbackMeta({
        attempted: false,
        capability,
        provider: null,
        status: "capability_unavailable",
      }),
    };
  }

  const provider = getYoutubeTranscriptProvider();
  let providerResult: YoutubeTranscriptProviderResult;

  try {
    providerResult = await provider.fetchTranscript({
      videoId: parsedUrl.videoId,
      youtubeUrl: parsedUrl.youtubeUrl,
      title: video.title,
      channel: video.channel,
      captionCapability: capability,
    });
  } catch (error) {
    return {
      steps: parsedRecipe.steps,
      usedTranscript: false,
      rawTranscriptText: null,
      meta: buildTranscriptFallbackMeta({
        attempted: true,
        capability,
        provider: provider.name,
        status: "error",
        reason: error instanceof Error ? error.message : "provider_error",
      }),
    };
  }

  const providerName = providerResult.providerName ?? provider.name;
  const transcriptText = providerResult.transcriptText?.trim() ?? "";

  if (providerResult.status !== "available" || !transcriptText) {
    return {
      steps: parsedRecipe.steps,
      usedTranscript: false,
      rawTranscriptText: null,
      meta: buildTranscriptFallbackMeta({
        attempted: true,
        capability,
        provider: providerName,
        status: providerResult.status === "available" ? "unavailable" : providerResult.status,
        reason: providerResult.reason ?? (transcriptText ? null : "empty_transcript"),
        language: providerResult.language ?? null,
        trackKind: providerResult.trackKind ?? null,
      }),
    };
  }

  const transcriptSteps = parseTranscriptSteps(transcriptText);

  if (transcriptSteps.length === 0) {
    return {
      steps: parsedRecipe.steps,
      usedTranscript: false,
      rawTranscriptText: null,
      meta: buildTranscriptFallbackMeta({
        attempted: true,
        capability,
        provider: providerName,
        status: "no_steps",
        reason: providerResult.reason ?? "no_parseable_steps",
        language: providerResult.language ?? null,
        trackKind: providerResult.trackKind ?? null,
      }),
    };
  }

  return {
    steps: transcriptSteps,
    usedTranscript: true,
    rawTranscriptText: transcriptText,
    meta: buildTranscriptFallbackMeta({
      attempted: true,
      capability,
      provider: providerName,
      status: "used",
      reason: providerResult.reason ?? null,
      language: providerResult.language ?? null,
      trackKind: providerResult.trackKind ?? null,
      stepCount: transcriptSteps.length,
    }),
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

  const previewResult = await fetchYoutubePreview(parsedUrl.videoId, parsedUrl.youtubeUrl);
  if ("providerError" in previewResult) {
    await recordYoutubeProviderFailure(request, user.id, "validate", previewResult.providerError);
    return failForProviderError(previewResult.providerError);
  }

  const { video } = previewResult;
  const data: YoutubeRecipeValidateData = {
    is_valid_url: true,
    is_recipe_video: true,
    classification_status: "uncertain",
    classification_reasons: OEMBED_PREVIEW_CLASSIFICATION_REASONS,
    video_info: {
      video_id: parsedUrl.videoId,
      title: video.title,
      channel: video.channel,
      thumbnail_url: video.thumbnailUrl ?? `https://img.youtube.com/vi/${parsedUrl.videoId}/hqdefault.jpg`,
    },
  };

  return ok(data);
}

export async function findIngredientIds(dbClient: DbClient, ingredientNames: string[]) {
  const lookupKeyToOriginalNames = new Map<string, Set<string>>();

  for (const name of ingredientNames) {
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }

    for (const key of new Set([trimmed, trimmed.toLowerCase()])) {
      const originals = lookupKeyToOriginalNames.get(key);
      if (originals) {
        originals.add(name);
      } else {
        lookupKeyToOriginalNames.set(key, new Set([name]));
      }
    }
  }

  const lookupKeys = [...lookupKeyToOriginalNames.keys()];

  if (lookupKeys.length === 0) {
    return {
      error: null,
      matchesByName: new Map<string, Map<string, IngredientMatch>>(),
    };
  }

  const [directResult, synonymResult] = await Promise.all([
    table<ArrayLookupTable<IngredientLookupRow>>(dbClient, "ingredients")
      .select("id, standard_name")
      .in("standard_name", lookupKeys),
    table<ArrayLookupTable<IngredientSynonymLookupRow>>(dbClient, "ingredient_synonyms")
      .select("synonym, ingredients!inner(id, standard_name)")
      .in("synonym", lookupKeys),
  ]);

  if (directResult.error || !directResult.data || synonymResult.error || !synonymResult.data) {
    return {
      error: directResult.error
        ?? synonymResult.error
        ?? { message: "ingredient lookup failed" },
      matchesByName: new Map<string, Map<string, IngredientMatch>>(),
    };
  }

  const matchesByName: IngredientMatchesByName = new Map();
  const attach = (
    lookupKey: string,
    ingredientId: string,
    standardName: string,
    source: MatchSource,
  ) => {
    for (const originalName of lookupKeyToOriginalNames.get(lookupKey) ?? []) {
      let bucket = matchesByName.get(originalName);
      if (!bucket) {
        bucket = new Map<string, IngredientMatch>();
        matchesByName.set(originalName, bucket);
      }

      const existing = bucket.get(ingredientId);
      if (!existing || (existing.source === "synonym" && source === "direct")) {
        bucket.set(ingredientId, { standardName, source });
      }
    }
  };

  for (const row of directResult.data) {
    attach(row.standard_name, row.id, row.standard_name, "direct");
  }

  for (const row of synonymResult.data) {
    const ingredient = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients;
    if (!ingredient) {
      continue;
    }

    attach(row.synonym, ingredient.id, ingredient.standard_name, "synonym");
  }

  return {
    error: null,
    matchesByName,
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

async function findCookingMethodsByCode(dbClient: DbClient, codes: StepMethodCode[]) {
  const uniqueCodes = [...new Set(codes)];

  if (uniqueCodes.length === 0) {
    return {
      error: null,
      methodsByCode: new Map<string, YoutubeExtractedCookingMethod>(),
    };
  }

  const result = await table<ArrayLookupTable<CookingMethodRow>>(dbClient, "cooking_methods")
    .select("id, code, label, color_key, is_system")
    .in("code", uniqueCodes);

  if (result.error || !result.data) {
    return {
      error: result.error ?? { message: "cooking method lookup failed" },
      methodsByCode: new Map<string, YoutubeExtractedCookingMethod>(),
    };
  }

  return {
    error: null,
    methodsByCode: new Map(
      result.data.map((method) => [
        method.code,
        {
          id: method.id,
          code: method.code,
          label: method.label,
          color_key: method.color_key,
          is_new: false,
        } satisfies YoutubeExtractedCookingMethod,
      ]),
    ),
  };
}

function inferStepCookingMethodCode(instruction: string): StepMethodCode {
  const normalized = instruction.toLowerCase();

  if (/(절여(?:준다|주세요|요|둔다|두|놓)|절이(?:고|기|면|세요|다)|절인다|재워|재우|숙성)/u.test(normalized)) {
    return NEW_COOKING_METHOD.code;
  }

  if (/(굽|구워|구우|토스트|바삭하게|노릇)/u.test(normalized)) {
    return "grill";
  }

  if (/(볶)/u.test(normalized)) {
    return "stir_fry";
  }

  if (/(끓|삶|졸여|졸이|조려|조리듯)/u.test(normalized)) {
    return "boil";
  }

  if (/(튀)/u.test(normalized)) {
    return "deep_fry";
  }

  if (/(찐|쪄|찌기|찐다)/u.test(normalized)) {
    return "steam";
  }

  if (/(데쳐|데치|헹궈|헹구)/u.test(normalized)) {
    return "blanch";
  }

  if (/(버무|섞|비벼|비비|무쳐|무치|풀어|맞춰|발라|올려|뿌려|갈아\s*넣)/u.test(normalized)) {
    return "mix";
  }

  return DEFAULT_STEP_METHOD_CODE;
}

async function resolveCookingMethodsForSteps(dbClient: DbClient, parsedSteps: string[]) {
  const inferredCodes: StepMethodCode[] = parsedSteps.length > 0
    ? parsedSteps.map(inferStepCookingMethodCode)
    : [DEFAULT_STEP_METHOD_CODE];
  const lookup = await findCookingMethodsByCode(dbClient, inferredCodes);

  if (lookup.error) {
    return {
      error: lookup.error,
      methods: [],
      fallbackMethod: null,
      newCookingMethods: [],
    };
  }

  const missingInferredMethod = inferredCodes.some((code) => !lookup.methodsByCode.has(code));
  let fallbackMethod = lookup.methodsByCode.get(DEFAULT_STEP_METHOD_CODE)
    ?? lookup.methodsByCode.get(NEW_COOKING_METHOD.code)
    ?? inferredCodes.map((code) => lookup.methodsByCode.get(code)).find(Boolean)
    ?? null;
  const newCookingMethods: YoutubeExtractedCookingMethod[] = [];

  if (missingInferredMethod || !fallbackMethod) {
    const generated = await ensureGeneratedCookingMethod(dbClient);

    if (generated.error || !generated.method) {
      return {
        error: generated.error ?? { message: "cooking method fallback failed" },
        methods: [],
        fallbackMethod: null,
        newCookingMethods: [],
      };
    }

    lookup.methodsByCode.set(NEW_COOKING_METHOD.code, generated.method);
    fallbackMethod = generated.method;

    if (generated.method.is_new) {
      newCookingMethods.push(generated.method);
    }
  }

  return {
    error: null,
    methods: inferredCodes.map((code) =>
      lookup.methodsByCode.get(code) ?? fallbackMethod,
    ).filter((method): method is YoutubeExtractedCookingMethod => method !== null),
    fallbackMethod,
    newCookingMethods,
  };
}

function sortIngredientMatches(
  matches: Array<{ ingredientId: string; standardName: string; source: MatchSource }>,
) {
  return [...matches].sort((left, right) => {
    const sourceRank = (source: MatchSource) => source === "direct" ? 0 : 1;
    const sourceDiff = sourceRank(left.source) - sourceRank(right.source);
    if (sourceDiff !== 0) {
      return sourceDiff;
    }

    return left.standardName.localeCompare(right.standardName, "ko");
  });
}

export function buildExtractedIngredient({
  matchesByName,
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
  matchesByName: IngredientMatchesByName;
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
  const matches = sortIngredientMatches(
    Array.from(matchesByName.get(name)?.entries() ?? [])
      .map(([ingredientId, match]) => ({
        ingredientId,
        standardName: match.standardName,
        source: match.source,
      })),
  );
  const resolvedMatch = matches.length === 1 ? matches[0] : null;
  const hasMatch = matches.length > 0;
  const resolutionStatus: YoutubeIngredientResolutionStatus = forceNeedsReview && hasMatch
    ? "needs_review"
    : resolvedMatch
      ? "resolved"
      : hasMatch
        ? "needs_review"
        : "unresolved";

  return {
    draft_ingredient_id: crypto.randomUUID(),
    ingredient_id: resolutionStatus === "resolved" ? resolvedMatch?.ingredientId ?? "" : "",
    standard_name: resolutionStatus === "resolved" ? resolvedMatch?.standardName ?? name : name,
    amount,
    unit,
    ingredient_type: ingredientType,
    display_text: displayText,
    sort_order: sortOrder,
    scalable,
    confidence: hasMatch ? confidence : null,
    resolution_status: resolutionStatus,
    candidates: resolutionStatus === "needs_review"
      ? matches.map((match) => ({
          ingredient_id: match.ingredientId,
          standard_name: match.standardName,
          confidence,
        }))
      : hasMatch
        ? undefined
        : [],
    raw_text: rawText,
  };
}

function buildExtractedIngredients(
  matchesByName: IngredientMatchesByName,
  parsedIngredients: ParsedDescriptionIngredient[],
  {
    saltNeedsReview = false,
  }: {
    saltNeedsReview?: boolean;
  } = {},
): YoutubeExtractedIngredient[] {
  return parsedIngredients.map((ingredient, index) =>
    buildExtractedIngredient({
      matchesByName,
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      ingredientType: ingredient.ingredientType,
      displayText: ingredient.displayText,
      sortOrder: index + 1,
      scalable: ingredient.scalable,
      confidence: ingredient.confidence,
      rawText: ingredient.rawText,
      forceNeedsReview: saltNeedsReview && ingredient.name === "소금",
    }),
  );
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

function buildExtractedSteps(
  parsedSteps: string[],
  cookingMethods: YoutubeExtractedCookingMethod[],
  fallbackCookingMethod: YoutubeExtractedCookingMethod,
  {
    includeIncompleteFallback = true,
  }: {
    includeIncompleteFallback?: boolean;
  } = {},
): YoutubeRecipeExtractData["steps"] {
  if (parsedSteps.length === 0) {
    if (!includeIncompleteFallback) {
      return [];
    }

    return [
      {
        step_number: 1,
        instruction: "",
        cooking_method: fallbackCookingMethod,
        duration_text: null,
        is_incomplete: true,
        missing_fields: ["instruction"],
        raw_text: "",
      },
    ];
  }

  return parsedSteps.map((instruction, index) => ({
    step_number: index + 1,
    instruction,
    cooking_method: cookingMethods[index] ?? fallbackCookingMethod,
    duration_text: null,
    is_incomplete: false,
    missing_fields: [],
    raw_text: instruction,
  }));
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
    await recordYoutubeProviderFailure(request, user.id, "extract", videoResult.providerError);
    return failForProviderError(videoResult.providerError);
  }

  const { video } = videoResult;
  const classification = classifyYoutubeVideo(video);
  if (classification.status === "non_recipe") {
    return fail("NOT_RECIPE_VIDEO", "이 영상은 요리 레시피가 아닌 것 같아요.", 422);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as DbClient;
  const descriptionParse = parseRecipeDescriptionForImport(video);
  const parsedRecipe = descriptionParse.recipe;
  const transcriptFallback = await resolveTranscriptFallback(video, parsedRecipe, parsedUrl);
  const finalParsedRecipe = {
    ...parsedRecipe,
    steps: transcriptFallback.steps,
  };
  const ingredientLookup = await findIngredientIds(
    dbClient,
    finalParsedRecipe.ingredients.map((ingredient) => ingredient.name),
  );
  if (ingredientLookup.error) {
    return fail("INTERNAL_ERROR", "재료 정보를 확인하지 못했어요.", 500);
  }

  const cookingMethodResult = await resolveCookingMethodsForSteps(dbClient, finalParsedRecipe.steps);
  if (cookingMethodResult.error || !cookingMethodResult.fallbackMethod) {
    return fail("INTERNAL_ERROR", "조리방법을 준비하지 못했어요.", 500);
  }

  const ingredients = buildExtractedIngredients(ingredientLookup.matchesByName, finalParsedRecipe.ingredients, {
    saltNeedsReview: parsedUrl.videoId.startsWith("needsreview"),
  });
  const steps = buildExtractedSteps(
    finalParsedRecipe.steps,
    cookingMethodResult.methods,
    cookingMethodResult.fallbackMethod,
    {
      includeIncompleteFallback: descriptionParse.includeIncompleteStepFallback,
    },
  );
  const extractionMethods = transcriptFallback.usedTranscript
    ? [...DEFAULT_EXTRACTION_METHODS, "caption"]
    : [...DEFAULT_EXTRACTION_METHODS];
  const sourceProviders = transcriptFallback.usedTranscript
    ? ["youtube_videos_list", "description_parser", "transcript_provider", "transcript_step_parser"]
    : ["youtube_videos_list", "description_parser"];
  const blockingIssues = [
    ...descriptionParse.blockingIssues,
    ...buildBlockingIssues(ingredients),
    ...steps.flatMap((step, index) =>
      (step.missing_fields ?? []).map((field) => `steps[${index}].${field}`),
    ),
  ].filter((issue, index, issues) => issues.indexOf(issue) === index);
  const draftWarnings = [
    ...(classification.status === "uncertain"
      ? ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해주세요."]
      : []),
    ...descriptionParse.draftWarnings,
  ].filter((warning, index, warnings) => warnings.indexOf(warning) === index);
  const extractionId = crypto.randomUUID();
  const data: YoutubeRecipeExtractData = {
    extraction_id: extractionId,
    title: video.title,
    base_servings: 2,
    extraction_methods: extractionMethods,
    draft_warnings: draftWarnings,
    blocking_issues: blockingIssues,
    ingredients,
    steps,
    new_cooking_methods: cookingMethodResult.newCookingMethods,
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
    source_providers: sourceProviders,
    classification_status: classification.status,
    classification_reasons: classification.reasons,
    raw_source_text: buildRawSourceText(video.description, transcriptFallback.rawTranscriptText),
    extraction_meta_json: {
      provider_version: YOUTUBE_PROVIDER_VERSION,
      source_providers: sourceProviders,
      classification_status: classification.status,
      classification_reasons: classification.reasons,
      description_parser_version: descriptionParse.parserVersion,
      description_parser_selection_outcome: descriptionParse.selectionOutcome,
      description_parser_shadow: descriptionParse.shadowResult,
      draft_warnings: draftWarnings,
      caption_capability: transcriptFallback.meta.capability,
      transcript_provider: transcriptFallback.meta,
      partial_extraction: finalParsedRecipe.ingredients.length > 0 && finalParsedRecipe.steps.length === 0,
    },
    draft_json: data as unknown as Record<string, unknown>,
    extraction_methods: extractionMethods,
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

function parseYoutubeIngredientRegistrationBody(rawBody: unknown) {
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

  const draftIngredientId = typeof rawBody.draft_ingredient_id === "string"
    ? rawBody.draft_ingredient_id.trim()
    : "";
  if (!draftIngredientId) {
    fields.push({ field: "draft_ingredient_id", reason: "required" });
  } else if (!isUuid(draftIngredientId)) {
    fields.push({ field: "draft_ingredient_id", reason: "invalid_uuid" });
  }

  const rawStandardName = typeof rawBody.standard_name === "string" ? rawBody.standard_name : "";
  const standardName = collapseWhitespace(rawStandardName);
  if (!standardName) {
    fields.push({ field: "standard_name", reason: "required" });
  } else if (standardName.length > 100) {
    fields.push({ field: "standard_name", reason: "max_length" });
  } else if (hasControlCharacters(rawStandardName)) {
    fields.push({ field: "standard_name", reason: "control_chars" });
  }

  const category = typeof rawBody.category === "string" ? rawBody.category.trim() : "";
  if (!isValidIngredientCategory(category)) {
    fields.push({ field: "category", reason: "invalid_enum" });
  }

  const defaultUnit = normalizeNullableString(rawBody.default_unit);
  if (defaultUnit !== null) {
    if (defaultUnit.length > 20) {
      fields.push({ field: "default_unit", reason: "max_length" });
    } else if (hasControlCharacters(defaultUnit)) {
      fields.push({ field: "default_unit", reason: "control_chars" });
    }
  }

  const synonym = normalizeOptionalLowercaseString(rawBody.synonym);
  if (synonym !== null) {
    if (synonym.length > 100) {
      fields.push({ field: "synonym", reason: "max_length" });
    } else if (hasControlCharacters(synonym)) {
      fields.push({ field: "synonym", reason: "control_chars" });
    }
  }

  const parsed = fields.length === 0
    ? ({
        extractionId,
        draftIngredientId,
        standardName,
        category: category as IngredientCategory,
        defaultUnit: defaultUnit === "" ? null : defaultUnit,
        synonym,
      } satisfies ParsedYoutubeIngredientRegistration)
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

function findDraftIngredientRow(draftJson: Record<string, unknown>, draftIngredientId: string) {
  const ingredients = Array.isArray(draftJson.ingredients) ? draftJson.ingredients : [];

  return ingredients.find((ingredient): ingredient is Record<string, unknown> =>
    isRecord(ingredient) && ingredient.draft_ingredient_id === draftIngredientId,
  ) ?? null;
}

function validateSessionForIngredientRegistration(
  session: YoutubeExtractionSessionRow | null,
  parsed: ParsedYoutubeIngredientRegistration,
  userId: string,
) {
  if (!session || session.user_id !== userId) {
    return fail("NOT_FOUND", "추출 세션을 찾을 수 없어요.", 404);
  }

  if (session.status === "expired" || new Date(session.expires_at).getTime() <= Date.now()) {
    return fail("SESSION_EXPIRED", "추출 세션이 만료됐어요. 다시 가져와 주세요.", 410);
  }

  if (session.status !== "draft") {
    return fail("CONFLICT", "이미 처리된 추출 세션이에요. 다시 가져와 주세요.", 409);
  }

  const draftIngredient = findDraftIngredientRow(session.draft_json, parsed.draftIngredientId);
  const resolutionStatus = draftIngredient?.resolution_status;
  if (resolutionStatus !== "unresolved" && resolutionStatus !== "needs_review") {
    return fail("CONFLICT", "등록할 재료 상태가 바뀌었어요. 다시 확인해주세요.", 409);
  }

  return null;
}

export async function handleYoutubeIngredientRegistration(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return buildFeatureDisabledResponse();
  }

  const { routeClient, user } = await requireUser();

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const rawBody = await readJson(request);
  if (!isRecord(rawBody)) {
    return fail("BAD_REQUEST", "요청 본문을 확인해주세요.", 400, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const { fields, parsed } = parseYoutubeIngredientRegistrationBody(rawBody);
  if (!parsed) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, fields);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as DbClient
    & YoutubeIngredientRegistrationRpcClient;
  const sessionResult = await findExtractionSession(dbClient, parsed.extractionId);
  if (sessionResult.error) {
    return fail("INTERNAL_ERROR", "추출 세션을 확인하지 못했어요.", 500);
  }

  const sessionFailure = validateSessionForIngredientRegistration(sessionResult.data, parsed, user.id);
  if (sessionFailure) {
    return sessionFailure;
  }

  const registrationResult = await dbClient.rpc("register_youtube_ingredient", {
    p_standard_name: parsed.standardName,
    p_category: parsed.category,
    p_default_unit: parsed.defaultUnit,
    p_synonym: parsed.synonym,
  });

  if (registrationResult.error || !registrationResult.data) {
    return fail("INTERNAL_ERROR", "재료를 등록하지 못했어요.", 500);
  }

  const data: YoutubeIngredientRegistrationData = {
    ingredient: {
      ingredient_id: registrationResult.data.ingredient_id,
      standard_name: registrationResult.data.standard_name,
      category: registrationResult.data.category,
      default_unit: registrationResult.data.default_unit,
      resolution_status: "resolved",
    },
    synonym_status: registrationResult.data.synonym_status,
    warnings: registrationResult.data.warnings ?? [],
  };

  return ok(data);
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
    await recordYoutubeProviderFailure(request, user.id, "register", {
      code: "YOUTUBE_REGISTER_FAILED",
      status: 500,
    });
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
