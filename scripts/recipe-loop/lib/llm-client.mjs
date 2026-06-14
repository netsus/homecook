// 캐시 래핑된 Gemini 클라이언트. 동일 (model + prompt + 입력 해시 + 비디오 + 옵션)이면
// 디스크 캐시를 읽어 재호출하지 않는다. 프롬프트가 바뀐 ITER만 실제 호출이 일어난다.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/llm");

function parseDotEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep < 0) continue;
    env[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
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

function hashKey(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt) => Math.min(30000, 2000 * 2 ** attempt); // 2s, 4s, 8s, ...

// Gemini 429 응답의 RetryInfo(retryDelay)를 ms로 파싱.
function extractRetryAfterMs(body) {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return match ? Number(match[1]) * 1000 : null;
}

export function createCachedLlmClient(options = {}) {
  let envPromise = null;
  const getEnv = () => (envPromise ??= loadEnv());

  return {
    /**
     * Gemini generateContent 호출 (구조화 JSON). 캐시 우선.
     * @param {object} args
     * @param {string} args.prompt           프롬프트 텍스트
     * @param {string} [args.videoUrl]       file_uri로 전달할 유튜브 URL (시각 분석)
     * @param {string} [args.cacheText]      캐시 키에 포함할 입력 텍스트(소스 본문)
     * @param {object} [args.responseSchema] responseSchema (선택)
     * @param {string} [args.model]          모델명 (기본 env or gemini-2.5-flash)
     * @param {number} [args.maxOutputTokens]
     * @returns {Promise<{ json: any, cached: boolean, model: string }>}
     */
    async generate({ prompt, videoUrl = null, cacheText = "", responseSchema = null, model = null, maxOutputTokens = 32768 }) {
      const env = await getEnv();
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다 (.env.local).");
      const resolvedModel = model || options.model || env.YOUTUBE_RECIPE_VISUAL_RECIPE_MODEL || "gemini-2.5-flash";

      const key = hashKey({
        model: resolvedModel,
        prompt,
        videoUrl,
        cacheText,
        schema: responseSchema ? "yes" : "no",
        v: 1,
      });
      const cachePath = path.join(CACHE_DIR, `${key}.json`);

      if (!options.noCache && existsSync(cachePath)) {
        const cached = JSON.parse(await readFile(cachePath, "utf8"));
        return { json: cached.json, cached: true, model: resolvedModel };
      }

      const parts = [];
      if (videoUrl) parts.push({ file_data: { file_uri: videoUrl } });
      parts.push({ text: prompt });

      const generationConfig = { temperature: 0, maxOutputTokens, responseMimeType: "application/json" };
      if (responseSchema) generationConfig.responseSchema = responseSchema;

      const timeoutMs = Number(options.timeoutMs ?? 200000);
      const maxRetries = Number(options.maxRetries ?? 3);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      let payload = null;
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
            signal: controller.signal,
          });
        } catch (err) {
          lastError = new Error(`fetch 실패: ${err.name}`);
          await delay(backoffMs(attempt));
          continue;
        } finally {
          clearTimeout(timer);
        }

        if (response.status === 429 || response.status === 503 || response.status === 500) {
          const body = await response.text().catch(() => "");
          lastError = new Error(`Gemini status ${response.status}: ${body.slice(0, 160)}`);
          // 429는 분당 한도면 backoff로 회복, 일일 한도면 회복 불가 → retryAfter 신호 활용
          const retryAfter = extractRetryAfterMs(body);
          if (attempt < maxRetries) {
            await delay(retryAfter ?? backoffMs(attempt));
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Gemini status ${response.status}: ${body.slice(0, 200)}`);
        }

        payload = await response.json();
        break;
      }
      if (!payload) throw lastError ?? new Error("Gemini 호출 실패");

      const finishReason = payload?.candidates?.[0]?.finishReason;
      const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text.trim()) throw new Error(`Gemini 응답이 비었습니다 (finishReason=${finishReason}).`);
      if (finishReason === "MAX_TOKENS") {
        throw new Error(`Gemini 응답이 maxOutputTokens(${maxOutputTokens})에서 잘렸습니다 — 토큰 한도를 올리세요.`);
      }
      const json = JSON.parse(text);

      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath, JSON.stringify({ key, model: resolvedModel, json }, null, 2), "utf8");
      return { json, cached: false, model: resolvedModel };
    },
  };
}
