// Official basis and source-value semantics:
// SR Legacy, section 4.5: https://www.ars.usda.gov/arsuserfiles/80400525/data/sr-legacy/sr-legacy_doc.pdf
// Foundation, Weights/Energy/LOQ: https://fdc.nal.usda.gov/Foundation_Foods_Documentation/
// Both report nutrients per 100 g edible portion. Foundation agricultural foods
// can have a dry-matter basis; retain the food description instead of inferring
// that every entry represents an as-sold ingredient.
const DOCUMENTATION = Object.freeze({
  sr: "https://www.ars.usda.gov/arsuserfiles/80400525/data/sr-legacy/sr-legacy_doc.pdf",
  foundation: "https://fdc.nal.usda.gov/Foundation_Foods_Documentation/",
});
const NUTRIENTS = Object.freeze([
  ["energy_kcal", "kcal", [1008], [2048, 2047, 1008]],
  ["carbohydrate_g", "g", [1005]],
  ["protein_g", "g", [1003]],
  ["fat_g", "g", [1004]],
  ["saturated_fat_g", "g", [1258]],
  ["sugars_g", "g", [1063, 2000]],
  ["fiber_g", "g", [1079]],
  ["sodium_mg", "mg", [1093]],
]);
const EXPECTED_UNITS = new Map(NUTRIENTS.flatMap(([, unit, ids, foundationIds]) =>
  [...new Set([...ids, ...(foundationIds ?? [])])].map((id) => [String(id), unit])
));
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tokenOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") fail("USDA_INVALID_TOKEN");
  return String(value);
}

function numberOf(token) {
  if (!NUMBER.test(token.trim())) fail("USDA_INVALID_NUMBER");
  const value = Number(token);
  if (!Number.isFinite(value) || value < 0) fail("USDA_INVALID_NUMBER");
  return value;
}

// Decimal half-up, matching nonnegative PostgreSQL numeric scale 6. Rounding
// uses the published token, not binary floating point or a min/max/median.
function roundSix(token) {
  const match = token.trim().match(/^[+-]?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  const fractional = match[2] ?? "";
  const digits = BigInt((match[1] || "0") + fractional);
  const power = 6 + Number(match[3] ?? 0) - fractional.length;
  // A finite numeric zero can use arbitrarily large exponent notation.
  if (digits === 0n || Number(token) === 0) return 0;
  const divisor = power < 0 ? 10n ** BigInt(-power) : 1n;
  const scaled = power < 0
    ? (digits + divisor / 2n) / divisor
    : digits * 10n ** BigInt(power);
  return Number(scaled) / 1_000_000;
}

function normalizeRecord(record) {
  const expected = EXPECTED_UNITS.get(record.id);
  if (typeof record.unit !== "string" || record.unit.trim().toLowerCase() !== expected) {
    fail("USDA_UNIT_MISMATCH");
  }
  const sourceToken = tokenOf(record.token);
  const token = sourceToken?.trim() ?? "";
  const value = {
    amount: null,
    unit: expected,
    missing_reason: "absent",
    source_token: sourceToken,
    source_nutrient_code: record.id,
  };
  const loqToken = tokenOf(record.loq);
  const bounded = /^<\s*(.+)$/.exec(token);
  if (bounded || (loqToken !== null && loqToken.trim() !== "")) {
    const textualLimit = bounded && !/^loq$/i.test(bounded[1]) ? bounded[1] : null;
    const numericLimit = textualLimit === null ? null : numberOf(textualLimit);
    const fieldLimit = loqToken === null || loqToken.trim() === "" ? null : numberOf(loqToken);
    if (numericLimit !== null && fieldLimit !== null && numericLimit !== fieldLimit) {
      fail("USDA_CONFLICTING_LOQ");
    }
    if (!bounded && token !== "") numberOf(token);
    value.missing_reason = "below_loq";
    value.source_value_qualifier = "below_quantification_limit";
    value.limit_of_quantification = fieldLimit ?? numericLimit;
    value.source_limit_token = loqToken ?? textualLimit;
  } else if (sourceToken === null) {
    // No amount: never promote a statistical summary to a reported amount.
  } else if (token === "") {
    value.missing_reason = "blank";
  } else if (token === "-") {
    value.missing_reason = "dash";
  } else if (/^(?:tr|trace)$/i.test(token)) {
    value.missing_reason = "trace";
  } else if (/^(?:nd|n\/d|not detected)$/i.test(token)) {
    value.missing_reason = "not_detected";
  } else {
    numberOf(token);
    value.amount = roundSix(token);
    if (!Number.isFinite(value.amount)) fail("USDA_INVALID_NUMBER");
    value.missing_reason = null;
  }
  // Duplicate conflicts are checked before scale-6 rounding could hide them.
  const identity = JSON.stringify({
    amount: value.missing_reason === null ? numberOf(token) : null,
    reason: value.missing_reason,
    unit: expected,
    loq: value.limit_of_quantification ?? null,
  });
  return { value, identity };
}

function normalizeFood(food, kind, records, fdcId) {
  if (!/^[1-9]\d*$/.test(String(fdcId)) || typeof food.description !== "string" ||
      food.description.trim() === "") fail("USDA_INVALID_FOOD");
  const byId = new Map();
  for (const record of records) {
    if (!EXPECTED_UNITS.has(record.id)) continue;
    const normalized = normalizeRecord(record);
    const previous = byId.get(record.id);
    if (previous && previous.identity !== normalized.identity) fail("USDA_DUPLICATE_NUTRIENT_CONFLICT");
    if (previous) previous.source_rows.push(structuredClone(record.sourceRow));
    else byId.set(record.id, { ...normalized, source_rows: [structuredClone(record.sourceRow)] });
  }
  const values = {};
  const selection = {};
  for (const [code, unit, srIds, foundationIds] of NUTRIENTS) {
    const priority = kind === "foundation" ? foundationIds ?? srIds : srIds;
    // Prefer the first present ID, preserving its missing/LOQ semantics instead
    // of masking them with a lower-priority legacy value.
    const selectedId = priority.map(String).find((id) => byId.has(id));
    const selected = byId.get(selectedId);
    values[code] = selected?.value ?? {
      amount: null, unit, missing_reason: "absent", source_token: null, source_nutrient_code: null,
    };
    selection[code] = {
      priority_ids: priority.map(String),
      selected_id: selectedId ?? null,
      selected_source_rows: selected?.source_rows ?? [],
    };
  }
  return {
    external_item_key: String(fdcId),
    external_name: food.description,
    basis: { amount: 100, unit: "g" },
    values,
    provenance: {
      provider: "USDA FoodData Central",
      data_type: kind === "sr" ? "SR Legacy" : "Foundation",
      documentation_url: DOCUMENTATION[kind],
      basis_note: "100 g edible portion, in the food's reported state; not automatically as sold.",
      value_policy: "Published amount only; values can be analytical, calculated, imputed or assumed. Derivation and source rows are preserved; no nutrient totals are calculated here.",
      selection_policy: "First present nutrient ID; energy SR 1008, Foundation 2048 > 2047 > 1008; sugars 1063 > 2000. Missing or LOQ values do not fall through to a lower-priority ID.",
      nutrient_selection: selection,
      source_food: structuredClone(food),
    },
  };
}

export function normalizeUsdaSrFood(foodRow) {
  if (!isObject(foodRow) || foodRow.data_type !== "sr_legacy_food" || !isObject(foodRow.values)) {
    fail("USDA_INVALID_SR_FOOD");
  }
  const records = Object.values(foodRow.values).map((entry) => {
    if (!isObject(entry) || !isObject(entry.source_row)) fail("USDA_SOURCE_ROW_MISSING");
    const raw = entry.source_row;
    const id = String(entry.source_nutrient_code ?? raw.nutrient_id);
    if (String(raw.nutrient_id) !== id || String(raw.fdc_id) !== String(foodRow.fdc_id)) {
      fail("USDA_SOURCE_ID_MISMATCH");
    }
    const rawToken = tokenOf(raw.amount);
    if (entry.source_token !== undefined && tokenOf(entry.source_token) !== rawToken) {
      fail("USDA_SOURCE_TOKEN_MISMATCH");
    }
    return {
      id,
      unit: entry.unit,
      token: rawToken,
      loq: raw.loq ?? raw.limit_of_quantification ?? entry.loq,
      sourceRow: raw,
    };
  });
  return normalizeFood(foodRow, "sr", records, foodRow.fdc_id);
}

export function normalizeUsdaFoundationFood(rawFood) {
  if (!isObject(rawFood) || rawFood.dataType !== "Foundation" || !Array.isArray(rawFood.foodNutrients)) {
    fail("USDA_INVALID_FOUNDATION_FOOD");
  }
  const records = rawFood.foodNutrients.map((row) => {
    if (!isObject(row) || !isObject(row.nutrient)) fail("USDA_INVALID_NUTRIENT_ROW");
    return {
      id: String(row.nutrient.id),
      unit: row.nutrient.unitName,
      token: row.amount,
      loq: row.loq ?? row.limitOfQuantification,
      sourceRow: row,
    };
  });
  return normalizeFood(rawFood, "foundation", records, rawFood.fdcId);
}
