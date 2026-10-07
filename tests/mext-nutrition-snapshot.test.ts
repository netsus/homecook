import { describe, expect, it } from 'vitest';
import { normalizeMextReviewedFood, parseMextNutrientToken } from '../scripts/lib/mext-nutrition-snapshot.mjs';

describe('reviewed MEXT nutrition cells', () => {
  it('distinguishes a published zero from absent or unmeasured data', () => {
    expect(parseMextNutrientToken('0').amount).toBe(0);
    for (const token of ['', '-', '－', null]) expect(parseMextNutrientToken(token).amount).toBeNull();
  });
  it('retains trace and estimated trace without inventing a number', () => {
    expect(parseMextNutrientToken('Tr')).toMatchObject({ amount: null, missing_reason: 'trace', source_token: 'Tr' });
    expect(parseMextNutrientToken('(Tr)')).toMatchObject({ amount: null, source_value_qualifier: 'estimated_trace' });
  });
  it('retains an officially estimated number and its original notation', () => {
    expect(parseMextNutrientToken('(0.03)')).toEqual({ amount: 0.03, missing_reason: null, source_token: '(0.03)', source_value_qualifier: 'borrowed_or_calculated' });
    expect(parseMextNutrientToken('(0)')).toMatchObject({ amount: 0, source_value_qualifier: 'assumed_zero' });
  });
  it('rejects signs, upper limits, percentages and unreviewed commentary', () => {
    for (const token of ['-1', '<0.1', '12%', 'Na: 12', 'NaN', '(1)注']) expect(() => parseMextNutrientToken(token)).toThrow('MEXT_INVALID_NUTRIENT_TOKEN');
  });
  it('does not confuse sodium mg with salt g or accept a serving basis', () => {
    const values = Object.fromEntries(['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg','sugars_g','fiber_g','saturated_fat_g'].map(code => [code, { source_token: '0', unit: code === 'energy_kcal' ? 'kcal' : code === 'sodium_mg' ? 'mg' : 'g' }]));
    const food = { id: '13055', name: 'マスカルポーネ', basis: { amount: 100, unit: 'g' }, values };
    expect(normalizeMextReviewedFood(food).values).toMatchObject({
      sodium_mg: { amount: 0 },
    });
    expect(() => normalizeMextReviewedFood({ ...food, basis: { amount: 1, unit: 'serving' } })).toThrow('MEXT_INVALID_FOOD');
    values.sodium_mg.unit = 'g';
    expect(() => normalizeMextReviewedFood(food)).toThrow('MEXT_INVALID_NUTRIENT_UNIT');
  });
});
