export const DEMO_PANTRY_INGREDIENTS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440010",
    standard_name: "양파",
    category: "채소",
    default_unit: "개",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440011",
    standard_name: "대파",
    category: "채소",
    default_unit: "대",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440012",
    standard_name: "소고기",
    category: "육류",
    default_unit: "g",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440013",
    standard_name: "김치",
    category: "기타",
    default_unit: "g",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440014",
    standard_name: "돼지고기",
    category: "육류",
    default_unit: "g",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440015",
    standard_name: "소금",
    category: "양념",
    default_unit: null,
  },
];

export const DEMO_PANTRY_INGREDIENT_IDS = [
  "550e8400-e29b-41d4-a716-446655440013",
  "550e8400-e29b-41d4-a716-446655440014",
  "550e8400-e29b-41d4-a716-446655440010",
  "550e8400-e29b-41d4-a716-446655440011",
];

const DEMO_PANTRY_ITEM_IDS = [
  "660e8400-e29b-41d4-a716-446655440401",
  "660e8400-e29b-41d4-a716-446655440402",
  "660e8400-e29b-41d4-a716-446655440403",
  "660e8400-e29b-41d4-a716-446655440404",
];

export const DEMO_PANTRY_BUNDLES = [
  {
    id: "660e8400-e29b-41d4-a716-446655440501",
    name: "조미료 모음",
    display_order: 1,
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440502",
    name: "김치찌개 모음",
    display_order: 2,
  },
];

export const DEMO_PANTRY_BUNDLE_ITEMS = [
  {
    id: "660e8400-e29b-41d4-a716-446655440511",
    bundle_id: "660e8400-e29b-41d4-a716-446655440501",
    ingredient_id: "550e8400-e29b-41d4-a716-446655440015",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440521",
    bundle_id: "660e8400-e29b-41d4-a716-446655440502",
    ingredient_id: "550e8400-e29b-41d4-a716-446655440013",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440522",
    bundle_id: "660e8400-e29b-41d4-a716-446655440502",
    ingredient_id: "550e8400-e29b-41d4-a716-446655440014",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440523",
    bundle_id: "660e8400-e29b-41d4-a716-446655440502",
    ingredient_id: "550e8400-e29b-41d4-a716-446655440010",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440524",
    bundle_id: "660e8400-e29b-41d4-a716-446655440502",
    ingredient_id: "550e8400-e29b-41d4-a716-446655440011",
  },
];

function resolveIngredientId(ingredientId, ingredientIdByFixtureId) {
  return ingredientIdByFixtureId.get(ingredientId) ?? ingredientId;
}

export function buildDemoPantryItemRows(userId, ingredientIdByFixtureId = new Map()) {
  const createdAt = "2026-03-01T00:00:00.000Z";

  return DEMO_PANTRY_INGREDIENT_IDS.map((ingredientId, index) => ({
    id: DEMO_PANTRY_ITEM_IDS[index],
    user_id: userId,
    ingredient_id: resolveIngredientId(ingredientId, ingredientIdByFixtureId),
    created_at: createdAt,
  }));
}

export function buildDemoPantryBundleItemRows(ingredientIdByFixtureId = new Map()) {
  return DEMO_PANTRY_BUNDLE_ITEMS.map((item) => ({
    ...item,
    ingredient_id: resolveIngredientId(item.ingredient_id, ingredientIdByFixtureId),
  }));
}
