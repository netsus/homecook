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
import { extractHashTagsFromText, generateRecipeTags } from "@/lib/server/recipe-media";
import { recordOperationalEventFromServiceRole } from "@/lib/server/admin-events";
import {
  buildTextSegments,
  joinSegmentText,
  summarizeSourceSegments,
  type YoutubePublicTextSource,
  type YoutubeSourceSegment,
} from "@/lib/server/youtube-caption-normalizer";
import {
  extractYoutubeMultiRecipeCandidates,
  type YoutubeRawRecipeCandidate,
} from "@/lib/server/youtube-multi-recipe-extractor";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON } from "@/lib/youtube-import-constants";
import type {
  IngredientCategory,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
  YoutubeCandidateDraftBody,
  YoutubeCandidateDraftData,
  YoutubeExtractedCookingMethod,
  YoutubeExtractedIngredient,
  YoutubeIngredientRegistrationData,
  YoutubeIngredientRegistrationSynonymStatus,
  YoutubeIngredientResolutionStatus,
  YoutubeRecipeCandidate,
  YoutubeRecipeClassificationStatus,
  YoutubeRecipeExtractData,
  YoutubeRecipeRegisterData,
  YoutubeRecipeRegisterIngredientInput,
  YoutubeRecipeRegisterStepInput,
  YoutubeSourceSegmentsSummary,
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
  session_kind?: "single" | "multi_parent" | "candidate_child";
  parent_extraction_session_id?: string | null;
  parent_candidate_id?: string | null;
}

interface YoutubeExtractionSessionRow {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_video_id: string;
  video_title?: string | null;
  channel_title?: string | null;
  thumbnail_url?: string | null;
  provider_version: string | null;
  source_providers?: string[];
  classification_status?: YoutubeRecipeClassificationStatus;
  classification_reasons?: string[];
  extraction_methods: string[];
  raw_source_text: string | null;
  extraction_meta_json: Record<string, unknown>;
  draft_json: Record<string, unknown>;
  status: "draft" | "consumed" | "expired";
  expires_at: string;
  session_kind?: "single" | "multi_parent" | "candidate_child";
  parent_extraction_session_id?: string | null;
  parent_candidate_id?: string | null;
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

interface YoutubeExtractionCandidateInsert {
  id: string;
  extraction_session_id: string;
  candidate_id: string;
  status: "draft" | "promoted" | "registered" | "skipped" | "expired";
  child_extraction_session_id: string | null;
  recipe_id: string | null;
  title: string;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number | null;
  draft_ingredient_ids_json: string[];
  source_meta_json: Record<string, unknown>;
}

interface YoutubeExtractionCandidateRow extends YoutubeExtractionCandidateInsert {
  promoted_at?: string | null;
  registered_at?: string | null;
}

interface YoutubeExtractionCandidateSelectQuery {
  eq(column: string, value: string): YoutubeExtractionCandidateSelectQuery;
  maybeSingle(): MaybeSingleResult<YoutubeExtractionCandidateRow>;
}

interface YoutubeExtractionCandidateUpdateQuery {
  eq(column: string, value: string): YoutubeExtractionCandidateUpdateQuery;
  then: PromiseLike<{
    data: null;
    error: QueryError | null;
  }>["then"];
}

interface YoutubeExtractionCandidatesTable {
  insert(values: YoutubeExtractionCandidateInsert[]): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
  select(columns: string): YoutubeExtractionCandidateSelectQuery;
  update(values: Partial<YoutubeExtractionCandidateRow>): YoutubeExtractionCandidateUpdateQuery;
}

interface YoutubeTranscriptCacheRow {
  id: string;
  youtube_video_id: string;
  language: string;
  source_provider: string;
  source_kind: string;
  transcript_text: string | null;
  segments_json: unknown;
  expires_at: string;
}

interface YoutubeTranscriptCacheSelectQuery {
  eq(column: string, value: string): YoutubeTranscriptCacheSelectQuery;
  gt(column: string, value: string): YoutubeTranscriptCacheSelectQuery;
  order(column: string, options?: { ascending?: boolean }): YoutubeTranscriptCacheSelectQuery;
  limit(count: number): YoutubeTranscriptCacheSelectQuery;
  then: ArrayQueryResult<YoutubeTranscriptCacheRow>["then"];
}

interface YoutubeTranscriptCacheUpdateQuery {
  eq(column: string, value: string): YoutubeTranscriptCacheUpdateQuery;
  then: ArrayQueryResult<null>["then"];
}

interface YoutubeTranscriptCacheTable {
  select(columns: string): YoutubeTranscriptCacheSelectQuery;
  insert(values: {
    youtube_video_id: string;
    language: string;
    source_provider: string;
    source_kind: string;
    transcript_text: string;
    segments_json: unknown;
    expires_at: string;
    last_used_at: string;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
  update(values: { last_used_at: string }): YoutubeTranscriptCacheUpdateQuery;
}

interface YoutubeTranscriptFetchEventRow {
  user_id: string | null;
  provider: string;
  status: string;
  created_at: string;
}

interface YoutubeTranscriptFetchEventSelectQuery {
  eq(column: string, value: string): YoutubeTranscriptFetchEventSelectQuery;
  gte(column: string, value: string): YoutubeTranscriptFetchEventSelectQuery;
  then: ArrayQueryResult<YoutubeTranscriptFetchEventRow>["then"];
}

interface YoutubeTranscriptFetchEventsTable {
  select(columns: string): YoutubeTranscriptFetchEventSelectQuery;
  insert(values: {
    user_id: string | null;
    youtube_video_id: string;
    provider: string;
    cache_hit: boolean;
    status: "success" | "unavailable" | "error" | "skipped";
    reason: string | null;
    estimated_cost_microusd: number;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
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
    | "CANDIDATE_PROMOTION_REQUIRED"
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
      p_ingredients: YoutubeRecipeRegisterIngredientInput[];
      p_steps: YoutubeRecipeRegisterStepInput[];
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
  ingredients: YoutubeRecipeRegisterIngredientInput[];
  steps: YoutubeRecipeRegisterStepInput[];
}

interface ParsedYoutubeIngredientRegistration {
  extractionId: string;
  draftIngredientId: string;
  standardName: string;
  category: IngredientCategory;
  defaultUnit: string | null;
  synonym: string | null;
}

interface ParsedYoutubeCandidateDraft {
  extractionId: string;
  candidateId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const DEFAULT_EXTRACTION_METHODS = ["description"] as const;
const COMMENT_EXTRACTION_METHOD = "comment";
const CAPTION_EXTRACTION_METHOD = "caption";
const YOUTUBE_PROVIDER_VERSION = "youtube-videos-list-public-text-v2";
const SESSION_TTL_HOURS = 24;
const AUTHOR_COMMENT_RAW_SOURCE_HEADER = "--- author comment ---";
const CAPTION_TRANSCRIPT_RAW_SOURCE_HEADER = "--- caption transcript ---";
const MULTI_CANDIDATE_REVIEW_REQUIRED = "MULTI_CANDIDATE_REVIEW_REQUIRED";
const AUTHOR_COMMENT_MAX_RESULTS = 100;
const AUTHOR_COMMENT_ORDER = "relevance";
const AUTHOR_COMMENT_QUOTA_UNITS_ESTIMATE = 1;
const TRANSCRIPT_CACHE_TTL_DAYS = 90;
const TRANSCRIPT_CACHE_PROVIDER = "transcript_cache";
const YOUTUBE_PUBLIC_TIMEDTEXT_PROVIDER = "youtube_public_timedtext";
const YOUTUBE_TIMEDTEXT_COOKIE_PROVIDER = "youtube_timedtext_cookie_retry";
const EXTERNAL_TRANSCRIPT_PROVIDER = "external_transcript_api";
const TRANSCRIPT_PARSE_PROVIDER = "caption_parser";
const PREFERRED_TRANSCRIPT_LANGUAGES = ["ko", "en"] as const;
const YOUTUBE_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const OEMBED_PREVIEW_CLASSIFICATION_REASONS = [YOUTUBE_PREVIEW_ONLY_CLASSIFICATION_REASON];
const AMBIGUOUS_DIRECT_MATCH_NAMES = new Set(["파"]);
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
  componentLabel: string | null;
  scalable: boolean;
  confidence: number;
}

interface ParsedRecipeDescription {
  ingredients: ParsedDescriptionIngredient[];
  steps: string[];
  stepComponentLabels: Array<string | null>;
}

interface ParsedRecipeDescriptionForImport {
  recipe: ParsedRecipeDescription;
  parserVersion: YoutubeDescriptionParserVersion;
  selectionOutcome: string;
  draftWarnings: string[];
  blockingIssues: string[];
  includeIncompleteStepFallback: boolean;
  stepDurationTexts?: Array<string | null>;
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
  channelId: string | null;
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
  transcriptSegments?: YoutubeSourceSegment[];
  language?: string | null;
  trackKind?: "manual" | "auto" | "unknown" | null;
  reason?: string | null;
}

export interface YoutubeTranscriptProvider {
  name: string;
  fetchTranscript(context: YoutubeTranscriptProviderContext): Promise<YoutubeTranscriptProviderResult>;
}

export type YoutubeAuthorCommentProviderStatus =
  | "available"
  | "unavailable"
  | "disabled"
  | "comments_disabled"
  | "error";

export interface YoutubeAuthorCommentProviderContext {
  videoId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  channelId: string | null;
}

export interface YoutubeAuthorComment {
  text: string;
  authorChannelId: string | null;
  likeCount?: number | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface YoutubeAuthorCommentProviderResult {
  status: YoutubeAuthorCommentProviderStatus;
  providerName?: string;
  comments?: YoutubeAuthorComment[];
  reason?: string | null;
}

export interface YoutubeAuthorCommentProvider {
  name: string;
  fetchAuthorComments(
    context: YoutubeAuthorCommentProviderContext,
  ): Promise<YoutubeAuthorCommentProviderResult>;
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
  used_ingredient_count: number;
  step_count: number;
  cache_hit: boolean;
  source_provider: string | null;
}

interface TranscriptFallbackResult {
  recipe: ParsedRecipeDescription;
  usedTranscript: boolean;
  rawTranscriptText: string | null;
  rawTranscriptSegments: YoutubeSourceSegment[];
  meta: TranscriptFallbackMeta;
}

interface AuthorCommentFallbackMeta {
  attempted: boolean;
  provider: string | null;
  status:
    | "not_needed"
    | "no_author_channel"
    | "disabled"
    | "unavailable"
    | "comments_disabled"
    | "error"
    | "no_author_comments"
    | "no_recipe_signal"
    | "no_parseable_recipe"
    | "used";
  reason: string | null;
  used: boolean;
  fetched_comment_count: number;
  author_comment_count: number;
  recipe_signal_comment_count: number;
  used_ingredient_count: number;
  used_step_count: number;
  request: {
    order: typeof AUTHOR_COMMENT_ORDER;
    max_results: typeof AUTHOR_COMMENT_MAX_RESULTS;
    page_count: 1;
    quota_units_estimate: typeof AUTHOR_COMMENT_QUOTA_UNITS_ESTIMATE;
  };
}

interface AuthorCommentFallbackResult {
  recipe: ParsedRecipeDescription;
  usedAuthorComment: boolean;
  rawAuthorCommentText: string | null;
  meta: AuthorCommentFallbackMeta;
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

const PUBLIC_TIMEDTEXT_TRANSCRIPT_PROVIDER: YoutubeTranscriptProvider = {
  name: YOUTUBE_PUBLIC_TIMEDTEXT_PROVIDER,
  async fetchTranscript(context) {
    return fetchPublicYoutubeTranscript(context);
  },
};

const NOOP_AUTHOR_COMMENT_PROVIDER: YoutubeAuthorCommentProvider = {
  name: "noop",
  async fetchAuthorComments() {
    return {
      status: "disabled",
      providerName: "noop",
      reason: "no_provider_configured",
      comments: [],
    };
  },
};

const YOUTUBE_COMMENT_THREADS_PROVIDER: YoutubeAuthorCommentProvider = {
  name: "youtube_comment_threads",
  async fetchAuthorComments(context) {
    return fetchYoutubeAuthorComments(context.videoId);
  },
};

let transcriptProviderForTest: YoutubeTranscriptProvider | null = null;
let authorCommentProviderForTest: YoutubeAuthorCommentProvider | null = null;

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

function getYoutubeTranscriptProvider(dbClient: DbClient | null, userId: string) {
  if (transcriptProviderForTest) {
    return transcriptProviderForTest;
  }

  if (shouldUseYoutubeFixtureProvider()) {
    return NOOP_TRANSCRIPT_PROVIDER;
  }

  return createDefaultYoutubeTranscriptProvider(dbClient, userId);
}

export function setYoutubeAuthorCommentProviderForTest(provider: YoutubeAuthorCommentProvider | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeAuthorCommentProviderForTest is only available in tests");
  }

  const previousProvider = authorCommentProviderForTest;
  authorCommentProviderForTest = provider;

  return () => {
    authorCommentProviderForTest = previousProvider;
  };
}

function getYoutubeAuthorCommentProvider() {
  if (authorCommentProviderForTest) {
    return authorCommentProviderForTest;
  }

  if (shouldUseYoutubeFixtureProvider()) {
    return NOOP_AUTHOR_COMMENT_PROVIDER;
  }

  return YOUTUBE_COMMENT_THREADS_PROVIDER;
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

function stripMatchingComponentPrefix(value: string | null, componentLabel: string | null) {
  if (!value || !componentLabel) {
    return value;
  }

  const prefix = `[${componentLabel}]`;
  return value.startsWith(prefix) ? value.slice(prefix.length).trimStart() : value;
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

function getFixtureChannelId(videoId: string) {
  return `channel-${videoId}`;
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
        channelId: getFixtureChannelId(videoId),
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
        channelId: getFixtureChannelId(videoId),
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
        channelId: getFixtureChannelId(videoId),
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
        channelId: getFixtureChannelId(videoId),
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
        channelId: getFixtureChannelId(videoId),
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
        channelId: getFixtureChannelId(videoId),
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
      channelId: getFixtureChannelId(videoId),
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
  if (process.env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER === "0") {
    return false;
  }

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

function getYoutubeErrorReasons(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.errors)) {
    return [];
  }

  return payload.error.errors
    .map((error) => isRecord(error) && typeof error.reason === "string" ? error.reason : null)
    .filter((reason): reason is string => reason !== null);
}

function isCommentsDisabledPayload(payload: unknown) {
  return getYoutubeErrorReasons(payload).includes("commentsDisabled");
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
      channelId: typeof snippet.channelId === "string" ? snippet.channelId : null,
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

function parseYoutubeCommentThreadsPayload(payload: unknown): YoutubeAuthorCommentProviderResult {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return {
      status: "error",
      providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
      reason: "invalid_comment_threads_payload",
      comments: [],
    };
  }

  return {
    status: "available",
    providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
    comments: payload.items.flatMap((item): YoutubeAuthorComment[] => {
      if (!isRecord(item) || !isRecord(item.snippet)) {
        return [];
      }

      const topLevelComment = item.snippet.topLevelComment;
      if (!isRecord(topLevelComment) || !isRecord(topLevelComment.snippet)) {
        return [];
      }

      const snippet = topLevelComment.snippet;
      const text = typeof snippet.textOriginal === "string"
        ? snippet.textOriginal
        : typeof snippet.textDisplay === "string"
          ? snippet.textDisplay
          : "";
      const authorChannel = isRecord(snippet.authorChannelId) ? snippet.authorChannelId : null;

      return [{
        text,
        authorChannelId: typeof authorChannel?.value === "string" ? authorChannel.value : null,
        likeCount: typeof snippet.likeCount === "number" ? snippet.likeCount : null,
        publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
        updatedAt: typeof snippet.updatedAt === "string" ? snippet.updatedAt : null,
      }];
    }),
  };
}

async function fetchYoutubeAuthorComments(videoId: string): Promise<YoutubeAuthorCommentProviderResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return {
      status: "disabled",
      providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
      reason: "missing_youtube_api_key",
      comments: [],
    };
  }

  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    textFormat: "plainText",
    order: AUTHOR_COMMENT_ORDER,
    maxResults: String(AUTHOR_COMMENT_MAX_RESULTS),
    key: apiKey,
  });

  let response: Response;

  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params.toString()}`);
  } catch {
    return {
      status: "error",
      providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
      reason: "comment_threads_network_error",
      comments: [],
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (isCommentsDisabledPayload(payload)) {
      return {
        status: "comments_disabled",
        providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
        reason: "comments_disabled",
        comments: [],
      };
    }

    return {
      status: isQuotaErrorPayload(payload) ? "unavailable" : "error",
      providerName: YOUTUBE_COMMENT_THREADS_PROVIDER.name,
      reason: isQuotaErrorPayload(payload) ? "quota_exceeded" : "comment_threads_provider_error",
      comments: [],
    };
  }

  return parseYoutubeCommentThreadsPayload(payload);
}

interface PublicCaptionTrack {
  baseUrl: string;
  languageCode: string | null;
  name: string | null;
  trackKind: "manual" | "auto" | "unknown";
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: "\"",
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };

  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
      const lowerEntity = entity.toLowerCase();
      if (lowerEntity.startsWith("#x")) {
        const codePoint = Number.parseInt(lowerEntity.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }

      if (lowerEntity.startsWith("#")) {
        const codePoint = Number.parseInt(lowerEntity.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }

      return named[lowerEntity] ?? match;
    })
    .replace(/\s+/gu, " ")
    .trim();
}

function extractJsonObjectAfterMarker(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const objectStart = source.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

function normalizeCaptionTrackName(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const simpleText = value.simpleText;
  if (typeof simpleText === "string") {
    return simpleText;
  }

  const runs = value.runs;
  if (!Array.isArray(runs)) {
    return null;
  }

  const text = runs
    .map((run) => isRecord(run) && typeof run.text === "string" ? run.text : "")
    .join("")
    .trim();

  return text || null;
}

function parsePublicCaptionTracksFromWatchHtml(html: string): PublicCaptionTrack[] {
  const jsonText = extractJsonObjectAfterMarker(html, "ytInitialPlayerResponse");
  if (!jsonText) {
    return [];
  }

  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return [];
  }

  if (!isRecord(payload) || !isRecord(payload.captions)) {
    return [];
  }

  const renderer = payload.captions.playerCaptionsTracklistRenderer;
  if (!isRecord(renderer) || !Array.isArray(renderer.captionTracks)) {
    return [];
  }

  return renderer.captionTracks.flatMap((track): PublicCaptionTrack[] => {
    if (!isRecord(track) || typeof track.baseUrl !== "string") {
      return [];
    }

    const kind = typeof track.kind === "string" ? track.kind : null;

    return [{
      baseUrl: track.baseUrl,
      languageCode: typeof track.languageCode === "string" ? track.languageCode : null,
      name: normalizeCaptionTrackName(track.name),
      trackKind: kind === "asr" ? "auto" : kind ? "unknown" : "manual",
    }];
  });
}

function selectPublicCaptionTrack(
  tracks: PublicCaptionTrack[],
  preferredLanguages = ["ko", "en"],
) {
  if (tracks.length === 0) {
    return null;
  }

  const normalizedPreferredLanguages = preferredLanguages.map((language) => language.toLowerCase());
  const languageRank = (track: PublicCaptionTrack) => {
    const languageCode = track.languageCode?.toLowerCase() ?? "";
    const exactRank = normalizedPreferredLanguages.indexOf(languageCode);
    if (exactRank >= 0) {
      return exactRank;
    }

    const prefixRank = normalizedPreferredLanguages.findIndex((language) =>
      languageCode.startsWith(`${language}-`) || languageCode.startsWith(language),
    );

    return prefixRank >= 0 ? prefixRank + 10 : 100;
  };
  const kindRank = (track: PublicCaptionTrack) => track.trackKind === "manual"
    ? 0
    : track.trackKind === "auto"
      ? 1
      : 2;

  return [...tracks].sort((left, right) => {
    const languageDiff = languageRank(left) - languageRank(right);
    if (languageDiff !== 0) {
      return languageDiff;
    }

    return kindRank(left) - kindRank(right);
  })[0] ?? null;
}

function withTimedTextJsonFormat(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("fmt", "json3");
    return url.toString();
  } catch {
    return baseUrl.includes("fmt=")
      ? baseUrl
      : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  }
}

function buildYoutubePageFetchHeaders(cookieHeader: string | null = null) {
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko,en;q=0.8",
    "user-agent": YOUTUBE_BROWSER_USER_AGENT,
  };

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

function buildYoutubeTimedTextFetchHeaders(referer: string, cookieHeader: string | null = null) {
  const headers: Record<string, string> = {
    accept: "application/json,text/xml,application/xml,text/plain,*/*;q=0.8",
    "accept-language": "ko,en;q=0.8",
    referer,
    "user-agent": YOUTUBE_BROWSER_USER_AGENT,
  };

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

function parseTimedTextJson3Segments(
  value: unknown,
  {
    language,
    trackKind,
  }: {
    language: string | null;
    trackKind: string | null;
  },
): YoutubeSourceSegment[] {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    return [];
  }

  const segments: YoutubeSourceSegment[] = [];

  value.events.forEach((event, lineIndex) => {
    if (!isRecord(event) || !Array.isArray(event.segs)) {
      return;
    }

    const text = event.segs
      .map((segment) => isRecord(segment) && typeof segment.utf8 === "string" ? segment.utf8 : "")
      .join("")
      .replace(/\s+/gu, " ")
      .trim();

    if (!text) {
      return;
    }

    segments.push({
      source: "caption",
      lineIndex,
      text,
      startMs: typeof event.tStartMs === "number" ? event.tStartMs : null,
      durationMs: typeof event.dDurationMs === "number" ? event.dDurationMs : null,
      language,
      trackKind,
    });
  });

  return segments;
}

function parseTimedTextXml(xml: string) {
  return [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/giu)]
    .map((match) => decodeHtmlEntities(match[1].replace(/<[^>]+>/gu, "")))
    .filter(Boolean)
    .join("\n");
}

function parseTimedTextTranscript(
  text: string,
  {
    language,
    trackKind,
  }: {
    language: string | null;
    trackKind: string | null;
  },
) {
  try {
    const parsed = JSON.parse(text);
    const segments = parseTimedTextJson3Segments(parsed, { language, trackKind });
    const transcript = joinSegmentText(segments);
    if (transcript) {
      return { transcript, segments };
    }
  } catch {
    // Fall through to XML parsing.
  }

  const transcript = parseTimedTextXml(text);

  return {
    transcript,
    segments: transcript
      ? buildTextSegments({ text: transcript, source: "caption", language, trackKind })
      : [],
  };
}

async function fetchTextWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicYoutubeTranscript(
  context: YoutubeTranscriptProviderContext,
  {
    providerName = PUBLIC_TIMEDTEXT_TRANSCRIPT_PROVIDER.name,
    cookieHeader = null,
  }: {
    providerName?: string;
    cookieHeader?: string | null;
  } = {},
): Promise<YoutubeTranscriptProviderResult> {
  let watchResponse: Response;

  try {
    watchResponse = await fetchTextWithTimeout(
      `https://www.youtube.com/watch?v=${encodeURIComponent(context.videoId)}&hl=ko`,
      {
        headers: buildYoutubePageFetchHeaders(cookieHeader),
      },
      10_000,
    );
  } catch {
    return {
      status: "error",
      providerName,
      reason: "watch_page_network_error",
    };
  }

  if (!watchResponse.ok) {
    return {
      status: watchResponse.status === 404 ? "unavailable" : "error",
      providerName,
      reason: watchResponse.status === 404
        ? "watch_page_not_found"
        : watchResponse.status === 403 || watchResponse.status === 429
          ? "watch_page_rate_limited_or_blocked"
          : "watch_page_provider_error",
    };
  }

  const watchHtml = await watchResponse.text();
  const selectedTrack = selectPublicCaptionTrack(parsePublicCaptionTracksFromWatchHtml(watchHtml));

  if (!selectedTrack) {
    return {
      status: "unavailable",
      providerName,
      reason: context.captionCapability === "unavailable"
        ? "no_public_caption_tracks_with_caption_flag_unavailable"
        : "no_public_caption_tracks",
    };
  }

  let transcriptResponse: Response;

  try {
    transcriptResponse = await fetchTextWithTimeout(
      withTimedTextJsonFormat(selectedTrack.baseUrl),
      {
        headers: buildYoutubeTimedTextFetchHeaders(context.youtubeUrl, cookieHeader),
      },
      10_000,
    );
  } catch {
    return {
      status: "error",
      providerName,
      language: selectedTrack.languageCode,
      trackKind: selectedTrack.trackKind,
      reason: "timedtext_network_error",
    };
  }

  if (!transcriptResponse.ok) {
    return {
      status: "error",
      providerName,
      language: selectedTrack.languageCode,
      trackKind: selectedTrack.trackKind,
      reason: transcriptResponse.status === 403 || transcriptResponse.status === 429
        ? "timedtext_rate_limited_or_blocked"
        : "timedtext_provider_error",
    };
  }

  const parsedTranscript = parseTimedTextTranscript(await transcriptResponse.text(), {
    language: selectedTrack.languageCode,
    trackKind: selectedTrack.trackKind,
  });
  const transcriptText = parsedTranscript.transcript;

  return {
    status: transcriptText ? "available" : "unavailable",
    providerName,
    transcriptText,
    transcriptSegments: parsedTranscript.segments,
    language: selectedTrack.languageCode,
    trackKind: selectedTrack.trackKind,
    reason: transcriptText ? null : "empty_timedtext",
  };
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
      componentLabel: null,
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
      componentLabel: null,
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
    componentLabel: null,
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
    stepComponentLabels: steps.map(() => null),
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
    componentLabel: ingredient.componentLabel,
    scalable: ingredient.scalable,
    confidence: ingredient.confidence,
  };
}

function adaptFlatDraftRecipe(draft: FlatDraftAdaptation): ParsedRecipeDescription {
  return {
    ingredients: draft.ingredients.map(adaptFlatDraftIngredient),
    steps: draft.steps,
    stepComponentLabels: draft.stepComponentLabels,
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

function buildAuthorCommentFallbackMeta({
  attempted,
  provider,
  status,
  reason = null,
  used = false,
  fetchedCommentCount = 0,
  authorCommentCount = 0,
  recipeSignalCommentCount = 0,
  usedIngredientCount = 0,
  usedStepCount = 0,
}: {
  attempted: boolean;
  provider: string | null;
  status: AuthorCommentFallbackMeta["status"];
  reason?: string | null;
  used?: boolean;
  fetchedCommentCount?: number;
  authorCommentCount?: number;
  recipeSignalCommentCount?: number;
  usedIngredientCount?: number;
  usedStepCount?: number;
}): AuthorCommentFallbackMeta {
  return {
    attempted,
    provider,
    status,
    reason,
    used,
    fetched_comment_count: fetchedCommentCount,
    author_comment_count: authorCommentCount,
    recipe_signal_comment_count: recipeSignalCommentCount,
    used_ingredient_count: usedIngredientCount,
    used_step_count: usedStepCount,
    request: {
      order: AUTHOR_COMMENT_ORDER,
      max_results: AUTHOR_COMMENT_MAX_RESULTS,
      page_count: 1,
      quota_units_estimate: AUTHOR_COMMENT_QUOTA_UNITS_ESTIMATE,
    },
  };
}

function shouldAttemptAuthorCommentFallback(
  parsedRecipe: ParsedRecipeDescription,
  blockingIssues: string[],
) {
  return (
    parsedRecipe.ingredients.length === 0
    || parsedRecipe.steps.length === 0
    || blockingIssues.some((issue) => issue.includes("steps") || issue.includes("missing_steps"))
  );
}

function normalizeAuthorCommentText(text: string) {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

function isPromotionHeavyComment(text: string) {
  const normalized = text.toLowerCase();
  const promoHits = [
    "구독",
    "좋아요",
    "알림설정",
    "구매 링크",
    "제품 정보",
    "instagram",
    "인스타",
    "블로그",
    "협찬",
    "광고",
    "bgm",
  ].filter((keyword) => normalized.includes(keyword)).length;
  const recipeHits = [
    "재료",
    "만드는",
    "조리",
    "레시피",
    "ingredients",
    "steps",
  ].filter((keyword) => normalized.includes(keyword)).length;

  return promoHits >= 2 && recipeHits === 0;
}

function scoreAuthorCommentRecipeSignal(text: string) {
  const normalized = normalizeAuthorCommentText(text);
  if (normalized.length < 12 || isPromotionHeavyComment(normalized)) {
    return 0;
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const headingScore = [
    /(재료|준비물|ingredients?)/iu,
    /(만드는\s*(법|방법)|조리\s*(법|방법|순서)|순서|레시피|steps?|directions?|method)/iu,
  ].filter((pattern) => pattern.test(normalized)).length;
  const amountScore = lines.filter((line) =>
    /(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s*(?:g|kg|ml|l|L|t|T|스푼|큰술|작은술|컵|개|장|대|쪽|줌|꼬집|숟가락)?/u.test(line),
  ).length;
  const numberedStepScore = lines.filter((line) =>
    /^\s*(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|[-•])\s*/u.test(line) && hasCookingAction(line),
  ).length;
  const cookingActionScore = lines.filter(hasCookingAction).length;

  return headingScore * 3
    + Math.min(amountScore, 4) * 2
    + Math.min(numberedStepScore, 4) * 2
    + Math.min(cookingActionScore, 4);
}

function parseAuthorCommentRecipe(
  video: YoutubeProviderVideo,
  text: string,
): ParsedRecipeDescriptionForImport {
  return parseRecipeDescriptionForImport({
    ...video,
    description: text,
  });
}

function mergeAuthorCommentRecipe(
  descriptionRecipe: ParsedRecipeDescription,
  authorRecipe: ParsedRecipeDescription,
) {
  const useAuthorIngredients = descriptionRecipe.ingredients.length === 0
    && authorRecipe.ingredients.length > 0;
  const useAuthorSteps = descriptionRecipe.steps.length === 0 && authorRecipe.steps.length > 0;

  return {
    recipe: {
      ...descriptionRecipe,
      ingredients: useAuthorIngredients ? authorRecipe.ingredients : descriptionRecipe.ingredients,
      steps: useAuthorSteps ? authorRecipe.steps : descriptionRecipe.steps,
      stepComponentLabels: useAuthorSteps
        ? authorRecipe.stepComponentLabels
        : descriptionRecipe.stepComponentLabels,
    },
    usedIngredientCount: useAuthorIngredients ? authorRecipe.ingredients.length : 0,
    usedStepCount: useAuthorSteps ? authorRecipe.steps.length : 0,
  };
}

async function resolveAuthorCommentFallback(
  video: YoutubeProviderVideo,
  parsedRecipe: ParsedRecipeDescription,
  descriptionParse: ParsedRecipeDescriptionForImport,
  parsedUrl: { youtubeUrl: string; videoId: string },
): Promise<AuthorCommentFallbackResult> {
  if (!shouldAttemptAuthorCommentFallback(parsedRecipe, descriptionParse.blockingIssues)) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: false,
        provider: null,
        status: "not_needed",
      }),
    };
  }

  if (!video.channelId) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: false,
        provider: null,
        status: "no_author_channel",
        reason: "missing_video_channel_id",
      }),
    };
  }

  const provider = getYoutubeAuthorCommentProvider();
  let providerResult: YoutubeAuthorCommentProviderResult;

  try {
    providerResult = await provider.fetchAuthorComments({
      videoId: parsedUrl.videoId,
      youtubeUrl: parsedUrl.youtubeUrl,
      title: video.title,
      channel: video.channel,
      channelId: video.channelId,
    });
  } catch (error) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: true,
        provider: provider.name,
        status: "error",
        reason: error instanceof Error ? error.message : "provider_error",
      }),
    };
  }

  const providerName = providerResult.providerName ?? provider.name;
  const comments = providerResult.comments ?? [];
  const fetchedCommentCount = comments.length;

  if (providerResult.status !== "available") {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: true,
        provider: providerName,
        status: providerResult.status,
        reason: providerResult.reason ?? null,
        fetchedCommentCount,
      }),
    };
  }

  const authorComments = comments
    .filter((comment) => comment.authorChannelId === video.channelId)
    .map((comment) => ({
      ...comment,
      text: normalizeAuthorCommentText(comment.text),
      signalScore: scoreAuthorCommentRecipeSignal(comment.text),
    }))
    .filter((comment) => comment.text.length > 0);

  if (authorComments.length === 0) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: true,
        provider: providerName,
        status: "no_author_comments",
        fetchedCommentCount,
      }),
    };
  }

  const signalCandidates = authorComments
    .filter((comment) => comment.signalScore >= 3)
    .sort((left, right) => right.signalScore - left.signalScore);

  if (signalCandidates.length === 0) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: true,
        provider: providerName,
        status: "no_recipe_signal",
        fetchedCommentCount,
        authorCommentCount: authorComments.length,
      }),
    };
  }

  const parsedCandidates = signalCandidates
    .map((comment) => {
      const parsed = parseAuthorCommentRecipe(video, comment.text);
      const merged = mergeAuthorCommentRecipe(parsedRecipe, parsed.recipe);
      const contributionScore = merged.usedIngredientCount * 3 + merged.usedStepCount * 4;

      return {
        comment,
        parsed,
        merged,
        score: comment.signalScore + contributionScore,
      };
    })
    .filter((candidate) =>
      candidate.merged.usedIngredientCount > 0 || candidate.merged.usedStepCount > 0,
    )
    .sort((left, right) => right.score - left.score);

  const selected = parsedCandidates[0];
  if (!selected) {
    return {
      recipe: parsedRecipe,
      usedAuthorComment: false,
      rawAuthorCommentText: null,
      meta: buildAuthorCommentFallbackMeta({
        attempted: true,
        provider: providerName,
        status: "no_parseable_recipe",
        fetchedCommentCount,
        authorCommentCount: authorComments.length,
        recipeSignalCommentCount: signalCandidates.length,
      }),
    };
  }

  return {
    recipe: selected.merged.recipe,
    usedAuthorComment: true,
    rawAuthorCommentText: selected.comment.text,
    meta: buildAuthorCommentFallbackMeta({
      attempted: true,
      provider: providerName,
      status: "used",
      used: true,
      fetchedCommentCount,
      authorCommentCount: authorComments.length,
      recipeSignalCommentCount: signalCandidates.length,
      usedIngredientCount: selected.merged.usedIngredientCount,
      usedStepCount: selected.merged.usedStepCount,
    }),
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
  return parsedRecipe.ingredients.length === 0 || parsedRecipe.steps.length === 0;
}

function buildTranscriptFallbackMeta({
  attempted,
  capability,
  provider,
  status,
  reason = null,
  language = null,
  trackKind = null,
  usedIngredientCount = 0,
  stepCount = 0,
  cacheHit = false,
  sourceProvider = null,
}: {
  attempted: boolean;
  capability: TranscriptFallbackMeta["capability"];
  provider: string | null;
  status: TranscriptFallbackMeta["status"];
  reason?: string | null;
  language?: string | null;
  trackKind?: string | null;
  usedIngredientCount?: number;
  stepCount?: number;
  cacheHit?: boolean;
  sourceProvider?: string | null;
}): TranscriptFallbackMeta {
  return {
    attempted,
    capability,
    provider,
    status,
    reason,
    language,
    track_kind: trackKind,
    used_ingredient_count: usedIngredientCount,
    step_count: stepCount,
    cache_hit: cacheHit,
    source_provider: sourceProvider,
  };
}

function parseTranscriptRecipe(
  video: YoutubeProviderVideo,
  transcriptText: string,
) {
  const normalized = transcriptText.trim();

  if (!normalized) {
    return {
      ingredients: [],
      steps: [],
      stepComponentLabels: [],
    } satisfies ParsedRecipeDescription;
  }

  return parseRecipeDescriptionForImport({
    ...video,
    description: normalized,
  }).recipe;
}

function buildRawSourceText(
  description: string,
  authorCommentText: string | null,
  transcriptText: string | null,
) {
  const normalizedAuthorComment = authorCommentText?.trim();
  const normalizedTranscript = transcriptText?.trim();
  const parts = [description];

  if (normalizedAuthorComment) {
    parts.push(AUTHOR_COMMENT_RAW_SOURCE_HEADER, normalizedAuthorComment);
  }

  if (normalizedTranscript) {
    parts.push(CAPTION_TRANSCRIPT_RAW_SOURCE_HEADER, normalizedTranscript);
  }

  return parts.join("\n\n");
}

function buildTranscriptCacheExpiresAt() {
  return new Date(Date.now() + TRANSCRIPT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeTranscriptLanguage(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || PREFERRED_TRANSCRIPT_LANGUAGES[0];
}

function isYoutubePublicTextSource(value: unknown): value is YoutubePublicTextSource {
  return value === "description" || value === "comment" || value === "caption" || value === "transcript";
}

function isYoutubeSourceSegment(value: unknown): value is YoutubeSourceSegment {
  return isRecord(value)
    && isYoutubePublicTextSource(value.source)
    && typeof value.lineIndex === "number"
    && typeof value.text === "string"
    && (typeof value.startMs === "number" || value.startMs === null)
    && (typeof value.durationMs === "number" || value.durationMs === null)
    && (typeof value.language === "string" || value.language === null)
    && (typeof value.trackKind === "string" || value.trackKind === null);
}

function normalizeTranscriptSegments(value: unknown): YoutubeSourceSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isYoutubeSourceSegment);
}

async function recordTranscriptFetchEvent(
  dbClient: DbClient | null,
  {
    userId,
    videoId,
    provider,
    cacheHit,
    status,
    reason = null,
    estimatedCostMicrousd = 0,
  }: {
    userId: string | null;
    videoId: string;
    provider: string;
    cacheHit: boolean;
    status: "success" | "unavailable" | "error" | "skipped";
    reason?: string | null;
    estimatedCostMicrousd?: number;
  },
) {
  if (!dbClient) {
    return;
  }

  try {
    await table<YoutubeTranscriptFetchEventsTable>(dbClient, "youtube_transcript_fetch_events")
      .insert({
        user_id: userId,
        youtube_video_id: videoId,
        provider,
        cache_hit: cacheHit,
        status,
        reason,
        estimated_cost_microusd: estimatedCostMicrousd,
      });
  } catch {
    // Observability must not block recipe extraction.
  }
}

async function readTranscriptCache(
  dbClient: DbClient | null,
  videoId: string,
): Promise<YoutubeTranscriptProviderResult | null> {
  if (!dbClient) {
    return null;
  }

  let rows: YoutubeTranscriptCacheRow[] | null;

  try {
    const result = await table<YoutubeTranscriptCacheTable>(dbClient, "youtube_transcript_cache")
      .select("id,youtube_video_id,language,source_provider,source_kind,transcript_text,segments_json,expires_at")
      .eq("youtube_video_id", videoId)
      .gt("expires_at", new Date().toISOString())
      .order("last_used_at", { ascending: false })
      .limit(20);

    if (result.error) {
      return null;
    }

    rows = result.data;
  } catch {
    return null;
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = PREFERRED_TRANSCRIPT_LANGUAGES
    .map((language) => rows?.find((candidate) => candidate.language === language))
    .find(Boolean)
    ?? rows[0];
  const transcriptText = row.transcript_text?.trim();

  if (!transcriptText) {
    return null;
  }

  try {
    await table<YoutubeTranscriptCacheTable>(dbClient, "youtube_transcript_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch {
    // Cache freshness updates are best-effort.
  }

  return {
    status: "available",
    providerName: row.source_provider,
    transcriptText,
    transcriptSegments: normalizeTranscriptSegments(row.segments_json),
    language: row.language,
    trackKind: row.source_kind === "caption" || row.source_kind === "transcript" ? "unknown" : null,
    reason: "cache_hit",
  };
}

async function writeTranscriptCache(
  dbClient: DbClient | null,
  videoId: string,
  result: YoutubeTranscriptProviderResult,
  sourceProvider: string,
) {
  const transcriptText = result.transcriptText?.trim();

  if (!dbClient || !transcriptText) {
    return;
  }

  try {
    await table<YoutubeTranscriptCacheTable>(dbClient, "youtube_transcript_cache")
      .insert({
        youtube_video_id: videoId,
        language: normalizeTranscriptLanguage(result.language),
        source_provider: sourceProvider,
        source_kind: sourceProvider === EXTERNAL_TRANSCRIPT_PROVIDER ? "transcript" : "caption",
        transcript_text: transcriptText,
        segments_json: result.transcriptSegments ?? [],
        expires_at: buildTranscriptCacheExpiresAt(),
        last_used_at: new Date().toISOString(),
      });
  } catch {
    // Cache writes are best-effort; extraction can still return the freshly fetched transcript.
  }
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPaidTranscriptConfig() {
  if (process.env.YOUTUBE_TRANSCRIPT_PAID_PROVIDER !== "apify") {
    return null;
  }

  const token = process.env.APIFY_TOKEN?.trim();
  const actorId = process.env.YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID?.trim();

  if (!token || !actorId) {
    return null;
  }

  return {
    token,
    actorId,
    dailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_TRANSCRIPT_PAID_DAILY_LIMIT, 50),
    userDailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_TRANSCRIPT_PAID_USER_DAILY_LIMIT, 5),
    timeoutMs: parsePositiveIntegerEnv(process.env.YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS, 15_000),
  };
}

function getUtcDayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function isMissingSupabaseRelationError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";

  return code === "PGRST205"
    || code === "42P01"
    || /could not find the table|relation .+ does not exist|schema cache/iu.test(message);
}

function canUsePaidTranscriptWithoutEventTable(error: unknown) {
  return process.env.NODE_ENV !== "production" && isMissingSupabaseRelationError(error);
}

async function canUsePaidTranscriptProvider(
  dbClient: DbClient | null,
  userId: string,
  config: NonNullable<ReturnType<typeof getPaidTranscriptConfig>>,
) {
  if (!dbClient) {
    return false;
  }

  try {
    const result = await table<YoutubeTranscriptFetchEventsTable>(dbClient, "youtube_transcript_fetch_events")
      .select("user_id,provider,status,created_at")
      .eq("provider", EXTERNAL_TRANSCRIPT_PROVIDER)
      .eq("status", "success")
      .gte("created_at", getUtcDayStartIso());

    if (result.error) {
      return canUsePaidTranscriptWithoutEventTable(result.error);
    }

    const rows = result.data ?? [];
    const totalCount = rows.length;
    const userCount = rows.filter((row) => row.user_id === userId).length;

    return totalCount < config.dailyLimit && userCount < config.userDailyLimit;
  } catch (error) {
    return canUsePaidTranscriptWithoutEventTable(error);
  }
}

function collectTextFromUnknownTranscript(
  value: unknown,
  language: string | null,
): YoutubeSourceSegment[] {
  if (typeof value === "string") {
    return buildTextSegments({ text: value, source: "transcript", language, trackKind: "unknown" });
  }

  if (isRecord(value)) {
    const nestedLanguage = typeof value.languageCode === "string"
      ? value.languageCode
      : typeof value.language === "string"
        ? value.language
        : language;
    const nestedSegments = collectTextFromUnknownTranscript(
      value.segments ?? value.items ?? value.transcript ?? value.captions ?? value.subtitles,
      nestedLanguage,
    );

    if (nestedSegments.length > 0) {
      return nestedSegments;
    }

    return collectTextFromUnknownTranscript(
      value.transcriptText ?? value.transcript_text ?? value.text ?? value.content,
      nestedLanguage,
    );
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, lineIndex): YoutubeSourceSegment[] => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) {
        return [];
      }

      return [{
        source: "transcript",
        lineIndex,
        text,
        startMs: null,
        durationMs: null,
        language,
        trackKind: "unknown",
      }];
    }

    if (!isRecord(item)) {
      return [];
    }

    const textValue = item.text ?? item.utf8 ?? item.caption ?? item.content;
    if (typeof textValue !== "string" || !textValue.trim()) {
      return [];
    }

    const startSeconds = typeof item.start === "number" ? item.start : null;
    const durationSeconds = typeof item.duration === "number" ? item.duration : null;
    const startMs = typeof item.startMs === "number"
      ? Math.round(item.startMs)
      : startSeconds === null
        ? null
        : Math.round(startSeconds * 1000);
    const durationMs = typeof item.durationMs === "number"
      ? Math.round(item.durationMs)
      : durationSeconds === null
        ? null
        : Math.round(durationSeconds * 1000);

    return [{
      source: "transcript",
      lineIndex,
      text: textValue.trim(),
      startMs,
      durationMs,
      language,
      trackKind: "unknown",
    }];
  });
}

function parsePaidTranscriptPayload(payload: unknown): {
  text: string;
  segments: YoutubeSourceSegment[];
  language: string | null;
} | null {
  const items = Array.isArray(payload) ? payload : [payload];

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const directLanguage = typeof item.language === "string"
      ? item.language
      : typeof item.languageCode === "string"
        ? item.languageCode
        : null;
    const directText = item.transcriptText ?? item.transcript_text ?? item.text ?? item.content;
    const nestedTranscript = item.transcript ?? item.captions ?? item.subtitles ?? item.segments;
    const nestedLanguage = isRecord(nestedTranscript)
      ? typeof nestedTranscript.languageCode === "string"
        ? nestedTranscript.languageCode
        : typeof nestedTranscript.language === "string"
          ? nestedTranscript.language
          : null
      : null;
    const language = directLanguage ?? nestedLanguage;
    const segments = [
      ...collectTextFromUnknownTranscript(nestedTranscript, language),
      ...collectTextFromUnknownTranscript(directText, language),
    ];
    const text = joinSegmentText(segments);

    if (text) {
      return { text, segments, language };
    }
  }

  return null;
}

function buildApifyTranscriptInput(
  context: YoutubeTranscriptProviderContext,
  config: NonNullable<ReturnType<typeof getPaidTranscriptConfig>>,
) {
  const baseInput = {
    url: context.youtubeUrl,
    videoUrl: context.youtubeUrl,
    videoUrls: [context.youtubeUrl],
    startUrls: [{ url: context.youtubeUrl }],
    languages: PREFERRED_TRANSCRIPT_LANGUAGES,
  };
  const normalizedActorId = config.actorId.replace(/\//gu, "~").toLowerCase();

  if (normalizedActorId === "tubelens~youtube-video-scraper") {
    return {
      ...baseInput,
      includeMetadata: false,
      includeTranscript: true,
      transcriptLanguage: PREFERRED_TRANSCRIPT_LANGUAGES[0] ?? "ko",
      includeComments: false,
      includeChannel: false,
      maxCommentsPerVideo: 0,
    };
  }

  return baseInput;
}

async function fetchApifyTranscript(
  context: YoutubeTranscriptProviderContext,
  config: NonNullable<ReturnType<typeof getPaidTranscriptConfig>>,
): Promise<YoutubeTranscriptProviderResult> {
  const actorId = encodeURIComponent(config.actorId).replace(/%7E/gu, "~");
  const params = new URLSearchParams({
    token: config.token,
    timeout: String(Math.ceil(config.timeoutMs / 1000)),
    format: "json",
    clean: "true",
    maxItems: "1",
  });
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?${params.toString()}`;
  let response: Response;

  try {
    response = await fetchTextWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildApifyTranscriptInput(context, config)),
      },
      config.timeoutMs,
    );
  } catch {
    return {
      status: "error",
      providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
      reason: "external_transcript_api_fetch_failed",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
      reason: response.status === 408
        ? "external_transcript_api_timeout"
        : "external_transcript_api_error",
    };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      status: "error",
      providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
      reason: "external_transcript_api_invalid_json",
    };
  }

  const parsed = parsePaidTranscriptPayload(payload);
  if (!parsed) {
    return {
      status: "unavailable",
      providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
      reason: "external_transcript_api_empty_transcript",
    };
  }

  return {
    status: "available",
    providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
    transcriptText: parsed.text,
    transcriptSegments: parsed.segments,
    language: parsed.language,
    trackKind: "unknown",
  };
}

function createDefaultYoutubeTranscriptProvider(
  dbClient: DbClient | null,
  userId: string,
): YoutubeTranscriptProvider {
  return {
    name: "youtube_transcript_chain",
    async fetchTranscript(context) {
      const cached = await readTranscriptCache(dbClient, context.videoId);
      if (cached) {
        await recordTranscriptFetchEvent(dbClient, {
          userId,
          videoId: context.videoId,
          provider: TRANSCRIPT_CACHE_PROVIDER,
          cacheHit: true,
          status: "success",
        });
        return cached;
      }

      const publicResult = await fetchPublicYoutubeTranscript(context, {
        providerName: YOUTUBE_PUBLIC_TIMEDTEXT_PROVIDER,
      });
      if (publicResult.status === "available" && publicResult.transcriptText?.trim()) {
        await writeTranscriptCache(dbClient, context.videoId, publicResult, YOUTUBE_PUBLIC_TIMEDTEXT_PROVIDER);
        await recordTranscriptFetchEvent(dbClient, {
          userId,
          videoId: context.videoId,
          provider: YOUTUBE_PUBLIC_TIMEDTEXT_PROVIDER,
          cacheHit: false,
          status: "success",
        });
        return publicResult;
      }

      const cookieHeader = process.env.YOUTUBE_TRANSCRIPT_COOKIE_HEADER?.trim()
        || process.env.YOUTUBE_COOKIE_HEADER?.trim()
        || null;
      if (cookieHeader) {
        const cookieResult = await fetchPublicYoutubeTranscript(context, {
          providerName: YOUTUBE_TIMEDTEXT_COOKIE_PROVIDER,
          cookieHeader,
        });
        if (cookieResult.status === "available" && cookieResult.transcriptText?.trim()) {
          await writeTranscriptCache(dbClient, context.videoId, cookieResult, YOUTUBE_TIMEDTEXT_COOKIE_PROVIDER);
          await recordTranscriptFetchEvent(dbClient, {
            userId,
            videoId: context.videoId,
            provider: YOUTUBE_TIMEDTEXT_COOKIE_PROVIDER,
            cacheHit: false,
            status: "success",
          });
          return cookieResult;
        }
      }

      const paidConfig = getPaidTranscriptConfig();
      if (!paidConfig) {
        await recordTranscriptFetchEvent(dbClient, {
          userId,
          videoId: context.videoId,
          provider: EXTERNAL_TRANSCRIPT_PROVIDER,
          cacheHit: false,
          status: "skipped",
          reason: "external_transcript_api_disabled",
        });
        return {
          status: "disabled",
          providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
          reason: publicResult.reason ?? "external_transcript_api_disabled",
        };
      }

      const paidAllowed = await canUsePaidTranscriptProvider(dbClient, userId, paidConfig);
      if (!paidAllowed) {
        await recordTranscriptFetchEvent(dbClient, {
          userId,
          videoId: context.videoId,
          provider: EXTERNAL_TRANSCRIPT_PROVIDER,
          cacheHit: false,
          status: "skipped",
          reason: "transcript_paid_limit_exceeded",
        });
        return {
          status: "unavailable",
          providerName: EXTERNAL_TRANSCRIPT_PROVIDER,
          reason: "transcript_paid_limit_exceeded",
        };
      }

      const paidResult = await fetchApifyTranscript(context, paidConfig);
      if (paidResult.status === "available" && paidResult.transcriptText?.trim()) {
        await writeTranscriptCache(dbClient, context.videoId, paidResult, EXTERNAL_TRANSCRIPT_PROVIDER);
        await recordTranscriptFetchEvent(dbClient, {
          userId,
          videoId: context.videoId,
          provider: EXTERNAL_TRANSCRIPT_PROVIDER,
          cacheHit: false,
          status: "success",
        });
        return paidResult;
      }

      await recordTranscriptFetchEvent(dbClient, {
        userId,
        videoId: context.videoId,
        provider: EXTERNAL_TRANSCRIPT_PROVIDER,
        cacheHit: false,
        status: paidResult.status === "error" ? "error" : "unavailable",
        reason: paidResult.reason ?? publicResult.reason ?? "transcript_unavailable",
      });

      return paidResult;
    },
  };
}

function buildTranscriptSourceProviders(meta: TranscriptFallbackMeta) {
  if (!meta.source_provider) {
    return ["public_caption_timedtext", TRANSCRIPT_PARSE_PROVIDER];
  }

  const sourceProviders = meta.cache_hit ? [TRANSCRIPT_CACHE_PROVIDER] : [];
  const normalizedProvider =
    meta.source_provider === YOUTUBE_TIMEDTEXT_COOKIE_PROVIDER
    || meta.source_provider === EXTERNAL_TRANSCRIPT_PROVIDER
      ? meta.source_provider
      : "public_caption_timedtext";

  return [
    ...sourceProviders,
    normalizedProvider,
    TRANSCRIPT_PARSE_PROVIDER,
  ].filter((provider, index, providers) => providers.indexOf(provider) === index);
}

async function resolveTranscriptFallback(
  video: YoutubeProviderVideo,
  parsedRecipe: ParsedRecipeDescription,
  parsedUrl: { youtubeUrl: string; videoId: string },
  dbClient: DbClient,
  userId: string,
): Promise<TranscriptFallbackResult> {
  const capability = getCaptionCapability(video.captionFlag);

  if (!shouldAttemptTranscriptFallback(parsedRecipe)) {
    return {
      recipe: parsedRecipe,
      usedTranscript: false,
      rawTranscriptText: null,
      rawTranscriptSegments: [],
      meta: buildTranscriptFallbackMeta({
        attempted: false,
        capability,
        provider: null,
        status: "not_needed",
      }),
    };
  }

  const provider = getYoutubeTranscriptProvider(dbClient, userId);
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
      recipe: parsedRecipe,
      usedTranscript: false,
      rawTranscriptText: null,
      rawTranscriptSegments: [],
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
  const transcriptSegments = providerResult.transcriptSegments ?? [];

  if (providerResult.status !== "available" || !transcriptText) {
    return {
      recipe: parsedRecipe,
      usedTranscript: false,
      rawTranscriptText: null,
      rawTranscriptSegments: [],
      meta: buildTranscriptFallbackMeta({
        attempted: true,
        capability,
        provider: providerName,
        status: providerResult.status === "available" ? "unavailable" : providerResult.status,
        reason: providerResult.reason ?? (transcriptText ? null : "empty_transcript"),
        language: providerResult.language ?? null,
        trackKind: providerResult.trackKind ?? null,
        cacheHit: providerResult.reason === "cache_hit",
        sourceProvider: providerName,
      }),
    };
  }

  const transcriptRecipe = parseTranscriptRecipe(video, transcriptText);
  const merged = mergeAuthorCommentRecipe(parsedRecipe, transcriptRecipe);
  const contributionCount = merged.usedIngredientCount + merged.usedStepCount;

  if (contributionCount === 0) {
    return {
      recipe: parsedRecipe,
      usedTranscript: false,
      rawTranscriptText: null,
      rawTranscriptSegments: [],
      meta: buildTranscriptFallbackMeta({
        attempted: true,
        capability,
        provider: providerName,
        status: "no_steps",
        reason: providerResult.reason ?? "no_parseable_recipe",
        language: providerResult.language ?? null,
        trackKind: providerResult.trackKind ?? null,
        cacheHit: providerResult.reason === "cache_hit",
        sourceProvider: providerName,
      }),
    };
  }

  return {
    recipe: merged.recipe,
    usedTranscript: true,
    rawTranscriptText: transcriptText,
    rawTranscriptSegments: transcriptSegments,
    meta: buildTranscriptFallbackMeta({
      attempted: true,
      capability,
      provider: providerName,
      status: "used",
      reason: providerResult.reason ?? null,
      language: providerResult.language ?? null,
      trackKind: providerResult.trackKind ?? null,
      usedIngredientCount: merged.usedIngredientCount,
      stepCount: merged.usedStepCount,
      cacheHit: providerResult.reason === "cache_hit",
      sourceProvider: providerName,
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
  let preview = previewResult;
  if ("providerError" in preview && preview.providerError.code === "PROVIDER_ERROR") {
    const fallbackResult = await fetchYoutubeVideo(parsedUrl.videoId);

    if ("video" in fallbackResult) {
      preview = {
        video: {
          videoId: fallbackResult.video.videoId,
          title: fallbackResult.video.title,
          channel: fallbackResult.video.channel,
          thumbnailUrl: fallbackResult.video.thumbnailUrl,
        },
      };
    }
  }

  if ("providerError" in preview) {
    await recordYoutubeProviderFailure(request, user.id, "validate", preview.providerError);
    return failForProviderError(preview.providerError);
  }

  const { video } = preview;
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

function shouldPreferExactDirectIngredientMatch(name: string) {
  return !AMBIGUOUS_DIRECT_MATCH_NAMES.has(name.trim());
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
  componentLabel = null,
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
  componentLabel?: string | null;
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
  const directMatches = matches.filter((match) => match.source === "direct");
  const resolvedMatch = shouldPreferExactDirectIngredientMatch(name) && directMatches.length === 1
    ? directMatches[0]
    : matches.length === 1
      ? matches[0]
      : null;
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
    component_label: componentLabel,
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
      componentLabel: ingredient.componentLabel,
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
    stepComponentLabels = [],
  }: {
    includeIncompleteFallback?: boolean;
    stepComponentLabels?: Array<string | null>;
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
        component_label: null,
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
    component_label: stepComponentLabels[index] ?? null,
    is_incomplete: false,
    missing_fields: [],
    raw_text: instruction,
  }));
}

function generateYoutubeExtractTags({
  title,
  description,
  ingredients,
  steps,
  providerTags,
}: {
  title: string;
  description?: string;
  ingredients: YoutubeRecipeExtractData["ingredients"];
  steps: YoutubeRecipeExtractData["steps"];
  providerTags?: string[];
}) {
  return generateRecipeTags({
    title,
    ingredientNames: ingredients.map((ingredient) => ingredient.standard_name),
    stepTexts: steps.map((step) => step.instruction),
    cookingMethodLabels: steps
      .map((step) => step.cooking_method?.label)
      .filter((label): label is string => typeof label === "string"),
    providerTags: [
      ...extractHashTagsFromText(description ?? ""),
      ...(providerTags ?? []),
    ],
  });
}

function candidateSourceToExtractionMethod(source: YoutubePublicTextSource) {
  if (source === "comment") return COMMENT_EXTRACTION_METHOD;
  if (source === "caption" || source === "transcript") return CAPTION_EXTRACTION_METHOD;
  return DEFAULT_EXTRACTION_METHODS[0];
}

function buildCandidateSourceSegments({
  source,
  text,
  transcriptSegments = [],
}: {
  source: YoutubePublicTextSource;
  text: string;
  transcriptSegments?: YoutubeSourceSegment[];
}) {
  if ((source === "caption" || source === "transcript") && transcriptSegments.length > 0) {
    return transcriptSegments;
  }

  return buildTextSegments({ text, source });
}

function selectMultiRecipeExtraction({
  video,
  descriptionText,
  authorCommentText,
  transcriptText,
  transcriptSegments,
}: {
  video: YoutubeProviderVideo;
  descriptionText: string;
  authorCommentText: string | null;
  transcriptText: string | null;
  transcriptSegments: YoutubeSourceSegment[];
}) {
  const sourceCandidates: Array<{
    source: YoutubePublicTextSource;
    text: string;
    segments: YoutubeSourceSegment[];
  }> = [
    ...(transcriptText?.trim()
      ? [{
          source: "caption" as const,
          text: transcriptText,
          segments: buildCandidateSourceSegments({
            source: "caption",
            text: transcriptText,
            transcriptSegments,
          }),
        }]
      : []),
    ...(authorCommentText?.trim()
      ? [{
          source: "comment" as const,
          text: authorCommentText,
          segments: buildCandidateSourceSegments({ source: "comment", text: authorCommentText }),
        }]
      : []),
    {
      source: "description" as const,
      text: descriptionText,
      segments: buildCandidateSourceSegments({ source: "description", text: descriptionText }),
    },
  ];

  for (const sourceCandidate of sourceCandidates) {
    const extraction = extractYoutubeMultiRecipeCandidates({
      title: video.title,
      text: sourceCandidate.text,
      source: sourceCandidate.source,
      segments: sourceCandidate.segments,
    });

    if (extraction && extraction.candidates.length >= 2) {
      return {
        ...extraction,
        segments: sourceCandidate.segments,
      };
    }
  }

  return null;
}

async function buildExtractedRecipeCandidate({
  dbClient,
  rawCandidate,
}: {
  dbClient: DbClient;
  rawCandidate: YoutubeRawRecipeCandidate;
}): Promise<{
  candidate: YoutubeRecipeCandidate | null;
  newCookingMethods: YoutubeExtractedCookingMethod[];
  error: QueryError | null;
}> {
  const parsedIngredients = rawCandidate.draft.ingredients.map(adaptFlatDraftIngredient);
  const ingredientLookup = await findIngredientIds(
    dbClient,
    parsedIngredients.map((ingredient) => ingredient.name),
  );

  if (ingredientLookup.error) {
    return { candidate: null, newCookingMethods: [], error: ingredientLookup.error };
  }

  const cookingMethodResult = await resolveCookingMethodsForSteps(dbClient, rawCandidate.draft.steps);
  if (cookingMethodResult.error || !cookingMethodResult.fallbackMethod) {
    return {
      candidate: null,
      newCookingMethods: [],
      error: cookingMethodResult.error ?? { message: "missing fallback cooking method" },
    };
  }

  const ingredients = buildExtractedIngredients(ingredientLookup.matchesByName, parsedIngredients);
  const steps = buildExtractedSteps(
    rawCandidate.draft.steps,
    cookingMethodResult.methods,
    cookingMethodResult.fallbackMethod,
    {
      includeIncompleteFallback: rawCandidate.draft.includeIncompleteStepFallback,
      stepComponentLabels: rawCandidate.draft.stepComponentLabels,
    },
  );
  const blockingIssues = [
    ...rawCandidate.draft.blockingIssues,
    ...buildBlockingIssues(ingredients),
    ...steps.flatMap((step, index) =>
      (step.missing_fields ?? []).map((field) => `steps[${index}].${field}`),
    ),
  ].filter((issue, index, issues) => issues.indexOf(issue) === index);

  return {
    candidate: {
      candidate_id: rawCandidate.candidateId,
      title: rawCandidate.title,
      start_ms: rawCandidate.startMs,
      end_ms: rawCandidate.endMs,
      confidence: rawCandidate.confidence,
      ingredients,
      steps,
      draft_warnings: rawCandidate.draft.draftWarnings,
      blocking_issues: blockingIssues,
      evidence_refs: rawCandidate.evidenceRefs,
    },
    newCookingMethods: cookingMethodResult.newCookingMethods,
    error: null,
  };
}

async function buildExtractedRecipeCandidates({
  dbClient,
  rawCandidates,
}: {
  dbClient: DbClient;
  rawCandidates: YoutubeRawRecipeCandidate[];
}) {
  const candidates: YoutubeRecipeCandidate[] = [];
  const newCookingMethods: YoutubeExtractedCookingMethod[] = [];

  for (const rawCandidate of rawCandidates) {
    const result = await buildExtractedRecipeCandidate({ dbClient, rawCandidate });
    if (result.error || !result.candidate) {
      return { candidates: [], newCookingMethods: [], error: result.error ?? { message: "candidate failed" } };
    }

    candidates.push(result.candidate);
    for (const method of result.newCookingMethods) {
      if (!newCookingMethods.some((existing) => existing.id === method.id || existing.code === method.code)) {
        newCookingMethods.push(method);
      }
    }
  }

  return { candidates, newCookingMethods, error: null };
}

function buildMultiRecipeCandidateRows(
  extractionSessionId: string,
  candidates: YoutubeRecipeCandidate[],
): YoutubeExtractionCandidateInsert[] {
  return candidates.map((candidate) => ({
    id: crypto.randomUUID(),
    extraction_session_id: extractionSessionId,
    candidate_id: candidate.candidate_id,
    status: "draft",
    child_extraction_session_id: null,
    recipe_id: null,
    title: candidate.title,
    start_ms: candidate.start_ms,
    end_ms: candidate.end_ms,
    confidence: candidate.confidence,
    draft_ingredient_ids_json: candidate.ingredients.map((ingredient) => ingredient.draft_ingredient_id),
    source_meta_json: {
      evidence_refs: candidate.evidence_refs,
      blocking_issues: candidate.blocking_issues,
      draft_warnings: candidate.draft_warnings,
    },
  }));
}

async function insertExtractionCandidates(
  dbClient: DbClient,
  rows: YoutubeExtractionCandidateInsert[],
) {
  if (rows.length === 0) {
    return null;
  }

  const result = await table<YoutubeExtractionCandidatesTable>(dbClient, "youtube_extraction_candidates")
    .insert(rows);

  return result.error;
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
  const authorCommentFallback = await resolveAuthorCommentFallback(video, parsedRecipe, descriptionParse, parsedUrl);
  const transcriptFallback = await resolveTranscriptFallback(
    video,
    authorCommentFallback.recipe,
    parsedUrl,
    dbClient,
    user.id,
  );
  const finalParsedRecipe = transcriptFallback.recipe;
  const rawSourceText = buildRawSourceText(
    video.description,
    authorCommentFallback.rawAuthorCommentText,
    transcriptFallback.rawTranscriptText,
  );
  const multiRecipeExtraction = selectMultiRecipeExtraction({
    video,
    descriptionText: video.description,
    authorCommentText: authorCommentFallback.rawAuthorCommentText,
    transcriptText: transcriptFallback.rawTranscriptText,
    transcriptSegments: transcriptFallback.rawTranscriptSegments,
  });

  if (multiRecipeExtraction) {
    const candidateBuild = await buildExtractedRecipeCandidates({
      dbClient,
      rawCandidates: multiRecipeExtraction.candidates,
    });

    if (candidateBuild.error) {
      return fail("INTERNAL_ERROR", "다중 레시피 후보를 만들지 못했어요.", 500);
    }

    const extractionId = crypto.randomUUID();
    const extractionMethod = candidateSourceToExtractionMethod(multiRecipeExtraction.source);
    const extractionMethods = [extractionMethod];
    const sourceProviders = [
      "youtube_videos_list",
      ...(multiRecipeExtraction.source === "description" ? ["description_parser"] : []),
      ...(multiRecipeExtraction.source === "comment"
        ? ["youtube_comment_threads", "comment_filter", "comment_parser"]
        : []),
      ...(multiRecipeExtraction.source === "caption" || multiRecipeExtraction.source === "transcript"
        ? buildTranscriptSourceProviders(transcriptFallback.meta)
        : []),
      "multi_recipe_candidate_parser",
    ];
    const sourceSegmentsSummary: YoutubeSourceSegmentsSummary[] = [
      summarizeSourceSegments(multiRecipeExtraction.segments),
    ];
    const draftWarnings = [
      ...(classification.status === "uncertain"
        ? ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해주세요."]
        : []),
      "영상 안에서 여러 요리 후보를 찾았어요. 저장할 요리를 먼저 선택해주세요.",
    ];
    const tags = generateYoutubeExtractTags({
      title: video.title,
      description: video.description,
      ingredients: candidateBuild.candidates.flatMap((candidate) => candidate.ingredients),
      steps: candidateBuild.candidates.flatMap((candidate) => candidate.steps),
      providerTags: video.tags,
    });
    const data: YoutubeRecipeExtractData = {
      extraction_id: extractionId,
      title: video.title,
      base_servings: 1,
      thumbnail_url: video.thumbnailUrl,
      tags,
      extraction_methods: extractionMethods,
      draft_warnings: draftWarnings,
      blocking_issues: [MULTI_CANDIDATE_REVIEW_REQUIRED],
      ingredients: [],
      steps: [],
      new_cooking_methods: candidateBuild.newCookingMethods,
      multi_recipe_status: multiRecipeExtraction.candidates.length > 1 ? "multiple" : "ambiguous",
      primary_candidate_id: candidateBuild.candidates[0]?.candidate_id ?? null,
      caption_source: extractionMethod === CAPTION_EXTRACTION_METHOD ? "server_timedtext" : "none",
      source_segments_summary: sourceSegmentsSummary,
      recipe_candidates: candidateBuild.candidates,
    };
    const expiresAt = buildSessionExpiresAt();
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
      raw_source_text: rawSourceText,
      extraction_meta_json: {
        provider_version: YOUTUBE_PROVIDER_VERSION,
        source_providers: sourceProviders,
        classification_status: classification.status,
        classification_reasons: classification.reasons,
        description_parser_version: descriptionParse.parserVersion,
        description_parser_selection_outcome: "multi_recipe_candidates",
        draft_warnings: draftWarnings,
        author_comment_provider: authorCommentFallback.meta,
        caption_capability: transcriptFallback.meta.capability,
        transcript_provider: transcriptFallback.meta,
        multi_recipe_status: data.multi_recipe_status,
        primary_candidate_id: data.primary_candidate_id,
        candidate_count: candidateBuild.candidates.length,
        source_segments_summary: sourceSegmentsSummary,
      },
      draft_json: data as unknown as Record<string, unknown>,
      extraction_methods: extractionMethods,
      status: "draft",
      expires_at: expiresAt,
      session_kind: "multi_parent",
      parent_extraction_session_id: null,
      parent_candidate_id: null,
    });

    if (sessionError) {
      return fail("INTERNAL_ERROR", "추출 세션을 저장하지 못했어요.", 500);
    }

    const candidateError = await insertExtractionCandidates(
      dbClient,
      buildMultiRecipeCandidateRows(extractionId, candidateBuild.candidates),
    );

    if (candidateError) {
      return fail("INTERNAL_ERROR", "레시피 후보를 저장하지 못했어요.", 500);
    }

    return ok(data);
  }

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
      stepComponentLabels: finalParsedRecipe.stepComponentLabels,
    },
  ).map((step, index) => ({
    ...step,
    duration_text: descriptionParse.stepDurationTexts?.[index] ?? step.duration_text,
  }));
  const tags = generateYoutubeExtractTags({
    title: video.title,
    description: video.description,
    ingredients,
    steps,
    providerTags: video.tags,
  });
  const descriptionContributed = parsedRecipe.ingredients.length > 0 || parsedRecipe.steps.length > 0;
  const extractionMethods = [
    ...(descriptionContributed || (!authorCommentFallback.usedAuthorComment && !transcriptFallback.usedTranscript)
      ? [...DEFAULT_EXTRACTION_METHODS]
      : []),
    ...(authorCommentFallback.usedAuthorComment ? [COMMENT_EXTRACTION_METHOD] : []),
    ...(transcriptFallback.usedTranscript ? [CAPTION_EXTRACTION_METHOD] : []),
  ];
  const sourceProviders = [
    "youtube_videos_list",
    "description_parser",
    ...(authorCommentFallback.usedAuthorComment
      ? ["youtube_comment_threads", "comment_filter", "comment_parser"]
      : []),
    ...(transcriptFallback.usedTranscript
      ? buildTranscriptSourceProviders(transcriptFallback.meta)
      : []),
  ];
  const remainingDescriptionBlockingIssues = descriptionParse.blockingIssues.filter((issue) => {
    if (issue === "ingredients" && finalParsedRecipe.ingredients.length > 0) {
      return false;
    }

    if (issue === "steps" && finalParsedRecipe.steps.length > 0) {
      return false;
    }

    return true;
  });
  const blockingIssues = [
    ...remainingDescriptionBlockingIssues,
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
    thumbnail_url: video.thumbnailUrl,
    tags,
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
    raw_source_text: rawSourceText,
    extraction_meta_json: {
      provider_version: YOUTUBE_PROVIDER_VERSION,
      source_providers: sourceProviders,
      classification_status: classification.status,
      classification_reasons: classification.reasons,
      description_parser_version: descriptionParse.parserVersion,
      description_parser_selection_outcome: descriptionParse.selectionOutcome,
      description_parser_shadow: descriptionParse.shadowResult,
      draft_warnings: draftWarnings,
      author_comment_provider: authorCommentFallback.meta,
      caption_capability: transcriptFallback.meta.capability,
      transcript_provider: transcriptFallback.meta,
      partial_extraction: finalParsedRecipe.ingredients.length > 0 && finalParsedRecipe.steps.length === 0,
    },
    draft_json: data as unknown as Record<string, unknown>,
    extraction_methods: extractionMethods,
    status: "draft",
    expires_at: buildSessionExpiresAt(),
    session_kind: "single",
    parent_extraction_session_id: null,
    parent_candidate_id: null,
  });

  if (sessionError) {
    return fail("INTERNAL_ERROR", "추출 세션을 저장하지 못했어요.", 500);
  }

  return ok(data);
}

function normalizeIngredient(row: Record<string, unknown>): YoutubeRecipeRegisterIngredientInput {
  const componentLabel = normalizeNullableString(row.component_label);
  const displayText = normalizeNullableString(row.display_text);

  return {
    ingredient_id: typeof row.ingredient_id === "string" ? row.ingredient_id.trim() : "",
    standard_name: typeof row.standard_name === "string" ? row.standard_name.trim() : "",
    amount: typeof row.amount === "number" ? row.amount : null,
    unit: normalizeNullableString(row.unit),
    ingredient_type: row.ingredient_type === "TO_TASTE" ? "TO_TASTE" : "QUANT",
    display_text: stripMatchingComponentPrefix(displayText, componentLabel),
    component_label: componentLabel,
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

function normalizeStep(row: Record<string, unknown>): YoutubeRecipeRegisterStepInput {
  const componentLabel = normalizeNullableString(row.component_label);
  const instruction = typeof row.instruction === "string" ? row.instruction.trim() : "";

  return {
    step_number: typeof row.step_number === "number" ? row.step_number : Number.NaN,
    instruction: stripMatchingComponentPrefix(instruction, componentLabel) ?? "",
    component_label: componentLabel,
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

  if (rawBody.thumbnail_url !== undefined) {
    fields.push({ field: "thumbnail_url", reason: "not_allowed" });
  }

  if (rawBody.tags !== undefined) {
    fields.push({ field: "tags", reason: "not_allowed" });
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

function parseYoutubeCandidateDraftBody(rawBody: unknown) {
  const fields: ValidationField[] = [];

  if (!isRecord(rawBody)) {
    return {
      fields: [{ field: "body", reason: "invalid_object" }],
      parsed: null,
    };
  }

  const body = rawBody as Partial<YoutubeCandidateDraftBody>;
  const extractionId = typeof body.extraction_id === "string" ? body.extraction_id.trim() : "";
  if (!extractionId) {
    fields.push({ field: "extraction_id", reason: "required" });
  } else if (!isUuid(extractionId)) {
    fields.push({ field: "extraction_id", reason: "invalid_uuid" });
  }

  const candidateId = typeof body.candidate_id === "string" ? body.candidate_id.trim() : "";
  if (!candidateId) {
    fields.push({ field: "candidate_id", reason: "required" });
  } else if (!/^[A-Za-z0-9_.:-]{1,80}$/u.test(candidateId)) {
    fields.push({ field: "candidate_id", reason: "invalid_format" });
  }

  const parsed = fields.length === 0
    ? ({
        extractionId,
        candidateId,
      } satisfies ParsedYoutubeCandidateDraft)
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

  if (data.error_code === "CANDIDATE_PROMOTION_REQUIRED") {
    return fail(data.error_code, data.message ?? "저장할 요리를 먼저 선택해주세요.", 409);
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
      "video_title",
      "channel_title",
      "thumbnail_url",
      "provider_version",
      "source_providers",
      "classification_status",
      "classification_reasons",
      "extraction_methods",
      "raw_source_text",
      "extraction_meta_json",
      "draft_json",
      "status",
      "expires_at",
      "session_kind",
      "parent_extraction_session_id",
      "parent_candidate_id",
    ].join(", "))
    .eq("id", extractionId)
    .maybeSingle();

  return result;
}

async function findExtractionCandidate(
  dbClient: DbClient,
  extractionSessionId: string,
  candidateId: string,
) {
  const result = await table<YoutubeExtractionCandidatesTable>(dbClient, "youtube_extraction_candidates")
    .select([
      "id",
      "extraction_session_id",
      "candidate_id",
      "status",
      "child_extraction_session_id",
      "recipe_id",
      "title",
      "start_ms",
      "end_ms",
      "confidence",
      "draft_ingredient_ids_json",
      "source_meta_json",
      "promoted_at",
      "registered_at",
    ].join(", "))
    .eq("extraction_session_id", extractionSessionId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  return result;
}

async function updateExtractionCandidate(
  dbClient: DbClient,
  extractionSessionId: string,
  candidateId: string,
  values: Partial<YoutubeExtractionCandidateRow>,
) {
  const result = await table<YoutubeExtractionCandidatesTable>(dbClient, "youtube_extraction_candidates")
    .update(values)
    .eq("extraction_session_id", extractionSessionId)
    .eq("candidate_id", candidateId);

  return result.error;
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

  if (session.session_kind === "multi_parent") {
    return fail("CANDIDATE_PROMOTION_REQUIRED", "저장할 요리를 먼저 선택해주세요.", 409);
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

  if (session.session_kind === "multi_parent") {
    return fail("CANDIDATE_PROMOTION_REQUIRED", "저장할 요리를 먼저 선택해주세요.", 409);
  }

  const draftIngredient = findDraftIngredientRow(session.draft_json, parsed.draftIngredientId);
  const resolutionStatus = draftIngredient?.resolution_status;
  if (resolutionStatus !== "unresolved" && resolutionStatus !== "needs_review") {
    return fail("CONFLICT", "등록할 재료 상태가 바뀌었어요. 다시 확인해주세요.", 409);
  }

  return null;
}

function readRecipeCandidatesFromDraft(draftJson: Record<string, unknown>) {
  if (!Array.isArray(draftJson.recipe_candidates)) {
    return [];
  }

  return draftJson.recipe_candidates.filter((candidate): candidate is YoutubeRecipeCandidate => {
    if (!isRecord(candidate)) {
      return false;
    }

    return (
      typeof candidate.candidate_id === "string" &&
      typeof candidate.title === "string" &&
      Array.isArray(candidate.ingredients) &&
      Array.isArray(candidate.steps)
    );
  });
}

function findRecipeCandidateInDraft(
  draftJson: Record<string, unknown>,
  candidateId: string,
) {
  return readRecipeCandidatesFromDraft(draftJson).find(
    (candidate) => candidate.candidate_id === candidateId,
  ) ?? null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function buildChildDraftFromCandidate({
  childExtractionId,
  parentSession,
  candidate,
}: {
  childExtractionId: string;
  parentSession: YoutubeExtractionSessionRow;
  candidate: YoutubeRecipeCandidate;
}): YoutubeRecipeExtractData {
  const parentDraft = parentSession.draft_json as unknown as Partial<YoutubeRecipeExtractData>;
  const extractionMethods = parentDraft.extraction_methods?.length
    ? parentDraft.extraction_methods
    : parentSession.extraction_methods;
  const tags = generateYoutubeExtractTags({
    title: candidate.title,
    ingredients: candidate.ingredients,
    steps: candidate.steps,
    providerTags: parentDraft.tags,
  });

  return {
    extraction_id: childExtractionId,
    title: candidate.title,
    base_servings: parentDraft.base_servings ?? 1,
    thumbnail_url: parentSession.thumbnail_url ?? parentDraft.thumbnail_url ?? null,
    tags,
    extraction_methods: extractionMethods,
    draft_warnings: candidate.draft_warnings,
    blocking_issues: candidate.blocking_issues,
    ingredients: candidate.ingredients,
    steps: candidate.steps,
    new_cooking_methods: parentDraft.new_cooking_methods ?? [],
    multi_recipe_status: "single",
    primary_candidate_id: candidate.candidate_id,
    caption_source: parentDraft.caption_source,
    source_segments_summary: parentDraft.source_segments_summary,
  };
}

function validateMultiParentSession(
  session: YoutubeExtractionSessionRow | null,
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

  if (session.session_kind !== "multi_parent") {
    return fail("INVALID_EXTRACTION_SESSION", "여러 요리 후보가 있는 추출 세션이 아니에요.", 409);
  }

  return null;
}

export async function handleYoutubeCandidateDraft(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return buildFeatureDisabledResponse();
  }

  const { routeClient, user } = await requireUser();

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const { fields, parsed } = parseYoutubeCandidateDraftBody(await readJson(request));
  if (!parsed) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, fields);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as DbClient;
  const parentResult = await findExtractionSession(dbClient, parsed.extractionId);
  if (parentResult.error) {
    return fail("INTERNAL_ERROR", "추출 세션을 확인하지 못했어요.", 500);
  }

  const parentFailure = validateMultiParentSession(parentResult.data, user.id);
  if (parentFailure) {
    return parentFailure;
  }

  const parentSession = parentResult.data as YoutubeExtractionSessionRow;
  const candidateResult = await findExtractionCandidate(
    dbClient,
    parsed.extractionId,
    parsed.candidateId,
  );
  if (candidateResult.error) {
    return fail("INTERNAL_ERROR", "레시피 후보를 확인하지 못했어요.", 500);
  }

  const candidateRow = candidateResult.data;
  if (!candidateRow) {
    return fail("CANDIDATE_NOT_FOUND", "레시피 후보를 찾을 수 없어요.", 404);
  }

  if (candidateRow.status === "registered") {
    return fail("EXTRACTION_ALREADY_REGISTERED", "이미 등록된 레시피 후보예요.", 409);
  }

  if (candidateRow.status === "promoted" && candidateRow.child_extraction_session_id) {
    const childResult = await findExtractionSession(dbClient, candidateRow.child_extraction_session_id);
    if (childResult.error) {
      return fail("INTERNAL_ERROR", "후보 추출 세션을 확인하지 못했어요.", 500);
    }

    const childSession = childResult.data;
    if (!childSession || childSession.user_id !== user.id) {
      return fail("EXTRACTION_NOT_FOUND", "후보 추출 세션을 찾을 수 없어요.", 404);
    }

    if (childSession.status === "expired" || new Date(childSession.expires_at).getTime() <= Date.now()) {
      return fail("EXTRACTION_EXPIRED", "추출 세션이 만료됐어요. 다시 가져와 주세요.", 410);
    }

    if (childSession.status === "consumed") {
      return fail("EXTRACTION_ALREADY_REGISTERED", "이미 등록된 추출 결과예요.", 409);
    }

    return ok({
      parent_extraction_id: parsed.extractionId,
      candidate_id: parsed.candidateId,
      draft: childSession.draft_json as unknown as YoutubeRecipeExtractData,
    } satisfies YoutubeCandidateDraftData);
  }

  if (candidateRow.status !== "draft") {
    return fail("INVALID_CANDIDATE_STATE", "선택할 수 없는 레시피 후보예요.", 409);
  }

  const candidate = findRecipeCandidateInDraft(parentSession.draft_json, parsed.candidateId);
  if (!candidate) {
    return fail("CANDIDATE_NOT_FOUND", "레시피 후보를 찾을 수 없어요.", 404);
  }

  const childExtractionId = crypto.randomUUID();
  const draft = buildChildDraftFromCandidate({
    childExtractionId,
    parentSession,
    candidate,
  });
  const parentMeta = parentSession.extraction_meta_json ?? {};
  const sourceProviders =
    parentSession.source_providers?.length
      ? parentSession.source_providers
      : readStringArray(parentMeta.source_providers);
  const childSessionError = await insertExtractionSession(dbClient, {
    id: childExtractionId,
    user_id: user.id,
    youtube_url: parentSession.youtube_url,
    youtube_video_id: parentSession.youtube_video_id,
    video_title: parentSession.video_title ?? draft.title,
    channel_title: parentSession.channel_title ?? "",
    thumbnail_url: parentSession.thumbnail_url ?? null,
    provider_version: parentSession.provider_version ?? YOUTUBE_PROVIDER_VERSION,
    source_providers: sourceProviders,
    classification_status: parentSession.classification_status ?? "recipe",
    classification_reasons: parentSession.classification_reasons ?? [],
    raw_source_text: parentSession.raw_source_text ?? "",
    extraction_meta_json: {
      ...parentMeta,
      parent_extraction_session_id: parentSession.id,
      parent_candidate_id: candidate.candidate_id,
      selected_candidate_title: candidate.title,
      selected_candidate_start_ms: candidate.start_ms,
      selected_candidate_end_ms: candidate.end_ms,
      selected_candidate_evidence_refs: candidate.evidence_refs,
      source_segments_summary: draft.source_segments_summary,
      description_parser_selection_outcome: "selected_multi_recipe_candidate",
    },
    draft_json: draft as unknown as Record<string, unknown>,
    extraction_methods: draft.extraction_methods,
    status: "draft",
    expires_at: parentSession.expires_at,
    session_kind: "candidate_child",
    parent_extraction_session_id: parentSession.id,
    parent_candidate_id: candidate.candidate_id,
  });

  if (childSessionError) {
    return fail("INTERNAL_ERROR", "후보 추출 세션을 저장하지 못했어요.", 500);
  }

  const candidateUpdateError = await updateExtractionCandidate(
    dbClient,
    parentSession.id,
    candidate.candidate_id,
    {
      status: "promoted",
      child_extraction_session_id: childExtractionId,
      promoted_at: new Date().toISOString(),
    },
  );

  if (candidateUpdateError) {
    return fail("INTERNAL_ERROR", "레시피 후보 상태를 저장하지 못했어요.", 500);
  }

  return ok({
    parent_extraction_id: parentSession.id,
    candidate_id: candidate.candidate_id,
    draft,
  } satisfies YoutubeCandidateDraftData, { status: 201 });
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

  const session = sessionResult.data;
  if (
    session?.session_kind === "candidate_child" &&
    session.parent_extraction_session_id &&
    session.parent_candidate_id
  ) {
    await updateExtractionCandidate(dbClient, session.parent_extraction_session_id, session.parent_candidate_id, {
      status: "registered",
      recipe_id: data.recipe_id,
      registered_at: new Date().toISOString(),
    });
  }

  return ok(data, { status: 201 });
}
