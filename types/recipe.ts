import type { ApiResponse } from "@/types/api";
import type { IngredientCategory } from "@/lib/ingredient-categories";

export type RecipeSortKey =
  | "view_count"
  | "latest"
  | "save_count"
  | "plan_count"
  | "cook_count";

export interface RecipeCardItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
  user_status?: RecipeCardUserStatus | null;
}

export interface RecipeCardUserStatus {
  is_saved: boolean;
  saved_book_ids: string[];
}

export interface RecipeListData {
  items: RecipeCardItem[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface RecipeListQuery {
  q?: string;
  tag?: string;
  ingredient_ids?: string[];
  sort?: RecipeSortKey;
  cursor?: string | null;
  limit?: number;
}

export interface CookingMethodItem {
  id: string;
  code: string;
  label: string;
  color_key: string;
  is_system: boolean;
  category_code?: string | null;
  category_label?: string | null;
  synonyms?: string[];
}

export interface CookingMethodListData {
  methods: CookingMethodItem[];
}

export interface IngredientItem {
  id: string;
  standard_name: string;
  category: string;
  category_group_code?: string | null;
  category_code?: string | null;
  category_label?: string | null;
}

export interface IngredientListQuery {
  q?: string;
  category?: string;
  category_code?: string;
  category_group_code?: string;
}

export interface IngredientListData {
  items: IngredientItem[];
}

export interface RecipeTheme {
  id: string;
  title: string;
  tag_key?: string;
  tag_label?: string;
  recipes: RecipeCardItem[];
}

export interface RecipeThemesData {
  themes: RecipeTheme[];
}

export type RecipeTagKind = "semantic" | "ingredient" | "method" | "source" | "user";

export interface RecipeTagItem {
  normalized_key: string;
  label: string;
  slug: string | null;
  kind: RecipeTagKind;
  is_system: boolean;
  theme_eligible: boolean;
  usage_count: number;
}

export interface RecipeTagListData {
  items: RecipeTagItem[];
}

export interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  component_label?: string | null;
  scalable: boolean;
  sort_order: number;
}

export interface RecipeStepCookingMethod {
  id: string;
  code: string;
  label: string;
  color_key: string;
  category_code?: string | null;
  category_label?: string | null;
}

export interface RecipeStep {
  id: string;
  step_number: number;
  instruction: string;
  component_label?: string | null;
  cooking_method: RecipeStepCookingMethod | null;
  cooking_methods?: RecipeStepCookingMethod[];
  ingredients_used: Array<{
    ingredient_id: string;
    amount: number | null;
    unit: string | null;
    cut_size?: string | null;
  }>;
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

export type RecipePhotoRole = "primary" | "alternate" | "step" | "unknown";

export interface RecipePhoto {
  url: string;
  role: RecipePhotoRole;
  label?: string | null;
  width?: number | null;
  height?: number | null;
}

export type RecipeNutritionStatus = "complete" | "partial" | "unavailable";
export type RecipeNutritionQuality = "direct" | "estimated" | "mixed";

export interface RecipeNutritionValue {
  amount: number | null;
  known_amount: number | null;
  status: RecipeNutritionStatus;
  display_mode: "total" | "minimum" | null;
}

export interface RecipeNutritionSource {
  provider: string;
  dataset: string;
  source_version: string;
  data_basis_date: string | null;
  license: string;
  source_url: string;
}

export interface RecipeNutrition {
  basis: { amount: number; unit: "serving" };
  base_servings?: number;
  values: Record<string, RecipeNutritionValue>;
  scalable_values?: Record<string, number>;
  fixed_values?: Record<string, number>;
  calculation_status: RecipeNutritionStatus;
  calculation_quality: RecipeNutritionQuality | null;
  reflected_ingredient_count?: number;
  target_ingredient_count?: number;
  warnings: string[];
  sources: RecipeNutritionSource[];
  snapshot_id?: string;
  calculated_at?: string;
}

export interface ManualRecipeIngredientInput {
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  sort_order: number;
  scalable: boolean;
}

export interface ManualRecipeStepIngredientUsedInput {
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  cut_size?: string | null;
}

export interface ManualRecipeStepInput {
  step_number: number;
  instruction: string;
  cooking_method_id: string;
  ingredients_used: ManualRecipeStepIngredientUsedInput[];
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

export interface ManualRecipeCreateBody {
  title: string;
  base_servings: number;
  thumbnail_url?: string | null;
  tags?: string[];
  ingredients: ManualRecipeIngredientInput[];
  steps: ManualRecipeStepInput[];
}

export type YoutubeQuantitySource =
  | "text_explicit"
  | "visual_explicit"
  | "unit_normalized"
  | "ingredient_default"
  | "recipe_inferred"
  | "user_entered"
  | "unknown";

export interface YoutubeQuantityEvidenceRef {
  source_method: "description" | "comment" | "caption" | "visual";
  source_provider: string;
  line_index?: number | null;
  start_ms?: number | null;
  end_ms?: number | null;
  frame_ts_ms?: number | null;
  snippet: string;
  locator_hash?: string | null;
}

export type YoutubeQuantityConfirmationStatus =
  | "not_required"
  | "confirmed_suggestion"
  | "edited_quantity"
  | "cleared_to_taste";

export interface YoutubeRecipeRegisterIngredientInput extends ManualRecipeIngredientInput {
  component_label?: string | null;
  draft_ingredient_id: string;
  quantity_confirmation_status: YoutubeQuantityConfirmationStatus;
}

export interface YoutubeRecipeRegisterStepInput extends ManualRecipeStepInput {
  component_label?: string | null;
}

export interface ManualRecipeCreateData {
  id: string;
  title: string;
  source_type: "manual";
  created_by: string;
  base_servings: number;
}

export interface YoutubeRecipeValidateBody {
  youtube_url: string;
}

export interface YoutubeVideoInfo {
  video_id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
  duration?: string | null;
  category_id?: string | null;
}

export type YoutubeRecipeClassificationStatus = "recipe" | "non_recipe" | "uncertain";

export interface YoutubeRecipeValidateData {
  is_valid_url: true;
  is_recipe_video: boolean;
  classification_status: YoutubeRecipeClassificationStatus;
  classification_reasons: string[];
  video_info: YoutubeVideoInfo;
  message?: string;
}

export type YoutubeIngredientResolutionStatus = "resolved" | "needs_review" | "unresolved";

export type { IngredientCategory };

export interface YoutubeIngredientCandidate {
  ingredient_id: string;
  standard_name: string;
  confidence: number;
}

export interface YoutubeExtractedIngredient extends ManualRecipeIngredientInput {
  draft_ingredient_id: string;
  confidence: number | null;
  resolution_status: YoutubeIngredientResolutionStatus;
  component_label?: string | null;
  candidates?: YoutubeIngredientCandidate[];
  raw_text?: string;
  quantity_source?: YoutubeQuantitySource;
  quantity_confidence?: number | null;
  quantity_raw_text?: string | null;
  quantity_evidence_refs?: YoutubeQuantityEvidenceRef[];
  quantity_review_required?: boolean;
  quantity_user_confirmed?: boolean;
}

export interface YoutubeExtractedCookingMethod {
  id: string;
  code: string;
  label: string;
  color_key: string;
  is_new: boolean;
}

export interface YoutubeExtractedStep {
  step_number: number;
  instruction: string;
  cooking_method: YoutubeExtractedCookingMethod;
  duration_text: string | null;
  component_label?: string | null;
  is_incomplete?: boolean;
  missing_fields?: Array<"instruction" | "cooking_method" | "duration" | "ingredients_used">;
  raw_text?: string;
}

export type YoutubeMultiRecipeStatus = "single" | "multiple" | "ambiguous";

export interface YoutubeRecipeEvidenceRef {
  source: "description" | "comment" | "caption" | "transcript";
  line_index: number;
  start_ms?: number | null;
  end_ms?: number | null;
  text?: string;
}

export interface YoutubeSourceSegmentsSummary {
  source: "description" | "comment" | "caption" | "transcript";
  language: string | null;
  track_kind: string | null;
  segment_count: number;
  blocked_reason?: string | null;
}

export interface YoutubeRecipeCandidate {
  candidate_id: string;
  title: string;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number;
  ingredients: YoutubeExtractedIngredient[];
  steps: YoutubeExtractedStep[];
  draft_warnings: string[];
  blocking_issues: string[];
  evidence_refs: YoutubeRecipeEvidenceRef[];
}

export interface YoutubeRecipeExtractData {
  extraction_id: string;
  title: string;
  base_servings: number;
  thumbnail_url: string | null;
  tags: string[];
  suggested_tags?: RecipeTagSuggestionItem[];
  extraction_methods: string[];
  draft_warnings: string[];
  blocking_issues: string[];
  ingredients: YoutubeExtractedIngredient[];
  steps: YoutubeExtractedStep[];
  new_cooking_methods: YoutubeExtractedCookingMethod[];
  multi_recipe_status?: YoutubeMultiRecipeStatus;
  primary_candidate_id?: string | null;
  caption_source?: "none" | "server_timedtext" | "browser_fallback";
  source_segments_summary?: YoutubeSourceSegmentsSummary[];
  recipe_candidates?: YoutubeRecipeCandidate[];
}

export interface YoutubeCandidateDraftBody {
  extraction_id: string;
  candidate_id: string;
}

export interface YoutubeCandidateDraftData {
  parent_extraction_id: string;
  candidate_id: string;
  draft: YoutubeRecipeExtractData;
}

export interface YoutubeRecipeRegisterBody {
  extraction_id: string;
  title: string;
  base_servings: number;
  youtube_url: string;
  tags?: string[];
  ingredients: YoutubeRecipeRegisterIngredientInput[];
  steps: YoutubeRecipeRegisterStepInput[];
}

export interface YoutubeRecipeRegisterData {
  recipe_id: string;
  title: string;
}

export interface RecipeTagSuggestionBody {
  source_type?: "manual" | "system" | "youtube";
  title?: string;
  base_servings?: number | null;
  total_time_minutes?: number | null;
  ingredients?: Array<string | { standard_name?: string; name?: string }>;
  steps?: Array<string | { instruction?: string; text?: string }>;
  cooking_method_labels?: string[];
  provider_tags?: string[];
}

export interface RecipeTagSuggestionItem {
  normalized_key: string;
  label: string;
  kind: "semantic" | "source" | "user";
  source: "system_suggested" | "user_reviewed" | "provider" | "backfill" | "admin";
  confidence: number;
}

export interface RecipeTagSuggestionData {
  suggested_tags: RecipeTagSuggestionItem[];
  tags: string[];
}

export interface RecipioYoutubeDuplicateRecipe {
  recipe_id: string;
  title: string;
  thumbnail_url: string | null;
  youtube_url: string;
  youtube_video_id: string;
}

export interface RecipioYoutubeDuplicateCheckData {
  is_duplicate: boolean;
  recipe: RecipioYoutubeDuplicateRecipe | null;
}

export type YoutubeIngredientRegistrationSynonymStatus =
  | "attached"
  | "already_attached"
  | "skipped_same_as_standard"
  | "skipped_ambiguous"
  | "not_requested";

export interface YoutubeIngredientRegistrationBody {
  extraction_id: string;
  draft_ingredient_id: string;
  standard_name: string;
  category: IngredientCategory;
  category_code?: string | null;
  default_unit?: string | null;
  synonym?: string | null;
}

export interface YoutubeIngredientRegistrationData {
  ingredient: {
    ingredient_id: string;
    standard_name: string;
    category: IngredientCategory;
    category_code?: string | null;
    default_unit: string | null;
    resolution_status: "resolved";
  };
  synonym_status: YoutubeIngredientRegistrationSynonymStatus;
  warnings: string[];
}

export interface RecipeUserStatus {
  is_liked: boolean;
  is_saved: boolean;
  saved_book_ids: string[];
}

export interface RecipeLikeData {
  is_liked: boolean;
  like_count: number;
}

export type RecipeLikeResponse = ApiResponse<RecipeLikeData>;

export type RecipeBookType = "my_added" | "saved" | "liked" | "custom";
export type SaveableRecipeBookType = Extract<RecipeBookType, "saved" | "custom">;
export type RecipeBookCoverColorKey = "sage" | "sky" | "lavender" | "coral" | "sand";

export interface RecipeBookSummary {
  id: string;
  name: string;
  book_type: RecipeBookType;
  recipe_count: number;
  sort_order: number;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
}

export interface RecipeBookListData {
  books: RecipeBookSummary[];
}

export interface RecipeBookCreateBody {
  name: string;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
}

export interface RecipeBookCreateData {
  id: string;
  name: string;
  book_type: "custom";
  recipe_count: number;
  sort_order: number;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeBookUpdateBody {
  name?: string;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
}

export type RecipeBookUpdateData = RecipeBookCreateData;

export interface RecipeBookDeleteData {
  deleted: true;
}

export interface RecipeBookRecipeItem {
  recipe_id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  view_count: number;
  total_duration_seconds: number | null;
  total_duration_text: string | null;
  base_servings: number;
  added_at: string;
}

export interface RecipeBookRecipeListData {
  items: RecipeBookRecipeItem[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface RecipeBookReaderRecipeData extends RecipeBookRecipeItem {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export interface PantryMatchMissingIngredient {
  id: string;
  standard_name: string;
}

export interface PantryMatchRecipeItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  match_score: number;
  matched_ingredients: number;
  total_ingredients: number;
  missing_ingredients: PantryMatchMissingIngredient[];
}

export interface PantryMatchListData {
  items: PantryMatchRecipeItem[];
}

export interface RecipeSaveBody {
  book_ids: string[];
}

export interface RecipeSaveData {
  saved: true;
  save_count: number;
  book_ids: string[];
  created_book_ids: string[];
  already_saved_book_ids: string[];
}

export type RecipeBookListResponse = ApiResponse<RecipeBookListData>;
export type RecipeBookCreateResponse = ApiResponse<RecipeBookCreateData>;
export type RecipeBookUpdateResponse = ApiResponse<RecipeBookUpdateData>;
export type RecipeBookDeleteResponse = ApiResponse<RecipeBookDeleteData>;
export type RecipeBookReaderRecipeResponse = ApiResponse<RecipeBookReaderRecipeData>;
export type RecipeSaveResponse = ApiResponse<RecipeSaveData>;

export interface RecipeDetail {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  photos?: RecipePhoto[];
  base_servings: number;
  tags: string[];
  source_type: "system" | "youtube" | "manual";
  source: {
    youtube_url: string | null;
    youtube_video_id: string | null;
  } | null;
  view_count: number;
  like_count: number;
  save_count: number;
  plan_count: number;
  cook_count: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition: RecipeNutrition;
  user_status: RecipeUserStatus | null;
}
