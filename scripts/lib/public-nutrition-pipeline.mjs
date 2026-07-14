import { createHash } from "node:crypto";

import { buildPublicDataUrl } from "./public-data-url.mjs";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1_000, 2_000, 4_000];
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_PAGES = 100_000;
const INPUT_SHAPES = new Set(["adapted-row-v1", "mfds-provider-v1"]);
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
    application_requirement: "separate_application_when_enabled",
    secret_env: "DATA_GO_KR_API_KEY",
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

export const PUBLIC_NUTRITION_HANDOFF_SCHEMA = Object.freeze({
  schema_version: "public-nutrition-handoff-v1",
  measurement_evidence_schema_version: "public-nutrition-measurement-evidence-v1",
  lifecycle: Object.freeze(["raw", "staged", "normalized", "reviewed", "approved_pinned"]),
});
export const PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM = sha256(
  PUBLIC_NUTRITION_HANDOFF_SCHEMA,
);

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
    data_basis_date:
      source.data_basis_date === null || source.data_basis_date === undefined
        ? null
        : ensureIsoDate(source.data_basis_date, "DATA_BASIS_DATE_INVALID"),
    endpoint_or_file_url: endpoint,
    license: requiredText(source.license, "SOURCE_LICENSE_MISSING"),
    license_url: sanitizeUrl(requiredText(source.license_url, "LICENSE_URL_MISSING")),
    license_evidence_url: sanitizeUrl(
      requiredText(source.license_evidence_url, "LICENSE_EVIDENCE_MISSING"),
    ),
    license_verified_at: ensureIsoDate(source.license_verified_at, "LICENSE_VERIFIED_AT_MISSING"),
  };
}

function logicalBatchId({
  provider,
  dataset,
  source_version,
  data_basis_date,
  endpoint_or_file_url,
  query,
  license,
  license_url,
  license_evidence_url,
  license_verified_at,
  raw_sha256,
  input_shape,
  adapter_schema_version,
}) {
  return sha256({
    provider,
    dataset,
    source_version,
    data_basis_date,
    endpoint_or_file_url,
    query,
    license,
    license_url,
    license_evidence_url,
    license_verified_at,
    raw_sha256,
    input_shape,
    adapter_schema_version,
  });
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

function validatePages(inputPages, { allowIncomplete = false } = {}) {
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

  if (!allowIncomplete && accumulated !== reportedTotal) {
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

export function buildRawBatch({
  source,
  input_shape,
  adapter_schema_version,
  pages,
  query = {},
  fetchedAt,
}) {
  const normalizedSource = validateSource(source);
  const inputShape = requiredText(input_shape, "INPUT_SHAPE_MISSING");
  if (!INPUT_SHAPES.has(inputShape)) {
    throw new NutritionPipelineError("INPUT_SHAPE_UNSUPPORTED");
  }
  const adapterSchemaVersion = requiredText(
    adapter_schema_version,
    "ADAPTER_SCHEMA_VERSION_MISSING",
  );
  const publicQuery = sanitizeQuery(query);
  let pagination;
  try {
    pagination = validatePages(pages);
  } catch (error) {
    if (error instanceof NutritionPipelineError) {
      throw new NutritionPipelineError(error.code, {
        ...error.details,
        received_page_count: Array.isArray(pages) ? pages.length : 0,
        source_id: normalizedSource.id,
        source_url: normalizedSource.endpoint_or_file_url,
        query: publicQuery,
      });
    }
    throw error;
  }
  const rawSnapshot = {
    schema_version: "public-nutrition-raw-v1",
    source_id: normalizedSource.id,
    input_shape: inputShape,
    pages: pagination.pages.map((page) => ({
      page_no: page.page_no,
      total_count: page.total_count,
      next_page_token: page.next_page_token,
      items: page.items,
    })),
  };
  const rawSha256 = sha256(rawSnapshot);
  const batchId = logicalBatchId({
    provider: normalizedSource.provider,
    dataset: normalizedSource.dataset,
    source_version: normalizedSource.source_version,
    data_basis_date: normalizedSource.data_basis_date,
    endpoint_or_file_url: normalizedSource.endpoint_or_file_url,
    query: publicQuery,
    license: normalizedSource.license,
    license_url: normalizedSource.license_url,
    license_evidence_url: normalizedSource.license_evidence_url,
    license_verified_at: normalizedSource.license_verified_at,
    raw_sha256: rawSha256,
    input_shape: inputShape,
    adapter_schema_version: adapterSchemaVersion,
  });

  return {
    rawSnapshot,
    manifest: {
      schema_version: "public-nutrition-manifest-v1",
      logical_batch_id: batchId,
      status: "raw",
      lifecycle: ["raw"],
      provider: normalizedSource.provider,
      dataset: normalizedSource.dataset,
      endpoint_or_file_url: normalizedSource.endpoint_or_file_url,
      source_version: normalizedSource.source_version,
      data_basis_date: normalizedSource.data_basis_date,
      fetched_at: requiredText(fetchedAt, "FETCHED_AT_MISSING"),
      query: publicQuery,
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
      input_shape: inputShape,
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
  const serving = row.serving ?? null;
  const totalContent = row.total_content ?? null;
  const ediblePortion = row.edible_portion ?? null;
  if (
    ediblePortion !== null &&
    (!isRecord(ediblePortion) ||
      (ediblePortion.percent !== null && ediblePortion.percent !== undefined &&
        (!Number.isFinite(Number(ediblePortion.percent)) ||
          Number(ediblePortion.percent) <= 0 || Number(ediblePortion.percent) > 100)))
  ) {
    throw new NutritionPipelineError("invalid_edible_portion");
  }
  const values = {};
  for (const [code, definition] of Object.entries(CORE_NUTRIENTS)) {
    values[code] = {
      ...normalizeNutrientToken(row.nutrients[definition.source_key], definition.unit),
      source_nutrient_code: definition.source_key,
    };
  }
  for (const [code, definition] of Object.entries(OPTIONAL_NUTRIENTS)) {
    const normalized = normalizeNutrientToken(
      row.nutrients[definition.source_key],
      definition.unit,
      { optional: true },
    );
    if (normalized !== null) {
      values[code] = {
        ...normalized,
        source_nutrient_code: definition.source_key,
      };
    }
  }
  const businessKey = `${sourceScope}:${externalKey}`;
  const contentHash = sha256({
    externalKey,
    externalName,
    basis,
    serving,
    totalContent,
    ediblePortion,
    values,
  });
  return {
    business_key: businessKey,
    external_item_key: externalKey,
    external_name: externalName,
    preparation_state: row.preparation_state ?? null,
    basis,
    serving,
    total_content: totalContent,
    edible_portion: ediblePortion,
    values,
    content_hash: contentHash,
    fingerprint: sha256({ business_key: businessKey, content_hash: contentHash }),
  };
}

function adaptMfdsProviderRow(row) {
  if (!isRecord(row)) return row;
  const nutrients = {
    energy: { value: row.AMT_NUM1, unit: "kcal" },
    protein: { value: row.AMT_NUM3, unit: "g" },
    fat: { value: row.AMT_NUM4, unit: "g" },
    carbohydrate: { value: row.AMT_NUM6, unit: "g" },
    sodium: { value: row.AMT_NUM13, unit: "mg" },
  };
  if (Object.hasOwn(row, "AMT_NUM7")) {
    nutrients.sugars = { value: row.AMT_NUM7, unit: "g" };
  }
  if (Object.hasOwn(row, "AMT_NUM8")) {
    nutrients.fiber = { value: row.AMT_NUM8, unit: "g" };
  }
  if (Object.hasOwn(row, "AMT_NUM24")) {
    nutrients.saturated_fat = { value: row.AMT_NUM24, unit: "g" };
  }
  return {
    external_item_key: row.FOOD_CD,
    external_name: row.FOOD_NM_KR,
    basis_text: row.SERVING_SIZE,
    nutrients,
  };
}

function adaptInputRow(row, inputShape) {
  if (inputShape === "adapted-row-v1") return row;
  if (inputShape === "mfds-provider-v1") return adaptMfdsProviderRow(row);
  throw new NutritionPipelineError("INPUT_SHAPE_UNSUPPORTED");
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
  if (
    !INPUT_SHAPES.has(manifest.input_shape) ||
    rawSnapshot.input_shape !== manifest.input_shape
  ) {
    throw new NutritionPipelineError("INPUT_SHAPE_MISMATCH");
  }

  const sourceScope = `${manifest.provider}:${manifest.dataset}:${manifest.source_version}`;
  const stagedRows = rawSnapshot.pages.flatMap((page) => page.items);
  const rows = [];
  const quarantined = [];
  const firstByBusinessKey = new Map();
  let identicalCount = 0;

  for (const [rowIndex, stagedRow] of stagedRows.entries()) {
    try {
      const normalized = normalizeRow(
        adaptInputRow(stagedRow, manifest.input_shape),
        sourceScope,
      );
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
    input_shape: manifest.input_shape,
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
  "evidence_schema_version",
  "evidence_kind",
  "evidence_checksum",
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
const RDA_MEASUREMENT_SOURCE_URL = "https://www.nics.go.kr/food/kfi/hsMarinade/list_03";
const RDA_LICENSE_EVIDENCE_URL =
  "https://nics.go.kr/contents/page.do?contentsId=3&homepageSeCode=nics&m=100000165";
const RDA_MEASUREMENT_FACTS = Object.freeze({
  "soy-sauce": 17.7,
  vinegar: 15.3,
  "soybean-paste": 18,
  gochujang: 19,
  honey: 24,
  "sesame-oil": 14.1,
});
const REPRESENTATIVE_GRADES = Object.freeze([
  Object.freeze({ id: "VOLUME_G6", grams: 6 }),
  Object.freeze({ id: "VOLUME_G10", grams: 10 }),
  Object.freeze({ id: "VOLUME_G15", grams: 15 }),
  Object.freeze({ id: "VOLUME_G20", grams: 20 }),
  Object.freeze({ id: "VOLUME_G25", grams: 25 }),
]);

function factMismatch() {
  throw new NutritionPipelineError("RDA_EVIDENCE_FACT_MISMATCH");
}

function representativeGrade(observed) {
  const selected = REPRESENTATIVE_GRADES.reduce((best, candidate) =>
    Math.abs(candidate.grams - observed) < Math.abs(best.grams - observed) ? candidate : best,
  );
  return {
    grade: selected.id,
    error: Number(Math.abs(selected.grams - observed).toFixed(10)),
  };
}

export function validateMeasurementEvidence(input) {
  if (!Array.isArray(input) || (input.length !== 0 && input.length !== 6)) {
    throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
  }
  const seen = new Set();
  const evidence = input.map((row) => {
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
    const observed = RDA_MEASUREMENT_FACTS[ingredientId];
    if (observed === undefined || seen.has(ingredientId)) factMismatch();
    seen.add(ingredientId);
    const computed = representativeGrade(observed);
    const reviewResult = requiredText(row.review_result, "RDA_EVIDENCE_SCHEMA_VIOLATION");
    const sourceUrl = sanitizeUrl(row.source_url);
    const licenseEvidenceUrl = sanitizeUrl(
      requiredText(row.license_evidence_url, "RDA_EVIDENCE_SCHEMA_VIOLATION"),
    );
    if (
      sourceUrl !== RDA_MEASUREMENT_SOURCE_URL ||
      licenseEvidenceUrl !== RDA_LICENSE_EVIDENCE_URL ||
      row.source_observed_unit !== "1 tbsp (15mL)" ||
      row.observed_g !== undefined ||
      row.observed_g_per_15ml !== observed ||
      reviewResult !== "needs_source_check" ||
      licenseDisposition !== "human_review_required" ||
      row.selected_representative_grade !== computed.grade ||
      typeof row.absolute_error_g_per_15ml !== "number" ||
      Math.abs(row.absolute_error_g_per_15ml - computed.error) > 1e-9
    ) factMismatch();
    const evidenceBase = {
      evidence_schema_version: "public-nutrition-measurement-evidence-v1",
      evidence_kind: "volume_weight",
      source_url: sourceUrl,
      accessed_at: ensureIsoDate(row.accessed_at, "RDA_EVIDENCE_SCHEMA_VIOLATION"),
      ingredient_or_category_id: ingredientId,
      source_observed_unit: "1 tbsp (15mL)",
      observed_g_per_15ml: observed,
      selected_representative_grade: computed.grade,
      absolute_error_g_per_15ml: computed.error,
      review_result: "needs_source_check",
      license_evidence_url: licenseEvidenceUrl,
      license_checked_at: ensureIsoDate(
        row.license_checked_at,
        "RDA_EVIDENCE_SCHEMA_VIOLATION",
      ),
      license_disposition: "human_review_required",
    };
    if (
      (row.evidence_schema_version !== undefined &&
        row.evidence_schema_version !== evidenceBase.evidence_schema_version) ||
      (row.evidence_kind !== undefined && row.evidence_kind !== evidenceBase.evidence_kind) ||
      (row.evidence_checksum !== undefined && row.evidence_checksum !== sha256(evidenceBase))
    ) {
      throw new NutritionPipelineError("RDA_EVIDENCE_SCHEMA_VIOLATION");
    }
    return { ...evidenceBase, evidence_checksum: sha256(evidenceBase) };
  });
  if (evidence.length > 0 && seen.size !== Object.keys(RDA_MEASUREMENT_FACTS).length) {
    factMismatch();
  }
  return evidence;
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
  const blockerCount =
    normalizedBundle.counts.quarantined_count +
    reviewedRows.filter((row) => row.status !== "approved").length;
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

function validatePromotionManifest(manifest) {
  try {
    const endpoint = sanitizeUrl(requiredText(
      manifest.endpoint_or_file_url,
      "MANIFEST_PROVENANCE_INVALID",
    ));
    const licenseUrl = sanitizeUrl(requiredText(
      manifest.license_url,
      "MANIFEST_PROVENANCE_INVALID",
    ));
    const licenseEvidenceUrl = sanitizeUrl(requiredText(
      manifest.license_evidence_url,
      "MANIFEST_PROVENANCE_INVALID",
    ));
    if (
      endpoint !== manifest.endpoint_or_file_url ||
      licenseUrl !== manifest.license_url ||
      licenseEvidenceUrl !== manifest.license_evidence_url ||
      !isRecord(manifest.query) ||
      canonicalStringify(sanitizeQuery(manifest.query)) !== canonicalStringify(manifest.query)
    ) {
      throw new NutritionPipelineError("MANIFEST_PROVENANCE_INVALID");
    }
    const countFields = [
      "fetched_raw_count",
      "unique_input_count",
      "normalized_count",
      "deduplicated_identical_count",
      "quarantined_count",
      "provider_reported_total",
      "page_count",
    ];
    if (
      countFields.some((key) => !Number.isInteger(manifest[key]) || manifest[key] < 0) ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !/^[a-f0-9]{64}$/.test(manifest.page_identity_checksum) ||
      !INPUT_SHAPES.has(manifest.input_shape) ||
      manifest.adapter_schema_version !== "nutrition-source-row-v1" ||
      manifest.status !== "raw" ||
      canonicalStringify(manifest.lifecycle) !== canonicalStringify(["raw"]) ||
      !isRecord(manifest.failed_reason_counts) ||
      manifest.production_db_writes !== 0
    ) {
      throw new NutritionPipelineError("MANIFEST_PROVENANCE_INVALID");
    }
    requiredText(manifest.fetched_at, "MANIFEST_PROVENANCE_INVALID");
    return {
      provider: requiredText(manifest.provider, "MANIFEST_PROVENANCE_INVALID"),
      dataset: requiredText(manifest.dataset, "MANIFEST_PROVENANCE_INVALID"),
      source_version: requiredText(
        manifest.source_version,
        "MANIFEST_PROVENANCE_INVALID",
      ),
      data_basis_date:
        manifest.data_basis_date === null
          ? null
          : ensureIsoDate(manifest.data_basis_date, "MANIFEST_PROVENANCE_INVALID"),
      endpoint_or_file_url: endpoint,
      query: sanitizeQuery(manifest.query),
      license: requiredText(manifest.license, "MANIFEST_PROVENANCE_INVALID"),
      license_url: licenseUrl,
      license_evidence_url: licenseEvidenceUrl,
      license_verified_at: ensureIsoDate(
        manifest.license_verified_at,
        "MANIFEST_PROVENANCE_INVALID",
      ),
      raw_sha256: manifest.sha256,
      input_shape: manifest.input_shape,
      adapter_schema_version: manifest.adapter_schema_version,
    };
  } catch {
    throw new NutritionPipelineError("MANIFEST_PROVENANCE_INVALID");
  }
}

export function buildApprovedPinnedHandoff({
  manifest,
  normalizedBundle,
  reviewReport,
  measurementEvidence = [],
}) {
  if (
    !isRecord(manifest) ||
    !isRecord(normalizedBundle) ||
    !isRecord(reviewReport) ||
    normalizedBundle.status !== "normalized" ||
    reviewReport.status !== "reviewed" ||
    reviewReport.blocker_count > 0 ||
    normalizedBundle.counts.quarantined_count > 0
  ) {
    throw new NutritionPipelineError("PROMOTION_BLOCKED");
  }
  const manifestIdentity = validatePromotionManifest(manifest);
  if (manifest.logical_batch_id !== logicalBatchId(manifestIdentity)) {
    throw new NutritionPipelineError("BATCH_PIN_MISMATCH");
  }
  if (
    manifest.logical_batch_id !== normalizedBundle.logical_batch_id ||
    manifest.logical_batch_id !== reviewReport.logical_batch_id ||
    manifest.sha256 !== normalizedBundle.raw_sha256 ||
    manifest.adapter_schema_version !== normalizedBundle.adapter_schema_version ||
    manifest.input_shape !== normalizedBundle.input_shape
  ) {
    throw new NutritionPipelineError("BATCH_PIN_MISMATCH");
  }
  const normalizedSource = {
    provider: normalizedBundle.source?.provider,
    dataset: normalizedBundle.source?.dataset,
    source_version: normalizedBundle.source?.source_version,
    data_basis_date: normalizedBundle.source?.data_basis_date,
    license: normalizedBundle.source?.license,
    source_url: normalizedBundle.source?.source_url,
  };
  const manifestSource = {
    provider: manifest.provider,
    dataset: manifest.dataset,
    source_version: manifest.source_version,
    data_basis_date: manifest.data_basis_date,
    license: manifest.license,
    source_url: manifest.endpoint_or_file_url,
  };
  if (canonicalStringify(normalizedSource) !== canonicalStringify(manifestSource)) {
    throw new NutritionPipelineError("SOURCE_PIN_MISMATCH");
  }
  const recomputedContentHash = sha256({
    rows: normalizedBundle.rows,
    quarantined: normalizedBundle.quarantined,
    counts: normalizedBundle.counts,
  });
  if (recomputedContentHash !== normalizedBundle.normalized_content_hash) {
    throw new NutritionPipelineError("NORMALIZED_CONTENT_HASH_MISMATCH");
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
  const reviewedFingerprints = Array.isArray(reviewReport.reviewed_rows)
    ? reviewReport.reviewed_rows.map((row) => row.fingerprint).toSorted()
    : [];
  const normalizedFingerprints = normalizedBundle.rows
    .map((row) => row.fingerprint)
    .toSorted();
  if (
    !Array.isArray(reviewReport.reviewed_rows) ||
    !Array.isArray(reviewReport.approved_fingerprints) ||
    reviewReport.reviewed_rows.length !== normalizedBundle.rows.length ||
    reviewReport.reviewed_rows.some((row) => row.status !== "approved") ||
    canonicalStringify(reviewReport.approved_fingerprints.toSorted()) !==
      canonicalStringify(reviewedFingerprints) ||
    canonicalStringify(reviewedFingerprints) !== canonicalStringify(normalizedFingerprints)
  ) {
    throw new NutritionPipelineError("PROMOTION_BLOCKED");
  }
  const approved = new Set(reviewReport.approved_fingerprints);
  const approvedItems = normalizedBundle.rows.filter((row) => approved.has(row.fingerprint));
  if (approvedItems.length === 0) throw new NutritionPipelineError("NO_APPROVED_ROWS");
  let evidence;
  let reviewedEvidence;
  try {
    evidence = validateMeasurementEvidence(measurementEvidence);
    reviewedEvidence = validateMeasurementEvidence(reviewReport.measurement_evidence);
  } catch {
    throw new NutritionPipelineError("REVIEW_EVIDENCE_MISMATCH");
  }
  if (sha256(evidence) !== sha256(reviewedEvidence)) {
    throw new NutritionPipelineError("REVIEW_EVIDENCE_MISMATCH");
  }
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
    handoff_schema_checksum: PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM,
    status: "approved_pinned",
    lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
    logical_batch_id: manifest.logical_batch_id,
    approved_manifest: {
      logical_batch_id: manifest.logical_batch_id,
      provider: manifest.provider,
      dataset: manifest.dataset,
      source_version: manifest.source_version,
      data_basis_date: manifest.data_basis_date,
      license: manifest.license,
      license_url: manifest.license_url,
      license_evidence_url: manifest.license_evidence_url,
      license_verified_at: manifest.license_verified_at,
      query: manifest.query,
      raw_sha256: manifest.sha256,
      input_shape: manifest.input_shape,
      adapter_schema_version: manifest.adapter_schema_version,
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

export function validateApprovedPinnedHandoff(bundle) {
  if (!isRecord(bundle)) throw new NutritionPipelineError("INVALID_HANDOFF_BUNDLE");
  const checksumInput = { ...bundle };
  delete checksumInput.handoff_checksum;
  const manifest = bundle.approved_manifest;
  const counts = manifest?.counts;
  const rowAccountingValid =
    isRecord(counts) &&
    counts.quarantined_count === 0 &&
    counts.normalized_count === bundle.approved_items?.length &&
    counts.unique_input_count === counts.normalized_count + counts.quarantined_count &&
    counts.fetched_raw_count ===
      counts.unique_input_count + counts.deduplicated_identical_count;
  const normalizedContentHash = rowAccountingValid
    ? sha256({ rows: bundle.approved_items, quarantined: [], counts })
    : null;
  const safeItems = Array.isArray(bundle.approved_items) && bundle.approved_items.every((item) =>
    isRecord(item) &&
    typeof item.external_item_key === "string" && item.external_item_key.trim() !== "" &&
    typeof item.external_name === "string" && item.external_name.trim() !== "" &&
    isRecord(item.basis) && Number.isFinite(item.basis.amount) && item.basis.amount > 0 &&
    ["g", "ml"].includes(String(item.basis.unit).toLowerCase()) &&
    isRecord(item.values) && Object.values(item.values).every((value) =>
      isRecord(value) &&
      (value.amount === null || (Number.isFinite(value.amount) && value.amount >= 0)),
    ),
  );
  const valid =
    bundle.schema_version === PUBLIC_NUTRITION_HANDOFF_SCHEMA.schema_version &&
    bundle.handoff_schema_checksum === PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM &&
    bundle.status === "approved_pinned" &&
    canonicalStringify(bundle.lifecycle) ===
      canonicalStringify(PUBLIC_NUTRITION_HANDOFF_SCHEMA.lifecycle) &&
    isRecord(manifest) &&
    manifest.logical_batch_id === bundle.logical_batch_id &&
    manifest.normalized_content_hash === normalizedContentHash &&
    bundle.normalized_content_hash === normalizedContentHash &&
    manifest.review_checksum === bundle.review_checksum &&
    rowAccountingValid &&
    safeItems &&
    Array.isArray(bundle.public_attribution) && bundle.public_attribution.length > 0 &&
    Array.isArray(bundle.measurement_evidence) &&
    bundle.production_db_writes === 0 &&
    typeof bundle.handoff_checksum === "string" &&
    bundle.handoff_checksum === sha256(checksumInput);
  if (!valid) throw new NutritionPipelineError("INVALID_HANDOFF_BUNDLE");
  const evidenceValid = bundle.measurement_evidence.every((evidence) => {
    if (!isRecord(evidence)) return false;
    const checksumInput = { ...evidence };
    delete checksumInput.evidence_checksum;
    const kindValid = evidence.evidence_kind === "volume_weight"
      ? Number.isFinite(evidence.observed_g_per_15ml) && evidence.observed_g_per_15ml > 0
      : evidence.evidence_kind === "piece_weight" &&
        Number.isFinite(evidence.observed_g) && evidence.observed_g > 0 &&
        typeof evidence.size_code === "string" && evidence.size_code.trim() !== "";
    return evidence.evidence_schema_version ===
        PUBLIC_NUTRITION_HANDOFF_SCHEMA.measurement_evidence_schema_version &&
      kindValid &&
      typeof evidence.evidence_checksum === "string" &&
      evidence.evidence_checksum === sha256(checksumInput);
  });
  if (!evidenceValid) {
    throw new NutritionPipelineError("INVALID_HANDOFF_BUNDLE");
  }
  return structuredClone(bundle);
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
    const url = buildPublicDataUrl(endpoint, apiKey, publicQuery);
    let response;
    try {
      response = await fetchImpl(url, {
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
  if (!isRecord(payload)) {
    throw new NutritionPipelineError("SCHEMA_DRIFT");
  }
  const hasDirectEnvelope = Object.hasOwn(payload, "header") || Object.hasOwn(payload, "body");
  const hasWrappedEnvelope = Object.hasOwn(payload, "response");
  if (hasDirectEnvelope === hasWrappedEnvelope) {
    throw new NutritionPipelineError("SCHEMA_DRIFT");
  }
  const response = hasWrappedEnvelope ? payload.response : payload;
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

function mfdsFailureContext(pages, requestedPageNo, pageSize) {
  return {
    received_page_count: pages.length,
    received_page_range: pages.length > 0
      ? { start: pages[0].page_no, end: pages.at(-1).page_no }
      : null,
    requested_page_no: requestedPageNo,
    source_id: SOURCE_REGISTRY["mfds-15127578"].id,
    source_url: sanitizeUrl(SOURCE_REGISTRY["mfds-15127578"].request_endpoint),
    query: sanitizeQuery({ pageNo: requestedPageNo, numOfRows: pageSize, type: "json" }),
  };
}

function throwMfdsFailureWithContext(error, pages, requestedPageNo, pageSize) {
  if (error instanceof NutritionPipelineError) {
    throw new NutritionPipelineError(error.code, {
      ...error.details,
      ...mfdsFailureContext(pages, requestedPageNo, pageSize),
    });
  }
  throw error;
}

export async function fetchMfdsBatch({
  apiKey,
  fetchedAt,
  pageSize = 100,
  maxPages = MAX_PAGES,
  fetchImpl = globalThis.fetch,
  sleep,
  now,
  createTimeoutSignal,
}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new NutritionPipelineError("MISSING_API_KEY", { env: "DATA_GO_KR_API_KEY" });
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new NutritionPipelineError("PAGINATION_SCHEMA_INVALID", {
      ...mfdsFailureContext([], 1, pageSize),
      max_pages: maxPages,
    });
  }
  const pages = [];
  let accumulated = 0;
  let total = null;
  let complete = false;
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    let page;
    try {
      const payload = await requestJsonWithRetry({
        endpoint: SOURCE_REGISTRY["mfds-15127578"].request_endpoint,
        query: { pageNo, numOfRows: pageSize, type: "json" },
        apiKey,
        fetchImpl,
        sleep,
        now,
        createTimeoutSignal,
      });
      page = parseMfdsPage(payload, pageNo);
      const pagination = validatePages([...pages, page], { allowIncomplete: true });
      accumulated = pagination.accumulated;
      total = pagination.reportedTotal;
    } catch (error) {
      throwMfdsFailureWithContext(error, pages, pageNo, pageSize);
    }
    pages.push(page);
    if (accumulated === total) {
      complete = true;
      break;
    }
  }
  if (!complete) {
    throw new NutritionPipelineError("PAGINATION_INCOMPLETE", {
      reported_total: total,
      accumulated,
      ...mfdsFailureContext(pages, maxPages + 1, pageSize),
    });
  }
  return buildRawBatch({
    source: SOURCE_REGISTRY["mfds-15127578"].manifest_source,
    adapter_schema_version: "nutrition-source-row-v1",
    input_shape: "mfds-provider-v1",
    pages,
    query: {
      pageNo_start: 1,
      pageNo_end: pages.length,
      numOfRows: pageSize,
      type: "json",
    },
    fetchedAt,
  });
}
