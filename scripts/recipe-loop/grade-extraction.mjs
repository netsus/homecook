#!/usr/bin/env node
/* eslint-disable no-console */
// 채점기: result.json(추출 결과) vs golden.json(정답) → 결정적 점수.
// 러너와 별도 프로세스로 동작해 격리를 유지한다.
//
// 사용법:
//   node scripts/recipe-loop/grade-extraction.mjs --split train [--out-tag baseline] [--ids id1,id2]

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { gradeDeterministic, mergeDeductionReasonSummaries, prepareCanaryGradingInputs, summarizeCanaryLeaks } from "./lib/grading.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

function mean(values) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
const r3 = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);

function toInt(value) {
  if (value === null || value === undefined || value === true) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function failedRow(id, reason) {
  return {
    videoId: id,
    success: false,
    failureReason: reason,
    recipeCountGolden: 0,
    recipeCountPredicted: 0,
    recipeCountMatch: false,
    recipesMatched: 0,
    recipesMissed: 0,
    recipesExtra: 0,
    ingredientF1: 0,
    ingredientPrecision: 0,
    ingredientRecall: 0,
    amountMatchRate: 0,
    stepCoverage: 0,
    perRecipe: [],
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const expectedCountArg = toInt(args["expected-count"]);
  const splitDir = path.join(PROJECT_ROOT, DATA_ROOT, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const rows = [];
  for (const id of ids) {
    const resultPath = path.join(splitDir, id, "runs", outTag, "result.json");
    const goldenPath = path.join(splitDir, id, "golden.json");
    const hasResult = existsSync(resultPath);
    const hasGolden = existsSync(goldenPath);
    if (!hasResult || !hasGolden) {
      const reason = !hasResult && !hasGolden ? "missing_result_and_golden" : (!hasResult ? "missing_result" : "missing_golden");
      console.error(`[FAIL] ${id}: ${reason}`);
      rows.push(failedRow(id, reason));
      continue;
    }
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const golden = JSON.parse(await readFile(goldenPath, "utf8"));
    if (golden.reviewStatus !== "approved") {
      console.error(`[FAIL] ${id}: unapproved_golden`);
      rows.push(failedRow(id, "unapproved_golden"));
      continue;
    }
    const resultScope = `${split}/${id}/runs/${outTag}/result.json`;
    const { cleanGolden, cleanResult, canaryLeak } = prepareCanaryGradingInputs({
      split,
      videoId: id,
      golden,
      result,
      resultScope,
    });
    const score = gradeDeterministic(cleanResult, cleanGolden);
    const row = { videoId: id, success: true, ...score, canaryLeak };
    rows.push(row);
    await writeFile(path.join(splitDir, id, "runs", outTag, "grade.json"), JSON.stringify(row, null, 2) + "\n", "utf8");
  }

  const expectedCount = expectedCountArg ?? ids.length;
  const missingResultCount = rows.filter((r) => r.failureReason === "missing_result" || r.failureReason === "missing_result_and_golden").length;
  const missingGoldenCount = rows.filter((r) => r.failureReason === "missing_golden" || r.failureReason === "missing_result_and_golden").length;
  const unapprovedGoldenCount = rows.filter((r) => r.failureReason === "unapproved_golden").length;
  const failedRowCount = rows.filter((r) => r.success === false).length;
  const expectedCountMismatch = rows.length !== expectedCount;
  const success = failedRowCount === 0 && !expectedCountMismatch;
  const canaryLeak = summarizeCanaryLeaks({ split, ids, rows });
  const agg = {
    success,
    split,
    outTag,
    count: rows.length,
    expected_count: expectedCount,
    actual_count: rows.length,
    missing_result_count: missingResultCount,
    missing_golden_count: missingGoldenCount,
    unapproved_golden_count: unapprovedGoldenCount,
    expected_count_mismatch: expectedCountMismatch,
    failed_row_count: failedRowCount,
    recipeCountMatchRate: r3(mean(rows.map((r) => (r.recipeCountMatch ? 1 : 0)))),
    ingredientF1: r3(mean(rows.map((r) => r.ingredientF1))),
    ingredientPrecision: r3(mean(rows.map((r) => r.ingredientPrecision))),
    ingredientRecall: r3(mean(rows.map((r) => r.ingredientRecall))),
    amountMatchRate: r3(mean(rows.map((r) => r.amountMatchRate))),
    amountCoverage: r3(mean(rows.map((r) => r.amountCoverage))),
    stepCoverage: r3(mean(rows.map((r) => r.stepCoverage))),
    recipesMissedTotal: rows.reduce((a, r) => a + (r.recipesMissed ?? 0), 0),
    recipesExtraTotal: rows.reduce((a, r) => a + (r.recipesExtra ?? 0), 0),
    deductionReasons: mergeDeductionReasonSummaries(rows.map((r) => r.deductionReasons)),
    canaryLeak,
  };

  const summaryPath = path.join(splitDir, `_grade_summary.${outTag}.json`);
  await writeFile(summaryPath, JSON.stringify({ aggregate: agg, perVideo: rows }, null, 2) + "\n", "utf8");

  console.log(`\n=== ${split} / ${outTag} 집계 (n=${agg.count}) ===`);
  console.log(`레시피 개수 일치율: ${agg.recipeCountMatchRate} (누락 ${agg.recipesMissedTotal}, 초과 ${agg.recipesExtraTotal})`);
  console.log(`재료 F1: ${agg.ingredientF1} (P ${agg.ingredientPrecision} / R ${agg.ingredientRecall})`);
  console.log(`분량 일치율: ${agg.amountMatchRate}`);
  console.log(`분량 커버리지: ${agg.amountCoverage}`);
  console.log(`단계 커버리지: ${agg.stepCoverage}`);
  console.log(`\n케이스별:`);
  for (const row of rows) {
    if (row.success === false) {
      console.log(`  ${row.videoId}: FAIL ${row.failureReason}`);
      continue;
    }
    console.log(`  ${row.videoId}: F1 ${row.ingredientF1}, 분량 ${row.amountMatchRate}, 단계 ${row.stepCoverage}, 레시피 ${row.recipesMatched}/${row.recipeCountGolden}${row.recipeCountMatch ? "" : ` (예측 ${row.recipeCountPredicted})`}`);
  }
  console.log(`\n요약 저장: ${path.relative(PROJECT_ROOT, summaryPath)}`);
  if (!success) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
