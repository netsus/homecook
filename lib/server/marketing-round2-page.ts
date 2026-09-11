import { CAMPAIGN_END, CAMPAIGN_START, type Round2Topic } from "@/lib/marketing-round2";
import { createRound2PageContext, normalizeRound2Attribution, resolveRound2Topic, type Round2Attribution } from "@/lib/server/marketing-round2-context";
import { assertRound2Secrets, checkRound2LeadReadiness, isRound2LocalPreview, type Round2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";
import { createRound2FileStorage } from "@/lib/server/marketing-round2-storage";

export type Round2PageProps = {
  topic: Round2Topic;
  pageContext: string;
  attribution: Round2Attribution;
  preview: boolean;
  leadReady: boolean;
  turnstileSiteKey: string;
};
type PageResult = { kind: "page"; props: Round2PageProps } | { kind: "redirect"; location: string } | null;

/** GET signs page context only. Participation is read by the browser's POST bootstrap. */
export async function buildRound2Page(input: {
  pathname: string;
  host: string;
  rawSearch: string;
  config: Round2RuntimeConfig;
  now?: number;
  siteKey: string;
}): Promise<PageResult> {
  const { config, host, rawSearch } = input;
  const pathname = input.pathname.endsWith("/") ? input.pathname.slice(0, -1) : input.pathname;
  const topic = resolveRound2Topic(pathname);
  if (!topic) return null;
  const preview = isRound2LocalPreview(host, config);
  if (!preview && (!config.enabled || config.localPreview || host !== new URL(config.origin).host)) return null;
  if (pathname !== input.pathname) return { kind: "redirect", location: pathname };
  const attribution = normalizeRound2Attribution(rawSearch, topic);
  if (preview) return { kind: "page", props: { topic, attribution, preview: true, pageContext: "", leadReady: true, turnstileSiteKey: "" } };
  const now = input.now ?? Date.now();
  // Never emit a usable signed context outside the approved collection window.
  if (now < Date.parse(CAMPAIGN_START) || now >= Date.parse(CAMPAIGN_END)) return null;
  try { assertRound2Secrets(config); } catch { return null; }
  const pageContext = createRound2PageContext(topic, rawSearch, config.secrets.page, Math.floor(now / 1000));
  let leadReady = false;
  const siteKey = input.siteKey.trim();
  if (siteKey) {
    try {
      const storage = createRound2FileStorage({ ...config, rateSecret: config.secrets.rate });
      await checkRound2LeadReadiness(config, await storage.readControl(), now);
      leadReady = true;
    } catch { /* The menu and anonymous activities remain available during a lead readiness failure. */ }
  }
  return { kind: "page", props: { topic, attribution, pageContext, preview: false, leadReady, turnstileSiteKey: leadReady ? siteKey : "" } };
}
