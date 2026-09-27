/** Prefer the stored recipe photo; never substitute an unrelated food photo. */
const RECIPE_PLACEHOLDER = "/images/recipe-placeholder.svg";

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

export function resolveRecipeImage(recipe: RecipeImageInput): string {
  const thumbnailUrl =
    normalizeFoodSafetyImageUrl(recipe.thumbnail_url) ??
    normalizeFoodSafetyImageUrl(recipe.recipe_thumbnail_url);
  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  return RECIPE_PLACEHOLDER;
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
