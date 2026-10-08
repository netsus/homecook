import { afterEach, describe, expect, it, vi } from "vitest";
const { tick, after, registration } = vi.hoisted(() => ({ tick: vi.fn(async () => ({ status: "idle" })), after: vi.fn(), registration: vi.fn() }));
vi.mock("@/lib/server/ingredient-ai-nutrition-worker", () => ({ runIngredientAiNutritionTick: tick }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/server/youtube-import", () => ({ handleYoutubeIngredientRegistration: registration }));
import { startIngredientAiNutritionRuntime } from "@/lib/server/ingredient-ai-nutrition-runtime";
import { POST } from "@/app/api/v1/recipes/youtube/ingredient-registration/route";
import { register } from "../instrumentation";
const runtime = globalThis as typeof globalThis & { __homecookAiNutritionTimer?: ReturnType<typeof setTimeout> };
afterEach(() => { if (runtime.__homecookAiNutritionTimer) clearTimeout(runtime.__homecookAiNutritionTimer); delete runtime.__homecookAiNutritionTimer; vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("AI nutrition automatic wake", () => {
  it("starts from the production Node server hook, not the build hook", async () => {
    vi.useFakeTimers(); vi.stubEnv("AI_NUTRITION_ESTIMATION_ENABLED", "1");
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build"); await register(); expect(vi.getTimerCount()).toBe(0);
    vi.stubEnv("NEXT_PHASE", "phase-production-server"); await register(); expect(vi.getTimerCount()).toBe(1);
  });
  it("stays off by default and starts only one periodic drain", async () => {
    vi.useFakeTimers(); vi.stubEnv("AI_NUTRITION_ESTIMATION_ENABLED", "0"); startIngredientAiNutritionRuntime(); expect(vi.getTimerCount()).toBe(0);
    vi.stubEnv("AI_NUTRITION_ESTIMATION_ENABLED", "1"); startIngredientAiNutritionRuntime(); startIngredientAiNutritionRuntime(); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000); expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(tick).toHaveBeenCalledTimes(2);
  });
  it("continues after an unsuccessful tick", async () => {
    vi.useFakeTimers(); vi.stubEnv("AI_NUTRITION_ESTIMATION_ENABLED", "1"); tick.mockRejectedValueOnce(new Error("temporary")); startIngredientAiNutritionRuntime();
    await vi.advanceTimersByTimeAsync(65000); expect(tick).toHaveBeenCalledTimes(2);
  });
  it("wakes after successful registration only, without changing its response", async () => {
    vi.stubEnv("AI_NUTRITION_ESTIMATION_ENABLED", "1"); const response = new Response("created"); registration.mockResolvedValueOnce(response);
    expect(await POST(new Request("http://localhost/api", { method: "POST" }))).toBe(response); expect(after).toHaveBeenCalledTimes(1); expect(tick).not.toHaveBeenCalled();
    tick.mockRejectedValueOnce(new Error("temporary")); await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    registration.mockResolvedValueOnce(new Response("invalid", { status: 400 })); await POST(new Request("http://localhost/api", { method: "POST" })); expect(after).toHaveBeenCalledTimes(1);
  });
});
