import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runProviderSmoke } from "../scripts/lib/omo-provider-smoke.mjs";

let fakeOpencodeCounter = 0;
let fakeClaudeCounter = 0;

function createFakeOpencodeBin(rootDir: string) {
  fakeOpencodeCounter += 1;
  const suffix = String(fakeOpencodeCounter);
  const binPath = join(rootDir, `fake-opencode-${suffix}.sh`);

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"list\" ]; then",
      "  printf '%s\\n' '1 credential configured'",
      "  exit 0",
      "fi",
      "if [ -n \"$OMO_STAGE_RESULT_PATH\" ]; then",
      "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(
        {
          result: "done",
          summary_markdown: "provider smoke",
          commit: { subject: "feat: smoke" },
          pr: {
            title: "feat: smoke",
            body_markdown: "## Summary\n- smoke",
          },
          checks_run: [],
          next_route: "open_pr",
        },
        null,
        2,
      ),
      "EOF",
      "fi",
      "printf '%s\\n' '{\"type\":\"step_start\",\"sessionID\":\"ses_codex_smoke\",\"part\":{\"type\":\"step-start\"}}'",
      "printf '%s\\n' '{\"type\":\"step_finish\",\"sessionID\":\"ses_codex_smoke\",\"part\":{\"type\":\"step-finish\",\"reason\":\"stop\"}}'",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

function createFakeClaudeBin(rootDir: string, homeDir: string) {
  fakeClaudeCounter += 1;
  const suffix = String(fakeClaudeCounter);
  const binPath = join(rootDir, `fake-claude-${suffix}.sh`);

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"--version\" ]; then",
      "  printf '%s\\n' 'claude 1.0.0'",
      "  exit 0",
      "fi",
      "cat > /dev/null",
      `mkdir -p "${homeDir}/.claude/projects/-Users-test-homecook"`,
      `cat <<'EOF' > "${homeDir}/.claude/projects/-Users-test-homecook/ses_claude_smoke.jsonl"`,
      "{\"type\":\"user\",\"content\":\"smoke\"}",
      "EOF",
      "if [ -n \"$OMO_STAGE_RESULT_PATH\" ]; then",
      "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(
        {
          result: "done",
          summary_markdown: "provider smoke",
          commit: { subject: "docs: smoke" },
          pr: {
            title: "docs: smoke",
            body_markdown: "## Summary\n- smoke",
          },
          checks_run: [],
          next_route: "open_pr",
        },
        null,
        2,
      ),
      "EOF",
      "fi",
      "cat <<'EOF'",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "ses_claude_smoke",
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      }),
      "EOF",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  mkdirSync(join(homeDir, ".claude"), { recursive: true });
  return binPath;
}

describe("OMO provider smoke", () => {
  it("runs Claude and Codex provider smokes and confirms session reuse", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-provider-smoke-"));
    const homeDir = mkdtempSync(join(tmpdir(), "omo-provider-smoke-home-"));
    const claudeBin = createFakeClaudeBin(rootDir, homeDir);
    const opencodeBin = createFakeOpencodeBin(rootDir);

    const result = runProviderSmoke({
      rootDir,
      artifactBaseDir: join(rootDir, ".artifacts", "omo-provider-smoke"),
      claudeBin,
      opencodeBin,
      homeDir,
      environment: {
        HOME: homeDir,
      },
      assertClean: false,
    });

    expect(result.ok).toBe(true);
    expect(result.targets).toHaveLength(2);
    expect(result.targets.map((target) => target.provider)).toEqual(["claude", "codex"]);
    expect(result.targets.every((target) => target.sessionReused)).toBe(true);
    expect(
      readFileSync(result.targets[0].runs[0].stageResultPath, "utf8"),
    ).toContain("\"summary_markdown\": \"provider smoke\"");
  });

  it("passes a bounded provider timeout into smoke executions", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-provider-smoke-"));
    const timeoutPath = join(rootDir, "provider-timeout.log");
    const binPath = join(rootDir, "fake-opencode-timeout.sh");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"list\" ]; then",
        "  printf '%s\\n' '1 credential configured'",
        "  exit 0",
        "fi",
        `printf '%s\\n' "$OMO_PROVIDER_TIMEOUT_MS" >> "${timeoutPath}"`,
        "if [ -n \"$OMO_STAGE_RESULT_PATH\" ]; then",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "provider smoke",
            commit: { subject: "feat: smoke" },
            pr: {
              title: "feat: smoke",
              body_markdown: "## Summary\n- smoke",
            },
            checks_run: [],
            next_route: "open_pr",
          },
          null,
          2,
        ),
        "EOF",
        "fi",
        "printf '%s\\n' '{\"type\":\"step_start\",\"sessionID\":\"ses_timeout\",\"part\":{\"type\":\"step-start\"}}'",
        "printf '%s\\n' '{\"type\":\"step_finish\",\"sessionID\":\"ses_timeout\",\"part\":{\"type\":\"step-finish\",\"reason\":\"stop\"}}'",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runProviderSmoke({
      rootDir,
      artifactBaseDir: join(rootDir, ".artifacts", "omo-provider-smoke"),
      opencodeBin: binPath,
      codexOnly: true,
      assertClean: false,
      timeoutMs: 12345,
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(timeoutPath, "utf8").trim().split(/\r?\n/)).toEqual(["12345", "12345"]);
  });
});
