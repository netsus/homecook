export const PRODUCT_BRANCH_RECOVERY_SUFFIX = "-superseding-draft";

const PRODUCT_BRANCH_PATTERN = /^feature\/(be|fe)-(.+)$/;
const CANONICAL_SLICE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RESERVED_RECOVERY_TOKEN = "superseding";

function emptyContext() {
  return {
    kind: null,
    slice: null,
    recovery: null,
  };
}

function failInvalidProductBranch(branchName, detail) {
  throw new Error(`Invalid product branch '${branchName}': ${detail}`);
}

export function parseProductBranchContext(branchName) {
  if (typeof branchName !== "string" || branchName.trim().length === 0) {
    return emptyContext();
  }

  const normalizedBranch = branchName.trim();
  const match = PRODUCT_BRANCH_PATTERN.exec(normalizedBranch);
  if (!match) {
    return emptyContext();
  }

  const role = match[1];
  const branchSlice = match[2];
  const hasReservedSuffix = branchSlice.endsWith(PRODUCT_BRANCH_RECOVERY_SUFFIX);

  if (
    branchSlice.includes(RESERVED_RECOVERY_TOKEN)
    && !hasReservedSuffix
  ) {
    failInvalidProductBranch(
      normalizedBranch,
      `the reserved product recovery suffix must be exactly '${PRODUCT_BRANCH_RECOVERY_SUFFIX}'`,
    );
  }

  const canonicalSlice = hasReservedSuffix
    ? branchSlice.slice(0, -PRODUCT_BRANCH_RECOVERY_SUFFIX.length)
    : branchSlice;

  if (
    !CANONICAL_SLICE_PATTERN.test(canonicalSlice)
    || canonicalSlice.includes(RESERVED_RECOVERY_TOKEN)
  ) {
    failInvalidProductBranch(
      normalizedBranch,
      "the canonical slice must be a lowercase hyphenated slug and cannot use the reserved recovery token",
    );
  }

  return {
    kind: `feature-${role}`,
    slice: canonicalSlice,
    recovery: hasReservedSuffix
      ? {
          kind: "superseding-draft",
          suffix: PRODUCT_BRANCH_RECOVERY_SUFFIX,
        }
      : null,
  };
}
