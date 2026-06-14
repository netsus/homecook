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
        "provider_error_count": 0,
        "parse_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
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
});
