#!/usr/bin/env node
/* eslint-disable no-console */
// golden.json 초안의 분량 공백을 Gemini 영상 분석(file_uri)으로 채우고
// 초안에서 빠진 재료를 찾아 보강한다. 텍스트 소스로 명시된 분량은 덮어쓰지 않는다.
//
// 사용법:
//   node scripts/recipe-loop/enrich-golden-visual.mjs <videoId> [...] [--split train] [--model gemini-3.1-flash-lite]

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createCachedLlmClient } from "./lib/llm-client.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const VALID_BASIS = new Set(["spoken", "onscreen", "visual-estimate"]);

function parseCliArgs(argv) {
  const args = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args.positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = nextToken;
    index += 1;
  }
  return args;
}

function parseDotEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;
    env[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return env;
}

async function loadEnv() {
  const merged = {};
  for (const filename of [".env.local", ".env.development.local"]) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(filePath)) continue;
    Object.assign(merged, parseDotEnv(await readFile(filePath, "utf8")));
  }
  return { ...merged, ...process.env };
}

function evidenceToBasis(evidence) {
  if (evidence === "description") return "stated-description";
  if (evidence === "caption") return "stated-caption";
  if (evidence === "comment") return "stated-comment";
  if (evidence === "visual") return "visual-estimate";
  return null;
}

function buildPrompt(golden) {
  const recipeBlocks = golden.recipes.map((recipe, recipeIndex) => {
    const ingredientLines = recipe.ingredients.map((ing, ingredientIndex) => {
      const current = [ing.amount, ing.unit].filter(Boolean).join(" ") || "분량 미상";
      return `  - [${recipeIndex}.${ingredientIndex}] ${ing.name}${ing.groupLabel ? ` (${ing.groupLabel})` : ""}: ${current}`;
    });
    return `레시피 ${recipeIndex}: ${recipe.title}\n${ingredientLines.join("\n")}`;
  });

  return `이 유튜브 요리 영상을 분석하라. 아래는 텍스트 소스(설명란/자막)로 만든 레시피 초안의 재료 목록이다.

${recipeBlocks.join("\n\n")}

해야 할 일:
1. "분량 미상"인 모든 재료의 분량을 추정하라. 우선순위: 영상 속 발화(spoken) > 화면 자막/계량 표시(onscreen) > 화면에 보이는 양으로 비율 추정(visual-estimate). 시각 추정이라도 반드시 값을 제시하라 (예: "약 2", "1/2"). 단위는 한국 가정식 표기(큰술, 작은술, 컵, g, ml, 개, 줌 등).
2. 초안에 빠졌지만 영상에서 실제로 들어가는 재료를 찾아라 (조리 과정에 등장하는 모든 식재료·양념).
3. 초안 재료 중 영상과 명백히 다른 것이 있으면 지적하라.

JSON만 출력:
{
  "ingredientUpdates": [
    { "ref": "0.2", "amount": "2", "unit": "큰술", "basis": "spoken" }
  ],
  "newIngredients": [
    { "recipeIndex": 0, "name": "다진 소고기", "amount": "약 150", "unit": "g", "basis": "visual-estimate", "groupLabel": null, "optional": false }
  ],
  "issues": ["..."]
}
basis는 spoken | onscreen | visual-estimate 중 하나. ingredientUpdates는 "분량 미상" 재료 전부를 다뤄야 한다(정말 판단 불가면 amount를 null로 두고 issues에 이유).`;
}

async function callGemini(env, model, videoId, prompt, timeoutMs) {
  const llm = createCachedLlmClient({
    model,
    noCache: true,
    timeoutMs,
    maxRetries: Number(env.GEMINI_API_MAX_RETRIES ?? 3),
  });
  const result = await llm.generate({
    prompt,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    model,
    maxOutputTokens: 8192,
  });
  return result.json;
}

function applyEnrichment(golden, enrichment) {
  const summary = { filled: 0, added: 0, basisBackfilled: 0, unresolved: 0 };

  for (const recipe of golden.recipes) {
    for (const ing of recipe.ingredients) {
      if (ing.amountBasis === undefined) {
        ing.amountBasis = ing.amount !== null && ing.amount !== undefined ? evidenceToBasis(ing.evidence) : null;
        if (ing.amountBasis) summary.basisBackfilled += 1;
      }
    }
  }

  for (const update of enrichment.ingredientUpdates ?? []) {
    const [recipeIndex, ingredientIndex] = String(update.ref ?? "").split(".").map(Number);
    const ing = golden.recipes[recipeIndex]?.ingredients[ingredientIndex];
    if (!ing) continue;
    if (ing.amount !== null && ing.amount !== undefined) continue;
    if (update.amount === null || update.amount === undefined) {
      summary.unresolved += 1;
      continue;
    }
    ing.amount = String(update.amount);
    ing.unit = update.unit ?? null;
    ing.amountBasis = VALID_BASIS.has(update.basis) ? update.basis : "visual-estimate";
    summary.filled += 1;
  }

  for (const added of enrichment.newIngredients ?? []) {
    const recipe = golden.recipes[added.recipeIndex];
    if (!recipe || typeof added.name !== "string" || !added.name.trim()) continue;
    const exists = recipe.ingredients.some((ing) =>
      ing.name === added.name || (ing.nameAliases ?? []).includes(added.name));
    if (exists) continue;
    recipe.ingredients.push({
      name: added.name.trim(),
      nameAliases: [],
      amount: added.amount !== null && added.amount !== undefined ? String(added.amount) : null,
      unit: added.unit ?? null,
      amountBasis: added.amount !== null && added.amount !== undefined ? (VALID_BASIS.has(added.basis) ? added.basis : "visual-estimate") : null,
      optional: added.optional === true,
      groupLabel: added.groupLabel ?? null,
      evidence: "visual",
    });
    summary.added += 1;
  }

  const issues = (enrichment.issues ?? []).filter((issue) => typeof issue === "string" && issue.trim());
  if (issues.length > 0) {
    golden.graderNotes = [
      ...(golden.graderNotes ?? []),
      ...issues.map((issue) => `[visual-pass] ${issue}`),
    ];
  }

  if (!String(golden.draftedBy ?? "").includes("gemini:visual-quantity")) {
    golden.draftedBy = `${golden.draftedBy} + gemini:visual-quantity`;
  }

  return summary;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "train";
  const env = await loadEnv();
  const model = typeof args.model === "string"
    ? args.model
    : env.YOUTUBE_RECIPE_VISUAL_RECIPE_MODEL || "gemini-3.1-flash-lite";
  const timeoutMs = Number(args.timeout ?? 150000);

  if (args.positional.length === 0) {
    console.error("사용법: node scripts/recipe-loop/enrich-golden-visual.mjs <videoId> [...] [--split train]");
    process.exit(1);
  }

  let failureCount = 0;

  for (const videoId of args.positional) {
    const goldenPath = path.join(PROJECT_ROOT, DATA_ROOT, split, videoId, "golden.json");
    if (!existsSync(goldenPath)) {
      console.error(`[SKIP] golden.json 없음: ${goldenPath}`);
      failureCount += 1;
      continue;
    }

    try {
      const golden = JSON.parse(await readFile(goldenPath, "utf8"));
      const enrichment = await callGemini(env, model, videoId, buildPrompt(golden), timeoutMs);
      await writeFile(
        path.join(PROJECT_ROOT, DATA_ROOT, split, videoId, "visual_enrich_raw.json"),
        `${JSON.stringify(enrichment, null, 2)}\n`,
        "utf8",
      );
      const summary = applyEnrichment(golden, enrichment);
      await writeFile(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, "utf8");
      const remaining = golden.recipes.flatMap((recipe) => recipe.ingredients).filter((ing) => ing.amount === null || ing.amount === undefined).length;
      console.log(`[OK] ${videoId}: 분량 채움 ${summary.filled}, 재료 추가 ${summary.added}, 미해결 ${remaining}, 이슈 ${(enrichment.issues ?? []).length}`);
    } catch (error) {
      failureCount += 1;
      console.error(`[FAIL] ${videoId}: ${error.message}`);
    }
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
