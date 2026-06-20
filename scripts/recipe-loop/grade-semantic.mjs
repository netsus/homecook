#!/usr/bin/env node
/* eslint-disable no-console */
// AI 의미 채점기: result.json(추출) vs golden.json(정답)을 의미 기준으로 비교한다.
// 기본 gate는 Codex judge를 사용한다. Gemini는 historical/reference 실행용으로만 남긴다.
//
// case_score = min(ingredient_score, step_score), average_score = 케이스 평균.
//
// 사용법: node scripts/recipe-loop/grade-semantic.mjs --split train --out-tag latest [--ids ...]

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createCodexJudgeClient } from "./lib/codex-judge-client.mjs";
import { createCachedLlmClient } from "./lib/llm-client.mjs";
import { prepareCanaryGradingInputs, summarizeCanaryLeaks } from "./lib/grading.mjs";
import { summarizeReasonFrequencies } from "./lib/semantic-feedback-aggregator.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const DEFAULT_CALIBRATION_PATH = path.join(DATA_ROOT, "semantic_calibration.json");
const DEFAULT_SCHEMA_PATH = path.join(PROJECT_ROOT, "scripts/recipe-loop/semantic-judge.schema.json");
const JUDGE_PROMPT_VERSION = "semantic-judge-v3-anchored";
const DEFAULT_SCORE_POLICY = "bottomK-mean";
const DEFAULT_BOTTOM_K = 2;
const DEFAULT_SAMPLE_N = 3;
const DEFAULT_THRESHOLDS = { bottomKMeanScore: 2, averageScore: 3.5, minCaseScore: 2 };
const DEFAULT_BORDERLINE = { enabled: false, finalScorePolicy: "median_of_N" };
const CODEX_MIN_CALIBRATION_SAMPLES = 5;

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

function toPositiveInt(value, fallback) {
  if (value === null || value === undefined || value === true) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function median(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const middle = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[middle];
  return (nums[middle - 1] + nums[middle]) / 2;
}

function bottomKMean(values, k) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const picked = nums.slice(0, Math.max(1, Math.min(k, nums.length)));
  return round3(picked.reduce((a, b) => a + b, 0) / picked.length);
}

function resolveProjectPath(value) {
  if (!value || value === true) return null;
  return path.isAbsolute(String(value)) ? String(value) : path.join(PROJECT_ROOT, String(value));
}

function calibrationFailure(reason, loaded, source, parsed = {}) {
  return {
    valid: false,
    failure_reason: reason,
    loaded,
    source,
    sample_count: Array.isArray(parsed.samples) ? parsed.samples.length : 0,
    policy: parsed.policy ?? (loaded ? "calibration invalid" : "calibration file not found"),
    calibrated_at: parsed.calibratedAt ?? null,
  };
}

function validateCodexCalibration(parsed, source, judge) {
  if (Number(parsed.schemaVersion ?? 0) < 3) {
    return calibrationFailure("schema_version_mismatch", true, source, parsed);
  }
  if (parsed.judgeProvider !== "codex") {
    return calibrationFailure("judge_provider_mismatch", true, source, parsed);
  }
  if (parsed.judgeModel !== judge.model) {
    return calibrationFailure("judge_model_mismatch", true, source, parsed);
  }
  if (parsed.judgeEffort !== judge.effort) {
    return calibrationFailure("judge_effort_mismatch", true, source, parsed);
  }
  if (parsed.judgePromptVersion !== judge.promptVersion) {
    return calibrationFailure("judge_prompt_version_mismatch", true, source, parsed);
  }
  if (parsed.scorePolicy !== judge.scorePolicy) {
    return calibrationFailure("score_policy_mismatch", true, source, parsed);
  }
  if (Number(parsed.k) !== judge.bottomK) {
    return calibrationFailure("bottom_k_mismatch", true, source, parsed);
  }
  if (Number(parsed.sampleN) !== judge.sampleN) {
    return calibrationFailure("sample_n_mismatch", true, source, parsed);
  }
  if (!Number.isFinite(Number(parsed.thresholds?.averageScore))
    || !Number.isFinite(Number(parsed.thresholds?.bottomKMeanScore))) {
    return calibrationFailure("thresholds_missing", true, source, parsed);
  }
  const sampleCount = Array.isArray(parsed.samples) ? parsed.samples.length : 0;
  const alignmentStats = parsed.alignmentStats && typeof parsed.alignmentStats === "object"
    ? parsed.alignmentStats
    : null;
  const alignmentSampleCount = Number(alignmentStats?.sampleCount ?? sampleCount);
  if (Math.max(sampleCount, alignmentSampleCount) < CODEX_MIN_CALIBRATION_SAMPLES) {
    return calibrationFailure("insufficient_samples", true, source, parsed);
  }
  const meanAbsoluteDelta = Number(alignmentStats?.meanAbsoluteDelta);
  const maxMeanAbsoluteDelta = Number(alignmentStats?.maxMeanAbsoluteDelta ?? 1);
  if (!Number.isFinite(meanAbsoluteDelta) || meanAbsoluteDelta > maxMeanAbsoluteDelta) {
    return calibrationFailure("alignment_delta_out_of_range", true, source, parsed);
  }
  const directionDisagreementCount = Number(alignmentStats?.directionDisagreementCount ?? 0);
  const maxDirectionDisagreementCount = Number(alignmentStats?.maxDirectionDisagreementCount ?? 0);
  if (directionDisagreementCount > maxDirectionDisagreementCount) {
    return calibrationFailure("alignment_direction_out_of_range", true, source, parsed);
  }
  if (!parsed.borderline || typeof parsed.borderline !== "object") {
    return calibrationFailure("borderline_missing", true, source, parsed);
  }
  if (parsed.borderline.finalScorePolicy !== "median_of_N") {
    return calibrationFailure("final_score_policy_mismatch", true, source, parsed);
  }
  return {
    valid: true,
    failure_reason: null,
    loaded: true,
    source,
    sample_count: sampleCount,
    policy: parsed.policy ?? "codex semantic judge calibration",
    calibrated_at: parsed.calibratedAt ?? null,
    judge_provider: parsed.judgeProvider,
    judge_model: parsed.judgeModel,
    judge_effort: parsed.judgeEffort,
    judge_prompt_version: parsed.judgePromptVersion,
    score_policy: parsed.scorePolicy,
    bottom_k: parsed.k,
    sampleN: parsed.sampleN,
    alignment_stats: alignmentStats,
  };
}

async function loadCalibration(filePath, judge) {
  const rawSource = filePath ?? DEFAULT_CALIBRATION_PATH;
  const resolved = resolveProjectPath(rawSource);
  if (!resolved || !existsSync(resolved)) {
    const summary = calibrationFailure("missing_calibration", false, rawSource, {});
    return {
      source: rawSource,
      thresholds: DEFAULT_THRESHOLDS,
      borderline: DEFAULT_BORDERLINE,
      summary,
      scorePolicy: DEFAULT_SCORE_POLICY,
      bottomK: judge.bottomK ?? DEFAULT_BOTTOM_K,
      sampleN: judge.sampleN ?? DEFAULT_SAMPLE_N,
    };
  }
  const parsed = JSON.parse(await readFile(resolved, "utf8"));
  const source = path.relative(PROJECT_ROOT, resolved);
  const scorePolicy = typeof parsed.scorePolicy === "string"
    ? parsed.scorePolicy
    : (parsed.thresholds?.bottomKMeanScore !== undefined ? DEFAULT_SCORE_POLICY : "minCase");
  const bottomK = toPositiveInt(parsed.k, DEFAULT_BOTTOM_K);
  const sampleN = toPositiveInt(parsed.sampleN, judge.sampleN ?? DEFAULT_SAMPLE_N);
  const thresholds = {
    bottomKMeanScore: Number(
      parsed.thresholds?.bottomKMeanScore
      ?? parsed.thresholds?.minCaseScore
      ?? DEFAULT_THRESHOLDS.bottomKMeanScore,
    ),
    minCaseScore: Number(
      parsed.thresholds?.minCaseScore
      ?? parsed.thresholds?.bottomKMeanScore
      ?? DEFAULT_THRESHOLDS.minCaseScore,
    ),
    averageScore: Number(parsed.thresholds?.averageScore ?? DEFAULT_THRESHOLDS.averageScore),
  };
  const borderline = {
    enabled: Boolean(parsed.borderline?.enabled),
    finalScorePolicy: typeof parsed.borderline?.finalScorePolicy === "string"
      ? parsed.borderline.finalScorePolicy
      : DEFAULT_BORDERLINE.finalScorePolicy,
  };
  const summary = judge.provider === "codex"
    ? validateCodexCalibration(parsed, source, judge)
    : {
      source,
      loaded: true,
      valid: true,
      failure_reason: null,
      sample_count: Array.isArray(parsed.samples) ? parsed.samples.length : 0,
      policy: parsed.policy ?? "spot-check calibration",
      calibrated_at: parsed.calibratedAt ?? null,
    };
  return { source, thresholds, borderline, summary, scorePolicy, bottomK, sampleN };
}

function resolveJudgeConfig(args) {
  const provider = typeof args["judge-provider"] === "string" ? args["judge-provider"] : "codex";
  const model = typeof args["judge-model"] === "string"
    ? args["judge-model"]
    : (provider === "codex" ? "gpt-5.4" : (typeof args.model === "string" ? args.model : "gemini-2.5-flash"));
  const effort = typeof args["judge-effort"] === "string" ? args["judge-effort"] : (provider === "codex" ? "high" : null);
  const borderlineEffort = typeof args["judge-borderline-effort"] === "string" ? args["judge-borderline-effort"] : "xhigh";
  const timeoutMs = toNumber(args["judge-timeout-ms"], 200000);
  const schemaPath = resolveProjectPath(args["judge-output-schema"]) ?? DEFAULT_SCHEMA_PATH;
  const sampleN = toPositiveInt(args["judge-sample-n"], DEFAULT_SAMPLE_N);
  const bottomK = toPositiveInt(args["semantic-bottom-k"] ?? args["bottom-k"], DEFAULT_BOTTOM_K);
  const promptVersion = typeof args["judge-prompt-version"] === "string"
    ? args["judge-prompt-version"]
    : JUDGE_PROMPT_VERSION;
  const scorePolicy = typeof args["score-policy"] === "string" ? args["score-policy"] : DEFAULT_SCORE_POLICY;
  if (!["gemini", "fixture", "codex"].includes(provider)) {
    throw new Error(`unsupported semantic judge provider: ${provider}`);
  }
  return { provider, model, effort, borderlineEffort, timeoutMs, schemaPath, sampleN, bottomK, promptVersion, scorePolicy };
}

function compactRecipe(recipe) {
  return {
    title: recipe.title,
    ingredients: (recipe.ingredients ?? []).map((i) => [i.name, [i.amount, i.unit].filter(Boolean).join(" ")].filter(Boolean).join(": ")),
    steps: (recipe.steps ?? []).map((s) => (typeof s === "string" ? s : s.instruction)),
  };
}

function promptInput(golden, result) {
  return {
    golden: golden.recipes.map(compactRecipe),
    predicted: (result.recipes ?? []).map(compactRecipe),
  };
}

function buildPrompt(golden, result, split) {
  const input = promptInput(golden, result);
  const protectedSplitInstruction = split === "validation" || split === "holdout"
    ? "\n- 이 split은 보호 split이다. reason에 구체 재료명·구체 분량·정답 문장을 절대 쓰지 말고 양념류/채소류/분량/단계순서 같은 범주로만 쓴다."
    : "\n- 이 split은 train/public이다. reason에 필요한 구체 문제를 짧게 쓸 수 있다.";
  return `너는 레시피 추출 품질을 평가하는 채점자다. 정답(golden)과 추출 결과(predicted)를 의미 기준으로 비교하라.
글자가 완전히 같지 않아도 같은 재료·같은 동작을 의미하면 맞는 것으로 본다. 분량은 합리적 근사면 인정한다.

각 정답 레시피마다 가장 잘 대응되는 추출 레시피를 찾아 채점하라:
- ingredient_score(0~5): 정답 재료가 빠짐없이/정확히 추출됐는지(누락·오검출·분량오류 감점)
- step_score(0~5): 정답 만들기의 핵심 동작·순서·조리설정이 담겼는지
- case_score = min(ingredient_score, step_score)

점수 앵커:
- 5 = 핵심 재료·동작 누락 0, 분량이 합리적이다.
- 4 = 경미한 누락 또는 근사오차 1개 정도다.
- 3 = 핵심 1개 누락 또는 분량 다수 오차가 있다.
- 2 = 핵심 누락이 여러 개다.
- 0~1 = 거의 무관하거나 심각하게 틀렸다.

채점 순서:
- 먼저 누락·오검출·분량오류·핵심 동작/순서 문제를 따져본 뒤 점수를 정한다.
- 단계가 더 잘게 쪼개졌거나 장황하다는 이유만으로 가점하지 않는다.

출력 제한:
- JSON만 출력한다.
- 정답 원문 문장을 그대로 인용하지 않는다.
- reason은 80자 안팎의 짧은 추상 근거로 쓴다.
${protectedSplitInstruction}

입력:
${JSON.stringify(input, null, 1)}`;
}

function validatePayload(parsed) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cases)) {
    throw new Error("semantic judge schema error: cases array missing");
  }
  if (parsed.cases.length === 0) {
    return parsed;
  }
  for (const c of parsed.cases) {
    if (!c || typeof c !== "object") {
      throw new Error("semantic judge schema error: case must be object");
    }
    for (const field of ["ingredient_score", "step_score"]) {
      const score = Number(c[field]);
      if (!Number.isFinite(score) || score < 0 || score > 5) {
        throw new Error(`semantic judge schema error: ${field} out of range`);
      }
    }
  }
  return parsed;
}

function normalize(parsed) {
  validatePayload(parsed);
  const cases = (parsed.cases ?? []).map((c) => {
    const ing = Math.max(0, Math.min(5, Number(c.ingredient_score ?? 0)));
    const step = Math.max(0, Math.min(5, Number(c.step_score ?? 0)));
    return {
      title: c.title,
      ingredient_score: ing,
      step_score: step,
      case_score: Math.min(ing, step),
      reason: c.reason ?? "",
    };
  });
  const avg = cases.length ? cases.reduce((a, c) => a + c.case_score, 0) / cases.length : 0;
  return { cases, average_score: Math.round(avg * 1000) / 1000 };
}

function combineSampleGrades(sampleGrades, sampleN) {
  if (sampleGrades.length === 0) return { cases: [], average_score: 0 };
  const expectedCaseCount = sampleGrades[0].cases.length;
  for (const grade of sampleGrades) {
    if (grade.cases.length !== expectedCaseCount) {
      throw new Error("semantic judge schema error: sample case count mismatch");
    }
  }
  const cases = sampleGrades[0].cases.map((baseCase, index) => {
    const sampleCases = sampleGrades.map((grade) => grade.cases[index]);
    const ingredientScores = sampleCases.map((sample) => sample.ingredient_score);
    const stepScores = sampleCases.map((sample) => sample.step_score);
    const caseScores = sampleCases.map((sample) => sample.case_score);
    const sampleReasons = sampleCases.map((sample) => String(sample.reason ?? ""));
    const caseScore = round3(median(caseScores));
    return {
      title: baseCase.title,
      ingredient_score: round3(median(ingredientScores)),
      step_score: round3(median(stepScores)),
      case_score: caseScore,
      reason: sampleReasons.find(Boolean) ?? "",
      sample_case_scores: caseScores,
      sample_reasons: sampleReasons,
      judge_sample_count: sampleCases.length,
      reason_summary: summarizeReasonFrequencies({ reasons: sampleReasons, sampleN }),
    };
  });
  const avg = cases.length ? cases.reduce((a, c) => a + c.case_score, 0) / cases.length : 0;
  return { cases, average_score: round3(avg) };
}

async function generateSemanticGrade({ judge, llm, golden, result, id, outTag, split }) {
  if (judge.provider === "fixture") {
    const fixtureSamples = Array.isArray(result.__semanticJudgeSamples)
      ? result.__semanticJudgeSamples
      : (result.__semanticJudge ? [result.__semanticJudge] : []);
    if (fixtureSamples.length === 0) {
      throw new Error("fixture semantic judge requires result.__semanticJudge");
    }
    const sampleGrades = fixtureSamples.map((sample) => normalize(sample));
    return {
      grade: sampleGrades.length > 1 ? combineSampleGrades(sampleGrades, sampleGrades.length) : sampleGrades[0],
      cached: true,
      model: "fixture",
      effort: null,
      cacheHits: sampleGrades.length,
      cacheMisses: 0,
      retryCount: 0,
    };
  }

  const prompt = buildPrompt(golden, result, split);
  if (judge.provider === "codex") {
    const inputText = JSON.stringify(promptInput(golden, result));
    const client = createCodexJudgeClient({
      model: judge.model,
      effort: judge.effort,
      timeoutMs: judge.timeoutMs,
      schemaPath: judge.schemaPath,
    });
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < judge.sampleN; sampleIndex += 1) {
      samples.push(await client.generate({
        prompt,
        inputText,
        split,
        id,
        outTag,
        schemaVersion: 1,
        promptVersion: judge.promptVersion,
        sampleIndex,
        sampleN: judge.sampleN,
      }));
    }
    const sampleGrades = samples.map((sample) => normalize(sample.json));
    return {
      grade: combineSampleGrades(sampleGrades, judge.sampleN),
      cached: samples.every((sample) => sample.cached),
      model: samples[0]?.model ?? judge.model,
      effort: samples[0]?.effort ?? judge.effort,
      cacheHits: samples.filter((sample) => sample.cached).length,
      cacheMisses: samples.filter((sample) => !sample.cached).length,
      retryCount: 0,
    };
  }

  const { json, cached, model } = await llm.generate({ prompt, cacheText: id + outTag });
  return {
    grade: normalize(json),
    cached,
    model,
    effort: null,
    cacheHits: cached ? 1 : 0,
    cacheMisses: cached ? 0 : 1,
    retryCount: 0,
  };
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
  if (/schema error/i.test(message)) return "schema_error";
  if (/JSON|parse/i.test(message)) return "parse_error";
  if (/timeout/i.test(message)) return "timeout_error";
  return "provider_error";
}

async function writeSummary(splitDir, outTag, aggregate, rows) {
  await mkdir(splitDir, { recursive: true });
  await writeFile(
    path.join(splitDir, `_semantic_summary.${outTag}.json`),
    JSON.stringify({ aggregate, perVideo: rows }, null, 2) + "\n",
    "utf8",
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const resultOutTag = typeof args["result-out-tag"] === "string" ? args["result-out-tag"] : outTag;
  const expectedCountArg = toInt(args["expected-count"]);
  const judge = resolveJudgeConfig(args);
  const calibration = await loadCalibration(args.calibration ?? DEFAULT_CALIBRATION_PATH, judge);
  const splitDir = path.join(PROJECT_ROOT, DATA_ROOT, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const llm = judge.provider === "gemini" ? createCachedLlmClient({ model: judge.model }) : null;
  const rows = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let borderlineRetryCount = 0;

  for (const id of ids) {
    const resultPath = path.join(splitDir, id, "runs", resultOutTag, "result.json");
    const outputDir = path.join(splitDir, id, "runs", outTag);
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
    const resultScope = `${split}/${id}/runs/${resultOutTag}/result.json`;
    const { cleanGolden, cleanResult, canaryLeak } = prepareCanaryGradingInputs({
      split,
      videoId: id,
      golden,
      result,
      resultScope,
    });
    if (judge.provider === "codex" && calibration.summary.valid !== true) {
      const message = calibration.summary.failure_reason || "invalid calibration";
      console.error(`[FAIL] ${split}/${id}: calibration_invalid (${message})`);
      rows.push({ ...failedRow(id, "calibration_invalid", message), canaryLeak });
      continue;
    }
    try {
      const gradeResult = await generateSemanticGrade({
        judge,
        llm,
        golden: cleanGolden,
        result: cleanResult,
        id,
        outTag,
        split,
      });
      const { grade } = gradeResult;
      if (grade.cases.length === 0) {
        rows.push(failedRow(id, "empty_case"));
        console.error(`[FAIL] ${split}/${id}: empty_case`);
        continue;
      }
      cacheHitCount += gradeResult.cacheHits ?? (gradeResult.cached ? 1 : 0);
      cacheMissCount += gradeResult.cacheMisses ?? (gradeResult.cached ? 0 : 1);
      borderlineRetryCount += gradeResult.retryCount ?? 0;
      const row = {
        videoId: id,
        success: true,
        judge_provider: judge.provider,
        judge_model: gradeResult.model,
        judge_effort: gradeResult.effort,
        cached: gradeResult.cached,
        retry_count: gradeResult.retryCount ?? 0,
        sampleN: judge.provider === "codex" ? judge.sampleN : (grade.cases[0]?.judge_sample_count ?? 1),
        score_policy: calibration.scorePolicy,
        ...grade,
        canaryLeak,
      };
      rows.push(row);
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, "grade_semantic.json"), JSON.stringify(row, null, 2) + "\n", "utf8");
      const minCase = grade.cases.length ? Math.min(...grade.cases.map((c) => c.case_score)) : 0;
      console.log(`[OK] ${split}/${id}: avg ${grade.average_score}, min case ${minCase}`);
    } catch (error) {
      const reason = classifyError(error);
      console.error(`[FAIL] ${split}/${id}: ${error.message}`);
      rows.push(failedRow(id, reason, error.message));
    }
  }

  const caseScores = rows.flatMap((r) => r.cases.map((c) => c.case_score));
  const rowSampleNs = rows.filter((r) => r.success === true).map((r) => Number(r.sampleN || 1)).filter(Number.isFinite);
  const effectiveSampleN = judge.provider === "codex"
    ? judge.sampleN
    : (rowSampleNs.length ? Math.max(...rowSampleNs) : calibration.sampleN);
  const expectedCount = expectedCountArg ?? ids.length;
  const providerErrorCount = rows.filter((r) => r.failureReason === "provider_error").length;
  const parseErrorCount = rows.filter((r) => r.failureReason === "parse_error").length;
  const schemaErrorCount = rows.filter((r) => r.failureReason === "schema_error").length;
  const timeoutErrorCount = rows.filter((r) => r.failureReason === "timeout_error").length;
  const calibrationErrorCount = rows.filter((r) => r.failureReason === "calibration_invalid").length;
  const emptyCaseCount = rows.filter((r) => r.failureReason === "empty_case").length;
  const expectedCountMismatch = rows.length !== expectedCount;
  const failedRowCount = rows.filter((r) => r.success === false).length;
  const averageScore = caseScores.length ? round3(caseScores.reduce((a, b) => a + b, 0) / caseScores.length) : 0;
  const minCaseScore = caseScores.length ? Math.min(...caseScores) : 0;
  const bottomKMeanScore = bottomKMean(caseScores, calibration.bottomK);
  const thresholdSuccess = calibration.scorePolicy === "bottomK-mean"
    ? averageScore >= calibration.thresholds.averageScore
      && bottomKMeanScore >= calibration.thresholds.bottomKMeanScore
    : averageScore >= calibration.thresholds.averageScore
      && minCaseScore >= calibration.thresholds.minCaseScore;
  const executionSuccess = providerErrorCount === 0
    && parseErrorCount === 0
    && schemaErrorCount === 0
    && timeoutErrorCount === 0
    && calibrationErrorCount === 0
    && failedRowCount === 0
    && !expectedCountMismatch;
  const success = failedRowCount === 0 && !expectedCountMismatch && thresholdSuccess;
  const canaryLeak = summarizeCanaryLeaks({ split, ids, rows });
  const agg = {
    success,
    split,
    outTag,
    resultOutTag,
    count: rows.length,
    judge_provider: judge.provider,
    judge_model: judge.model,
    judge_effort: judge.effort,
    judge_borderline_effort: judge.borderlineEffort,
    judge_prompt_version: judge.promptVersion,
    score_policy: calibration.scorePolicy,
    bottom_k: calibration.bottomK,
    sampleN: effectiveSampleN,
    expected_count: expectedCount,
    actual_count: rows.length,
    provider_error_count: providerErrorCount,
    parse_error_count: parseErrorCount,
    schema_error_count: schemaErrorCount,
    timeout_error_count: timeoutErrorCount,
    calibration_error_count: calibrationErrorCount,
    empty_case_count: emptyCaseCount,
    expected_count_mismatch: expectedCountMismatch,
    failed_row_count: failedRowCount,
    cache_hit_count: cacheHitCount,
    cache_miss_count: cacheMissCount,
    borderline_retry_count: borderlineRetryCount,
    averageScore,
    minCaseScore,
    bottomKMeanScore,
    thresholds: calibration.thresholds,
    borderline: calibration.borderline,
    threshold_success: thresholdSuccess,
    calibration: calibration.summary,
    canaryLeak,
  };
  await writeSummary(splitDir, outTag, agg, rows);
  console.log(`\n=== ${split}/${outTag} 의미채점: 평균 ${agg.averageScore}, 하위${agg.bottom_k}평균 ${agg.bottomKMeanScore}, 최저 case ${agg.minCaseScore} (n=${agg.count})`);
  if (!executionSuccess) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
