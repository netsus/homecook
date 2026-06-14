#!/usr/bin/env node
/* eslint-disable no-console */
// 추출 러너: source.json → recipe-extraction-lab 모듈 → result.json
// golden.json은 절대 읽지 않는다(루프 격리 보장). 채점은 grade-extraction.mjs가 별도로 수행.
//
// 사용법:
//   node scripts/recipe-loop/run-extraction.mjs --split train [--ids id1,id2] [--no-visual] [--out-tag baseline]

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createCachedLlmClient } from "./lib/llm-client.mjs";
import { extractRecipeFromSources } from "../../lib/server/recipe-extraction-lab/extract.mjs";

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

function sourceToInput(source) {
  const caps = source.captions ?? {};
  const transcript = caps.available && Array.isArray(caps.segments) && caps.segments.length > 0
    ? { segments: caps.segments, language: caps.selectedTrack?.languageCode ?? caps.language ?? null }
    : null;
  const authorComments = (source.authorComments?.comments ?? []).map((c) => c.text).filter(Boolean);
  return {
    video: {
      videoId: source.video.videoId,
      title: source.video.title,
      description: source.video.description,
      tags: source.video.tags ?? [],
    },
    transcript,
    authorComments,
    youtubeUrl: source.video.url ?? `https://www.youtube.com/watch?v=${source.video.videoId}`,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const useVisual = args["no-visual"] !== true;
  const splitDir = path.join(PROJECT_ROOT, DATA_ROOT, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const llm = createCachedLlmClient(typeof args.model === "string" ? { model: args.model } : {});
  let failures = 0;

  for (const id of ids) {
    const sourcePath = path.join(splitDir, id, "source.json");
    if (!existsSync(sourcePath)) { console.error(`[SKIP] source 없음: ${id}`); failures += 1; continue; }
    try {
      const source = JSON.parse(await readFile(sourcePath, "utf8"));
      const input = sourceToInput(source);
      const result = await extractRecipeFromSources(input, { llm, useVisual });
      const outDir = path.join(splitDir, id, "runs", outTag);
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "result.json"), JSON.stringify({ videoId: id, ...result }, null, 2) + "\n", "utf8");
      const recipeCount = result.recipes.length;
      const ingCount = result.recipes.reduce((a, r) => a + r.ingredients.length, 0);
      const stepCount = result.recipes.reduce((a, r) => a + r.steps.length, 0);
      console.log(`[OK] ${split}/${id}: 레시피 ${recipeCount}, 재료 ${ingCount}, 단계 ${stepCount}${result.meta.cached ? " (cache)" : ""}${result.meta.droppedUnusedVisualIngredients ? `, 미사용제거 ${result.meta.droppedUnusedVisualIngredients}` : ""}`);
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${split}/${id}: ${error.message}`);
    }
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
