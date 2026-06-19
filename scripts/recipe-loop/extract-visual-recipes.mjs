#!/usr/bin/env node
/* eslint-disable no-console */
// 텍스트 소스가 빈약한 영상의 golden.json을 Gemini 영상 분석(file_uri)으로 보강한다.
// --mode full  : 영상에서 요리 전체(재료+단계)를 추출해 recipes를 재구성 (텍스트 확정 항목은 이름 매칭으로 보존)
// --mode steps : 기존 recipes의 단계만 시각 추출로 교체하고, 재료는 분량 채움/누락 추가만 수행
//
// 사용법:
//   node scripts/recipe-loop/extract-visual-recipes.mjs <videoId> --split validation --mode full [--hint "..."]

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

const norm = (value) => value.replace(/\s+/g, "").toLowerCase();

function toIngredient(v) {
  return {
    name: String(v.name ?? "").trim(),
    nameAliases: [],
    amount: v.amount !== null && v.amount !== undefined ? String(v.amount) : null,
    unit: v.unit && v.unit !== "없음" ? v.unit : null,
    amountBasis: v.amount !== null && v.amount !== undefined ? (VALID_BASIS.has(v.basis) ? v.basis : "visual-estimate") : null,
    optional: v.optional === true,
    groupLabel: v.groupLabel ?? null,
    evidence: "visual",
  };
}

const toSteps = (steps) => steps
  .filter((s) => typeof s === "string" && s.trim())
  .map((instruction, i) => ({ order: i + 1, instruction: instruction.trim(), evidence: "visual" }));

function buildPrompt(golden, mode, hint) {
  const titles = golden.recipes.map((r) => r.title).filter(Boolean);
  const intro = mode === "full"
    ? `이 요리 영상을 처음부터 끝까지 분석해, 실제 조리 과정을 보여주는 요리를 전부 찾아라.
시판품을 활용해도 조리 동작(손질·양념·가열·조립)이 있으면 포함한다. 시식·외식·재탕 언급만 있는 것은 제외.
${titles.length > 0 ? `참고로 텍스트 소스에서 추정한 요리 후보: ${titles.join(", ")}. 실제 영상 기준으로 확정하라(추가·제외 가능).` : ""}`
    : `이 요리 영상을 분석하라. 다음 요리의 조리 단계를 영상 기준으로 정확하게 추출하라: ${titles.join(", ")}.`;

  return `${intro}
${hint ? `\n추가 힌트: ${hint}\n` : ""}
각 요리에 대해:
1. ingredients: 조리에 등장하는 모든 식재료·양념. 분량은 발화(spoken) > 화면 자막/계량 표시(onscreen) > 시각 추정(visual-estimate) 순으로 추정해 반드시 값을 제시 (단위: 큰술, 작은술, 컵, g, ml, 개, 줌 등).
2. steps: 조리 동작을 빠짐없이 명령형 한국어 한 문장씩. 조리기구 설정(오븐/에어프라이어 온도·시간), 불 세기, 시간, 상태 판단 기준이 보이면 반드시 포함. 요리당 4~12단계.

JSON만 출력:
{"dishes":[{"title":"요리명","ingredients":[{"name":"...","amount":"...","unit":"...","basis":"spoken|onscreen|visual-estimate"}],"steps":["..."]}]}`;
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
    maxOutputTokens: 16384,
  });
  return Array.isArray(result.json) ? result.json[0] : result.json;
}

function mergeIngredients(recipe, visualIngredients) {
  let filled = 0;
  let added = 0;
  for (const v of visualIngredients) {
    const vName = norm(String(v.name ?? ""));
    if (!vName) continue;
    const existing = recipe.ingredients.find((ing) =>
      norm(ing.name) === vName || norm(ing.name).includes(vName) || vName.includes(norm(ing.name)) ||
      (ing.nameAliases ?? []).some((alias) => norm(alias) === vName));
    if (existing) {
      if ((existing.amount === null || existing.amount === undefined) && v.amount !== null && v.amount !== undefined) {
        existing.amount = String(v.amount);
        existing.unit = v.unit && v.unit !== "없음" ? v.unit : null;
        existing.amountBasis = VALID_BASIS.has(v.basis) ? v.basis : "visual-estimate";
        filled += 1;
      }
    } else {
      recipe.ingredients.push(toIngredient(v));
      added += 1;
    }
  }
  return { filled, added };
}

function mergeFull(golden, dishes) {
  const previousRecipes = golden.recipes;
  golden.recipes = dishes.map((dish) => {
    const matched = previousRecipes.find((recipe) =>
      norm(recipe.title).includes(norm(dish.title)) || norm(dish.title).includes(norm(recipe.title)));
    const recipe = {
      title: dish.title,
      servings: matched?.servings ?? null,
      ingredients: matched ? [...matched.ingredients] : [],
      steps: [],
    };
    mergeIngredients(recipe, dish.ingredients ?? []);
    recipe.steps = toSteps(dish.steps ?? []);
    return recipe;
  });
  const dropped = previousRecipes
    .filter((recipe) => recipe.ingredients.length + recipe.steps.length > 0)
    .filter((recipe) => !golden.recipes.some((r) =>
      norm(r.title).includes(norm(recipe.title)) || norm(recipe.title).includes(norm(r.title))))
    .map((recipe) => recipe.title);
  return { dropped };
}

function mergeSteps(golden, dishes) {
  const summary = [];
  for (const dish of dishes) {
    const recipe = golden.recipes.find((r) =>
      norm(r.title).includes(norm(dish.title)) || norm(dish.title).includes(norm(r.title)));
    if (!recipe) {
      summary.push(`미매칭: ${dish.title}`);
      continue;
    }
    const { filled, added } = mergeIngredients(recipe, dish.ingredients ?? []);
    const visualSteps = toSteps(dish.steps ?? []);
    if (visualSteps.length >= recipe.steps.length) {
      recipe.steps = visualSteps;
    }
    summary.push(`${recipe.title}: 단계 ${recipe.steps.length}, 분량채움 ${filled}, 재료추가 ${added}`);
  }
  return summary;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "validation";
  const mode = args.mode === "steps" ? "steps" : "full";
  const hint = typeof args.hint === "string" ? args.hint : null;
  const env = await loadEnv();
  const model = typeof args.model === "string"
    ? args.model
    : env.YOUTUBE_RECIPE_VISUAL_RECIPE_MODEL || "gemini-3.1-flash-lite";
  const timeoutMs = Number(args.timeout ?? 200000);

  if (args.positional.length === 0) {
    console.error("사용법: node scripts/recipe-loop/extract-visual-recipes.mjs <videoId> [...] --split validation --mode full|steps");
    process.exit(1);
  }

  let failureCount = 0;

  for (const videoId of args.positional) {
    const dir = path.join(PROJECT_ROOT, DATA_ROOT, split, videoId);
    const goldenPath = path.join(dir, "golden.json");
    if (!existsSync(goldenPath)) {
      console.error(`[SKIP] golden.json 없음: ${goldenPath}`);
      failureCount += 1;
      continue;
    }

    try {
      const golden = JSON.parse(await readFile(goldenPath, "utf8"));
      const result = await callGemini(env, model, videoId, buildPrompt(golden, mode, hint), timeoutMs);
      await writeFile(path.join(dir, "visual_recipes_draft.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

      const dishes = result.dishes ?? [];
      if (dishes.length === 0) throw new Error("dishes가 비었습니다.");

      let note;
      if (mode === "full") {
        const { dropped } = mergeFull(golden, dishes);
        note = `시각추출(full)로 recipes 재구성 — 요리 ${dishes.length}개${dropped.length ? `, 텍스트 초안에서 제외됨: ${dropped.join(", ")}` : ""}`;
        console.log(`[OK] ${videoId} (full): ${golden.recipes.map((r) => `${r.title}(재료${r.ingredients.length}/단계${r.steps.length})`).join(", ")}`);
      } else {
        const summary = mergeSteps(golden, dishes);
        note = `시각추출(steps)로 단계 교체·재료 보강 — ${summary.join(" / ")}`;
        console.log(`[OK] ${videoId} (steps): ${summary.join(" / ")}`);
      }

      golden.graderNotes = [...(golden.graderNotes ?? []), `[visual-recipes] ${note}`];
      if (!String(golden.draftedBy ?? "").includes("gemini:visual-recipes")) {
        golden.draftedBy = `${golden.draftedBy} + gemini:visual-recipes`;
      }
      await writeFile(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, "utf8");
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
