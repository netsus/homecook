const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
const POSTGREST_PATTERN = /^PGRST[0-9]{3}$/u;
const LOCAL_SEED_REASON_CODES = Object.freeze([
  Object.freeze({
    code: "legacy_mutation_unavailable",
    messages: Object.freeze([
      "legacy account mutation authority is unavailable",
      "legacy_mutation_unavailable",
    ]),
  }),
  Object.freeze({
    code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    messages: Object.freeze(["ACCOUNT_LIFECYCLE_MAINTENANCE"]),
  }),
  Object.freeze({
    code: "ACCOUNT_GENERATION_STALE",
    messages: Object.freeze(["ACCOUNT_GENERATION_STALE"]),
  }),
  Object.freeze({
    code: "ACCOUNT_SESSION_STALE",
    messages: Object.freeze(["ACCOUNT_SESSION_STALE"]),
  }),
  Object.freeze({
    code: "ACCOUNT_CUTOVER_UNCLASSIFIED",
    messages: Object.freeze(["ACCOUNT_CUTOVER_UNCLASSIFIED"]),
  }),
  Object.freeze({
    code: "ACCOUNT_CUTOVER_QUARANTINED",
    messages: Object.freeze(["ACCOUNT_CUTOVER_QUARANTINED"]),
  }),
  Object.freeze({
    code: "ACCOUNT_DELETING",
    messages: Object.freeze(["ACCOUNT_DELETING"]),
  }),
  Object.freeze({
    code: "ACCOUNT_DELETION_PENDING",
    messages: Object.freeze(["ACCOUNT_DELETION_PENDING"]),
  }),
]);

export function normalizeLocalSeedProviderCode(value) {
  const normalized = typeof value === "string"
    ? value.trim().toUpperCase()
    : "";

  return SQLSTATE_PATTERN.test(normalized)
    || POSTGREST_PATTERN.test(normalized)
    ? normalized
    : "unknown";
}

export function normalizeLocalSeedReasonCode(value) {
  const message = typeof value === "string" ? value : "";
  for (const reason of LOCAL_SEED_REASON_CODES) {
    if (reason.messages.some((knownMessage) => message.includes(knownMessage))) {
      return reason.code;
    }
  }
  return "unknown";
}

function normalizeDiagnosticOperationLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  if (!label) {
    return "seed operation failed";
  }

  return label.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}

export function formatLocalSeedOperationError({
  codesOnly,
  error,
  operationLabel,
}) {
  if (codesOnly) {
    const providerCode = normalizeLocalSeedProviderCode(error?.code);
    const reasonCode = normalizeLocalSeedReasonCode(error?.message);
    return `${normalizeDiagnosticOperationLabel(operationLabel)} [provider_code=${providerCode}] [reason_code=${reasonCode}]`;
  }

  const providerMessage = typeof error?.message === "string"
    ? error.message
    : String(error ?? "unknown error");
  return `${operationLabel}: ${providerMessage}`;
}
