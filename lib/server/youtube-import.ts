import { createHash } from "node:crypto";

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
  YoutubeQuantityConfirmationStatus,
  YoutubeQuantityEvidenceRef,
  YoutubeQuantitySource,
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

interface YoutubeLlmExtractionCacheRow {
  id: string;
  youtube_video_id: string;
  source_hash: string;
  schema_version: string;
  model: string;
  source_kinds: string[];
  result_json: unknown;
  expires_at: string;
}

interface YoutubeLlmExtractionCacheSelectQuery {
  eq(column: string, value: string): YoutubeLlmExtractionCacheSelectQuery;
  gt(column: string, value: string): YoutubeLlmExtractionCacheSelectQuery;
  order(column: string, options?: { ascending?: boolean }): YoutubeLlmExtractionCacheSelectQuery;
  limit(count: number): YoutubeLlmExtractionCacheSelectQuery;
  then: ArrayQueryResult<YoutubeLlmExtractionCacheRow>["then"];
}

interface YoutubeLlmExtractionCacheUpdateQuery {
  eq(column: string, value: string): YoutubeLlmExtractionCacheUpdateQuery;
  then: ArrayQueryResult<null>["then"];
}

interface YoutubeLlmExtractionCacheTable {
  select(columns: string): YoutubeLlmExtractionCacheSelectQuery;
  insert(values: {
    youtube_video_id: string;
    source_hash: string;
    schema_version: string;
    model: string;
    source_kinds: string[];
    result_json: unknown;
    expires_at: string;
    last_used_at: string;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
  update(values: { last_used_at: string }): YoutubeLlmExtractionCacheUpdateQuery;
}

interface YoutubeLlmExtractionEventRow {
  user_id: string | null;
  provider: string;
  status: string;
  created_at: string;
}

interface YoutubeLlmExtractionEventSelectQuery {
  eq(column: string, value: string): YoutubeLlmExtractionEventSelectQuery;
  gte(column: string, value: string): YoutubeLlmExtractionEventSelectQuery;
  then: ArrayQueryResult<YoutubeLlmExtractionEventRow>["then"];
}

interface YoutubeLlmExtractionEventsTable {
  select(columns: string): YoutubeLlmExtractionEventSelectQuery;
  insert(values: {
    user_id: string | null;
    youtube_video_id: string;
    provider: string;
    model: string | null;
    cache_hit: boolean;
    status: "success" | "unavailable" | "error" | "skipped";
    reason: string | null;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_microusd: number;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface YoutubeVisualExtractionCacheRow {
  id: string;
  youtube_video_id: string;
  provider: string;
  schema_version: string;
  visual_request_hash: string;
  result_json: unknown;
  expires_at: string;
}

interface YoutubeVisualExtractionCacheSelectQuery {
  eq(column: string, value: string): YoutubeVisualExtractionCacheSelectQuery;
  gt(column: string, value: string): YoutubeVisualExtractionCacheSelectQuery;
  order(column: string, options?: { ascending?: boolean }): YoutubeVisualExtractionCacheSelectQuery;
  limit(count: number): YoutubeVisualExtractionCacheSelectQuery;
  then: ArrayQueryResult<YoutubeVisualExtractionCacheRow>["then"];
}

interface YoutubeVisualExtractionCacheUpdateQuery {
  eq(column: string, value: string): YoutubeVisualExtractionCacheUpdateQuery;
  then: ArrayQueryResult<null>["then"];
}

interface YoutubeVisualExtractionCacheTable {
  select(columns: string): YoutubeVisualExtractionCacheSelectQuery;
  insert(values: {
    youtube_video_id: string;
    provider: string;
    schema_version: string;
    visual_request_hash: string;
    result_json: unknown;
    expires_at: string;
    last_used_at: string;
  }): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
  update(values: { last_used_at: string }): YoutubeVisualExtractionCacheUpdateQuery;
}

interface YoutubeVisualExtractionEventRow {
  user_id: string | null;
  provider: string;
  event_type: string;
  status: string;
  created_at: string;
}

interface YoutubeVisualExtractionEventSelectQuery {
  eq(column: string, value: string): YoutubeVisualExtractionEventSelectQuery;
  gte(column: string, value: string): YoutubeVisualExtractionEventSelectQuery;
  then: ArrayQueryResult<YoutubeVisualExtractionEventRow>["then"];
}

interface YoutubeVisualExtractionEventsTable {
  select(columns: string): YoutubeVisualExtractionEventSelectQuery;
  insert(values: {
    user_id: string | null;
    youtube_video_id: string;
    provider: string;
    model: string | null;
    cache_hit: boolean;
    event_type: "attempted" | "cache_hit" | "quota_denied" | "success" | "error";
    status: "success" | "unavailable" | "error" | "skipped";
    reason: string | null;
    input_tokens: number;
    output_tokens: number;
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

interface ParsedYoutubeUrl {
  videoId: string;
  youtubeUrl: string;
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
const LLM_CACHE_TTL_DAYS = 90;
const GEMINI_LLM_PROVIDER = "gemini";
const GEMINI_STRUCTURED_EXTRACTOR_PROVIDER = "gemini_structured_extractor";
const GEMINI_STRUCTURED_EXTRACTOR_CACHE_PROVIDER = "gemini_structured_extractor_cache";
const VISUAL_QUANTITY_EXTRACTOR_PROVIDER = "visual_quantity_extractor";
const VISUAL_QUANTITY_EXTRACTOR_CACHE_PROVIDER = "visual_quantity_extractor_cache";
const VISUAL_RECIPE_EXTRACTOR_PROVIDER = "visual_recipe_extractor";
const VISUAL_RECIPE_EXTRACTOR_CACHE_PROVIDER = "visual_recipe_extractor_cache";
const DEFAULT_GEMINI_PRIMARY_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_LLM_SCHEMA_VERSION = "2026-06-02-quality-v3";
const DEFAULT_VISUAL_QUANTITY_SCHEMA_VERSION = "2026-06-02-visual-quantity-v2";
const DEFAULT_VISUAL_RECIPE_SCHEMA_VERSION = "2026-06-02-visual-recipe-v1";
const VISUAL_QUANTITY_CACHE_TTL_DAYS = 90;
const LLM_MAX_RECIPES = 12;
const LLM_MAX_SOURCE_LINES = 240;
const VISUAL_RECIPE_SPARSE_TEXT_MIN_INGREDIENTS = 5;
const VISUAL_RECIPE_SPARSE_TEXT_MIN_STEPS = 5;
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
  quantitySource?: YoutubeQuantitySource;
  quantityConfidence?: number | null;
  quantityRawText?: string | null;
  quantityEvidenceRefs?: YoutubeQuantityEvidenceRef[];
  quantityReviewRequired?: boolean;
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

export interface YoutubeProviderVideo {
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

export type YoutubeProviderResult =
  | { video: YoutubeProviderVideo }
  | { providerError: YoutubeProviderError };

type YoutubePreviewResult =
  | { video: YoutubePreviewVideo }
  | { providerError: YoutubeProviderError };

export interface YoutubeVideoProvider {
  name: string;
  fetchVideo(videoId: string): Promise<YoutubeProviderResult>;
}

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
  availableTranscriptText: string | null;
  availableTranscriptSegments: YoutubeSourceSegment[];
  meta: TranscriptFallbackMeta;
}

interface LlmEvidenceRef {
  source: YoutubePublicTextSource;
  line_index: number;
  start_ms: number | null;
  end_ms: number | null;
}

interface LlmSourceLine extends YoutubeSourceSegment {
  source: YoutubePublicTextSource;
  lineIndex: number;
  text: string;
}

interface LlmSourceBlock {
  source: YoutubePublicTextSource;
  text: string;
  segments: LlmSourceLine[];
}

export type YoutubeRecipeLlmExtractorStatus =
  | "available"
  | "disabled"
  | "unavailable"
  | "error";

export interface YoutubeRecipeLlmExtractorContext {
  videoId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  sourceBlocks: LlmSourceBlock[];
  schemaVersion: string;
  primaryModel: string;
  fallbackModel: string;
  timeoutMs: number;
}

export interface YoutubeRecipeLlmExtractorResult {
  status: YoutubeRecipeLlmExtractorStatus;
  providerName?: string;
  model?: string | null;
  fallbackModel?: string | null;
  resultJson?: unknown;
  reason?: string | null;
  retryCount?: number;
  fallbackUsed?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface YoutubeRecipeLlmExtractor {
  name: string;
  fetchStructuredRecipe(
    context: YoutubeRecipeLlmExtractorContext,
  ): Promise<YoutubeRecipeLlmExtractorResult>;
}

export type YoutubeVisualQuantityExtractorStatus =
  | "available"
  | "disabled"
  | "unavailable"
  | "error";

export interface YoutubeVisualQuantityExtractorIngredient {
  draft_ingredient_id: string;
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  quantity_source: YoutubeQuantitySource;
  quantity_raw_text: string | null;
}

export interface YoutubeVisualQuantityExtractorContext {
  videoId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  ingredients: YoutubeVisualQuantityExtractorIngredient[];
  schemaVersion: string;
  model: string;
  timeoutMs: number;
}

export interface YoutubeVisualQuantityExtractorResult {
  status: YoutubeVisualQuantityExtractorStatus;
  providerName?: string;
  model?: string | null;
  resultJson?: unknown;
  reason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export interface YoutubeVisualQuantityExtractor {
  name: string;
  fetchVisualQuantities(
    context: YoutubeVisualQuantityExtractorContext,
  ): Promise<YoutubeVisualQuantityExtractorResult>;
}

export type YoutubeVisualRecipeExtractorStatus =
  | "available"
  | "disabled"
  | "unavailable"
  | "error";

export interface YoutubeVisualRecipeExtractorContext {
  videoId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  sourceBlocks: LlmSourceBlock[];
  schemaVersion: string;
  model: string;
  timeoutMs: number;
}

export interface YoutubeVisualRecipeExtractorResult {
  status: YoutubeVisualRecipeExtractorStatus;
  providerName?: string;
  model?: string | null;
  resultJson?: unknown;
  reason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export interface YoutubeVisualRecipeExtractor {
  name: string;
  fetchVisualRecipe(
    context: YoutubeVisualRecipeExtractorContext,
  ): Promise<YoutubeVisualRecipeExtractorResult>;
}

interface ParsedRecipeQualityMeta {
  low_quality: boolean;
  score: number;
  reasons: string[];
  ingredient_count: number;
  step_count: number;
  noisy_ingredient_count: number;
  weak_step_count: number;
  conversational_step_count: number;
  cooking_action_step_count: number;
  suppressed_step_count: number;
  step_quality_flags: StepQualityFlag[];
}

interface LlmExtractorMeta {
  attempted: boolean;
  provider: string | null;
  model: string | null;
  fallback_model: string | null;
  schema_version: string;
  status:
    | "not_needed"
    | "disabled"
    | "cache_hit"
    | "used"
    | "unavailable"
    | "error"
    | "invalid_result";
  cache_hit: boolean;
  retry_count: number;
  fallback_used: boolean;
  input_tokens: number;
  output_tokens: number;
  reason: string | null;
  recipe_count: number;
  source_kinds: string[];
  parser_quality: ParsedRecipeQualityMeta | null;
}

interface VisualQuantityExtractorMeta {
  attempted: boolean;
  provider: string | null;
  model: string | null;
  schema_version: string;
  status:
    | "not_needed"
    | "disabled"
    | "cache_hit"
    | "used"
    | "unavailable"
    | "error"
    | "invalid_result";
  cache_hit: boolean;
  trigger_reason: string | null;
  enriched_count: number;
  review_required_count: number;
  input_tokens: number;
  output_tokens: number;
  reason: string | null;
}

interface VisualRecipeExtractorMeta {
  attempted: boolean;
  provider: string | null;
  model: string | null;
  schema_version: string;
  contract_aligned: boolean;
  status:
    | "not_needed"
    | "disabled"
    | "cache_hit"
    | "used"
    | "unavailable"
    | "error"
    | "invalid_result";
  cache_hit: boolean;
  trigger_reason: string | null;
  recipe_count: number;
  visual_source_line_count: number;
  input_tokens: number;
  output_tokens: number;
  reason: string | null;
}

interface SelectedMultiRecipeExtraction {
  source: YoutubePublicTextSource;
  candidates: YoutubeRawRecipeCandidate[];
  segments: YoutubeSourceSegment[];
}

type StepQualityFlag =
  | "non_cooking_product_note"
  | "social_cta"
  | "health_advice"
  | "conversational_filler"
  | "number_artifact"
  | "incomplete_fragment";

interface LlmFallbackResult {
  recipe: ParsedRecipeDescription;
  usedLlm: boolean;
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
  meta: LlmExtractorMeta;
  sourceProviders: string[];
  extractionMethods: string[];
  sourceSegmentsSummary: YoutubeSourceSegmentsSummary[];
}

interface VisualRecipeFallbackResult {
  recipe: ParsedRecipeDescription;
  usedVisualRecipe: boolean;
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
  meta: VisualRecipeExtractorMeta;
  sourceProviders: string[];
  extractionMethods: string[];
  sourceSegmentsSummary: YoutubeSourceSegmentsSummary[];
  rawSourceText: string | null;
}

interface NormalizedLlmIngredient {
  ingredient: FlatDraftIngredient & Pick<
    ParsedDescriptionIngredient,
    "quantitySource"
    | "quantityConfidence"
    | "quantityRawText"
    | "quantityEvidenceRefs"
    | "quantityReviewRequired"
  >;
  evidenceRefs: Array<LlmEvidenceRef & { text: string }>;
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
let youtubeVideoProviderForTest: YoutubeVideoProvider | null = null;
let recipeLlmExtractorForTest: YoutubeRecipeLlmExtractor | null = null;
let visualQuantityExtractorForTest: YoutubeVisualQuantityExtractor | null = null;
let visualRecipeExtractorForTest: YoutubeVisualRecipeExtractor | null = null;

export function setYoutubeVideoProviderForTest(provider: YoutubeVideoProvider | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeVideoProviderForTest is only available in tests");
  }

  const previousProvider = youtubeVideoProviderForTest;
  youtubeVideoProviderForTest = provider;

  return () => {
    youtubeVideoProviderForTest = previousProvider;
  };
}

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

export function setYoutubeRecipeLlmExtractorForTest(provider: YoutubeRecipeLlmExtractor | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeRecipeLlmExtractorForTest is only available in tests");
  }

  const previousProvider = recipeLlmExtractorForTest;
  recipeLlmExtractorForTest = provider;

  return () => {
    recipeLlmExtractorForTest = previousProvider;
  };
}

function getYoutubeRecipeLlmExtractor() {
  if (recipeLlmExtractorForTest) {
    return recipeLlmExtractorForTest;
  }

  return createDefaultYoutubeRecipeLlmExtractor();
}

export function setYoutubeVisualQuantityExtractorForTest(provider: YoutubeVisualQuantityExtractor | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeVisualQuantityExtractorForTest is only available in tests");
  }

  const previousProvider = visualQuantityExtractorForTest;
  visualQuantityExtractorForTest = provider;

  return () => {
    visualQuantityExtractorForTest = previousProvider;
  };
}

function getYoutubeVisualQuantityExtractor() {
  if (visualQuantityExtractorForTest) {
    return visualQuantityExtractorForTest;
  }

  return createDefaultYoutubeVisualQuantityExtractor();
}

export function setYoutubeVisualRecipeExtractorForTest(provider: YoutubeVisualRecipeExtractor | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setYoutubeVisualRecipeExtractorForTest is only available in tests");
  }

  const previousProvider = visualRecipeExtractorForTest;
  visualRecipeExtractorForTest = provider;

  return () => {
    visualRecipeExtractorForTest = previousProvider;
  };
}

function getYoutubeVisualRecipeExtractor() {
  if (visualRecipeExtractorForTest) {
    return visualRecipeExtractorForTest;
  }

  return createDefaultYoutubeVisualRecipeExtractor();
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
  if (youtubeVideoProviderForTest) {
    return youtubeVideoProviderForTest.fetchVideo(videoId);
  }

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
  const withoutTimestamp = line
    .trim()
    .replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/u, "");

  return withoutTimestamp
    .replace(/^[\s>]*[(（]\s*\d{1,2}\s*[)）.]\s*/u, "")
    .replace(/^[\s>]*[-–—•·*]+\s*/u, "")
    .replace(/^[\s>]*\d+[.)]\s*/u, "")
    .replace(/^[\s>]*[①②③④⑤⑥⑦⑧⑨⑩]\s*/u, "")
    .trim();
}

const TEXT_AMOUNT_SIGNAL_RE =
  /(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s*(?:g|kg|ml|l|L|t|T|스푼|큰술|작은술|숟가락|컵|개|장|대|쪽|줌|꼬집|분|초|인분|도)?/u;
const TO_TASTE_SIGNAL_RE =
  /(?:약간|조금|적당량|소량|취향껏|취향에\s*따라|한\s*꼬집|한\s*줌|한\s*움큼)/u;
const GARNISH_STEP_SIGNAL_RE =
  /(?:^|\s)(?:통깨|참깨|깨소금|김가루|파슬리|쪽파|대파|고명)(?:을|를|은|는)?(?:\s+[가-힣]{1,6}){0,2}\s*(?:솔솔|톡톡|올려|올린|뿌려|뿌린|뿌리고|마무리(?:해|합|$|\s|[.!。]))/u;
const LEADING_NUMBER_ARTIFACT_RE =
  /^[\s>]*(?:[(（]\s*\d{1,2}\s*[)）.]\s*|\d{1,2}[.)]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/u;

function hasStepRecipeSignal(text: string) {
  return hasCookingAction(text)
    || TEXT_AMOUNT_SIGNAL_RE.test(text)
    || TO_TASTE_SIGNAL_RE.test(text)
    || GARNISH_STEP_SIGNAL_RE.test(text);
}

function hasCommercialSignal(text: string) {
  const normalized = text.toLowerCase();

  return /(?:제품|상품|도구|팬|용기|브랜드|협찬|광고|구매|판매|가격|공구|쿠폰|스마트\s*스토어|스토어|마켓|링크|tag|tags?)/iu.test(normalized)
    && /(?:정보|태그|링크|구매|판매|추천|확인|프로필|고정\s*댓글|오프라인|온라인|할인|협찬|광고|store|shop|link)/iu.test(normalized);
}

function hasSocialCtaSignal(text: string) {
  const normalized = text.toLowerCase();

  return /(?:구독|좋아요|알림\s*설정|댓글|팔로우|follow|subscribe|like|프로필|채널|인스타|instagram|틱톡|tiktok|블로그|고정\s*댓글)/iu.test(normalized)
    && /(?:눌러|부탁|확인|참고|링크|남겨|방문|보러|보기|follow|subscribe|like)/iu.test(normalized);
}

function hasHealthAdviceSignal(text: string) {
  const normalized = text.toLowerCase();

  return /(?:kcal|칼로리|열량|단백질|탄수화물|지방|다이어트|식단|영양\s*성분|저탄|고단백|혈당)/iu.test(normalized)
    && /(?:추천|좋아요|관리|식단|참고|섭취|챙겨|도움|효과)/iu.test(normalized);
}

function hasConversationalFillerSignal(text: string) {
  const normalized = text.toLowerCase();
  const stripped = normalized.replace(/\s+/gu, "");

  return /(?:[ㅋㅎ]{2,}|(?:하하|호호|헤헤|흐흐)|\^\^|ㅠㅠ|ㅜㅜ|!!{1,}|~~{1,})/u.test(stripped)
    || /(?:뭐야|되거든|그래\s*가지고|(?:^|\s)(?:아|어|음)\s+)/u.test(normalized);
}

function hasIncompleteTrailingSignal(text: string) {
  const normalized = collapseWhitespace(text);

  return normalized.length < 12
    || /(?:고|면|뒤|후|는|은|남은|다가)$/u.test(normalized);
}

function evaluateStepTextQuality(text: string) {
  const cleanText = cleanDescriptionItemText(text);
  const flags = new Set<StepQualityFlag>();
  const hasRecipeSignal = hasStepRecipeSignal(cleanText);

  if (LEADING_NUMBER_ARTIFACT_RE.test(text.trim())) {
    flags.add("number_artifact");
  }

  if (hasCommercialSignal(cleanText)) {
    flags.add("non_cooking_product_note");
  }

  if (hasSocialCtaSignal(cleanText)) {
    flags.add("social_cta");
  }

  if (hasHealthAdviceSignal(cleanText)) {
    flags.add("health_advice");
  }

  if (hasConversationalFillerSignal(cleanText)) {
    flags.add("conversational_filler");
  }

  if (hasIncompleteTrailingSignal(cleanText) && !hasLlmCookingAction(cleanText)) {
    flags.add("incomplete_fragment");
  }

  const hardNoise = flags.has("non_cooking_product_note")
    || flags.has("social_cta")
    || flags.has("health_advice");
  const suppress = (
    (hardNoise && !hasRecipeSignal)
    || (flags.has("conversational_filler") && !hasRecipeSignal)
    || (flags.has("incomplete_fragment") && !hasRecipeSignal)
  );

  return {
    cleanText,
    flags: [...flags],
    suppress,
  };
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
  return /(씻|자르|잘라|썰|썬다|볶|졸|조리|끓|삶|굽|구워|버무|섞|넣|절여|절이|올려|발라|뿌리|뿌려|익혀|튀겨|찐|쪄|데쳐|풀어|두르|맞춰|완성)/u.test(text);
}

function parseDescriptionStepLine(
  line: string,
  {
    requireCookingAction,
  }: {
    requireCookingAction: boolean;
  },
) {
  const quality = evaluateStepTextQuality(line);
  if (shouldStopDescriptionSection(line) && !hasStepRecipeSignal(quality.cleanText)) {
    return null;
  }

  const cleanText = quality.cleanText;

  if (
    !cleanText
    || cleanText.length < 5
    || quality.suppress
    || getRecipeDescriptionSection(cleanText)
    || (shouldStopDescriptionSection(cleanText) && !hasStepRecipeSignal(cleanText))
  ) {
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
  const quantityAnnotatedIngredient = ingredient as FlatDraftIngredient & Pick<
    ParsedDescriptionIngredient,
    "quantitySource"
    | "quantityConfidence"
    | "quantityRawText"
    | "quantityEvidenceRefs"
    | "quantityReviewRequired"
  >;

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
    quantitySource: quantityAnnotatedIngredient.quantitySource,
    quantityConfidence: quantityAnnotatedIngredient.quantityConfidence,
    quantityRawText: quantityAnnotatedIngredient.quantityRawText,
    quantityEvidenceRefs: quantityAnnotatedIngredient.quantityEvidenceRefs,
    quantityReviewRequired: quantityAnnotatedIngredient.quantityReviewRequired,
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
  const parserQuality = evaluateParsedRecipeQuality(parsedRecipe);

  return parsedRecipe.ingredients.length === 0
    || parsedRecipe.steps.length === 0
    || parserQuality.low_quality;
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

function buildLlmCacheExpiresAt() {
  return new Date(Date.now() + LLM_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function getLlmExtractionConfig() {
  if (process.env.YOUTUBE_RECIPE_LLM_ENABLED !== "true") {
    return null;
  }

  const provider = process.env.YOUTUBE_RECIPE_LLM_PROVIDER?.trim() || GEMINI_LLM_PROVIDER;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (provider !== GEMINI_LLM_PROVIDER || !apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    primaryModel: process.env.YOUTUBE_RECIPE_LLM_PRIMARY_MODEL?.trim() || DEFAULT_GEMINI_PRIMARY_MODEL,
    fallbackModel: process.env.YOUTUBE_RECIPE_LLM_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FALLBACK_MODEL,
    dailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_LLM_DAILY_LIMIT, 450),
    userDailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_LLM_USER_DAILY_LIMIT, 20),
    timeoutMs: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_LLM_TIMEOUT_MS, 15_000),
    schemaVersion: process.env.YOUTUBE_RECIPE_LLM_SCHEMA_VERSION?.trim() || DEFAULT_LLM_SCHEMA_VERSION,
  };
}

function buildLlmExtractorMeta({
  attempted,
  provider = null,
  model = null,
  fallbackModel = null,
  schemaVersion = DEFAULT_LLM_SCHEMA_VERSION,
  status,
  cacheHit = false,
  retryCount = 0,
  fallbackUsed = false,
  inputTokens = 0,
  outputTokens = 0,
  reason = null,
  recipeCount = 0,
  sourceKinds = [],
  parserQuality = null,
}: {
  attempted: boolean;
  provider?: string | null;
  model?: string | null;
  fallbackModel?: string | null;
  schemaVersion?: string;
  status: LlmExtractorMeta["status"];
  cacheHit?: boolean;
  retryCount?: number;
  fallbackUsed?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  reason?: string | null;
  recipeCount?: number;
  sourceKinds?: string[];
  parserQuality?: ParsedRecipeQualityMeta | null;
}): LlmExtractorMeta {
  return {
    attempted,
    provider,
    model,
    fallback_model: fallbackModel,
    schema_version: schemaVersion,
    status,
    cache_hit: cacheHit,
    retry_count: retryCount,
    fallback_used: fallbackUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reason,
    recipe_count: recipeCount,
    source_kinds: sourceKinds,
    parser_quality: parserQuality,
  };
}

async function recordLlmExtractionEvent(
  dbClient: DbClient | null,
  {
    userId,
    videoId,
    model,
    cacheHit,
    status,
    reason = null,
    inputTokens = 0,
    outputTokens = 0,
    estimatedCostMicrousd = 0,
  }: {
    userId: string | null;
    videoId: string;
    model: string | null;
    cacheHit: boolean;
    status: "success" | "unavailable" | "error" | "skipped";
    reason?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMicrousd?: number;
  },
) {
  if (!dbClient) {
    return;
  }

  try {
    await table<YoutubeLlmExtractionEventsTable>(dbClient, "youtube_llm_extraction_events")
      .insert({
        user_id: userId,
        youtube_video_id: videoId,
        provider: GEMINI_LLM_PROVIDER,
        model,
        cache_hit: cacheHit,
        status,
        reason,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_microusd: estimatedCostMicrousd,
      });
  } catch {
    // Observability must not block recipe extraction.
  }
}

function canUseLlmWithoutEventTable(error: unknown) {
  return process.env.NODE_ENV !== "production" && isMissingSupabaseRelationError(error);
}

async function canUseLlmExtractor(
  dbClient: DbClient | null,
  userId: string,
  config: NonNullable<ReturnType<typeof getLlmExtractionConfig>>,
) {
  if (!dbClient) {
    return false;
  }

  try {
    const result = await table<YoutubeLlmExtractionEventsTable>(dbClient, "youtube_llm_extraction_events")
      .select("user_id,provider,status,created_at")
      .eq("provider", GEMINI_LLM_PROVIDER)
      .eq("status", "success")
      .gte("created_at", getUtcDayStartIso());

    if (result.error) {
      return canUseLlmWithoutEventTable(result.error);
    }

    const rows = result.data ?? [];
    const totalCount = rows.length;
    const userCount = rows.filter((row) => row.user_id === userId).length;

    return totalCount < config.dailyLimit && userCount < config.userDailyLimit;
  } catch (error) {
    return canUseLlmWithoutEventTable(error);
  }
}

function buildLlmSourceHash(
  sourceBlocks: LlmSourceBlock[],
  schemaVersion: string,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion,
      sources: sourceBlocks.map((block) => ({
        source: block.source,
        text: block.text,
      })),
    }))
    .digest("hex");
}

async function readLlmExtractionCache(
  dbClient: DbClient | null,
  {
    videoId,
    sourceHash,
    schemaVersion,
    models,
  }: {
    videoId: string;
    sourceHash: string;
    schemaVersion: string;
    models: string[];
  },
): Promise<YoutubeLlmExtractionCacheRow | null> {
  if (!dbClient) {
    return null;
  }

  let rows: YoutubeLlmExtractionCacheRow[] | null;

  try {
    const result = await table<YoutubeLlmExtractionCacheTable>(dbClient, "youtube_llm_extraction_cache")
      .select("id,youtube_video_id,source_hash,schema_version,model,source_kinds,result_json,expires_at")
      .eq("youtube_video_id", videoId)
      .eq("source_hash", sourceHash)
      .eq("schema_version", schemaVersion)
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

  const row = models
    .map((model) => rows?.find((candidate) => candidate.model === model))
    .find(Boolean)
    ?? rows[0];

  try {
    await table<YoutubeLlmExtractionCacheTable>(dbClient, "youtube_llm_extraction_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch {
    // Cache freshness updates are best-effort.
  }

  return row;
}

async function writeLlmExtractionCache(
  dbClient: DbClient | null,
  {
    videoId,
    sourceHash,
    schemaVersion,
    model,
    sourceKinds,
    resultJson,
  }: {
    videoId: string;
    sourceHash: string;
    schemaVersion: string;
    model: string;
    sourceKinds: string[];
    resultJson: unknown;
  },
) {
  if (!dbClient) {
    return;
  }

  try {
    await table<YoutubeLlmExtractionCacheTable>(dbClient, "youtube_llm_extraction_cache")
      .insert({
        youtube_video_id: videoId,
        source_hash: sourceHash,
        schema_version: schemaVersion,
        model,
        source_kinds: sourceKinds,
        result_json: resultJson,
        expires_at: buildLlmCacheExpiresAt(),
        last_used_at: new Date().toISOString(),
      });
  } catch {
    // Cache writes are best-effort.
  }
}

function buildVisualQuantityCacheExpiresAt() {
  return new Date(Date.now() + VISUAL_QUANTITY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function getVisualQuantityExtractionConfig() {
  if (process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED !== "true") {
    return null;
  }

  const provider = process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_PROVIDER?.trim() || GEMINI_LLM_PROVIDER;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (provider !== GEMINI_LLM_PROVIDER || !apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    model: process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_MODEL?.trim()
      || process.env.YOUTUBE_RECIPE_LLM_PRIMARY_MODEL?.trim()
      || DEFAULT_GEMINI_PRIMARY_MODEL,
    dailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_DAILY_LIMIT, 200),
    userDailyLimit: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_USER_DAILY_LIMIT, 10),
    timeoutMs: parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_TIMEOUT_MS, 20_000),
    schemaVersion: process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_SCHEMA_VERSION?.trim()
      || DEFAULT_VISUAL_QUANTITY_SCHEMA_VERSION,
  };
}

function getVisualRecipeExtractionConfig() {
  const explicitVisualRecipeEnabled = process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED;
  const contractAlignedEnv = process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_CONTRACT_ALIGNED?.trim().toLowerCase();
  const contractAligned = contractAlignedEnv !== "false" && contractAlignedEnv !== "0";
  const enabled = explicitVisualRecipeEnabled === "true"
    || (
      explicitVisualRecipeEnabled === undefined
      && process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED === "true"
    );

  if (!enabled || !contractAligned) {
    return null;
  }

  const provider = process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_PROVIDER?.trim()
    || process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_PROVIDER?.trim()
    || GEMINI_LLM_PROVIDER;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (provider !== GEMINI_LLM_PROVIDER || !apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    model: process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_MODEL?.trim()
      || process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_MODEL?.trim()
      || process.env.YOUTUBE_RECIPE_LLM_PRIMARY_MODEL?.trim()
      || DEFAULT_GEMINI_PRIMARY_MODEL,
    dailyLimit: parsePositiveIntegerEnv(
      process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_DAILY_LIMIT,
      parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_DAILY_LIMIT, 200),
    ),
    userDailyLimit: parsePositiveIntegerEnv(
      process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_USER_DAILY_LIMIT,
      parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_USER_DAILY_LIMIT, 10),
    ),
    timeoutMs: parsePositiveIntegerEnv(
      process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_TIMEOUT_MS,
      parsePositiveIntegerEnv(process.env.YOUTUBE_RECIPE_VISUAL_QUANTITY_TIMEOUT_MS, 20_000),
    ),
    schemaVersion: process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_SCHEMA_VERSION?.trim()
      || DEFAULT_VISUAL_RECIPE_SCHEMA_VERSION,
    contractAligned,
  };
}

function buildVisualQuantityExtractorMeta({
  attempted,
  provider = null,
  model = null,
  schemaVersion = DEFAULT_VISUAL_QUANTITY_SCHEMA_VERSION,
  status,
  cacheHit = false,
  triggerReason = null,
  enrichedCount = 0,
  reviewRequiredCount = 0,
  inputTokens = 0,
  outputTokens = 0,
  reason = null,
}: {
  attempted: boolean;
  provider?: string | null;
  model?: string | null;
  schemaVersion?: string;
  status: VisualQuantityExtractorMeta["status"];
  cacheHit?: boolean;
  triggerReason?: string | null;
  enrichedCount?: number;
  reviewRequiredCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reason?: string | null;
}): VisualQuantityExtractorMeta {
  return {
    attempted,
    provider,
    model,
    schema_version: schemaVersion,
    status,
    cache_hit: cacheHit,
    trigger_reason: triggerReason,
    enriched_count: enrichedCount,
    review_required_count: reviewRequiredCount,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reason,
  };
}

function buildVisualRecipeExtractorMeta({
  attempted,
  provider = null,
  model = null,
  schemaVersion = DEFAULT_VISUAL_RECIPE_SCHEMA_VERSION,
  contractAligned = false,
  status,
  cacheHit = false,
  triggerReason = null,
  recipeCount = 0,
  visualSourceLineCount = 0,
  inputTokens = 0,
  outputTokens = 0,
  reason = null,
}: {
  attempted: boolean;
  provider?: string | null;
  model?: string | null;
  schemaVersion?: string;
  contractAligned?: boolean;
  status: VisualRecipeExtractorMeta["status"];
  cacheHit?: boolean;
  triggerReason?: string | null;
  recipeCount?: number;
  visualSourceLineCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reason?: string | null;
}): VisualRecipeExtractorMeta {
  return {
    attempted,
    provider,
    model,
    schema_version: schemaVersion,
    contract_aligned: contractAligned,
    status,
    cache_hit: cacheHit,
    trigger_reason: triggerReason,
    recipe_count: recipeCount,
    visual_source_line_count: visualSourceLineCount,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reason,
  };
}

async function recordVisualQuantityExtractionEvent(
  dbClient: DbClient | null,
  {
    userId,
    videoId,
    model,
    cacheHit,
    eventType,
    status,
    reason = null,
    inputTokens = 0,
    outputTokens = 0,
    estimatedCostMicrousd = 0,
  }: {
    userId: string | null;
    videoId: string;
    model: string | null;
    cacheHit: boolean;
    eventType: "attempted" | "cache_hit" | "quota_denied" | "success" | "error";
    status: "success" | "unavailable" | "error" | "skipped";
    reason?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMicrousd?: number;
  },
) {
  if (!dbClient) {
    return;
  }

  try {
    await table<YoutubeVisualExtractionEventsTable>(dbClient, "youtube_visual_extraction_events")
      .insert({
        user_id: userId,
        youtube_video_id: videoId,
        provider: GEMINI_LLM_PROVIDER,
        model,
        cache_hit: cacheHit,
        event_type: eventType,
        status,
        reason,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_microusd: estimatedCostMicrousd,
      });
  } catch {
    // Observability must not block recipe extraction.
  }
}

function canUseVisualQuantityWithoutEventTable(error: unknown) {
  return process.env.NODE_ENV !== "production" && isMissingSupabaseRelationError(error);
}

async function canUseVisualQuantityExtractor(
  dbClient: DbClient | null,
  userId: string,
  config: NonNullable<ReturnType<typeof getVisualQuantityExtractionConfig>>,
) {
  if (!dbClient) {
    return false;
  }

  try {
    const result = await table<YoutubeVisualExtractionEventsTable>(dbClient, "youtube_visual_extraction_events")
      .select("user_id,provider,event_type,status,created_at")
      .eq("provider", GEMINI_LLM_PROVIDER)
      .eq("status", "success")
      .gte("created_at", getUtcDayStartIso());

    if (result.error) {
      return canUseVisualQuantityWithoutEventTable(result.error);
    }

    const rows = result.data ?? [];
    const totalCount = rows.length;
    const userCount = rows.filter((row) => row.user_id === userId).length;

    return totalCount < config.dailyLimit && userCount < config.userDailyLimit;
  } catch (error) {
    return canUseVisualQuantityWithoutEventTable(error);
  }
}

function buildVisualQuantityRequestHash({
  ingredients,
  schemaVersion,
}: {
  ingredients: YoutubeExtractedIngredient[];
  schemaVersion: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion,
      ingredients: ingredients.map((ingredient) => ({
        draft_ingredient_id: ingredient.draft_ingredient_id,
        standard_name: ingredient.standard_name,
        raw_text: ingredient.raw_text ?? null,
      })),
    }))
    .digest("hex");
}

async function readVisualQuantityExtractionCache(
  dbClient: DbClient | null,
  {
    videoId,
    visualRequestHash,
    schemaVersion,
    provider,
  }: {
    videoId: string;
    visualRequestHash: string;
    schemaVersion: string;
    provider: string;
  },
): Promise<YoutubeVisualExtractionCacheRow | null> {
  if (!dbClient) {
    return null;
  }

  let rows: YoutubeVisualExtractionCacheRow[] | null;
  try {
    const result = await table<YoutubeVisualExtractionCacheTable>(dbClient, "youtube_visual_extraction_cache")
      .select("id,youtube_video_id,provider,schema_version,visual_request_hash,result_json,expires_at")
      .eq("youtube_video_id", videoId)
      .eq("provider", provider)
      .eq("schema_version", schemaVersion)
      .eq("visual_request_hash", visualRequestHash)
      .gt("expires_at", new Date().toISOString())
      .order("last_used_at", { ascending: false })
      .limit(1);

    if (result.error) {
      return null;
    }

    rows = result.data;
  } catch {
    return null;
  }

  const row = rows?.[0] ?? null;
  if (!row) {
    return null;
  }

  try {
    await table<YoutubeVisualExtractionCacheTable>(dbClient, "youtube_visual_extraction_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch {
    // Cache freshness updates are best-effort.
  }

  return row;
}

async function writeVisualQuantityExtractionCache(
  dbClient: DbClient | null,
  {
    videoId,
    provider,
    schemaVersion,
    visualRequestHash,
    resultJson,
  }: {
    videoId: string;
    provider: string;
    schemaVersion: string;
    visualRequestHash: string;
    resultJson: unknown;
  },
) {
  if (!dbClient) {
    return;
  }

  try {
    await table<YoutubeVisualExtractionCacheTable>(dbClient, "youtube_visual_extraction_cache")
      .insert({
        youtube_video_id: videoId,
        provider,
        schema_version: schemaVersion,
        visual_request_hash: visualRequestHash,
        result_json: resultJson,
        expires_at: buildVisualQuantityCacheExpiresAt(),
        last_used_at: new Date().toISOString(),
      });
  } catch {
    // Cache writes are best-effort.
  }
}

function normalizeLlmSourceBlock(
  source: YoutubePublicTextSource,
  text: string,
  segments: YoutubeSourceSegment[] = [],
): LlmSourceBlock | null {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return null;
  }

  const baseSegments = segments.length > 0
    ? segments
    : buildTextSegments({ text: normalizedText, source });
  const normalizedSegments = baseSegments
    .map((segment, index): LlmSourceLine => ({
      source,
      lineIndex: index,
      text: segment.text.trim(),
      startMs: segment.startMs,
      durationMs: segment.durationMs,
      language: segment.language,
      trackKind: segment.trackKind,
    }))
    .filter((segment) => segment.text);

  if (normalizedSegments.length === 0) {
    return null;
  }

  return {
    source,
    text: joinSegmentText(normalizedSegments),
    segments: normalizedSegments.slice(0, LLM_MAX_SOURCE_LINES),
  };
}

function buildLlmSourceBlocks({
  descriptionText,
  authorCommentText,
  transcriptText,
  transcriptSegments,
}: {
  descriptionText: string;
  authorCommentText: string | null;
  transcriptText: string | null;
  transcriptSegments: YoutubeSourceSegment[];
}) {
  const blocks: LlmSourceBlock[] = [];
  const descriptionBlock = normalizeLlmSourceBlock("description", descriptionText);
  if (descriptionBlock) blocks.push(descriptionBlock);

  const commentBlock = authorCommentText
    ? normalizeLlmSourceBlock("comment", authorCommentText)
    : null;
  if (commentBlock) blocks.push(commentBlock);

  const transcriptSource = transcriptSegments.some((segment) => segment.source === "transcript")
    ? "transcript"
    : "caption";
  const transcriptBlock = transcriptText
    ? normalizeLlmSourceBlock(transcriptSource, transcriptText, transcriptSegments)
    : null;
  if (transcriptBlock) blocks.push(transcriptBlock);

  return blocks;
}

function buildLlmPrompt(context: YoutubeRecipeLlmExtractorContext) {
  const sourceText = context.sourceBlocks
    .map((block) => {
      const lines = block.segments
        .map((segment) => {
          const start = segment.startMs === null ? "null" : String(segment.startMs);
          const end = segment.startMs === null || segment.durationMs === null
            ? "null"
            : String(segment.startMs + segment.durationMs);
          return `[${block.source}:${segment.lineIndex}:start=${start}:end=${end}] ${segment.text}`;
        })
        .join("\n");

      return `SOURCE ${block.source}\n${lines}`;
    })
    .join("\n\n");

  return [
    "You extract cooking recipes from public YouTube text.",
    "Return only JSON that matches the schema.",
    "Rules:",
    "- Use only the provided source lines. Do not invent ingredients, amounts, or steps.",
    "- If a video contains multiple dishes, return one recipe object per dish.",
    "- Do not merge ingredients across different dishes.",
    "- Preserve repeated ingredients inside each dish; do not sum amounts.",
    "- Keep every real cooking ingredient mentioned for the selected dish, including oils, sweeteners, finishing seasonings, garnishes, and sauce ingredients.",
    "- Preserve explicit amount and unit text whenever the source line says it; do not drop quantities from raw_text.",
    "- Unknown amount/unit must be null.",
    "- Every ingredient and step must include evidence_refs pointing to real source/line_index values.",
    "- Exclude promotions, product ads, subscriptions, likes, comments, BGM, pets, family talk, and diary-only lines.",
    "- Do not create recipes titled only like 도시락, 집밥, 아침, 점심, 저녁, Cook with me, vlog, or routine.",
    "- Auto captions often contain broken conversation. Ignore questions, filler, reactions, jokes, and half-sentences.",
    "- Ingredient names must be real food items only. Do not output fragments like 좀, 이건 언제, 뭐야, 그거, or verb phrases.",
    "- Steps must be usable cooking actions. Rewrite only when the source clearly says the action; otherwise omit the step.",
    "- Split distinct cooking actions into separate steps when the source supports it: prep, sauce mixing, vegetable cutting, adding vegetables, simmering/reducing, and finishing should not be collapsed into one step.",
    "- For one clearly demonstrated dish, prefer a complete 5-9 step recipe when the source supports that many actions.",
    "- If evidence is too weak for either ingredients or steps, return an empty array for that side and add a warning.",
    "",
    `Video title: ${context.title}`,
    `Channel: ${context.channel}`,
    "",
    sourceText,
  ].join("\n");
}

const GEMINI_RECIPE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          confidence: { type: "number" },
          time_range: {
            type: "object",
            nullable: true,
            properties: {
              start_ms: { type: "integer", nullable: true },
              end_ms: { type: "integer", nullable: true },
            },
          },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                amount: { type: "string", nullable: true },
                unit: { type: "string", nullable: true },
                raw_text: { type: "string" },
                evidence_refs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      source: { type: "string" },
                      line_index: { type: "integer" },
                      start_ms: { type: "integer", nullable: true },
                      end_ms: { type: "integer", nullable: true },
                    },
                    required: ["source", "line_index"],
                  },
                },
              },
              required: ["name", "amount", "unit", "raw_text", "evidence_refs"],
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                instruction: { type: "string" },
                raw_text: { type: "string" },
                evidence_refs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      source: { type: "string" },
                      line_index: { type: "integer" },
                      start_ms: { type: "integer", nullable: true },
                      end_ms: { type: "integer", nullable: true },
                    },
                    required: ["source", "line_index"],
                  },
                },
              },
              required: ["instruction", "raw_text", "evidence_refs"],
            },
          },
          warnings: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title", "confidence", "ingredients", "steps", "warnings"],
      },
    },
    excluded_mentions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["recipes"],
} as const;

function getGeminiUsage(payload: unknown) {
  const usage = isRecord(payload) && isRecord(payload.usageMetadata)
    ? payload.usageMetadata
    : {};

  return {
    inputTokens: typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : 0,
    outputTokens: typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : 0,
  };
}

function getGeminiResponseText(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    return null;
  }

  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return null;
  }

  const part = candidate.content.parts.find((candidatePart) =>
    isRecord(candidatePart) && typeof candidatePart.text === "string",
  );

  return isRecord(part) && typeof part.text === "string" ? part.text : null;
}

function isRetryableGeminiStatus(status: number) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGeminiStructuredRecipe(
  model: string,
  context: YoutubeRecipeLlmExtractorContext,
  apiKey: string,
): Promise<{
  ok: boolean;
  retryable: boolean;
  resultJson?: unknown;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let response: Response;

  try {
    response = await fetchTextWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildLlmPrompt(context) }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RECIPE_RESPONSE_SCHEMA,
          },
        }),
      },
      context.timeoutMs,
    );
  } catch {
    return {
      ok: false,
      retryable: true,
      reason: "gemini_fetch_failed",
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
      ok: false,
      retryable: isRetryableGeminiStatus(response.status),
      reason: response.status === 429
        ? "gemini_rate_limited"
        : response.status === 503
          ? "gemini_unavailable"
          : "gemini_error",
      ...getGeminiUsage(payload),
    };
  }

  const responseText = getGeminiResponseText(payload);
  if (!responseText) {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_empty_response",
      ...getGeminiUsage(payload),
    };
  }

  try {
    return {
      ok: true,
      retryable: false,
      resultJson: JSON.parse(responseText),
      ...getGeminiUsage(payload),
    };
  } catch {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_invalid_json",
      ...getGeminiUsage(payload),
    };
  }
}

const GEMINI_VISUAL_QUANTITY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ingredient_quantities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          draft_ingredient_id: { type: "string", nullable: true },
          standard_name: { type: "string" },
          amount: { type: "number", nullable: true },
          unit: { type: "string", nullable: true },
          ingredient_type: { type: "string" },
          display_text: { type: "string" },
          quantity_source: { type: "string" },
          quantity_confidence: { type: "number" },
          quantity_raw_text: { type: "string" },
          quantity_evidence_refs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_method: { type: "string" },
                source_provider: { type: "string" },
                start_ms: { type: "integer", nullable: true },
                end_ms: { type: "integer", nullable: true },
                frame_ts_ms: { type: "integer", nullable: true },
                snippet: { type: "string" },
                locator_hash: { type: "string", nullable: true },
              },
              required: ["source_method", "source_provider", "snippet"],
            },
          },
        },
        required: [
          "standard_name",
          "amount",
          "unit",
          "ingredient_type",
          "display_text",
          "quantity_source",
          "quantity_confidence",
          "quantity_raw_text",
          "quantity_evidence_refs",
        ],
      },
    },
  },
  required: ["ingredient_quantities"],
} as const;

const GEMINI_VISUAL_RECIPE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    visual_source_lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line_index: { type: "integer" },
          text: { type: "string" },
          start_ms: { type: "integer", nullable: true },
          end_ms: { type: "integer", nullable: true },
          frame_ts_ms: { type: "integer", nullable: true },
        },
        required: ["line_index", "text"],
      },
    },
    recipes: GEMINI_RECIPE_RESPONSE_SCHEMA.properties.recipes,
    excluded_mentions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["visual_source_lines", "recipes"],
} as const;

function buildVisualQuantityPrompt(context: YoutubeVisualQuantityExtractorContext) {
  const ingredientLines = context.ingredients
    .map((ingredient, index) =>
      [
        `${index + 1}. draft_ingredient_id=${ingredient.draft_ingredient_id}`,
        `standard_name=${ingredient.standard_name}`,
        `current_amount=${ingredient.amount ?? "null"}`,
        `current_unit=${ingredient.unit ?? "null"}`,
        `raw_text=${ingredient.quantity_raw_text ?? ingredient.display_text ?? ""}`,
      ].join(" | "),
    )
    .join("\n");

  return [
    "You extract or infer review-only cooking ingredient quantities from a public YouTube video.",
    "Return only JSON that matches the response schema.",
    "Rules:",
    "- Use the video, visible cooking actions, visible ingredient names, and the draft recipe context. Do not use comments, product ads, external recipe data, or recipe lookup.",
    "- Return rows for provided draft ingredients and any additional cooking ingredients with clearly visible on-screen quantity text.",
    "- For additional ingredients, set draft_ingredient_id to null and use the visible ingredient name as standard_name.",
    "- Prefer exact on-screen amounts and units when available.",
    "- Fill every remaining missing draft ingredient quantity with the best conservative estimate instead of leaving it blank.",
    "- Estimate priority: visible count/measure, visible portion/container/action, then dish context plus ingredient role and base serving assumptions.",
    "- Infer oil, sauce, cheese, meat, seasoning, and garnish quantities when exact visual quantity text is missing; mark them as review-only recipe_inferred.",
    "- quantity_source must be visual_explicit when visible text directly shows the quantity.",
    "- For inferred rows, set quantity_source to recipe_inferred, ingredient_type to QUANT, include amount and unit, set quantity_confidence <= 0.65, and describe the visible clue or recipe-context assumption in quantity_raw_text and quantity_evidence_refs[].snippet.",
    "- Use confidence <= 0.65 for every recipe_inferred row; use lower confidence such as 0.35-0.5 when the estimate is based mostly on ingredient role or dish context.",
    "- Omit the row only when the ingredient is not part of the dish or no meaningful unit can be chosen.",
    "- quantity_evidence_refs[].source_method must be visual exactly.",
    "- ingredient_type must be QUANT for measured quantities or TO_TASTE only when no amount/unit is visible.",
    "- Return TO_TASTE only when visible text explicitly says a to-taste quantity such as 약간, 조금, 적당량, or 취향껏.",
    "- visual_explicit requires a visible on-screen text snippet and a timestamp.",
    "- unit_normalized is allowed only when raw visible text supports the conversion.",
    "- ingredient_default is allowed only when visible count evidence supports a known cooking default.",
    "- recipe_inferred is review-only and must include the clue or assumption that caused the inference.",
    "- Do not mention API keys, raw provider responses, or unrelated video details.",
    "",
    `Video title: ${context.title}`,
    `Channel: ${context.channel}`,
    "Draft ingredients:",
    ingredientLines,
  ].join("\n");
}

function buildVisualRecipePrompt(context: YoutubeVisualRecipeExtractorContext) {
  const sourceText = context.sourceBlocks
    .map((block) => {
      const lines = block.segments
        .map((segment) => {
          const start = segment.startMs === null ? "null" : String(segment.startMs);
          const end = segment.startMs === null || segment.durationMs === null
            ? "null"
            : String(segment.startMs + segment.durationMs);
          return `[${block.source}:${segment.lineIndex}:start=${start}:end=${end}] ${segment.text}`;
        })
        .join("\n");

      return `TEXT SOURCE ${block.source}\n${lines}`;
    })
    .join("\n\n");

  return [
    "You extract a cooking recipe from a public YouTube video using on-screen text OCR and captions.",
    "Return only JSON that matches the response schema.",
    "Rules:",
    "- Use the attached video frames for OCR, visible text timing, and timestamp alignment. Do not invent image-only cooking actions.",
    "- Use captions to recover spoken cooking actions when on-screen text is sparse.",
    "- First create visual_source_lines: concise evidence lines for visible ingredient cards, OCR text, measured amounts, and caption-backed cooking actions.",
    "- Each visual_source_lines item must have a stable line_index. Every recipe ingredient and step must reference those visual_source_lines.",
    "- In recipes[].ingredients[].evidence_refs and recipes[].steps[].evidence_refs, set source to visual and line_index to the matching visual_source_lines line_index.",
    "- Do not use external recipe sites, comments, description text guesses, product ads, or channel metadata.",
    "- Keep every visible cooking ingredient for the selected dish, including oils, sweeteners, sauce ingredients, garnish, and finishing seasoning.",
    "- Preserve exact visible amount and unit text in raw_text whenever on-screen text shows it.",
    "- Unknown amount/unit must be null. Do not infer a quantity unless visible text or repeated visible count supports it.",
    "- Steps must be usable cooking actions supported by on-screen text or captions. Split prep, filling/mixing, coating, pan-frying, sauce mixing, and finishing into separate steps when text evidence supports it.",
    "- For one clearly demonstrated dish, prefer a complete 5-9 step recipe when the video supports that many actions.",
    "- Exclude promotions, products, subscriptions, likes, comments, diary-only footage, family talk, and unrelated food.",
    "- If visual evidence is too weak for either ingredients or steps, return an empty array for that side and add a warning.",
    "- Do not mention API keys, raw provider responses, or unrelated video details.",
    "",
    `Video title: ${context.title}`,
    `Channel: ${context.channel}`,
    "",
    sourceText,
  ].join("\n");
}

async function callGeminiVisualQuantity(
  model: string,
  context: YoutubeVisualQuantityExtractorContext,
  apiKey: string,
): Promise<{
  ok: boolean;
  retryable: boolean;
  resultJson?: unknown;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let response: Response;

  try {
    response = await fetchTextWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  file_data: {
                    file_uri: context.youtubeUrl,
                  },
                },
                { text: buildVisualQuantityPrompt(context) },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: GEMINI_VISUAL_QUANTITY_RESPONSE_SCHEMA,
          },
        }),
      },
      context.timeoutMs,
    );
  } catch {
    return {
      ok: false,
      retryable: true,
      reason: "gemini_visual_fetch_failed",
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
      ok: false,
      retryable: isRetryableGeminiStatus(response.status),
      reason: response.status === 429
        ? "gemini_visual_rate_limited"
        : response.status === 503
          ? "gemini_visual_unavailable"
          : "gemini_visual_error",
      ...getGeminiUsage(payload),
    };
  }

  const responseText = getGeminiResponseText(payload);
  if (!responseText) {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_visual_empty_response",
      ...getGeminiUsage(payload),
    };
  }

  try {
    return {
      ok: true,
      retryable: false,
      resultJson: JSON.parse(responseText),
      ...getGeminiUsage(payload),
    };
  } catch {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_visual_invalid_json",
      ...getGeminiUsage(payload),
    };
  }
}

async function callGeminiVisualRecipe(
  model: string,
  context: YoutubeVisualRecipeExtractorContext,
  apiKey: string,
): Promise<{
  ok: boolean;
  retryable: boolean;
  resultJson?: unknown;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let response: Response;

  try {
    response = await fetchTextWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  file_data: {
                    file_uri: context.youtubeUrl,
                  },
                },
                { text: buildVisualRecipePrompt(context) },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: GEMINI_VISUAL_RECIPE_RESPONSE_SCHEMA,
          },
        }),
      },
      context.timeoutMs,
    );
  } catch {
    return {
      ok: false,
      retryable: true,
      reason: "gemini_visual_recipe_fetch_failed",
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
      ok: false,
      retryable: isRetryableGeminiStatus(response.status),
      reason: response.status === 429
        ? "gemini_visual_recipe_rate_limited"
        : response.status === 503
          ? "gemini_visual_recipe_unavailable"
          : "gemini_visual_recipe_error",
      ...getGeminiUsage(payload),
    };
  }

  const responseText = getGeminiResponseText(payload);
  if (!responseText) {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_visual_recipe_empty_response",
      ...getGeminiUsage(payload),
    };
  }

  try {
    return {
      ok: true,
      retryable: false,
      resultJson: JSON.parse(responseText),
      ...getGeminiUsage(payload),
    };
  } catch {
    return {
      ok: false,
      retryable: false,
      reason: "gemini_visual_recipe_invalid_json",
      ...getGeminiUsage(payload),
    };
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createDefaultYoutubeVisualRecipeExtractor(): YoutubeVisualRecipeExtractor {
  return {
    name: VISUAL_RECIPE_EXTRACTOR_PROVIDER,
    async fetchVisualRecipe(context) {
      const config = getVisualRecipeExtractionConfig();
      if (!config) {
        return {
          status: "disabled",
          providerName: GEMINI_LLM_PROVIDER,
          reason: "gemini_visual_recipe_disabled",
        };
      }

      const result = await callGeminiVisualRecipe(config.model, context, config.apiKey);
      if (result.ok) {
        return {
          status: "available",
          providerName: GEMINI_LLM_PROVIDER,
          model: config.model,
          resultJson: result.resultJson,
          inputTokens: result.inputTokens ?? 0,
          outputTokens: result.outputTokens ?? 0,
        };
      }

      return {
        status: result.retryable ? "unavailable" : "error",
        providerName: GEMINI_LLM_PROVIDER,
        model: config.model,
        reason: result.reason ?? "gemini_visual_recipe_unavailable",
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      };
    },
  };
}

function createDefaultYoutubeVisualQuantityExtractor(): YoutubeVisualQuantityExtractor {
  return {
    name: VISUAL_QUANTITY_EXTRACTOR_PROVIDER,
    async fetchVisualQuantities(context) {
      const config = getVisualQuantityExtractionConfig();
      if (!config) {
        return {
          status: "disabled",
          providerName: GEMINI_LLM_PROVIDER,
          reason: "gemini_visual_disabled",
        };
      }

      const result = await callGeminiVisualQuantity(config.model, context, config.apiKey);
      if (result.ok) {
        return {
          status: "available",
          providerName: GEMINI_LLM_PROVIDER,
          model: config.model,
          resultJson: result.resultJson,
          inputTokens: result.inputTokens ?? 0,
          outputTokens: result.outputTokens ?? 0,
        };
      }

      return {
        status: result.retryable ? "unavailable" : "error",
        providerName: GEMINI_LLM_PROVIDER,
        model: config.model,
        reason: result.reason ?? "gemini_visual_unavailable",
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      };
    },
  };
}

function createDefaultYoutubeRecipeLlmExtractor(): YoutubeRecipeLlmExtractor {
  return {
    name: GEMINI_STRUCTURED_EXTRACTOR_PROVIDER,
    async fetchStructuredRecipe(context) {
      const config = getLlmExtractionConfig();
      if (!config) {
        return {
          status: "disabled",
          providerName: GEMINI_LLM_PROVIDER,
          reason: "gemini_disabled",
        };
      }

      const firstAttempt = await callGeminiStructuredRecipe(config.primaryModel, context, config.apiKey);
      if (firstAttempt.ok) {
        return {
          status: "available",
          providerName: GEMINI_LLM_PROVIDER,
          model: config.primaryModel,
          fallbackModel: config.fallbackModel,
          resultJson: firstAttempt.resultJson,
          retryCount: 0,
          fallbackUsed: false,
          inputTokens: firstAttempt.inputTokens ?? 0,
          outputTokens: firstAttempt.outputTokens ?? 0,
        };
      }

      if (firstAttempt.retryable) {
        await sleep(250);
        const retryAttempt = await callGeminiStructuredRecipe(config.primaryModel, context, config.apiKey);
        if (retryAttempt.ok) {
          return {
            status: "available",
            providerName: GEMINI_LLM_PROVIDER,
            model: config.primaryModel,
            fallbackModel: config.fallbackModel,
            resultJson: retryAttempt.resultJson,
            retryCount: 1,
            fallbackUsed: false,
            inputTokens: retryAttempt.inputTokens ?? 0,
            outputTokens: retryAttempt.outputTokens ?? 0,
          };
        }

        if (retryAttempt.retryable) {
          const fallbackAttempt = await callGeminiStructuredRecipe(config.fallbackModel, context, config.apiKey);
          if (fallbackAttempt.ok) {
            return {
              status: "available",
              providerName: GEMINI_LLM_PROVIDER,
              model: config.fallbackModel,
              fallbackModel: config.fallbackModel,
              resultJson: fallbackAttempt.resultJson,
              retryCount: 1,
              fallbackUsed: true,
              inputTokens: fallbackAttempt.inputTokens ?? 0,
              outputTokens: fallbackAttempt.outputTokens ?? 0,
            };
          }

          return {
            status: fallbackAttempt.retryable ? "unavailable" : "error",
            providerName: GEMINI_LLM_PROVIDER,
            model: config.fallbackModel,
            fallbackModel: config.fallbackModel,
            reason: fallbackAttempt.reason ?? retryAttempt.reason ?? firstAttempt.reason ?? "gemini_failed",
            retryCount: 1,
            fallbackUsed: true,
            inputTokens: fallbackAttempt.inputTokens ?? 0,
            outputTokens: fallbackAttempt.outputTokens ?? 0,
          };
        }

        return {
          status: "error",
          providerName: GEMINI_LLM_PROVIDER,
          model: config.primaryModel,
          fallbackModel: config.fallbackModel,
          reason: retryAttempt.reason ?? firstAttempt.reason ?? "gemini_failed",
          retryCount: 1,
          fallbackUsed: false,
          inputTokens: retryAttempt.inputTokens ?? 0,
          outputTokens: retryAttempt.outputTokens ?? 0,
        };
      }

      return {
        status: "error",
        providerName: GEMINI_LLM_PROVIDER,
        model: config.primaryModel,
        fallbackModel: config.fallbackModel,
        reason: firstAttempt.reason ?? "gemini_failed",
        retryCount: 0,
        fallbackUsed: false,
        inputTokens: firstAttempt.inputTokens ?? 0,
        outputTokens: firstAttempt.outputTokens ?? 0,
      };
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
      availableTranscriptText: null,
      availableTranscriptSegments: [],
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
      availableTranscriptText: null,
      availableTranscriptSegments: [],
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
      availableTranscriptText: null,
      availableTranscriptSegments: [],
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
      availableTranscriptText: transcriptText,
      availableTranscriptSegments: transcriptSegments,
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
    availableTranscriptText: transcriptText,
    availableTranscriptSegments: transcriptSegments,
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

function buildLlmSourceProviders(meta: LlmExtractorMeta) {
  if (!meta.attempted || (meta.status !== "used" && meta.status !== "cache_hit")) {
    return [];
  }

  return [
    meta.cache_hit ? GEMINI_STRUCTURED_EXTRACTOR_CACHE_PROVIDER : GEMINI_STRUCTURED_EXTRACTOR_PROVIDER,
  ];
}

function sourceKindsToExtractionMethods(sourceKinds: string[]) {
  const methods = sourceKinds
    .filter(isYoutubePublicTextSource)
    .map(candidateSourceToExtractionMethod);

  return methods.filter((method, index) => methods.indexOf(method) === index);
}

function buildLlmSourceLineMap(sourceBlocks: LlmSourceBlock[]) {
  const lineMap = new Map<string, LlmSourceLine>();

  for (const block of sourceBlocks) {
    for (const segment of block.segments) {
      lineMap.set(`${block.source}:${segment.lineIndex}`, segment);
    }
  }

  return lineMap;
}

function normalizeLlmEvidenceRefs(value: unknown, lineMap: Map<string, LlmSourceLine>) {
  if (!Array.isArray(value)) {
    return [];
  }

  const refs: Array<LlmEvidenceRef & { text: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || !isYoutubePublicTextSource(item.source) || typeof item.line_index !== "number") {
      continue;
    }

    const lineIndex = Math.trunc(item.line_index);
    const line = lineMap.get(`${item.source}:${lineIndex}`);
    if (!line) {
      continue;
    }

    const startMs = typeof item.start_ms === "number" ? Math.trunc(item.start_ms) : line.startMs;
    const endMs = typeof item.end_ms === "number"
      ? Math.trunc(item.end_ms)
      : line.startMs === null || line.durationMs === null
        ? null
        : line.startMs + line.durationMs;

    refs.push({
      source: item.source,
      line_index: lineIndex,
      start_ms: startMs,
      end_ms: endMs,
      text: line.text,
    });
  }

  return refs;
}

function normalizeLlmAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const amountMatch = value.trim().match(/[0-9]+\/[0-9]+|[0-9]+(?:[.,][0-9]+)?(?:\s*[~-]\s*[0-9]+(?:[.,][0-9]+)?)?/u);
  if (!amountMatch) {
    return null;
  }

  return parseRecipeAmount(amountMatch[0]);
}

function normalizeLlmOptionalText(value: unknown) {
  return typeof value === "string" ? collapseWhitespace(value) : "";
}

function isInvalidLlmIngredientName(name: string) {
  return !name
    || name.length > 60
    || /(?:구독|좋아요|댓글|시청|영상|제품|공구|링크|BGM|장비|엄마|남편|아이|루시|책|운동)/iu.test(name);
}

function hasLlmCookingAction(instruction: string) {
  return hasCookingAction(instruction)
    || /(?:채워|채우|담아|담고|담아요|말아|말고|감싸|묻히|묻혀|부쳐|부치|부친|맛을\s*내|간을\s*해|간해|재워|재우|펴|깔아|깔고|깐다|덮어|올리|올린|익히|익힌|섞어|무쳐|무치|무친|비벼|비비|비빈|다져|다지|다진|불려|불리|불린|헹궈|헹구|헹군|식혀|식히|식힌|마무리)/u
      .test(instruction)
    || GARNISH_STEP_SIGNAL_RE.test(instruction);
}

function isInvalidLlmStepInstruction(instruction: string) {
  return !instruction
    || instruction.length < 5
    || /(?:구독|좋아요|댓글|시청|멤버십|공구|제품 정보|BGM|책을 많이 읽|운동 다녀)/iu.test(instruction)
    || !hasLlmCookingAction(instruction);
}

function isContainerOnlyRecipeTitle(title: string) {
  return /^(?:새벽\s*)?\d?\s*(?:집밥|도시락|아침|점심|저녁|브이로그|vlog|routine|cook with me|meal prep|하루|기상)$/iu
    .test(title.trim());
}

interface LlmNormalizationOptions {
  ingredientQuantitySource?: YoutubeQuantitySource;
  ingredientQuantityEvidenceProvider?: string;
  ingredientQuantityReviewRequired?: boolean;
}

function buildVisualRecipeQuantityEvidenceRefs(
  evidenceRefs: Array<LlmEvidenceRef & { text: string }>,
  {
    provider,
    snippet,
  }: {
    provider: string;
    snippet: string;
  },
): YoutubeQuantityEvidenceRef[] {
  return evidenceRefs.map((ref) => ({
    source_method: "visual",
    source_provider: provider,
    line_index: ref.line_index,
    start_ms: ref.start_ms,
    end_ms: ref.end_ms,
    frame_ts_ms: ref.start_ms,
    snippet: snippet || ref.text,
    locator_hash: null,
  }));
}

function normalizeLlmIngredient(
  item: unknown,
  lineMap: Map<string, LlmSourceLine>,
  options: LlmNormalizationOptions = {},
): NormalizedLlmIngredient | null {
  if (!isRecord(item)) {
    return null;
  }

  const name = normalizeParsedIngredientName(normalizeLlmOptionalText(item.name));
  if (isInvalidLlmIngredientName(name)) {
    return null;
  }

  const evidenceRefs = normalizeLlmEvidenceRefs(item.evidence_refs, lineMap);
  if (evidenceRefs.length === 0) {
    return null;
  }

  const amount = normalizeLlmAmount(item.amount);
  const unit = normalizeNullableString(item.unit);
  const normalizedUnit = amount === null ? null : unit;
  const ingredientType = amount === null || !normalizedUnit ? "TO_TASTE" : "QUANT";
  const rawText = normalizeLlmOptionalText(item.raw_text) || evidenceRefs[0].text;
  const displayText = rawText || [name, amount, normalizedUnit].filter(Boolean).join(" ");
  const requestedQuantitySource = options.ingredientQuantitySource;
  const hasExplicitQuantityEvidence = ingredientType === "QUANT" || hasToTasteQuantityText(rawText);
  const quantitySource = requestedQuantitySource === "visual_explicit" && !hasExplicitQuantityEvidence
    ? undefined
    : requestedQuantitySource;

  return {
    ingredient: {
      name,
      amount: ingredientType === "QUANT" ? amount : null,
      unit: ingredientType === "QUANT" ? normalizedUnit : null,
      ingredientType,
      displayText,
      rawText,
      componentLabel: null,
      sourceLine: evidenceRefs[0].line_index,
      confidence: 0.82,
      flags: ["llm_structured"],
      scalable: ingredientType === "QUANT",
      quantitySource,
      quantityConfidence: quantitySource ? 0.82 : undefined,
      quantityRawText: quantitySource ? rawText : undefined,
      quantityEvidenceRefs: quantitySource === "visual_explicit"
        ? buildVisualRecipeQuantityEvidenceRefs(evidenceRefs, {
            provider: options.ingredientQuantityEvidenceProvider ?? VISUAL_RECIPE_EXTRACTOR_PROVIDER,
            snippet: rawText,
          })
        : undefined,
      quantityReviewRequired: quantitySource ? options.ingredientQuantityReviewRequired : undefined,
    },
    evidenceRefs,
  };
}

function normalizeLlmStep(
  item: unknown,
  lineMap: Map<string, LlmSourceLine>,
) {
  if (!isRecord(item)) {
    return null;
  }

  const instruction = cleanDescriptionItemText(normalizeLlmOptionalText(item.instruction));
  if (isInvalidLlmStepInstruction(instruction)) {
    return null;
  }

  const evidenceRefs = normalizeLlmEvidenceRefs(item.evidence_refs, lineMap);
  if (evidenceRefs.length === 0) {
    return null;
  }

  return {
    instruction,
    evidenceRefs,
    rawText: normalizeLlmOptionalText(item.raw_text) || evidenceRefs[0].text,
  };
}

function getLlmRecipeTimeRange(
  recipe: Record<string, unknown>,
  refs: Array<LlmEvidenceRef & { text: string }>,
) {
  const timeRange = isRecord(recipe.time_range) ? recipe.time_range : {};
  const explicitStart = typeof timeRange.start_ms === "number" ? Math.trunc(timeRange.start_ms) : null;
  const explicitEnd = typeof timeRange.end_ms === "number" ? Math.trunc(timeRange.end_ms) : null;
  const refStarts = refs
    .map((ref) => ref.start_ms)
    .filter((value): value is number => typeof value === "number");
  const refEnds = refs
    .map((ref) => ref.end_ms)
    .filter((value): value is number => typeof value === "number");

  return {
    startMs: explicitStart ?? (refStarts.length > 0 ? Math.min(...refStarts) : null),
    endMs: explicitEnd ?? (refEnds.length > 0 ? Math.max(...refEnds) : null),
  };
}

function normalizeLlmRecipe(
  item: unknown,
  index: number,
  lineMap: Map<string, LlmSourceLine>,
  videoTitle: string,
  options: LlmNormalizationOptions = {},
): YoutubeRawRecipeCandidate | null {
  if (!isRecord(item)) {
    return null;
  }

  const normalizedIngredients = Array.isArray(item.ingredients)
    ? item.ingredients
      .map((ingredient) => normalizeLlmIngredient(ingredient, lineMap, options))
      .filter((ingredient): ingredient is NormalizedLlmIngredient => ingredient !== null)
    : [];
  const ingredients = normalizedIngredients.map((ingredient) => ingredient.ingredient);
  const normalizedSteps = Array.isArray(item.steps)
    ? item.steps
      .map((step) => normalizeLlmStep(step, lineMap))
      .filter((step): step is NonNullable<ReturnType<typeof normalizeLlmStep>> => step !== null)
    : [];

  if (ingredients.length === 0 && normalizedSteps.length === 0) {
    return null;
  }

  const rawTitle = normalizeLlmOptionalText(item.title);
  const title = rawTitle && !isContainerOnlyRecipeTitle(rawTitle)
    ? rawTitle
    : normalizedIngredients[0]?.ingredient.name
      ? `${normalizedIngredients[0].ingredient.name} 요리`
      : `${videoTitle} 후보 ${index + 1}`;
  const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
    ? Math.max(0, Math.min(1, item.confidence))
    : 0.72;
  const warnings = Array.isArray(item.warnings)
    ? item.warnings
      .filter((warning): warning is string => typeof warning === "string")
      .map(collapseWhitespace)
      .filter(Boolean)
    : [];
  const evidenceRefs = [
    ...normalizedIngredients.flatMap((ingredient) => ingredient.evidenceRefs.map((ref) => ({
      source: ref.source,
      line_index: ref.line_index,
      start_ms: ref.start_ms,
      end_ms: ref.end_ms,
      text: ref.text,
    }))),
    ...normalizedSteps.flatMap((step) => step.evidenceRefs.map((ref) => ({
      source: ref.source,
      line_index: ref.line_index,
      start_ms: ref.start_ms,
      end_ms: ref.end_ms,
      text: ref.text,
    }))),
  ];
  const timeRange = getLlmRecipeTimeRange(
    item,
    normalizedSteps.flatMap((step) => step.evidenceRefs),
  );
  const blockingIssues = [
    ...(ingredients.length === 0 ? ["ingredients"] : []),
    ...(normalizedSteps.length === 0 ? ["steps"] : []),
  ];

  return {
    candidateId: `llm-${index + 1}`,
    title,
    startMs: timeRange.startMs,
    endMs: timeRange.endMs,
    confidence,
    draft: {
      ingredients,
      steps: normalizedSteps.map((step) => step.instruction),
      stepComponentLabels: normalizedSteps.map(() => null),
      draftWarnings: warnings,
      blockingIssues,
      includeIncompleteStepFallback: false,
      selectionOutcome: "selected_single_recipe",
    },
    evidenceRefs: evidenceRefs.filter((ref, refIndex, refs) =>
      refs.findIndex((candidate) =>
        candidate.source === ref.source
        && candidate.line_index === ref.line_index
        && candidate.text === ref.text,
      ) === refIndex,
    ),
  };
}

function parseLlmStructuredExtractionPayload(
  resultJson: unknown,
  sourceBlocks: LlmSourceBlock[],
  videoTitle: string,
  options: LlmNormalizationOptions = {},
) {
  if (!isRecord(resultJson) || !Array.isArray(resultJson.recipes)) {
    return [];
  }

  const lineMap = buildLlmSourceLineMap(sourceBlocks);

  return resultJson.recipes
    .slice(0, LLM_MAX_RECIPES)
    .map((recipe, index) => normalizeLlmRecipe(recipe, index, lineMap, videoTitle, options))
    .filter((recipe): recipe is YoutubeRawRecipeCandidate => recipe !== null);
}

function choosePrimarySourceFromCandidates(
  candidates: YoutubeRawRecipeCandidate[],
  fallback: YoutubePublicTextSource,
) {
  const sourceCounts = new Map<YoutubePublicTextSource, number>();

  for (const candidate of candidates) {
    for (const ref of candidate.evidenceRefs) {
      sourceCounts.set(ref.source, (sourceCounts.get(ref.source) ?? 0) + 1);
    }
  }

  return [...sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function buildLlmMultiRecipeExtraction(
  candidates: YoutubeRawRecipeCandidate[],
  sourceBlocks: LlmSourceBlock[],
): SelectedMultiRecipeExtraction | null {
  if (candidates.length < 2) {
    return null;
  }

  const fallbackSource = sourceBlocks[0]?.source ?? "description";
  const source = choosePrimarySourceFromCandidates(candidates, fallbackSource);
  const segments = sourceBlocks
    .filter((block) => block.source === source)
    .flatMap((block) => block.segments);

  return {
    source,
    candidates,
    segments,
  };
}

function buildLlmSingleRecipe(
  candidate: YoutubeRawRecipeCandidate | null,
  fallbackRecipe: ParsedRecipeDescription,
) {
  if (!candidate) {
    return fallbackRecipe;
  }

  return adaptFlatDraftRecipe(candidate.draft);
}

const CONVERSATIONAL_CAPTION_FRAGMENT_RE =
  /(?:뭐야|뭐\s|언제|이건|이거|그거|그래\s*가지고|그래야지|되거든|한면|(?:^|\s)아\s+|루시|구독|좋아요|댓글|공구|제품)/u;
const INCOMPLETE_CAPTION_TRAILING_RE = /(?:고|면|는|남은|수추|뭐)$/u;

function isNoisyParsedIngredientName(name: string) {
  const normalized = collapseWhitespace(name);

  return !normalized
    || normalized.length <= 1
    || normalized.length > 32
    || hasCookingAction(normalized)
    || /[?？.!。]/u.test(normalized)
    || /(?:습니다|주세요|합니다|됩니다|먹으면|넣어|섞어|썰어|올려|둘러)/u.test(normalized)
    || CONVERSATIONAL_CAPTION_FRAGMENT_RE.test(`${normalized} `)
    || /(?:^|\s)(?:좀|그냥|약간|많이|조금|언제)(?:\s|$)/u.test(normalized);
}

function isConversationalParsedStep(step: string) {
  const normalized = collapseWhitespace(step);

  return hasSemanticConversationalStepNoise(normalized)
    || hasConversationalFillerSignal(normalized)
    || /(?:이거\s*뭐|그\s*굴\s*뭐|돼\s*한면|좀\s*골고리|엄마|남편|아이)/u.test(normalized);
}

function hasBrokenCaptionStepNoise(step: string) {
  const normalized = collapseWhitespace(step);

  return /[?？]/u.test(normalized)
    || /(?:뭐야|뭐\s|언제|이건|그래\s*가지고|그래야지|되거든|한면|(?:^|\s)아\s+)/u.test(`${normalized} `)
    || /(?:이거\s*뭐|그\s*굴\s*뭐|돼\s*한면|좀\s*골고리)/u.test(normalized);
}

function hasSemanticConversationalStepNoise(step: string) {
  const normalized = collapseWhitespace(step);

  return hasBrokenCaptionStepNoise(normalized)
    || /(?:루시|구독|좋아요|댓글|공구|제품)/u.test(`${normalized} `)
    || /(?:엄마|남편|아이)/u.test(normalized);
}

function isWeakParsedStep(step: string) {
  const normalized = collapseWhitespace(step);

  return !normalized
    || normalized.length < 8
    || isConversationalParsedStep(normalized)
    || INCOMPLETE_CAPTION_TRAILING_RE.test(normalized)
    || !hasLlmCookingAction(normalized);
}

function evaluateParsedRecipeQuality(parsedRecipe: ParsedRecipeDescription): ParsedRecipeQualityMeta {
  const ingredientCount = parsedRecipe.ingredients.length;
  const stepCount = parsedRecipe.steps.length;
  const stepQualityResults = parsedRecipe.steps.map(evaluateStepTextQuality);
  const stepQualityFlags = [...new Set(stepQualityResults.flatMap((result) => result.flags))];
  const suppressedStepCount = stepQualityResults.filter((result) => result.suppress).length;
  const noisyIngredientCount = parsedRecipe.ingredients
    .filter((ingredient) => isNoisyParsedIngredientName(ingredient.name))
    .length;
  const weakStepCount = parsedRecipe.steps
    .filter((step, index) => isWeakParsedStep(step) || stepQualityResults[index]?.suppress === true)
    .length;
  const conversationalStepCount = parsedRecipe.steps
    .filter((step, index) =>
      isConversationalParsedStep(step) || stepQualityResults[index]?.flags.includes("conversational_filler"),
    )
    .length;
  const cookingActionStepCount = parsedRecipe.steps
    .filter((step) => hasLlmCookingAction(step))
    .length;
  const noisyIngredientRatio = ingredientCount === 0 ? 0 : noisyIngredientCount / ingredientCount;
  const weakStepRatio = stepCount === 0 ? 0 : weakStepCount / stepCount;
  const reasons: string[] = [];

  if (ingredientCount === 0) {
    reasons.push("missing_ingredients");
  } else if (noisyIngredientRatio >= 0.5) {
    reasons.push("noisy_ingredient_names");
  }

  if (stepCount === 0) {
    reasons.push("missing_steps");
  } else {
    if (cookingActionStepCount === 0) {
      reasons.push("steps_without_cooking_actions");
    }

    if (weakStepRatio >= 0.4 && weakStepCount >= 2) {
      reasons.push("weak_step_fragments");
    }

    if (conversationalStepCount >= 2) {
      reasons.push("conversational_step_fragments");
    }

    if (stepQualityFlags.includes("non_cooking_product_note")) {
      reasons.push("non_cooking_product_notes");
    }

    if (stepQualityFlags.includes("social_cta")) {
      reasons.push("social_cta_steps");
    }

    if (stepQualityFlags.includes("health_advice")) {
      reasons.push("health_advice_steps");
    }

    if (stepQualityFlags.includes("number_artifact")) {
      reasons.push("number_artifacts");
    }
  }

  const score = Math.max(
    0,
    Math.round(
      100
        - noisyIngredientRatio * 35
        - weakStepRatio * 40
        - Math.min(conversationalStepCount, 4) * 8
        - Math.min(suppressedStepCount, 4) * 12
        - (ingredientCount === 0 ? 20 : 0)
        - (stepCount === 0 ? 25 : 0),
    ),
  );
  const lowQuality = reasons.includes("missing_ingredients")
    || reasons.includes("missing_steps")
    || reasons.includes("noisy_ingredient_names")
    || reasons.includes("steps_without_cooking_actions")
    || reasons.includes("conversational_step_fragments")
    || reasons.includes("non_cooking_product_notes")
    || reasons.includes("social_cta_steps")
    || reasons.includes("health_advice_steps")
    || (reasons.includes("weak_step_fragments") && score < 75)
    || score < 50;

  return {
    low_quality: lowQuality,
    score,
    reasons,
    ingredient_count: ingredientCount,
    step_count: stepCount,
    noisy_ingredient_count: noisyIngredientCount,
    weak_step_count: weakStepCount,
    conversational_step_count: conversationalStepCount,
    cooking_action_step_count: cookingActionStepCount,
    suppressed_step_count: suppressedStepCount,
    step_quality_flags: stepQualityFlags,
  };
}

function shouldSuppressLowQualityParsedRecipe(parserQuality: ParsedRecipeQualityMeta) {
  return parserQuality.low_quality
    && (
      parserQuality.reasons.includes("noisy_ingredient_names")
      || parserQuality.reasons.includes("weak_step_fragments")
      || parserQuality.reasons.includes("conversational_step_fragments")
      || parserQuality.reasons.includes("non_cooking_product_notes")
      || parserQuality.reasons.includes("social_cta_steps")
      || parserQuality.reasons.includes("health_advice_steps")
      || parserQuality.reasons.includes("steps_without_cooking_actions")
    );
}

function sanitizeParsedRecipeSteps(parsedRecipe: ParsedRecipeDescription) {
  const steps: string[] = [];
  const stepComponentLabels: Array<string | null> = [];

  parsedRecipe.steps.forEach((step, index) => {
    const quality = evaluateStepTextQuality(step);

    if (quality.suppress) {
      return;
    }

    const cleanText = quality.cleanText;
    if (!cleanText) {
      return;
    }

    steps.push(cleanText);
    stepComponentLabels.push(parsedRecipe.stepComponentLabels[index] ?? null);
  });

  return { steps, stepComponentLabels };
}

function buildReviewNeededParsedRecipe(
  parsedRecipe: ParsedRecipeDescription,
  parserQuality: ParsedRecipeQualityMeta,
): ParsedRecipeDescription {
  const suppressIngredients = parserQuality.reasons.includes("noisy_ingredient_names");
  const suppressSteps = parserQuality.reasons.includes("weak_step_fragments")
    || parserQuality.reasons.includes("conversational_step_fragments")
    || parserQuality.reasons.includes("non_cooking_product_notes")
    || parserQuality.reasons.includes("social_cta_steps")
    || parserQuality.reasons.includes("health_advice_steps")
    || parserQuality.reasons.includes("steps_without_cooking_actions");
  const sanitizedSteps = sanitizeParsedRecipeSteps(parsedRecipe);
  const useSanitizedSteps = sanitizedSteps.steps.length > 0
    && sanitizedSteps.steps.length < parsedRecipe.steps.length;
  const hasNonConversationalHardStepNoise = parserQuality.reasons.includes("non_cooking_product_notes")
    || parserQuality.reasons.includes("social_cta_steps")
    || parserQuality.reasons.includes("health_advice_steps")
    || parserQuality.reasons.includes("steps_without_cooking_actions");
  const hasBrokenCaptionNoise = sanitizedSteps.steps.some((step) =>
    hasBrokenCaptionStepNoise(step),
  );
  const sanitizedCookingStepCount = sanitizedSteps.steps.filter((step) => hasLlmCookingAction(step)).length;
  const hasUsableSanitizedSteps = sanitizedSteps.steps.length > 0
    && sanitizedCookingStepCount > 0
    && (
      sanitizedSteps.steps.length <= 2
      || sanitizedCookingStepCount / sanitizedSteps.steps.length >= 0.5
    );
  const preserveStructurallyUsableSteps = hasUsableSanitizedSteps
    && (!hasNonConversationalHardStepNoise || useSanitizedSteps)
    && !hasBrokenCaptionNoise;
  const finalSteps = suppressSteps
    ? (preserveStructurallyUsableSteps ? sanitizedSteps.steps : [])
    : sanitizedSteps.steps;
  const finalStepComponentLabels = suppressSteps
    ? (preserveStructurallyUsableSteps ? sanitizedSteps.stepComponentLabels : [])
    : sanitizedSteps.stepComponentLabels;

  return {
    ingredients: suppressIngredients ? [] : parsedRecipe.ingredients,
    steps: finalSteps,
    stepComponentLabels: finalStepComponentLabels,
  };
}

function buildParsedRecipeAfterUnavailableLlm(
  parsedRecipe: ParsedRecipeDescription,
  parserQuality: ParsedRecipeQualityMeta,
  sourceKinds: string[],
) {
  void sourceKinds;

  return shouldSuppressLowQualityParsedRecipe(parserQuality)
    ? buildReviewNeededParsedRecipe(parsedRecipe, parserQuality)
    : parsedRecipe;
}

function isLlmParserSuppression(meta: LlmExtractorMeta) {
  return meta.attempted
    && meta.parser_quality !== null
    && shouldSuppressLowQualityParsedRecipe(meta.parser_quality);
}

function shouldAttemptLlmFallback({
  parserQuality,
  multiRecipeExtraction,
  sourceBlocks,
}: {
  parserQuality: ParsedRecipeQualityMeta;
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
  sourceBlocks: LlmSourceBlock[];
}) {
  const hasMissingCore = parserQuality.reasons.includes("missing_ingredients")
    || parserQuality.reasons.includes("missing_steps");

  return !multiRecipeExtraction
    && sourceBlocks.length > 0
    && (hasMissingCore || parserQuality.low_quality);
}

async function resolveLlmStructuredFallback({
  video,
  parsedRecipe,
  parsedUrl,
  dbClient,
  userId,
  sourceBlocks,
  multiRecipeExtraction,
}: {
  video: YoutubeProviderVideo;
  parsedRecipe: ParsedRecipeDescription;
  parsedUrl: { youtubeUrl: string; videoId: string };
  dbClient: DbClient;
  userId: string;
  sourceBlocks: LlmSourceBlock[];
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
}): Promise<LlmFallbackResult> {
  const config = getLlmExtractionConfig();
  const sourceKinds = sourceBlocks.map((block) => block.source);
  const sourceSegmentsSummary = sourceBlocks.map((block) => summarizeSourceSegments(block.segments));
  const parserQuality = evaluateParsedRecipeQuality(parsedRecipe);
  const notNeededMeta = buildLlmExtractorMeta({
    attempted: false,
    schemaVersion: config?.schemaVersion ?? DEFAULT_LLM_SCHEMA_VERSION,
    status: "not_needed",
    sourceKinds,
    parserQuality,
  });

  if (!shouldAttemptLlmFallback({ parserQuality, multiRecipeExtraction, sourceBlocks })) {
    return {
      recipe: parsedRecipe,
      usedLlm: false,
      multiRecipeExtraction: null,
      meta: notNeededMeta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  if (!config) {
    const meta = buildLlmExtractorMeta({
      attempted: true,
      provider: GEMINI_LLM_PROVIDER,
      schemaVersion: DEFAULT_LLM_SCHEMA_VERSION,
      status: "disabled",
      reason: "gemini_disabled",
      sourceKinds,
      parserQuality,
    });
    await recordLlmExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: null,
      cacheHit: false,
      status: "skipped",
      reason: "gemini_disabled",
    });

    return {
      recipe: buildParsedRecipeAfterUnavailableLlm(parsedRecipe, parserQuality, sourceKinds),
      usedLlm: false,
      multiRecipeExtraction: null,
      meta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  const sourceHash = buildLlmSourceHash(sourceBlocks, config.schemaVersion);
  const cached = await readLlmExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    sourceHash,
    schemaVersion: config.schemaVersion,
    models: [config.primaryModel, config.fallbackModel],
  });

  if (cached) {
    const candidates = parseLlmStructuredExtractionPayload(cached.result_json, sourceBlocks, video.title);
    if (candidates.length > 0) {
      const llmMultiRecipeExtraction = buildLlmMultiRecipeExtraction(candidates, sourceBlocks);
      const meta = buildLlmExtractorMeta({
        attempted: true,
        provider: GEMINI_LLM_PROVIDER,
        model: cached.model,
        fallbackModel: config.fallbackModel,
        schemaVersion: config.schemaVersion,
        status: "cache_hit",
        cacheHit: true,
        recipeCount: candidates.length,
        sourceKinds,
        parserQuality,
      });
      await recordLlmExtractionEvent(dbClient, {
        userId,
        videoId: parsedUrl.videoId,
        model: cached.model,
        cacheHit: true,
        status: "success",
      });

      return {
        recipe: llmMultiRecipeExtraction ? parsedRecipe : buildLlmSingleRecipe(candidates[0] ?? null, parsedRecipe),
        usedLlm: true,
        multiRecipeExtraction: llmMultiRecipeExtraction,
        meta,
        sourceProviders: buildLlmSourceProviders(meta),
        extractionMethods: sourceKindsToExtractionMethods(sourceKinds),
        sourceSegmentsSummary,
      };
    }
  }

  const allowed = await canUseLlmExtractor(dbClient, userId, config);
  if (!allowed) {
    const meta = buildLlmExtractorMeta({
      attempted: true,
      provider: GEMINI_LLM_PROVIDER,
      model: config.primaryModel,
      fallbackModel: config.fallbackModel,
      schemaVersion: config.schemaVersion,
      status: "unavailable",
      reason: "llm_daily_limit_exceeded",
      sourceKinds,
      parserQuality,
    });
    await recordLlmExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.primaryModel,
      cacheHit: false,
      status: "skipped",
      reason: "llm_daily_limit_exceeded",
    });

    return {
      recipe: buildParsedRecipeAfterUnavailableLlm(parsedRecipe, parserQuality, sourceKinds),
      usedLlm: false,
      multiRecipeExtraction: null,
      meta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  const extractor = getYoutubeRecipeLlmExtractor();
  let extractorResult: YoutubeRecipeLlmExtractorResult;
  try {
    extractorResult = await extractor.fetchStructuredRecipe({
      videoId: parsedUrl.videoId,
      youtubeUrl: parsedUrl.youtubeUrl,
      title: video.title,
      channel: video.channel,
      sourceBlocks,
      schemaVersion: config.schemaVersion,
      primaryModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      timeoutMs: config.timeoutMs,
    });
  } catch (error) {
    const meta = buildLlmExtractorMeta({
      attempted: true,
      provider: GEMINI_LLM_PROVIDER,
      model: config.primaryModel,
      fallbackModel: config.fallbackModel,
      schemaVersion: config.schemaVersion,
      status: "error",
      reason: error instanceof Error ? error.message : "llm_provider_error",
      sourceKinds,
      parserQuality,
    });
    await recordLlmExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.primaryModel,
      cacheHit: false,
      status: "error",
      reason: meta.reason,
    });

    return {
      recipe: buildParsedRecipeAfterUnavailableLlm(parsedRecipe, parserQuality, sourceKinds),
      usedLlm: false,
      multiRecipeExtraction: null,
      meta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  if (extractorResult.status !== "available" || !extractorResult.resultJson) {
    const meta = buildLlmExtractorMeta({
      attempted: true,
      provider: extractorResult.providerName ?? GEMINI_LLM_PROVIDER,
      model: extractorResult.model ?? config.primaryModel,
      fallbackModel: extractorResult.fallbackModel ?? config.fallbackModel,
      schemaVersion: config.schemaVersion,
      status: extractorResult.status === "error" ? "error" : "unavailable",
      retryCount: extractorResult.retryCount ?? 0,
      fallbackUsed: extractorResult.fallbackUsed ?? false,
      inputTokens: extractorResult.inputTokens ?? 0,
      outputTokens: extractorResult.outputTokens ?? 0,
      reason: extractorResult.reason ?? "llm_unavailable",
      sourceKinds,
      parserQuality,
    });
    await recordLlmExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: meta.model,
      cacheHit: false,
      status: meta.status === "error" ? "error" : "unavailable",
      reason: meta.reason,
      inputTokens: meta.input_tokens,
      outputTokens: meta.output_tokens,
    });

    return {
      recipe: buildParsedRecipeAfterUnavailableLlm(parsedRecipe, parserQuality, sourceKinds),
      usedLlm: false,
      multiRecipeExtraction: null,
      meta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  const candidates = parseLlmStructuredExtractionPayload(extractorResult.resultJson, sourceBlocks, video.title);
  if (candidates.length === 0) {
    const meta = buildLlmExtractorMeta({
      attempted: true,
      provider: extractorResult.providerName ?? GEMINI_LLM_PROVIDER,
      model: extractorResult.model ?? config.primaryModel,
      fallbackModel: extractorResult.fallbackModel ?? config.fallbackModel,
      schemaVersion: config.schemaVersion,
      status: "invalid_result",
      retryCount: extractorResult.retryCount ?? 0,
      fallbackUsed: extractorResult.fallbackUsed ?? false,
      inputTokens: extractorResult.inputTokens ?? 0,
      outputTokens: extractorResult.outputTokens ?? 0,
      reason: "llm_result_without_valid_evidence",
      sourceKinds,
      parserQuality,
    });
    await recordLlmExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: meta.model,
      cacheHit: false,
      status: "unavailable",
      reason: meta.reason,
      inputTokens: meta.input_tokens,
      outputTokens: meta.output_tokens,
    });

    return {
      recipe: buildParsedRecipeAfterUnavailableLlm(parsedRecipe, parserQuality, sourceKinds),
      usedLlm: false,
      multiRecipeExtraction: null,
      meta,
      sourceProviders: [],
      extractionMethods: [],
      sourceSegmentsSummary,
    };
  }

  await writeLlmExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    sourceHash,
    schemaVersion: config.schemaVersion,
    model: extractorResult.model ?? config.primaryModel,
    sourceKinds,
    resultJson: extractorResult.resultJson,
  });
  const llmMultiRecipeExtraction = buildLlmMultiRecipeExtraction(candidates, sourceBlocks);
  const meta = buildLlmExtractorMeta({
    attempted: true,
    provider: extractorResult.providerName ?? GEMINI_LLM_PROVIDER,
    model: extractorResult.model ?? config.primaryModel,
    fallbackModel: extractorResult.fallbackModel ?? config.fallbackModel,
    schemaVersion: config.schemaVersion,
    status: "used",
    retryCount: extractorResult.retryCount ?? 0,
    fallbackUsed: extractorResult.fallbackUsed ?? false,
    inputTokens: extractorResult.inputTokens ?? 0,
    outputTokens: extractorResult.outputTokens ?? 0,
    recipeCount: candidates.length,
    sourceKinds,
    parserQuality,
  });
  await recordLlmExtractionEvent(dbClient, {
    userId,
    videoId: parsedUrl.videoId,
    model: meta.model,
    cacheHit: false,
    status: "success",
    inputTokens: meta.input_tokens,
    outputTokens: meta.output_tokens,
  });

  return {
    recipe: llmMultiRecipeExtraction ? parsedRecipe : buildLlmSingleRecipe(candidates[0] ?? null, parsedRecipe),
    usedLlm: true,
    multiRecipeExtraction: llmMultiRecipeExtraction,
    meta,
    sourceProviders: buildLlmSourceProviders(meta),
    extractionMethods: sourceKindsToExtractionMethods(sourceKinds),
    sourceSegmentsSummary,
  };
}

function buildVisualRecipeSourceProviders(meta: VisualRecipeExtractorMeta) {
  if (!meta.attempted || (meta.status !== "used" && meta.status !== "cache_hit")) {
    return [];
  }

  return [
    meta.cache_hit ? VISUAL_RECIPE_EXTRACTOR_CACHE_PROVIDER : VISUAL_RECIPE_EXTRACTOR_PROVIDER,
  ];
}

function hasSparseVisualRecipeText(
  recipe: ParsedRecipeDescription,
  sourceBlocks: LlmSourceBlock[],
) {
  const hasCaptionSource = sourceBlocks.some((block) => block.source === "caption" || block.source === "transcript");
  const hasDenseDescriptionOrComment = sourceBlocks.some((block) =>
    (block.source === "description" || block.source === "comment")
    && block.segments.length >= 8,
  );

  return hasCaptionSource
    && !hasDenseDescriptionOrComment
    && (
      recipe.ingredients.length < VISUAL_RECIPE_SPARSE_TEXT_MIN_INGREDIENTS
      || recipe.steps.length < VISUAL_RECIPE_SPARSE_TEXT_MIN_STEPS
    );
}

function getVisualRecipeTriggerReason({
  recipe,
  parserQuality,
  sourceBlocks,
}: {
  recipe: ParsedRecipeDescription;
  parserQuality: ParsedRecipeQualityMeta;
  sourceBlocks: LlmSourceBlock[];
}) {
  if (recipe.ingredients.length === 0 || recipe.steps.length === 0) {
    return "missing_core_recipe_fields";
  }

  if (parserQuality.low_quality) {
    return "low_quality_text_recipe";
  }

  if (
    process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED === "true"
    && hasSparseVisualRecipeText(recipe, sourceBlocks)
  ) {
    return "sparse_text_recipe";
  }

  return null;
}

function shouldAttemptVisualRecipeFallback({
  recipe,
  sourceBlocks,
  multiRecipeExtraction,
}: {
  recipe: ParsedRecipeDescription;
  sourceBlocks: LlmSourceBlock[];
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
}) {
  if (multiRecipeExtraction || sourceBlocks.length === 0) {
    return null;
  }

  const parserQuality = evaluateParsedRecipeQuality(recipe);
  return getVisualRecipeTriggerReason({ recipe, parserQuality, sourceBlocks });
}

function buildVisualRecipeRequestHash({
  sourceBlocks,
  schemaVersion,
}: {
  sourceBlocks: LlmSourceBlock[];
  schemaVersion: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion,
      mode: "visual_recipe",
      sources: sourceBlocks.map((block) => ({
        source: block.source,
        text: block.text,
      })),
    }))
    .digest("hex");
}

function normalizeVisualRecipeSourceLine(
  item: unknown,
  index: number,
): LlmSourceLine | null {
  if (!isRecord(item)) {
    return null;
  }

  const text = normalizeLlmOptionalText(item.text);
  if (!text) {
    return null;
  }

  const startMs = typeof item.start_ms === "number"
    ? Math.trunc(item.start_ms)
    : typeof item.frame_ts_ms === "number"
      ? Math.trunc(item.frame_ts_ms)
      : null;
  const endMs = typeof item.end_ms === "number" ? Math.trunc(item.end_ms) : null;

  return {
    source: "caption",
    lineIndex: typeof item.line_index === "number" ? Math.trunc(item.line_index) : index,
    text,
    startMs,
    durationMs: startMs === null || endMs === null ? null : Math.max(0, endMs - startMs),
    language: null,
    trackKind: "unknown",
  };
}

function buildVisualRecipeSourceBlock(resultJson: unknown): LlmSourceBlock | null {
  if (!isRecord(resultJson) || !Array.isArray(resultJson.visual_source_lines)) {
    return null;
  }

  const usedIndexes = new Set<number>();
  const segments = resultJson.visual_source_lines
    .map(normalizeVisualRecipeSourceLine)
    .filter((line): line is LlmSourceLine => line !== null)
    .filter((line, index) => {
      if (usedIndexes.has(line.lineIndex)) {
        line.lineIndex = index;
      }

      usedIndexes.add(line.lineIndex);
      return true;
    })
    .slice(0, LLM_MAX_SOURCE_LINES);

  if (segments.length === 0) {
    return null;
  }

  return {
    source: "caption",
    text: joinSegmentText(segments),
    segments,
  };
}

function normalizeVisualRecipeEvidenceRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((ref) => {
    if (!isRecord(ref)) {
      return ref;
    }

    return {
      ...ref,
      source: ref.source === "visual" ? "caption" : ref.source,
    };
  });
}

function normalizeVisualRecipeResultJson(resultJson: unknown) {
  if (!isRecord(resultJson) || !Array.isArray(resultJson.recipes)) {
    return resultJson;
  }

  return {
    ...resultJson,
    recipes: resultJson.recipes.map((recipe) => {
      if (!isRecord(recipe)) {
        return recipe;
      }

      return {
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((ingredient) =>
              isRecord(ingredient)
                ? {
                    ...ingredient,
                    evidence_refs: normalizeVisualRecipeEvidenceRefs(ingredient.evidence_refs),
                  }
                : ingredient,
            )
          : recipe.ingredients,
        steps: Array.isArray(recipe.steps)
          ? recipe.steps.map((step) =>
              isRecord(step)
                ? {
                    ...step,
                    evidence_refs: normalizeVisualRecipeEvidenceRefs(step.evidence_refs),
                  }
                : step,
            )
          : recipe.steps,
      };
    }),
  };
}

function parseVisualRecipeExtractionPayload(
  resultJson: unknown,
  sourceBlocks: LlmSourceBlock[],
  videoTitle: string,
) {
  const visualSourceBlock = buildVisualRecipeSourceBlock(resultJson);
  if (!visualSourceBlock) {
    return {
      candidates: [],
      visualSourceBlock: null,
    };
  }

  const normalizedResultJson = normalizeVisualRecipeResultJson(resultJson);
  const candidates = parseLlmStructuredExtractionPayload(
    normalizedResultJson,
    [...sourceBlocks, visualSourceBlock],
    videoTitle,
    {
      ingredientQuantitySource: "visual_explicit",
      ingredientQuantityEvidenceProvider: VISUAL_RECIPE_EXTRACTOR_PROVIDER,
      ingredientQuantityReviewRequired: true,
    },
  );

  return { candidates, visualSourceBlock };
}

function isVisualRecipeCandidateBetter(
  candidate: YoutubeRawRecipeCandidate | null,
  currentRecipe: ParsedRecipeDescription,
) {
  if (!candidate) {
    return false;
  }

  const visualRecipe = adaptFlatDraftRecipe(candidate.draft);
  const visualQuality = evaluateParsedRecipeQuality(visualRecipe);
  if (visualQuality.low_quality) {
    return false;
  }

  if (currentRecipe.ingredients.length === 0 || currentRecipe.steps.length === 0) {
    return visualRecipe.ingredients.length > 0 && visualRecipe.steps.length > 0;
  }

  const ingredientGain = visualRecipe.ingredients.length - currentRecipe.ingredients.length;
  const stepGain = visualRecipe.steps.length - currentRecipe.steps.length;

  return (
    visualRecipe.ingredients.length >= VISUAL_RECIPE_SPARSE_TEXT_MIN_INGREDIENTS
    && visualRecipe.steps.length >= VISUAL_RECIPE_SPARSE_TEXT_MIN_STEPS
    && (ingredientGain >= 2 || stepGain >= 2)
  );
}

function buildVisualRecipeRawSourceText(visualSourceBlock: LlmSourceBlock | null) {
  if (!visualSourceBlock) {
    return null;
  }

  return [
    "--- visual recipe evidence ---",
    ...visualSourceBlock.segments.map((segment) => segment.text),
  ].join("\n");
}

async function resolveVisualRecipeFallback({
  video,
  parsedRecipe,
  parsedUrl,
  dbClient,
  userId,
  sourceBlocks,
  multiRecipeExtraction,
}: {
  video: YoutubeProviderVideo;
  parsedRecipe: ParsedRecipeDescription;
  parsedUrl: { youtubeUrl: string; videoId: string };
  dbClient: DbClient;
  userId: string;
  sourceBlocks: LlmSourceBlock[];
  multiRecipeExtraction: SelectedMultiRecipeExtraction | null;
}): Promise<VisualRecipeFallbackResult> {
  const config = getVisualRecipeExtractionConfig();
  const contractAligned = config?.contractAligned
    ?? process.env.YOUTUBE_RECIPE_VISUAL_RECIPE_CONTRACT_ALIGNED === "true";
  const triggerReason = shouldAttemptVisualRecipeFallback({ recipe: parsedRecipe, sourceBlocks, multiRecipeExtraction });
  const notNeededMeta = buildVisualRecipeExtractorMeta({
    attempted: false,
    schemaVersion: config?.schemaVersion ?? DEFAULT_VISUAL_RECIPE_SCHEMA_VERSION,
    contractAligned,
    status: "not_needed",
    triggerReason,
  });
  const notUsedResult = {
    recipe: parsedRecipe,
    usedVisualRecipe: false,
    multiRecipeExtraction: null,
    meta: notNeededMeta,
    sourceProviders: [],
    extractionMethods: [],
    sourceSegmentsSummary: [],
    rawSourceText: null,
  };

  if (!triggerReason) {
    return notUsedResult;
  }

  if (!config) {
    return {
      ...notUsedResult,
      meta: buildVisualRecipeExtractorMeta({
        attempted: true,
        provider: GEMINI_LLM_PROVIDER,
        schemaVersion: DEFAULT_VISUAL_RECIPE_SCHEMA_VERSION,
        contractAligned,
        status: "disabled",
        triggerReason,
        reason: contractAligned ? "gemini_visual_recipe_disabled" : "visual_recipe_contract_unaligned",
      }),
    };
  }

  const visualRequestHash = buildVisualRecipeRequestHash({
    sourceBlocks,
    schemaVersion: config.schemaVersion,
  });
  const cached = await readVisualQuantityExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    visualRequestHash,
    schemaVersion: config.schemaVersion,
    provider: config.provider,
  });

  if (cached) {
    const { candidates, visualSourceBlock } = parseVisualRecipeExtractionPayload(
      cached.result_json,
      sourceBlocks,
      video.title,
    );
    const llmMultiRecipeExtraction = buildLlmMultiRecipeExtraction(candidates, visualSourceBlock ? [visualSourceBlock] : sourceBlocks);
    const useSingleCandidate = !llmMultiRecipeExtraction && isVisualRecipeCandidateBetter(candidates[0] ?? null, parsedRecipe);
    const status = llmMultiRecipeExtraction || useSingleCandidate ? "cache_hit" : "invalid_result";
    const meta = buildVisualRecipeExtractorMeta({
      attempted: true,
      provider: cached.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      contractAligned,
      status,
      cacheHit: true,
      triggerReason,
      recipeCount: candidates.length,
      visualSourceLineCount: visualSourceBlock?.segments.length ?? 0,
      reason: status === "invalid_result" ? "visual_recipe_result_not_better" : null,
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: true,
      eventType: "cache_hit",
      status: status === "invalid_result" ? "unavailable" : "success",
      reason: meta.reason,
    });

    return {
      recipe: useSingleCandidate ? buildLlmSingleRecipe(candidates[0] ?? null, parsedRecipe) : parsedRecipe,
      usedVisualRecipe: llmMultiRecipeExtraction !== null || useSingleCandidate,
      multiRecipeExtraction: llmMultiRecipeExtraction,
      meta,
      sourceProviders: buildVisualRecipeSourceProviders(meta),
      extractionMethods: sourceKindsToExtractionMethods([...sourceBlocks.map((block) => block.source), "caption"]),
      sourceSegmentsSummary: visualSourceBlock ? [summarizeSourceSegments(visualSourceBlock.segments)] : [],
      rawSourceText: buildVisualRecipeRawSourceText(visualSourceBlock),
    };
  }

  const allowed = await canUseVisualQuantityExtractor(dbClient, userId, config);
  if (!allowed) {
    const meta = buildVisualRecipeExtractorMeta({
      attempted: true,
      provider: config.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      contractAligned,
      status: "unavailable",
      triggerReason,
      reason: "visual_recipe_daily_limit_exceeded",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: false,
      eventType: "quota_denied",
      status: "skipped",
      reason: meta.reason,
    });

    return { ...notUsedResult, meta };
  }

  const extractor = getYoutubeVisualRecipeExtractor();
  let extractorResult: YoutubeVisualRecipeExtractorResult;
  try {
    extractorResult = await extractor.fetchVisualRecipe({
      videoId: parsedUrl.videoId,
      youtubeUrl: parsedUrl.youtubeUrl,
      title: video.title,
      channel: video.channel,
      sourceBlocks,
      schemaVersion: config.schemaVersion,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
  } catch (error) {
    const meta = buildVisualRecipeExtractorMeta({
      attempted: true,
      provider: config.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      contractAligned,
      status: "error",
      triggerReason,
      reason: error instanceof Error ? error.message : "visual_recipe_provider_error",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: false,
      eventType: "error",
      status: "error",
      reason: meta.reason,
    });

    return { ...notUsedResult, meta };
  }

  if (extractorResult.status !== "available" || !extractorResult.resultJson) {
    const meta = buildVisualRecipeExtractorMeta({
      attempted: true,
      provider: extractorResult.providerName ?? config.provider,
      model: extractorResult.model ?? config.model,
      schemaVersion: config.schemaVersion,
      contractAligned,
      status: extractorResult.status === "error" ? "error" : "unavailable",
      triggerReason,
      inputTokens: extractorResult.inputTokens ?? 0,
      outputTokens: extractorResult.outputTokens ?? 0,
      reason: extractorResult.reason ?? "visual_recipe_unavailable",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: meta.model,
      cacheHit: false,
      eventType: meta.status === "error" ? "error" : "attempted",
      status: meta.status === "error" ? "error" : "unavailable",
      reason: meta.reason,
      inputTokens: meta.input_tokens,
      outputTokens: meta.output_tokens,
    });

    return { ...notUsedResult, meta };
  }

  const { candidates, visualSourceBlock } = parseVisualRecipeExtractionPayload(
    extractorResult.resultJson,
    sourceBlocks,
    video.title,
  );
  await writeVisualQuantityExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    provider: extractorResult.providerName ?? config.provider,
    schemaVersion: config.schemaVersion,
    visualRequestHash,
    resultJson: extractorResult.resultJson,
  });

  const llmMultiRecipeExtraction = buildLlmMultiRecipeExtraction(candidates, visualSourceBlock ? [visualSourceBlock] : sourceBlocks);
  const useSingleCandidate = !llmMultiRecipeExtraction && isVisualRecipeCandidateBetter(candidates[0] ?? null, parsedRecipe);
  const status = llmMultiRecipeExtraction || useSingleCandidate ? "used" : "invalid_result";
  const meta = buildVisualRecipeExtractorMeta({
    attempted: true,
    provider: extractorResult.providerName ?? config.provider,
    model: extractorResult.model ?? config.model,
    schemaVersion: config.schemaVersion,
    contractAligned,
    status,
    triggerReason,
    recipeCount: candidates.length,
    visualSourceLineCount: visualSourceBlock?.segments.length ?? 0,
    inputTokens: extractorResult.inputTokens ?? 0,
    outputTokens: extractorResult.outputTokens ?? 0,
    reason: status === "invalid_result" ? "visual_recipe_result_not_better" : null,
  });
  await recordVisualQuantityExtractionEvent(dbClient, {
    userId,
    videoId: parsedUrl.videoId,
    model: meta.model,
    cacheHit: false,
    eventType: status === "used" ? "success" : "attempted",
    status: status === "used" ? "success" : "unavailable",
    reason: meta.reason,
    inputTokens: meta.input_tokens,
    outputTokens: meta.output_tokens,
  });

  return {
    recipe: useSingleCandidate ? buildLlmSingleRecipe(candidates[0] ?? null, parsedRecipe) : parsedRecipe,
    usedVisualRecipe: llmMultiRecipeExtraction !== null || useSingleCandidate,
    multiRecipeExtraction: llmMultiRecipeExtraction,
    meta,
    sourceProviders: buildVisualRecipeSourceProviders(meta),
    extractionMethods: sourceKindsToExtractionMethods([...sourceBlocks.map((block) => block.source), "caption"]),
    sourceSegmentsSummary: visualSourceBlock ? [summarizeSourceSegments(visualSourceBlock.segments)] : [],
    rawSourceText: buildVisualRecipeRawSourceText(visualSourceBlock),
  };
}

function buildVisualQuantitySourceProviders(meta: VisualQuantityExtractorMeta) {
  if (!meta.attempted || (meta.status !== "used" && meta.status !== "cache_hit")) {
    return [];
  }

  return [
    meta.cache_hit ? VISUAL_QUANTITY_EXTRACTOR_CACHE_PROVIDER : VISUAL_QUANTITY_EXTRACTOR_PROVIDER,
  ];
}

function buildQuantityEnrichmentSummary(meta: VisualQuantityExtractorMeta) {
  return {
    provider: meta.provider,
    cache_hit: meta.cache_hit,
    trigger_reason: meta.trigger_reason,
    enriched_count: meta.enriched_count,
    review_required_count: meta.review_required_count,
    schema_version: meta.schema_version,
    status: meta.status,
  };
}

function hasVisualQuantityGap(ingredient: YoutubeExtractedIngredient) {
  return ingredient.quantity_source === "unknown"
    || ingredient.quantity_source === undefined
    || (ingredient.ingredient_type === "QUANT" && (ingredient.amount === null || !ingredient.unit));
}

function buildVisualQuantityExtractorIngredients(
  ingredients: YoutubeExtractedIngredient[],
): YoutubeVisualQuantityExtractorIngredient[] {
  return ingredients.filter(hasVisualQuantityGap).map((ingredient) => ({
    draft_ingredient_id: ingredient.draft_ingredient_id,
    ingredient_id: ingredient.ingredient_id,
    standard_name: ingredient.standard_name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredient_type: ingredient.ingredient_type,
    display_text: ingredient.display_text,
    quantity_source: ingredient.quantity_source ?? "unknown",
    quantity_raw_text: ingredient.quantity_raw_text ?? ingredient.raw_text ?? null,
  }));
}

function normalizeQuantitySource(value: unknown): YoutubeQuantitySource | null {
  if (
    value === "text_explicit"
    || value === "visual_explicit"
    || value === "unit_normalized"
    || value === "ingredient_default"
    || value === "recipe_inferred"
    || value === "user_entered"
    || value === "unknown"
  ) {
    return value;
  }

  return null;
}

function normalizeVisualEvidenceRefs(value: unknown): YoutubeQuantityEvidenceRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): YoutubeQuantityEvidenceRef | null => {
      if (!isRecord(item)) {
        return null;
      }

      const sourceMethod = normalizeNullableString(item.source_method);
      if (sourceMethod !== "visual" && sourceMethod !== "visual_explicit") {
        return null;
      }

      const snippet = normalizeLlmOptionalText(item.snippet);
      if (!snippet) {
        return null;
      }

      return {
        source_method: "visual",
        source_provider: typeof item.source_provider === "string" && item.source_provider.trim()
          ? item.source_provider.trim()
          : VISUAL_QUANTITY_EXTRACTOR_PROVIDER,
        start_ms: typeof item.start_ms === "number" ? Math.trunc(item.start_ms) : null,
        end_ms: typeof item.end_ms === "number" ? Math.trunc(item.end_ms) : null,
        frame_ts_ms: typeof item.frame_ts_ms === "number" ? Math.trunc(item.frame_ts_ms) : null,
        snippet,
        locator_hash: normalizeNullableString(item.locator_hash),
      };
    })
    .filter((ref): ref is YoutubeQuantityEvidenceRef => ref !== null);
}

function inferVisualQuantityUnitFromText({
  standardName,
  rawText,
  amount,
}: {
  standardName: string;
  rawText: string;
  amount: number | null;
}) {
  if (amount === null || !/[0-9]/u.test(rawText)) {
    return null;
  }

  const normalizedRawText = rawText.trim();
  const compactName = standardName.replace(/\s+/gu, "");

  if (/종이\s*컵/u.test(normalizedRawText)) return "종이컵";
  if (/작은\s*술|티스푼|tsp|\bt\b/u.test(normalizedRawText)) return "작은술";
  if (/큰\s*술|밥\s*숟가락|스푼|tbsp|\bT\b/u.test(normalizedRawText)) return "스푼";
  if (/줌/u.test(normalizedRawText)) return "줌";
  if (/모/u.test(normalizedRawText)) return "모";
  if (/대/u.test(normalizedRawText)) return "대";
  if (/개/u.test(normalizedRawText)) return "개";
  if (/ml|㎖/iu.test(normalizedRawText)) return "ml";
  if (/g|그램/iu.test(normalizedRawText)) return "g";

  if (/(?:양파|무|배추|당근|오이|감자|고구마|토마토|레몬|두부)$/u.test(compactName)) {
    return "개";
  }

  if (/(?:간장|고춧가루|가루|소스|마늘|알룰로스|오일|기름|참기름|들기름|설탕|소금|후추|깨|통깨|식초|맛술|액젓)/u
    .test(compactName)) {
    return "스푼";
  }

  return null;
}

function normalizeVisualQuantityUnit(
  unit: string | null,
  rawText: string,
  standardName: string,
  amount: number | null,
) {
  const inferredUnit = inferVisualQuantityUnitFromText({ standardName, rawText, amount });
  if (!unit) {
    return inferredUnit;
  }

  const normalizedUnit = unit.trim();
  const normalizedRawText = rawText.trim();
  const loweredUnit = normalizedUnit.toLowerCase();

  if (/종이\s*컵/u.test(normalizedRawText)) return "종이컵";
  if (/작은\s*술|티스푼|tsp|\bt\b/u.test(normalizedRawText)) return "작은술";
  if (/큰\s*술|밥\s*숟가락|스푼|tbsp|\bT\b/u.test(normalizedRawText)) return "큰술";
  if (/줌/u.test(normalizedRawText)) return "줌";
  if (/모/u.test(normalizedRawText)) return "모";
  if (/대/u.test(normalizedRawText)) return "대";
  if (/개/u.test(normalizedRawText)) return "개";
  if (/ml|㎖/iu.test(normalizedRawText)) return "ml";
  if (/g|그램|㎎|kg/iu.test(normalizedRawText)) return loweredUnit === "gram" ? "g" : normalizedUnit;

  if (["spoon", "tbsp", "tablespoon", "tbs", "t"].includes(loweredUnit)) return "큰술";
  if (["tsp", "teaspoon"].includes(loweredUnit)) return "작은술";
  if (["piece", "pieces", "ea", "count"].includes(loweredUnit)) return "개";
  if (["handful", "handfuls"].includes(loweredUnit)) return "줌";
  if (["cup", "cups"].includes(loweredUnit)) return "컵";
  if (["gram", "grams"].includes(loweredUnit)) return "g";
  if (["milliliter", "milliliters"].includes(loweredUnit)) return "ml";

  return normalizedUnit || inferredUnit;
}

function buildVisualQuantityDisplayText({
  rawDisplayText,
  standardName,
  amount,
  unit,
}: {
  rawDisplayText: string | null;
  standardName: string;
  amount: number | null;
  unit: string | null;
}) {
  if (rawDisplayText && (!unit || rawDisplayText.includes(unit))) {
    return rawDisplayText;
  }

  if (amount !== null && unit) {
    return `${standardName} ${amount}${unit}`;
  }

  return rawDisplayText ?? standardName;
}

interface VisualQuantitySuggestion {
  draftIngredientId: string | null;
  standardName: string;
  amount: number | null;
  unit: string | null;
  ingredientType: "QUANT" | "TO_TASTE";
  displayText: string | null;
  quantitySource: Exclude<YoutubeQuantitySource, "text_explicit" | "user_entered" | "unknown">;
  quantityConfidence: number | null;
  quantityRawText: string | null;
  quantityEvidenceRefs: YoutubeQuantityEvidenceRef[];
}

function normalizeVisualQuantitySuggestion(item: unknown): VisualQuantitySuggestion | null {
  if (!isRecord(item)) {
    return null;
  }

  const quantitySource = normalizeQuantitySource(item.quantity_source);
  if (
    quantitySource !== "visual_explicit"
    && quantitySource !== "unit_normalized"
    && quantitySource !== "ingredient_default"
    && quantitySource !== "recipe_inferred"
  ) {
    return null;
  }

  const evidenceRefs = normalizeVisualEvidenceRefs(item.quantity_evidence_refs);
  if (evidenceRefs.length === 0) {
    return null;
  }

  const amount = typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0
    ? item.amount
    : null;
  const evidenceRawText = normalizeNullableString(item.quantity_raw_text)
    ?? evidenceRefs[0].snippet;
  const standardName = normalizeParsedIngredientName(normalizeLlmOptionalText(item.standard_name));
  if (!standardName) {
    return null;
  }

  const unit = normalizeVisualQuantityUnit(
    normalizeNullableString(item.unit),
    evidenceRawText,
    standardName,
    amount,
  );
  if (quantitySource === "visual_explicit" && amount === null && !hasToTasteQuantityText(evidenceRawText)) {
    return null;
  }
  if (quantitySource === "recipe_inferred" && (amount === null || !unit)) {
    return null;
  }
  const ingredientType = quantitySource === "recipe_inferred"
    ? "QUANT"
    : item.ingredient_type === "TO_TASTE" || amount === null || !unit
      ? "TO_TASTE"
      : "QUANT";
  if (ingredientType === "QUANT" && (amount === null || !unit)) {
    return null;
  }

  return {
    draftIngredientId: typeof item.draft_ingredient_id === "string" && isUuid(item.draft_ingredient_id)
      ? item.draft_ingredient_id
      : null,
    standardName,
    amount: ingredientType === "QUANT" ? amount : null,
    unit: ingredientType === "QUANT" ? unit : null,
    ingredientType,
    displayText: buildVisualQuantityDisplayText({
      rawDisplayText: normalizeNullableString(item.display_text),
      standardName,
      amount: ingredientType === "QUANT" ? amount : null,
      unit: ingredientType === "QUANT" ? unit : null,
    }),
    quantitySource,
    quantityConfidence: typeof item.quantity_confidence === "number"
      ? Math.max(0, Math.min(1, item.quantity_confidence))
      : null,
    quantityRawText: evidenceRawText,
    quantityEvidenceRefs: evidenceRefs,
  };
}

function parseVisualQuantitySuggestions(payload: unknown) {
  if (!isRecord(payload)) {
    return [];
  }

  const items = Array.isArray(payload.ingredient_quantities)
    ? payload.ingredient_quantities
    : Array.isArray(payload.quantities)
      ? payload.quantities
      : [];

  return items
    .map(normalizeVisualQuantitySuggestion)
    .filter((suggestion): suggestion is VisualQuantitySuggestion => suggestion !== null);
}

function normalizeVisualIngredientKey(name: string) {
  return normalizeParsedIngredientName(name)
    .replace(/\s+/gu, "")
    .replace(/^다진(?=마늘)/u, "")
    .toLowerCase();
}

function isAppendableVisualQuantitySuggestion(suggestion: VisualQuantitySuggestion) {
  if (suggestion.ingredientType !== "QUANT" || suggestion.amount === null || !suggestion.unit) {
    return false;
  }

  if (
    suggestion.quantitySource === "visual_explicit"
    || suggestion.quantitySource === "unit_normalized"
  ) {
    return (suggestion.quantityConfidence ?? 0.7) >= 0.55;
  }

  return suggestion.quantitySource === "recipe_inferred"
    && (suggestion.quantityConfidence ?? 0.4) >= 0.3;
}

function inferRecipeInferredFallbackQuantity(ingredient: YoutubeExtractedIngredient): {
  amount: number;
  unit: string;
  confidence: number;
  reason: string;
} | null {
  const key = normalizeVisualIngredientKey(ingredient.standard_name);
  if (!key) {
    return null;
  }

  if (/후추|후춧가루|흑후추/u.test(key)) {
    return { amount: 0.25, unit: "작은술", confidence: 0.28, reason: "seasoning_default" };
  }
  if (/소금|맛소금/u.test(key)) {
    return { amount: 0.25, unit: "작은술", confidence: 0.28, reason: "seasoning_default" };
  }
  if (/올리브오일|오일|기름|식용유/u.test(key)) {
    return { amount: 1, unit: "큰술", confidence: 0.32, reason: "oil_default" };
  }
  if (/토마토소스/u.test(key)) {
    return { amount: 200, unit: "g", confidence: 0.32, reason: "sauce_base_default" };
  }
  if (/소스/u.test(key)) {
    return { amount: 2, unit: "큰술", confidence: 0.3, reason: "sauce_default" };
  }
  if (/다진고기|간고기|다짐육/u.test(key)) {
    return { amount: 100, unit: "g", confidence: 0.3, reason: "meat_base_default" };
  }
  if (/치즈/u.test(key)) {
    return { amount: 50, unit: "g", confidence: 0.3, reason: "cheese_default" };
  }
  if (/양파/u.test(key)) {
    return { amount: 0.5, unit: "개", confidence: 0.3, reason: "vegetable_base_default" };
  }
  if (/애호박|가지/u.test(key)) {
    return { amount: 1, unit: "개", confidence: 0.32, reason: "vegetable_count_default" };
  }
  if (/토마토/u.test(key)) {
    return { amount: 2, unit: "개", confidence: 0.32, reason: "vegetable_count_default" };
  }

  return null;
}

function applyRecipeInferredFallbackQuantities(ingredients: YoutubeExtractedIngredient[]) {
  let enrichedCount = 0;
  const enrichedIngredients = ingredients.map((ingredient) => {
    if (!hasVisualQuantityGap(ingredient)) {
      return ingredient;
    }

    const fallback = inferRecipeInferredFallbackQuantity(ingredient);
    if (!fallback) {
      return ingredient;
    }

    enrichedCount += 1;
    const evidenceSnippet = collapseWhitespace(
      ingredient.quantity_raw_text
      ?? ingredient.raw_text
      ?? ingredient.display_text
      ?? ingredient.standard_name,
    ) || ingredient.standard_name;
    const displayText = `${ingredient.standard_name} ${fallback.amount}${fallback.unit}`;

    return {
      ...ingredient,
      amount: fallback.amount,
      unit: fallback.unit,
      ingredient_type: "QUANT" as const,
      display_text: displayText,
      scalable: true,
      quantity_source: "recipe_inferred" as const,
      quantity_confidence: fallback.confidence,
      quantity_raw_text: `${evidenceSnippet} (${fallback.reason})`,
      quantity_evidence_refs: [
        {
          source_method: "visual" as const,
          source_provider: `${VISUAL_QUANTITY_EXTRACTOR_PROVIDER}_fallback`,
          line_index: null,
          start_ms: null,
          end_ms: null,
          frame_ts_ms: null,
          snippet: evidenceSnippet,
          locator_hash: null,
        },
      ],
      quantity_review_required: true,
      quantity_user_confirmed: false,
    };
  });

  return { ingredients: enrichedIngredients, enrichedCount };
}

function collectAppendableVisualSuggestionNames(
  ingredients: YoutubeExtractedIngredient[],
  suggestions: VisualQuantitySuggestion[],
) {
  const existingKeys = new Set(ingredients.map((ingredient) =>
    normalizeVisualIngredientKey(ingredient.standard_name),
  ));
  const names: string[] = [];

  for (const suggestion of suggestions) {
    if (!isAppendableVisualQuantitySuggestion(suggestion)) {
      continue;
    }

    const key = normalizeVisualIngredientKey(suggestion.standardName);
    if (!key || existingKeys.has(key) || names.some((name) => normalizeVisualIngredientKey(name) === key)) {
      continue;
    }

    names.push(suggestion.standardName);
  }

  return names;
}

async function resolveVisualSuggestionIngredientMatches(
  dbClient: DbClient,
  ingredients: YoutubeExtractedIngredient[],
  suggestions: VisualQuantitySuggestion[],
) {
  const names = collectAppendableVisualSuggestionNames(ingredients, suggestions);
  if (names.length === 0) {
    return new Map<string, Map<string, IngredientMatch>>();
  }

  const lookup = await findIngredientIds(dbClient, names);
  return lookup.error ? new Map<string, Map<string, IngredientMatch>>() : lookup.matchesByName;
}

function buildVisualSuggestionIngredient(
  suggestion: VisualQuantitySuggestion,
  matchesByName: IngredientMatchesByName,
  sortOrder: number,
): YoutubeExtractedIngredient {
  const displayText = suggestion.displayText
    ?? buildVisualQuantityDisplayText({
      rawDisplayText: suggestion.quantityRawText,
      standardName: suggestion.standardName,
      amount: suggestion.amount,
      unit: suggestion.unit,
    });
  const rawText = suggestion.quantityRawText ?? displayText;

  return {
    ...buildExtractedIngredient({
      matchesByName,
      name: suggestion.standardName,
      amount: suggestion.amount,
      unit: suggestion.unit,
      ingredientType: suggestion.ingredientType,
      displayText,
      sortOrder,
      scalable: suggestion.ingredientType === "QUANT",
      confidence: suggestion.quantityConfidence ?? 0.72,
      rawText,
    }),
    quantity_source: suggestion.quantitySource,
    quantity_confidence: suggestion.quantityConfidence,
    quantity_raw_text: rawText,
    quantity_evidence_refs: suggestion.quantityEvidenceRefs,
    quantity_review_required: true,
    quantity_user_confirmed: false,
  };
}

function appendVisualQuantitySuggestions({
  ingredients,
  suggestions,
  usedSuggestionIndexes,
  matchesByName,
}: {
  ingredients: YoutubeExtractedIngredient[];
  suggestions: VisualQuantitySuggestion[];
  usedSuggestionIndexes: Set<number>;
  matchesByName: IngredientMatchesByName;
}) {
  const ingredientsWithAppends = [...ingredients];
  const existingKeys = new Set(ingredientsWithAppends.map((ingredient) =>
    normalizeVisualIngredientKey(ingredient.standard_name),
  ));
  let appendedCount = 0;

  suggestions.forEach((suggestion, index) => {
    if (usedSuggestionIndexes.has(index) || !isAppendableVisualQuantitySuggestion(suggestion)) {
      return;
    }

    const key = normalizeVisualIngredientKey(suggestion.standardName);
    if (!key || existingKeys.has(key)) {
      return;
    }

    ingredientsWithAppends.push(buildVisualSuggestionIngredient(
      suggestion,
      matchesByName,
      ingredientsWithAppends.length + 1,
    ));
    existingKeys.add(key);
    usedSuggestionIndexes.add(index);
    appendedCount += 1;
  });

  return { ingredients: ingredientsWithAppends, appendedCount };
}

function applyVisualQuantitySuggestions(
  ingredients: YoutubeExtractedIngredient[],
  suggestions: VisualQuantitySuggestion[],
  {
    appendMissing = false,
    matchesByName = new Map<string, Map<string, IngredientMatch>>(),
  }: {
    appendMissing?: boolean;
    matchesByName?: IngredientMatchesByName;
  } = {},
) {
  const usedSuggestionIndexes = new Set<number>();
  let enrichedCount = 0;

  const enrichedIngredients = ingredients.map((ingredient) => {
    if (!hasVisualQuantityGap(ingredient)) {
      return ingredient;
    }

    const suggestionIndex = suggestions.findIndex((suggestion, index) => {
      if (usedSuggestionIndexes.has(index)) {
        return false;
      }

      if (suggestion.draftIngredientId) {
        return suggestion.draftIngredientId === ingredient.draft_ingredient_id;
      }

      return suggestion.standardName === ingredient.standard_name;
    });

    if (suggestionIndex === -1) {
      return ingredient;
    }

    const suggestion = suggestions[suggestionIndex];
    usedSuggestionIndexes.add(suggestionIndex);
    enrichedCount += 1;

    return {
      ...ingredient,
      amount: suggestion.amount,
      unit: suggestion.unit,
      ingredient_type: suggestion.ingredientType,
      display_text: suggestion.displayText,
      scalable: suggestion.ingredientType === "QUANT",
      quantity_source: suggestion.quantitySource,
      quantity_confidence: suggestion.quantityConfidence,
      quantity_raw_text: suggestion.quantityRawText,
      quantity_evidence_refs: suggestion.quantityEvidenceRefs,
      quantity_review_required: true,
      quantity_user_confirmed: false,
    };
  });

  const fallbackResult = applyRecipeInferredFallbackQuantities(enrichedIngredients);
  const totalEnrichedCount = enrichedCount + fallbackResult.enrichedCount;

  if (!appendMissing) {
    return { ingredients: fallbackResult.ingredients, enrichedCount: totalEnrichedCount, appendedCount: 0 };
  }

  const appendResult = appendVisualQuantitySuggestions({
    ingredients: fallbackResult.ingredients,
    suggestions,
    usedSuggestionIndexes,
    matchesByName,
  });

  return {
    ingredients: appendResult.ingredients,
    enrichedCount: totalEnrichedCount + appendResult.appendedCount,
    appendedCount: appendResult.appendedCount,
  };
}

function countQuantityReviewRequired(ingredients: YoutubeExtractedIngredient[]) {
  return ingredients.filter((ingredient) => ingredient.quantity_review_required === true).length;
}

function mergeVisualQuantityIntoCandidates(
  candidates: YoutubeRecipeCandidate[],
  suggestions: VisualQuantitySuggestion[],
) {
  let enrichedCount = 0;
  const enrichedCandidates = candidates.map((candidate) => {
    const result = applyVisualQuantitySuggestions(candidate.ingredients, suggestions);
    enrichedCount += result.enrichedCount;
    return {
      ...candidate,
      ingredients: result.ingredients,
    };
  });

  return { candidates: enrichedCandidates, enrichedCount };
}

async function resolveVisualQuantityEnrichment({
  dbClient,
  userId,
  video,
  parsedUrl,
  ingredients,
  candidates = [],
}: {
  dbClient: DbClient;
  userId: string;
  video: YoutubeProviderVideo;
  parsedUrl: ParsedYoutubeUrl;
  ingredients: YoutubeExtractedIngredient[];
  candidates?: YoutubeRecipeCandidate[];
}) {
  const candidateIngredients = candidates.flatMap((candidate) => candidate.ingredients);
  const allIngredients = [...ingredients, ...candidateIngredients];
  const gapIngredients = allIngredients.filter(hasVisualQuantityGap);
  const notNeededMeta = buildVisualQuantityExtractorMeta({
    attempted: false,
    status: "not_needed",
    triggerReason: "no_quantity_gap",
  });

  if (gapIngredients.length === 0) {
    return {
      ingredients,
      candidates,
      meta: notNeededMeta,
      sourceProviders: [],
    };
  }

  const config = getVisualQuantityExtractionConfig();
  if (!config) {
    return {
      ingredients,
      candidates,
      meta: buildVisualQuantityExtractorMeta({
        attempted: true,
        provider: GEMINI_LLM_PROVIDER,
        status: "disabled",
        reason: "gemini_visual_disabled",
        triggerReason: "quantity_gap",
      }),
      sourceProviders: [],
    };
  }

  const visualRequestHash = buildVisualQuantityRequestHash({
    ingredients: gapIngredients,
    schemaVersion: config.schemaVersion,
  });
  const cached = await readVisualQuantityExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    visualRequestHash,
    schemaVersion: config.schemaVersion,
    provider: config.provider,
  });

  if (cached) {
    const suggestions = parseVisualQuantitySuggestions(cached.result_json);
    const suggestionMatches = ingredients.length > 0
      ? await resolveVisualSuggestionIngredientMatches(dbClient, ingredients, suggestions)
      : new Map<string, Map<string, IngredientMatch>>();
    const ingredientResult = applyVisualQuantitySuggestions(ingredients, suggestions, {
      appendMissing: ingredients.length > 0,
      matchesByName: suggestionMatches,
    });
    const candidateResult = mergeVisualQuantityIntoCandidates(candidates, suggestions);
    const allEnriched = [...ingredientResult.ingredients, ...candidateResult.candidates.flatMap((candidate) => candidate.ingredients)];
    const enrichedCount = ingredientResult.enrichedCount + candidateResult.enrichedCount;
    const meta = buildVisualQuantityExtractorMeta({
      attempted: true,
      provider: cached.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      status: enrichedCount > 0 ? "cache_hit" : "invalid_result",
      cacheHit: true,
      triggerReason: "quantity_gap",
      enrichedCount,
      reviewRequiredCount: countQuantityReviewRequired(allEnriched),
      reason: enrichedCount > 0 ? null : "visual_result_without_valid_evidence",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: true,
      eventType: "cache_hit",
      status: enrichedCount > 0 ? "success" : "unavailable",
      reason: meta.reason,
    });

    return {
      ingredients: ingredientResult.ingredients,
      candidates: candidateResult.candidates,
      meta,
      sourceProviders: buildVisualQuantitySourceProviders(meta),
    };
  }

  const allowed = await canUseVisualQuantityExtractor(dbClient, userId, config);
  if (!allowed) {
    const meta = buildVisualQuantityExtractorMeta({
      attempted: true,
      provider: config.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      status: "unavailable",
      triggerReason: "quantity_gap",
      reason: "visual_quantity_daily_limit_exceeded",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: false,
      eventType: "quota_denied",
      status: "skipped",
      reason: meta.reason,
    });

    return {
      ingredients,
      candidates,
      meta,
      sourceProviders: [],
    };
  }

  const extractor = getYoutubeVisualQuantityExtractor();
  let extractorResult: YoutubeVisualQuantityExtractorResult;
  try {
    extractorResult = await extractor.fetchVisualQuantities({
      videoId: parsedUrl.videoId,
      youtubeUrl: parsedUrl.youtubeUrl,
      title: video.title,
      channel: video.channel,
      ingredients: buildVisualQuantityExtractorIngredients(gapIngredients),
      schemaVersion: config.schemaVersion,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
  } catch (error) {
    const meta = buildVisualQuantityExtractorMeta({
      attempted: true,
      provider: config.provider,
      model: config.model,
      schemaVersion: config.schemaVersion,
      status: "error",
      triggerReason: "quantity_gap",
      reason: error instanceof Error ? error.message : "visual_quantity_provider_error",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: config.model,
      cacheHit: false,
      eventType: "error",
      status: "error",
      reason: meta.reason,
    });

    return { ingredients, candidates, meta, sourceProviders: [] };
  }

  if (extractorResult.status !== "available" || !extractorResult.resultJson) {
    const meta = buildVisualQuantityExtractorMeta({
      attempted: true,
      provider: extractorResult.providerName ?? config.provider,
      model: extractorResult.model ?? config.model,
      schemaVersion: config.schemaVersion,
      status: extractorResult.status === "error" ? "error" : "unavailable",
      triggerReason: "quantity_gap",
      inputTokens: extractorResult.inputTokens ?? 0,
      outputTokens: extractorResult.outputTokens ?? 0,
      reason: extractorResult.reason ?? "visual_quantity_unavailable",
    });
    await recordVisualQuantityExtractionEvent(dbClient, {
      userId,
      videoId: parsedUrl.videoId,
      model: meta.model,
      cacheHit: false,
      eventType: meta.status === "error" ? "error" : "attempted",
      status: meta.status === "error" ? "error" : "unavailable",
      reason: meta.reason,
      inputTokens: meta.input_tokens,
      outputTokens: meta.output_tokens,
    });

    return { ingredients, candidates, meta, sourceProviders: [] };
  }

  const suggestions = parseVisualQuantitySuggestions(extractorResult.resultJson);
  await writeVisualQuantityExtractionCache(dbClient, {
    videoId: parsedUrl.videoId,
    provider: extractorResult.providerName ?? config.provider,
    schemaVersion: config.schemaVersion,
    visualRequestHash,
    resultJson: extractorResult.resultJson,
  });

  const suggestionMatches = ingredients.length > 0
    ? await resolveVisualSuggestionIngredientMatches(dbClient, ingredients, suggestions)
    : new Map<string, Map<string, IngredientMatch>>();
  const ingredientResult = applyVisualQuantitySuggestions(ingredients, suggestions, {
    appendMissing: ingredients.length > 0,
    matchesByName: suggestionMatches,
  });
  const candidateResult = mergeVisualQuantityIntoCandidates(candidates, suggestions);
  const allEnriched = [...ingredientResult.ingredients, ...candidateResult.candidates.flatMap((candidate) => candidate.ingredients)];
  const enrichedCount = ingredientResult.enrichedCount + candidateResult.enrichedCount;
  const meta = buildVisualQuantityExtractorMeta({
    attempted: true,
    provider: extractorResult.providerName ?? config.provider,
    model: extractorResult.model ?? config.model,
    schemaVersion: config.schemaVersion,
    status: enrichedCount > 0 ? "used" : "invalid_result",
    triggerReason: "quantity_gap",
    enrichedCount,
    reviewRequiredCount: countQuantityReviewRequired(allEnriched),
    inputTokens: extractorResult.inputTokens ?? 0,
    outputTokens: extractorResult.outputTokens ?? 0,
    reason: enrichedCount > 0 ? null : "visual_result_without_valid_evidence",
  });
  await recordVisualQuantityExtractionEvent(dbClient, {
    userId,
    videoId: parsedUrl.videoId,
    model: meta.model,
    cacheHit: false,
    eventType: meta.status === "used" ? "success" : "attempted",
    status: meta.status === "used" ? "success" : "unavailable",
    reason: meta.reason,
    inputTokens: meta.input_tokens,
    outputTokens: meta.output_tokens,
  });

  return {
    ingredients: ingredientResult.ingredients,
    candidates: candidateResult.candidates,
    meta,
    sourceProviders: buildVisualQuantitySourceProviders(meta),
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

  if (/(끓|삶|졸|조려|조리듯)/u.test(normalized)) {
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

function hasToTasteQuantityText(value: string) {
  return /(?:약간|조금|적당량|취향껏|한\s*꼬집|한꼬집|넉넉히|살짝)/u.test(value);
}

function inferInitialQuantitySource({
  amount,
  unit,
  rawText,
  displayText,
}: {
  amount: number | null;
  unit: string | null;
  rawText: string;
  displayText: string;
}): YoutubeQuantitySource {
  if (amount !== null && unit) {
    return "text_explicit";
  }

  if (hasToTasteQuantityText(`${rawText}\n${displayText}`)) {
    return "text_explicit";
  }

  return "unknown";
}

function buildInitialQuantityEvidenceRef({
  rawText,
  displayText,
}: {
  rawText: string;
  displayText: string;
}): YoutubeQuantityEvidenceRef[] {
  const snippet = collapseWhitespace(rawText || displayText);
  if (!snippet) {
    return [];
  }

  return [{
    source_method: "description",
    source_provider: "public_text_parser",
    line_index: null,
    start_ms: null,
    end_ms: null,
    snippet,
  }];
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
  quantitySourceOverride,
  quantityConfidenceOverride,
  quantityRawTextOverride,
  quantityEvidenceRefsOverride,
  quantityReviewRequiredOverride,
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
  quantitySourceOverride?: YoutubeQuantitySource;
  quantityConfidenceOverride?: number | null;
  quantityRawTextOverride?: string | null;
  quantityEvidenceRefsOverride?: YoutubeQuantityEvidenceRef[];
  quantityReviewRequiredOverride?: boolean;
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
  const resolutionStatus: YoutubeIngredientResolutionStatus = resolvedMatch
      ? "resolved"
      : hasMatch
        ? "needs_review"
        : "unresolved";
  const quantitySource = quantitySourceOverride ?? inferInitialQuantitySource({ amount, unit, rawText, displayText });
  const quantityEvidenceRefs = quantityEvidenceRefsOverride ?? (quantitySource === "text_explicit"
    ? buildInitialQuantityEvidenceRef({ rawText, displayText })
    : []);
  const quantityConfidence = quantityConfidenceOverride
    ?? (quantitySource === "text_explicit" ? confidence : null);
  const quantityRawText = quantityRawTextOverride
    ?? (quantitySource === "text_explicit" ? rawText || displayText : null);
  const quantityReviewRequired = quantityReviewRequiredOverride
    ?? (quantitySource === "recipe_inferred");

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
    quantity_source: quantitySource,
    quantity_confidence: quantityConfidence,
    quantity_raw_text: quantityRawText,
    quantity_evidence_refs: quantityEvidenceRefs,
    quantity_review_required: quantityReviewRequired,
    quantity_user_confirmed: false,
  };
}

function buildExtractedIngredients(
  matchesByName: IngredientMatchesByName,
  parsedIngredients: ParsedDescriptionIngredient[],
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
      quantitySourceOverride: ingredient.quantitySource,
      quantityConfidenceOverride: ingredient.quantityConfidence,
      quantityRawTextOverride: ingredient.quantityRawText,
      quantityEvidenceRefsOverride: ingredient.quantityEvidenceRefs,
      quantityReviewRequiredOverride: ingredient.quantityReviewRequired,
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

function isYoutubeQuantityConfirmationStatus(value: unknown): value is YoutubeQuantityConfirmationStatus {
  return value === "not_required"
    || value === "confirmed_suggestion"
    || value === "edited_quantity"
    || value === "cleared_to_taste";
}

function normalizeQuantityConfirmationStatus(value: unknown): YoutubeQuantityConfirmationStatus {
  return isYoutubeQuantityConfirmationStatus(value) ? value : "not_required";
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
  let rawSourceText = buildRawSourceText(
    video.description,
    authorCommentFallback.rawAuthorCommentText,
    transcriptFallback.rawTranscriptText,
  );
  const sourceBlocks = buildLlmSourceBlocks({
    descriptionText: video.description,
    authorCommentText: authorCommentFallback.rawAuthorCommentText,
    transcriptText: transcriptFallback.availableTranscriptText ?? transcriptFallback.rawTranscriptText,
    transcriptSegments: transcriptFallback.availableTranscriptSegments.length > 0
      ? transcriptFallback.availableTranscriptSegments
      : transcriptFallback.rawTranscriptSegments,
  });
  const deterministicMultiRecipeExtraction = selectMultiRecipeExtraction({
    video,
    descriptionText: video.description,
    authorCommentText: authorCommentFallback.rawAuthorCommentText,
    transcriptText: transcriptFallback.rawTranscriptText,
    transcriptSegments: transcriptFallback.rawTranscriptSegments,
  });
  const llmFallback = await resolveLlmStructuredFallback({
    video,
    parsedRecipe: transcriptFallback.recipe,
    parsedUrl,
    dbClient,
    userId: user.id,
    sourceBlocks,
    multiRecipeExtraction: deterministicMultiRecipeExtraction,
  });
  const visualRecipeFallback = await resolveVisualRecipeFallback({
    video,
    parsedRecipe: llmFallback.recipe,
    parsedUrl,
    dbClient,
    userId: user.id,
    sourceBlocks,
    multiRecipeExtraction: deterministicMultiRecipeExtraction ?? llmFallback.multiRecipeExtraction,
  });
  const finalParsedRecipe = visualRecipeFallback.recipe;
  const multiRecipeExtraction = deterministicMultiRecipeExtraction
    ?? llmFallback.multiRecipeExtraction
    ?? visualRecipeFallback.multiRecipeExtraction;
  if (llmFallback.usedLlm && !transcriptFallback.rawTranscriptText && transcriptFallback.availableTranscriptText) {
    rawSourceText = buildRawSourceText(
      video.description,
      authorCommentFallback.rawAuthorCommentText,
      transcriptFallback.availableTranscriptText,
    );
  }
  if (visualRecipeFallback.usedVisualRecipe && visualRecipeFallback.rawSourceText) {
    rawSourceText = [rawSourceText, visualRecipeFallback.rawSourceText]
      .filter((text) => text && text.trim())
      .join("\n\n");
  }

  if (multiRecipeExtraction) {
    const candidateBuild = await buildExtractedRecipeCandidates({
      dbClient,
      rawCandidates: multiRecipeExtraction.candidates,
    });

    if (candidateBuild.error) {
      return fail("INTERNAL_ERROR", "다중 레시피 후보를 만들지 못했어요.", 500);
    }

    const visualQuantityEnrichment = await resolveVisualQuantityEnrichment({
      dbClient,
      userId: user.id,
      video,
      parsedUrl,
      ingredients: [],
      candidates: candidateBuild.candidates,
    });
    const recipeCandidates = visualQuantityEnrichment.candidates;
    const extractionId = crypto.randomUUID();
    const extractionMethod = candidateSourceToExtractionMethod(multiRecipeExtraction.source);
    const extractionMethods = [
      ...(llmFallback.usedLlm && llmFallback.extractionMethods.length > 0
        ? llmFallback.extractionMethods
        : [extractionMethod]),
      ...visualRecipeFallback.extractionMethods,
    ].filter((method, index, methods) => methods.indexOf(method) === index);
    const usesDescriptionSource = extractionMethods.includes(DEFAULT_EXTRACTION_METHODS[0]);
    const usesCommentSource = extractionMethods.includes(COMMENT_EXTRACTION_METHOD);
    const usesCaptionSource = extractionMethods.includes(CAPTION_EXTRACTION_METHOD);
    const sourceProviders = [
      "youtube_videos_list",
      ...(usesDescriptionSource ? ["description_parser"] : []),
      ...(usesCommentSource
        ? ["youtube_comment_threads", "comment_filter", "comment_parser"]
        : []),
      ...(usesCaptionSource
        ? buildTranscriptSourceProviders(transcriptFallback.meta)
        : []),
      ...(llmFallback.usedLlm ? llmFallback.sourceProviders : ["multi_recipe_candidate_parser"]),
      ...visualRecipeFallback.sourceProviders,
      ...visualQuantityEnrichment.sourceProviders,
    ];
    const sourceSegmentsSummary: YoutubeSourceSegmentsSummary[] = [
      ...(llmFallback.usedLlm && llmFallback.sourceSegmentsSummary.length > 0
        ? llmFallback.sourceSegmentsSummary
        : [summarizeSourceSegments(multiRecipeExtraction.segments)]),
      ...visualRecipeFallback.sourceSegmentsSummary,
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
      ingredients: recipeCandidates.flatMap((candidate) => candidate.ingredients),
      steps: recipeCandidates.flatMap((candidate) => candidate.steps),
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
      primary_candidate_id: recipeCandidates[0]?.candidate_id ?? null,
      caption_source: extractionMethod === CAPTION_EXTRACTION_METHOD ? "server_timedtext" : "none",
      source_segments_summary: sourceSegmentsSummary,
      recipe_candidates: recipeCandidates,
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
        llm_extractor: llmFallback.meta,
        visual_recipe_extractor: visualRecipeFallback.meta,
        visual_quantity_extractor: visualQuantityEnrichment.meta,
        quantity_enrichment_summary: buildQuantityEnrichmentSummary(visualQuantityEnrichment.meta),
        multi_recipe_status: data.multi_recipe_status,
        primary_candidate_id: data.primary_candidate_id,
        candidate_count: recipeCandidates.length,
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
      buildMultiRecipeCandidateRows(extractionId, recipeCandidates),
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

  const extractedIngredients = buildExtractedIngredients(ingredientLookup.matchesByName, finalParsedRecipe.ingredients);
  const visualQuantityEnrichment = await resolveVisualQuantityEnrichment({
    dbClient,
    userId: user.id,
    video,
    parsedUrl,
    ingredients: extractedIngredients,
  });
  const ingredients = visualQuantityEnrichment.ingredients;
  const suppressIncompleteStepFallback = isLlmParserSuppression(llmFallback.meta);
  const steps = buildExtractedSteps(
    finalParsedRecipe.steps,
    cookingMethodResult.methods,
    cookingMethodResult.fallbackMethod,
    {
      includeIncompleteFallback: llmFallback.usedLlm || suppressIncompleteStepFallback
        ? false
        : descriptionParse.includeIncompleteStepFallback,
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
  const fallbackExtractionMethods = [
    ...(descriptionContributed || (!authorCommentFallback.usedAuthorComment && !transcriptFallback.usedTranscript)
      ? [...DEFAULT_EXTRACTION_METHODS]
      : []),
    ...(authorCommentFallback.usedAuthorComment ? [COMMENT_EXTRACTION_METHOD] : []),
    ...(transcriptFallback.usedTranscript ? [CAPTION_EXTRACTION_METHOD] : []),
  ];
  const extractionMethods = [
    ...(llmFallback.usedLlm && llmFallback.extractionMethods.length > 0
      ? llmFallback.extractionMethods
      : fallbackExtractionMethods),
    ...visualRecipeFallback.extractionMethods,
  ].filter((method, index, methods) => methods.indexOf(method) === index);
  const sourceProviders = [
    "youtube_videos_list",
    "description_parser",
    ...(authorCommentFallback.usedAuthorComment
      ? ["youtube_comment_threads", "comment_filter", "comment_parser"]
      : []),
    ...(transcriptFallback.usedTranscript
      ? buildTranscriptSourceProviders(transcriptFallback.meta)
      : []),
    ...llmFallback.sourceProviders,
    ...visualRecipeFallback.sourceProviders,
    ...visualQuantityEnrichment.sourceProviders,
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
    ...(suppressIncompleteStepFallback && finalParsedRecipe.ingredients.length === 0 ? ["ingredients"] : []),
    ...(suppressIncompleteStepFallback && finalParsedRecipe.steps.length === 0 ? ["steps"] : []),
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
      llm_extractor: llmFallback.meta,
      visual_recipe_extractor: visualRecipeFallback.meta,
      visual_quantity_extractor: visualQuantityEnrichment.meta,
      quantity_enrichment_summary: buildQuantityEnrichmentSummary(visualQuantityEnrichment.meta),
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
  const draftIngredientId = typeof row.draft_ingredient_id === "string" ? row.draft_ingredient_id.trim() : "";
  const quantityConfirmationStatus = normalizeQuantityConfirmationStatus(row.quantity_confirmation_status);

  return {
    draft_ingredient_id: draftIngredientId,
    ingredient_id: typeof row.ingredient_id === "string" ? row.ingredient_id.trim() : "",
    standard_name: typeof row.standard_name === "string" ? row.standard_name.trim() : "",
    amount: typeof row.amount === "number" ? row.amount : null,
    unit: normalizeNullableString(row.unit),
    ingredient_type: row.ingredient_type === "TO_TASTE" ? "TO_TASTE" : "QUANT",
    display_text: stripMatchingComponentPrefix(displayText, componentLabel),
    component_label: componentLabel,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number.NaN,
    scalable: typeof row.scalable === "boolean" ? row.scalable : true,
    quantity_confirmation_status: quantityConfirmationStatus,
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
    const rawDraftIngredientId = isRecord(rawIngredient) ? rawIngredient.draft_ingredient_id : undefined;
    const rawConfirmationStatus = isRecord(rawIngredient)
      ? rawIngredient.quantity_confirmation_status
      : undefined;

    if (ingredientType !== "QUANT" && ingredientType !== "TO_TASTE") {
      fields.push({ field: `ingredients[${index}].ingredient_type`, reason: "invalid_enum" });
    }

    if (!ingredient.draft_ingredient_id) {
      fields.push({ field: `ingredients[${index}].draft_ingredient_id`, reason: "required" });
    } else if (!isUuid(ingredient.draft_ingredient_id)) {
      fields.push({ field: `ingredients[${index}].draft_ingredient_id`, reason: "invalid_uuid" });
    }

    if (!isYoutubeQuantityConfirmationStatus(rawConfirmationStatus)) {
      fields.push({ field: `ingredients[${index}].quantity_confirmation_status`, reason: "invalid_enum" });
    }

    if (rawDraftIngredientId !== undefined && typeof rawDraftIngredientId !== "string") {
      fields.push({ field: `ingredients[${index}].draft_ingredient_id`, reason: "invalid_uuid" });
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

function readDraftIngredientType(row: Record<string, unknown>) {
  return row.ingredient_type === "TO_TASTE" ? "TO_TASTE" : "QUANT";
}

function readDraftAmount(row: Record<string, unknown>) {
  return typeof row.amount === "number" ? row.amount : null;
}

function readDraftUnit(row: Record<string, unknown>) {
  return normalizeNullableString(row.unit);
}

function isDraftQuantityReviewRequired(row: Record<string, unknown>) {
  return row.quantity_review_required === true || row.quantity_source === "recipe_inferred";
}

function quantityMatchesDraftSuggestion(
  ingredient: YoutubeRecipeRegisterIngredientInput,
  draftIngredient: Record<string, unknown>,
) {
  const draftAmount = readDraftAmount(draftIngredient);
  const draftUnit = readDraftUnit(draftIngredient);
  const draftType = readDraftIngredientType(draftIngredient);

  return ingredient.ingredient_type === draftType
    && ingredient.amount === draftAmount
    && ingredient.unit === draftUnit;
}

function validateQuantityConfirmationForRegister(
  session: YoutubeExtractionSessionRow,
  ingredients: YoutubeRecipeRegisterIngredientInput[],
) {
  const fields: ValidationField[] = [];

  ingredients.forEach((ingredient, index) => {
    const draftIngredient = findDraftIngredientRow(session.draft_json, ingredient.draft_ingredient_id);
    if (!draftIngredient) {
      fields.push({ field: `ingredients[${index}].draft_ingredient_id`, reason: "not_found" });
      return;
    }

    const reviewRequired = isDraftQuantityReviewRequired(draftIngredient);
    if (ingredient.quantity_confirmation_status === "not_required") {
      if (reviewRequired) {
        fields.push({ field: "quantity_review_required", reason: "confirmation_required" });
      }
      return;
    }

    if (ingredient.quantity_confirmation_status === "confirmed_suggestion") {
      if (!quantityMatchesDraftSuggestion(ingredient, draftIngredient)) {
        fields.push({ field: "quantity_review_required", reason: "suggestion_mismatch" });
      }
      return;
    }

    if (ingredient.quantity_confirmation_status === "edited_quantity") {
      if (ingredient.ingredient_type !== "QUANT" || ingredient.amount === null || !ingredient.unit) {
        fields.push({ field: "quantity_review_required", reason: "invalid_edited_quantity" });
      }
      return;
    }

    if (
      ingredient.ingredient_type !== "TO_TASTE"
      || ingredient.amount !== null
      || ingredient.unit !== null
    ) {
      fields.push({ field: "quantity_review_required", reason: "invalid_cleared_to_taste" });
    }
  });

  return fields;
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

  const quantityConfirmationFields = validateQuantityConfirmationForRegister(
    sessionResult.data as YoutubeExtractionSessionRow,
    parsed.ingredients,
  );
  if (quantityConfirmationFields.length > 0) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해주세요.",
      422,
      quantityConfirmationFields,
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
