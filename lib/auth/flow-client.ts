import type {
  AuthFlowKind,
  AuthFlowProvider,
} from "@/lib/server/full-local-auth/flow-ledger";

interface ApiEnvelope {
  success?: unknown;
  data?: unknown;
  error?: unknown;
}

async function post(path: string, body?: Record<string, unknown>) {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json() as ApiEnvelope;
    return response.ok && payload.success === true && payload.error === null;
  } catch {
    return false;
  }
}

export async function startServerAuthFlow({
  flowKind,
  provider,
}: {
  flowKind: AuthFlowKind;
  provider: AuthFlowProvider;
}) {
  const ok = await post("/auth/flow/start", {
    flow_kind: flowKind,
    provider,
  });
  return { ok } as const;
}

export async function cancelServerAuthFlow() {
  await post("/auth/flow/cancel");
}
