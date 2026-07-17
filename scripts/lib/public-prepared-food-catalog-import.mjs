import { createHash } from "node:crypto";

import { buildPublicDataUrl } from "./public-data-url.mjs";
import { requestJsonWithRetry } from "./public-nutrition-pipeline.mjs";

const AUTH_QUERY_KEYS = new Set([
  "servicekey",
  "apikey",
  "api_key",
  "authorization",
  "access_token",
  "token",
]);

const BASIS_UNIT_MAP = new Map([
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["ml", "ml"],
  ["mL", "ml"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
]);

const CORE_NUTRIENTS = Object.freeze([
  ["energy_kcal", { keys: ["enerc", "energyKcal", "energy_kcal"], unit: "kcal" }],
  ["carbohydrate_g", { keys: ["chocdf", "carbohydrateG", "carbohydrate_g"], unit: "g" }],
  ["protein_g", { keys: ["prot", "proteinG", "protein_g"], unit: "g" }],
  ["fat_g", { keys: ["fatce", "fatG", "fat_g"], unit: "g" }],
  ["sodium_mg", { keys: ["nat", "sodiumMg", "sodium_mg"], unit: "mg" }],
]);

const OPTIONAL_NUTRIENTS = Object.freeze([
  ["sugars_g", { keys: ["sugars", "sugar", "sugarsG", "sugars_g"], unit: "g" }],
  ["saturated_fat_g", { keys: ["fasat", "saturatedFatG", "saturated_fat_g"], unit: "g" }],
  ["fiber_g", { keys: ["fibtg", "fiberG", "fiber_g"], unit: "g" }],
]);

const REVIEWABLE_STATUSES = new Set(["pending", "approved", "rejected", "needs_review"]);
const ALLOWED_LICENSES = new Set(["이용허락범위 제한 없음", "public-open-data"]);
const IMPORT_SCHEMA = Object.freeze({
  schema_version: "public-prepared-food-catalog-import-v1",
  lifecycle: Object.freeze(["raw", "normalized", "reviewed", "approved_pinned"]),
});
const IMPORT_SCHEMA_CHECKSUM = sha256(IMPORT_SCHEMA);
const LIVE_ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_nutri_process_info_api";
const PREPARED_FOOD_SOURCE_ID = "data-go-kr-15100066";
const PREPARED_FOOD_DATASET_ID = "15100066";
const PREPARED_FOOD_ROW_SCHEMA_VERSION = "public-prepared-food-row-v1";
const MIN_PREPARED_FOOD_PILOT_ROWS = 10_000;
export const PUBLIC_PREPARED_FOOD_IMPORT_SCHEMA = IMPORT_SCHEMA;
export const PUBLIC_PREPARED_FOOD_IMPORT_SCHEMA_CHECKSUM = IMPORT_SCHEMA_CHECKSUM;
export const PUBLIC_PREPARED_FOOD_IMPORT_LIFECYCLE = [...IMPORT_SCHEMA.lifecycle];

export class PreparedFoodCatalogImportError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "PreparedFoodCatalogImportError";
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalStringify(value) {
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

function sha256(value) {
  const input = typeof value === "string" ? value : canonicalStringify(value);
  return createHash("sha256").update(input).digest("hex");
}

function requiredText(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PreparedFoodCatalogImportError(code);
  }
  return value.trim();
}

function ensureIsoDate(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PreparedFoodCatalogImportError(code);
  }
  return value;
}

function ensureIsoTimestamp(value, code) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PreparedFoodCatalogImportError(code);
  }
  return value;
}

function sanitizeUrl(value) {
  const url = new URL(requiredText(value, "SOURCE_URL_MISSING"));
  for (const key of [...url.searchParams.keys()]) {
    if (AUTH_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

function sanitizeQueryValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeQueryValue);
  if (isRecord(value)) return sanitizeQuery(value);
  return String(value);
}

function sanitizeQuery(query = {}) {
  if (!isRecord(query)) return {};
  return Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => !AUTH_QUERY_KEYS.has(key.toLowerCase()))
      .map(([key, value]) => [key, sanitizeQueryValue(value)]),
  );
}

function datasetIdFromSourceId(sourceId) {
  const match = /^data-go-kr-(\d+)$/.exec(sourceId);
  return match?.[1] ?? null;
}

function schemaFingerprintFromPages(pages) {
  const keys = new Set();
  for (const page of pages) {
    for (const item of page.items) {
      for (const key of Object.keys(item)) keys.add(key);
    }
  }
  return `${PREPARED_FOOD_ROW_SCHEMA_VERSION}:${[...keys].sort().join(",")}`;
}

function paginationMetadataFromPages(pages) {
  return {
    mode: "pages",
    page_count: pages.length,
    total_count: pages.reduce((max, page) => Math.max(max, page.total_count), 0),
    page_size: pages.reduce((max, page) => Math.max(max, page.items.length), 0),
  };
}

function readField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const upper = key.toUpperCase();
    if (row[upper] !== undefined && row[upper] !== null) return row[upper];
  }
  return undefined;
}

function missingToken(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === ""
      || normalized === "-"
      || normalized === "n/a"
      || normalized === "na"
      || normalized === "해당없음"
      || normalized === "해당 없음";
  }
  return false;
}

function parseNumeric(value) {
  if (missingToken(value)) return { kind: "missing", value: null };
  const normalized = String(value).trim().replaceAll(",", "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return { kind: "invalid", value: null };
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { kind: "invalid", value: null };
  }
  return { kind: "value", value: parsed };
}

function parseBasisText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, "").trim();
  const match = /^100(?<unit>g|ml)$/i.exec(normalized);
  if (!match) return null;
  const unit = BASIS_UNIT_MAP.get(match.groups.unit);
  return unit ? { amount: 100, unit, source_text: value.trim() } : null;
}

function normalizeText(value) {
  if (missingToken(value)) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function chooseCompany(row) {
  return {
    manufacturer_name: normalizeText(readField(row, ["makerNm", "maker_nm"])),
    distributor_name: normalizeText(readField(row, ["saleCorpNm", "sale_corp_nm", "distrbNm"])),
    importer_name: normalizeText(readField(row, ["importerNm", "importer_nm", "importCorpNm"])),
  };
}

function stableKey(row) {
  const itemReport = normalizeText(readField(row, ["itemMnftrRptNo", "item_report_no"]));
  if (itemReport !== null) {
    return { external_item_key: `item-report:${itemReport}`, key_source: "itemMnftrRptNo" };
  }
  const foodCode = normalizeText(readField(row, ["foodCd", "food_cd"]));
  if (foodCode !== null) {
    return { external_item_key: `food-code:${foodCode}`, key_source: "foodCd" };
  }
  return null;
}

function normalizeValueMap(row) {
  const normalizedValues = {};
  for (const [code, meta] of [...CORE_NUTRIENTS, ...OPTIONAL_NUTRIENTS]) {
    const raw = readField(row, meta.keys);
    const parsed = parseNumeric(raw);
    if (parsed.kind === "missing") {
      if (CORE_NUTRIENTS.some(([coreCode]) => coreCode === code)) {
        throw new PreparedFoodCatalogImportError("PRODUCT_CORE_NUTRIENT_MISSING", { nutrient: code });
      }
      continue;
    }
    if (parsed.kind === "invalid") {
      throw new PreparedFoodCatalogImportError("PRODUCT_NUTRIENT_INVALID", { nutrient: code });
    }
    normalizedValues[code] = {
      amount: parsed.value,
      source_nutrient_code: meta.keys[0],
      source_unit: meta.unit,
      value_status: "observed",
      source_token: String(raw).trim(),
    };
  }
  return normalizedValues;
}

function normalizeApprovedRow(candidate) {
  const base = {
    external_item_key: candidate.external_item_key,
    external_name: candidate.external_name,
    manufacturer_name: candidate.manufacturer_name,
    distributor_name: candidate.distributor_name,
    importer_name: candidate.importer_name,
    basis: candidate.basis,
    label_basis_text: candidate.label_basis_text,
    source_serving_text: candidate.source_serving_text,
    source_food_size_text: candidate.source_food_size_text,
    values: candidate.values,
  };
  const stable_fingerprint = computePreparedFoodApprovedItemDigest(base);
  return {
    ...base,
    stable_fingerprint,
    fingerprint: stable_fingerprint,
    content_hash: stable_fingerprint,
  };
}

export function computePreparedFoodApprovedItemDigest(item) {
  const nutrientEntries = Object.entries(item.values ?? {})
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([code, value]) => [
      code,
      value?.amount ?? "",
      value?.source_nutrient_code ?? "",
      value?.source_unit ?? "",
      value?.value_status ?? "",
      value?.source_token ?? "",
    ].join("\u001f"));
  return sha256([
    item.external_item_key ?? "",
    item.external_name ?? "",
    item.manufacturer_name ?? "",
    item.distributor_name ?? "",
    item.importer_name ?? "",
    item.basis?.amount ?? "",
    item.basis?.unit ?? "",
    item.basis?.source_text ?? "",
    item.label_basis_text ?? "",
    item.source_serving_text ?? "",
    item.source_food_size_text ?? "",
    nutrientEntries.join("\u001e"),
  ].join("\u001d"));
}

export function computePreparedFoodApprovedFingerprintChecksum(items) {
  return sha256(
    items
      .map((item) => computePreparedFoodApprovedItemDigest(item))
      .sort((left, right) => left.localeCompare(right, "en"))
      .join("\u001e"),
  );
}

export function computePreparedFoodNormalizedContentHash(items, counts) {
  const digests = items
    .map((item) => computePreparedFoodApprovedItemDigest(item))
    .sort((left, right) => left.localeCompare(right, "en"));
  return sha256([
    counts.fetched_raw_count,
    counts.unique_input_count,
    counts.normalized_count,
    counts.deduplicated_identical_count,
    counts.quarantined_count,
    digests.join("\u001e"),
  ].join("\u001d"));
}

export function computePreparedFoodSourcePayloadIdentity(manifest, normalized_content_hash) {
  return sha256([
    manifest.provider ?? "",
    manifest.dataset ?? "",
    manifest.source_version ?? "",
    manifest.endpoint_or_file_url ?? "",
    normalized_content_hash ?? "",
  ].join("\u001d"));
}

export function computePreparedFoodImportContentHash({
  source_payload_identity,
  normalized_content_hash,
  review_checksum,
}) {
  return sha256([
    source_payload_identity ?? "",
    normalized_content_hash ?? "",
    review_checksum ?? "",
  ].join("\u001d"));
}

function normalizeCandidate(row, rowIndex) {
  const key = stableKey(row);
  if (key === null) {
    throw new PreparedFoodCatalogImportError("PRODUCT_STABLE_KEY_MISSING", { row_index: rowIndex });
  }
  const external_name = normalizeText(readField(row, ["foodNm", "food_nm", "prdlstNm"]));
  if (external_name === null) {
    throw new PreparedFoodCatalogImportError("PRODUCT_NAME_MISSING", { row_index: rowIndex });
  }
  const basis = parseBasisText(readField(row, ["nutConSrtrQua", "nut_con_srtr_qua", "basisText"]));
  if (basis === null) {
    throw new PreparedFoodCatalogImportError("PRODUCT_BASIS_UNSUPPORTED", { row_index: rowIndex });
  }
  const values = normalizeValueMap(row);
  if (Object.keys(values).filter((code) =>
    CORE_NUTRIENTS.some(([coreCode]) => coreCode === code),
  ).length !== CORE_NUTRIENTS.length) {
    throw new PreparedFoodCatalogImportError("PRODUCT_CORE_NUTRIENT_MISSING", { row_index: rowIndex });
  }
  return normalizeApprovedRow({
    ...key,
    external_name,
    ...chooseCompany(row),
    basis,
    label_basis_text: basis.source_text,
    source_serving_text: normalizeText(readField(row, ["servSize", "serv_size"])),
    source_food_size_text: normalizeText(readField(row, ["foodSize", "food_size"])),
    values,
  });
}

function rawSnapshotShape({ source, query, pages }) {
  if (!isRecord(source)) throw new PreparedFoodCatalogImportError("SOURCE_METADATA_MISSING");
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new PreparedFoodCatalogImportError("PAGINATION_SCHEMA_INVALID");
  }
  const normalizedPages = pages.map((page, index) => {
    if (!isRecord(page) || !Array.isArray(page.items)) {
      throw new PreparedFoodCatalogImportError("PAGINATION_SCHEMA_INVALID");
    }
    return {
      page_no: Number(page.page_no ?? index + 1),
      total_count: Number(page.total_count ?? page.items.length),
      items: page.items.map((item) => {
        if (!isRecord(item)) throw new PreparedFoodCatalogImportError("PAGINATION_SCHEMA_INVALID");
        return structuredClone(item);
      }),
    };
  });
  const sourceId = requiredText(source.id, "SOURCE_ID_MISSING");
  return {
    source: {
      id: sourceId,
      provider: requiredText(source.provider, "SOURCE_PROVIDER_MISSING"),
      dataset: requiredText(source.dataset, "SOURCE_DATASET_MISSING"),
      source_version: requiredText(source.source_version, "SOURCE_VERSION_MISSING"),
      data_basis_date:
        source.data_basis_date === null || source.data_basis_date === undefined
          ? null
          : ensureIsoDate(source.data_basis_date, "DATA_BASIS_DATE_INVALID"),
      endpoint_or_file_url: sanitizeUrl(source.endpoint_or_file_url),
      license: requiredText(source.license, "SOURCE_LICENSE_MISSING"),
      license_url: sanitizeUrl(source.license_url),
      license_evidence_url: sanitizeUrl(source.license_evidence_url),
      license_verified_at: ensureIsoDate(source.license_verified_at, "LICENSE_VERIFIED_AT_MISSING"),
    },
    query: sanitizeQuery(query),
    pages: normalizedPages,
  };
}

export function buildPreparedFoodRawBatch({ source, query = {}, pages, fetchedAt }) {
  const rawSnapshot = rawSnapshotShape({ source, query, pages });
  const fetched_raw_count = rawSnapshot.pages.reduce((sum, page) => sum + page.items.length, 0);
  const schema_fingerprint = schemaFingerprintFromPages(rawSnapshot.pages);
  const pagination_metadata = paginationMetadataFromPages(rawSnapshot.pages);
  const dataset_id = datasetIdFromSourceId(rawSnapshot.source.id);
  const manifest = {
    schema_version: "public-prepared-food-raw-v1",
    status: "raw",
    source_id: rawSnapshot.source.id,
    dataset_id,
    lifecycle: ["raw"],
    provider: rawSnapshot.source.provider,
    dataset: rawSnapshot.source.dataset,
    source_version: rawSnapshot.source.source_version,
    data_basis_date: rawSnapshot.source.data_basis_date,
    endpoint_or_file_url: rawSnapshot.source.endpoint_or_file_url,
    license: rawSnapshot.source.license,
    license_url: rawSnapshot.source.license_url,
    license_evidence_url: rawSnapshot.source.license_evidence_url,
    license_verified_at: rawSnapshot.source.license_verified_at,
    fetched_at: ensureIsoTimestamp(fetchedAt, "FETCHED_AT_INVALID"),
    fetched_raw_count,
    unique_input_count: fetched_raw_count,
    normalized_count: 0,
    deduplicated_identical_count: 0,
    quarantined_count: 0,
    query: rawSnapshot.query,
    input_shape: PREPARED_FOOD_ROW_SCHEMA_VERSION,
    adapter_schema_version: PREPARED_FOOD_ROW_SCHEMA_VERSION,
    schema_fingerprint,
    pagination_metadata,
    sha256: sha256(rawSnapshot.pages),
    logical_batch_id: sha256({
      provider: rawSnapshot.source.provider,
      dataset: rawSnapshot.source.dataset,
      source_version: rawSnapshot.source.source_version,
      data_basis_date: rawSnapshot.source.data_basis_date,
      endpoint_or_file_url: rawSnapshot.source.endpoint_or_file_url,
      query: rawSnapshot.query,
      raw: sha256(rawSnapshot.pages),
    }),
    production_db_writes: 0,
  };
  return { rawSnapshot, manifest };
}

export function normalizePreparedFoodCatalogBatch({
  rawSnapshot,
  manifest,
  adapterSchemaVersion,
}) {
  if (!isRecord(rawSnapshot) || !isRecord(manifest) || manifest.status !== "raw") {
    throw new PreparedFoodCatalogImportError("RAW_BATCH_INVALID");
  }
  if (
    adapterSchemaVersion !== PREPARED_FOOD_ROW_SCHEMA_VERSION
    || manifest.adapter_schema_version !== PREPARED_FOOD_ROW_SCHEMA_VERSION
  ) {
    throw new PreparedFoodCatalogImportError("SOURCE_SCHEMA_DRIFT");
  }

  const acceptedByKey = new Map();
  const conflictedKeys = new Set();
  const quarantined = [];
  let deduplicated_identical_count = 0;
  let rowIndex = 0;

  for (const page of rawSnapshot.pages ?? []) {
    for (const item of page.items ?? []) {
      rowIndex += 1;
      try {
        const candidate = normalizeCandidate(item, rowIndex - 1);
        if (conflictedKeys.has(candidate.external_item_key)) {
          quarantined.push({
            row_index: rowIndex - 1,
            reason_code: "PRODUCT_STABLE_KEY_CONFLICT",
            external_item_key: candidate.external_item_key,
          });
          continue;
        }
        const existing = acceptedByKey.get(candidate.external_item_key);
        if (existing === undefined) {
          acceptedByKey.set(candidate.external_item_key, {
            candidate,
            row_index: rowIndex - 1,
          });
          continue;
        }
        if (existing.candidate.content_hash === candidate.content_hash) {
          deduplicated_identical_count += 1;
          continue;
        }
        conflictedKeys.add(candidate.external_item_key);
        quarantined.push({
          row_index: existing.row_index,
          reason_code: "PRODUCT_STABLE_KEY_CONFLICT",
          external_item_key: candidate.external_item_key,
        });
        quarantined.push({
          row_index: rowIndex - 1,
          reason_code: "PRODUCT_STABLE_KEY_CONFLICT",
          external_item_key: candidate.external_item_key,
        });
        acceptedByKey.delete(candidate.external_item_key);
      } catch (error) {
        quarantined.push({
          row_index: rowIndex - 1,
          reason_code: error.code ?? "PRODUCT_ROW_INVALID",
        });
      }
    }
  }

  const rows = [...acceptedByKey.values()]
    .map((entry) => entry.candidate)
    .filter((row) => !conflictedKeys.has(row.external_item_key))
    .sort((left, right) => left.external_item_key.localeCompare(right.external_item_key, "en"));
  const counts = {
    fetched_raw_count: manifest.fetched_raw_count,
    unique_input_count: manifest.fetched_raw_count - deduplicated_identical_count,
    normalized_count: rows.length,
    deduplicated_identical_count,
    quarantined_count: quarantined.length,
  };
  const normalized_content_hash = computePreparedFoodNormalizedContentHash(rows, counts);
  return {
    schema_version: "public-prepared-food-normalized-v1",
    status: "normalized",
    lifecycle: ["raw", "normalized"],
    logical_batch_id: manifest.logical_batch_id,
    raw_sha256: manifest.sha256,
    source_id: manifest.source_id,
    dataset_id: manifest.dataset_id,
    schema_fingerprint: manifest.schema_fingerprint,
    pagination_metadata: manifest.pagination_metadata,
    source: {
      provider: manifest.provider,
      dataset: manifest.dataset,
      source_version: manifest.source_version,
      data_basis_date: manifest.data_basis_date,
      license: manifest.license,
      source_url: manifest.endpoint_or_file_url,
    },
    input_shape: manifest.input_shape,
    adapter_schema_version: manifest.adapter_schema_version,
    rows,
    quarantined,
    counts,
    quarantine_reason_counts: Object.fromEntries(
      quarantined.reduce((map, row) => {
        map.set(row.reason_code, (map.get(row.reason_code) ?? 0) + 1);
        return map;
      }, new Map()),
    ),
    normalized_content_hash,
    production_db_writes: 0,
  };
}

export function buildPreparedFoodCatalogReview({ normalizedBundle, decisions }) {
  if (!isRecord(normalizedBundle) || normalizedBundle.status !== "normalized") {
    throw new PreparedFoodCatalogImportError("NORMALIZED_BUNDLE_INVALID");
  }
  if (!Array.isArray(decisions)) {
    throw new PreparedFoodCatalogImportError("REVIEW_DECISIONS_INVALID");
  }

  const knownFingerprints = new Set((normalizedBundle.rows ?? []).map((row) => row.fingerprint));
  const decisionByFingerprint = new Map();
  for (const decision of decisions) {
    if (!isRecord(decision) || !knownFingerprints.has(decision.fingerprint)) {
      throw new PreparedFoodCatalogImportError("REVIEW_DECISION_UNKNOWN");
    }
    if (!REVIEWABLE_STATUSES.has(decision.status)) {
      throw new PreparedFoodCatalogImportError("REVIEW_DECISION_INVALID");
    }
    decisionByFingerprint.set(decision.fingerprint, decision.status);
  }

  const reviewed_rows = normalizedBundle.rows.map((row) => ({
    fingerprint: row.fingerprint,
    status: decisionByFingerprint.get(row.fingerprint) ?? "pending",
  }));
  const approved_fingerprints = reviewed_rows
    .filter((row) => row.status === "approved")
    .map((row) => row.fingerprint)
    .sort();
  const blocker_count =
    normalizedBundle.counts.quarantined_count +
    reviewed_rows.filter((row) => row.status !== "approved").length;
  const reportBase = {
    schema_version: "public-prepared-food-review-v1",
    status: "reviewed",
    lifecycle: ["raw", "normalized", "reviewed"],
    logical_batch_id: normalizedBundle.logical_batch_id,
    normalized_content_hash: normalizedBundle.normalized_content_hash,
    reviewed_rows,
    approved_fingerprints,
    blocker_count,
    counts: normalizedBundle.counts,
    quarantine_reason_counts: normalizedBundle.quarantine_reason_counts,
    production_db_writes: 0,
  };
  return { ...reportBase, review_checksum: sha256(reportBase) };
}

function canonicalApprovedItems(rows) {
  return rows.map((row) => normalizeApprovedRow(row));
}

export function buildPreparedFoodCatalogImportBundle({
  manifest,
  normalizedBundle,
  reviewReport,
}) {
  if (
    !isRecord(manifest) ||
    !isRecord(normalizedBundle) ||
    !isRecord(reviewReport) ||
    normalizedBundle.status !== "normalized" ||
    reviewReport.status !== "reviewed"
  ) {
    throw new PreparedFoodCatalogImportError("PROMOTION_BLOCKED");
  }
  if (normalizedBundle.counts.quarantined_count > 0 || reviewReport.blocker_count > 0) {
    throw new PreparedFoodCatalogImportError("PROMOTION_BLOCKED");
  }
  if (manifest.source_id !== PREPARED_FOOD_SOURCE_ID || manifest.dataset_id !== PREPARED_FOOD_DATASET_ID) {
    throw new PreparedFoodCatalogImportError("SOURCE_SCHEMA_DRIFT");
  }
  if (!ALLOWED_LICENSES.has(String(manifest.license))) {
    throw new PreparedFoodCatalogImportError("SOURCE_LICENSE_NOT_APPROVED");
  }
  if (manifest.sha256 !== normalizedBundle.raw_sha256) {
    throw new PreparedFoodCatalogImportError("SOURCE_CHECKSUM_MISMATCH");
  }
  if (
    manifest.logical_batch_id !== normalizedBundle.logical_batch_id
    || manifest.schema_fingerprint !== normalizedBundle.schema_fingerprint
    || canonicalStringify(manifest.pagination_metadata) !== canonicalStringify(normalizedBundle.pagination_metadata)
    || manifest.adapter_schema_version !== PREPARED_FOOD_ROW_SCHEMA_VERSION
  ) {
    throw new PreparedFoodCatalogImportError("SOURCE_SCHEMA_DRIFT");
  }

  const rows = canonicalApprovedItems(normalizedBundle.rows);
  const fingerprints = rows.map((row) => row.fingerprint).sort();
  if (
    canonicalStringify(reviewReport.approved_fingerprints.toSorted()) !== canonicalStringify(fingerprints)
    || reviewReport.reviewed_rows.some((row) => row.status !== "approved")
  ) {
    throw new PreparedFoodCatalogImportError("PROMOTION_BLOCKED");
  }

  const counts = {
    fetched_raw_count: normalizedBundle.counts.fetched_raw_count,
    unique_input_count: normalizedBundle.counts.unique_input_count,
    normalized_count: rows.length,
    deduplicated_identical_count: normalizedBundle.counts.deduplicated_identical_count,
    quarantined_count: 0,
  };
  const approved_fingerprint_checksum = computePreparedFoodApprovedFingerprintChecksum(rows);
  const normalized_content_hash = computePreparedFoodNormalizedContentHash(rows, counts);
  const approved_manifest = {
    logical_batch_id: manifest.logical_batch_id,
    provider: manifest.provider,
    dataset: manifest.dataset,
    source_id: manifest.source_id,
    dataset_id: manifest.dataset_id,
    source_version: manifest.source_version,
    data_basis_date: manifest.data_basis_date,
    endpoint_or_file_url: manifest.endpoint_or_file_url,
    license: manifest.license,
    license_url: manifest.license_url,
    license_evidence_url: manifest.license_evidence_url,
    license_verified_at: manifest.license_verified_at,
    raw_sha256: manifest.sha256,
    schema_fingerprint: manifest.schema_fingerprint,
    pagination_metadata: manifest.pagination_metadata,
    query: sanitizeQuery(manifest.query),
    counts,
  };
  const handoffBase = {
    schema_version: IMPORT_SCHEMA.schema_version,
    handoff_schema_checksum: IMPORT_SCHEMA_CHECKSUM,
    status: "approved_pinned",
    lifecycle: [...IMPORT_SCHEMA.lifecycle],
    logical_batch_id: manifest.logical_batch_id,
    source_payload_identity: computePreparedFoodSourcePayloadIdentity(manifest, normalized_content_hash),
    approved_manifest,
    approved_items: rows,
    public_attribution: [{
      provider: manifest.provider,
      dataset: manifest.dataset,
      source_version: manifest.source_version,
      data_basis_date: manifest.data_basis_date,
      license: manifest.license,
      source_url: manifest.endpoint_or_file_url,
    }],
    raw_sha256: manifest.sha256,
    schema_fingerprint: manifest.schema_fingerprint,
    approved_fingerprint_checksum,
    normalized_content_hash,
    review_checksum: approved_fingerprint_checksum,
    content_hash: computePreparedFoodImportContentHash({
      source_payload_identity: computePreparedFoodSourcePayloadIdentity(manifest, normalized_content_hash),
      normalized_content_hash,
      review_checksum: approved_fingerprint_checksum,
    }),
    production_db_writes: 0,
  };
  return handoffBase;
}

export function validatePreparedFoodCatalogImportBundle(bundle) {
  if (!isRecord(bundle)) {
    throw new PreparedFoodCatalogImportError("INVALID_IMPORT_BUNDLE");
  }
  const checksumValid = bundle.handoff_schema_checksum === IMPORT_SCHEMA_CHECKSUM;
  const lifecycleValid =
    canonicalStringify(bundle.lifecycle) === canonicalStringify(IMPORT_SCHEMA.lifecycle);
  const itemsValid = Array.isArray(bundle.approved_items) && bundle.approved_items.length > 0
    && bundle.approved_items.every((item) =>
      isRecord(item)
      && typeof item.external_item_key === "string"
      && typeof item.external_name === "string"
      && isRecord(item.basis)
      && item.basis.amount === 100
      && ["g", "ml"].includes(item.basis.unit)
      && isRecord(item.values)
      && CORE_NUTRIENTS.every(([code]) => {
        const value = item.values[code];
        return isRecord(value) && Number.isFinite(value.amount) && value.amount >= 0;
      }));
  const counts = bundle.approved_manifest?.counts;
  const manifest = bundle.approved_manifest;
  const rowAccountingValid = isRecord(counts)
    && counts.quarantined_count === 0
    && counts.normalized_count === bundle.approved_items.length
    && counts.unique_input_count === counts.normalized_count + counts.quarantined_count
    && counts.fetched_raw_count === counts.unique_input_count + counts.deduplicated_identical_count;
  const canonicalItems = rowAccountingValid ? canonicalApprovedItems(bundle.approved_items) : [];
  const normalized_content_hash = rowAccountingValid
    ? computePreparedFoodNormalizedContentHash(canonicalItems, counts)
    : null;
  const approved_fingerprint_checksum = rowAccountingValid
    ? computePreparedFoodApprovedFingerprintChecksum(canonicalItems)
    : null;
  const source_payload_identity = rowAccountingValid
    ? computePreparedFoodSourcePayloadIdentity(manifest, normalized_content_hash)
    : null;
  const content_hash = rowAccountingValid
    ? computePreparedFoodImportContentHash({
      source_payload_identity,
      normalized_content_hash,
      review_checksum: approved_fingerprint_checksum,
    })
    : null;
  if (
    bundle.schema_version !== IMPORT_SCHEMA.schema_version
    || !checksumValid
    || bundle.status !== "approved_pinned"
    || !lifecycleValid
    || !itemsValid
    || !rowAccountingValid
    || bundle.normalized_content_hash !== normalized_content_hash
    || bundle.production_db_writes !== 0
    || !isRecord(manifest)
    || manifest.source_id !== PREPARED_FOOD_SOURCE_ID
    || manifest.dataset_id !== PREPARED_FOOD_DATASET_ID
    || manifest.raw_sha256 !== bundle.raw_sha256
    || manifest.schema_fingerprint !== bundle.schema_fingerprint
    || !ALLOWED_LICENSES.has(String(manifest.license))
    || bundle.approved_fingerprint_checksum !== approved_fingerprint_checksum
    || bundle.review_checksum !== approved_fingerprint_checksum
    || bundle.source_payload_identity !== source_payload_identity
    || bundle.content_hash !== content_hash
  ) {
    throw new PreparedFoodCatalogImportError("INVALID_IMPORT_BUNDLE");
  }
  return {
    ...structuredClone(bundle),
    approved_items: canonicalItems,
    approved_fingerprint_checksum,
    normalized_content_hash,
    source_payload_identity,
    content_hash,
  };
}

function assertPreparedFoodImportWriteBoundary(bundle) {
  const manifest = bundle.approved_manifest;
  if (!isRecord(manifest)) {
    throw new PreparedFoodCatalogImportError("CHECKPOINT_MISMATCH");
  }
  if (!ALLOWED_LICENSES.has(String(manifest.license))) {
    throw new PreparedFoodCatalogImportError("SOURCE_LICENSE_NOT_APPROVED");
  }
  if (
    manifest.source_id !== PREPARED_FOOD_SOURCE_ID
    || manifest.dataset_id !== PREPARED_FOOD_DATASET_ID
    || manifest.raw_sha256 !== bundle.raw_sha256
    || manifest.schema_fingerprint !== bundle.schema_fingerprint
  ) {
    throw new PreparedFoodCatalogImportError("SOURCE_SCHEMA_DRIFT");
  }
  const scope = manifest.query?.scope;
  const checkpoint = manifest.query?.approval_checkpoint;
  const approvedRowCount = Number(checkpoint?.approved_row_count);
  const selectionMode = checkpoint?.selection_mode;
  if (!isRecord(checkpoint) || (scope !== "pilot" && scope !== "full")) {
    throw new PreparedFoodCatalogImportError("CHECKPOINT_MISMATCH");
  }
  if (checkpoint.target_fingerprint !== bundle.normalized_content_hash) {
    throw new PreparedFoodCatalogImportError("TARGET_FINGERPRINT_MISMATCH");
  }
  if (
    !Number.isInteger(approvedRowCount)
    || approvedRowCount !== bundle.approved_items.length
    || typeof checkpoint.approved_at !== "string"
    || Number.isNaN(Date.parse(checkpoint.approved_at))
  ) {
    throw new PreparedFoodCatalogImportError("CHECKPOINT_MISMATCH");
  }
  if (scope === "pilot") {
    if (selectionMode !== "pilot-min-10000" || approvedRowCount < MIN_PREPARED_FOOD_PILOT_ROWS) {
      throw new PreparedFoodCatalogImportError("CHECKPOINT_MISMATCH");
    }
    return;
  }
  const validRowCount = Number(checkpoint.valid_row_count);
  if (
    selectionMode !== "all-valid"
    || !Number.isInteger(validRowCount)
    || validRowCount !== approvedRowCount
    || validRowCount !== manifest.counts?.normalized_count
  ) {
    throw new PreparedFoodCatalogImportError("CHECKPOINT_MISMATCH");
  }
}

function nextId(prefix, counter) {
  return `${prefix}-${String(counter).padStart(6, "0")}`;
}

function buildImportSummary({
  run_id,
  idempotency_key,
  bundle,
  sourceIds,
  productIds,
  versionUpdates,
  writes_committed,
  replayed,
}) {
  return {
    source: "public-prepared-food-catalog-import",
    status: "applied",
    run_id,
    idempotency_key,
    source_payload_identity: bundle.source_payload_identity,
    content_hash: bundle.content_hash,
    source_item_count: bundle.approved_items.length,
    product_count: productIds.length,
    version_updates: versionUpdates,
    affected_source_ids: sourceIds,
    writes_committed,
    replayed,
    production_db_writes: 0,
    secret_leak_count: 0,
  };
}

function activePublicProductCount(state) {
  let count = 0;
  for (const product of state.products.values()) {
    if (product.visibility !== "public") continue;
    const version = state.versions.get(product.current_version_id);
    const source = version ? state.sources.get(version.source_id) : null;
    if (source?.is_active) count += 1;
  }
  return count;
}

export function createMemoryPreparedFoodCatalogImportStore() {
  let counters = { source: 0, item: 0, profile: 0, version: 0, product: 0, event: 0 };
  const state = {
    sources: new Map(),
    items: new Map(),
    profiles: new Map(),
    versions: new Map(),
    products: new Map(),
    productsByKey: new Map(),
    runsByIdempotency: new Map(),
    runsByContentHash: new Map(),
    runsByRunId: new Map(),
    disablesByIdempotency: new Map(),
  };

  return {
    findAppliedRun({ idempotency_key, content_hash }) {
      return state.runsByIdempotency.get(idempotency_key)
        ?? state.runsByContentHash.get(content_hash)
        ?? null;
    },
    registerAppliedRun(registry) {
      state.runsByIdempotency.set(registry.idempotency_key, structuredClone(registry));
      state.runsByContentHash.set(registry.content_hash, structuredClone(registry));
      state.runsByRunId.set(registry.run_id, structuredClone(registry));
    },
    registerDisableRun(registry) {
      state.disablesByIdempotency.set(registry.idempotency_key, structuredClone(registry));
      state.runsByRunId.set(registry.run_id, structuredClone(registry));
    },
    findDisableRun(idempotency_key) {
      return state.disablesByIdempotency.get(idempotency_key) ?? null;
    },
    findRun(run_identifier) {
      return state.runsByIdempotency.get(run_identifier)
        ?? state.runsByRunId.get(run_identifier)
        ?? state.disablesByIdempotency.get(run_identifier)
        ?? null;
    },
    applyBundle({ bundle, run_id, idempotency_key }) {
      let writes = 0;
      let versionUpdates = 0;
      let sourceRecord = null;
      const sourceIds = [];
      const productIds = [];

      const ensureSource = () => {
        if (sourceRecord !== null) return sourceRecord;
        for (const source of state.sources.values()) {
          if (
            source.provider === bundle.approved_manifest.provider
            && source.dataset === bundle.approved_manifest.dataset
            && source.is_active
          ) {
            source.is_active = false;
            source.freshness_status = "stale";
            source.review_status = "superseded";
            writes += 1;
          }
        }
        counters.source += 1;
        sourceRecord = {
          id: nextId("source", counters.source),
          provider: bundle.approved_manifest.provider,
          dataset: bundle.approved_manifest.dataset,
          source_version: bundle.approved_manifest.source_version,
          manifest_sha256: bundle.normalized_content_hash,
          is_active: true,
          freshness_status: "current",
          review_status: "approved",
          license: bundle.approved_manifest.license,
          source_url: bundle.public_attribution[0]?.source_url ?? bundle.approved_manifest.endpoint_or_file_url,
        };
        state.sources.set(sourceRecord.id, sourceRecord);
        sourceIds.push(sourceRecord.id);
        writes += 1;
        return sourceRecord;
      };

      for (const item of bundle.approved_items) {
        const source = ensureSource();
        const existingProductId = state.productsByKey.get(item.external_item_key);
        const existingProduct = existingProductId ? state.products.get(existingProductId) : null;

        counters.item += 1;
        const sourceItemId = nextId("source-item", counters.item);
        state.items.set(sourceItemId, {
          id: sourceItemId,
          source_id: source.id,
          external_item_key: item.external_item_key,
          content_hash: item.content_hash,
          stable_fingerprint: item.stable_fingerprint,
        });
        writes += 1;

        counters.profile += 1;
        const profileId = nextId("profile", counters.profile);
        state.profiles.set(profileId, {
          id: profileId,
          source_item_id: sourceItemId,
          basis_unit: item.basis.unit,
          basis_amount: item.basis.amount,
          values: structuredClone(item.values),
        });
        writes += 1;
        writes += Object.values(item.values).filter((value) => value.amount !== null).length;

        counters.version += 1;
        const versionId = nextId("version", counters.version);
        const version = {
          id: versionId,
          source_id: source.id,
          source_item_id: sourceItemId,
          profile_id: profileId,
          product_id: existingProduct?.id ?? nextId("product", counters.product + 1),
          content_hash: item.content_hash,
        };
        state.versions.set(versionId, version);
        writes += 1;

        if (existingProduct === null) {
          counters.product += 1;
          const productId = nextId("product", counters.product);
          const product = {
            id: productId,
            visibility: "public",
            external_product_key: item.external_item_key,
            current_version_id: versionId,
            version_ids: [versionId],
          };
          version.product_id = productId;
          state.products.set(productId, product);
          state.productsByKey.set(item.external_item_key, productId);
          productIds.push(productId);
          writes += 1;
        } else {
          existingProduct.current_version_id = versionId;
          existingProduct.version_ids.push(versionId);
          version.product_id = existingProduct.id;
          productIds.push(existingProduct.id);
          versionUpdates += 1;
          writes += 1;
        }

      }

      counters.event += 1;
      writes += 1;
      return {
        summary: buildImportSummary({
          run_id,
          idempotency_key,
          bundle,
          sourceIds,
          productIds,
          versionUpdates,
          writes_committed: writes,
          replayed: false,
        }),
        writes_committed: writes,
      };
    },
    disableRun({ run, disable_key }) {
      let writes = 0;
      for (const sourceId of run.affected_source_ids ?? []) {
        const source = state.sources.get(sourceId);
        if (!source || !source.is_active) continue;
        source.is_active = false;
        source.freshness_status = "stale";
        source.review_status = "superseded";
        writes += 1;
      }
      counters.event += 1;
      writes += 1;
      return {
        source: "public-prepared-food-catalog-import",
        status: "disabled",
        run_id: `disable-${disable_key}`,
        idempotency_key: disable_key,
        model_run_key: run.idempotency_key,
        writes_committed: writes,
        replayed: false,
        payload_deleted: 0,
        production_db_writes: 0,
        secret_leak_count: 0,
      };
    },
    snapshot() {
      return {
        active_public_product_count: activePublicProductCount(state),
        total_product_count: state.products.size,
        total_version_count: state.versions.size,
      };
    },
  };
}

export async function runPreparedFoodCatalogImport({
  bundle,
  mode,
  environment,
  store,
  actor_user_id,
  run_id,
  idempotency_key,
}) {
  if (mode === "apply" && environment !== "local") {
    throw new PreparedFoodCatalogImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  const validated = validatePreparedFoodCatalogImportBundle(bundle);
  if (mode !== "apply") {
    return {
      source: "public-prepared-food-catalog-import",
      status: "dry-run",
      run_id,
      idempotency_key,
      source_payload_identity: validated.source_payload_identity,
      content_hash: validated.content_hash,
      source_item_count: validated.approved_items.length,
      product_count: new Set(validated.approved_items.map((item) => item.external_item_key)).size,
      version_updates: 0,
      writes_committed: 0,
      replayed: false,
      production_db_writes: 0,
      secret_leak_count: 0,
    };
  }
  requiredText(actor_user_id, "ACTOR_REQUIRED");
  requiredText(run_id, "RUN_ID_REQUIRED");
  requiredText(idempotency_key, "IDEMPOTENCY_KEY_REQUIRED");
  assertPreparedFoodImportWriteBoundary(validated);

  const replay = store.findAppliedRun({
    idempotency_key,
    content_hash: validated.content_hash,
  });
  if (replay !== null) {
    return {
      ...structuredClone(replay),
      writes_committed: 0,
      replayed: true,
    };
  }

  const result = store.applyBundle({
    bundle: validated,
    run_id,
    idempotency_key,
  });
  const registry = {
    ...result.summary,
    actor_user_id,
  };
  store.registerAppliedRun(registry);
  return registry;
}

export async function disablePreparedFoodCatalogImport({
  store,
  model_run_key,
  disable_key,
  actor_user_id,
  reason,
  reviewed_at,
}) {
  requiredText(actor_user_id, "ACTOR_REQUIRED");
  requiredText(disable_key, "IDEMPOTENCY_KEY_REQUIRED");
  requiredText(model_run_key, "MODEL_RUN_KEY_REQUIRED");
  requiredText(reason, "DISABLE_REASON_REQUIRED");
  ensureIsoTimestamp(reviewed_at, "REVIEWED_AT_INVALID");

  const replay = store.findDisableRun(disable_key);
  if (replay !== null) {
    return {
      ...structuredClone(replay),
      writes_committed: 0,
      replayed: true,
    };
  }
  const run = store.findRun(model_run_key);
  if (run === null || run.status !== "applied") {
    throw new PreparedFoodCatalogImportError("INVALID_DISABLE_DECISION");
  }
  const registry = store.disableRun({ run, disable_key });
  store.registerDisableRun({
    ...registry,
    actor_user_id,
    reviewed_at,
  });
  return registry;
}

export function getPreparedFoodCatalogImportRun({ store, run_identifier }) {
  const run = store.findRun(run_identifier);
  return run === null ? null : structuredClone(run);
}

export function generatePreparedFoodCatalogPerfRows({ count, seed = "perf" }) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new PreparedFoodCatalogImportError("PERF_FIXTURE_COUNT_INVALID");
  }
  const upperSeed = String(seed).toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const shortSeed = upperSeed.slice(0, 12) || "PERF";
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(6, "0");
    return {
      itemMnftrRptNo: `${shortSeed}-${suffix}`,
      foodCd: `PERF-CODE-${suffix}`,
      foodNm: `성능 fixture 제품 ${suffix}`,
      makerNm: `성능 제조사 ${String(index % 100).padStart(2, "0")}`,
      saleCorpNm: index % 2 === 0 ? `성능 판매원 ${String(index % 50).padStart(2, "0")}` : "",
      nutConSrtrQua: index % 3 === 0 ? "100mL" : "100g",
      servSize: index % 3 === 0 ? "1회 제공량 200mL" : "1회 제공량 30g",
      foodSize: index % 3 === 0 ? "총 내용량 200mL" : "총 내용량 300g",
      enerc: String(50 + (index % 400)),
      chocdf: String((index % 70) + 1),
      prot: String((index % 30) + 1),
      fatce: String((index % 20) + 1),
      nat: String((index % 500) + 1),
    };
  });
}

function pageFromItems(items, pageSize) {
  const pages = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push({
      page_no: pages.length + 1,
      total_count: items.length,
      items: items.slice(index, index + pageSize),
    });
  }
  return pages;
}

function coerceLiveItems(body) {
  const rows = body?.response?.body?.items?.item ?? body?.response?.body?.items ?? [];
  return Array.isArray(rows) ? rows : [rows];
}

export async function fetchPreparedFoodCatalogLiveBatch({
  apiKey,
  fetchedAt,
  source,
  pageSize = 1000,
  maxPages = 10,
  fetchImpl,
  sleep,
  now,
  createTimeoutSignal,
}) {
  if (pageSize < 1 || pageSize > 1000) {
    throw new PreparedFoodCatalogImportError("PAGINATION_SCHEMA_INVALID");
  }
  const pages = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const body = await requestJsonWithRetry({
      endpoint: LIVE_ENDPOINT,
      query: { pageNo, numOfRows: pageSize, type: "json" },
      apiKey,
      fetchImpl,
      sleep,
      now,
      createTimeoutSignal,
    });
    const items = coerceLiveItems(body);
    const total = Number(body?.response?.body?.totalCount ?? items.length);
    pages.push({ page_no: pageNo, total_count: total, items });
    if (items.length === 0 || pageNo * pageSize >= total) break;
  }
  return buildPreparedFoodRawBatch({
    source,
    query: { acquisition_mode: "live", numOfRows: pageSize, maxPages },
    pages,
    fetchedAt,
  });
}

export function buildPreparedFoodLiveUrl(apiKey, query) {
  return buildPublicDataUrl(LIVE_ENDPOINT, apiKey, query);
}

export function parsePreparedFoodCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (current !== "" || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((values) =>
    Object.fromEntries(header.map((column, index) => [column.trim(), values[index] ?? ""])));
}

export function buildPreparedFoodSnapshotInput({ source, query, rows, pageSize = 1000 }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new PreparedFoodCatalogImportError("PAGINATION_SCHEMA_INVALID");
  }
  return {
    source,
    query,
    pages: pageFromItems(rows, pageSize),
  };
}
