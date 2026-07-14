const MASS_UNITS = new Set(["g", "gram", "grams"]);
const VOLUME_UNITS = new Set(["ml", "milliliter", "milliliters"]);
const NUTRIENT_MAP = new Map([
  ["ENERC_KCAL", { nutrient_code: "energy_kcal", canonical_unit: "kcal" }],
  ["CHOCDF", { nutrient_code: "carbohydrate_g", canonical_unit: "g" }],
  ["PROT", { nutrient_code: "protein_g", canonical_unit: "g" }],
  ["PROCNT", { nutrient_code: "protein_g", canonical_unit: "g" }],
  ["FAT", { nutrient_code: "fat_g", canonical_unit: "g" }],
  ["NA", { nutrient_code: "sodium_mg", canonical_unit: "mg" }],
  ["SUGAR", { nutrient_code: "sugars_g", canonical_unit: "g" }],
  ["FASAT", { nutrient_code: "saturated_fat_g", canonical_unit: "g" }],
  ["FIBTG", { nutrient_code: "fiber_g", canonical_unit: "g" }],
]);

export class IngredientNutritionDomainError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "IngredientNutritionDomainError";
    this.code = code;
    this.details = details;
  }
}

function normalizedUnit(value) {
  if (typeof value !== "string") return null;
  const unit = value.trim().toLowerCase();
  if (MASS_UNITS.has(unit)) return "g";
  if (VOLUME_UNITS.has(unit)) return "ml";
  return unit || null;
}

function optionalMeasure(measure) {
  if (measure === null || measure === undefined) {
    return { text: null, amount: null, unit: null };
  }
  const amount = Number(measure.amount);
  return {
    text: typeof measure.text === "string" ? measure.text : null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: normalizedUnit(measure.unit),
  };
}

export function normalizeSourceItem(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new IngredientNutritionDomainError("SOURCE_ITEM_INVALID");
  }
  const basis = optionalMeasure(input.basis);
  const serving = optionalMeasure(input.serving);
  const totalContent = optionalMeasure(input.total_content);
  const ediblePercent = input.edible_portion === null || input.edible_portion === undefined
    ? null
    : Number(input.edible_portion.percent);
  if (
    ediblePercent !== null &&
    (!Number.isFinite(ediblePercent) || ediblePercent <= 0 || ediblePercent > 100)
  ) {
    throw new IngredientNutritionDomainError("EDIBLE_PORTION_INVALID");
  }

  let profile = null;
  if (basis.amount !== null && basis.unit === "g") {
    profile = {
      basis_amount: 100,
      basis_unit: "g",
      normalization_method: "mass_100g",
    };
  } else if (basis.amount !== null && basis.unit === "ml") {
    profile = {
      basis_amount: 100,
      basis_unit: "ml",
      normalization_method: "volume_100ml",
    };
  }

  return {
    external_item_key: input.external_item_key,
    external_name: input.external_name,
    preparation_state: input.preparation_state ?? null,
    source_basis_text: basis.text,
    source_basis_amount: basis.amount,
    source_basis_unit: basis.unit,
    source_serving_text: serving.text,
    source_serving_amount: serving.amount,
    source_serving_unit: serving.unit,
    source_total_content_text: totalContent.text,
    source_total_content_amount: totalContent.amount,
    source_total_content_unit: totalContent.unit,
    edible_portion_text:
      typeof input.edible_portion?.text === "string" ? input.edible_portion.text : null,
    edible_portion_percent: ediblePercent,
    profile,
  };
}

export function normalizeNutrientValue(input) {
  const mapping = NUTRIENT_MAP.get(input?.source_nutrient_code);
  if (!mapping) {
    throw new IngredientNutritionDomainError("NUTRIENT_CODE_UNSUPPORTED", {
      source_nutrient_code: input?.source_nutrient_code ?? null,
    });
  }

  const sourceToken = input.source_token;
  const common = {
    ...mapping,
    source_nutrient_code: input.source_nutrient_code,
    source_unit: input.source_unit ?? null,
    source_token: sourceToken ?? null,
  };
  const token = typeof sourceToken === "string" ? sourceToken.trim() : sourceToken;
  if (token === null || token === undefined || token === "" || token === "-") {
    return { ...common, amount: null, value_status: "missing" };
  }
  if (typeof token === "string" && ["trace", "tr", "미량"].includes(token.toLowerCase())) {
    return { ...common, amount: null, value_status: "trace" };
  }
  if (
    typeof input.source_unit !== "string" ||
    input.source_unit.trim().toLowerCase() !== mapping.canonical_unit
  ) {
    return { ...common, amount: null, value_status: "parse_error" };
  }
  const amount = Number(token);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ...common, amount: null, value_status: "parse_error" };
  }
  return { ...common, amount, value_status: "observed" };
}
