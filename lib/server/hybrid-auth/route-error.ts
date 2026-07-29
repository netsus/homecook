import { fail } from "@/lib/api/response";

type HybridAuthorityPublicCode =
  | "ACCOUNT_LIFECYCLE_MAINTENANCE"
  | "ACCOUNT_SESSION_STALE";

const HYBRID_AUTHORITY_RESPONSES: Record<
  HybridAuthorityPublicCode,
  { message: string; status: number }
> = {
  ACCOUNT_LIFECYCLE_MAINTENANCE: {
    message: "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.",
    status: 503,
  },
  ACCOUNT_SESSION_STALE: {
    message: "세션을 다시 확인해 주세요.",
    status: 409,
  },
};

export const HYBRID_AUTHORITY_ROUTE_ERROR_MARKER = "HOMECOOK_HYBRID_AUTHORITY";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMarker(value: string): HybridAuthorityPublicCode | null {
  const match = new RegExp(
    `^${HYBRID_AUTHORITY_ROUTE_ERROR_MARKER}::(ACCOUNT_LIFECYCLE_MAINTENANCE|ACCOUNT_SESSION_STALE)::(409|503)$`,
  ).exec(value);
  if (!match) {
    return null;
  }

  const [, publicCode, publicStatus] = match;
  if (
    publicCode === "ACCOUNT_LIFECYCLE_MAINTENANCE"
    && publicStatus === "503"
  ) {
    return publicCode;
  }
  if (publicCode === "ACCOUNT_SESSION_STALE" && publicStatus === "409") {
    return publicCode;
  }

  return null;
}

function readAuthorityPublicCode(error: unknown): HybridAuthorityPublicCode | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) {
      return null;
    }

    const publicCode = current.publicCode;
    const publicStatus = current.publicStatus;
    if (
      (publicCode === "ACCOUNT_LIFECYCLE_MAINTENANCE" && publicStatus === 503)
      || (publicCode === "ACCOUNT_SESSION_STALE" && publicStatus === 409)
    ) {
      return publicCode;
    }

    for (const key of ["details", "hint", "message"] as const) {
      const candidate = current[key];
      if (typeof candidate !== "string") {
        continue;
      }
      const parsed = parseMarker(candidate);
      if (parsed) {
        return parsed;
      }
    }

    current = current.cause;
  }

  return null;
}

export function createHybridAuthorityRouteError(error: unknown) {
  const publicCode = readAuthorityPublicCode(error);
  if (!publicCode) {
    return null;
  }

  const publicError = HYBRID_AUTHORITY_RESPONSES[publicCode];
  return fail(publicCode, publicError.message, publicError.status);
}

export function withHybridAuthorityRouteError<TArgs extends unknown[]>(
  fallbackMessage: string,
  handler: (...args: TArgs) => Promise<Response>,
) {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return createHybridAuthorityRouteError(error)
        ?? fail("INTERNAL_ERROR", fallbackMessage, 500);
    }
  };
}
