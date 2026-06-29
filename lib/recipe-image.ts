/**
 * Single source of truth for the image shown for a recipe across every surface
 * (home cards, recipe detail, search picker, planner-add modal — web and app).
 *
 * Order of preference:
 *   1. the recipe's own `thumbnail_url` column from the DB
 *   2. a deterministic shared placeholder, chosen by recipe id so the SAME
 *      recipe always renders the SAME image everywhere.
 */

const RECIPE_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=900&h=675&fit=crop&q=80",
] as const;

const FOODSERVICE_IMAGE_HOST = "www.foodsafetykorea.go.kr";

interface RecipeImageInput {
  id?: string | null;
  recipe_id?: string | null;
  recipe_thumbnail_url?: string | null;
  thumbnail_url?: string | null;
  photos?: Array<{
    url?: string | null;
  } | null> | null;
}

export function normalizeFoodSafetyImageUrl(value?: string | null): string | null {
  const urlText = value?.trim();
  if (!urlText) {
    return null;
  }

  try {
    const url = new URL(urlText);
    if (url.protocol === "http:" && url.hostname === FOODSERVICE_IMAGE_HOST) {
      url.protocol = "https:";
      return url.toString();
    }
  } catch {
    return urlText;
  }

  return urlText;
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % 100000;
  }
  return hash;
}

/**
 * Resolve the image URL for a recipe. Always returns a usable URL so the same
 * recipe looks identical on every screen.
 */
export function resolveRecipeImage(recipe: RecipeImageInput): string {
  const thumbnailUrl =
    normalizeFoodSafetyImageUrl(recipe.thumbnail_url) ??
    normalizeFoodSafetyImageUrl(recipe.recipe_thumbnail_url);
  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  const stableId = recipe.id ?? recipe.recipe_id;
  const index = stableId ? hashId(stableId) : 0;
  return RECIPE_FALLBACK_IMAGES[index % RECIPE_FALLBACK_IMAGES.length]!;
}

export function resolveRecipePhotoSet(recipe: RecipeImageInput): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const addUrl = (value?: string | null) => {
    const url = normalizeFoodSafetyImageUrl(value);
    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    urls.push(url);
  };

  addUrl(recipe.thumbnail_url);
  addUrl(recipe.recipe_thumbnail_url);
  recipe.photos?.forEach((photo) => {
    addUrl(photo?.url);
  });

  if (urls.length > 0) {
    return urls;
  }

  return [resolveRecipeImage(recipe)];
}
