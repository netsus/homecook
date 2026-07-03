// Public-source GPT client for recipe-loop.
// It sends an explicit public-source prompt to Codex and leaves prompt/raw/log/cache artifacts.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  extractJsonFromText,
  hashKey,
  hashText,
  runCodexExec,
} from "./codex-vision-client.mjs";

const PROJECT_ROOT = process.cwd();
const PROVIDER = "public-source-gpt";
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/public-source-gpt");
const CLIENT_VERSION = "public-source-gpt-client-v1";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildPublicSourceGptCacheKey({ model, prompt, cacheText }) {
  return hashKey({
    provider: PROVIDER,
    model,
    promptHash: hashText(prompt),
    cacheTextHash: hashText(cacheText),
    clientVersion: CLIENT_VERSION,
  });
}

async function writeFailure(resultDir, error, extra = {}) {
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    path.join(resultDir, "failure.json"),
    JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...extra,
    }, null, 2) + "\n",
    "utf8",
  );
}

export function createPublicSourceGptClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_PUBLIC_SOURCE_GPT_MODEL || DEFAULT_MODEL;
  const cacheDir = options.cacheDir || CACHE_DIR;
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const codexExec = options.codexExec ?? runCodexExec;

  return {
    async generate({ prompt, cacheText = "" }) {
      const resultKey = buildPublicSourceGptCacheKey({ model, prompt, cacheText });
      const resultDir = path.join(cacheDir, resultKey);
      const finalJsonPath = path.join(resultDir, "final.json");

      if (!options.noCache && !options.refreshFinal && existsSync(finalJsonPath)) {
        const cached = JSON.parse(await readFile(finalJsonPath, "utf8"));
        return {
          json: cached.json,
          cached: true,
          model,
          provider: PROVIDER,
          meta: {
            ...(cached.meta ?? {}),
            provider: PROVIDER,
            cached: true,
            publicSourceGptCacheDir: resultDir,
          },
        };
      }

      await mkdir(resultDir, { recursive: true });
      const finalPromptPath = path.join(resultDir, "final.prompt.md");
      const finalRawPath = path.join(resultDir, "final.raw.md");
      const finalLogPath = path.join(resultDir, "final.log");
      await writeFile(finalPromptPath, prompt, "utf8");

      try {
        const finalRaw = await codexExec({
          prompt,
          images: [],
          model,
          codexEffort: options.codexEffort,
          outputPath: finalRawPath,
          logPath: finalLogPath,
          timeoutMs,
        });
        await writeFile(finalRawPath, finalRaw, "utf8");

        const json = extractJsonFromText(finalRaw);
        if (!isObject(json) || !Array.isArray(json.recipes)) {
          throw new Error("public-source-gpt 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
        }

        const meta = {
          provider: PROVIDER,
          model,
          clientVersion: CLIENT_VERSION,
          cached: false,
          usedVisual: false,
          sourceMode: "public-source",
          publicSourceGptCacheDir: resultDir,
        };
        await writeFile(finalJsonPath, JSON.stringify({ key: resultKey, model, json, meta }, null, 2) + "\n", "utf8");
        await writeFile(
          path.join(resultDir, "run_meta.json"),
          JSON.stringify({
            key: resultKey,
            model,
            promptHash: hashText(prompt),
            cacheTextHash: hashText(cacheText),
            ...meta,
          }, null, 2) + "\n",
          "utf8",
        );
        return { json, cached: false, model, provider: PROVIDER, meta };
      } catch (error) {
        await writeFailure(resultDir, error, {
          provider: PROVIDER,
          model,
          stage: "final",
        });
        throw error;
      }
    },
  };
}
