import {
  buildSuggestedRecipeTags,
  normalizeRecipeTagKey,
  toRecipeTagLabels,
  type RecipeTagSuggestionInput,
} from "@/lib/server/recipe-tags";

export interface RecipeTagBackfillRecipe {
  id: string;
  createdAt?: string | null;
  title: string;
  sourceType?: RecipeTagSuggestionInput["sourceType"];
  baseServings?: number | null;
  totalTimeMinutes?: number | null;
  ingredientNames: string[];
  stepTexts: string[];
  cookingMethodLabels: string[];
  providerTags?: string[];
  currentTags?: string[];
}

export interface RecipeTagBackfillPlanInput {
  dryRun?: boolean;
  recipes: RecipeTagBackfillRecipe[];
}

export interface RecipeTagBackfillPlanItem {
  recipe_id: string;
  tag_source: "backfill";
  current_tags: string[];
  suggested_tags: string[];
  would_update: boolean;
  reason_codes: Array<"missing_suggested_tags" | "stale_projection" | "empty_suggestion">;
}

export interface RecipeTagBackfillPlan {
  dry_run: boolean;
  total_recipes: number;
  would_update_recipes: number;
  would_write_recipe_tags: number;
  would_reconcile_usage_count: boolean;
  recipes: RecipeTagBackfillPlanItem[];
}

export interface RecipeTagUsageCountInput {
  tags: Array<{
    id: string;
    normalized_key: string;
    label: string;
    usage_count: number;
  }>;
  recipeTags: Array<{
    tag_id: string;
    visibility: string;
    review_status: string;
  }>;
}

export interface RecipeTagUsageReconcileItem {
  tag_id: string;
  normalized_key: string;
  label: string;
  before_count: number;
  after_count: number;
  would_update: boolean;
}

function sortBackfillRecipes(recipes: RecipeTagBackfillRecipe[]) {
  return [...recipes].sort((left, right) => {
    const leftCreatedAt = left.createdAt ?? "";
    const rightCreatedAt = right.createdAt ?? "";
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt.localeCompare(rightCreatedAt);
    }

    return left.id.localeCompare(right.id);
  });
}

function normalizeTagLabels(labels: string[]) {
  return labels.map(normalizeRecipeTagKey).filter(Boolean);
}

function areTagLabelsEqual(left: string[], right: string[]) {
  const leftKeys = normalizeTagLabels(left);
  const rightKeys = normalizeTagLabels(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function buildReasonCodes({
  currentTags,
  suggestedTags,
}: {
  currentTags: string[];
  suggestedTags: string[];
}): RecipeTagBackfillPlanItem["reason_codes"] {
  if (suggestedTags.length === 0) {
    return currentTags.length === 0 ? [] : ["empty_suggestion"];
  }

  if (currentTags.length === 0) {
    return ["missing_suggested_tags"];
  }

  return areTagLabelsEqual(currentTags, suggestedTags) ? [] : ["stale_projection"];
}

export function buildRecipeTagBackfillPlan(input: RecipeTagBackfillPlanInput): RecipeTagBackfillPlan {
  const recipes = sortBackfillRecipes(input.recipes).map((recipe) => {
    const currentTags = recipe.currentTags ?? [];
    const suggestedTags = toRecipeTagLabels(buildSuggestedRecipeTags({
      sourceType: recipe.sourceType ?? "manual",
      title: recipe.title,
      baseServings: recipe.baseServings,
      totalTimeMinutes: recipe.totalTimeMinutes,
      ingredientNames: recipe.ingredientNames,
      stepTexts: recipe.stepTexts,
      cookingMethodLabels: recipe.cookingMethodLabels,
      providerTags: recipe.providerTags,
    }));
    const reasonCodes = buildReasonCodes({ currentTags, suggestedTags });

    return {
      recipe_id: recipe.id,
      tag_source: "backfill" as const,
      current_tags: currentTags,
      suggested_tags: suggestedTags,
      would_update: reasonCodes.length > 0 && suggestedTags.length > 0,
      reason_codes: reasonCodes,
    };
  });
  const wouldUpdateRecipes = recipes.filter((recipe) => recipe.would_update).length;

  return {
    dry_run: input.dryRun !== false,
    total_recipes: recipes.length,
    would_update_recipes: wouldUpdateRecipes,
    would_write_recipe_tags: wouldUpdateRecipes,
    would_reconcile_usage_count: wouldUpdateRecipes > 0,
    recipes,
  };
}

export function buildRecipeTagUsageReconcileReport(
  input: RecipeTagUsageCountInput,
): RecipeTagUsageReconcileItem[] {
  const approvedCountByTagId = new Map<string, number>();

  for (const relation of input.recipeTags) {
    if (relation.visibility !== "public" || relation.review_status !== "approved") {
      continue;
    }

    approvedCountByTagId.set(
      relation.tag_id,
      (approvedCountByTagId.get(relation.tag_id) ?? 0) + 1,
    );
  }

  return input.tags
    .map((tag) => {
      const afterCount = approvedCountByTagId.get(tag.id) ?? 0;

      return {
        tag_id: tag.id,
        normalized_key: tag.normalized_key,
        label: tag.label,
        before_count: tag.usage_count,
        after_count: afterCount,
        would_update: tag.usage_count !== afterCount,
      };
    })
    .filter((item) => item.would_update);
}
