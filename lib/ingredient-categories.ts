export const ALL_INGREDIENT_CATEGORY = "전체";

export interface IngredientCategoryEntry {
  code: string;
  label: string;
  display_order: number;
  is_active: boolean;
  emoji: string;
}

export interface IngredientCategoryGroupEntry {
  code: string;
  label: string;
  display_order: number;
  is_active: boolean;
}

export interface IngredientSubcategoryEntry {
  code: string;
  group_code: string;
  label: string;
  legacy_category: string;
  display_order: number;
  is_active: boolean;
}

export const INGREDIENT_CATEGORIES = [
  { code: "vegetable", label: "채소", display_order: 10, is_active: true, emoji: "🥬" },
  { code: "fruit", label: "과일", display_order: 20, is_active: true, emoji: "🍓" },
  { code: "meat", label: "육류", display_order: 30, is_active: true, emoji: "🥩" },
  { code: "seafood", label: "해산물", display_order: 40, is_active: true, emoji: "🐟" },
  { code: "seasoning", label: "양념", display_order: 50, is_active: true, emoji: "🧂" },
  { code: "dairy", label: "유제품", display_order: 60, is_active: true, emoji: "🥛" },
  { code: "grain", label: "곡류", display_order: 70, is_active: true, emoji: "🌾" },
  { code: "other", label: "기타", display_order: 80, is_active: true, emoji: "🥄" },
] as const satisfies readonly IngredientCategoryEntry[];

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number]["label"];
export type LegacyIngredientCategoryCode = (typeof INGREDIENT_CATEGORIES)[number]["code"];

export const INGREDIENT_CATEGORY_LABELS = INGREDIENT_CATEGORIES.map(
  (category) => category.label,
) as IngredientCategory[];

export const INGREDIENT_CATEGORY_OPTIONS = [
  ALL_INGREDIENT_CATEGORY,
  ...INGREDIENT_CATEGORY_LABELS,
] as const;

export const INGREDIENT_CATEGORY_GROUPS = [
  { code: "grain_noodle_ricecake", label: "곡류/면/떡", display_order: 10, is_active: true },
  { code: "vegetable_mushroom", label: "채소/버섯", display_order: 20, is_active: true },
  { code: "fruit_nut", label: "과일/견과", display_order: 30, is_active: true },
  { code: "protein", label: "단백질", display_order: 40, is_active: true },
  { code: "seafood", label: "해산물", display_order: 50, is_active: true },
  { code: "dairy_alternative", label: "유제품/대체유", display_order: 60, is_active: true },
  { code: "seasoning_condiment", label: "양념/조미", display_order: 70, is_active: true },
  { code: "processed_other", label: "가공/기타", display_order: 80, is_active: true },
] as const satisfies readonly IngredientCategoryGroupEntry[];

export type IngredientCategoryGroupCode =
  (typeof INGREDIENT_CATEGORY_GROUPS)[number]["code"];

export type IngredientCategoryGroupFilterValue =
  | typeof ALL_INGREDIENT_CATEGORY
  | IngredientCategoryGroupCode;

export const INGREDIENT_SUBCATEGORIES = [
  {
    code: "rice_meal",
    group_code: "grain_noodle_ricecake",
    label: "밥/쌀",
    legacy_category: "곡류",
    display_order: 10,
    is_active: true,
  },
  {
    code: "noodle_pasta",
    group_code: "grain_noodle_ricecake",
    label: "면/파스타",
    legacy_category: "곡류",
    display_order: 20,
    is_active: true,
  },
  {
    code: "bread_ricecake_cereal",
    group_code: "grain_noodle_ricecake",
    label: "빵/떡/시리얼",
    legacy_category: "곡류",
    display_order: 30,
    is_active: true,
  },
  {
    code: "leaf_namul",
    group_code: "vegetable_mushroom",
    label: "잎/나물채소",
    legacy_category: "채소",
    display_order: 40,
    is_active: true,
  },
  {
    code: "root_stem",
    group_code: "vegetable_mushroom",
    label: "뿌리/줄기채소",
    legacy_category: "채소",
    display_order: 50,
    is_active: true,
  },
  {
    code: "fruiting_vegetable_mushroom",
    group_code: "vegetable_mushroom",
    label: "열매채소/버섯",
    legacy_category: "채소",
    display_order: 60,
    is_active: true,
  },
  {
    code: "fruit",
    group_code: "fruit_nut",
    label: "과일",
    legacy_category: "과일",
    display_order: 70,
    is_active: true,
  },
  {
    code: "nut_seed_dried_fruit",
    group_code: "fruit_nut",
    label: "견과/씨앗/건과일",
    legacy_category: "과일",
    display_order: 80,
    is_active: true,
  },
  {
    code: "pork_beef_lamb",
    group_code: "protein",
    label: "돼지/소/양",
    legacy_category: "육류",
    display_order: 90,
    is_active: true,
  },
  {
    code: "chicken_duck",
    group_code: "protein",
    label: "닭/오리",
    legacy_category: "육류",
    display_order: 100,
    is_active: true,
  },
  {
    code: "egg",
    group_code: "protein",
    label: "달걀",
    legacy_category: "기타",
    display_order: 110,
    is_active: true,
  },
  {
    code: "tofu_bean",
    group_code: "protein",
    label: "두부/콩류",
    legacy_category: "기타",
    display_order: 120,
    is_active: true,
  },
  {
    code: "fish_shellfish_crustacean",
    group_code: "seafood",
    label: "생선/갑각/조개",
    legacy_category: "해산물",
    display_order: 130,
    is_active: true,
  },
  {
    code: "seaweed_dried_fish_fishcake",
    group_code: "seafood",
    label: "해조/건어물/어묵",
    legacy_category: "해산물",
    display_order: 140,
    is_active: true,
  },
  {
    code: "milk_yogurt_cream",
    group_code: "dairy_alternative",
    label: "우유/요거트/크림",
    legacy_category: "유제품",
    display_order: 150,
    is_active: true,
  },
  {
    code: "cheese_butter_alt_milk",
    group_code: "dairy_alternative",
    label: "치즈/버터/대체유",
    legacy_category: "유제품",
    display_order: 160,
    is_active: true,
  },
  {
    code: "paste_sauce",
    group_code: "seasoning_condiment",
    label: "장류/소스",
    legacy_category: "양념",
    display_order: 170,
    is_active: true,
  },
  {
    code: "spice_herb",
    group_code: "seasoning_condiment",
    label: "향신료/허브",
    legacy_category: "양념",
    display_order: 180,
    is_active: true,
  },
  {
    code: "oil_vinegar_sugar_stock",
    group_code: "seasoning_condiment",
    label: "기름/식초/당류/육수",
    legacy_category: "양념",
    display_order: 190,
    is_active: true,
  },
  {
    code: "kimchi_pickle_can",
    group_code: "processed_other",
    label: "김치/절임/통조림",
    legacy_category: "기타",
    display_order: 200,
    is_active: true,
  },
  {
    code: "frozen_ready_drink_other",
    group_code: "processed_other",
    label: "냉동/간편식/음료/기타",
    legacy_category: "기타",
    display_order: 210,
    is_active: true,
  },
] as const satisfies readonly IngredientSubcategoryEntry[];

export type IngredientSubcategoryCode =
  (typeof INGREDIENT_SUBCATEGORIES)[number]["code"];

export interface IngredientCategoryGroupFilterOption {
  value: IngredientCategoryGroupFilterValue;
  label: string;
  category_group_code: IngredientCategoryGroupCode | null;
}

export interface IngredientSubcategoryOption {
  value: IngredientSubcategoryCode;
  label: string;
  group_code: IngredientCategoryGroupCode;
  group_label: string;
  legacy_category: IngredientCategory;
}

export interface IngredientTaxonomyMetadata {
  category_group_code: IngredientCategoryGroupCode | null;
  category_group_label: string | null;
  category_code: IngredientSubcategoryCode | null;
  category_label: string | null;
}

const INGREDIENT_CATEGORY_BY_LABEL = new Map<string, (typeof INGREDIENT_CATEGORIES)[number]>(
  INGREDIENT_CATEGORIES.map((category) => [category.label, category]),
);

const INGREDIENT_CATEGORY_BY_CODE = new Map<string, (typeof INGREDIENT_CATEGORIES)[number]>(
  INGREDIENT_CATEGORIES.map((category) => [category.code, category]),
);

const INGREDIENT_GROUP_BY_CODE = new Map<string, (typeof INGREDIENT_CATEGORY_GROUPS)[number]>(
  INGREDIENT_CATEGORY_GROUPS.map((group) => [group.code, group]),
);

const INGREDIENT_SUBCATEGORY_BY_CODE = new Map<string, (typeof INGREDIENT_SUBCATEGORIES)[number]>(
  INGREDIENT_SUBCATEGORIES.map((category) => [category.code, category]),
);

const FALLBACK_SUBCATEGORY_BY_LEGACY_LABEL = new Map<IngredientCategory, IngredientSubcategoryCode>([
  ["채소", "root_stem"],
  ["과일", "fruit"],
  ["육류", "pork_beef_lamb"],
  ["해산물", "fish_shellfish_crustacean"],
  ["양념", "paste_sauce"],
  ["유제품", "milk_yogurt_cream"],
  ["곡류", "rice_meal"],
  ["기타", "frozen_ready_drink_other"],
]);

export function getIngredientCategoryByLabel(label: string | null | undefined) {
  if (!label) {
    return undefined;
  }

  return INGREDIENT_CATEGORY_BY_LABEL.get(label.trim());
}

export function getIngredientCategoryByCode(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return INGREDIENT_CATEGORY_BY_CODE.get(code.trim());
}

export function getIngredientCategoryGroupByCode(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return INGREDIENT_GROUP_BY_CODE.get(code.trim());
}

export function getIngredientSubcategoryByCode(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return INGREDIENT_SUBCATEGORY_BY_CODE.get(code.trim());
}

export function isValidIngredientCategory(
  label: string | null | undefined,
): label is IngredientCategory {
  return getIngredientCategoryByLabel(label) !== undefined;
}

export function isValidIngredientCategoryGroupCode(
  code: string | null | undefined,
): code is IngredientCategoryGroupCode {
  return getIngredientCategoryGroupByCode(code)?.is_active === true;
}

export function isValidIngredientSubcategoryCode(
  code: string | null | undefined,
): code is IngredientSubcategoryCode {
  return getIngredientSubcategoryByCode(code)?.is_active === true;
}

export function normalizeIngredientCategoryLabel(
  label: string | null | undefined,
  fallback: IngredientCategory = "기타",
): IngredientCategory {
  return getIngredientCategoryByLabel(label)?.label ?? fallback;
}

export function getIngredientCategoryEmoji(label: string | null | undefined) {
  return getIngredientCategoryByLabel(label)?.emoji ?? getIngredientCategoryByLabel("기타")!.emoji;
}

export function getFallbackIngredientSubcategoryCode(
  label: string | null | undefined,
): IngredientSubcategoryCode | null {
  const legacyCategory = getIngredientCategoryByLabel(label)?.label;
  if (!legacyCategory) {
    return null;
  }

  return FALLBACK_SUBCATEGORY_BY_LEGACY_LABEL.get(legacyCategory) ?? null;
}

export function getLegacyCategoryForIngredientSubcategoryCode(
  code: string | null | undefined,
): IngredientCategory | null {
  const subcategory = getIngredientSubcategoryByCode(code);
  return subcategory
    ? (subcategory.legacy_category as IngredientCategory)
    : null;
}

export function getIngredientGroupCodesForLegacyCategory(
  label: string | null | undefined,
): IngredientCategoryGroupCode[] {
  const legacyCategory = getIngredientCategoryByLabel(label)?.label;
  if (!legacyCategory) {
    return [];
  }

  return Array.from(new Set(
    INGREDIENT_SUBCATEGORIES
      .filter((category) => category.legacy_category === legacyCategory)
      .map((category) => category.group_code as IngredientCategoryGroupCode),
  ));
}

export function getIngredientSubcategoryCodesForGroup(
  groupCode: string | null | undefined,
): IngredientSubcategoryCode[] {
  if (!isValidIngredientCategoryGroupCode(groupCode)) {
    return [];
  }

  return INGREDIENT_SUBCATEGORIES
    .filter((category) => category.group_code === groupCode && category.is_active)
    .map((category) => category.code);
}

export const INGREDIENT_CATEGORY_GROUP_OPTIONS = [
  {
    value: ALL_INGREDIENT_CATEGORY,
    label: ALL_INGREDIENT_CATEGORY,
    category_group_code: null,
  },
  ...INGREDIENT_CATEGORY_GROUPS
    .filter((group) => group.is_active)
    .map((group) => ({
      value: group.code,
      label: group.label,
      category_group_code: group.code,
    })),
] as const satisfies readonly IngredientCategoryGroupFilterOption[];

export const INGREDIENT_SUBCATEGORY_OPTIONS = INGREDIENT_SUBCATEGORIES
  .filter((category) => category.is_active)
  .map((category) => ({
    value: category.code,
    label: category.label,
    group_code: category.group_code,
    group_label: getIngredientCategoryGroupByCode(category.group_code)!.label,
    legacy_category: category.legacy_category as IngredientCategory,
  })) as IngredientSubcategoryOption[];

export function getIngredientCategoryGroupLabel(
  groupCode: string | null | undefined,
) {
  return getIngredientCategoryGroupByCode(groupCode)?.label ?? null;
}

export function getIngredientCategoryGroupFilterOption(
  value: string | null | undefined,
) {
  return INGREDIENT_CATEGORY_GROUP_OPTIONS.find((option) => option.value === value);
}

export function getIngredientSubcategoryOption(
  code: string | null | undefined,
) {
  return INGREDIENT_SUBCATEGORY_OPTIONS.find((option) => option.value === code);
}

export function getIngredientSubcategoryOptionsByGroup() {
  return INGREDIENT_CATEGORY_GROUPS
    .filter((group) => group.is_active)
    .map((group) => ({
      group,
      options: INGREDIENT_SUBCATEGORY_OPTIONS.filter(
        (option) => option.group_code === group.code,
      ),
    }));
}

export function getDefaultIngredientSubcategoryOption(
  legacyCategory: string | null | undefined,
) {
  const fallbackCode = getFallbackIngredientSubcategoryCode(legacyCategory);
  return getIngredientSubcategoryOption(fallbackCode) ?? getIngredientSubcategoryOption("paste_sauce")!;
}

export function getIngredientGroupFilterValue({
  category,
  categoryGroupCode,
  category_group_code,
  categoryCode,
  category_code,
}: {
  category: string | null | undefined;
  categoryGroupCode?: string | null;
  category_group_code?: string | null;
  categoryCode?: string | null;
  category_code?: string | null;
}): IngredientCategoryGroupCode | null {
  const explicitGroup = getIngredientCategoryGroupByCode(
    categoryGroupCode ?? category_group_code,
  );
  if (explicitGroup?.is_active) {
    return explicitGroup.code;
  }

  const subcategory = getIngredientSubcategoryByCode(categoryCode ?? category_code);
  const subcategoryGroup = getIngredientCategoryGroupByCode(subcategory?.group_code);
  if (subcategory?.is_active && subcategoryGroup?.is_active) {
    return subcategoryGroup.code;
  }

  const groupByLabel = INGREDIENT_CATEGORY_GROUPS.find(
    (group) => group.label === category?.trim() && group.is_active,
  );
  if (groupByLabel) {
    return groupByLabel.code;
  }

  const fallbackCode = getFallbackIngredientSubcategoryCode(category);
  const fallbackSubcategory = getIngredientSubcategoryByCode(fallbackCode);
  const fallbackGroup = getIngredientCategoryGroupByCode(fallbackSubcategory?.group_code);

  return fallbackGroup?.is_active ? fallbackGroup.code : null;
}

export function getIngredientGroupDisplayLabel({
  category,
  categoryGroupCode,
  category_group_code,
  categoryCode,
  category_code,
}: {
  category: string | null | undefined;
  categoryGroupCode?: string | null;
  category_group_code?: string | null;
  categoryCode?: string | null;
  category_code?: string | null;
}) {
  const groupCode = getIngredientGroupFilterValue({
    category,
    categoryGroupCode,
    category_group_code,
    categoryCode,
    category_code,
  });

  return getIngredientCategoryGroupLabel(groupCode) ?? normalizeIngredientCategoryLabel(category);
}

export function ingredientMatchesCategoryGroup(
  ingredient: {
    category?: string | null;
    category_group_code?: string | null;
    category_code?: string | null;
  },
  groupCode: string | null | undefined,
) {
  if (!groupCode || groupCode === ALL_INGREDIENT_CATEGORY) {
    return true;
  }

  return getIngredientGroupFilterValue({
    category: ingredient.category,
    categoryGroupCode: ingredient.category_group_code,
    categoryCode: ingredient.category_code,
  }) === groupCode;
}

export function getLegacyCategoriesForIngredientGroup(
  groupCode: string | null | undefined,
): IngredientCategory[] {
  if (!isValidIngredientCategoryGroupCode(groupCode)) {
    return [];
  }

  return Array.from(new Set(
    INGREDIENT_SUBCATEGORIES
      .filter((category) => category.group_code === groupCode && category.is_active)
      .map((category) => category.legacy_category as IngredientCategory),
  ));
}

export function getIngredientTaxonomyMetadata({
  category,
  categoryCode,
}: {
  category: string | null | undefined;
  categoryCode?: string | null;
}): IngredientTaxonomyMetadata {
  const subcategory = getIngredientSubcategoryByCode(categoryCode);
  const group = getIngredientCategoryGroupByCode(subcategory?.group_code);

  if (subcategory && group?.is_active) {
    return {
      category_group_code: group.code,
      category_group_label: group.label,
      category_code: subcategory.code,
      category_label: subcategory.label,
    };
  }

  const fallbackCode = getFallbackIngredientSubcategoryCode(category);
  const fallbackSubcategory = getIngredientSubcategoryByCode(fallbackCode);
  const fallbackGroup = getIngredientCategoryGroupByCode(fallbackSubcategory?.group_code);
  const groupByLabel = INGREDIENT_CATEGORY_GROUPS.find(
    (group) => group.label === category?.trim() && group.is_active,
  );
  const legacyCategory = getIngredientCategoryByLabel(category)?.label ?? null;

  return {
    category_group_code: groupByLabel?.code ?? fallbackGroup?.code ?? null,
    category_group_label: groupByLabel?.label ?? fallbackGroup?.label ?? null,
    category_code: null,
    category_label: legacyCategory ?? groupByLabel?.label ?? null,
  };
}
