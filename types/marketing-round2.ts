import type { Round2Activity, Round2Request, Round2SuccessData, Round2Topic } from "@/lib/marketing-round2";
import type { Round2Attribution, Round2CookieClaims } from "@/lib/server/marketing-round2-context";

export type Round2ControlSnapshot = {
  collection_enabled: boolean;
  lead_enabled: boolean;
  consent_generation: number;
  checked_at: string;
  valid_until: string;
};
export type Round2Command = {
  op: "inspect" | "apply";
  action: Round2Request["action"];
  event_id: string;
  topic: Round2Topic;
  round_version: "r2.1";
  participation_id: string | null;
  bootstrap_intent: "create_or_resume" | "resume" | "cookie_resume" | null;
  bootstrap_digest: string | null;
  activity: Round2Activity | "menu";
  payload: Record<string, unknown>;
  payload_digest: string | null;
  lead: {
    email_normalized: string;
    email_key: string;
    request_digest: string;
    consent_version: "mumeok-r2-beta-notice-20260911";
    purpose: "beta_open_notice";
    consent_generation: number;
    turnstile_verified_at: string | null;
  } | null;
  control: Round2ControlSnapshot;
};
export type Round2Inspection = {
  kind: "inspected";
  data: Round2SuccessData | null;
  bootstrap: { participation_id: string; created_at: string; expires_at: string; first_attribution: Round2Attribution } | null;
  replay: "absent" | "same";
  needs_turnstile: boolean;
};
export type Round2Applied = { kind: "applied"; data: Round2SuccessData; cookie_claims: Round2CookieClaims | null };
export type Round2RpcResult = { data: unknown; error: { code?: string; message?: string } | null; status: number };
export type MarketingRound2InternalClient = { execute(command: Round2Command): Promise<Round2RpcResult> };
