import {
  AuthFlowLedgerStore,
  type AuthAuthority,
  type AuthFlowKind,
  type AuthFlowProvider,
} from "@/lib/server/full-local-auth/flow-ledger";
import { getAuthAuthority } from "@/lib/supabase/auth-env";
import { createAuthFlowInternalDataClient } from "@/lib/supabase/server";

interface FullLocalAuthControl {
  authority: AuthAuthority;
  cutover_epoch: number;
  flows_open: boolean;
}

function requireFlowSecret() {
  const secret = process.env.AUTH_FLOW_HMAC_KEY?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_FLOW_HMAC_KEY 환경 변수는 32 bytes 이상이어야 해요.");
  }
  return secret;
}

function isControl(value: unknown): value is FullLocalAuthControl {
  if (!value || typeof value !== "object") {
    return false;
  }
  const control = value as Record<string, unknown>;
  return (control.authority === "remote" || control.authority === "local")
    && Number.isSafeInteger(control.cutover_epoch)
    && Number(control.cutover_epoch) > 0
    && typeof control.flows_open === "boolean";
}

async function createRuntime() {
  const client = createAuthFlowInternalDataClient();
  if (!client) {
    throw new Error("Auth flow internal client를 만들 수 없어요.");
  }
  const { data, error } = await client.rpc("read_full_local_auth_control", {});
  if (error || !isControl(data)) {
    throw new Error("Auth flow control을 읽지 못했어요.");
  }
  if (data.authority !== getAuthAuthority()) {
    throw new Error("Auth runtime authority와 DB authority가 일치하지 않아요.");
  }
  return {
    control: data,
    store: new AuthFlowLedgerStore({
      authority: data.authority,
      client,
      cutoverEpoch: data.cutover_epoch,
      hmacSecret: requireFlowSecret(),
    }),
  };
}

export async function startAuthFlowAttempt({
  flowKind,
  provider,
}: {
  flowKind: AuthFlowKind;
  provider: AuthFlowProvider;
}) {
  const runtime = await createRuntime();
  if (!runtime.control.flows_open) {
    throw new Error("Auth flow가 maintenance 상태예요.");
  }
  return runtime.store.start({ flowKind, provider });
}

export async function readAuthFlowAttempt(cookieValue: string) {
  const runtime = await createRuntime();
  if (!runtime.control.flows_open) {
    return { ok: false as const, reason: "cutover_rejected" as const };
  }
  return runtime.store.read(cookieValue);
}

export async function terminalAuthFlowAttempt(
  cookieValue: string,
  reason: "success" | "error" | "cancelled" | "cutover_rejected",
) {
  const runtime = await createRuntime();
  return runtime.store.terminal(cookieValue, reason);
}

export async function cancelAuthFlowAttempt(cookieValue: string) {
  const runtime = await createRuntime();
  const cancelled = await runtime.store.terminal(cookieValue, "cancelled");
  if (!cancelled.ok && cancelled.reason === "cutover_rejected") {
    return runtime.store.terminal(cookieValue, "cutover_rejected");
  }
  return cancelled;
}
