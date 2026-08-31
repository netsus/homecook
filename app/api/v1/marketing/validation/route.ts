import { fail } from "@/lib/api/response";
import {
  createConfiguredMarketingValidationHandler,
  readMarketingValidationAllowedOriginsFromEnv,
  readMarketingPaidAttributionOriginsFromEnv,
} from "@/lib/server/marketing-validation-route";
import type { MarketingValidationPersistenceClient } from "@/types/marketing-validation";
import { createMarketingValidationInternalClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let client: MarketingValidationPersistenceClient | null;
  try {
    client = createMarketingValidationInternalClient();
  } catch {
    return fail(
      "LEAD_CAPTURE_UNAVAILABLE",
      "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  if (!client) {
    return fail(
      "LEAD_CAPTURE_UNAVAILABLE",
      "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  let allowedOrigins: string[];
  let paidAttributionOrigins: string[];
  try {
    allowedOrigins = readMarketingValidationAllowedOriginsFromEnv();
    paidAttributionOrigins = readMarketingPaidAttributionOriginsFromEnv(
      allowedOrigins,
    );
  } catch {
    return fail(
      "LEAD_CAPTURE_UNAVAILABLE",
      "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  const handler = createConfiguredMarketingValidationHandler(
    client,
    allowedOrigins,
    paidAttributionOrigins,
  );

  return handler(request);
}
