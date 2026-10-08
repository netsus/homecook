import { describe, it, expect } from 'vitest';
import { validateAiNutritionEstimate, type AiNutritionEstimate } from '@/lib/server/ingredient-ai-nutrition-model';
const good = (): AiNutritionEstimate => ({ values: { energy_kcal: 25, carbohydrate_g: 4, protein_g: 2, fat_g: 0.2, sodium_mg: null, sugars_g: null, fiber_g: 2, saturated_fat_g: null }, assumptions: ['생것의 식용 잎과 순 100g', '소금·기름 무첨가'], uncertainty: 'high' });
describe('AI composition validation', () => {
  it('keeps unknowns distinct from a reported estimated zero', () => { const v = good(); v.values.fat_g = 0; expect(validateAiNutritionEstimate(v).values.sodium_mg).toBeNull(); expect(validateAiNutritionEstimate(v).values.fat_g).toBe(0); });
  it('requires all fields, explicit assumptions and an estimate category', () => { for (const v of [{ ...good(), assumptions: [] }, { ...good(), uncertainty: 'certain' }, { ...good(), values: { energy_kcal: 25 } }, { ...good(), source_url: 'https://fabricated.example' }])
    expect(() => validateAiNutritionEstimate(v)).toThrow(); });
  it('rejects negative, nonfinite and implausible magnitudes', () => { for (const amount of [-1, NaN, Infinity, 901]) {
    const v = good();
    v.values.energy_kcal = amount;
    expect(() => validateAiNutritionEstimate(v)).toThrow();
  } const v = good(); v.values.sodium_mg = 50000; expect(() => validateAiNutritionEstimate(v)).toThrow(); });
  it('rejects contradictory nutrient relationships without recalculating them', () => { for (const edit of [{ carbohydrate_g: 80, protein_g: 30 }, { sugars_g: 5 }, { saturated_fat_g: 1 }, { fiber_g: 5 }])
    expect(() => validateAiNutritionEstimate({ ...good(), values: { ...good().values, ...edit } })).toThrow(); });
  it('does not accept an all-unknown profile or automatically invent the missing core', () => { const v = good(); v.values = { energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null, sugars_g: null, fiber_g: null, saturated_fat_g: null } as never; expect(() => validateAiNutritionEstimate(v)).toThrow(); expect(validateAiNutritionEstimate(good()).values.sodium_mg).toBeNull(); });
  it('bounds free text and does not coerce string numbers', () => { const v = good(); expect(() => validateAiNutritionEstimate({ ...v, assumptions: ['x'.repeat(501)] })).toThrow(); expect(() => validateAiNutritionEstimate({ ...v, values: { ...v.values, energy_kcal: '25' } })).toThrow(); });
});
