import { normalizeAuthProviderId } from "@/lib/auth/providers";
import type { AuthFlowKind } from "@/lib/server/full-local-auth/flow-ledger";
import {
  readAuthFlowAttempt,
  terminalAuthFlowAttempt,
} from "@/lib/server/full-local-auth/runtime";

export async function readCallbackAuthFlow({
  cookieValue,
  expectedFlowKind,
  providerHint,
}: {
  cookieValue: string | undefined;
  expectedFlowKind: AuthFlowKind;
  providerHint: string | null;
}) {
  void providerHint;
  if (!cookieValue) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const result = await readAuthFlowAttempt(cookieValue);
  if (
    !result.ok
    || result.attempt.flow_kind !== expectedFlowKind
    || result.attempt.terminal_at !== null
    || result.attempt.terminal_reason !== null
  ) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const provider = normalizeAuthProviderId(result.attempt.provider);
  return provider
    ? { ok: true as const, provider }
    : { ok: false as const, reason: "invalid" as const };
}

export async function terminalCallbackAuthFlow(
  cookieValue: string,
  reason: "success" | "error" | "cutover_rejected",
) {
  const result = await terminalAuthFlowAttempt(cookieValue, reason);
  return { ok: result.ok } as const;
}
