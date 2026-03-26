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
});
