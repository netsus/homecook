interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface ExternalWriteRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

interface StartAttempt {
  attemptId: string;
  attemptToken: string;
  deadlineAt: string;
  leaseExpiresAt: string;
}

type ExternalWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false };

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function parseStartAttempt(value: unknown): StartAttempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attemptId = readString(record, "attempt_id");
  const attemptToken = readString(record, "attempt_token");
  const deadlineAt = readString(record, "deadline_at");
  const leaseExpiresAt = readString(record, "lease_expires_at");

  if (
    !attemptId
    || !attemptToken
    || !deadlineAt
    || !leaseExpiresAt
    || record.state !== "started"
    || !Number.isFinite(Date.parse(deadlineAt))
    || !Number.isFinite(Date.parse(leaseExpiresAt))
  ) {
    return null;
  }

  return {
    attemptId,
    attemptToken,
    deadlineAt,
    leaseExpiresAt,
  };
}

function isFinalizedAttempt(
  value: unknown,
  attempt: StartAttempt,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.attempt_id === attempt.attemptId
    && record.deadline_at === attempt.deadlineAt
    && record.state === "finalized";
}

async function finalizeAttempt(
  client: ExternalWriteRpcClient,
  attemptToken: string,
  outcome: "succeeded" | "failed",
): Promise<RpcResult | null> {
  try {
    return await client.rpc("finalize_legacy_external_write_attempt", {
      p_attempt_token: attemptToken,
      p_outcome: outcome,
    });
  } catch {
    return null;
  }
}

export async function runLegacyExternalWrite<T>({
  client,
  objectPath,
  ownerUuid,
  write,
}: {
  client: ExternalWriteRpcClient;
  objectPath: string;
  ownerUuid: string;
  write: () => Promise<T>;
}): Promise<ExternalWriteResult<T>> {
  let startResult: RpcResult;
  try {
    startResult = await client.rpc("start_legacy_external_write_attempt", {
      p_object_path: objectPath,
      p_owner_uuid: ownerUuid,
    });
  } catch {
    return { ok: false };
  }

  if (startResult.error) {
    return { ok: false };
  }

  const attempt = parseStartAttempt(startResult.data);
  if (!attempt) {
    return { ok: false };
  }

  let value: T;
  try {
    value = await write();
  } catch {
    await finalizeAttempt(client, attempt.attemptToken, "failed");
    return { ok: false };
  }

  const finishResult = await finalizeAttempt(
    client,
    attempt.attemptToken,
    "succeeded",
  );
  if (
    !finishResult
    || finishResult.error
    || !isFinalizedAttempt(finishResult.data, attempt)
  ) {
    return { ok: false };
  }

  return { ok: true, value };
}
