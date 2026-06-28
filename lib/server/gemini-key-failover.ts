export interface GeminiApiKeyCandidate {
  key: string;
  label: string;
}

type Gemini429Kind = "quota-exhausted" | "rate-limit" | "unknown";

export interface GeminiGenerateContentFetchResult {
  response: Response;
  payload: unknown;
  bodyText: string;
}

interface FetchGeminiGenerateContentWithFailoverOptions {
  model: string;
  apiKeyCandidates: GeminiApiKeyCandidate[];
  exhaustedKeys: Set<string>;
  timeoutMs: number;
  requestBody: unknown;
  fetchWithTimeout: (url: string, init: RequestInit, timeoutMs: number) => Promise<Response>;
  maxRateLimitRetries?: number;
}

function normalizeEnvValue(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueKeyEntries(entries: GeminiApiKeyCandidate[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.key || seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

export function getGeminiApiKeyCandidates(env: Record<string, string | undefined> = process.env) {
  const explicitList = normalizeEnvValue(env.GEMINI_API_KEYS);
  if (explicitList) {
    return uniqueKeyEntries(
      explicitList
        .split(",")
        .map((key, index) => ({ key: key.trim(), label: `key-${index + 1}` })),
    );
  }

  const freeKey = normalizeEnvValue(env.GEMINI_API_KEY_FREE);
  const paidKey = normalizeEnvValue(env.GEMINI_API_KEY_PAID);
  const legacyKey = normalizeEnvValue(env.GEMINI_API_KEY);
  const entries: GeminiApiKeyCandidate[] = [];

  if (freeKey) entries.push({ key: freeKey, label: "free" });
  if (paidKey) entries.push({ key: paidKey, label: "paid" });
  else if (freeKey && legacyKey) entries.push({ key: legacyKey, label: "paid-legacy" });
  else if (!freeKey && legacyKey) entries.push({ key: legacyKey, label: "default" });

  return uniqueKeyEntries(entries);
}

function extractGeminiRetryAfterMs(body: string) {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Number(match[1]) * 1000 : null;
}

function classifyGemini429(body: string): Gemini429Kind {
  const lower = body.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, "");
  const retryAfter = extractGeminiRetryAfterMs(body);
  const dailyQuota = /perday|requestsperday|tokensperday|daily|requestperday|tokenperday/.test(compact);
  const minuteQuota =
    /perminute|requestsperminute|tokensperminute|\brpm\b|\btpm\b/.test(compact) || /per minute/.test(lower);

  if (dailyQuota) return "quota-exhausted";
  if (minuteQuota) return "rate-limit";
  if (/free tier quota|check your plan and billing|no credits|limit is 0|limit: 0|current quota/.test(lower)) {
    return "quota-exhausted";
  }

  if (retryAfter !== null && retryAfter <= 5 * 60 * 1000) return "rate-limit";
  if (retryAfter !== null && retryAfter >= 60 * 60 * 1000) return "quota-exhausted";
  if (lower.includes("resource_exhausted") && lower.includes("quota")) return "quota-exhausted";
  return "unknown";
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackBackoffMs(attempt: number) {
  return Math.min(30_000, 2_000 * 2 ** attempt);
}

async function readGeminiResponse(response: Response) {
  const bodyText = await response.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  return { bodyText, payload };
}

export async function fetchGeminiGenerateContentWithFailover({
  model,
  apiKeyCandidates,
  exhaustedKeys,
  timeoutMs,
  requestBody,
  fetchWithTimeout,
  maxRateLimitRetries = 1,
}: FetchGeminiGenerateContentWithFailoverOptions): Promise<GeminiGenerateContentFetchResult> {
  const availableCandidates = apiKeyCandidates.filter((entry) => !exhaustedKeys.has(entry.key));
  if (availableCandidates.length === 0) {
    throw new Error("no_gemini_api_key_available");
  }

  let lastResult: GeminiGenerateContentFetchResult | null = null;

  for (let keyIndex = 0; keyIndex < availableCandidates.length; keyIndex += 1) {
    const candidate = availableCandidates[keyIndex];
    const isLastKey = keyIndex === availableCandidates.length - 1;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(candidate.key)}`;

    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
        },
        timeoutMs,
      );
      const { bodyText, payload } = await readGeminiResponse(response);
      const result = { response, payload, bodyText };
      lastResult = result;

      if (response.status !== 429) {
        return result;
      }

      const limitKind = classifyGemini429(bodyText);
      if (limitKind === "quota-exhausted") {
        exhaustedKeys.add(candidate.key);
        if (!isLastKey) break;
        return result;
      }

      if (attempt < maxRateLimitRetries) {
        await delay(extractGeminiRetryAfterMs(bodyText) ?? fallbackBackoffMs(attempt));
        continue;
      }

      if (limitKind === "unknown" && !isLastKey) break;
      return result;
    }
  }

  if (lastResult) return lastResult;
  throw new Error("gemini_generate_content_failed");
}
