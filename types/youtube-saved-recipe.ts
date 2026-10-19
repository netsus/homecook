import type {
  YoutubeIngredientCandidate,
  YoutubeIngredientResolutionStatus,
} from "@/types/recipe";
import type { IngredientQuantityOptions, QuantityInputDraft, QuantityInputSnapshot } from "@/types/quantity-input";

export interface YoutubeSavedQuantityContext {
  /** Hash of the current server-hydrated reviewed context, never a client fact. */
  fingerprint: string;
  options: IngredientQuantityOptions | null;
}

export interface YoutubeSavedQuantityDraft extends QuantityInputDraft {
  expected_context_fingerprint: string;
}

export interface YoutubeSavedRecipeIngredientInput {
  row_id: string;
  source_draft_ingredient_id: string | null;
  standard_name: string;
  quantity_mode: "unknown" | "to_taste" | "quantity";
  amount: number | null;
  unit: string | null;
  display_text: string | null;
  component_label: string | null;
  /** Owner-selected catalog identity only; null explicitly unlinks. Omission preserves an existing choice. */
  catalog_ingredient_id?: string | null;
  quantity_input?: YoutubeSavedQuantityDraft | QuantityInputSnapshot | null;
  /** Server-stored context of the quantity, separate from current choices. */
  quantity_context_fingerprint?: string;
}

export interface YoutubeSavedRecipeIngredientLink {
  catalog_name?: string;
  ingredient_id: string | null;
  resolution_status: YoutubeIngredientResolutionStatus;
  candidates: YoutubeIngredientCandidate[];
}

export interface YoutubeSavedRecipeStepInput {
  row_id: string;
  source_step_index: number | null;
  instruction: string;
  component_label: string | null;
  duration_text: string | null;
}

export interface YoutubeSavedRecipeEditableContent {
  title: string;
  base_servings: number;
  tags: string[];
  ingredients: YoutubeSavedRecipeIngredientInput[];
  steps: YoutubeSavedRecipeStepInput[];
}

export interface YoutubeSavedRecipeSource {
  extraction_id: string;
  youtube_url: string;
  youtube_video_id: string;
  thumbnail_url: string | null;
}

export interface YoutubeSavedRecipeResult {
  draft_id: string;
  /** Present after the additive canonical-recipe bridge migration. */
  recipe_id?: string;
  canonical_content_hash?: string;
  nutrition_publication?: { status: "ready" | "pending" | "stale" };
  revision: number;
  created_at: string;
  updated_at: string;
  content: YoutubeSavedRecipeEditableContent;
  /**
   * Read-only catalog projection keyed by the current editable row id.
   * Older deployments may omit it while the additive DB migration rolls out.
   */
  ingredient_links?: Record<string, YoutubeSavedRecipeIngredientLink>;
  source: YoutubeSavedRecipeSource;
  /** Present only in the new read contract; the stored source is unchanged. */
  quantity_policy?: "quantity-v4" | null;
  quantity_contexts?: Record<string, YoutubeSavedQuantityContext>;
}

export interface YoutubeSavedRecipeSummary {
  draft_id: string;
  /** Present after the additive canonical-recipe bridge migration. */
  recipe_id?: string;
  revision: number;
  title: string;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateYoutubeSavedRecipeBody {
  extraction_id: string;
  content: YoutubeSavedRecipeEditableContent;
}

export interface UpdateYoutubeSavedRecipeBody {
  expected_revision: number;
  content: YoutubeSavedRecipeEditableContent;
}

export interface YoutubeSavedRecipeListData {
  drafts: YoutubeSavedRecipeSummary[];
}
