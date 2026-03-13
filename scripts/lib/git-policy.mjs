export const ALLOWED_BRANCH_PATTERNS = [
  /^(feature|fix|chore|docs|refactor|test|release|hotfix)\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^(main|master|develop)$/,
];

export const COMMIT_MESSAGE_PATTERN =
  /^(feat|fix|docs|style|refactor|test|chore|perf|build|ci|revert)(\([a-z0-9-]+\))?!?: .+/;

export const REQUIRED_PR_SECTIONS = [
  "## Summary",
  "## Workpack / Slice",
  "## Test Plan",
  "## Docs Impact",
  "## Security Review",
  "## Performance",
  "## Design / Accessibility",
  "## Breaking Changes",
];

export function isAllowedBranchName(branchName) {
  return ALLOWED_BRANCH_PATTERNS.some((pattern) => pattern.test(branchName));
}

export function isValidCommitMessage(message) {
  return COMMIT_MESSAGE_PATTERN.test(message.trim());
}

export function findMissingPrSections(body) {
  return REQUIRED_PR_SECTIONS.filter((section) => !body.includes(section));
}
