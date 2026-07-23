import { fail } from "@/lib/api/response";

export type AccountGenerationCapabilityState
  = "legacy" | "cutover_maintenance" | "generation_active";

export type QuarantineResolutionAction = "activate" | "delete";

interface QueryError {
  message: string;
}

interface CapabilityRow {
  state: AccountGenerationCapabilityState;
  revision: number;
}

type AccountGenerationCapabilityRead =
  | {
      ok: true;
      state: AccountGenerationCapabilityState;
      revision: number;
    }
  | {
      ok: false;
    };

interface QuarantineResolutionRequestBody {
  action?: unknown;
  profile?: {
    nickname?: unknown;
  } | null;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAccountGenerationCapabilityState(
  value: unknown,
): value is AccountGenerationCapabilityState {
  return value === "legacy"
    || value === "cutover_maintenance"
    || value === "generation_active";
}

function normalizeNickname(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRequestRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readAccountGenerationCapability(
  dbClient: unknown,
): Promise<AccountGenerationCapabilityRead> {
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
      error?: QueryError | null;
    };

    if (result?.error || !result?.data) {
      return { ok: false };
    }

    if (
      !isAccountGenerationCapabilityState(result.data.state)
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

export function readRequiredIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";

  if (!key) {
    return {
      ok: false as const,
      response: fail(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key 헤더를 확인해 주세요.",
        428,
        [{ field: "Idempotency-Key", reason: "required" }],
      ),
    };
  }

  if (!UUID_PATTERN.test(key)) {
    return {
      ok: false as const,
      response: fail(
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key 헤더를 확인해 주세요.",
        400,
        [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
      ),
    };
  }

  return {
    ok: true as const,
    idempotencyKey: key,
  };
}

export async function parseQuarantineResolutionRequest(request: Request): Promise<
  | {
      ok: true;
      action: QuarantineResolutionAction;
      nickname: string | null;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  let body: QuarantineResolutionRequestBody;

  try {
    body = (await request.json()) as QuarantineResolutionRequestBody;
  } catch {
    return {
      ok: false,
      response: fail("INVALID_REQUEST", "요청 본문을 확인해 주세요.", 400, [
        { field: "body", reason: "invalid_json" },
      ]),
    };
  }

  if (!isRequestRecord(body)) {
    return {
      ok: false,
      response: fail("INVALID_REQUEST", "요청 본문을 확인해 주세요.", 400, [
        { field: "body", reason: "invalid_object" },
      ]),
    };
  }

  if (body.action !== "activate" && body.action !== "delete") {
    return {
      ok: false,
      response: fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, [
        { field: "action", reason: "invalid_value" },
      ]),
    };
  }

  if (body.action === "delete") {
    return {
      ok: true,
      action: "delete",
      nickname: null,
    };
  }

  if (!isRequestRecord(body.profile)) {
    return {
      ok: false,
      response: fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, [
        { field: "profile", reason: "invalid_object" },
      ]),
    };
  }

  const nickname = normalizeNickname(body.profile.nickname);
  if (nickname.length < 2 || nickname.length > 30) {
    return {
      ok: false,
      response: fail("VALIDATION_ERROR", "닉네임은 2~30자여야 해요.", 422, [
        { field: "profile.nickname", reason: "length" },
      ]),
    };
  }

  return {
    ok: true,
    action: "activate",
    nickname,
  };
}

export function createAccountLifecycleMaintenanceResponse() {
  return fail(
    "ACCOUNT_LIFECYCLE_MAINTENANCE",
    "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.",
    503,
  );
}

export function createCapabilityUnavailableResponse() {
  return fail("INTERNAL_ERROR", "계정 상태를 확인하지 못했어요.", 500);
}

export function createLegacyHiddenResponse() {
  return fail("RESOURCE_NOT_FOUND", "요청한 기능을 찾을 수 없어요.", 404);
}
