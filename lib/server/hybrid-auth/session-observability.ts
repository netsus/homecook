export const SESSION_AUTHORITY_REASON_MARKER =
  "HOMECOOK_SESSION_AUTHORITY_REASON::";

export const SESSION_AUTHORITY_FAILURE_REASONS = [
  "revoked",
  "missing",
  "identity_mismatch",
  "generation_mismatch",
  "non_monotonic",
  "auth_unavailable",
] as const;

export type SessionAuthorityFailureReason =
  typeof SESSION_AUTHORITY_FAILURE_REASONS[number];

const SESSION_AUTHORITY_FAILURE_REASON_SET = new Set<string>(
  SESSION_AUTHORITY_FAILURE_REASONS,
);

const UNEXPECTED_SESSION_AUTHORITY_FAILURE_REASONS = new Set<
  SessionAuthorityFailureReason
>([
  "identity_mismatch",
  "generation_mismatch",
  "non_monotonic",
  "auth_unavailable",
]);

export function readSessionAuthorityFailureReason(
  error: unknown,
): SessionAuthorityFailureReason {
  if (!error || typeof error !== "object") {
    return "auth_unavailable";
  }

  const candidate = error as Record<string, unknown>;
  const detail = ["details", "hint", "message", "code"]
    .map((field) => candidate[field])
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const markerIndex = detail.indexOf(SESSION_AUTHORITY_REASON_MARKER);
  if (markerIndex < 0) {
    return "auth_unavailable";
  }

  const reason = detail
    .slice(markerIndex + SESSION_AUTHORITY_REASON_MARKER.length)
    .split(/[^a-z_]/u, 1)[0];
  return SESSION_AUTHORITY_FAILURE_REASON_SET.has(reason)
    ? reason as SessionAuthorityFailureReason
    : "auth_unavailable";
}

export function isUnexpectedSessionAuthorityFailure(
  reason: SessionAuthorityFailureReason | undefined,
) {
  return reason !== undefined
    && UNEXPECTED_SESSION_AUTHORITY_FAILURE_REASONS.has(reason);
}
