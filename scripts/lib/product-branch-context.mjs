import { isValidBranchSlug } from "./git-policy.mjs";

export const PRODUCT_BRANCH_RECOVERY_SUFFIX = "-superseding-draft";

const PRODUCT_BRANCH_PATTERN = /^feature\/(be|fe)-(.*)$/;

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

  if (!hasReservedSuffix && branchSlice.includes(`${PRODUCT_BRANCH_RECOVERY_SUFFIX}-`)) {
    failInvalidProductBranch(
      normalizedBranch,
      `the product recovery suffix must be exactly one trailing '${PRODUCT_BRANCH_RECOVERY_SUFFIX}'`,
    );
  }

  const canonicalSlice = hasReservedSuffix
    ? branchSlice.slice(0, -PRODUCT_BRANCH_RECOVERY_SUFFIX.length)
    : branchSlice;

  if (hasReservedSuffix && canonicalSlice.includes(PRODUCT_BRANCH_RECOVERY_SUFFIX)) {
    failInvalidProductBranch(
      normalizedBranch,
      `the product recovery suffix cannot be nested or repeated`,
    );
  }

  if (!isValidBranchSlug(canonicalSlice)) {
    failInvalidProductBranch(
      normalizedBranch,
      "the canonical slice must use the public lowercase hyphenated branch slug grammar",
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
