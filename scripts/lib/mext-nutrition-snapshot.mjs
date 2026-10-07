// Normalize only individually reviewed MEXT 100 g edible-portion table cells.
// Food identity and Japanese nutrient-column selection are reviewed separately.
const UNITS = Object.freeze({
  energy_kcal: 'kcal', carbohydrate_g: 'g', protein_g: 'g', fat_g: 'g',
  sodium_mg: 'mg', sugars_g: 'g', fiber_g: 'g', saturated_fat_g: 'g',
});

export function parseMextNutrientToken(token) {
  const source_token = token == null ? '' : String(token);
  const text = source_token.trim();
  if (text === '' || text === '-' || text === '－') {
    return { amount: null, missing_reason: text === '' ? 'not_provided' : 'unmeasured', source_token };
  }
  if (text === 'Tr' || text === '(Tr)') {
    return { amount: null, missing_reason: 'trace', source_token,
      ...(text === '(Tr)' ? { source_value_qualifier: 'estimated_trace' } : {}) };
  }
  const estimated = /^\((\d+(?:\.\d+)?)\)$/.exec(text);
  const numeric = estimated?.[1] ?? text;
  if (!/^\d+(?:\.\d+)?$/.test(numeric)) throw new Error('MEXT_INVALID_NUTRIENT_TOKEN');
  const amount = Number(numeric);
  if (!Number.isFinite(amount)) throw new Error('MEXT_INVALID_NUTRIENT_TOKEN');
  return { amount: Number(amount.toFixed(6)), missing_reason: null, source_token,
    ...(estimated ? { source_value_qualifier: amount === 0 ? 'assumed_zero' : 'borrowed_or_calculated' } : {}) };
}

export function normalizeMextReviewedFood(food) {
  if (!food || !/^\d{5}$/.test(String(food.id)) || !food.name?.trim()
      || food.basis?.amount !== 100 || food.basis?.unit !== 'g') {
    throw new Error('MEXT_INVALID_FOOD');
  }
  const values = {};
  for (const [code, unit] of Object.entries(UNITS)) {
    const cell = food.values?.[code];
    if (!cell || cell.unit !== unit) throw new Error('MEXT_INVALID_NUTRIENT_UNIT');
    values[code] = { ...parseMextNutrientToken(cell.source_token), unit,
      source_nutrient_code: cell.source_nutrient_code ?? `MEXT:${code}` };
  }
  return { external_item_key: String(food.id), external_name: food.name,
    basis: { amount: 100, unit: 'g' }, values,
    provenance: { provider: 'MEXT', edible_portion_basis: '可食部100g',
      original_cells: food.values,
      value_qualifiers: Object.fromEntries(Object.entries(values)
        .filter(([, value]) => value.source_value_qualifier)
        .map(([code, value]) => [code, { source_token: value.source_token, qualifier: value.source_value_qualifier }])),
      token_documentation: ['https://fooddb.mext.go.jp/help/help_r.html', 'https://fooddb.mext.go.jp/help.html'] } };
}
