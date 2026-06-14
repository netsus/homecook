#!/usr/bin/env node
/* eslint-disable no-console */
// AI 의미 채점기: result.json(추출) vs golden.json(정답)을 Gemini로 의미 비교.
// 결정적 채점(이름/수치 매칭)이 놓치는 "의미는 맞는데 표기가 다른" 경우를 0~5점으로 평가한다.
// 영상이 아닌 텍스트만 입력하므로 video 쿼터와 무관하고, 캐시되어 동일 입력은 재호출하지 않는다.
//
// case_score = min(ingredient_score, step_score), average_score = 케이스 평균.
//
// 사용법: node scripts/recipe-loop/grade-semantic.mjs --split train --out-tag baseline [--ids ...]

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createCachedLlmClient } from "./lib/llm-client.mjs";

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

function toInt(value) {
  if (value === null || value === undefined || value === true) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function compactRecipe(recipe) {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map((i) => [i.name, [i.amount, i.unit].filter(Boolean).join(" ")].filter(Boolean).join(": ")),
    steps: recipe.steps.map((s) => (typeof s === "string" ? s : s.instruction)),
  };
}

function buildPrompt(golden, result) {
  return `너는 레시피 추출 품질을 평가하는 채점자다. 정답(golden)과 추출 결과(predicted)를 의미 기준으로 비교하라.
글자가 완전히 같지 않아도 같은 재료·같은 동작을 의미하면 맞는 것으로 본다. 분량은 합리적 근사면 인정한다.

각 정답 레시피마다 가장 잘 대응되는 추출 레시피를 찾아 채점하라:
- ingredient_score(0~5): 정답 재료가 빠짐없이/정확히 추출됐는지(누락·오검출·분량오류 감점)
- step_score(0~5): 정답 만들기의 핵심 동작·순서·조리설정이 담겼는지
- case_score = min(ingredient_score, step_score)

정답(golden):
${JSON.stringify(golden.recipes.map(compactRecipe), null, 1)}

추출 결과(predicted):
${JSON.stringify((result.recipes ?? []).map(compactRecipe), null, 1)}

JSON만 출력:
{"cases":[{"title":"정답 레시피명","ingredient_score":0,"step_score":0,"case_score":0,"reason":"짧은 근거"}],"average_score":0}`;
}

function normalize(parsed) {
  const cases = (parsed.cases ?? []).map((c) => {
    const ing = Math.max(0, Math.min(5, Number(c.ingredient_score ?? 0)));
    const step = Math.max(0, Math.min(5, Number(c.step_score ?? 0)));
    return { title: c.title, ingredient_score: ing, step_score: step, case_score: Math.min(ing, step), reason: c.reason ?? "" };
  });
  const avg = cases.length ? cases.reduce((a, c) => a + c.case_score, 0) / cases.length : 0;
  return { cases, average_score: Math.round(avg * 1000) / 1000 };
}

function failedRow(id, reason, message = null) {
  return {
    videoId: id,
    success: false,
    failureReason: reason,
    cases: [],
    average_score: 0,
    ...(message ? { error: message } : {}),
  };
}

function classifyError(error) {
  if (error instanceof SyntaxError) return "parse_error";
  const message = String(error?.message ?? error ?? "");
  if (/JSON|parse/i.test(message)) return "parse_error";
  return "provider_error";
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const model = typeof args.model === "string" ? args.model : "gemini-2.5-flash";
  const expectedCountArg = toInt(args["expected-count"]);
  const splitDir = path.join(PROJECT_ROOT, DATA_ROOT, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const llm = createCachedLlmClient({ model });
  const rows = [];

  for (const id of ids) {
    const resultPath = path.join(splitDir, id, "runs", outTag, "result.json");
    const goldenPath = path.join(splitDir, id, "golden.json");
    const hasResult = existsSync(resultPath);
    const hasGolden = existsSync(goldenPath);
    if (!hasResult || !hasGolden) {
      const reason = !hasResult && !hasGolden ? "missing_result_and_golden" : (!hasResult ? "missing_result" : "missing_golden");
      console.error(`[FAIL] ${split}/${id}: ${reason}`);
      rows.push(failedRow(id, reason));
      continue;
    }
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const golden = JSON.parse(await readFile(goldenPath, "utf8"));
    if (golden.reviewStatus !== "approved") {
      console.error(`[FAIL] ${split}/${id}: unapproved_golden`);
      rows.push(failedRow(id, "unapproved_golden"));
      continue;
    }
    try {
      const { json } = await llm.generate({ prompt: buildPrompt(golden, result), cacheText: id + outTag });
      const grade = normalize(json);
      if (grade.cases.length === 0) {
        rows.push(failedRow(id, "empty_case"));
        console.error(`[FAIL] ${split}/${id}: empty_case`);
        continue;
      }
      rows.push({ videoId: id, success: true, ...grade });
      await writeFile(path.join(splitDir, id, "runs", outTag, "grade_semantic.json"), JSON.stringify({ videoId: id, ...grade }, null, 2) + "\n", "utf8");
      const minCase = grade.cases.length ? Math.min(...grade.cases.map((c) => c.case_score)) : 0;
      console.log(`[OK] ${split}/${id}: avg ${grade.average_score}, min case ${minCase}`);
    } catch (error) {
      const reason = classifyError(error);
      console.error(`[FAIL] ${split}/${id}: ${error.message}`);
      rows.push(failedRow(id, reason, error.message));
    }
  }

  const caseScores = rows.flatMap((r) => r.cases.map((c) => c.case_score));
  const expectedCount = expectedCountArg ?? ids.length;
  const providerErrorCount = rows.filter((r) => r.failureReason === "provider_error").length;
  const parseErrorCount = rows.filter((r) => r.failureReason === "parse_error").length;
  const emptyCaseCount = rows.filter((r) => r.failureReason === "empty_case").length;
  const expectedCountMismatch = rows.length !== expectedCount;
  const failedRowCount = rows.filter((r) => r.success === false).length;
  const success = failedRowCount === 0 && !expectedCountMismatch;
  const agg = {
    success,
    split, outTag, count: rows.length,
    expected_count: expectedCount,
    actual_count: rows.length,
    provider_error_count: providerErrorCount,
    parse_error_count: parseErrorCount,
    empty_case_count: emptyCaseCount,
    expected_count_mismatch: expectedCountMismatch,
    failed_row_count: failedRowCount,
    averageScore: caseScores.length ? Math.round((caseScores.reduce((a, b) => a + b, 0) / caseScores.length) * 1000) / 1000 : 0,
    minCaseScore: caseScores.length ? Math.min(...caseScores) : 0,
  };
  await writeFile(path.join(splitDir, `_semantic_summary.${outTag}.json`), JSON.stringify({ aggregate: agg, perVideo: rows }, null, 2) + "\n", "utf8");
  console.log(`\n=== ${split}/${outTag} 의미채점: 평균 ${agg.averageScore}, 최저 case ${agg.minCaseScore} (n=${agg.count})`);
  if (!success) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
