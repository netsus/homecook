import { createHash } from "node:crypto";

import {
  isValidIngredientCategory,
  normalizeIngredientCategoryLabel,
  type IngredientCategory,
} from "@/lib/ingredient-categories";

export type ExternalIngredientReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_source_check";

export type ExternalIngredientDuplicateKind =
  | "exact_normalized_name"
  | "folded_name"
  | "known_synonym";

export interface ExternalIngredientSourceRow {
  row_index: number;
  source_system: string;
  source_file: string;
  source_version: string | null;
  source_date: string | null;
  source_license: string | null;
  source_row_id: string | null;
  original_name: string;
  legacy_category: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ExternalIngredientParseResult {
  rows: ExternalIngredientSourceRow[];
  file_errors: string[];
}

export interface ExternalIngredientInvalidRow {
  row_index: number;
  source_row_id: string | null;
  code: "missing_source_metadata";
  message: string;
}

export interface ExternalIngredientCategoryCandidate {
  label: IngredientCategory;
  confidence: "high" | "low";
  reason_code: "source_legacy_category_match" | "unknown_legacy_category_candidate";
}

export interface ExternalIngredientDuplicateCandidate {
  kind: ExternalIngredientDuplicateKind;
  matched_source_fingerprint: string | null;
  matched_name: string;
}

export interface ExternalIngredientCandidate {
  row_index: number;
  source_fingerprint: string;
  source_system: string;
  source_file: string;
  source_version: string | null;
  source_date: string | null;
  source_license: string | null;
  source_row_id: string | null;
  original_name: string;
  normalized_name: string;
  folded_name: string;
  raw_payload: Record<string, unknown>;
  review_status: ExternalIngredientReviewStatus;
  category_candidate: ExternalIngredientCategoryCandidate;
  duplicate_candidates: ExternalIngredientDuplicateCandidate[];
  reason_codes: string[];
}

export interface ExternalIngredientKnownSynonym {
  synonym: string;
  canonical_name: string;
}

export interface ExternalIngredientReviewDecision {
  source_fingerprint: string;
  status: ExternalIngredientReviewStatus;
}

export interface ExternalIngredientCandidateReport {
  batch_id: string;
  generated_at: string;
  blocked: boolean;
  invalid_rows: ExternalIngredientInvalidRow[];
  candidates: ExternalIngredientCandidate[];
  summary: {
    total_rows: number;
    candidate_count: number;
    approved_count: number;
    rejected_count: number;
    pending_review_count: number;
    needs_source_check_count: number;
    duplicate_count: number;
    low_confidence_category_count: number;
  };
}

export interface ExternalIngredientSeedRow {
  seed_idempotency_key: string;
  standard_name: string;
  legacy_category: IngredientCategory;
  source_fingerprint: string;
  source_system: string;
  source_file: string;
  source_row_id: string | null;
}

export interface ExternalIngredientSeedPromotionArtifact {
  artifact_id: string;
  generated_at: string;
  source_report_batch_id: string;
  seed_rows: ExternalIngredientSeedRow[];
  skipped_rows: Array<{
    source_fingerprint: string;
    normalized_name: string;
    review_status: ExternalIngredientReviewStatus;
    reason_codes: string[];
  }>;
}

const CONFIRMED_SOURCE_LICENSE_TOKENS = new Set([
  "approved",
  "approved-source",
  "cc-by",
  "cc0",
  "open-data",
  "public-domain",
  "public-open-data",
  "kogl-type-1",
]);

function stringOrNull(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function stringOrEmpty(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeExternalIngredientName(value: unknown) {
  return stringOrEmpty(value)
    .normalize("NFKC")
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/[·ㆍ_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—]+|[-–—]+$/g, "");
}

function foldExternalIngredientName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function parseExternalIngredientSourceRows(input: unknown): ExternalIngredientParseResult {
  if (!Array.isArray(input)) {
    return {
      rows: [],
      file_errors: ["External ingredient source input must be an array of rows."],
    };
  }

  const fileErrors: string[] = [];
  const rows = input.flatMap((rawRow, rowIndex): ExternalIngredientSourceRow[] => {
    if (!isRecord(rawRow)) {
      fileErrors.push(`Row ${rowIndex} must be an object.`);

      return [];
    }

    const rawPayload = isRecord(rawRow.raw_payload) ? rawRow.raw_payload : rawRow;

    return [
      {
        row_index: rowIndex,
        source_system: stringOrEmpty(rawRow.source_system).trim(),
        source_file: stringOrEmpty(rawRow.source_file).trim(),
        source_version: stringOrNull(rawRow.source_version),
        source_date: stringOrNull(rawRow.source_date),
        source_license: stringOrNull(rawRow.source_license),
        source_row_id: stringOrNull(rawRow.source_row_id),
        original_name: stringOrEmpty(rawRow.original_name),
        legacy_category: stringOrNull(rawRow.legacy_category),
        raw_payload: rawPayload,
      },
    ];
  });

  return {
    rows,
    file_errors: fileErrors,
  };
}

function buildSourceFingerprint(row: ExternalIngredientSourceRow) {
  return sha256(
    stableStringify({
      source_system: row.source_system,
      source_file: row.source_file,
      source_version: row.source_version,
      source_date: row.source_date,
      source_row_id: row.source_row_id,
      original_name: row.original_name,
      raw_payload: row.raw_payload,
    }),
  );
}

function getCategoryCandidate(legacyCategory: string | null): ExternalIngredientCategoryCandidate {
  if (isValidIngredientCategory(legacyCategory)) {
    return {
      label: normalizeIngredientCategoryLabel(legacyCategory),
      confidence: "high",
      reason_code: "source_legacy_category_match",
    };
  }

  return {
    label: "기타",
    confidence: "low",
    reason_code: "unknown_legacy_category_candidate",
  };
}

function hasConfirmedSourceLicense(sourceLicense: string | null) {
  return (
    sourceLicense !== null &&
    CONFIRMED_SOURCE_LICENSE_TOKENS.has(sourceLicense.toLocaleLowerCase("ko-KR"))
  );
}

function chooseReviewStatus(
  candidate: Pick<
    ExternalIngredientCandidate,
    "normalized_name" | "source_license" | "source_fingerprint"
  >,
  reviewDecisions: Map<string, ExternalIngredientReviewStatus>,
) {
  if (!candidate.normalized_name) return "rejected" satisfies ExternalIngredientReviewStatus;
  if (!hasConfirmedSourceLicense(candidate.source_license)) {
    return "needs_source_check" satisfies ExternalIngredientReviewStatus;
  }

  return reviewDecisions.get(candidate.source_fingerprint) ?? "pending_review";
}

function applyDuplicateCandidates(
  candidates: ExternalIngredientCandidate[],
  knownSynonyms: readonly ExternalIngredientKnownSynonym[],
) {
  const byNormalizedName = new Map<string, ExternalIngredientCandidate[]>();
  const byFoldedName = new Map<string, ExternalIngredientCandidate[]>();

  for (const candidate of candidates) {
    if (!candidate.normalized_name) continue;

    byNormalizedName.set(candidate.normalized_name, [
      ...(byNormalizedName.get(candidate.normalized_name) ?? []),
      candidate,
    ]);
    byFoldedName.set(candidate.folded_name, [...(byFoldedName.get(candidate.folded_name) ?? []), candidate]);
  }

  for (const sameNameCandidates of byNormalizedName.values()) {
    if (sameNameCandidates.length < 2) continue;

    for (const candidate of sameNameCandidates) {
      const firstOtherCandidate = sameNameCandidates.find(
        (otherCandidate) => otherCandidate.source_fingerprint !== candidate.source_fingerprint,
      );

      if (!firstOtherCandidate) continue;

      candidate.duplicate_candidates.push({
        kind: "exact_normalized_name",
        matched_source_fingerprint: firstOtherCandidate.source_fingerprint,
        matched_name: firstOtherCandidate.normalized_name,
      });
    }
  }

  for (const sameFoldCandidates of byFoldedName.values()) {
    if (sameFoldCandidates.length < 2) continue;

    for (const candidate of sameFoldCandidates) {
      const firstOtherCandidate = sameFoldCandidates.find(
        (otherCandidate) =>
          otherCandidate.source_fingerprint !== candidate.source_fingerprint &&
          otherCandidate.normalized_name !== candidate.normalized_name,
      );

      if (!firstOtherCandidate) continue;

      candidate.duplicate_candidates.push({
        kind: "folded_name",
        matched_source_fingerprint: firstOtherCandidate.source_fingerprint,
        matched_name: firstOtherCandidate.normalized_name,
      });
    }
  }

  const synonymByFoldedName = new Map(
    knownSynonyms.map((synonym) => [
      foldExternalIngredientName(normalizeExternalIngredientName(synonym.synonym)),
      normalizeExternalIngredientName(synonym.canonical_name),
    ]),
  );

  for (const candidate of candidates) {
    const canonicalName = synonymByFoldedName.get(candidate.folded_name);

    if (!canonicalName) continue;

    candidate.duplicate_candidates.push({
      kind: "known_synonym",
      matched_source_fingerprint: null,
      matched_name: canonicalName,
    });
  }
}

function getReasonCodes(candidate: ExternalIngredientCandidate) {
  const reasonCodes: string[] = [];

  if (!candidate.normalized_name) {
    reasonCodes.push("empty_original_name");
  }

  if (!hasConfirmedSourceLicense(candidate.source_license)) {
    reasonCodes.push("source_license_unconfirmed");
  }

  if (candidate.category_candidate.confidence === "low") {
    reasonCodes.push(candidate.category_candidate.reason_code);
  }

  if (candidate.duplicate_candidates.length > 0) {
    reasonCodes.push(...candidate.duplicate_candidates.map((duplicate) => duplicate.kind));
  }

  return reasonCodes;
}

export function buildExternalIngredientCandidateReport(
  rows: readonly ExternalIngredientSourceRow[],
  {
    generatedAt = new Date().toISOString(),
    knownSynonyms = [],
    reviewDecisions = [],
  }: {
    generatedAt?: string;
    knownSynonyms?: readonly ExternalIngredientKnownSynonym[];
    reviewDecisions?: readonly ExternalIngredientReviewDecision[];
  } = {},
): ExternalIngredientCandidateReport {
  const invalidRows: ExternalIngredientInvalidRow[] = [];
  const reviewDecisionByFingerprint = new Map(
    reviewDecisions.map((decision) => [decision.source_fingerprint, decision.status]),
  );
  const candidates = rows.flatMap((row): ExternalIngredientCandidate[] => {
    if (!row.source_system || !row.source_file) {
      invalidRows.push({
        row_index: row.row_index,
        source_row_id: row.source_row_id,
        code: "missing_source_metadata",
        message: "source_system and source_file are required before candidate generation.",
      });

      return [];
    }

    const normalizedName = normalizeExternalIngredientName(row.original_name);
    const sourceFingerprint = buildSourceFingerprint(row);
    const categoryCandidate = getCategoryCandidate(row.legacy_category);
    const candidate: ExternalIngredientCandidate = {
      row_index: row.row_index,
      source_fingerprint: sourceFingerprint,
      source_system: row.source_system,
      source_file: row.source_file,
      source_version: row.source_version,
      source_date: row.source_date,
      source_license: row.source_license,
      source_row_id: row.source_row_id,
      original_name: row.original_name,
      normalized_name: normalizedName,
      folded_name: foldExternalIngredientName(normalizedName),
      raw_payload: row.raw_payload,
      review_status: "pending_review",
      category_candidate: categoryCandidate,
      duplicate_candidates: [],
      reason_codes: [],
    };

    candidate.review_status = chooseReviewStatus(candidate, reviewDecisionByFingerprint);

    return [candidate];
  });

  applyDuplicateCandidates(candidates, knownSynonyms);

  for (const candidate of candidates) {
    candidate.reason_codes = getReasonCodes(candidate);
  }

  const batchId = sha256(candidates.map((candidate) => candidate.source_fingerprint).sort().join(":"));

  return {
    batch_id: batchId,
    generated_at: generatedAt,
    blocked: invalidRows.length > 0,
    invalid_rows: invalidRows,
    candidates,
    summary: {
      total_rows: rows.length,
      candidate_count: candidates.length,
      approved_count: candidates.filter((candidate) => candidate.review_status === "approved").length,
      rejected_count: candidates.filter((candidate) => candidate.review_status === "rejected").length,
      pending_review_count: candidates.filter((candidate) => candidate.review_status === "pending_review")
        .length,
      needs_source_check_count: candidates.filter(
        (candidate) => candidate.review_status === "needs_source_check",
      ).length,
      duplicate_count: candidates.filter((candidate) => candidate.duplicate_candidates.length > 0).length,
      low_confidence_category_count: candidates.filter(
        (candidate) => candidate.category_candidate.confidence === "low",
      ).length,
    },
  };
}

export function buildApprovedIngredientSeedPromotionArtifact(
  report: ExternalIngredientCandidateReport,
  {
    artifactId,
    generatedAt = new Date().toISOString(),
  }: {
    artifactId: string;
    generatedAt?: string;
  },
): ExternalIngredientSeedPromotionArtifact {
  if (report.blocked) {
    return {
      artifact_id: artifactId,
      generated_at: generatedAt,
      source_report_batch_id: report.batch_id,
      seed_rows: [],
      skipped_rows: report.candidates.map((candidate) => ({
        source_fingerprint: candidate.source_fingerprint,
        normalized_name: candidate.normalized_name,
        review_status: candidate.review_status,
        reason_codes: ["blocked_report"],
      })),
    };
  }

  const approvedCandidates = report.candidates.filter(
    (candidate) => candidate.review_status === "approved",
  );

  return {
    artifact_id: artifactId,
    generated_at: generatedAt,
    source_report_batch_id: report.batch_id,
    seed_rows: approvedCandidates.map((candidate) => ({
      seed_idempotency_key: `external:${candidate.source_fingerprint}`,
      standard_name: candidate.normalized_name,
      legacy_category: candidate.category_candidate.label,
      source_fingerprint: candidate.source_fingerprint,
      source_system: candidate.source_system,
      source_file: candidate.source_file,
      source_row_id: candidate.source_row_id,
    })),
    skipped_rows: report.candidates
      .filter((candidate) => candidate.review_status !== "approved")
      .map((candidate) => ({
        source_fingerprint: candidate.source_fingerprint,
        normalized_name: candidate.normalized_name,
        review_status: candidate.review_status,
        reason_codes: candidate.reason_codes,
      })),
  };
}
