import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runStageWithArtifacts } from "../scripts/lib/omo-lite-runner.mjs";

function createFakeOpencodeBin(rootDir: string) {
  const binPath = join(rootDir, "fake-opencode.sh");
  const argsPath = join(rootDir, "fake-opencode-args.log");

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
      "printf 'fake-opencode-ok\\n'",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);

  return {
    binPath,
    argsPath,
  };
}

function createRunnerFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-lite-runner-"));

  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });

  return rootDir;
}

describe("OMO-lite stage runner", () => {
  it("writes dispatch and prompt artifacts without executing opencode in artifact-only mode", () => {
    const rootDir = createRunnerFixture();

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      mode: "artifact-only",
      now: "2026-03-26T21:00:00+09:00",
    });

    expect(result.execution.mode).toBe("artifact-only");
    expect(result.execution.executed).toBe(false);

    const dispatch = JSON.parse(
      readFileSync(join(result.artifactDir, "dispatch.json"), "utf8"),
    ) as Record<string, unknown>;
    const prompt = readFileSync(join(result.artifactDir, "prompt.md"), "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      actor: string;
      execution: { mode: string; executable: boolean };
    };

    expect(dispatch.actor).toBe("codex");
    expect(prompt).toContain("슬라이스 02-discovery-filter 2단계 진행");
    expect(prompt).toContain("feature/be-02-discovery-filter");
    expect(metadata.actor).toBe("codex");
    expect(metadata.execution).toMatchObject({
      mode: "artifact-only",
      executable: true,
    });
  });

  it("executes Codex stages through opencode run and records command output", () => {
    const rootDir = createRunnerFixture();
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 4,
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-26T21:10:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "execute",
      executed: true,
      executable: true,
      agent: "hephaestus",
      exitCode: 0,
    });

    const stdout = readFileSync(join(result.artifactDir, "opencode.stdout.log"), "utf8");
    const args = readFileSync(argsPath, "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      execution: { mode: string; executed: boolean; exitCode: number };
    };

    expect(stdout).toContain("fake-opencode-ok");
    expect(args).toContain("run");
    expect(args).toContain("--agent");
    expect(args).toContain("hephaestus");
    expect(args).toContain("--dir");
    expect(args).toContain(rootDir);
    expect(metadata.execution).toMatchObject({
      mode: "execute",
      executed: true,
      exitCode: 0,
    });
  });

  it("keeps review stages as manual handoff artifacts even when execute mode is requested", () => {
    const rootDir = createRunnerFixture();
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 5,
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-26T21:20:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "manual-handoff",
      executed: false,
      executable: false,
      reason: "actor is not executable by the Codex supervisor",
    });
    expect(() => readFileSync(argsPath, "utf8")).toThrow();
    expect(readFileSync(join(result.artifactDir, "prompt.md"), "utf8")).toContain(
      "슬라이스 02-discovery-filter 5단계 진행",
    );
  });
});
