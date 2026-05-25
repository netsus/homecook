import { getIngredientCategoryEmoji } from "@/lib/ingredient-categories";

export const WAVE1_PANTRY_REFERENCE_TOTAL = 29;

/**
 * Wave1 pantry UI groups. These are display-only groupings that do NOT map 1:1
 * to the legacy 7 ingredient categories (`채소`, `육류`, `해산물`, `양념`,
 * `유제품`, `곡류`, `기타`).
 *
 * Mapping notes:
 *  - "주식" ≈ 곡류 + subset of 기타 (쌀, 밀가루, 국수 등)
 *  - "단백질" ≈ 육류 + 해산물 + subset of 기타 (두부, 계란 등)
 *  - "채소" = 채소 (1:1)
 *  - "양념" = 양념 (1:1)
 *
 * The canonical 7-category source is `lib/ingredient-categories.ts`.
 */
export const WAVE1_PANTRY_CATEGORY_ORDER = [
  "주식",
  "채소",
  "단백질",
  "양념",
];

const PANTRY_EMOJI: Record<string, string> = {
  감자: "🥔",
  간장: "🫙",
  계란: "🥚",
  고추장: "🌶️",
  고춧가루: "🌶️",
  국수: "🍜",
  김치: "🥬",
  다진마늘: "🧄",
  당근: "🥕",
  닭가슴살: "🍗",
  닭고기: "🍗",
  된장: "🫙",
  돼지고기: "🥩",
  두부: "◻️",
  마늘: "🧄",
  밀가루: "🌾",
  방울토마토: "🍅",
  버터: "🧈",
  빵가루: "🍞",
  새우: "🦐",
  설탕: "🧂",
  소고기: "🥩",
  소금: "🧂",
  스파게티: "🍝",
  식용유: "🫗",
  쌀: "🍚",
  애호박: "🥒",
  양파: "🧅",
  연어: "🐟",
  오이: "🥒",
  올리브유: "🫒",
  우유: "🥛",
  참기름: "🫗",
  참치: "🐟",
  청양고추: "🌶️",
  치즈: "🧀",
  후추: "🧂",
};

// Wave1-only display groups that are NOT in the canonical 7 categories.
// For legacy 7 categories, `getIngredientCategoryEmoji()` is authoritative.
const WAVE1_ONLY_EMOJI: Record<string, string> = {
  과일: "🍎",
  단백질: "🥚",
  주식: "🍚",
};

const BUNDLE_EMOJI_PRIORITY: Array<[string, string]> = [
  ["한식", "🧂"],
  ["양념", "🧂"],
  ["조미료", "🧂"],
  ["김치", "🥘"],
  ["파스타", "🍝"],
  ["샐러드", "🥗"],
  ["야채", "🥕"],
  ["기본", "🧺"],
];

export function getPantryEmoji(name: string, category?: string) {
  if (PANTRY_EMOJI[name]) {
    return PANTRY_EMOJI[name];
  }

  if (category && WAVE1_ONLY_EMOJI[category]) {
    return WAVE1_ONLY_EMOJI[category];
  }

  return getIngredientCategoryEmoji(category);
}

export function getBundleEmoji(name: string) {
  const match = BUNDLE_EMOJI_PRIORITY.find(([keyword]) =>
    name.includes(keyword),
  );
  return match?.[1] ?? "📦";
}

export function sortWave1PantryCategories(categories: string[]) {
  const known = WAVE1_PANTRY_CATEGORY_ORDER.filter((category) =>
    categories.includes(category),
  );
  const unknown = categories
    .filter((category) => !WAVE1_PANTRY_CATEGORY_ORDER.includes(category))
    .sort((a, b) => a.localeCompare(b, "ko"));

  return [...known, ...unknown];
}
