import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const recordScript = path.join(repoRoot, "scripts/recipe-loop/codex-vision-iter-record.mjs");
const dashboardScript = path.join(repoRoot, "scripts/recipe-loop/codex-vision-history-dashboard.mjs");

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readJsonl(filePath: string) {
  return readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function runNode(args: string[]) {
  return spawnSync("node", args, { cwd: repoRoot, encoding: "utf8" });
}

function cleanCanary() {
  return { success: true, status: "clean", hit_count: 0, hits: [], redacted_hits: [] };
}

function leakyCanary() {
  return { success: false, status: "leak", hit_count: 1, hits: ["redacted"], redacted_hits: ["redacted"] };
}

function createFixture({
  dataRoot,
  split = "train",
  id = "video-a",
  outTag = "history-smoke",
  detCanary = cleanCanary(),
  semCanary = cleanCanary(),
  protectedSecret = "SECRET_PROTECTED_RECIPE",
}: {
  dataRoot: string;
  split?: string;
  id?: string;
  outTag?: string;
  detCanary?: unknown;
  semCanary?: unknown;
  protectedSecret?: string;
}) {
  writeJson(path.join(dataRoot, split, `_grade_summary.${outTag}.json`), {
    aggregate: {
      success: true,
      split,
      outTag,
      ingredientF1: 0.75,
      amountMatchRate: 0.5,
      stepCoverage: 0.25,
      canaryLeak: detCanary,
    },
    perVideo: [{ videoId: id, success: true }],
  });
  writeJson(path.join(dataRoot, split, `_semantic_summary.${outTag}.json`), {
    aggregate: {
      success: false,
      split,
      outTag,
      averageScore: 2.5,
      bottomKMeanScore: 1.5,
      minCaseScore: 1,
      canaryLeak: semCanary,
    },
    perVideo: [
      {
        videoId: id,
        cases: [
          {
            title: protectedSecret,
            ingredient_score: 1,
            step_score: 1,
            case_score: 1,
            reason: `${protectedSecret} reason must not appear for protected splits`,
          },
          {
            title: "테스트 레시피",
            ingredient_score: 3,
            step_score: 3,
            case_score: 3,
            reason: "fixture reason",
          },
        ],
      },
    ],
  });

  if (split === "train") {
    const cacheDir = path.join(dataRoot, "cache/codex-vision-keyframes/cache-a");
    writeJson(path.join(cacheDir, "run_meta.json"), { provider: "codex-vision-keyframes", selectedFrameCount: 2 });
    writeJson(path.join(cacheDir, "selected_frames.json"), [{ file: "frame-1.jpg" }]);
    writeJson(path.join(cacheDir, "selector.json"), { selectedFrames: [] });
    writeJson(path.join(cacheDir, "final.json"), { recipes: [] });
    writeJson(path.join(dataRoot, split, id, "runs", outTag, "result.json"), {
      videoId: id,
      meta: {
        provider: "codex-vision-keyframes",
        codexVisionKeyframesCacheDir: cacheDir,
      },
      recipes: [
        {
          title: "테스트 레시피",
          ingredients: [{ name: "양파" }, { name: "간장" }],
          steps: ["썬다", "볶는다"],
        },
      ],
    });
  }
}

describe("codex vision iteration history recorder", () => {
  let workdir: string;
  let dataRoot: string;
  let runDir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "codex-vision-history-"));
    dataRoot = path.join(workdir, "recipe_loop_data");
    runDir = path.join(workdir, "runs/codex-vision-keyframes-test");
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("records a train single-id iteration and regenerates README/dashboard", () => {
    createFixture({ dataRoot });

    const result = runNode([
      recordScript,
      "--data-root",
      dataRoot,
      "--run-dir",
      runDir,
      "--iteration",
      "1",
      "--split",
      "train",
      "--id",
      "video-a",
      "--out-tag",
      "history-smoke",
      "--decision",
      "accepted",
      "--decision-reason",
      "current baseline으로 채택",
      "--next-action",
      "다음에는 구간 분리를 실험한다.",
    ]);

    expect(result.status, result.stderr).toBe(0);
    const history = readJsonl(path.join(runDir, "history.jsonl"));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      decision: "accepted",
      ids: ["video-a"],
      result: {
        recipeCount: 1,
        ingredientCount: 2,
        stepCount: 2,
        deterministic: { ingredientF1: 0.75 },
        semantic: { averageScore: 2.5 },
      },
    });
    expect(readJson(path.join(runDir, "iteration-01/05_decision.json")).decision).toBe("accepted");
    expect(readFileSync(path.join(runDir, "README.md"), "utf8")).toContain("history-smoke");
    expect(readFileSync(path.join(runDir, "dashboard.html"), "utf8")).toContain("Codex Vision Keyframes");
  });

  it("refuses duplicate iteration numbers without overwriting existing files", () => {
    createFixture({ dataRoot });
    const args = [
      recordScript,
      "--data-root",
      dataRoot,
      "--run-dir",
      runDir,
      "--iteration",
      "1",
      "--split",
      "train",
      "--id",
      "video-a",
      "--out-tag",
      "history-smoke",
      "--decision",
      "accepted",
    ];

    expect(runNode(args).status).toBe(0);
    const second = runNode(args);

    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("iteration already exists");
    expect(readJsonl(path.join(runDir, "history.jsonl"))).toHaveLength(1);
  });

  it("rejects protected split freeform input", () => {
    createFixture({ dataRoot, split: "validation" });

    const result = runNode([
      recordScript,
      "--data-root",
      dataRoot,
      "--run-dir",
      runDir,
      "--iteration",
      "1",
      "--split",
      "validation",
      "--id",
      "video-a",
      "--out-tag",
      "history-smoke",
      "--decision",
      "inconclusive",
      "--next-action",
      "이 문장은 protected split에서는 저장되면 안 된다.",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("protected split records do not accept freeform text");
  });

  it("records protected split using aggregate-only output without leaking perVideo text", () => {
    createFixture({ dataRoot, split: "validation", protectedSecret: "SECRET_PROTECTED_RECIPE" });

    const result = runNode([
      recordScript,
      "--data-root",
      dataRoot,
      "--run-dir",
      runDir,
      "--iteration",
      "1",
      "--split",
      "validation",
      "--id",
      "video-a",
      "--out-tag",
      "history-smoke",
      "--decision",
      "inconclusive",
    ]);

    expect(result.status, result.stderr).toBe(0);
    const combinedOutput = [
      readFileSync(path.join(runDir, "history.jsonl"), "utf8"),
      readFileSync(path.join(runDir, "README.md"), "utf8"),
      readFileSync(path.join(runDir, "dashboard.html"), "utf8"),
      readFileSync(path.join(runDir, "iteration-01/feedback_for_next_iter.md"), "utf8"),
    ].join("\n");
    expect(combinedOutput).toContain("protected split aggregate-only");
    expect(combinedOutput).not.toContain("SECRET_PROTECTED_RECIPE");
  });

  it("blocks records when either deterministic or semantic canary fails", () => {
    createFixture({ dataRoot, semCanary: leakyCanary(), protectedSecret: "SECRET_CANARY_CASE" });

    const result = runNode([
      recordScript,
      "--data-root",
      dataRoot,
      "--run-dir",
      runDir,
      "--iteration",
      "1",
      "--split",
      "train",
      "--id",
      "video-a",
      "--out-tag",
      "history-smoke",
      "--decision",
      "accepted",
    ]);

    expect(result.status, result.stderr).toBe(0);
    const historyText = readFileSync(path.join(runDir, "history.jsonl"), "utf8");
    const history = readJsonl(path.join(runDir, "history.jsonl"));
    expect(history[0].decision).toBe("blocked");
    expect(history[0].weakestCases).toEqual([]);
    expect(historyText).not.toContain("SECRET_CANARY_CASE");
  });

  it("regenerates README and dashboard from history.jsonl", () => {
    createFixture({ dataRoot });
    expect(
      runNode([
        recordScript,
        "--data-root",
        dataRoot,
        "--run-dir",
        runDir,
        "--iteration",
        "1",
        "--split",
        "train",
        "--id",
        "video-a",
        "--out-tag",
        "history-smoke",
        "--decision",
        "accepted",
      ]).status,
    ).toBe(0);

    rmSync(path.join(runDir, "README.md"));
    rmSync(path.join(runDir, "dashboard.html"));
    const result = runNode([dashboardScript, "--run-dir", runDir]);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(runDir, "README.md"), "utf8")).toContain("history-smoke");
    expect(readFileSync(path.join(runDir, "dashboard.html"), "utf8")).toContain("history-smoke");
  });
});
