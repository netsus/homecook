import { getIngredientCategoryEmoji } from "@/lib/ingredient-categories";
import stickerManifest from "@/public/assets/ingredients/plush-v2/manifest.json";

type PantryStickerManifestItem = {
  src: string;
  status: string;
};

const PANTRY_STICKER_ITEMS = stickerManifest.items as Record<string, PantryStickerManifestItem>;

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

// Wave1-only display groups that are NOT in the canonical 8 categories.
// For canonical categories, `getIngredientCategoryEmoji()` is authoritative.
const WAVE1_ONLY_EMOJI: Record<string, string> = {
  단백질: "🥚",
  주식: "🍚",
};

const BUNDLE_EMOJI_PRIORITY: Array<[string, string]> = [
  ["한식", "🧂"],
  ["양념", "🧂"],
  ["조미료", "🧂"],
  ["소스", "🥫"],
  ["드레싱", "🥗"],
  ["김치", "🥘"],
  ["국/찌개", "🥘"],
  ["파스타", "🍝"],
  ["면", "🍜"],
  ["떡", "🍚"],
  ["밥", "🍚"],
  ["통조림", "🥫"],
  ["냉동", "❄️"],
  ["브런치", "🍞"],
  ["간편", "🍱"],
  ["샐러드", "🥗"],
  ["과일", "🍎"],
  ["견과", "🥜"],
  ["육류", "🥩"],
  ["해산물", "🐟"],
  ["해조", "🌊"],
  ["유제품", "🥛"],
  ["계란", "🥚"],
  ["베이킹", "🧁"],
  ["디저트", "🧁"],
  ["볶음", "🍳"],
  ["반찬", "🥬"],
  ["채소", "🥕"],
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

export function getPantryStickerSrc(name: string) {
  return PANTRY_STICKER_ITEMS[name]?.src ?? null;
}

export function getBundleEmoji(name: string) {
  const match = BUNDLE_EMOJI_PRIORITY.find(([keyword]) =>
    name.includes(keyword),
  );
  return match?.[1] ?? "📦";
}
