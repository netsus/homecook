export const RECIPE_IMAGE_BUCKET = "recipe-images";
export const RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const GENERIC_TAGS = new Set([
  "레시피",
  "요리",
  "간단요리",
  "집밥",
  "cooking",
  "food",
  "recipe",
  "recipes",
  "shorts",
  "shortsvideo",
  "reels",
  "viral",
  "vlog",
  "fyp",
]);

export type RecipeImageMimeType = keyof typeof ALLOWED_IMAGE_TYPES;

export interface RecipeTagInput {
  title: string;
  ingredientNames: string[];
  stepTexts: string[];
  cookingMethodLabels: string[];
  providerTags?: string[];
}

export interface RecipeImagePublicUrlInput {
  thumbnailUrl: string;
  userId: string;
  supabaseUrl: string;
}

export function getRecipeImageExtension(contentType: string) {
  return ALLOWED_IMAGE_TYPES[contentType as RecipeImageMimeType] ?? null;
}

export function isAllowedRecipeImageType(contentType: string) {
  return getRecipeImageExtension(contentType) !== null;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTag(rawValue: string) {
  const trimmed = collapseWhitespace(
    rawValue
      .replace(/^#+/u, "")
      .replace(/[()[\]{}]/gu, " ")
      .replace(/\s+/gu, " "),
  );

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//iu.test(trimmed) || trimmed.startsWith("@")) {
    return null;
  }

  const canonical = /^[\x00-\x7F]+$/u.test(trimmed)
    ? trimmed.toLowerCase()
    : trimmed;

  if (GENERIC_TAGS.has(canonical.toLowerCase())) {
    return null;
  }

  if (canonical.length > 30) {
    return null;
  }

  return canonical;
}

function pushTag(tags: string[], seen: Set<string>, rawValue: string) {
  if (tags.length >= 6) {
    return;
  }

  const tag = normalizeTag(rawValue);
  if (!tag) {
    return;
  }

  const key = tag.toLowerCase();
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  tags.push(tag);
}

export function generateRecipeTags(input: RecipeTagInput) {
  const tags: string[] = [];
  const seen = new Set<string>();

  pushTag(tags, seen, input.title);

  for (const ingredientName of input.ingredientNames) {
    pushTag(tags, seen, ingredientName);
  }

  for (const cookingMethodLabel of input.cookingMethodLabels) {
    pushTag(tags, seen, cookingMethodLabel);
  }

  for (const providerTag of input.providerTags ?? []) {
    pushTag(tags, seen, providerTag);
  }

  for (const stepText of input.stepTexts) {
    if (tags.length >= 6) {
      break;
    }

    const matchedMethod = stepText.match(/(볶기|끓이기|굽기|튀기기|찌기|무치기|손질)/u)?.[1];
    if (matchedMethod) {
      pushTag(tags, seen, matchedMethod);
    }
  }

  return tags;
}

export function parseRecipeImagePublicUrl({
  thumbnailUrl,
  userId,
  supabaseUrl,
}: RecipeImagePublicUrlInput) {
  let parsedUrl: URL;
  let parsedSupabaseUrl: URL;

  try {
    parsedUrl = new URL(thumbnailUrl);
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (parsedUrl.origin !== parsedSupabaseUrl.origin) {
    return null;
  }

  if (parsedUrl.search || parsedUrl.hash) {
    return null;
  }

  const segments = parsedUrl.pathname.split("/").map((segment) => decodeURIComponent(segment));
  const expectedPrefix = ["", "storage", "v1", "object", "public", RECIPE_IMAGE_BUCKET, userId];
  if (segments.length !== expectedPrefix.length + 1) {
    return null;
  }

  for (let index = 0; index < expectedPrefix.length; index += 1) {
    if (segments[index] !== expectedPrefix[index]) {
      return null;
    }
  }

  const fileName = segments[segments.length - 1];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/iu.test(fileName)) {
    return null;
  }

  const objectPath = `${userId}/${fileName}`;

  return {
    objectPath,
    storagePath: `${RECIPE_IMAGE_BUCKET}/${objectPath}`,
  };
}
