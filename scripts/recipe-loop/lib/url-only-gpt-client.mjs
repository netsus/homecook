// URL-only GPT client for recipe-loop.
// It sends a prompt centered on the YouTube URL and leaves prompt/raw/log/cache artifacts.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  extractJsonFromText,
  hashKey,
  hashText,
  runCodexExec,
  videoIdFromUrl,
} from "./codex-vision-client.mjs";

const PROJECT_ROOT = process.cwd();
const PROVIDER = "url-only-gpt";
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/url-only-gpt");
const CLIENT_VERSION = "url-only-gpt-client-v1";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildUrlOnlyCacheKey({ model, prompt, videoUrl, cacheText }) {
  return hashKey({
    provider: PROVIDER,
    model,
    promptHash: hashText(prompt),
    videoUrl,
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

export function createUrlOnlyGptClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_URL_ONLY_GPT_MODEL || DEFAULT_MODEL;
  const cacheDir = options.cacheDir || CACHE_DIR;
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const codexExec = options.codexExec ?? runCodexExec;

  return {
    async generate({ prompt, videoUrl = null, cacheText = "" }) {
      if (!videoUrl) throw new Error("url-only-gpt provider는 videoUrl이 필요합니다.");

      const videoId = videoIdFromUrl(videoUrl) ?? hashText(videoUrl, 12);
      const resultKey = buildUrlOnlyCacheKey({ model, prompt, videoUrl, cacheText });
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
            urlOnlyGptCacheDir: resultDir,
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
          throw new Error("url-only-gpt 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
        }

        const meta = {
          provider: PROVIDER,
          model,
          clientVersion: CLIENT_VERSION,
          cached: false,
          usedVisual: true,
          sourceMode: "url-only",
          videoId,
          videoUrl,
          urlOnlyGptCacheDir: resultDir,
        };
        await writeFile(finalJsonPath, JSON.stringify({ key: resultKey, model, json, meta }, null, 2) + "\n", "utf8");
        await writeFile(
          path.join(resultDir, "run_meta.json"),
          JSON.stringify({
            key: resultKey,
            videoId,
            videoUrl,
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
          videoId,
          videoUrl,
          stage: "final",
        });
        throw error;
      }
    },
  };
}
