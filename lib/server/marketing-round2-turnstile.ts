import { Round2Error, type Round2Topic } from "@/lib/marketing-round2";

export function createRound2TurnstileVerifier(options: {
  secret: string;
  hostname: "app.mumeok.kr" | "localhost";
  now?: () => number;
  fetch?: typeof fetch;
}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  return async (token: string, event: string, topic: Round2Topic): Promise<string> => {
    if (!options.secret) throw new Round2Error("LEAD_CAPTURE_NOT_READY");
    let data: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret: options.secret, response: token, idempotency_key: event }),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (!response.ok) throw new Round2Error("LEAD_CAPTURE_UNAVAILABLE");
        try { data = await response.json(); } catch { throw new Round2Error("LEAD_CAPTURE_UNAVAILABLE"); }
        break;
      } catch (error) {
        if (error instanceof Round2Error || attempt === 1) throw new Round2Error("LEAD_CAPTURE_UNAVAILABLE");
      }
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Round2Error("LEAD_CAPTURE_UNAVAILABLE");
    const result = data as Record<string, unknown>;
    if (typeof result.success !== "boolean" || (result.success && ["hostname", "action", "challenge_ts"].some(key => typeof result[key] !== "string"))
      || (Array.isArray(result["error-codes"]) && result["error-codes"].includes("internal-error"))) throw new Round2Error("LEAD_CAPTURE_UNAVAILABLE");
    const time = now();
    const challengeAt = typeof result.challenge_ts === "string" ? Date.parse(result.challenge_ts) : NaN;
    if (result.success !== true || result.hostname !== options.hostname || result.action !== `mumeok_r2_${topic}`
      || !Number.isFinite(challengeAt) || challengeAt > time + 30_000 || challengeAt < time - 300_000) {
      throw new Round2Error("TURNSTILE_FAILED");
    }
    return new Date(time).toISOString();
  };
}
