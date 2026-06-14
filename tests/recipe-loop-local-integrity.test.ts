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
