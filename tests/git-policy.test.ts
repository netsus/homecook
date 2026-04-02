import { describe, expect, it } from "vitest";

import {
  findEmptyPrSections,
  findInvalidWorkflowV2Refs,
  findMissingPrSections,
  isAllowedBranchName,
  isAllowedWorkBranchName,
  isProtectedBranchName,
  isValidCommitMessage,
} from "../scripts/lib/git-policy.mjs";

describe("git policy", () => {
  it("accepts allowed branch names", () => {
    expect(isAllowedBranchName("feature/login-gate-modal")).toBe(true);
    expect(isAllowedBranchName("hotfix/auth-callback")).toBe(true);
    expect(isAllowedBranchName("master")).toBe(true);
  });

  it("accepts only work branches for direct implementation branches", () => {
    expect(isAllowedWorkBranchName("feature/login-gate-modal")).toBe(true);
    expect(isAllowedWorkBranchName("docs/git-policy-guardrail")).toBe(true);
    expect(isAllowedWorkBranchName("master")).toBe(false);
  });

  it("marks main/master/develop as protected base branches", () => {
    expect(isProtectedBranchName("master")).toBe(true);
    expect(isProtectedBranchName("main")).toBe(true);
    expect(isProtectedBranchName("develop")).toBe(true);
    expect(isProtectedBranchName("fix/auth-callback")).toBe(false);
  });

  it("rejects invalid branch names", () => {
    expect(isAllowedBranchName("feature/login_gate")).toBe(false);
    expect(isAllowedBranchName("bugfix/auth")).toBe(false);
  });

  it("accepts conventional commit messages", () => {
    expect(isValidCommitMessage("feat: add login modal")).toBe(true);
    expect(isValidCommitMessage("fix(auth): guard callback state")).toBe(true);
  });

  it("rejects non-conventional commit messages", () => {
    expect(isValidCommitMessage("update login flow")).toBe(false);
    expect(isValidCommitMessage("feat add login flow")).toBe(false);
  });

  it("accepts merge commit messages", () => {
    expect(
      isValidCommitMessage(
        "Merge cd887bb into dff7451bb4de10fc18845c48b138f992257ba3e8",
      ),
    ).toBe(true);
    expect(
      isValidCommitMessage("Merge branch 'master' into feature/login"),
    ).toBe(true);
  });

  it("reports missing PR template sections", () => {
    const missing = findMissingPrSections("## Summary\n\n## Test Plan");

    expect(missing).toContain("## Workpack / Slice");
    expect(missing).toContain("## QA Evidence");
    expect(missing).toContain("## Security Review");
    expect(missing).not.toContain("## Summary");
  });

  it("accepts N/A workflow v2 work item refs in PR body", () => {
    const body = "## Workpack / Slice\n- workflow v2 work item: `N/A`";
    expect(findInvalidWorkflowV2Refs(body)).toEqual([]);
  });

  it("accepts valid workflow v2 work item paths in PR body", () => {
    const body = "## Workpack / Slice\n- workflow v2 work item: `.workflow-v2/work-items/workflow-v2-foundation.json`";
    expect(findInvalidWorkflowV2Refs(body)).toEqual([]);
  });

  it("rejects invalid workflow v2 work item refs in PR body", () => {
    const body = "## Workpack / Slice\n- workflow v2 work item: docs/workflow-v2-foundation.md";
    expect(findInvalidWorkflowV2Refs(body)).toEqual(["docs/workflow-v2-foundation.md"]);
  });
});

describe("findEmptyPrSections", () => {
  function buildBody(sections: Record<string, string>): string {
    return [
      "## Summary",
      sections["## Summary"] ?? "- 실제 변경 내용",
      "## Workpack / Slice",
      sections["## Workpack / Slice"] ?? "- 관련 workpack: docs/workpacks/02-discovery-filter/",
      "## Test Plan",
      sections["## Test Plan"] ?? "- [x] `pnpm lint`",
      "## QA Evidence",
      sections["## QA Evidence"] ?? "- deterministic gates: `pnpm verify:frontend`",
      "## Docs Impact",
      sections["## Docs Impact"] ?? "- [x] 공식 문서 영향 없음",
      "## Security Review",
      sections["## Security Review"] ?? "- 인증/인가 영향: 없음",
      "## Performance",
      sections["## Performance"] ?? "- UI 또는 fetch 변경 여부: 없음",
      "## Design / Accessibility",
      sections["## Design / Accessibility"] ?? "- 디자인 시스템 영향: 없음",
      "## Breaking Changes",
      sections["## Breaking Changes"] ?? "- [x] 없음",
    ].join("\n");
  }

  it("detects empty Summary (bare bullet)", () => {
    const body = buildBody({ "## Summary": "- " });
    expect(findEmptyPrSections(body)).toContain("## Summary");
  });

  it("detects label-only Workpack section", () => {
    const body = buildBody({
      "## Workpack / Slice": "- 관련 workpack:\n- 변경 범위:",
    });
    expect(findEmptyPrSections(body)).toContain("## Workpack / Slice");
  });

  it("detects section with only unchecked checkboxes", () => {
    const body = buildBody({
      "## Test Plan":
        "- [ ] `pnpm lint`\n- [ ] `pnpm typecheck`\n- [ ] `pnpm test`\n- [ ] `pnpm test:e2e`\n- 추가 검증:",
    });
    expect(findEmptyPrSections(body)).toContain("## Test Plan");
  });

  it("detects Breaking Changes section with all unchecked + label", () => {
    const body = buildBody({
      "## Breaking Changes": "- [ ] 없음\n- [ ] 있음\n- 설명:",
    });
    expect(findEmptyPrSections(body)).toContain("## Breaking Changes");
  });

  it("passes section with at least one checked checkbox", () => {
    const body = buildBody({
      "## Test Plan": "- [x] `pnpm lint`\n- [ ] `pnpm typecheck`",
    });
    expect(findEmptyPrSections(body)).not.toContain("## Test Plan");
  });

  it("passes label with actual value", () => {
    const body = buildBody({
      "## Workpack / Slice": "- 관련 workpack: docs/workpacks/02-discovery-filter/",
    });
    expect(findEmptyPrSections(body)).not.toContain("## Workpack / Slice");
  });

  it("passes plain text content", () => {
    const body = buildBody({ "## Summary": "- 로그인 게이트 추가" });
    expect(findEmptyPrSections(body)).not.toContain("## Summary");
  });

  it("passes fully filled template (no empty sections)", () => {
    const body = buildBody({});
    expect(findEmptyPrSections(body)).toHaveLength(0);
  });

  it("returns empty array for a completely filled PR", () => {
    const body = buildBody({
      "## Summary": "- OAuth 콜백 처리 추가",
      "## Test Plan": "- [x] `pnpm lint`\n- [x] `pnpm test`",
      "## Breaking Changes": "- [x] 없음",
    });
    expect(findEmptyPrSections(body)).toHaveLength(0);
  });
});
