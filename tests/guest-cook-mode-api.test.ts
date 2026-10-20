import { afterEach, expect, it, vi } from "vitest";
import { fetchStandaloneCookMode } from "@/lib/api/cooking";
const recipe = { id: "public-recipe", title: "공개 요리", cooking_servings: 2, ingredients: [], steps: [] };
afterEach(() => vi.unstubAllGlobals());
it("omits rejected account cookies only for the explicit guest public read", async () => {
  const read = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { recipe }, error: null })));
  vi.stubGlobal("fetch", read);
  expect(await fetchStandaloneCookMode("public-recipe", 2, { credentials: "omit" })).toEqual({ recipe });
  const [path, init] = read.mock.calls[0];
  expect(path).toBe("/api/v1/recipes/public-recipe/cook-mode?servings=2");
  expect(init.credentials).toBe("omit");
  expect(init.method).toBeUndefined();
  expect(new Headers(init.headers).has("authorization")).toBe(false);
  expect(read).toHaveBeenCalledTimes(1);
});
it("preserves default credentials for existing authenticated standalone readers", async () => {
  const read = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { recipe }, error: null })));
  vi.stubGlobal("fetch", read);
  await fetchStandaloneCookMode("public-recipe", 2);
  expect(read.mock.calls[0][1].credentials).toBeUndefined();
});
