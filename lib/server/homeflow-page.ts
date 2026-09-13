import { normalizeRound2Attribution, createRound2PageContext } from "@/lib/server/marketing-round2-context";
import { isRound2LocalPreview, type Round2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";
import { HOMEFLOW_RESULTS } from "@/lib/marketing/homeflow-content";

export function homeflowPageEntry(host: string, search: string, config: Round2RuntimeConfig, now = Date.now()) {
  const preview = isRound2LocalPreview(host, config);
  const params = new URLSearchParams(search);
  const result = params.getAll("result");
  const sharedResult = result.length === 1 && Object.hasOwn(HOMEFLOW_RESULTS, result[0]) ? result[0] as keyof typeof HOMEFLOW_RESULTS : null;
  let pageContext: string | null = null;
  if (!preview && config.enabled) {
    try { pageContext = createRound2PageContext("homeflow", search, config.secrets.page, now / 1000); } catch { /* Public content stays available while collection is closed. */ }
  }
  return { preview, pageContext, sharedResult, attribution: normalizeRound2Attribution(search, "homeflow") };
}
