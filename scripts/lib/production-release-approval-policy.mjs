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
