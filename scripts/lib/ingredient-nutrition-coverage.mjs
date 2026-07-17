import { canonicalStringify, sha256 } from "./public-nutrition-pipeline.mjs";

const ALLOWED_EXCLUSION_REASONS = new Set([
  "NON_INGESTED_PROCESS_INPUT",
  "UNBOUNDED_COMPOSITE",
  "CANONICAL_IDENTITY_INVALID",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function canonicalTextArray(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function stableItemKey(providerCode, externalItemKey, fingerprint) {
  return `${providerCode ?? ""}::${externalItemKey}::${fingerprint}`;
}

function withChecksum(body) {
  return { ...body, checksum: sha256(body) };
}

export class IngredientNutritionCoverageError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "IngredientNutritionCoverageError";
    this.code = code;
    this.details = details;
  }
}

export function buildInventoryArtifact(input) {
  if (
    !isRecord(input) ||
    !Array.isArray(input.ingredients) ||
    !nonEmptyText(input.query_version)
  ) {
    throw new IngredientNutritionCoverageError("INVENTORY_INPUT_INVALID");
  }

  const seenIngredientIds = new Set();
  const rows = input.ingredients.map((ingredient) => {
    if (!isRecord(ingredient) || !nonEmptyText(ingredient.ingredient_id) || !nonEmptyText(ingredient.canonical_name)) {
      throw new IngredientNutritionCoverageError("INVENTORY_ROW_INVALID");
    }
    const ingredientId = ingredient.ingredient_id.trim();
    if (seenIngredientIds.has(ingredientId)) {
      throw new IngredientNutritionCoverageError("INVENTORY_DUPLICATE_ID", {
        ingredient_id: ingredientId,
      });
    }
    seenIngredientIds.add(ingredientId);

    return {
      ingredient_id: ingredientId,
      canonical_name: ingredient.canonical_name.trim(),
      category_code: typeof ingredient.category_code === "string" ? ingredient.category_code.trim() || null : null,
      category_name: typeof ingredient.category_name === "string" ? ingredient.category_name.trim() || null : null,
      default_unit: typeof ingredient.default_unit === "string" ? ingredient.default_unit.trim() || null : null,
      synonyms: canonicalTextArray(ingredient.synonyms),
    };
  }).sort((left, right) => left.ingredient_id.localeCompare(right.ingredient_id));

  const artifact = {
    schema_version: "ingredient-nutrition-inventory-v1",
    scope: "all-active",
    query_version: input.query_version.trim(),
    row_count: rows.length,
    rows,
  };

  return withChecksum(artifact);
}

function validateDecisionEnvelope(decision) {
  if (
    !isRecord(decision) ||
    decision.schema_version !== "ingredient-nutrition-decision-v1" ||
    !nonEmptyText(decision.inventory_checksum) ||
    !Array.isArray(decision.decisions)
  ) {
    throw new IngredientNutritionCoverageError("DECISION_ARTIFACT_INVALID");
  }
  return decision;
}

function validateEligibleDecision(entry, approvedItemKeys, expectedProviderCode) {
  if (
    !nonEmptyText(entry.provider_code) ||
    !nonEmptyText(entry.external_item_key) ||
    !nonEmptyText(entry.source_item_fingerprint)
  ) {
    throw new IngredientNutritionCoverageError("DECISION_ELIGIBLE_INVALID", {
      ingredient_id: entry.ingredient_id ?? null,
    });
  }

  if (
    expectedProviderCode !== undefined &&
    entry.provider_code !== expectedProviderCode
  ) {
    throw new IngredientNutritionCoverageError("DECISION_PROVIDER_MISMATCH", {
      ingredient_id: entry.ingredient_id,
      expected_provider_code: expectedProviderCode,
      provider_code: entry.provider_code,
    });
  }

  const key = stableItemKey(
    entry.provider_code.trim(),
    entry.external_item_key.trim(),
    entry.source_item_fingerprint.trim(),
  );
  if (!approvedItemKeys.has(key)) {
    throw new IngredientNutritionCoverageError("ELIGIBLE_SOURCE_ITEM_NOT_FOUND", {
      ingredient_id: entry.ingredient_id,
      external_item_key: entry.external_item_key,
    });
  }
}

function validateExcludedDecision(entry) {
  if (!ALLOWED_EXCLUSION_REASONS.has(entry.reason_code)) {
    throw new IngredientNutritionCoverageError("DECISION_REASON_NOT_ALLOWED", {
      ingredient_id: entry.ingredient_id ?? null,
      reason_code: entry.reason_code ?? null,
    });
  }
  if (
    !nonEmptyText(entry.reviewed_by) ||
    !nonEmptyText(entry.reviewed_at) ||
    !Number.isFinite(Date.parse(entry.reviewed_at)) ||
    !nonEmptyText(entry.reason)
  ) {
    throw new IngredientNutritionCoverageError("DECISION_EXCLUDED_INVALID", {
      ingredient_id: entry.ingredient_id ?? null,
    });
  }
}

export function validateCoverageDecisionArtifact(input) {
  if (
    !isRecord(input) ||
    !isRecord(input.inventory) ||
    !Array.isArray(input.approved_items)
  ) {
    throw new IngredientNutritionCoverageError("DECISION_INPUT_INVALID");
  }

  const inventory = input.inventory;
  const decision = validateDecisionEnvelope(input.decision);
  const inventoryBody = {
    schema_version: inventory.schema_version,
    scope: inventory.scope,
    query_version: inventory.query_version,
    row_count: inventory.row_count,
    rows: inventory.rows,
  };
  if (
    inventory.checksum !== sha256(inventoryBody) ||
    decision.inventory_checksum !== inventory.checksum
  ) {
    throw new IngredientNutritionCoverageError("INVENTORY_CHECKSUM_MISMATCH");
  }

  const inventoryIds = new Set(
    Array.isArray(inventory.rows)
      ? inventory.rows.map((row) => row?.ingredient_id).filter(nonEmptyText)
      : [],
  );
  if (inventoryIds.size !== inventory.row_count) {
    throw new IngredientNutritionCoverageError("INVENTORY_ARTIFACT_INVALID");
  }

  const approvedItemKeys = new Set();
  for (const item of input.approved_items) {
    if (!isRecord(item) || !nonEmptyText(item.external_item_key) || !nonEmptyText(item.fingerprint)) {
      throw new IngredientNutritionCoverageError("APPROVED_ITEM_INVALID");
    }
    const provider = typeof item.provider_code === "string"
      ? item.provider_code.trim()
      : typeof input.expected_provider_code === "string"
        ? input.expected_provider_code.trim()
        : "";
    const key = stableItemKey(provider, item.external_item_key.trim(), item.fingerprint.trim());
    if (approvedItemKeys.has(key)) {
      throw new IngredientNutritionCoverageError("ELIGIBLE_SOURCE_ITEM_AMBIGUOUS", {
        external_item_key: item.external_item_key,
      });
    }
    approvedItemKeys.add(key);
  }

  const seenIds = new Set();
  let excludedCount = 0;
  let eligibleCount = 0;

  for (const entry of decision.decisions) {
    if (!isRecord(entry) || !nonEmptyText(entry.ingredient_id)) {
      throw new IngredientNutritionCoverageError("DECISION_ENTRY_INVALID");
    }
    const ingredientId = entry.ingredient_id.trim();
    if (!inventoryIds.has(ingredientId) || seenIds.has(ingredientId)) {
      throw new IngredientNutritionCoverageError("DECISION_BIJECTION_INVALID", {
        ingredient_id: ingredientId,
      });
    }
    seenIds.add(ingredientId);

    if (entry.classification === "eligible") {
      validateEligibleDecision(entry, approvedItemKeys, input.expected_provider_code);
      eligibleCount += 1;
      continue;
    }

    if (entry.classification === "excluded") {
      validateExcludedDecision(entry);
      excludedCount += 1;
      continue;
    }

    throw new IngredientNutritionCoverageError("DECISION_CLASSIFICATION_INVALID", {
      ingredient_id: ingredientId,
      classification: entry.classification ?? null,
    });
  }

  if (seenIds.size !== inventoryIds.size) {
    throw new IngredientNutritionCoverageError("DECISION_BIJECTION_INVALID", {
      expected: inventoryIds.size,
      actual: seenIds.size,
    });
  }

  return {
    schema_version: "ingredient-nutrition-coverage-report-v1",
    inventory_checksum: inventory.checksum,
    coverage_decision_checksum: sha256(canonicalStringify(decision)),
    denominator_count: inventoryIds.size,
    approved_exactly_one_count: 0,
    excluded_count: excludedCount,
    eligible_without_profile: eligibleCount,
    unclassified: inventoryIds.size - excludedCount,
    classification_conflict: 0,
    multiple_qualified_primary: 0,
  };
}
