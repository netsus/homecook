const NUTRITION_LINK_SELECT = `
  id, ingredient_id, nutrition_profile_id, preparation_state, review_status, is_active, is_primary,
  nutrition_profiles(
    id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit, review_status, is_active,
    nutrition_values(profile_id, nutrient_code, amount, value_status),
    nutrition_source_items(
      id, source_id, review_status,
      nutrition_sources(
        id, provider_code, dataset_name, source_version, data_basis_date, license_name, source_url,
        review_status, freshness_status, is_active
      )
    )
  )
`;

const CONVERSION_ASSIGNMENT_SELECT = `
  id, ingredient_id, conversion_profile_id, evidence_id, preparation_state, review_status, is_active,
  measurement_conversion_profiles(
    id, code, basis_volume_ml, representative_weight_g, is_active
  ),
  measurement_source_evidence(
    id, source_id, evidence_kind, preparation_state, review_status, is_active,
    nutrition_sources(
      id, provider_code, dataset_name, source_version, data_basis_date, license_name, source_url,
      review_status, freshness_status, is_active
    )
  )
`;

const APPROVED_VOLUME_PROFILES = new Map([
  ["VOLUME_G6", 6],
  ["VOLUME_G10", 10],
  ["VOLUME_G15", 15],
  ["VOLUME_G20", 20],
  ["VOLUME_G25", 25],
]);

const ALLOWED_NUTRIENT_CODES = new Set([
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
  "sugars_g",
  "saturated_fat_g",
  "fiber_g",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function singleRelation(value) {
  if (Array.isArray(value)) return value.length === 1 && isRecord(value[0]) ? value[0] : null;
  return isRecord(value) ? value : null;
}

function compareUnicodeOrdinal(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalIngredientIds(ingredientIds) {
  if (!Array.isArray(ingredientIds) || ingredientIds.some((id) => !isNonEmptyText(id))) {
    throw new Error("INVALID_RECIPE_NUTRITION_PREDECESSOR_INPUT");
  }
  return [...new Set(ingredientIds)].sort(compareUnicodeOrdinal);
}

function approvedSource(source) {
  return isRecord(source) &&
    isNonEmptyText(source.id) &&
    source.review_status === "approved" &&
    source.freshness_status === "current" &&
    source.is_active === true &&
    isNonEmptyText(source.provider_code) &&
    isNonEmptyText(source.dataset_name) &&
    isNonEmptyText(source.source_version) &&
    (source.data_basis_date === null || isNonEmptyText(source.data_basis_date)) &&
    isNonEmptyText(source.license_name) &&
    isNonEmptyText(source.source_url);
}

function sourceProjection(source) {
  return {
    provider: source.provider_code,
    dataset: source.dataset_name,
    source_version: source.source_version,
    data_basis_date: source.data_basis_date,
    license: source.license_name,
    source_url: source.source_url,
  };
}

function nutritionCandidate(row) {
  if (!isRecord(row) || !isNonEmptyText(row.id) || !isNonEmptyText(row.ingredient_id) ||
    !isNonEmptyText(row.nutrition_profile_id) || !isNonEmptyText(row.preparation_state) ||
    row.review_status !== "approved" || row.is_active !== true || row.is_primary !== true) {
    return null;
  }

  const profile = singleRelation(row.nutrition_profiles);
  if (!profile || profile.id !== row.nutrition_profile_id ||
    profile.profile_kind !== "ingredient_source" ||
    !["mass_100g", "volume_100ml"].includes(profile.normalization_method) ||
    profile.review_status !== "approved" || profile.is_active !== true) {
    return null;
  }
  const basisAmount = safeNumber(profile.basis_amount);
  const expectedBasisUnit = profile.normalization_method === "mass_100g" ? "g" : "ml";
  if (basisAmount !== 100 || profile.basis_unit !== expectedBasisUnit) return null;

  const sourceItem = singleRelation(profile.nutrition_source_items);
  const source = sourceItem ? singleRelation(sourceItem.nutrition_sources) : null;
  if (!sourceItem || !isNonEmptyText(sourceItem.id) || !isNonEmptyText(sourceItem.source_id) ||
    sourceItem.review_status !== "approved" || !source || source.id !== sourceItem.source_id ||
    !approvedSource(source)) {
    return null;
  }

  if (!Array.isArray(profile.nutrition_values)) return null;
  const values = {};
  for (const value of profile.nutrition_values) {
    if (!isRecord(value) || value.profile_id !== undefined && value.profile_id !== profile.id ||
      !ALLOWED_NUTRIENT_CODES.has(value.nutrient_code) ||
      !["observed", "missing", "trace", "parse_error"].includes(value.value_status) ||
      Object.hasOwn(values, value.nutrient_code)) {
      return null;
    }
    const amount = value.amount === null ? null : safeNumber(value.amount);
    if ((value.value_status === "observed" && (amount === null || amount < 0)) ||
      (value.value_status !== "observed" && value.amount !== null)) {
      return null;
    }
    values[value.nutrient_code] = {
      amount,
      value_status: value.value_status,
    };
  }

  return {
    ingredientId: row.ingredient_id,
    preparationState: row.preparation_state,
    nutrition: {
      link: {
        id: row.id,
        review_status: row.review_status,
        is_active: row.is_active,
        is_primary: row.is_primary,
        preparation_state: row.preparation_state,
      },
      profile: {
        id: profile.id,
        basis_amount: basisAmount,
        basis_unit: profile.basis_unit,
        review_status: profile.review_status,
        is_active: profile.is_active,
        values,
      },
      source: {
        id: source.id,
        review_status: source.review_status,
        freshness_status: source.freshness_status,
        is_active: source.is_active,
        ...sourceProjection(source),
      },
    },
  };
}

function conversionCandidate(row) {
  if (!isRecord(row) || !isNonEmptyText(row.id) || !isNonEmptyText(row.ingredient_id) ||
    !isNonEmptyText(row.preparation_state) || row.review_status !== "approved" ||
    row.is_active !== true) {
    return null;
  }
  const profile = singleRelation(row.measurement_conversion_profiles);
  const evidence = singleRelation(row.measurement_source_evidence);
  const source = evidence ? singleRelation(evidence.nutrition_sources) : null;
  const expectedWeight = profile ? APPROVED_VOLUME_PROFILES.get(profile.code) : undefined;
  const basisVolume = profile ? safeNumber(profile.basis_volume_ml) : null;
  const representativeWeight = profile ? safeNumber(profile.representative_weight_g) : null;
  if (!profile || profile.id !== row.conversion_profile_id || profile.is_active !== true ||
    expectedWeight === undefined || basisVolume !== 15 || representativeWeight !== expectedWeight ||
    !evidence || evidence.id !== row.evidence_id || evidence.evidence_kind !== "volume_weight" ||
    evidence.preparation_state !== row.preparation_state || evidence.review_status !== "approved" ||
    evidence.is_active !== true || !source || source.id !== evidence.source_id || !approvedSource(source)) {
    return null;
  }

  return {
    ingredientId: row.ingredient_id,
    preparationState: row.preparation_state,
    assignment: {
      id: row.id,
      ingredient_id: row.ingredient_id,
      preparation_state: row.preparation_state,
      review_status: row.review_status,
      is_active: row.is_active,
      profile: {
        code: profile.code,
        basis_volume_ml: basisVolume,
        representative_weight_g: representativeWeight,
        is_active: profile.is_active,
      },
      evidence: {
        review_status: evidence.review_status,
        is_active: evidence.is_active,
        source: {
          id: source.id,
          review_status: source.review_status,
          freshness_status: source.freshness_status,
          is_active: source.is_active,
          ...sourceProjection(source),
        },
      },
    },
  };
}

function groupByIngredient(rows, projector) {
  const result = new Map();
  for (const row of rows) {
    const projected = projector(row);
    if (!projected) continue;
    const candidates = result.get(projected.ingredientId) ?? [];
    candidates.push(projected);
    result.set(projected.ingredientId, candidates);
  }
  return result;
}

function isVolumeUnit(unit) {
  return ["ml", "l", "tbsp", "tsp", "cup"].includes(
    typeof unit === "string" ? unit.trim().toLowerCase() : "",
  );
}

export async function loadRecipeNutritionPredecessors(client, ingredientIds) {
  const ids = canonicalIngredientIds(ingredientIds);
  if (ids.length === 0) return new Map();

  let linkResult;
  let assignmentResult;
  try {
    [linkResult, assignmentResult] = await Promise.all([
      client
        .from("ingredient_nutrition_profiles")
        .select(NUTRITION_LINK_SELECT)
        .in("ingredient_id", ids),
      client
        .from("ingredient_conversion_assignments")
        .select(CONVERSION_ASSIGNMENT_SELECT)
        .in("ingredient_id", ids),
    ]);
  } catch {
    throw new Error("RECIPE_NUTRITION_PREDECESSOR_READ_FAILED");
  }
  if (linkResult?.error || assignmentResult?.error ||
    !Array.isArray(linkResult?.data) || !Array.isArray(assignmentResult?.data)) {
    throw new Error("RECIPE_NUTRITION_PREDECESSOR_READ_FAILED");
  }

  const nutritionByIngredient = groupByIngredient(linkResult.data, nutritionCandidate);
  const conversionsByIngredient = groupByIngredient(assignmentResult.data, conversionCandidate);
  const predecessors = new Map();
  for (const ingredientId of ids) {
    const nutritionCandidates = nutritionByIngredient.get(ingredientId) ?? [];
    const selectedNutrition = nutritionCandidates.length === 1 ? nutritionCandidates[0] : null;
    const compatibleConversions = selectedNutrition
      ? (conversionsByIngredient.get(ingredientId) ?? []).filter((candidate) =>
        candidate.preparationState === selectedNutrition.preparationState
      )
      : [];
    predecessors.set(ingredientId, {
      preparation_state: selectedNutrition?.preparationState ?? null,
      nutrition: selectedNutrition?.nutrition,
      conversion_assignment: compatibleConversions.length === 1
        ? compatibleConversions[0].assignment
        : null,
      piece_weight: null,
    });
  }
  return predecessors;
}

export function hydrateRecipeNutritionIngredients(ingredients, predecessors) {
  return ingredients.map((ingredient) => {
    const predecessor = predecessors.get(ingredient.ingredient_id) ?? {
      preparation_state: null,
      nutrition: undefined,
      conversion_assignment: null,
      piece_weight: null,
    };
    return {
      id: ingredient.id,
      ingredient_id: ingredient.ingredient_id,
      amount: ingredient.amount,
      unit: ingredient.unit,
      ingredient_type: ingredient.ingredient_type,
      scalable: ingredient.scalable,
      preparation_state: predecessor.preparation_state,
      size_code: null,
      nutrition: predecessor.nutrition,
      conversion_assignment: predecessor.nutrition?.profile.basis_unit === "g" &&
          isVolumeUnit(ingredient.unit)
        ? predecessor.conversion_assignment
        : null,
      piece_weight: null,
    };
  });
}
