export interface CookingMethodCategoryEntry {
  code: string;
  label: string;
  display_order: number;
  is_active: boolean;
}

export interface CanonicalCookingMethodEntry {
  code: string;
  label: string;
  category_code: string;
  color_key: string;
  display_order: number;
  is_system: boolean;
}

export interface CookingMethodSynonymEntry {
  method_code: string;
  synonym: string;
  match_kind: "exact" | "contains" | "regex";
  is_active: boolean;
}

export const COOKING_METHOD_CATEGORIES = [
  { code: "prep_handling", label: "준비/손질", display_order: 10, is_active: true },
  { code: "preprocessing", label: "전처리", display_order: 20, is_active: true },
  { code: "moist_heat", label: "물/수분 조리", display_order: 30, is_active: true },
  { code: "pan_oil", label: "팬/기름 조리", display_order: 40, is_active: true },
  { code: "mix_braise", label: "혼합/조림", display_order: 50, is_active: true },
  { code: "appliance", label: "기기 조리", display_order: 60, is_active: true },
] as const satisfies readonly CookingMethodCategoryEntry[];

export type CookingMethodCategoryCode =
  (typeof COOKING_METHOD_CATEGORIES)[number]["code"];

export const CANONICAL_COOKING_METHODS = [
  {
    code: "slice",
    label: "썰기",
    category_code: "prep_handling",
    color_key: "gray",
    display_order: 10,
    is_system: true,
  },
  {
    code: "mince",
    label: "다지기",
    category_code: "prep_handling",
    color_key: "gray",
    display_order: 20,
    is_system: true,
  },
  {
    code: "thaw",
    label: "해동",
    category_code: "preprocessing",
    color_key: "gray",
    display_order: 30,
    is_system: true,
  },
  {
    code: "pre_season",
    label: "밑간",
    category_code: "preprocessing",
    color_key: "green",
    display_order: 40,
    is_system: true,
  },
  {
    code: "pickle",
    label: "절이기",
    category_code: "preprocessing",
    color_key: "green",
    display_order: 50,
    is_system: true,
  },
  {
    code: "boil",
    label: "끓이기",
    category_code: "moist_heat",
    color_key: "red",
    display_order: 60,
    is_system: true,
  },
  {
    code: "parboil",
    label: "삶기",
    category_code: "moist_heat",
    color_key: "red",
    display_order: 70,
    is_system: true,
  },
  {
    code: "blanch",
    label: "데치기",
    category_code: "moist_heat",
    color_key: "lime",
    display_order: 80,
    is_system: true,
  },
  {
    code: "steam",
    label: "찌기",
    category_code: "moist_heat",
    color_key: "blue",
    display_order: 90,
    is_system: true,
  },
  {
    code: "stir_fry",
    label: "볶기",
    category_code: "pan_oil",
    color_key: "orange",
    display_order: 100,
    is_system: true,
  },
  {
    code: "grill",
    label: "굽기",
    category_code: "pan_oil",
    color_key: "brown",
    display_order: 110,
    is_system: true,
  },
  {
    code: "pan_fry",
    label: "부치기",
    category_code: "pan_oil",
    color_key: "yellow",
    display_order: 120,
    is_system: true,
  },
  {
    code: "deep_fry",
    label: "튀기기",
    category_code: "pan_oil",
    color_key: "yellow",
    display_order: 130,
    is_system: true,
  },
  {
    code: "mix",
    label: "섞기",
    category_code: "mix_braise",
    color_key: "gray",
    display_order: 140,
    is_system: true,
  },
  {
    code: "toss",
    label: "무치기",
    category_code: "mix_braise",
    color_key: "green",
    display_order: 150,
    is_system: true,
  },
  {
    code: "braise",
    label: "조리기",
    category_code: "mix_braise",
    color_key: "red",
    display_order: 160,
    is_system: true,
  },
  {
    code: "reduce",
    label: "졸이기",
    category_code: "mix_braise",
    color_key: "red",
    display_order: 170,
    is_system: true,
  },
  {
    code: "microwave",
    label: "전자레인지",
    category_code: "appliance",
    color_key: "gray",
    display_order: 180,
    is_system: true,
  },
  {
    code: "oven_bake",
    label: "오븐굽기",
    category_code: "appliance",
    color_key: "brown",
    display_order: 190,
    is_system: true,
  },
  {
    code: "air_fryer",
    label: "에어프라이어",
    category_code: "appliance",
    color_key: "yellow",
    display_order: 200,
    is_system: true,
  },
] as const satisfies readonly CanonicalCookingMethodEntry[];

export type CanonicalCookingMethodCode =
  (typeof CANONICAL_COOKING_METHODS)[number]["code"];

export const COOKING_METHOD_SYNONYMS = [
  { method_code: "slice", synonym: "채썰기", match_kind: "exact", is_active: true },
  { method_code: "slice", synonym: "잘라요", match_kind: "contains", is_active: true },
  { method_code: "mince", synonym: "곱게 다지기", match_kind: "contains", is_active: true },
  { method_code: "pre_season", synonym: "재우기", match_kind: "exact", is_active: true },
  { method_code: "pre_season", synonym: "밑간해", match_kind: "contains", is_active: true },
  { method_code: "boil", synonym: "끓여요", match_kind: "contains", is_active: true },
  { method_code: "parboil", synonym: "삶아요", match_kind: "contains", is_active: true },
  { method_code: "steam", synonym: "쪄요", match_kind: "contains", is_active: true },
  { method_code: "stir_fry", synonym: "팬에 볶기", match_kind: "contains", is_active: true },
  { method_code: "grill", synonym: "노릇하게", match_kind: "contains", is_active: true },
  { method_code: "pan_fry", synonym: "부쳐요", match_kind: "contains", is_active: true },
  { method_code: "deep_fry", synonym: "튀겨요", match_kind: "contains", is_active: true },
  { method_code: "toss", synonym: "버무리기", match_kind: "exact", is_active: true },
  { method_code: "braise", synonym: "조려요", match_kind: "contains", is_active: true },
  { method_code: "reduce", synonym: "졸여요", match_kind: "contains", is_active: true },
  { method_code: "microwave", synonym: "전자렌지", match_kind: "exact", is_active: true },
  { method_code: "oven_bake", synonym: "오븐", match_kind: "contains", is_active: true },
  { method_code: "air_fryer", synonym: "에어프라이어에", match_kind: "contains", is_active: true },
] as const satisfies readonly CookingMethodSynonymEntry[];

export interface CookingMethodTaxonomyMetadata {
  category_code: CookingMethodCategoryCode | null;
  category_label: string | null;
}

const COOKING_METHOD_CATEGORY_BY_CODE = new Map<
  string,
  (typeof COOKING_METHOD_CATEGORIES)[number]
>(COOKING_METHOD_CATEGORIES.map((category) => [category.code, category]));

const CANONICAL_COOKING_METHOD_BY_CODE = new Map<
  string,
  (typeof CANONICAL_COOKING_METHODS)[number]
>(CANONICAL_COOKING_METHODS.map((method) => [method.code, method]));

export function getCookingMethodCategoryByCode(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return COOKING_METHOD_CATEGORY_BY_CODE.get(code.trim());
}

export function getCanonicalCookingMethodByCode(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return CANONICAL_COOKING_METHOD_BY_CODE.get(code.trim());
}

export function isCanonicalCookingMethodCode(
  code: string | null | undefined,
): code is CanonicalCookingMethodCode {
  return getCanonicalCookingMethodByCode(code) !== undefined;
}

export function isValidCookingMethodCategoryCode(
  code: string | null | undefined,
): code is CookingMethodCategoryCode {
  return getCookingMethodCategoryByCode(code)?.is_active === true;
}

export function getCookingMethodTaxonomyMetadata({
  methodCode,
  categoryCode,
}: {
  methodCode: string | null | undefined;
  categoryCode?: string | null;
}): CookingMethodTaxonomyMetadata {
  const explicitCategory = getCookingMethodCategoryByCode(categoryCode);
  if (explicitCategory?.is_active) {
    return {
      category_code: explicitCategory.code,
      category_label: explicitCategory.label,
    };
  }

  const canonicalMethod = getCanonicalCookingMethodByCode(methodCode);
  const canonicalCategory = getCookingMethodCategoryByCode(canonicalMethod?.category_code);

  return {
    category_code: canonicalCategory?.code ?? null,
    category_label: canonicalCategory?.label ?? null,
  };
}

export function getCookingMethodSynonyms(methodCode: string | null | undefined) {
  if (!methodCode) {
    return [];
  }

  return COOKING_METHOD_SYNONYMS
    .filter((synonym) => synonym.method_code === methodCode.trim() && synonym.is_active)
    .map((synonym) => synonym.synonym);
}
