import { describe, expect, it, vi } from "vitest";
import { createRound2TurnstileVerifier } from "@/lib/server/marketing-round2-turnstile";

const now = Date.parse("2026-09-11T01:00:00Z");
const event = "11111111-1111-4111-8111-111111111111";
const valid = { success: true, hostname: "localhost", action: "mumeok_r2_recording", challenge_ts: new Date(now - 1000).toISOString() };
function setup(value: unknown = valid) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
  return { fetcher, verify: createRound2TurnstileVerifier({ secret: "fixture-only", hostname: "localhost", now: () => now, fetch: fetcher }) };
}
describe("r2 Siteverify boundary", () => {
  it("verifies the actual endpoint without remoteip and uses event idempotency", async () => {
    const { verify, fetcher } = setup();
    expect(await verify("fixture-token", event, "recording")).toBe(new Date(now).toISOString());
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ secret: "fixture-only", response: "fixture-token", idempotency_key: event });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { ...valid, success: false }, { ...valid, hostname: "app.mumeok.kr" },
    { ...valid, action: "mumeok_r2_homeflow" }, { ...valid, challenge_ts: new Date(now - 300001).toISOString() },
    { ...valid, challenge_ts: new Date(now + 30001).toISOString() }, { ...valid, challenge_ts: "invalid" },
  ])("rejects provider validation mismatch", async (value) => {
    await expect(setup(value).verify("token", event, "recording")).rejects.toMatchObject({ code: "TURNSTILE_FAILED" });
  });
  it("retries network errors at most once with the same token/event", async () => {
    const { verify, fetcher } = setup();
    fetcher.mockRejectedValueOnce(new Error("private network detail"));
    await verify("token", event, "recording");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0][1]?.body)).toBe(String(fetcher.mock.calls[1][1]?.body));
    fetcher.mockRejectedValue(new Error("private network detail"));
    await expect(verify("token", event, "recording")).rejects.toMatchObject({ code: "LEAD_CAPTURE_UNAVAILABLE", message: "신청을 확인하지 못했어요. 다시 시도해 주세요." });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("treats malformed provider responses as unavailable without exposing them", async () => {
    const { verify, fetcher } = setup();
    fetcher.mockImplementation(async () => new Response("private invalid body"));
    await expect(verify("token", event, "recording")).rejects.toMatchObject({ code: "LEAD_CAPTURE_UNAVAILABLE" });
  });
  it.each([{ success: "true" }, { success: true }, { success: false, "error-codes": ["internal-error"] }])("distinguishes abnormal/service responses from a failed challenge", async (value) => {
    await expect(setup(value).verify("token", event, "recording")).rejects.toMatchObject({ code: "LEAD_CAPTURE_UNAVAILABLE" });
  });
});
