import { describe, expect, it, vi } from "vitest";

import {
  fetchGeminiGenerateContentWithFailover,
  getGeminiApiKeyCandidates,
} from "@/lib/server/gemini-key-failover";

function geminiResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function successPayload(value: Record<string, unknown>) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(value) }],
        },
      },
    ],
  };
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

function requestKeys(fetchWithTimeout: ReturnType<typeof vi.fn>) {
  return fetchWithTimeout.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("key"));
}

describe("youtube import Gemini key failover", () => {
  it("builds ordered candidates for free-first, paid fallback, and legacy single-key envs", () => {
    expect(getGeminiApiKeyCandidates({
      GEMINI_API_KEY_FREE: "free-key",
      GEMINI_API_KEY_PAID: "paid-key",
      GEMINI_API_KEY: "legacy-key",
    }).map((entry) => entry.key)).toEqual(["free-key", "paid-key"]);

    expect(getGeminiApiKeyCandidates({
      GEMINI_API_KEY_FREE: "",
      GEMINI_API_KEY_PAID: "",
      GEMINI_API_KEY: "legacy-key",
    }).map((entry) => entry.key)).toEqual(["legacy-key"]);

    expect(getGeminiApiKeyCandidates({
      GEMINI_API_KEY_FREE: "",
      GEMINI_API_KEY_PAID: "paid-key",
      GEMINI_API_KEY: "",
    }).map((entry) => entry.key)).toEqual(["paid-key"]);

    expect(getGeminiApiKeyCandidates({
      GEMINI_API_KEYS: "free-key,paid-key,free-key",
    }).map((entry) => entry.key)).toEqual(["free-key", "paid-key"]);
  });

  it("falls back from free to paid when the free daily quota is exhausted", async () => {
    const exhaustedKeys = new Set<string>();
    const fetchWithTimeout = vi.fn(async (url: string) => {
      const key = new URL(url).searchParams.get("key");
      if (key === "free-key") return geminiResponse(429, quotaExhaustedPayload());
      return geminiResponse(200, successPayload({ source: "paid" }));
    });

    const result = await fetchGeminiGenerateContentWithFailover({
      model: "gemini-test",
      apiKeyCandidates: [
        { key: "free-key", label: "free" },
        { key: "paid-key", label: "paid" },
      ],
      exhaustedKeys,
      timeoutMs: 100,
      requestBody: { contents: [] },
      fetchWithTimeout,
      maxRateLimitRetries: 1,
    });

    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject(successPayload({ source: "paid" }));
    expect(requestKeys(fetchWithTimeout)).toEqual(["free-key", "paid-key"]);
    expect(exhaustedKeys.has("free-key")).toBe(true);
  });

  it("retries minute rate limits on the same key instead of switching keys", async () => {
    const fetchWithTimeout = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse(429, minuteRateLimitPayload()))
      .mockResolvedValueOnce(geminiResponse(200, successPayload({ source: "free" })));

    const result = await fetchGeminiGenerateContentWithFailover({
      model: "gemini-test",
      apiKeyCandidates: [
        { key: "free-key", label: "free" },
        { key: "paid-key", label: "paid" },
      ],
      exhaustedKeys: new Set(),
      timeoutMs: 100,
      requestBody: { contents: [] },
      fetchWithTimeout,
      maxRateLimitRetries: 1,
    });

    expect(result.response.status).toBe(200);
    expect(requestKeys(fetchWithTimeout)).toEqual(["free-key", "free-key"]);
  });
});
