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

    expect(result.status).toBe(0);
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

  it("subtracts train-public containment terms without dropping short protected titles", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, title, step):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "schemaVersion": 1,
        "videoId": video_id,
        "reviewStatus": "approved",
        "recipes": [{
            "title": title,
            "ingredients": [{"name": "고추다대기", "nameAliases": ["공용별칭"], "amount": "1", "unit": "큰술"}],
            "steps": [{"order": 1, "instruction": step}],
        }],
    }, ensure_ascii=False), encoding="utf-8")

write_golden("train", "train-a", "다시마 고추다대기", "공개 train 손질 단계입니다")
write_golden("validation", "val-a", "고추다대기", "검증 고유 긴 조리 문장입니다")
write_golden("validation", "val-b", "잡채", "잡채 고유 긴 조리 문장입니다")
fragments = loop.protected_answer_fragments(["validation"])
titles = [f["value"] for f in fragments if f["category"] == "recipe_title"]
scan_public = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "약점 케이스: 다시마 고추다대기"}], fragments)
scan_short_unique = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "잡채"}], fragments)
print(json.dumps({
    "titles": titles,
    "scan_public": scan_public,
    "scan_short_unique": scan_short_unique,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.titles).not.toContain("고추다대기");
    expect(report.titles).toContain("잡채");
    expect(report.scan_public.success).toBe(true);
    expect(report.scan_short_unique.success).toBe(false);
  });

  it("keeps canary and holdout-only step leaks as hard failures while low-uniqueness artifact hits stay advisory", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, title, alias, step, canary=None):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "videoId": video_id,
        "reviewStatus": "approved",
        "recipes": [{
            "title": title,
            "ingredients": [{"name": title + "재료", "nameAliases": [alias], "amount": "1", "unit": "큰술"}],
            "steps": [{"order": 1, "instruction": step}],
        }],
    }
    if canary:
        payload["_canary"] = canary
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

write_golden("train", "train-a", "공개요리", "공용별칭", "공개 train step instruction 입니다")
write_golden("validation", "val-a", "검증요리", "검증별칭", "검증 split 자기 산출물 문장입니다")
write_golden("holdout", "hold-a", "홀드요리", "공용별칭", "홀드아웃에만 있는 아주 긴 조리 문장입니다", "CANARY::holdout::hold-a::unit")
fragments = loop.protected_answer_fragments(["validation", "holdout"])
canary_scan = loop.scan_texts_for_protected_answers([{"scope": "01_plan.md", "text": "CANARY::holdout::hold-a::unit"}], fragments)
validation_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "검증 split 자기 산출물 문장입니다", "gate": False, "artifact_split": "validation"}
], fragments)
shared_alias_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "공용별칭", "gate": False, "artifact_split": "validation"}
], fragments)
holdout_step_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "홀드아웃에만 있는 아주 긴 조리 문장입니다", "gate": False, "artifact_split": "validation"}
], fragments)
print(json.dumps({
    "canary_scan": canary_scan,
    "validation_artifact": validation_artifact,
    "shared_alias_artifact": shared_alias_artifact,
    "holdout_step_artifact": holdout_step_artifact,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.canary_scan.success).toBe(false);
    expect(report.canary_scan.primary_canary_hit_count).toBe(1);
    expect(report.validation_artifact.success).toBe(true);
    expect(report.validation_artifact.informational_hit_count).toBeGreaterThan(0);
    expect(report.shared_alias_artifact.success).toBe(true);
    expect(report.shared_alias_artifact.advisory_hit_count).toBeGreaterThan(0);
    expect(report.holdout_step_artifact.success).toBe(false);
    expect(report.holdout_step_artifact.secondary_hard_hit_count).toBe(1);
  });

  it("treats generic and shared cooking vocabulary in module source as advisory while distinctive answers still hard-gate", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, recipes):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schemaVersion": 1, "videoId": video_id, "reviewStatus": "approved", "recipes": recipes}, ensure_ascii=False), encoding="utf-8")

# 식용유: train 재료명(다수) + validation 별칭(cross-category 공용 어휘). 카레: holdout 단일 짧은 토큰.
write_golden("train", "train-a", [{"title": "공개 볶음", "ingredients": [{"name": "식용유", "amount": "1", "unit": "큰술"}], "steps": [{"order": 1, "instruction": "공개 조리 문장 하나"}]}])
write_golden("train", "train-b", [{"title": "공개 무침", "ingredients": [{"name": "식용유", "amount": "1", "unit": "큰술"}], "steps": [{"order": 1, "instruction": "다른 공개 조리 문장"}]}])
write_golden("validation", "val-a", [{"title": "검증 고유 요리", "ingredients": [{"name": "콩기름", "nameAliases": ["식용유"], "amount": "1", "unit": "큰술"}, {"name": "비밀고유재료세트", "amount": "1", "unit": "개"}], "steps": [{"order": 1, "instruction": "검증 고유 조리 문장"}]}])
write_golden("holdout", "hold-a", [{"title": "홀드 요리", "ingredients": [{"name": "카레", "amount": "1", "unit": "개"}], "steps": [{"order": 1, "instruction": "홀드 고유 조리 문장"}]}])

fragments = loop.protected_answer_fragments(["validation", "holdout"])
module_like = "const DISH_WORD_RE = /카레|수프/; const STOP = new Set(['식용유', '소금']);"
module_scan = loop.scan_texts_for_protected_answers([{"scope": "recipe_extraction_lab_modules", "text": module_like, "module_source": True}], fragments)
module_unique = loop.scan_texts_for_protected_answers([{"scope": "recipe_extraction_lab_modules", "text": "비밀고유재료세트", "module_source": True}], fragments)
prompt_generic = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "카레"}], fragments)
print(json.dumps({"module": module_scan, "module_unique": module_unique, "prompt": prompt_generic}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    // 모듈 소스의 일반/공용 어휘(식용유·카레)는 hard gate가 아니라 advisory여야 한다
    expect(report.module.blocking_hit_count).toBe(0);
    expect(report.module.success).toBe(true);
    expect(report.module.advisory_hit_count).toBeGreaterThan(0);
    // 모듈 소스라도 고유 정답은 여전히 차단된다
    expect(report.module_unique.success).toBe(false);
    expect(report.module_unique.blocking_hit_count).toBeGreaterThan(0);
    // 컨텍스트 분리: agent-facing 스캔에서는 일반 어휘도 보수적으로 차단(모듈 완화가 전역으로 새지 않음)
    expect(report.prompt.success).toBe(false);
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

  it("reports persisted semantic grade artifact fragments as informational instead of gate failures", () => {
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
    expect(report.scan.success).toBe(true);
    expect(report.scan.hit_count).toBeGreaterThanOrEqual(2);
    expect(report.scan.informational_hit_count).toBeGreaterThanOrEqual(2);
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

  it("reports degraded_advisory for external protected marker access outside the Codex subtree", () => {
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
    expect(classification.status).toBe("degraded_advisory");
    expect(classification.external_protected_line_count).toBe(1);
  });

  it("reports degraded_advisory for unattributable protected marker access regardless of process name", () => {
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
    expect(classification.status).toBe("degraded_advisory");
    expect(classification.unattributable_protected_line_count).toBe(6);
  });

  it("classifies recipe loop graders and orchestrators as known external protected readers", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} node.4325\\n"
    f"12:00:01 open {validation_path} python3.4326\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [
        {"pid": 4325, "ppid": 1, "command": "node scripts/recipe-loop/grade-semantic.mjs"},
        {"pid": 4326, "ppid": 1, "command": "python3 scripts/recipe-loop/loop.py"},
    ],
    {"success": True},
    {"success": True, "reason": "ok"},
)
notification = loop.send_implementation_access_guard_alert({"access_guard_status": classification["status"]})
print(json.dumps({"classification": classification, "notification": notification}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.classification.status).toBe("ok");
    expect(report.classification.ignored_known_external_protected_line_count).toBe(2);
    expect(report.notification).toMatchObject({ sent: false, reason: "not_required" });
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

  it("recovers iteration feedback from disk without reusing stale leakage or subprocess failures", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
run_dir = root / "notebooks" / "recipe_loop_runs" / "oneiter"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)

def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

write_json(loop.DATA_ROOT / "train" / "train-a" / "golden.json", {
    "schemaVersion": 1,
    "videoId": "train-a",
    "reviewStatus": "approved",
    "recipes": [{"title": "공개요리", "ingredients": [], "steps": [{"order": 1, "instruction": "공개 step 입니다"}]}],
})
write_json(loop.DATA_ROOT / "train" / "_grade_summary.iter01.json", {
    "aggregate": {"success": True, "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipeCountMatchRate": 1},
    "perVideo": [{"videoId": "train-a", "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipesMatched": 1, "recipeCountGolden": 1, "recipeCountMatch": True}],
})
write_json(loop.DATA_ROOT / "train" / "_semantic_summary.iter01.json", {"aggregate": {"averageScore": 2.5, "minCaseScore": 2.5}})
write_json(loop.DATA_ROOT / "validation" / "_grade_summary.iter01.json", {
    "aggregate": {"success": True, "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipeCountMatchRate": 1, "missing_result_count": 0, "missing_golden_count": 0, "unapproved_golden_count": 0, "expected_count_mismatch": False},
})
write_json(loop.DATA_ROOT / "validation" / "_semantic_summary.iter01.json", {
    "aggregate": {"success": True, "judge_provider": "codex", "judge_model": "gpt-5.4", "judge_effort": "high", "calibration": {"valid": True}, "provider_error_count": 0, "parse_error_count": 0, "schema_error_count": 0, "timeout_error_count": 0, "calibration_error_count": 0, "empty_case_count": 0, "expected_count_mismatch": False, "threshold_success": False, "averageScore": 2.5, "minCaseScore": 2.5},
})
write_json(iter_dir / "05_decision.json", {
    "passed": False,
    "checks": {"deterministic_validation": False, "semantic_validation": False, "subprocess_health": False, "leakage_guard": False},
})

def fail_run_node(*args, **kwargs):
    raise RuntimeError("run_node must not be called during recovery")

def fake_run_agent(cmd, prompt, log_path, cwd=None):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("진단 완료", encoding="utf-8")
    return "진단 완료"

loop.run_node = fail_run_node
loop.run_agent = fake_run_agent
feedback = loop.recover_iteration_feedback(loop.LoopConfig(), run_dir, 1)
recovered = json.loads((iter_dir / "05_decision.recovered.json").read_text(encoding="utf-8"))
module_state = json.loads((iter_dir / "module_state.json").read_text(encoding="utf-8"))
print(json.dumps({
    "feedback": feedback,
    "recovered_checks": recovered["checks"],
    "module_state": module_state,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.recovered_checks.leakage_guard).toBe(true);
    expect(report.recovered_checks.subprocess_health).toBe(true);
    expect(report.feedback).toContain("deterministic_validation");
    expect(report.feedback).toContain("semantic_validation");
    expect(report.feedback).not.toContain("leakage_guard");
    expect(report.feedback).not.toContain("subprocess_health");
    expect(report.module_state.verified).toBe(false);
  });

  it("blocks legacy resume without verified module state unless explicitly accepted", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
run_dir = root / "notebooks" / "recipe_loop_runs" / "legacy"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)
(iter_dir / "05_decision.json").write_text(json.dumps({
    "passed": False,
    "checks": {"deterministic_validation": False, "semantic_validation": False, "subprocess_health": True, "leakage_guard": True},
}), encoding="utf-8")
(iter_dir / "feedback_for_next_iter.md").write_text("복구된 피드백", encoding="utf-8")
blocked = False
try:
    loop.resume_loop(loop.LoopConfig(max_iter=2), run_dir, 2)
except RuntimeError as error:
    blocked = "module_state" in str(error)

def fake_run_iteration(cfg, run_dir_arg, iteration, feedback):
    d = run_dir_arg / f"iteration-{iteration:02d}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "fake.txt").write_text(feedback, encoding="utf-8")
    return {"iteration": iteration, "passed": True, "decision": {"passed": True}, "out_tag": f"iter{iteration:02d}"}

loop.run_iteration = fake_run_iteration
loop.stage = lambda msg: None
resumed = loop.resume_loop(loop.LoopConfig(max_iter=2), run_dir, 2, accept_current_module_state=True)
module_state = json.loads((iter_dir / "module_state.json").read_text(encoding="utf-8"))
print(json.dumps({
    "blocked": blocked,
    "resumed": resumed,
    "module_state": module_state,
    "iter02_exists": (run_dir / "iteration-02" / "fake.txt").exists(),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.blocked).toBe(true);
    expect(report.resumed.status).toBe("passed");
    expect(report.module_state.verified).toBe(false);
    expect(report.iter02_exists).toBe(true);
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
