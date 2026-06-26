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
import { pathToFileURL } from "node:url";

import { createCodexVisionClient } from "./lib/codex-vision-client.mjs";
import { createCachedLlmClient } from "./lib/llm-client.mjs";
import { extractRecipeFromSources } from "../../lib/server/recipe-extraction-lab/extract.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const SUPPORTED_PROVIDERS = new Set(["gemini", "codex-vision"]);

export function parseCliArgs(argv) {
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

function optionalNumber(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sourceToInput(source) {
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

export function resolveProvider(args) {
  const provider = typeof args.provider === "string" ? args.provider : "gemini";
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`지원하지 않는 provider입니다: ${provider}. 사용 가능: ${[...SUPPORTED_PROVIDERS].join(", ")}`);
  }
  return provider;
}

export function createLlmForProvider(provider, args = {}, factories = {}) {
  if (provider === "gemini") {
    const createGemini = factories.createGemini ?? createCachedLlmClient;
    return createGemini(typeof args.model === "string" ? { model: args.model } : {});
  }

  if (provider === "codex-vision") {
    const createCodexVision = factories.createCodexVision ?? createCodexVisionClient;
    return createCodexVision({
      model: typeof args.model === "string" ? args.model : undefined,
      codexEffort: typeof args["codex-effort"] === "string" ? args["codex-effort"] : undefined,
      maxFrames: optionalNumber(args["max-frames"]),
      batchSize: optionalNumber(args["batch-size"]),
      sceneDetail: typeof args["scene-detail"] === "string" ? args["scene-detail"] : undefined,
      sceneSelection: typeof args["scene-selection"] === "string" ? args["scene-selection"] : undefined,
      timeoutMs: optionalNumber(args["timeout-ms"]),
      noCache: args["no-cache"] === true,
    });
  }

  throw new Error(`지원하지 않는 provider입니다: ${provider}`);
}

async function writeRunFailure(outDir, { id, split, outTag, provider, error }) {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "failure.json"),
    JSON.stringify({
      videoId: id,
      split,
      outTag,
      provider,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      failedAt: new Date().toISOString(),
    }, null, 2) + "\n",
    "utf8",
  );
}

export async function runExtraction(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const useVisual = args["no-visual"] !== true;
  const provider = resolveProvider(args);
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const dataRoot = options.dataRoot ?? DATA_ROOT;
  const splitDir = path.join(projectRoot, dataRoot, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const llm = options.llm ?? createLlmForProvider(provider, args, options.factories);
  let failures = 0;

  for (const id of ids) {
    const sourcePath = path.join(splitDir, id, "source.json");
    const outDir = path.join(splitDir, id, "runs", outTag);
    if (!existsSync(sourcePath)) {
      const error = new Error(`source 없음: ${sourcePath}`);
      await writeRunFailure(outDir, { id, split, outTag, provider, error });
      console.error(`[SKIP] source 없음: ${id}`);
      failures += 1;
      continue;
    }
    try {
      const source = JSON.parse(await readFile(sourcePath, "utf8"));
      const input = sourceToInput(source);
      const result = await extractRecipeFromSources(input, { llm, useVisual });
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "result.json"), JSON.stringify({ videoId: id, ...result }, null, 2) + "\n", "utf8");
      const recipeCount = result.recipes.length;
      const ingCount = result.recipes.reduce((a, r) => a + r.ingredients.length, 0);
      const stepCount = result.recipes.reduce((a, r) => a + r.steps.length, 0);
      console.log(`[OK] ${provider} ${split}/${id}: 레시피 ${recipeCount}, 재료 ${ingCount}, 단계 ${stepCount}${result.meta.cached ? " (cache)" : ""}${result.meta.droppedUnusedVisualIngredients ? `, 미사용제거 ${result.meta.droppedUnusedVisualIngredients}` : ""}`);
    } catch (error) {
      failures += 1;
      await writeRunFailure(outDir, { id, split, outTag, provider, error });
      console.error(`[FAIL] ${split}/${id}: ${error.message}`);
    }
  }

  return { failures };
}

async function main() {
  const result = await runExtraction(process.argv.slice(2));
  process.exit(result.failures > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
