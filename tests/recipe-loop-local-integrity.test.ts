import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const gradeExtractionScript = path.join(repoRoot, "scripts/recipe-loop/grade-extraction.mjs");
const gradeSemanticScript = path.join(repoRoot, "scripts/recipe-loop/grade-semantic.mjs");
const loopScript = path.join(repoRoot, "scripts/recipe-loop/loop.py");

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function splitCase(root: string, id: string) {
  return path.join(root, "notebooks/recipe_loop_data/validation", id);
}

function codexCalibration(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    calibratedAt: "2026-06-14",
    policy: "Codex-only semantic judge calibration for local integrity tests.",
    judgeProvider: "codex",
    judgeModel: "gpt-5.4",
    judgeEffort: "high",
    judgeSchemaVersion: 1,
    thresholds: { minCaseScore: 3, averageScore: 3 },
    borderline: {
      enabled: true,
      minCaseScore: 3,
      maxCaseScore: 4,
      retryEffort: "xhigh",
    },
    alignmentStats: {
      sampleCount: 6,
      meanAbsoluteDelta: 0.25,
      maxMeanAbsoluteDelta: 1,
      directionDisagreementCount: 0,
      maxDirectionDisagreementCount: 1,
    },
    samples: Array.from({ length: 6 }, (_, index) => ({
      id: `sample-${index + 1}`,
      judgeCaseScore: index % 2 === 0 ? 3 : 4,
      verdict: "aligned",
    })),
    ...overrides,
  };
}

function approvedGolden(reviewStatus = "approved") {
  return {
    schemaVersion: 1,
    videoId: "case-a",
    reviewStatus,
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: [{ order: 1, instruction: "양파를 볶는다" }],
      },
    ],
  };
}

function matchingResult() {
  return {
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: ["양파를 볶는다"],
      },
    ],
  };
}

function runLoopPython(snippet: string) {
  const bootstrap = `
import importlib.util
import json
import sys
spec = importlib.util.spec_from_file_location("recipe_loop", ${JSON.stringify(loopScript)})
loop = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = loop
spec.loader.exec_module(loop)
${snippet}
`;
  return spawnSync("python3", ["-c", bootstrap], { cwd: repoRoot, encoding: "utf8" });
}

describe("recipe-loop local integrity gates", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "recipe-loop-integrity-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("records missing deterministic artifacts as explicit failed rows", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(path.join(splitCase(workdir, "case-missing"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 2,
      missing_result_count: 1,
      unapproved_golden_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo.find((row: { videoId: string }) => row.videoId === "case-missing")).toMatchObject({
      success: false,
      failureReason: "missing_result",
    });
  });

  it("fails deterministic grading when a gate golden is not approved", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden("draft"));
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      unapproved_golden_count: 1,
      failed_row_count: 1,
    });
  });

  it("fails deterministic grading on expected count mismatch", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 1,
      expected_count_mismatch: true,
      failed_row_count: 0,
    });
  });

  it("hardens known deterministic scorer loopholes", () => {
    writeJson(path.join(splitCase(workdir, "name-false-positive"), "golden.json"), {
      schemaVersion: 1,
      videoId: "name-false-positive",
      reviewStatus: "approved",
      recipes: [
        {
          title: "이름 오탐",
          ingredients: [{ name: "고추장", amount: "1", unit: "큰술" }],
          steps: [{ order: 1, instruction: "고추장을 넣는다" }],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "name-false-positive"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "이름 오탐",
          ingredients: [{ name: "고추", amount: "1", unit: "큰술" }],
          steps: ["고추장을 넣는다"],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-missing",
      reviewStatus: "approved",
      recipes: [
        {
          title: "분량 누락",
          ingredients: [{ name: "간장", amount: "2", unit: "큰술" }],
          steps: [{ order: 1, instruction: "간장을 넣는다" }],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "분량 누락",
          ingredients: [{ name: "간장", amount: null, unit: "큰술" }],
          steps: ["간장을 넣는다"],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "one-bag-step"), "golden.json"), {
      schemaVersion: 1,
      videoId: "one-bag-step",
      reviewStatus: "approved",
      recipes: [
        {
          title: "한 번에 넣기",
          ingredients: [{ name: "양파", amount: "1", unit: "개" }],
          steps: [
            { order: 1, instruction: "양파를 먼저 볶는다" },
            { order: 2, instruction: "고기를 넣고 익힌다" },
            { order: 3, instruction: "간장을 넣어 조린다" },
          ],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "one-bag-step"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "한 번에 넣기",
          ingredients: [{ name: "양파", amount: "1", unit: "개" }],
          steps: ["양파와 고기와 간장을 한 번에 넣고 볶아 익히고 조린다"],
        },
      ],
    });

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "3"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    const rows = Object.fromEntries(summary.perVideo.map((row: { videoId: string }) => [row.videoId, row]));
    expect(rows["name-false-positive"]).toMatchObject({ ingredientRecall: 0, ingredientF1: 0 });
    expect(rows["amount-missing"]).toMatchObject({ ingredientRecall: 1, amountMatchRate: 0 });
    expect(rows["one-bag-step"].stepCoverage).toBeLessThan(1);
  });

  it("records semantic missing artifacts without calling the provider", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeSemanticScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      provider_error_count: 0,
      parse_error_count: 0,
      empty_case_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo[0]).toMatchObject({
      videoId: "case-a",
      success: false,
      failureReason: "missing_result",
    });
  });

  it("fails semantic grading on expected count mismatch without calling the provider", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeSemanticScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 1,
      provider_error_count: 0,
      parse_error_count: 0,
      empty_case_count: 0,
      expected_count_mismatch: true,
      failed_row_count: 1,
    });
  });

  it("applies semantic judge provider separation and calibrated thresholds", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), {
      ...matchingResult(),
      __semanticJudge: {
        cases: [
          {
            title: "테스트 레시피",
            ingredient_score: 2,
            step_score: 2,
            reason: "fixture low score",
          },
        ],
      },
    });
    writeJson(path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"), {
      schemaVersion: 1,
      thresholds: { minCaseScore: 3, averageScore: 3 },
      samples: [
        {
          id: "fixture-low",
          split: "train",
          videoId: "case-a",
          humanCaseScore: 2,
          judgeCaseScore: 2,
          verdict: "aligned",
        },
      ],
    });

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "fixture",
        "--judge-model",
        "fixture-local",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      judge_provider: "fixture",
      judge_model: "fixture-local",
      threshold_success: false,
      calibration: { sample_count: 1 },
    });
  });

  it("uses the codex semantic judge cache and validates calibration model contracts", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration(),
    );

    const first = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_JUDGE_MOCK_RESPONSE: JSON.stringify({
            cases: [{ title: "테스트 레시피", ingredient_score: 4.5, step_score: 4.5, reason: "aligned" }],
            average_score: 4.5,
          }),
        },
      },
    );

    expect(first.status).toBe(0);
    const firstSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(firstSummary.aggregate).toMatchObject({
      success: true,
      judge_provider: "codex",
      judge_model: "gpt-5.4",
      judge_effort: "high",
      cache_hit_count: 0,
      cache_miss_count: 1,
      calibration: { loaded: true, valid: true },
    });

    const second = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
      },
    );

    expect(second.status).toBe(0);
    const secondSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(secondSummary.aggregate).toMatchObject({
      cache_hit_count: 1,
      cache_miss_count: 0,
    });
  });

  it("fails codex semantic grading before provider calls when calibration effort mismatches", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration({ judgeEffort: "xhigh" }),
    );

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
      },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      provider_error_count: 0,
      calibration_error_count: 1,
      calibration: {
        loaded: true,
        valid: false,
        failure_reason: "judge_effort_mismatch",
      },
    });
  });

  it("rechecks borderline semantic cases once and keeps the lower score", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), {
      ...matchingResult(),
      __semanticJudge: {
        cases: [{ title: "테스트 레시피", ingredient_score: 3.5, step_score: 3.5, reason: "borderline" }],
        average_score: 3.5,
      },
      __semanticJudgeRetry: {
        cases: [{ title: "테스트 레시피", ingredient_score: 2.5, step_score: 2.5, reason: "lower retry" }],
        average_score: 2.5,
      },
    });
    writeJson(path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"), {
      schemaVersion: 2,
      thresholds: { minCaseScore: 2, averageScore: 2 },
      borderline: { enabled: true, minCaseScore: 3, maxCaseScore: 4, retryEffort: "xhigh" },
      samples: [],
    });

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "fixture",
        "--judge-model",
        "fixture-local",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      borderline_retry_count: 1,
      minCaseScore: 2.5,
      averageScore: 2.5,
    });
    expect(summary.perVideo[0].cases[0]).toMatchObject({
      case_score: 2.5,
      retried: true,
      retry_case_score: 2.5,
    });
  });

  it("keeps every decision gate axis fail-closed", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
base_summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "provider_error_count": 0,
        "parse_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "averageScore": 4.3,
        "minCaseScore": 4,
    }},
}
cases = {}
for axis in ["deterministic_validation", "semantic_validation", "subprocess_health", "leakage_guard"]:
    summaries = json.loads(json.dumps(base_summaries))
    gate_inputs = {"subprocess_health": {"success": True}, "leakage_guard": {"success": True}}
    if axis == "deterministic_validation":
        summaries["val_det"]["aggregate"]["ingredientF1"] = 0.1
    elif axis == "semantic_validation":
        summaries["val_ai"]["aggregate"]["provider_error_count"] = 1
    elif axis == "subprocess_health":
        gate_inputs["subprocess_health"]["success"] = False
    elif axis == "leakage_guard":
        gate_inputs["leakage_guard"]["success"] = False
    decision = loop.decide(cfg, summaries, gate_inputs)
    cases[axis] = {"passed": decision["passed"], "checks": decision["checks"]}
print(json.dumps(cases))
`);

    expect(result.status).toBe(0);
    const cases = JSON.parse(result.stdout);
    for (const axis of ["deterministic_validation", "semantic_validation", "subprocess_health", "leakage_guard"]) {
      expect(cases[axis].passed).toBe(false);
      expect(cases[axis].checks[axis]).toBe(false);
    }
  });

  it("fails semantic validation when calibrated score thresholds are not met", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
aggregate = {
    "success": True,
    "provider_error_count": 0,
    "parse_error_count": 0,
    "empty_case_count": 0,
    "expected_count_mismatch": False,
    "threshold_success": False,
    "averageScore": 4,
    "minCaseScore": 2,
}
ok, checks = loop.semantic_validation_success(cfg, aggregate)
print(json.dumps({"ok": ok, "checks": checks}))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.checks.threshold_success).toBe(false);
  });

  it("fails the loop decision when protected answers appear in decision or log outputs", () => {
    const result = runLoopPython(`
fragments = loop.protected_answer_fragments(["validation"])
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_quantity", "step_instruction"))
scan = loop.scan_texts_for_protected_answers([
    {"scope": "05_decision_payload", "text": target["value"]},
    {"scope": "agent_log", "text": target["value"]},
], fragments)
cfg = loop.LoopConfig()
summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "judge_provider": "codex",
        "judge_model": "gpt-5.4",
        "judge_effort": "high",
        "calibration": {"valid": True},
        "provider_error_count": 0,
        "parse_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "averageScore": 4.3,
        "minCaseScore": 4,
    }},
}
decision = loop.decide(cfg, summaries, {
    "subprocess_health": {"success": True},
    "leakage_guard": {"success": scan["success"], "output_redaction_scan": scan},
})
payload = {"scan": scan, "decision": decision}
print(json.dumps({
    "payload": payload,
    "raw_leaked": target["value"] in json.dumps(payload, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.payload.scan.success).toBe(false);
    expect(report.payload.scan.hit_count).toBeGreaterThanOrEqual(2);
    expect(report.payload.scan.scanned_scopes).toEqual(
      expect.arrayContaining(["05_decision_payload", "agent_log"]),
    );
    expect(report.payload.decision.passed).toBe(false);
    expect(report.payload.decision.checks.leakage_guard).toBe(false);
    expect(report.raw_leaked).toBe(false);
  });

  it("tracks holdout one-time consumption and scans nested run artifacts without raw leaks", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
fragments = loop.protected_answer_fragments(["validation"])
target = fragments[0]["value"]
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
loop.DATA_ROOT.mkdir(parents=True, exist_ok=True)
status_before = loop.holdout_consumption_status()
loop.write_holdout_consumed_marker("final-smoke", {"success": False, "reason": "unit"}, dry_run=False)
status_after = loop.holdout_consumption_status()
blocked = False
try:
    loop.assert_holdout_not_consumed()
except RuntimeError:
    blocked = True
artifact_dir = root / "run-artifacts" / "iteration-01" / "nested"
artifact_dir.mkdir(parents=True, exist_ok=True)
(artifact_dir / "agent.log").write_text(target, encoding="utf-8")
scan = loop.scan_directory_for_protected_answers(root / "run-artifacts", fragments)
print(json.dumps({
    "status_before": status_before,
    "status_after": status_after,
    "blocked": blocked,
    "scan": scan,
    "raw_leaked": target in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status_before.consumed).toBe(false);
    expect(report.status_after).toMatchObject({ consumed: true, out_tag: "final-smoke" });
    expect(report.blocked).toBe(true);
    expect(report.scan.success).toBe(false);
    expect(report.raw_leaked).toBe(false);
  });

  it("scans persisted semantic grade artifacts for protected answer fragments", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
fragments = loop.protected_answer_fragments(["validation"])
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_quantity", "step_instruction"))
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
artifact = loop.DATA_ROOT / "validation" / "case-a" / "runs" / "latest" / "grade_semantic.json"
artifact.parent.mkdir(parents=True, exist_ok=True)
artifact.write_text(target["value"], encoding="utf-8")
summary = loop.DATA_ROOT / "validation" / "_semantic_summary.latest.json"
summary.parent.mkdir(parents=True, exist_ok=True)
summary.write_text(target["value"], encoding="utf-8")
scan = loop.scan_semantic_artifacts_for_protected_answers("validation", "latest", fragments)
print(json.dumps({
    "scan": scan,
    "raw_leaked": target["value"] in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.scan.success).toBe(false);
    expect(report.scan.hit_count).toBeGreaterThanOrEqual(2);
    expect(report.scan.scanned_scopes).toEqual(
      expect.arrayContaining([
        "validation/case-a/runs/latest/grade_semantic.json",
        "validation/_semantic_summary.latest.json",
      ]),
    );
    expect(report.raw_leaked).toBe(false);
  });

  it("only authorizes the holdout from a genuine passing run-artifact decision", () => {
    const result = runLoopPython(`
import json
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
loop.DATA_ROOT.mkdir(parents=True, exist_ok=True)
loop.RUN_ROOT = root / "notebooks" / "recipe_loop_runs"

ALL_PASS = {axis: True for axis in loop.GATE_AXES}
ONE_FAIL = {**ALL_PASS, "deterministic_validation": False}

def decision_file(run, passed, axes):
    d = loop.RUN_ROOT / run / "iteration-01"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "05_decision.json"
    p.write_text(json.dumps({
        "run_mode": "offline_snapshot_eval",
        "gate_mode": "local_hardening",
        "passed": passed,
        "checks": axes,
    }), encoding="utf-8")
    return p

def refused(**kwargs):
    try:
        loop.run_holdout_final(dry_run=False, **kwargs)
        return False
    except RuntimeError:
        return True

refused_no_decision = refused(out_tag="t1", validation_decision_path=None)

# passed:true but outside the run-artifact path → refused (path guard)
fake = root / "fake_decision.json"
fake.write_text(json.dumps({"gate_mode": "local_hardening", "passed": True, "checks": ALL_PASS}), encoding="utf-8")
refused_fake_path = refused(out_tag="t2", validation_decision_path=str(fake))

# real-artifact path but malformed decision shape → refused (shape guard)
malformed_path = loop.RUN_ROOT / "run-malformed" / "iteration-01" / "05_decision.json"
malformed_path.parent.mkdir(parents=True, exist_ok=True)
malformed_path.write_text(json.dumps([{"passed": True}]), encoding="utf-8")
malformed = loop.load_validation_decision(str(malformed_path))

# real-artifact shape but one gate axis failed → refused (axis check)
fail_path = decision_file("run-fail", False, ONE_FAIL)
refused_failed_axis = refused(out_tag="t3", validation_decision_path=str(fail_path))

marker_after_refusal = loop.holdout_marker_path().exists()

# genuine passing run-artifact decision → dry-run preview authorized
pass_path = decision_file("run-pass", True, ALL_PASS)
preview = loop.run_holdout_final(out_tag="t4", dry_run=True, validation_decision_path=str(pass_path))

print(json.dumps({
    "refused_no_decision": refused_no_decision,
    "refused_fake_path": refused_fake_path,
    "malformed_passed": malformed["passed"],
    "malformed_reason": malformed["reason"],
    "refused_failed_axis": refused_failed_axis,
    "marker_after_refusal": marker_after_refusal,
    "preview_validation_passed": preview["validation_passed"],
    "preview_decision_path": preview["validation_decision_path"],
    "marker_after_dry": loop.holdout_marker_path().exists(),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.refused_no_decision).toBe(true);
    expect(report.refused_fake_path).toBe(true);
    expect(report.malformed_passed).toBe(false);
    expect(report.malformed_reason).toBe("file is not a decision object");
    expect(report.refused_failed_axis).toBe(true);
    expect(report.marker_after_refusal).toBe(false);
    expect(report.preview_validation_passed).toBe(true);
    expect(report.preview_decision_path).toContain("05_decision.json");
    expect(report.marker_after_dry).toBe(false);
  });

  it("builds protected answer fingerprints beyond step instructions and redacts scan hits", () => {
    const result = runLoopPython(`
fragments = loop.protected_answer_fragments(["validation"])
categories = sorted(set(f["category"] for f in fragments))
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_alias", "ingredient_quantity"))
scan = loop.scan_texts_for_protected_answers([{"scope": "unit", "text": target["value"]}], fragments)
payload = {"categories": categories, "target_value": target["value"], "scan": scan}
print(json.dumps(payload, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.categories).toEqual(
      expect.arrayContaining(["ingredient_name", "ingredient_quantity", "recipe_title", "step_instruction"]),
    );
    expect(payload.scan.success).toBe(false);
    expect(JSON.stringify(payload.scan)).not.toContain(payload.target_value);
  });

  it("creates an implementation workspace with only allowlisted files", () => {
    const result = runLoopPython(`
import shutil
workspace = loop.create_codex_implementation_workspace()
files = sorted(str(p.relative_to(workspace)) for p in workspace.rglob("*") if p.is_file())
forbidden_exists = any((workspace / forbidden).exists() for forbidden in [
    ".git",
    "notebooks/recipe_loop_data/train",
    "notebooks/recipe_loop_data/validation",
    "notebooks/recipe_loop_data/holdout",
])
print(json.dumps({
    "files": files,
    "forbidden_exists": forbidden_exists,
    "workspace": str(workspace),
}, ensure_ascii=False))
shutil.rmtree(workspace, ignore_errors=True)
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.files).toEqual(
      expect.arrayContaining([
        "lib/server/recipe-extraction-lab/extract.mjs",
        "lib/server/recipe-extraction-lab/prompt.mjs",
        "package.json",
      ]),
    );
    expect(report.files.some((file: string) => file.startsWith("notebooks/recipe_loop_data/"))).toBe(false);
    expect(report.forbidden_exists).toBe(false);
  });

  it("treats train as public diagnostic data outside the implementation forbidden access guard", () => {
    const result = runLoopPython(`
markers = loop.implementation_forbidden_path_markers()
print(json.dumps({
    "has_train": any("notebooks/recipe_loop_data/train" in marker for marker in markers),
    "has_validation": any("notebooks/recipe_loop_data/validation" in marker for marker in markers),
    "has_holdout": any("notebooks/recipe_loop_data/holdout" in marker for marker in markers),
    "has_runs": any("notebooks/recipe_loop_runs" in marker for marker in markers),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.has_train).toBe(false);
    expect(report.has_validation).toBe(true);
    expect(report.has_holdout).toBe(true);
    expect(report.has_runs).toBe(true);
  });

  it("normalizes missing fs_usage logs without losing required scanner keys", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "missing.log"
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps({
    "scan": scan,
    "classification": classification,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.scan).toMatchObject({
      success: false,
      reason: "fs_usage_log_missing",
      forbidden_line_count: 0,
      forbidden_lines: [],
    });
    expect(report.classification.status).toBe("monitoring_unavailable");
    expect(report.classification.reason).toBe("fs_usage_log_missing");
  });

  it("treats fs_usage exiting during implementation as monitoring_unavailable", () => {
    const result = runLoopPython(`
scan = {"success": True, "reason": "ok", "forbidden_line_count": 0, "forbidden_lines": [], "log_path": "audit.log"}
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True, "started": True},
    {"success": False, "reason": "fs_usage_exited_during_implementation", "returncode": 1},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("monitoring_unavailable");
    expect(classification.reason).toBe("fs_usage_exited_during_implementation");
  });

  it("does not treat guard-requested fs_usage termination as a monitoring failure", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-stop-")) / "audit.log"
log_file = log_path.open("w", encoding="utf-8")
proc = loop.subprocess.Popen([loop.sys.executable, "-c", "import time; time.sleep(30)"], stdout=log_file, stderr=loop.subprocess.STDOUT, text=True)
stop = loop.stop_fs_usage_audit({"process": proc, "log_file": log_file, "log_path": "audit.log"})
print(json.dumps(stop, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const stop = JSON.parse(result.stdout);
    expect(stop.success).toBe(true);
    expect(stop.reason).toBe("ok");
  });

  it("detects and redacts forbidden validation paths from fs_usage audit logs", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
train_path = loop.DATA_ROOT / "train" / "public-case" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path}\\n12:00:01 open {train_path}\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
print(json.dumps({
    "success": scan["success"],
    "forbidden_line_count": scan["forbidden_line_count"],
    "marker_kind": scan["forbidden_lines"][0]["marker_kind"],
    "has_raw_validation_path": str(validation_path) in json.dumps(scan, ensure_ascii=False),
    "has_raw_train_path": str(train_path) in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(true);
    expect(report.forbidden_line_count).toBe(1);
    expect(report.marker_kind).toBe("protected");
    expect(report.has_raw_validation_path).toBe(false);
    expect(report.has_raw_train_path).toBe(false);
  });

  it("keeps scanner output for forbidden lines outside the implementation PID subtree", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} Spotlight.999\\n"
    f"12:00:01 open {validation_path} codex.1234\\n"
    f"12:00:02 open {holdout_path} node.1235\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(
    log_path,
    allowed_pids={1234, 1235},
    pid_subtree={
        "processes": [
            {"pid": 1234, "ppid": 1, "command": "codex"},
            {"pid": 1235, "ppid": 1234, "command": "node"},
        ],
    },
)
print(json.dumps({
    "success": scan["success"],
    "forbidden_line_count": scan["forbidden_line_count"],
    "pids": [line["process_pid"] for line in scan["forbidden_lines"]],
    "has_raw_validation_path": str(validation_path) in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(true);
    expect(report.forbidden_line_count).toBe(3);
    expect(report.pids).toEqual([999, 1234, 1235]);
    expect(report.has_raw_validation_path).toBe(false);
  });

  it("ignores known external protected-path noise seen in the snapshot history", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(f"12:00:00 open {validation_path} Spotlight.999\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 999, "ppid": 1, "command": "Spotlight"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.ignored_known_external_protected_line_count).toBe(1);
  });

  it("ignores current run artifacts even when RUN_ROOT is a protected marker", () => {
    const result = runLoopPython(`
import tempfile
current_run_dir = loop.RUN_ROOT / "current-test-run"
current_iter_dir = current_run_dir / "iter_01"
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
implementation_log = current_iter_dir / "02_implementation.log"
log_path.write_text(f"12:00:00 write {implementation_log} python3.1234\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path, current_run_dirs=[current_run_dir, current_iter_dir])
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "python3"}]},
    [{"pid": 1234, "ppid": 1, "command": "python3"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.codex_subtree_hit_count).toBe(0);
    expect(classification.ignored_line_count).toBe(1);
  });

  it("ignores external .git access when the PID was seen in snapshot history", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
git_path = loop.PROJECT_ROOT / ".git" / "index"
log_path.write_text(f"12:00:00 open {git_path} git.4321\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 4321, "ppid": 1, "command": "git"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.ignored_line_count).toBe(1);
  });

  it("reports monitoring_unavailable for external protected marker access outside the Codex subtree", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(f"12:00:00 open {validation_path} python3.4325\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 4325, "ppid": 1, "command": "python3"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("monitoring_unavailable");
    expect(classification.external_protected_line_count).toBe(1);
  });

  it("reports monitoring_unavailable for unattributable protected marker access regardless of process name", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
cache_path = loop.DATA_ROOT / "cache" / "entry.json"
review_path = loop.DATA_ROOT / "REVIEW_validation.md"
semantic_path = loop.DATA_ROOT / "semantic_calibration.json"
past_run_path = loop.RUN_ROOT / "old-run" / "iter_01" / "05_decision.json"
log_path.write_text(
    f"12:00:00 open {validation_path} git.4322\\n"
    f"12:00:01 open {holdout_path} sh.4323\\n"
    f"12:00:02 open {cache_path} python3.4324\\n"
    f"12:00:03 open {review_path} sh.4326\\n"
    f"12:00:04 open {semantic_path} python3.4327\\n"
    f"12:00:05 open {past_run_path} git.4328\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("monitoring_unavailable");
    expect(classification.unattributable_protected_line_count).toBe(6);
  });

  it("warns when Codex or its child process accesses a protected marker", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} codex.1234\\n"
    f"12:00:01 open {holdout_path} node.1235\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234, 1235], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}, {"pid": 1235, "ppid": 1234, "command": "node"}]},
    [{"pid": 1234, "ppid": 1, "command": "codex"}, {"pid": 1235, "ppid": 1234, "command": "node"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("warning");
    expect(classification.codex_subtree_hit_count).toBe(2);
  });

  it("keeps unattributable .git-only noise out of Discord-triggering guard statuses", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
git_path = loop.PROJECT_ROOT / ".git" / "index"
log_path.write_text(f"12:00:00 open {git_path} git.9999\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
notification = loop.send_implementation_access_guard_alert({"access_guard_status": classification["status"]})
print(json.dumps({"classification": classification, "notification": notification}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.classification.status).toBe("ok");
    expect(report.classification.unknown_git_line_count).toBe(1);
    expect(report.notification).toMatchObject({ sent: false, reason: "not_required" });
  });

  it("does not confuse .github paths with the protected .git marker", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
github_path = loop.PROJECT_ROOT / ".github" / "workflows" / "ci.yml"
log_path.write_text(f"12:00:00 open {github_path} sh.7777\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
print(json.dumps(scan, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const scan = JSON.parse(result.stdout);
    expect(scan.success).toBe(true);
    expect(scan.forbidden_line_count).toBe(0);
    expect(scan.forbidden_lines).toEqual([]);
  });

  it("records implementation access guard warnings as non-fatal iteration metadata", () => {
    const result = runLoopPython(`
import tempfile
root = loop.Path(tempfile.mkdtemp(prefix="access-guard-payload-"))
payload = loop.implementation_access_guard_payload(
    "warning",
    "forbidden_golden_path_access_suspected",
    root / "02_fs_audit.log",
    root / "02_fs_audit_hits.json",
    hit_count=2,
    representative_hit={"process_pid": 1234, "process_name": "codex"},
)
print(json.dumps(payload, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.access_guard_status).toBe("warning");
    expect(payload.passed).toBe(false);
    expect(payload.continues_iteration).toBe(true);
    expect(payload.reason).toBe("forbidden_golden_path_access_suspected");
    expect(payload.hit_log_path).toContain("02_fs_audit_hits.json");
  });

  it("keeps implementation access guard status out of hard decision checks", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "judge_provider": "codex",
        "judge_model": "gpt-5.4",
        "judge_effort": "high",
        "calibration": {"valid": True},
        "provider_error_count": 0,
        "parse_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "averageScore": 4.3,
        "minCaseScore": 4,
    }},
}
decision = loop.decide(cfg, summaries, {
    "subprocess_health": {"success": True},
    "leakage_guard": {"success": True},
    "implementation_access_guard": {"access_guard_status": "monitoring_unavailable", "continues_iteration": True},
})
print(json.dumps(decision, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const decision = JSON.parse(result.stdout);
    expect(decision.passed).toBe(true);
    expect(decision.checks).not.toHaveProperty("implementation_access_guard");
    expect(decision.implementation_access_guard.access_guard_status).toBe("monitoring_unavailable");
  });

  it("prechecks that the access guard watches the original repo root with golden directories", () => {
    const result = runLoopPython(`
environment = loop.validate_implementation_access_guard_environment()
print(json.dumps(environment, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const environment = JSON.parse(result.stdout);
    expect(environment.success).toBe(true);
    expect(environment.checks.repo_git_exists).toBe(true);
    expect(environment.checks.validation_dir_exists).toBe(true);
    expect(environment.checks.holdout_dir_exists).toBe(true);
  });

  it("warns implementation Codex not to access protected evaluation artifacts", () => {
    const result = runLoopPython(`
prompt = loop.build_implement_prompt("계획", "")
print(json.dumps({
    "has_allowlist": "allowlist implementation workspace" in prompt,
    "has_validation_holdout": "validation/holdout golden/evaluation data" in prompt,
    "has_git": "source repository .git directory" in prompt,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.has_allowlist).toBe(true);
    expect(report.has_validation_holdout).toBe(true);
    expect(report.has_git).toBe(true);
  });

  it("uses non-interactive sudo for fs_usage when the loop is not already root", () => {
    const result = runLoopPython(`
cmd = loop.fs_usage_command()
print(json.dumps({"cmd": cmd, "is_root": loop.os.geteuid() == 0}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    if (report.is_root) {
      expect(report.cmd.slice(0, 1)).toEqual(["fs_usage"]);
    } else {
      expect(report.cmd.slice(0, 2)).toEqual(["sudo", "-n"]);
      expect(report.cmd).toContain("fs_usage");
    }
    expect(report.cmd).toEqual(expect.arrayContaining(["-w", "-f", "pathname"]));
  });
});
