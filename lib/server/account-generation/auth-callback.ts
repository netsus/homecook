import type {
  AccountGenerationBootstrapSessionAuthority,
} from "./session-authority";

export type AccountGenerationCapabilityState =
  | "legacy"
  | "cutover_maintenance"
  | "generation_active";

interface CapabilityRow {
  state: AccountGenerationCapabilityState;
  revision: number;
}

type CapabilityReadResult =
  | {
      ok: true;
      state: AccountGenerationCapabilityState;
      revision: number;
    }
  | {
      ok: false;
    };

export type AccountGenerationBootstrapErrorCode =
  | "ACCOUNT_CUTOVER_QUARANTINED"
  | "ACCOUNT_CUTOVER_UNCLASSIFIED"
  | "ACCOUNT_DELETING"
  | "ACCOUNT_DELETION_PENDING"
  | "ACCOUNT_GENERATION_STALE"
  | "ACCOUNT_SESSION_STALE";

type AccountGenerationBootstrapResult =
  | {
      ok: true;
      accountGeneration: number;
      nickname: string;
    }
  | {
      ok: false;
      errorCode: AccountGenerationBootstrapErrorCode | null;
    };

function isCapabilityState(
  value: unknown,
): value is AccountGenerationCapabilityState {
  return value === "legacy"
    || value === "cutover_maintenance"
    || value === "generation_active";
}

export async function readAuthCallbackAccountGenerationCapability(
  dbClient: unknown,
): Promise<CapabilityReadResult> {
  if (!dbClient || typeof dbClient !== "object") {
    return { ok: false };
  }

  const rpc = Reflect.get(dbClient, "rpc");
  if (typeof rpc !== "function") {
    return { ok: false };
  }

  try {
    const result = (await rpc.call(
      dbClient,
      "get_account_generation_capability",
    )) as {
      data?: CapabilityRow | null;
      error?: { message: string } | null;
    };

    if (result?.error || !result?.data) {
      return { ok: false };
    }

    if (
      !isCapabilityState(result.data.state)
      || !Number.isInteger(result.data.revision)
      || result.data.revision <= 0
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      state: result.data.state,
      revision: result.data.revision,
    };
  } catch {
    return { ok: false };
  }
}

function readBootstrapErrorCode(
  error: { code?: string; message?: string } | null | undefined,
) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  const codes: AccountGenerationBootstrapErrorCode[] = [
    "ACCOUNT_CUTOVER_QUARANTINED",
    "ACCOUNT_CUTOVER_UNCLASSIFIED",
    "ACCOUNT_DELETING",
    "ACCOUNT_DELETION_PENDING",
    "ACCOUNT_GENERATION_STALE",
    "ACCOUNT_SESSION_STALE",
  ];
  return codes.find((code) => detail.includes(code)) ?? null;
}

export async function bootstrapAuthCallbackAccountGenerationIdentity(
  dbClient: unknown,
  authority: AccountGenerationBootstrapSessionAuthority,
): Promise<AccountGenerationBootstrapResult> {
  if (!dbClient || typeof dbClient !== "object") {
    return { ok: false, errorCode: null };
  }

  const rpc = Reflect.get(dbClient, "rpc");
  if (typeof rpc !== "function") {
    return { ok: false, errorCode: null };
  }

  try {
    const result = (await rpc.call(
      dbClient,
      "bootstrap_account_generation_identity",
      {
        p_owner_uuid: authority.ownerUuid,
        p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt,
        p_session_key_hash: authority.sessionKeyHash,
        p_hmac_key_version: authority.hmacKeyVersion,
        p_session_issued_at: authority.sessionIssuedAt,
      },
    )) as {
      data?: {
        account_generation?: unknown;
        nickname?: unknown;
      } | null;
      error?: { code?: string; message?: string } | null;
    };

    if (result.error || !result.data) {
      return {
        ok: false,
        errorCode: readBootstrapErrorCode(result.error),
      };
    }

    const accountGeneration = result.data.account_generation;
    const nickname = result.data.nickname;
    if (
      !Number.isInteger(accountGeneration)
      || Number(accountGeneration) <= 0
      || typeof nickname !== "string"
    ) {
      return { ok: false, errorCode: null };
    }

    return {
      ok: true,
      accountGeneration: Number(accountGeneration),
      nickname,
    };
  } catch {
    return { ok: false, errorCode: null };
  }
}
