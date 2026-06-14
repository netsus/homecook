#!/usr/bin/env node
/* eslint-disable no-console */
// 시각 추출로 생성된 재료 중 만들기 단계에서 쓰이지 않는 것을 찾는다.
// 시각 추정(visual-estimate / evidence=visual) 재료가 어떤 step instruction에도
// 이름이 등장하지 않으면 "오검출 후보"로 보고한다.
//
// 이 로직은 골든셋 검수뿐 아니라 실제 추출 파이프라인(M5)의 결정적 후처리 필터로도 재사용된다.
//
// 사용법: node scripts/recipe-loop/check-unused-ingredients.mjs [--split train|validation|holdout] [--all]

import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

const norm = (value) => (value ?? "").replace(/\s+/g, "").toLowerCase();

// 재료명이 step 텍스트에서 쓰였는지 판정. 이름 자체 또는 핵심 토큰(공백 분리 마지막 명사) 매칭.
export function ingredientUsedInSteps(ingredient, steps) {
  const names = [ingredient.name, ...(ingredient.nameAliases ?? [])].filter(Boolean);
  const stepText = steps.map((s) => norm(s.instruction)).join("  ");
  for (const name of names) {
    const n = norm(name);
    if (n.length >= 1 && stepText.includes(n)) return true;
    // 괄호 주석 제거 후 매칭: "올리브유(가니쉬용)" -> "올리브유"
    const base = norm(name.replace(/\([^)]*\)/g, ""));
    if (base && base !== n && stepText.includes(base)) return true;
    // "다진 소고기" -> "소고기", "피자치즈" -> "치즈" 같은 핵심 토큰 매칭
    const head = name.replace(/\([^)]*\)/g, "").trim().split(/\s+/).pop();
    if (head) {
      const h = norm(head);
      if (h.length >= 1 && h !== n && stepText.includes(h)) return true;
    }
  }
  return false;
}

function isVisualOnly(ingredient) {
  return ingredient.evidence === "visual" || ingredient.amountBasis === "visual-estimate";
}

async function checkGolden(goldenPath) {
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  const flagged = [];
  for (const recipe of golden.recipes) {
    for (const ing of recipe.ingredients) {
      if (!isVisualOnly(ing)) continue;
      if (!ingredientUsedInSteps(ing, recipe.steps)) {
        flagged.push({ recipe: recipe.title, name: ing.name, basis: ing.amountBasis ?? ing.evidence });
      }
    }
  }
  return flagged;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const splits = args.all || !args.split
    ? ["train", "validation", "holdout"]
    : [args.split];

  let total = 0;
  for (const split of splits) {
    const splitDir = path.join(PROJECT_ROOT, DATA_ROOT, split);
    let videoIds;
    try {
      videoIds = (await readdir(splitDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const videoId of videoIds.sort()) {
      const goldenPath = path.join(splitDir, videoId, "golden.json");
      let flagged;
      try {
        flagged = await checkGolden(goldenPath);
      } catch {
        continue;
      }
      if (flagged.length > 0) {
        total += flagged.length;
        console.log(`\n[${split}/${videoId}] 미사용 시각추정 재료 ${flagged.length}건:`);
        for (const item of flagged) {
          console.log(`  - (${item.recipe}) ${item.name} [${item.basis}]`);
        }
      }
    }
  }
  console.log(`\n총 미사용 시각추정 재료 후보: ${total}건`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
