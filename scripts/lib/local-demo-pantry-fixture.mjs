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

export function buildDemoPantryItemRows(userId) {
  const createdAt = "2026-03-01T00:00:00.000Z";

  return DEMO_PANTRY_INGREDIENT_IDS.map((ingredientId, index) => ({
    id: DEMO_PANTRY_ITEM_IDS[index],
    user_id: userId,
    ingredient_id: ingredientId,
    created_at: createdAt,
  }));
}
