import { getIngredientCategoryEmoji } from "@/lib/ingredient-categories";

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
