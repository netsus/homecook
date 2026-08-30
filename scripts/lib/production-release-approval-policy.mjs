export const EXPECTED_RELEASE_CONTEXTS = [
  "build",
  "changes",
  "dependency-audit",
  "policy",
  "quality",
  "security-function-authorization",
  "security-smoke",
];

export const UNRESOLVED_RELEASE_TAG_INTEGRATION_ACTOR_ID = 0;
export const GITHUB_ACTIONS_APP_INTEGRATION_ID = 15368;
export const CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY = "netsus/homecook";
export const CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW =
  "netsus/homecook/.github/workflows/production-release-attestation.yml";
export const CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF = "refs/heads/master";

const PRODUCTION_RELEASE_TAG_PATTERN = /^prod-[0-9]{8}\.[0-9]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REPEATABILITY_SCHEMA = "homecook.local-mac-production-rehearsal-repeatability-receipt.v1";

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function validateProductionReleaseTag(value, label = "release tag") {
  const normalized = requireNonEmptyString(value, label);
  if (!PRODUCTION_RELEASE_TAG_PATTERN.test(normalized)) {
    throw new Error(`${label} must match prod-YYYYMMDD.N exactly.`);
  }
  return normalized;
}

export function buildProductionReleaseAnnotatedTagMessage({
  releaseTag,
  rehearsal_receipt_schema,
  build_id,
  sealed_bundle_digest,
  repeatability_receipt_digest,
  rehearsal_receipt_valid_until,
} = {}) {
  if (rehearsal_receipt_schema !== REPEATABILITY_SCHEMA) {
    throw new Error("annotated tag rehearsal receipt schema is invalid.");
  }
  const buildId = requireNonEmptyString(build_id, "annotated tag build_id");
  for (const [value, label] of [
    [sealed_bundle_digest, "sealed_bundle_digest"],
    [repeatability_receipt_digest, "repeatability_receipt_digest"],
  ]) {
    if (!SHA256_PATTERN.test(value ?? "")) throw new Error(`annotated tag ${label} is invalid.`);
  }
  const validUntil = requireNonEmptyString(
    rehearsal_receipt_valid_until,
    "annotated tag rehearsal_receipt_valid_until",
  );
  const validUntilMs = Date.parse(validUntil);
  if (!Number.isFinite(validUntilMs) || new Date(validUntilMs).toISOString() !== validUntil) {
    throw new Error("annotated tag rehearsal_receipt_valid_until must be exact UTC millisecond RFC3339.");
  }
  return [
    `Approved production release ${validateProductionReleaseTag(releaseTag, "releaseTag")}`,
    `build_id ${buildId}`,
    `rehearsal_receipt_schema ${REPEATABILITY_SCHEMA}`,
    `sealed_bundle_digest ${sealed_bundle_digest}`,
    `repeatability_receipt_digest ${repeatability_receipt_digest}`,
    `rehearsal_receipt_valid_until ${validUntil}`,
  ].join("\n");
}

export function normalizeExpectedReleaseContexts(
  contexts = EXPECTED_RELEASE_CONTEXTS,
  label = "expected_release_contexts",
) {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  const normalized = contexts.map((context, index) =>
    requireNonEmptyString(context, `${label}[${index}]`).toLowerCase());

  const duplicates = normalized.filter(
    (context, index) => normalized.indexOf(context) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} must not contain duplicates.`);
  }

  const expected = [...EXPECTED_RELEASE_CONTEXTS].sort();
  const actual = [...normalized].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must match the shared expected release context set exactly.`,
    );
  }

  return EXPECTED_RELEASE_CONTEXTS;
}
