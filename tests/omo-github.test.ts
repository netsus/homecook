import { chmodSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createGithubAutomationClient } from "../scripts/lib/omo-github.mjs";

function createFakeGhBin(rootDir: string) {
  const binPath = join(rootDir, "fake-gh.sh");
  const argsPath = join(rootDir, "fake-gh.args.log");

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" >> \"$FAKE_GH_ARGS_PATH\"",
      "case \"$1 $2\" in",
      "  'auth status')",
      "    exit 0",
      "    ;;",
      "  'pr create')",
      "    printf '%s\\n' 'https://github.com/netsus/homecook/pull/41'",
      "    ;;",
      "  'pr checks')",
      "    printf '%s\\n' '[{\"name\":\"quality\",\"bucket\":\"pass\",\"state\":\"SUCCESS\"}]'",
      "    ;;",
      "  'pr merge')",
      "    printf '%s\\n' '{\"merged\":true}'",
      "    ;;",
      "  'pr view')",
      "    printf '%s\\n' '{\"state\":\"MERGED\",\"mergedAt\":\"2026-03-27T11:54:00Z\",\"mergeStateStatus\":\"UNKNOWN\"}'",
      "    ;;",
      "  *)",
      "    printf '%s\\n' '{\"ok\":true}'",
      "    ;;",
      "esac",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);

  return {
    binPath,
    argsPath,
  };
}

describe("OMO GitHub automation client", () => {
  it("uses gh CLI for create, checks, ready, review, comment, merge, and update-branch flows", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-"));
    const { binPath, argsPath } = createFakeGhBin(rootDir);
    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
      environment: {
        FAKE_GH_ARGS_PATH: argsPath,
      },
    });

    client.assertAuth();
    const created = client.createPullRequest({
      base: "master",
      head: "feature/be-03-recipe-like",
      title: "feat: backend slice",
      body: "## Summary\n- backend",
      draft: true,
    });
    const checks = client.getRequiredChecks({
      prRef: created.url,
    });
    client.editPullRequest({
      prRef: created.url,
      title: "feat: backend slice",
      body: "## Summary\n- backend",
      workItemId: "05-planner-week-core",
    });
    client.markReady({
      prRef: created.url,
    });
    client.reviewPullRequest({
      prRef: created.url,
      decision: "approve",
      body: "Looks good",
    });
    client.commentPullRequest({
      prRef: created.url,
      body: "Design review complete",
    });
    client.mergePullRequest({
      prRef: created.url,
      headSha: "abc123",
    });
    client.updateBranch({
      prRef: created.url,
    });

    const argsLog = readFileSync(argsPath, "utf8");

    expect(created).toMatchObject({
      url: "https://github.com/netsus/homecook/pull/41",
      number: 41,
      draft: true,
    });
    expect(checks.bucket).toBe("pass");
    expect(argsLog).toContain("pr");
    expect(argsLog).toContain("create");
    expect(argsLog).toContain("--draft");
    expect(argsLog).toContain("## Workpack / Slice");
    expect(argsLog).toContain("## Test Plan");
    expect(argsLog).toContain("## Security Review");
    expect(argsLog).toContain("edit");
    expect(argsLog).toContain("checks");
    expect(argsLog).toContain("--required");
    expect(argsLog).toContain("ready");
    expect(argsLog).toContain("review");
    expect(argsLog).toContain("--approve");
    expect(argsLog).toContain("comment");
    expect(argsLog).toContain("merge");
    expect(argsLog).toContain("--match-head-commit");
    expect(argsLog).toContain("update-branch");
  });

  it("treats 'no required checks reported' as pending instead of throwing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-no-checks-"));
    const binPath = join(rootDir, "fake-gh-no-checks.sh");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "case \"$1 $2\" in",
        "  'pr checks')",
        "    shift 2",
        "    if printf '%s\\n' \"$@\" | grep -q -- '--required'; then",
        "      printf '%s\\n' \"no required checks reported on the 'docs/04-recipe-save' branch\" >&2",
        "      exit 1",
        "    fi",
        "    printf '%s\\n' '[]'",
        "    exit 0",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
    });

    const checks = client.getRequiredChecks({
      prRef: "https://github.com/netsus/homecook/pull/47",
    });

    expect(checks).toEqual({
      bucket: "pending",
      checks: [],
    });
  });

  it("falls back to all checks when GitHub reports no required checks for the branch", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-fallback-checks-"));
    const binPath = join(rootDir, "fake-gh-fallback-checks.sh");
    const argsPath = join(rootDir, "fake-gh-fallback-checks.args.log");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" >> \"$FAKE_GH_ARGS_PATH\"",
        "if [ \"$1 $2\" = 'pr checks' ]; then",
        "  shift 2",
        "  if printf '%s\\n' \"$@\" | grep -q -- '--required'; then",
        "    printf '%s\\n' \"no required checks reported on the 'docs/04-recipe-save' branch\" >&2",
        "    exit 1",
        "  fi",
        "  printf '%s\\n' '[{\"name\":\"quality\",\"bucket\":\"pass\",\"state\":\"SUCCESS\"},{\"name\":\"policy\",\"bucket\":\"pass\",\"state\":\"SUCCESS\"}]'",
        "  exit 0",
        "fi",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
      environment: {
        FAKE_GH_ARGS_PATH: argsPath,
      },
    });

    const checks = client.getRequiredChecks({
      prRef: "https://github.com/netsus/homecook/pull/47",
    });
    const argsLog = readFileSync(argsPath, "utf8");

    expect(checks.bucket).toBe("pass");
    expect(checks.checks).toHaveLength(2);
    expect(argsLog).toContain("--required");
    expect(argsLog).toContain("--json");
  });

  it("prefers the latest status rollup entry when stale failed required checks share the same name", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-stale-fail-pending-"));
    const binPath = join(rootDir, "fake-gh-stale-fail-pending.sh");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "if [ \"$1 $2\" = 'pr checks' ]; then",
        "  printf '%s\\n' '[",
        "    {\"name\":\"template-check\",\"workflow\":\"PR Governance\",\"bucket\":\"fail\",\"state\":\"FAILURE\",\"link\":\"https://example.com/old-template\"},",
        "    {\"name\":\"template-check\",\"workflow\":\"PR Governance\",\"bucket\":\"pending\",\"state\":\"PENDING\",\"link\":\"https://example.com/new-template\"},",
        "    {\"name\":\"quality\",\"workflow\":\"CI\",\"bucket\":\"pending\",\"state\":\"PENDING\",\"link\":\"https://example.com/new-quality\"}",
        "  ]'",
        "  exit 8",
        "fi",
        "if [ \"$1 $2\" = 'pr view' ]; then",
        "  printf '%s\\n' '{\"statusCheckRollup\":[",
        "    {\"__typename\":\"CheckRun\",\"name\":\"template-check\",\"workflowName\":\"PR Governance\",\"status\":\"COMPLETED\",\"conclusion\":\"FAILURE\",\"detailsUrl\":\"https://example.com/old-template\",\"startedAt\":\"2026-03-31T16:50:00Z\",\"completedAt\":\"2026-03-31T16:50:05Z\"},",
        "    {\"__typename\":\"CheckRun\",\"name\":\"template-check\",\"workflowName\":\"PR Governance\",\"status\":\"IN_PROGRESS\",\"conclusion\":\"\",\"detailsUrl\":\"https://example.com/new-template\",\"startedAt\":\"2026-03-31T17:10:00Z\",\"completedAt\":\"0001-01-01T00:00:00Z\"},",
        "    {\"__typename\":\"CheckRun\",\"name\":\"quality\",\"workflowName\":\"CI\",\"status\":\"IN_PROGRESS\",\"conclusion\":\"\",\"detailsUrl\":\"https://example.com/new-quality\",\"startedAt\":\"2026-03-31T17:10:01Z\",\"completedAt\":\"0001-01-01T00:00:00Z\"}",
        "  ]}'",
        "  exit 0",
        "fi",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
    });

    const checks = client.getRequiredChecks({
      prRef: "https://github.com/netsus/homecook/pull/61",
    });

    expect(checks.bucket).toBe("pending");
    expect(checks.checks).toEqual([
      {
        name: "template-check",
        workflow: "PR Governance",
        link: "https://example.com/new-template",
        bucket: "pending",
        state: "IN_PROGRESS",
      },
      {
        name: "quality",
        workflow: "CI",
        link: "https://example.com/new-quality",
        bucket: "pending",
        state: "IN_PROGRESS",
      },
    ]);
  });

  it("prefers the latest passing status rollup entry over an older failed run with the same name", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-stale-fail-pass-"));
    const binPath = join(rootDir, "fake-gh-stale-fail-pass.sh");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "if [ \"$1 $2\" = 'pr checks' ]; then",
        "  printf '%s\\n' '[",
        "    {\"name\":\"template-check\",\"workflow\":\"PR Governance\",\"bucket\":\"fail\",\"state\":\"FAILURE\",\"link\":\"https://example.com/old-template\"},",
        "    {\"name\":\"template-check\",\"workflow\":\"PR Governance\",\"bucket\":\"pass\",\"state\":\"SUCCESS\",\"link\":\"https://example.com/new-template\"},",
        "    {\"name\":\"quality\",\"workflow\":\"CI\",\"bucket\":\"pass\",\"state\":\"SUCCESS\",\"link\":\"https://example.com/new-quality\"}",
        "  ]'",
        "  exit 0",
        "fi",
        "if [ \"$1 $2\" = 'pr view' ]; then",
        "  printf '%s\\n' '{\"statusCheckRollup\":[",
        "    {\"__typename\":\"CheckRun\",\"name\":\"template-check\",\"workflowName\":\"PR Governance\",\"status\":\"COMPLETED\",\"conclusion\":\"FAILURE\",\"detailsUrl\":\"https://example.com/old-template\",\"startedAt\":\"2026-03-31T16:50:00Z\",\"completedAt\":\"2026-03-31T16:50:05Z\"},",
        "    {\"__typename\":\"CheckRun\",\"name\":\"template-check\",\"workflowName\":\"PR Governance\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\",\"detailsUrl\":\"https://example.com/new-template\",\"startedAt\":\"2026-03-31T17:10:00Z\",\"completedAt\":\"2026-03-31T17:10:08Z\"},",
        "    {\"__typename\":\"CheckRun\",\"name\":\"quality\",\"workflowName\":\"CI\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\",\"detailsUrl\":\"https://example.com/new-quality\",\"startedAt\":\"2026-03-31T17:10:01Z\",\"completedAt\":\"2026-03-31T17:10:09Z\"}",
        "  ]}'",
        "  exit 0",
        "fi",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
    });

    const checks = client.getRequiredChecks({
      prRef: "https://github.com/netsus/homecook/pull/61",
    });

    expect(checks.bucket).toBe("pass");
    expect(checks.checks).toEqual([
      {
        name: "template-check",
        workflow: "PR Governance",
        link: "https://example.com/new-template",
        bucket: "pass",
        state: "SUCCESS",
      },
      {
        name: "quality",
        workflow: "CI",
        link: "https://example.com/new-quality",
        bucket: "pass",
        state: "SUCCESS",
      },
    ]);
  });

  it("reuses an existing pull request when gh reports the branch already has one", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-existing-pr-"));
    const binPath = join(rootDir, "fake-gh-existing-pr.sh");
    const argsPath = join(rootDir, "fake-gh-existing-pr.args.log");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" >> \"$FAKE_GH_ARGS_PATH\"",
        "if [ \"$1 $2\" = 'pr create' ]; then",
        "  printf '%s\\n' 'a pull request for branch \"feature/be-04-recipe-save\" into branch \"master\" already exists:' >&2",
        "  printf '%s\\n' 'https://github.com/netsus/homecook/pull/49' >&2",
        "  exit 1",
        "fi",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
      environment: {
        FAKE_GH_ARGS_PATH: argsPath,
      },
    });

    const created = client.createPullRequest({
      base: "master",
      head: "feature/be-04-recipe-save",
      title: "feat: backend slice",
      body: "## Summary\n- backend",
      draft: true,
    });
    const argsLog = readFileSync(argsPath, "utf8");

    expect(created).toMatchObject({
      url: "https://github.com/netsus/homecook/pull/49",
      number: 49,
      draft: true,
    });
    expect(argsLog).toContain("pr");
    expect(argsLog).toContain("edit");
  });

  it("normalizes workflow v2 work item refs in PR bodies before create", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-workitem-ref-"));
    const { binPath, argsPath } = createFakeGhBin(rootDir);
    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
      environment: {
        FAKE_GH_ARGS_PATH: argsPath,
      },
    });

    client.createPullRequest({
      base: "master",
      head: "feature/be-04-recipe-save",
      title: "feat: backend slice",
      body: "## Workpack / Slice\n- workflow v2 work item: `04-recipe-save`",
      draft: true,
      workItemId: "04-recipe-save",
    });

    const argsLog = readFileSync(argsPath, "utf8");

    expect(argsLog).toContain(".workflow-v2/work-items/04-recipe-save.json");
  });

  it("fills missing required PR template sections with safe defaults", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-template-sections-"));
    const { binPath, argsPath } = createFakeGhBin(rootDir);
    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
      environment: {
        FAKE_GH_ARGS_PATH: argsPath,
      },
    });

    client.createPullRequest({
      base: "master",
      head: "feature/be-05-planner-week-core",
      title: "feat: planner backend",
      body: "## Summary\n- planner backend",
      draft: true,
      workItemId: "05-planner-week-core",
    });

    const argsLog = readFileSync(argsPath, "utf8");

    expect(argsLog).toContain("## Workpack / Slice");
    expect(argsLog).toContain(".workflow-v2/work-items/05-planner-week-core.json");
    expect(argsLog).toContain("## Docs Impact");
    expect(argsLog).toContain("## Breaking Changes");
    expect(argsLog).toContain("## Design / Accessibility");
    expect(argsLog).toContain("Supervisor 검증 명령과 필수 CI 체크를 기준으로 확인");
    expect(argsLog).toContain("사용자 노출 변경 없음");
  });

  it("fails closed when gh merge returns success but the pull request is still open", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-gh-merge-open-"));
    const binPath = join(rootDir, "fake-gh-merge-open.sh");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "case \"$1 $2\" in",
        "  'pr merge')",
        "    exit 0",
        "    ;;",
        "  'pr view')",
        "    printf '%s\\n' '{\"state\":\"OPEN\",\"mergedAt\":null,\"mergeStateStatus\":\"CLEAN\"}'",
        "    exit 0",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const client = createGithubAutomationClient({
      rootDir,
      ghBin: binPath,
    });

    expect(() =>
      client.mergePullRequest({
        prRef: "https://github.com/netsus/homecook/pull/49",
        headSha: "73cb1d2415b5fe81650513de4887b5e121e36fe9",
      }),
    ).toThrow(/merge did not complete/i);
  });
});
