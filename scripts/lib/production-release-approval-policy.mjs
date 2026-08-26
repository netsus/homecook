export const EXPECTED_RELEASE_CONTEXTS = [
  "build",
  "changes",
  "policy",
  "quality",
  "security-function-authorization",
  "security-smoke",
  "template-check",
];

export const UNRESOLVED_RELEASE_TAG_INTEGRATION_ACTOR_ID = 0;

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
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
