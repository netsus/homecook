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

const MERGE_COMMIT_PATTERN = /^Merge\s/;

export function isValidCommitMessage(message) {
  const trimmed = message.trim();
  if (MERGE_COMMIT_PATTERN.test(trimmed)) return true;
  return COMMIT_MESSAGE_PATTERN.test(trimmed);
}

export function findMissingPrSections(body) {
  return REQUIRED_PR_SECTIONS.filter((section) => !body.includes(section));
}

const EMPTY_LINE_PATTERNS = [
  /^-?\s*$/, // empty or just "-"
  /^-\s+(?!\[).+:\s*$/, // "- 라벨:" placeholder ending with colon (not a checkbox)
  /^-\s+\[\s\]\s/, // unchecked checkbox "- [ ] something"
];

function isEffectivelyEmpty(line) {
  return EMPTY_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

export function findEmptyPrSections(body) {
  return REQUIRED_PR_SECTIONS.filter((section) => {
    const start = body.indexOf(section);
    if (start === -1) return false;
    const afterHeader = body.slice(start + section.length);
    const nextSectionStart =
      REQUIRED_PR_SECTIONS.map((s) => afterHeader.indexOf(s))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0] ?? afterHeader.length;
    const sectionContent = afterHeader.slice(0, nextSectionStart);
    return !sectionContent
      .split("\n")
      .map((l) => l.trim())
      .some((l) => !isEffectivelyEmpty(l));
  });
}
