import type { MarketingValidationQuizResult } from "@/types/marketing-validation";
import { buildRound2Page } from "@/lib/server/marketing-round2-page";

const SHARED_RESULTS = new Set<string>(["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"]);

/** Uses the same runtime and host gates as the other R2 routes. */
export async function buildRecordingPage(input: Omit<Parameters<typeof buildRound2Page>[0], "pathname">) {
  const result = await buildRound2Page({ ...input, pathname: "/beta/r2/recording" });
  if (!result || result.kind !== "page") return result;
  const values = new URLSearchParams(input.rawSearch).getAll("result");
  const sharedResult = values.length === 1 && SHARED_RESULTS.has(values[0]) ? values[0] as MarketingValidationQuizResult : null;
  return { ...result, props: { ...result.props, sharedResult } };
}
