import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const llmClientModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/lib/llm-client.mjs")).href;
const originalCwd = process.cwd();
let importCounter = 0;

async function loadLlmClient() {
  importCounter += 1;
  return import(`${llmClientModuleUrl}?case=${Date.now()}-${importCounter}`);
}

function successPayload(value: Record<string, unknown>) {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ text: JSON.stringify(value) }],
        },
      },
    ],
  };
}

function geminiResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function quotaExhaustedPayload() {
  return {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota. Quota metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier.",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
              quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            },
          ],
        },
      ],
    },
  };
}

function minuteRateLimitPayload() {
  return {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota. Quota metric: GenerateRequestsPerMinutePerProjectPerModel-FreeTier.",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
              quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            },
          ],
        },
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "0s",
        },
      ],
    },
  };
}

function requestKeys(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url]) => {
    const key = new URL(String(url)).searchParams.get("key");
    return ["free-key", "paid-key", "legacy-key"].includes(key ?? "") ? key : "<unexpected-key>";
  });
}

describe("recipe-loop Gemini key failover", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back from the free key to the paid key when the free daily quota is exhausted", async () => {
    const { createCachedLlmClient } = await loadLlmClient();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_FREE", "free-key");
    vi.stubEnv("GEMINI_API_KEY_PAID", "paid-key");
    vi.stubEnv("GEMINI_API_KEYS", "");

    const fetchMock = vi.fn(async (url: string) => {
      const key = new URL(url).searchParams.get("key");
      if (key === "free-key") return geminiResponse(429, quotaExhaustedPayload());
      return geminiResponse(200, successPayload({ source: "paid" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createCachedLlmClient({ noCache: true, maxRetries: 1 });
    await expect(client.generate({ prompt: "extract", model: "gemini-test" })).resolves.toMatchObject({
      json: { source: "paid" },
      cached: false,
      model: "gemini-test",
    });
    expect(requestKeys(fetchMock)).toEqual(["free-key", "paid-key"]);
  });

  it("retries minute rate limits on the same key instead of switching to the paid key", async () => {
    const { createCachedLlmClient } = await loadLlmClient();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_FREE", "free-key");
    vi.stubEnv("GEMINI_API_KEY_PAID", "paid-key");
    vi.stubEnv("GEMINI_API_KEYS", "");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse(429, minuteRateLimitPayload()))
      .mockResolvedValueOnce(geminiResponse(200, successPayload({ source: "free-after-backoff" })));
    vi.stubGlobal("fetch", fetchMock);

    const client = createCachedLlmClient({ noCache: true, maxRetries: 1 });
    await expect(client.generate({ prompt: "extract", model: "gemini-test" })).resolves.toMatchObject({
      json: { source: "free-after-backoff" },
    });
    expect(requestKeys(fetchMock)).toEqual(["free-key", "free-key"]);
  });

  it("keeps legacy single-key behavior when only GEMINI_API_KEY is configured", async () => {
    const { createCachedLlmClient } = await loadLlmClient();
    vi.stubEnv("GEMINI_API_KEY", "legacy-key");
    vi.stubEnv("GEMINI_API_KEY_FREE", "");
    vi.stubEnv("GEMINI_API_KEY_PAID", "");
    vi.stubEnv("GEMINI_API_KEYS", "");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse(429, minuteRateLimitPayload()))
      .mockResolvedValueOnce(geminiResponse(200, successPayload({ source: "legacy" })));
    vi.stubGlobal("fetch", fetchMock);

    const client = createCachedLlmClient({ noCache: true, maxRetries: 1 });
    await expect(client.generate({ prompt: "extract", model: "gemini-test" })).resolves.toMatchObject({
      json: { source: "legacy" },
    });
    expect(requestKeys(fetchMock)).toEqual(["legacy-key", "legacy-key"]);
  });

  it("skips an exhausted free key for later calls in the same run", async () => {
    const { createCachedLlmClient } = await loadLlmClient();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_FREE", "free-key");
    vi.stubEnv("GEMINI_API_KEY_PAID", "paid-key");
    vi.stubEnv("GEMINI_API_KEYS", "");

    const fetchMock = vi.fn(async (url: string) => {
      const key = new URL(url).searchParams.get("key");
      if (key === "free-key") return geminiResponse(429, quotaExhaustedPayload());
      return geminiResponse(200, successPayload({ source: "paid" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createCachedLlmClient({ noCache: true, maxRetries: 1 });
    await client.generate({ prompt: "first", model: "gemini-test" });
    await client.generate({ prompt: "second", model: "gemini-test" });

    expect(requestKeys(fetchMock)).toEqual(["free-key", "paid-key", "paid-key"]);
  });

  it("keeps disk cache entries independent from the selected API key", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "recipe-loop-gemini-cache-"));
    process.chdir(tempRoot);
    try {
      const { createCachedLlmClient } = await loadLlmClient();
      vi.stubEnv("GEMINI_API_KEY", "");
      vi.stubEnv("GEMINI_API_KEY_FREE", "free-key");
      vi.stubEnv("GEMINI_API_KEY_PAID", "");
      vi.stubEnv("GEMINI_API_KEYS", "");

      const fetchMock = vi.fn(async () => geminiResponse(200, successPayload({ source: "free" })));
      vi.stubGlobal("fetch", fetchMock);

      await createCachedLlmClient().generate({
        prompt: "cache-me",
        videoUrl: "https://www.youtube.com/watch?v=test",
        model: "gemini-test",
      });

      vi.stubEnv("GEMINI_API_KEY_FREE", "");
      vi.stubEnv("GEMINI_API_KEY_PAID", "paid-key");
      await createCachedLlmClient().generate({
        prompt: "cache-me",
        videoUrl: "https://www.youtube.com/watch?v=test",
        model: "gemini-test",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
