import { Round2Error } from "@/lib/marketing-round2";
import { createMarketingRound2Handler, round2Failure } from "@/lib/server/marketing-round2";
import { assertRound2Secrets, checkRound2LeadReadiness, readRound2RuntimeConfig, resolveRound2TrustedIp } from "@/lib/server/marketing-round2-runtime";
import { createRound2FileStorage } from "@/lib/server/marketing-round2-storage";
import { createRound2TurnstileVerifier } from "@/lib/server/marketing-round2-turnstile";
import { createMarketingRound2InternalClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const config = readRound2RuntimeConfig();
    const storage = createRound2FileStorage({ ...config, rateSecret: config.secrets.rate });
    return await createMarketingRound2Handler({
      config,
      readControl: async () => { assertRound2Secrets(config); return storage.readControl(); },
      consumeRate: storage.consumeRate,
      acquireControlLease: storage.acquireControlLease,
      trustedIp: request => resolveRound2TrustedIp(request, config),
      leadReadiness: async () => checkRound2LeadReadiness(config, await storage.readControl()),
      verifyTurnstile: createRound2TurnstileVerifier({ secret: config.turnstileSecret, hostname: config.hostname }),
      execute: async command => {
        const client = createMarketingRound2InternalClient();
        if (!client) throw new Round2Error("ROUND2_UNAVAILABLE");
        return client.execute(command);
      },
    })(request);
  } catch (error) { return round2Failure(error); }
}
const methodNotAllowed = async (request: Request) => { void request; return round2Failure(new Round2Error("METHOD_NOT_ALLOWED")); };
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
