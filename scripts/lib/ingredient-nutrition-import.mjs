import { canonicalStringify, sha256 } from "./public-nutrition-pipeline.mjs";

const HANDOFF_LIFECYCLE = Object.freeze([
  "raw",
  "staged",
  "normalized",
  "reviewed",
  "approved_pinned",
]);

export class IngredientNutritionImportError extends Error {
  constructor(code, details = {}, summary = undefined) {
    super(code);
    this.name = "IngredientNutritionImportError";
    this.code = code;
    this.details = details;
    if (summary !== undefined) this.summary = summary;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function validateHandoffBundle(bundle) {
  const manifest = bundle?.approved_manifest;
  const checksumInput = isRecord(bundle) ? { ...bundle } : {};
  delete checksumInput.handoff_checksum;
  const valid =
    isRecord(bundle) &&
    bundle.schema_version === "public-nutrition-handoff-v1" &&
    bundle.status === "approved_pinned" &&
    canonicalStringify(bundle.lifecycle) === canonicalStringify(HANDOFF_LIFECYCLE) &&
    isRecord(manifest) &&
    nonEmptyText(bundle.logical_batch_id) &&
    manifest.logical_batch_id === bundle.logical_batch_id &&
    nonEmptyText(manifest.provider) &&
    nonEmptyText(manifest.dataset) &&
    nonEmptyText(manifest.source_version) &&
    nonEmptyText(manifest.raw_sha256) &&
    nonEmptyText(manifest.normalized_content_hash) &&
    nonEmptyText(manifest.review_checksum) &&
    bundle.normalized_content_hash === manifest.normalized_content_hash &&
    bundle.review_checksum === manifest.review_checksum &&
    Array.isArray(bundle.approved_items) &&
    Array.isArray(bundle.public_attribution) &&
    Array.isArray(bundle.measurement_evidence) &&
    bundle.production_db_writes === 0 &&
    nonEmptyText(bundle.handoff_checksum) &&
    bundle.handoff_checksum === sha256(checksumInput);

  if (!valid) {
    throw new IngredientNutritionImportError("INVALID_HANDOFF_BUNDLE");
  }
  assertPrSafeValue(bundle);
  return structuredClone(bundle);
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === left.length &&
    rightSet.size === right.length &&
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => typeof value === "string" && rightSet.has(value))
  );
}

export function validatePilotScope(actual, expected) {
  const valid =
    isRecord(actual) &&
    isRecord(expected) &&
    Array.isArray(actual.recipe_ids) &&
    actual.recipe_ids.length === 30 &&
    sameStringSet(actual.recipe_ids, expected.recipe_ids) &&
    sameStringSet(actual.ingredient_ids, expected.ingredient_ids);
  if (!valid) {
    throw new IngredientNutritionImportError("PILOT_SCOPE_MISMATCH");
  }
  return {
    scope_recipe_count: actual.recipe_ids.length,
    scope_ingredient_count: actual.ingredient_ids.length,
  };
}

const UNSAFE_KEY = /(?:credential(?:_name|_value)?|secret(?:_name|_value)?|servicekey|api[_-]?key|authorization|cookie|raw[_-]?(?:payload|row|response))/i;
const UNSAFE_TEXT = /(?:DATA_GO_KR_API_KEY\d*|(?:[?&]|%3[fF]|%26)(?:servicekey|api[_-]?key|authorization|access_token)=|\/private\/|\/Users\/[^/]+\/)/i;

export function assertPrSafeValue(value) {
  const visit = (current) => {
    if (typeof current === "string" && UNSAFE_TEXT.test(current)) {
      throw new IngredientNutritionImportError("SECRET_OR_RAW_DATA_LEAK");
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isRecord(current)) return;
    for (const [key, child] of Object.entries(current)) {
      if (key !== "secret_leak_count" && UNSAFE_KEY.test(key)) {
        throw new IngredientNutritionImportError("SECRET_OR_RAW_DATA_LEAK");
      }
      visit(child);
    }
  };
  visit(value);
  return value;
}

function emptyStoreState() {
  return {
    runs: new Map(),
    payload_rows: [],
    nutrition_links: [],
    conversion_assignments: [],
    piece_unit_weights: [],
    writes: 0,
  };
}

export function createMemoryModelStore(options = {}) {
  let state = emptyStoreState();
  const failAfterWrites = options.fail_after_writes ?? null;
  return {
    findRun(idempotencyKey) {
      const summary = state.runs.get(idempotencyKey);
      return summary === undefined ? null : structuredClone(summary);
    },
    async transaction(work) {
      const draft = structuredClone(state);
      let attempted = 0;
      const append = (collection, row) => {
        attempted += 1;
        draft[collection].push(structuredClone(row));
        if (failAfterWrites !== null && attempted >= failAfterWrites) {
          throw new IngredientNutritionImportError("SYNTHETIC_STORE_FAILURE");
        }
      };
      const transaction = {
        append,
        rows(collection) {
          return draft[collection];
        },
        registerRun(idempotencyKey, summary) {
          attempted += 1;
          draft.runs.set(idempotencyKey, structuredClone(summary));
          if (failAfterWrites !== null && attempted >= failAfterWrites) {
            throw new IngredientNutritionImportError("SYNTHETIC_STORE_FAILURE");
          }
        },
        updateWhere(collection, predicate, update) {
          for (const row of draft[collection]) {
            if (!predicate(row)) continue;
            attempted += 1;
            Object.assign(row, update(row));
            if (failAfterWrites !== null && attempted >= failAfterWrites) {
              throw new IngredientNutritionImportError("SYNTHETIC_STORE_FAILURE");
            }
          }
        },
      };
      const result = await work(transaction);
      draft.writes += attempted;
      state = draft;
      return { result, writes_committed: attempted };
    },
    snapshot() {
      return structuredClone({
        ...state,
        runs: [...state.runs.values()],
      });
    },
  };
}

const EXCLUDED_HASH_KEYS = new Set([
  "reviewed_at",
  "fetched_at",
  "freshness_checked_at",
  "created_at",
  "source_accessed_at",
  "report_artifact",
  "approval_path",
  "bundle_path",
]);

function contentProjection(value) {
  if (Array.isArray(value)) {
    return value.map(contentProjection);
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !EXCLUDED_HASH_KEYS.has(key))
      .map(([key, child]) => [key, contentProjection(child)]),
  );
}

function zeroWriteSummary(overrides = {}) {
  return {
    schema_version: "ingredient-nutrition-model-run-v1",
    mode: null,
    environment: null,
    status: "rejected",
    idempotency_key: null,
    content_hash: null,
    scope_recipe_count: 0,
    scope_ingredient_count: 0,
    writes_attempted: 0,
    writes_committed: 0,
    replayed: false,
    production_db_writes: 0,
    provider_requests: 0,
    secret_leak_count: 0,
    reason_codes: [],
    ...overrides,
  };
}

function modelSummaryFields(bundle, approval, runId) {
  const values = bundle.approved_items.flatMap((item) => Object.values(item.values ?? {}));
  const decisions = approval === null
    ? bundle.approved_items.map(() => ({ status: "needs_review" }))
    : [
        ...approval.nutrition_decisions,
        ...approval.conversion_decisions,
        ...approval.piece_decisions,
      ];
  const decisionCount = (status) => decisions.filter((decision) => decision.status === status).length;
  const evidence = bundle.measurement_evidence ?? [];
  return {
    run_id: runId,
    pilot_scope: "foodsafety-30",
    input_checksum: bundle.handoff_checksum,
    source_versions: [...new Set([
      bundle.approved_manifest.source_version,
      ...bundle.public_attribution.map((source) => source.source_version),
    ])].filter(nonEmptyText).sort(),
    freshness_statuses: [...new Set([
      bundle.approved_manifest.freshness_status ?? "current",
    ])].sort(),
    source_item_count: bundle.approved_items.length,
    profile_count: bundle.approved_items.length,
    nutrient_value_count: values.length,
    missing_value_count: values.filter((value) => value?.amount === null).length,
    zero_value_count: values.filter((value) => value?.amount === 0).length,
    nutrition_candidate_count: bundle.approved_items.length,
    conversion_candidate_count: evidence.filter((row) => row.evidence_kind === "volume_weight").length,
    piece_candidate_count: evidence.filter((row) => row.evidence_kind === "piece_weight").length,
    approved_count: decisionCount("approved"),
    rejected_count: decisionCount("rejected"),
    needs_review_count: decisionCount("needs_review"),
    revoked_count: decisionCount("revoked"),
    superseded_count: decisionCount("superseded"),
    secret_leak_count: 0,
    reason_counts: {},
    report_artifact: `.artifacts/ops/ingredient-nutrition-conversion-model/${runId}/summary.json`,
    rollback_artifact: null,
  };
}

function throwWithSummary(error, summary) {
  if (error instanceof IngredientNutritionImportError) {
    error.summary = { ...summary, writes_committed: 0 };
    throw error;
  }
  throw new IngredientNutritionImportError(
    "IMPORT_TRANSACTION_FAILED",
    {},
    { ...summary, writes_committed: 0 },
  );
}

function allUnique(values) {
  return new Set(values).size === values.length;
}

function validateApproval(approval, expectedPilotScope, bundle) {
  const valid =
    isRecord(approval) &&
    approval.schema_version === "ingredient-nutrition-review-v1" &&
    nonEmptyText(approval.reviewed_by) &&
    nonEmptyText(approval.reviewed_at) &&
    Number.isFinite(Date.parse(approval.reviewed_at)) &&
    nonEmptyText(approval.decision_reason) &&
    Array.isArray(approval.nutrition_decisions) &&
    Array.isArray(approval.conversion_decisions) &&
    Array.isArray(approval.piece_decisions);
  if (!valid) throw new IngredientNutritionImportError("INVALID_APPROVAL_FILE");
  validatePilotScope(approval.pilot_scope, expectedPilotScope);
  const ingredientIds = new Set(expectedPilotScope.ingredient_ids);
  const fingerprints = new Set(bundle.approved_items.map((item) => item.fingerprint));
  const nutritionDecisionFingerprints = approval.nutrition_decisions.map(
    (decision) => decision.fingerprint,
  );
  const nutritionValid =
    approval.nutrition_decisions.length === fingerprints.size &&
    allUnique(nutritionDecisionFingerprints) &&
    nutritionDecisionFingerprints.every((fingerprint) => fingerprints.has(fingerprint)) &&
    approval.nutrition_decisions.every((decision) =>
      ingredientIds.has(decision.ingredient_id) &&
      ["approved", "rejected"].includes(decision.status) &&
      nonEmptyText(decision.preparation_state) &&
      nonEmptyText(decision.reason),
    );
  const volumeEvidenceKeys = new Set(
    bundle.measurement_evidence
      .filter((evidence) => evidence.evidence_kind === "volume_weight")
      .map((evidence) => evidence.ingredient_or_category_id),
  );
  const pieceEvidenceKeys = new Set(
    bundle.measurement_evidence
      .filter((evidence) => evidence.evidence_kind === "piece_weight")
      .map((evidence) => evidence.ingredient_or_category_id),
  );
  const conversionValid = approval.conversion_decisions.every((decision) =>
    volumeEvidenceKeys.has(decision.evidence_key) &&
    ingredientIds.has(decision.ingredient_id) &&
    ["approved", "rejected"].includes(decision.status) &&
    ["VOLUME_G6", "VOLUME_G10", "VOLUME_G15", "VOLUME_G20", "VOLUME_G25"]
      .includes(decision.conversion_profile_code) &&
    nonEmptyText(decision.preparation_state) &&
    nonEmptyText(decision.reason),
  );
  const pieceValid = approval.piece_decisions.every((decision) =>
    pieceEvidenceKeys.has(decision.evidence_key) &&
    ingredientIds.has(decision.ingredient_id) &&
    ["approved", "rejected"].includes(decision.status) &&
    nonEmptyText(decision.size_code) &&
    nonEmptyText(decision.preparation_state) &&
    Number.isFinite(decision.weight_g) &&
    decision.weight_g > 0 &&
    nonEmptyText(decision.reason),
  );
  const activeKeys = [
    ...approval.nutrition_decisions
      .filter((decision) => decision.status === "approved")
      .map((decision) => `nutrition:${decision.ingredient_id}:${decision.preparation_state}`),
    ...approval.conversion_decisions
      .filter((decision) => decision.status === "approved")
      .map((decision) => `conversion:${decision.ingredient_id}:${decision.preparation_state}`),
    ...approval.piece_decisions
      .filter((decision) => decision.status === "approved")
      .map((decision) =>
        `piece:${decision.ingredient_id}:${decision.size_code}:${decision.preparation_state}`,
      ),
  ];
  const sourceDecisionValid = approval.source_decision === undefined || (
    isRecord(approval.source_decision) &&
    approval.source_decision.status === "supersede" &&
    nonEmptyText(approval.source_decision.previous_source_id) &&
    nonEmptyText(approval.source_decision.reason)
  );
  if (
    !nutritionValid ||
    !conversionValid ||
    !pieceValid ||
    !sourceDecisionValid ||
    !allUnique(activeKeys)
  ) {
    throw new IngredientNutritionImportError("INVALID_APPROVAL_FILE");
  }
  assertPrSafeValue(approval);
  return approval;
}

export async function runModelImport(input) {
  const baseSummary = zeroWriteSummary({
    mode: input?.mode ?? null,
    environment: input?.environment ?? null,
  });
  let bundle;
  let scopeCounts;
  try {
    if (!["dry-run", "apply"].includes(input?.mode)) {
      throw new IngredientNutritionImportError("IMPORT_MODE_INVALID");
    }
    if (!["local", "staging", "production"].includes(input?.environment)) {
      throw new IngredientNutritionImportError("IMPORT_ENVIRONMENT_INVALID");
    }
    if (input.pilot_scope !== "foodsafety-30") {
      throw new IngredientNutritionImportError("PILOT_SCOPE_MISMATCH");
    }
    bundle = validateHandoffBundle(input.bundle);
    scopeCounts = validatePilotScope(
      input.expected_pilot_scope,
      input.expected_pilot_scope,
    );
  } catch (error) {
    throwWithSummary(error, baseSummary);
  }

  const content = contentProjection({
    bundle,
    pilot_scope: input.expected_pilot_scope,
    approval: input.mode === "apply" ? input.approval : null,
  });
  const contentHash = sha256(content);
  const idempotencyKey = sha256({
    schema_version: "ingredient-nutrition-model-import-v1",
    environment: input.environment,
    content_hash: contentHash,
  });
  const runId = `model-${idempotencyKey.slice(0, 24)}`;
  const summary = zeroWriteSummary({
    mode: input.mode,
    environment: input.environment,
    status: input.mode === "dry-run" ? "validated" : "applied",
    idempotency_key: idempotencyKey,
    content_hash: contentHash,
    ...scopeCounts,
    ...modelSummaryFields(bundle, input.mode === "apply" ? input.approval : null, runId),
  });
  assertPrSafeValue(summary);

  if (input.mode === "dry-run") return summary;
  if (input.environment === "production") {
    throw new IngredientNutritionImportError(
      "PRODUCTION_LOAD_APPROVAL_REQUIRED",
      {},
      summary,
    );
  }

  let approval;
  try {
    approval = validateApproval(input.approval, input.expected_pilot_scope, bundle);
  } catch (error) {
    throwWithSummary(error, summary);
  }
  const replay = input.store.findRun(idempotencyKey);
  if (replay !== null) {
    return { ...replay, writes_attempted: 0, writes_committed: 0, replayed: true };
  }

  const payloadRows = bundle.approved_items
    .map((item) => ({
      external_item_key: item.external_item_key,
      external_name: item.external_name,
      basis: item.basis,
      values: item.values,
      fingerprint: item.fingerprint,
      content_hash: item.content_hash,
    }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const nutritionLinks = approval.nutrition_decisions
    .map((decision) => ({
      ...decision,
      review_status: decision.status,
      is_active: decision.status === "approved",
      reviewed_by: approval.reviewed_by,
      model_run_key: idempotencyKey,
    }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const plannedWrites =
    payloadRows.length +
    nutritionLinks.length +
    approval.conversion_decisions.length +
    approval.piece_decisions.length +
    1;
  const appliedSummary = { ...summary, writes_attempted: plannedWrites };
  if (typeof input.store.applyModelBundle === "function") {
    try {
      const databaseResult = await input.store.applyModelBundle({
        bundle,
        approval,
        idempotency_key: idempotencyKey,
        content_hash: contentHash,
      });
      const sourceCurrent = databaseResult.status === "applied";
      return {
        ...appliedSummary,
        status: databaseResult.status,
        freshness_statuses: [databaseResult.freshness_status],
        reason_codes: databaseResult.reason_codes ?? [],
        approved_count: sourceCurrent ? appliedSummary.approved_count : 0,
        needs_review_count: sourceCurrent
          ? appliedSummary.needs_review_count
          : appliedSummary.nutrition_candidate_count,
        writes_attempted: databaseResult.writes_committed,
        writes_committed: databaseResult.writes_committed,
        replayed: databaseResult.replayed,
        affected_source_id: databaseResult.source_id,
        affected_row_ids: databaseResult.affected_row_ids,
      };
    } catch {
      throw new IngredientNutritionImportError(
        "IMPORT_TRANSACTION_FAILED",
        {},
        { ...appliedSummary, writes_committed: 0 },
      );
    }
  }
  try {
    const transactionResult = await input.store.transaction(async (transaction) => {
      payloadRows.forEach((row) => transaction.append("payload_rows", row));
      nutritionLinks.forEach((row) => transaction.append("nutrition_links", row));
      approval.conversion_decisions.forEach((row) =>
        transaction.append("conversion_assignments", {
          ...row,
          model_run_key: idempotencyKey,
        }),
      );
      approval.piece_decisions.forEach((row) => transaction.append("piece_unit_weights", {
        ...row,
        model_run_key: idempotencyKey,
      }));
      transaction.registerRun(idempotencyKey, appliedSummary);
    });
    return { ...appliedSummary, writes_committed: transactionResult.writes_committed };
  } catch {
    throw new IngredientNutritionImportError(
      "IMPORT_TRANSACTION_FAILED",
      {},
      { ...appliedSummary, writes_committed: 0 },
    );
  }
}

const REPORT_FIELDS = [
  "run_id",
  "environment",
  "status",
  "pilot_scope",
  "input_checksum",
  "source_versions",
  "freshness_statuses",
  "idempotency_key",
  "content_hash",
  "scope_recipe_count",
  "scope_ingredient_count",
  "writes_attempted",
  "writes_committed",
  "replayed",
  "source_item_count",
  "profile_count",
  "nutrient_value_count",
  "missing_value_count",
  "zero_value_count",
  "nutrition_candidate_count",
  "conversion_candidate_count",
  "piece_candidate_count",
  "approved_count",
  "rejected_count",
  "needs_review_count",
  "revoked_count",
  "superseded_count",
  "production_db_writes",
  "provider_requests",
  "secret_leak_count",
  "reason_counts",
  "reason_codes",
  "report_artifact",
  "rollback_artifact",
  "affected_source_id",
  "affected_row_ids",
];

const AFFECTED_ROW_ID_FIELDS = Object.freeze([
  "nutrition_source_ids",
  "nutrition_source_item_ids",
  "nutrition_profile_ids",
  "nutrition_value_keys",
  "nutrition_link_ids",
  "measurement_evidence_ids",
  "conversion_assignment_ids",
  "piece_weight_ids",
]);

function hasValidAffectedRows(value) {
  return isRecord(value) && AFFECTED_ROW_ID_FIELDS.every((field) =>
    Array.isArray(value[field]) && value[field].every(nonEmptyText),
  );
}

export function buildRunReport(summary) {
  if (
    !isRecord(summary) ||
    summary.schema_version !== "ingredient-nutrition-model-run-v1" ||
    !nonEmptyText(summary.idempotency_key) ||
    !nonEmptyText(summary.content_hash) ||
    (summary.affected_source_id !== undefined && !hasValidAffectedRows(summary.affected_row_ids))
  ) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const report = {
    schema_version: "ingredient-nutrition-model-report-v1",
    mode: "report",
    ...Object.fromEntries(
      REPORT_FIELDS
        .filter((field) => summary[field] !== undefined)
        .map((field) => [field, summary[field]]),
    ),
  };
  report.report_checksum = sha256(report);
  assertPrSafeValue(report);
  return report;
}

export function validateRunReport(report) {
  const checksumInput = isRecord(report) ? { ...report } : {};
  delete checksumInput.report_checksum;
  if (
    !isRecord(report) ||
    report.schema_version !== "ingredient-nutrition-model-report-v1" ||
    report.mode !== "report" ||
    !nonEmptyText(report.idempotency_key) ||
    !nonEmptyText(report.content_hash) ||
    (report.affected_source_id !== undefined && !hasValidAffectedRows(report.affected_row_ids)) ||
    report.report_checksum !== sha256(checksumInput)
  ) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  assertPrSafeValue(report);
  return report;
}

export async function disableModelRun(input) {
  const report = validateRunReport(input?.report);
  if (!["local", "staging"].includes(input?.environment)) {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED", {}, {
      writes_attempted: 0,
      writes_committed: 0,
    });
  }
  const decision = input?.decision;
  if (
    !isRecord(decision) ||
    !nonEmptyText(decision.reviewed_by) ||
    !nonEmptyText(decision.reviewed_at) ||
    !Number.isFinite(Date.parse(decision.reviewed_at)) ||
    !nonEmptyText(decision.reason)
  ) {
    throw new IngredientNutritionImportError("INVALID_DISABLE_DECISION");
  }
  const disableKey = sha256({
    operation: "disable",
    model_run_key: report.idempotency_key,
    reviewed_by: decision.reviewed_by,
    reason: decision.reason,
  });
  const replay = input.store.findRun(disableKey);
  if (replay !== null) {
    return { ...replay, writes_attempted: 0, writes_committed: 0, replayed: true };
  }

  const disabledAt = decision.reviewed_at;
  const disabledSummary = {
    schema_version: "ingredient-nutrition-model-run-v1",
    mode: "disable",
    environment: input.environment,
    status: "disabled",
    idempotency_key: disableKey,
    content_hash: report.content_hash,
    model_run_key: report.idempotency_key,
    writes_attempted: 0,
    writes_committed: 0,
    replayed: false,
    payload_deleted: 0,
    production_db_writes: 0,
    provider_requests: 0,
    secret_leak_count: 0,
  };
  if (typeof input.store.disableAppliedModel === "function") {
    if (!nonEmptyText(report.affected_source_id)) {
      throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
    }
    const databaseResult = await input.store.disableAppliedModel({ report, decision });
    return {
      ...disabledSummary,
      writes_attempted: databaseResult.writes_committed,
      writes_committed: databaseResult.writes_committed,
      payload_deleted: databaseResult.payload_deleted,
      revoked_count: databaseResult.revoked_count,
    };
  }
  const result = await input.store.transaction(async (transaction) => {
    for (const collection of [
      "nutrition_links",
      "conversion_assignments",
      "piece_unit_weights",
    ]) {
      transaction.updateWhere(
        collection,
        (row) => row.model_run_key === report.idempotency_key && row.is_active === true,
        (row) => ({
          review_status: row.review_status === "approved" ? "revoked" : row.review_status,
          is_active: false,
          decision_reason: decision.reason,
          reviewed_by: decision.reviewed_by,
          reviewed_at: disabledAt,
        }),
      );
    }
    transaction.registerRun(disableKey, disabledSummary);
  });
  return {
    ...disabledSummary,
    writes_attempted: result.writes_committed,
    writes_committed: result.writes_committed,
  };
}

const CLI_SPECS = Object.freeze({
  import: Object.freeze({
    allowed: new Set(["bundle", "mode", "pilot-scope", "approval-file", "environment"]),
    required: new Set(["bundle", "mode", "pilot-scope"]),
  }),
  report: Object.freeze({
    allowed: new Set(["run-id"]),
    required: new Set(["run-id"]),
  }),
  disable: Object.freeze({
    allowed: new Set(["run-id", "approval-file", "environment"]),
    required: new Set(["run-id", "approval-file", "environment"]),
  }),
});

export function parseModelCliArgs(command, argv) {
  const spec = CLI_SPECS[command];
  if (!spec || !Array.isArray(argv)) {
    throw new IngredientNutritionImportError("CLI_ARGUMENT_INVALID");
  }
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (
      typeof flag !== "string" ||
      !flag.startsWith("--") ||
      !spec.allowed.has(flag.slice(2)) ||
      typeof value !== "string" ||
      value.trim() === "" ||
      value.startsWith("--") ||
      Object.hasOwn(parsed, flag.slice(2))
    ) {
      throw new IngredientNutritionImportError("CLI_ARGUMENT_INVALID");
    }
    parsed[flag.slice(2)] = value;
  }
  for (const required of spec.required) {
    if (!Object.hasOwn(parsed, required)) {
      if (command === "import" && required === "bundle") {
        throw new IngredientNutritionImportError("BUNDLE_FILE_REQUIRED");
      }
      throw new IngredientNutritionImportError("CLI_ARGUMENT_REQUIRED");
    }
  }
  if (command === "import") {
    if (!["dry-run", "apply"].includes(parsed.mode)) {
      throw new IngredientNutritionImportError("IMPORT_MODE_INVALID");
    }
    if (parsed["pilot-scope"] !== "foodsafety-30") {
      throw new IngredientNutritionImportError("PILOT_SCOPE_MISMATCH");
    }
    parsed.environment ??= "local";
    if (!["local", "staging", "production"].includes(parsed.environment)) {
      throw new IngredientNutritionImportError("IMPORT_ENVIRONMENT_INVALID");
    }
    if (parsed.mode === "apply" && !Object.hasOwn(parsed, "approval-file")) {
      throw new IngredientNutritionImportError("APPROVAL_FILE_REQUIRED");
    }
  }
  if (command === "disable" && !["local", "staging", "production"].includes(parsed.environment)) {
    throw new IngredientNutritionImportError("IMPORT_ENVIRONMENT_INVALID");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key.replaceAll("-", "_"), value]),
  );
}
