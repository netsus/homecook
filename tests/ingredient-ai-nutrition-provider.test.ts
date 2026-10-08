import { describe, expect, it, vi } from "vitest";
import { generateAiNutritionEstimate } from "@/lib/server/ingredient-ai-nutrition-model";
const context = { ingredient_id: "i", standard_name: "생 삼나물", category: "채소", definition: "생잎", context_hash: "hash" };
const estimate = { values: { energy_kcal: 25, carbohydrate_g: 4, protein_g: 2, fat_g: 0.2, sodium_mg: null, sugars_g: null, fiber_g: 2, saturated_fat_g: null }, assumptions: ["생잎 100g"], uncertainty: "high" };
const response = (text: string, finishReason = "STOP") => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
const env = { GEMINI_API_KEY: "test-not-a-secret" };
describe("AI nutrition provider boundary", () => {
  it("tries the configured backup key after a 402 account limit", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 402 })).mockResolvedValueOnce(response(JSON.stringify(estimate)));
    expect(await generateAiNutritionEstimate(context, "gemini-test", { env: { GEMINI_API_KEYS: "one,two" }, fetch: fetcher })).toEqual(estimate);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("key=two");
  });
  it("treats an exhausted provider account as temporarily unavailable", async () => {
    await expect(generateAiNutritionEstimate(context, "gemini-test", { env, fetch: async () => new Response('{}', { status: 402 }) })).rejects.toMatchObject({ code: "AI_NUTRITION_PROVIDER_UNAVAILABLE", retryable: true });
  });
  it("uses a structured schema and sends no user identity or context hash", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(JSON.stringify(estimate)));
    expect(await generateAiNutritionEstimate(context, "gemini-test", { env, fetch: fetcher })).toEqual(estimate);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.generationConfig.responseSchema.properties.values.properties.sodium_mg.nullable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("context_hash");
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects truncated and malformed output", async () => {
    for (const result of [response(JSON.stringify(estimate), "MAX_TOKENS"), response("not JSON")]) {
      await expect(generateAiNutritionEstimate(context, "gemini-test", { env, fetch: async () => result })).rejects.toThrow(/^AI_NUTRITION_/);
    }
  });
  it("returns rate limits without following provider-supplied wait times", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"error":{"message":"per minute","retryDelay":"999999s"}}', { status: 429 }));
    await expect(generateAiNutritionEstimate(context, "gemini-test", { env, fetch: fetcher })).rejects.toMatchObject({ code: "AI_NUTRITION_RATE_LIMITED", retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("limits exhausted-key failover to two keys", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"error":{"message":"daily quota"}}', { status: 429 }));
    await expect(generateAiNutritionEstimate(context, "gemini-test", { env: { GEMINI_API_KEYS: "one,two,three" }, fetch: fetcher })).rejects.toThrow("AI_NUTRITION_RATE_LIMITED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("redacts transport exceptions and rejects invalid configuration before a request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("https://provider?key=private"); });
    await expect(generateAiNutritionEstimate(context, "gemini-test", { env, fetch: fetcher })).rejects.toMatchObject({ message: "AI_NUTRITION_PROVIDER_FAILED" });
    await expect(generateAiNutritionEstimate(context, "../../wrong", { env, fetch: fetcher })).rejects.toThrow("AI_NUTRITION_INVALID_CONTEXT");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
