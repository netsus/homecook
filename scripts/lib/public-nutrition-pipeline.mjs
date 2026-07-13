import { createHash } from "node:crypto";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1_000, 2_000, 4_000];
const MAX_RETRY_AFTER_MS = 30_000;
const AUTH_QUERY_KEYS = new Set([
  "servicekey",
  "apikey",
  "api_key",
  "authorization",
  "access_token",
  "token",
]);

export const CORE_NUTRIENTS = Object.freeze({
  energy_kcal: Object.freeze({ source_key: "energy", unit: "kcal" }),
  carbohydrate_g: Object.freeze({ source_key: "carbohydrate", unit: "g" }),
  protein_g: Object.freeze({ source_key: "protein", unit: "g" }),
  fat_g: Object.freeze({ source_key: "fat", unit: "g" }),
  sodium_mg: Object.freeze({ source_key: "sodium", unit: "mg" }),
});

const OPTIONAL_NUTRIENTS = Object.freeze({
  sugars_g: Object.freeze({ source_key: "sugars", unit: "g" }),
  saturated_fat_g: Object.freeze({ source_key: "saturated_fat", unit: "g" }),
  fiber_g: Object.freeze({ source_key: "fiber", unit: "g" }),
});

const MFDS_SOURCE = Object.freeze({
  id: "mfds-15127578",
  provider: "식품의약품안전처",
  dataset: "식품영양성분DB정보",
  source_version: "2025-12-05",
  data_basis_date: null,
  endpoint_or_file_url: "https://www.data.go.kr/data/15127578/openapi.do",
  license: "이용허락범위 제한 없음",
  license_url: "https://www.data.go.kr/data/15127578/openapi.do",
  license_evidence_url: "https://www.data.go.kr/data/15127578/openapi.do",
  license_verified_at: "2026-07-13",
});

export const SOURCE_REGISTRY = Object.freeze({
  "mfds-15127578": Object.freeze({
    id: "mfds-15127578",
    application_required: true,
    secret_env: "DATA_GO_KR_API_KEY",
    keyless: false,
    default_path: true,
    request_endpoint:
      "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02",
    manifest_source: MFDS_SOURCE,
  }),
  "rda-10.4": Object.freeze({
    id: "rda-10.4",
    application_required: false,
    secret_env: null,
    keyless: true,
    default_path: true,
    mode: "file_or_search",
  }),
  "integrated-15100064": Object.freeze({
    id: "integrated-15100064",
    application_required: false,
    secret_env: null,
    keyless: true,
    default_path: true,
    mode: "file_reconciliation",
  }),
  "rda-measurement": Object.freeze({
    id: "rda-measurement",
    application_required: false,
    secret_env: null,
    keyless: true,
    default_path: true,
    mode: "manual_evidence",
  }),
  "rda-15143598": Object.freeze({
    id: "rda-15143598",
    application_required: false,
    secret_env: null,
    keyless: false,
    active: true,
    source_version: "10.0",
    license: "KOGL4",
    default_path: false,
  }),
});

export class NutritionPipelineError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "NutritionPipelineError";
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

export function sha256(value) {
  const input = typeof value === "string" ? value : canonicalStringify(value);
  return createHash("sha256").update(input).digest("hex");
}

function requiredText(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new NutritionPipelineError(code);
  }
  return value.trim();
}

function ensureIsoDate(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new NutritionPipelineError(code);
  }
  return value;
}

export function sanitizeUrl(value) {
  const url = new URL(requiredText(value, "SOURCE_URL_MISSING"));
  for (const key of [...url.searchParams.keys()]) {
    if (AUTH_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function sanitizeQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => !AUTH_QUERY_KEYS.has(key.toLowerCase()))
      .map(([key, value]) => [key, String(value)]),
  );
}

function validateSource(source) {
  if (!isRecord(source)) throw new NutritionPipelineError("SOURCE_METADATA_MISSING");
  const endpoint = sanitizeUrl(source.endpoint_or_file_url);
  return {
    id: requiredText(source.id, "SOURCE_ID_MISSING"),
    provider: requiredText(source.provider, "SOURCE_PROVIDER_MISSING"),
    dataset: requiredText(source.dataset, "SOURCE_DATASET_MISSING"),
    source_version: requiredText(source.source_version, "SOURCE_VERSION_MISSING"),
    data_basis_date: source.data_basis_date ?? null,
    endpoint_or_file_url: endpoint,
    license: requiredText(source.license, "SOURCE_LICENSE_MISSING"),
    license_url: sanitizeUrl(requiredText(source.license_url, "LICENSE_URL_MISSING")),
    license_evidence_url: sanitizeUrl(
      requiredText(source.license_evidence_url, "LICENSE_EVIDENCE_MISSING"),
    ),
    license_verified_at: ensureIsoDate(source.license_verified_at, "LICENSE_VERIFIED_AT_MISSING"),
  };
}

function pageIdentity(items) {
  return sha256(items);
}

function externalItemKey(item) {
  if (!isRecord(item)) return null;
  for (const key of ["external_item_key", "FOOD_CD", "food_code", "ITEM_REPORT_NO"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function validatePages(inputPages) {
  if (!Array.isArray(inputPages) || inputPages.length === 0) {
    throw new NutritionPipelineError("PAGINATION_SCHEMA_INVALID");
  }

  const pages = [];
  const identities = new Set();
  const tokens = new Set();
  const itemPageByKey = new Map();
  let reportedTotal = null;
  let accumulated = 0;

  for (const [index, page] of inputPages.entries()) {
    if (!isRecord(page) || !Array.isArray(page.items)) {
      throw new NutritionPipelineError("PAGINATION_SCHEMA_INVALID");
    }
    const pageNo = Number(page.page_no);
    const totalCount = Number(page.total_count);
    if (!Number.isInteger(pageNo) || pageNo !== index + 1 || !Number.isInteger(totalCount) || totalCount < 0) {
      throw new NutritionPipelineError("PAGINATION_SCHEMA_INVALID");
    }
    if (reportedTotal === null) reportedTotal = totalCount;
    if (reportedTotal !== totalCount) {
      throw new NutritionPipelineError("PAGINATION_TOTAL_DRIFT");
    }

    const identity = pageIdentity(page.items);
    const token =
      typeof page.next_page_token === "string" && page.next_page_token.trim().length > 0
        ? page.next_page_token.trim()
        : null;
    if (identities.has(identity) || (token !== null && tokens.has(token))) {
      throw new NutritionPipelineError("PAGINATION_LOOP");
    }
    identities.add(identity);
    if (token !== null) tokens.add(token);

    if (page.items.length === 0 && accumulated < totalCount) {
      throw new NutritionPipelineError("PAGINATION_EMPTY_INTERMEDIATE");
    }

    for (const item of page.items) {
      const key = externalItemKey(item);
      if (key !== null && itemPageByKey.has(key) && itemPageByKey.get(key) !== pageNo) {
        throw new NutritionPipelineError("PAGINATION_ITEM_KEY_COLLISION");
      }
      if (key !== null) itemPageByKey.set(key, pageNo);
    }

    accumulated += page.items.length;
    if (accumulated > totalCount) throw new NutritionPipelineError("PAGINATION_COUNT_OVERFLOW");
    pages.push({
      page_no: pageNo,
      total_count: totalCount,
      next_page_token: token,
      items: page.items,
      page_identity: identity,
    });
  }

  if (accumulated !== reportedTotal) {
    throw new NutritionPipelineError("PAGINATION_INCOMPLETE", {
      reported_total: reportedTotal,
      accumulated,
    });
  }

  return {
    pages,
    reportedTotal,
    accumulated,
    pageIdentityChecksum: sha256(pages.map((page) => page.page_identity)),
  };
}

export function buildRawBatch({ source, adapter_schema_version, pages, fetchedAt }) {
  const normalizedSource = validateSource(source);
  const adapterSchemaVersion = requiredText(
    adapter_schema_version,
    "ADAPTER_SCHEMA_VERSION_MISSING",
  );
  const pagination = validatePages(pages);
  const rawSnapshot = {
    schema_version: "public-nutrition-raw-v1",
    source_id: normalizedSource.id,
    pages: pagination.pages.map((page) => ({
      page_no: page.page_no,
      total_count: page.total_count,
      next_page_token: page.next_page_token,
      items: page.items,
    })),
  };
  const rawSha256 = sha256(rawSnapshot);
  const logicalBatchId = sha256({
    provider: normalizedSource.provider,
    dataset: normalizedSource.dataset,
    source_version: normalizedSource.source_version,
    raw_sha256: rawSha256,
    adapter_schema_version: adapterSchemaVersion,
  });

  return {
    rawSnapshot,
    manifest: {
      schema_version: "public-nutrition-manifest-v1",
      logical_batch_id: logicalBatchId,
      status: "raw",
      lifecycle: ["raw"],
      provider: normalizedSource.provider,
      dataset: normalizedSource.dataset,
      endpoint_or_file_url: normalizedSource.endpoint_or_file_url,
      source_version: normalizedSource.source_version,
      data_basis_date: normalizedSource.data_basis_date,
      fetched_at: requiredText(fetchedAt, "FETCHED_AT_MISSING"),
      query: {},
      license: normalizedSource.license,
      license_url: normalizedSource.license_url,
      license_evidence_url: normalizedSource.license_evidence_url,
      license_verified_at: normalizedSource.license_verified_at,
      fetched_raw_count: pagination.accumulated,
      unique_input_count: pagination.accumulated,
      normalized_count: 0,
      deduplicated_identical_count: 0,
      quarantined_count: 0,
      sha256: rawSha256,
      adapter_schema_version: adapterSchemaVersion,
      provider_reported_total: pagination.reportedTotal,
      page_count: pagination.pages.length,
      page_identity_checksum: pagination.pageIdentityChecksum,
      failed_reason_counts: {},
      production_db_writes: 0,
    },
  };
}

function parseBasis(value) {
  if (typeof value !== "string") throw new NutritionPipelineError("basis_parse_failed");
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(mg|kg|g|ml|mL|l|L|serving|package)$/);
  if (!match) throw new NutritionPipelineError("basis_parse_failed");
  let amount = Number(match[1]);
  let unit = match[2].toLowerCase();
  if (!(amount > 0)) throw new NutritionPipelineError("basis_parse_failed");
  if (unit === "kg") {
    amount *= 1000;
    unit = "g";
  } else if (unit === "mg") {
    amount /= 1000;
    unit = "g";
  } else if (unit === "l") {
    amount *= 1000;
    unit = "ml";
  }
  return { amount, unit, source_text: value };
}

function normalizeNutrientToken(entry, expectedUnit, { optional = false } = {}) {
  if (entry === undefined && optional) return null;
  if (entry === undefined) {
    return { amount: null, unit: expectedUnit, missing_reason: "absent", source_token: null };
  }
  if (!isRecord(entry)) throw new NutritionPipelineError("malformed_nutrient");
  const unit = typeof entry.unit === "string" ? entry.unit.trim() : "";
  if (unit !== expectedUnit) throw new NutritionPipelineError("unit_mismatch");
  const sourceToken = entry.value;
  if (sourceToken === null || sourceToken === undefined) {
    return { amount: null, unit: expectedUnit, missing_reason: "absent", source_token: null };
  }
  const token = String(sourceToken).trim();
  const folded = token.toLocaleLowerCase("ko-KR");
  if (token === "") {
    return { amount: null, unit: expectedUnit, missing_reason: "blank", source_token: "" };
  }
  if (["-", "–", "—"].includes(token)) {
    return { amount: null, unit: expectedUnit, missing_reason: "dash", source_token: token };
  }
  if (["trace", "tr", "미량"].includes(folded)) {
    return { amount: null, unit: expectedUnit, missing_reason: "trace", source_token: token };
  }
  if (["nd", "n/d", "미검출"].includes(folded)) {
    return {
      amount: null,
      unit: expectedUnit,
      missing_reason: "not_detected",
      source_token: token,
    };
  }
  const amount = Number(token.replaceAll(",", ""));
  if (!Number.isFinite(amount)) throw new NutritionPipelineError("malformed_nutrient");
  if (amount < 0) throw new NutritionPipelineError("negative_nutrient");
  return { amount, unit: expectedUnit, missing_reason: null, source_token: token };
}

function normalizeRow(row, sourceScope) {
  if (!isRecord(row) || !isRecord(row.nutrients)) {
    throw new NutritionPipelineError("malformed_row");
  }
  const externalKey = requiredText(row.external_item_key, "malformed_row");
  const externalName = requiredText(row.external_name, "malformed_row");
  const basis = parseBasis(row.basis_text);
  const values = {};
  for (const [code, definition] of Object.entries(CORE_NUTRIENTS)) {
    values[code] = normalizeNutrientToken(row.nutrients[definition.source_key], definition.unit);
  }
  for (const [code, definition] of Object.entries(OPTIONAL_NUTRIENTS)) {
    const normalized = normalizeNutrientToken(
      row.nutrients[definition.source_key],
      definition.unit,
      { optional: true },
    );
    if (normalized !== null) values[code] = normalized;
  }
  const businessKey = `${sourceScope}:${externalKey}`;
  const contentHash = sha256({ externalKey, externalName, basis, values });
  return {
    business_key: businessKey,
    external_item_key: externalKey,
    external_name: externalName,
    basis,
    values,
    content_hash: contentHash,
    fingerprint: sha256({ business_key: businessKey, content_hash: contentHash }),
  };
}

function countReasons(rows) {
  const counts = {};
  for (const row of rows) counts[row.reason_code] = (counts[row.reason_code] ?? 0) + 1;
  return counts;
}

export function normalizeNutritionBatch({ rawSnapshot, manifest, adapterSchemaVersion }) {
  if (!isRecord(manifest) || manifest.status !== "raw") {
    throw new NutritionPipelineError("RAW_MANIFEST_INVALID");
  }
  if (sha256(rawSnapshot) !== manifest.sha256) {
    throw new NutritionPipelineError("RAW_CHECKSUM_MISMATCH");
  }
  if (
    adapterSchemaVersion !== manifest.adapter_schema_version ||
    adapterSchemaVersion !== "nutrition-source-row-v1"
  ) {
    throw new NutritionPipelineError("ADAPTER_SCHEMA_MISMATCH");
  }
  if (!isRecord(rawSnapshot) || !Array.isArray(rawSnapshot.pages)) {
    throw new NutritionPipelineError("RAW_SNAPSHOT_INVALID");
  }

  const sourceScope = `${manifest.provider}:${manifest.dataset}:${manifest.source_version}`;
  const stagedRows = rawSnapshot.pages.flatMap((page) => page.items);
  const rows = [];
  const quarantined = [];
  const firstByBusinessKey = new Map();
  let identicalCount = 0;

  for (const [rowIndex, stagedRow] of stagedRows.entries()) {
    try {
      const normalized = normalizeRow(stagedRow, sourceScope);
      const existing = firstByBusinessKey.get(normalized.business_key);
      if (existing?.content_hash === normalized.content_hash) {
        identicalCount += 1;
        continue;
      }
      if (existing) {
        quarantined.push({
          row_index: rowIndex,
          external_item_key: normalized.external_item_key,
          reason_code: "conflicting_duplicate",
          fingerprint: normalized.fingerprint,
        });
        continue;
      }
      firstByBusinessKey.set(normalized.business_key, normalized);
      rows.push(normalized);
    } catch (error) {
      const reasonCode =
        error instanceof NutritionPipelineError ? error.code : "malformed_row";
      quarantined.push({
        row_index: rowIndex,
        external_item_key: externalItemKey(stagedRow),
        reason_code: reasonCode,
        fingerprint: sha256({ sourceScope, rowIndex, stagedRow }),
      });
    }
  }

  rows.sort((left, right) => left.business_key.localeCompare(right.business_key));
  quarantined.sort((left, right) => left.row_index - right.row_index);
  const counts = {
    fetched_raw_count: stagedRows.length,
    unique_input_count: rows.length + quarantined.length,
    normalized_count: rows.length,
    deduplicated_identical_count: identicalCount,
    quarantined_count: quarantined.length,
  };
  if (
    counts.fetched_raw_count !== counts.unique_input_count + counts.deduplicated_identical_count ||
    counts.unique_input_count !== counts.normalized_count + counts.quarantined_count
  ) {
    throw new NutritionPipelineError("ROW_ACCOUNTING_MISMATCH");
  }

  const normalizedContentHash = sha256({ rows, quarantined, counts });
  return {
    schema_version: "public-nutrition-normalized-v1",
    status: "normalized",
    lifecycle: ["raw", "staged", "normalized"],
    logical_batch_id: manifest.logical_batch_id,
    source: {
      provider: manifest.provider,
      dataset: manifest.dataset,
      source_version: manifest.source_version,
      data_basis_date: manifest.data_basis_date,
      license: manifest.license,
      source_url: manifest.endpoint_or_file_url,
    },
    raw_sha256: manifest.sha256,
    adapter_schema_version: manifest.adapter_schema_version,
    staged_content_hash: sha256(stagedRows),
    normalized_content_hash: normalizedContentHash,
    staged_rows: stagedRows,
    rows,
    quarantined,
    quarantine_reason_counts: countReasons(quarantined),
    counts,
    production_db_writes: 0,
  };
}

const EVIDENCE_KEYS = new Set([
  "source_url",
  "accessed_at",
  "ingredient_or_category_id",
  "source_observed_unit",
  "observed_g",
  "observed_g_per_15ml",
  "selected_representative_grade",
  "absolute_error_g_per_15ml",
  "review_result",
  "license_evidence_url",
  "license_checked_at",
  "license_disposition",
]);
const REPRESENTATIVE_GRADES = new Set([
  "VOLUME_G6",
  "VOLUME_G10",
  "VOLUME_G15",
  "VOLUME_G20",
  "VOLUME_G25",
]);
const FORBIDDEN_OIL_CANDIDATES = /^(?:olive|other|canola|vegetable|cooking)-oil$/;

export function validateMeasurementEvidence(input) {
  if (!Array.isArray(input) || input.length > 20) {
    throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
  }
  return input.map((row) => {
    if (!isRecord(row) || Object.keys(row).some((key) => !EVIDENCE_KEYS.has(key))) {
      throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
    }
    const licenseDisposition =
      typeof row.license_disposition === "string" ? row.license_disposition.trim() : "";
    if (!licenseDisposition) {
      throw new NutritionPipelineError("RDA_LICENSE_DISPOSITION_MISSING");
    }
    const ingredientId = requiredText(
      row.ingredient_or_category_id,
      "RDA_EVIDENCE_SCHEMA_VIOLATION",
    );
    const reviewResult = requiredText(row.review_result, "RDA_EVIDENCE_SCHEMA_VIOLATION");
    if (!["candidate", "needs_source_check", "rejected"].includes(reviewResult)) {
      throw new NutritionPipelineError("RDA_ASSIGNMENT_DEFERRED");
    }
    if (FORBIDDEN_OIL_CANDIDATES.test(ingredientId) && reviewResult === "candidate") {
      throw new NutritionPipelineError("RDA_OIL_AUTO_CANDIDATE_FORBIDDEN");
    }
    const observedG = row.observed_g;
    const observedPer15 = row.observed_g_per_15ml;
    const observedCount = [observedG, observedPer15].filter(
      (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
    ).length;
    if (observedCount !== 1) {
      throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
    }
    if (
      !REPRESENTATIVE_GRADES.has(row.selected_representative_grade) ||
      typeof row.absolute_error_g_per_15ml !== "number" ||
      row.absolute_error_g_per_15ml < 0
    ) {
      throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
    }
    return {
      source_url: sanitizeUrl(row.source_url),
      accessed_at: ensureIsoDate(row.accessed_at, "RDA_EVIDENCE_SCHEMA_VIOLATION"),
      ingredient_or_category_id: ingredientId,
      source_observed_unit: requiredText(
        row.source_observed_unit,
        "RDA_EVIDENCE_SCHEMA_VIOLATION",
      ),
      ...(observedG !== undefined ? { observed_g: observedG } : {}),
      ...(observedPer15 !== undefined ? { observed_g_per_15ml: observedPer15 } : {}),
      selected_representative_grade: row.selected_representative_grade,
      absolute_error_g_per_15ml: row.absolute_error_g_per_15ml,
      review_result: reviewResult,
      license_evidence_url: sanitizeUrl(
        requiredText(row.license_evidence_url, "RDA_EVIDENCE_SCHEMA_VIOLATION"),
      ),
      license_checked_at: ensureIsoDate(
        row.license_checked_at,
        "RDA_EVIDENCE_SCHEMA_VIOLATION",
      ),
      license_disposition: licenseDisposition,
    };
  });
}

export function buildNutritionReview({ normalizedBundle, decisions, measurementEvidence = [] }) {
  if (!isRecord(normalizedBundle) || normalizedBundle.status !== "normalized") {
    throw new NutritionPipelineError("NORMALIZED_BUNDLE_INVALID");
  }
  if (!Array.isArray(decisions)) throw new NutritionPipelineError("REVIEW_DECISIONS_INVALID");
  const knownFingerprints = new Set(normalizedBundle.rows.map((row) => row.fingerprint));
  const decisionByFingerprint = new Map();
  for (const decision of decisions) {
    if (!isRecord(decision) || !knownFingerprints.has(decision.fingerprint)) {
      throw new NutritionPipelineError("REVIEW_DECISION_UNKNOWN");
    }
    if (!["pending", "approved", "rejected", "needs_review", "needs_source_check"].includes(decision.status)) {
      throw new NutritionPipelineError("REVIEW_DECISION_INVALID");
    }
    decisionByFingerprint.set(decision.fingerprint, decision.status);
  }
  const reviewedRows = normalizedBundle.rows.map((row) => ({
    fingerprint: row.fingerprint,
    status: decisionByFingerprint.get(row.fingerprint) ?? "pending",
  }));
  const approvedFingerprints = reviewedRows
    .filter((row) => row.status === "approved")
    .map((row) => row.fingerprint)
    .sort();
  const blockerCount = normalizedBundle.counts.quarantined_count > 0 ? 1 : 0;
  const evidence = validateMeasurementEvidence(measurementEvidence);
  const reportBase = {
    schema_version: "public-nutrition-review-v1",
    status: "reviewed",
    lifecycle: ["raw", "staged", "normalized", "reviewed"],
    logical_batch_id: normalizedBundle.logical_batch_id,
    normalized_content_hash: normalizedBundle.normalized_content_hash,
    reviewed_rows: reviewedRows,
    approved_fingerprints: approvedFingerprints,
    blocker_count: blockerCount,
    quarantine_reason_counts: normalizedBundle.quarantine_reason_counts,
    counts: normalizedBundle.counts,
    measurement_evidence: evidence,
    production_db_writes: 0,
  };
  return { ...reportBase, review_checksum: sha256(reportBase) };
}

export function createPublicAttribution(source) {
  return {
    provider: requiredText(source.provider, "SOURCE_PROVIDER_MISSING"),
    dataset: requiredText(source.dataset, "SOURCE_DATASET_MISSING"),
    source_version: requiredText(source.source_version, "SOURCE_VERSION_MISSING"),
    data_basis_date: source.data_basis_date ?? null,
    license: requiredText(source.license, "SOURCE_LICENSE_MISSING"),
    source_url: sanitizeUrl(source.endpoint_or_file_url ?? source.source_url),
  };
}

function assertNoAuthLeak(value) {
  const serialized = JSON.stringify(value);
  if (/(?:serviceKey|apiKey|api_key|access_token|authorization)=?/i.test(serialized)) {
    throw new NutritionPipelineError("SECRET_EXPOSURE_DETECTED");
  }
}

export function buildApprovedPinnedHandoff({
  manifest,
  normalizedBundle,
  reviewReport,
  measurementEvidence = [],
}) {
  if (
    !isRecord(reviewReport) ||
    reviewReport.status !== "reviewed" ||
    reviewReport.blocker_count > 0 ||
    normalizedBundle.counts.quarantined_count > 0
  ) {
    throw new NutritionPipelineError("PROMOTION_BLOCKED");
  }
  if (reviewReport.normalized_content_hash !== normalizedBundle.normalized_content_hash) {
    throw new NutritionPipelineError("REVIEW_CONTENT_MISMATCH");
  }
  const reviewBase = Object.fromEntries(
    Object.entries(reviewReport).filter(([key]) => key !== "review_checksum"),
  );
  if (reviewReport.review_checksum !== sha256(reviewBase)) {
    throw new NutritionPipelineError("REVIEW_CHECKSUM_MISMATCH");
  }
  const approved = new Set(reviewReport.approved_fingerprints);
  const approvedItems = normalizedBundle.rows.filter((row) => approved.has(row.fingerprint));
  if (approvedItems.length === 0) throw new NutritionPipelineError("NO_APPROVED_ROWS");
  const evidence = validateMeasurementEvidence(measurementEvidence);
  const attribution = createPublicAttribution({
    provider: manifest.provider,
    dataset: manifest.dataset,
    source_version: manifest.source_version,
    data_basis_date: manifest.data_basis_date,
    license: manifest.license,
    source_url: manifest.endpoint_or_file_url,
  });
  const handoffBase = {
    schema_version: "public-nutrition-handoff-v1",
    status: "approved_pinned",
    lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
    logical_batch_id: manifest.logical_batch_id,
    approved_manifest: {
      provider: manifest.provider,
      dataset: manifest.dataset,
      source_version: manifest.source_version,
      data_basis_date: manifest.data_basis_date,
      license: manifest.license,
      license_url: manifest.license_url,
      license_evidence_url: manifest.license_evidence_url,
      license_verified_at: manifest.license_verified_at,
      raw_sha256: manifest.sha256,
      normalized_content_hash: normalizedBundle.normalized_content_hash,
      review_checksum: reviewReport.review_checksum,
      counts: normalizedBundle.counts,
    },
    approved_items: approvedItems,
    public_attribution: [attribution],
    measurement_evidence: evidence,
    normalized_content_hash: normalizedBundle.normalized_content_hash,
    review_checksum: reviewReport.review_checksum,
    production_db_writes: 0,
  };
  assertNoAuthLeak(handoffBase);
  return { ...handoffBase, handoff_checksum: sha256(handoffBase) };
}

function retryAfterMs(value, now) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  return Math.min(Math.max(0, dateMs - now()), MAX_RETRY_AFTER_MS);
}

function networkReason(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return "REQUEST_TIMEOUT";
  return "NETWORK_ERROR";
}

export async function requestJsonWithRetry({
  endpoint,
  query = {},
  apiKey,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  createTimeoutSignal = (ms) => AbortSignal.timeout(ms),
}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new NutritionPipelineError("MISSING_API_KEY", { env: "DATA_GO_KR_API_KEY" });
  }
  const publicQuery = sanitizeQuery(query);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(publicQuery)) url.searchParams.set(key, value);
    url.searchParams.set("serviceKey", apiKey);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        signal: createTimeoutSignal(REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      const reasonCode = networkReason(error);
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new NutritionPipelineError("RETRY_EXHAUSTED", {
          last_reason_code: reasonCode,
          attempts: MAX_ATTEMPTS,
        });
      }
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new NutritionPipelineError("HTTP_NON_RETRYABLE", { status: response.status });
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new NutritionPipelineError("RETRY_EXHAUSTED", {
          last_reason_code: response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`,
          attempts: MAX_ATTEMPTS,
        });
      }
      const retryAfter = retryAfterMs(response.headers.get("Retry-After"), now);
      await sleep(retryAfter ?? BACKOFF_MS[attempt]);
      continue;
    }

    try {
      return await response.json();
    } catch {
      throw new NutritionPipelineError("MALFORMED_PAYLOAD");
    }
  }
  throw new NutritionPipelineError("RETRY_EXHAUSTED", { attempts: MAX_ATTEMPTS });
}

function parseMfdsPage(payload, expectedPageNo) {
  const response = payload?.response;
  const header = response?.header;
  const body = response?.body;
  if (!isRecord(response) || !isRecord(header) || !isRecord(body)) {
    throw new NutritionPipelineError("SCHEMA_DRIFT");
  }
  if (String(header.resultCode) !== "00") {
    throw new NutritionPipelineError("PROVIDER_ERROR");
  }
  const items = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.items?.item)
      ? body.items.item
      : null;
  if (items === null || !Number.isInteger(Number(body.totalCount))) {
    throw new NutritionPipelineError("SCHEMA_DRIFT");
  }
  return {
    page_no: Number(body.pageNo ?? expectedPageNo),
    total_count: Number(body.totalCount),
    next_page_token:
      typeof body.nextPageToken === "string" && body.nextPageToken.trim().length > 0
        ? body.nextPageToken.trim()
        : null,
    items,
  };
}

export async function fetchMfdsBatch({
  apiKey,
  fetchedAt,
  pageSize = 100,
  fetchImpl = globalThis.fetch,
  sleep,
  now,
  createTimeoutSignal,
}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new NutritionPipelineError("MISSING_API_KEY", { env: "DATA_GO_KR_API_KEY" });
  }
  const pages = [];
  let accumulated = 0;
  let total = null;
  for (let pageNo = 1; pageNo <= 100_000; pageNo += 1) {
    const payload = await requestJsonWithRetry({
      endpoint: SOURCE_REGISTRY["mfds-15127578"].request_endpoint,
      query: { pageNo, numOfRows: pageSize, type: "json" },
      apiKey,
      fetchImpl,
      sleep,
      now,
      createTimeoutSignal,
    });
    const page = parseMfdsPage(payload, pageNo);
    pages.push(page);
    if (total === null) total = page.total_count;
    accumulated += page.items.length;
    if (accumulated >= total) break;
  }
  return buildRawBatch({
    source: SOURCE_REGISTRY["mfds-15127578"].manifest_source,
    adapter_schema_version: "nutrition-source-row-v1",
    pages,
    fetchedAt,
  });
}
