import { afterEach, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/api/mypage";
afterEach(() => vi.unstubAllGlobals());
it("sends the same required deletion key when retrying an uncertain response", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValue(new Response(JSON.stringify({ success: true, data: { deleted: true }, error: null })));
  vi.stubGlobal("fetch", fetch);
  const key = "11111111-1111-4111-8111-111111111111";
  await expect(deleteAccount(key)).rejects.toThrow();
  await deleteAccount(key);
  for (const [url, init] of fetch.mock.calls) {
    expect(url).toBe("/api/v1/users/me");
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(key);
  }
});
