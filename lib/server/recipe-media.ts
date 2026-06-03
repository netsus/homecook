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

const RECIPE_TAG_LIMIT = 3;
export const RECIPE_TAG_MAX_LENGTH = 12;

const DISH_KEYWORD_PATTERN =
  /(찌개|국|탕|전골|볶음|구이|조림|찜|무침|밥|죽|라면|냉면|쫄면|우동|국수|파스타|샌드위치|토스트|샐러드|타르트|케이크|쿠키|빵|푸딩|디저트)$/u;

const TITLE_WORD_STOP_TAGS = new Set([
  "오븐도",
  "젤라틴도",
  "없이",
  "만드는",
  "만들기",
  "방법",
  "부드러운",
  "촉촉한",
  "쉬운",
  "간단한",
  "초간단",
  "노오븐",
  "레시피",
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

  if (canonical.length > RECIPE_TAG_MAX_LENGTH) {
    return null;
  }

  return canonical;
}

function hasHangul(value: string) {
  return /[가-힣]/u.test(value);
}

function stripTitleNoise(title: string) {
  const firstSegment = title.split(/[|｜:：]/u)[0] ?? title;

  return collapseWhitespace(
    firstSegment
      .replace(/\b(?:recipe|recipes|how to make|cooking)\b/giu, " ")
      .replace(/(?:레시피|만들기|만드는 법|만드는 방법)/gu, " ")
      .replace(/[~!♡❤😊]+/gu, " "),
  );
}

function normalizeTitleWord(word: string) {
  return word
    .replace(/(?:이에요|예요|입니다|해요|어요|아요)$/u, "")
    .trim();
}

function buildDishPhraseFromTitle(title: string) {
  const words = Array.from(title.matchAll(/[가-힣A-Za-z0-9]+/gu), (match) => normalizeTitleWord(match[0]))
    .filter(Boolean);
  const dishWordIndex = words.findIndex((word) => DISH_KEYWORD_PATTERN.test(word));

  if (dishWordIndex < 0) {
    return null;
  }

  const startIndex = Math.max(0, dishWordIndex - 4);
  const phraseWords = words
    .slice(startIndex, dishWordIndex + 1)
    .filter((word) => !TITLE_WORD_STOP_TAGS.has(word.toLowerCase()))
    .slice(-4);
  const phrase = collapseWhitespace(phraseWords.join(" "));

  if (phrase && normalizeTag(phrase)) {
    return phrase;
  }

  return words[dishWordIndex] ?? null;
}

function buildTitleTagCandidates(title: string) {
  const candidates: string[] = [];
  const cleanedTitle = stripTitleNoise(title);

  if (normalizeTag(cleanedTitle)) {
    candidates.push(cleanedTitle);
  }

  if (candidates.length === 0 || cleanedTitle.length > RECIPE_TAG_MAX_LENGTH) {
    const dishPhrase = buildDishPhraseFromTitle(cleanedTitle || title);
    if (dishPhrase) {
      candidates.unshift(dishPhrase);
    }
  }

  return candidates;
}

function buildProviderTagGroups(providerTags: string[]) {
  const seen = new Set<string>();
  const primary: string[] = [];
  const secondary: string[] = [];

  for (const providerTag of providerTags) {
    const tag = normalizeTag(providerTag);
    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    if (hasHangul(tag)) {
      primary.push(tag);
    } else {
      secondary.push(tag);
    }
  }

  return { primary, secondary };
}

function pushTag(tags: string[], seen: Set<string>, rawValue: string) {
  if (tags.length >= RECIPE_TAG_LIMIT) {
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

export function extractHashTagsFromText(text: string) {
  return Array.from(text.matchAll(/(?:^|\s)#([0-9A-Za-z가-힣_]+)/gu), (match) => match[1])
    .filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
}

export function generateRecipeTags(input: RecipeTagInput) {
  const tags: string[] = [];
  const seen = new Set<string>();
  const providerTagGroups = buildProviderTagGroups(input.providerTags ?? []);

  for (const providerTag of providerTagGroups.primary) {
    pushTag(tags, seen, providerTag);
  }

  for (const titleCandidate of buildTitleTagCandidates(input.title)) {
    pushTag(tags, seen, titleCandidate);
  }

  for (const ingredientName of input.ingredientNames) {
    pushTag(tags, seen, ingredientName);
  }

  for (const cookingMethodLabel of input.cookingMethodLabels) {
    pushTag(tags, seen, cookingMethodLabel);
  }

  for (const stepText of input.stepTexts) {
    if (tags.length >= RECIPE_TAG_LIMIT) {
      break;
    }

    const matchedMethod = stepText.match(/(볶기|끓이기|굽기|튀기기|찌기|무치기|손질)/u)?.[1];
    if (matchedMethod) {
      pushTag(tags, seen, matchedMethod);
    }
  }

  for (const providerTag of providerTagGroups.secondary) {
    pushTag(tags, seen, providerTag);
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
