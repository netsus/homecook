export const SESSION_ROLLOVER_RUN_COUNT = 4;
export const SESSION_ROLLOVER_TOTAL_TOKENS = 100000;
export const SESSION_ROLLOVER_COST_USD = 3;

function normalizeUsage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const inputTokens =
    Number.isInteger(value.input_tokens) && value.input_tokens >= 0 ? value.input_tokens : null;
  const outputTokens =
    Number.isInteger(value.output_tokens) && value.output_tokens >= 0 ? value.output_tokens : null;
  const totalTokens =
    Number.isInteger(value.total_tokens) && value.total_tokens >= 0
      ? value.total_tokens
      : (inputTokens ?? 0) + (outputTokens ?? 0);

  if (inputTokens === null && outputTokens === null && totalTokens === 0) {
    return null;
  }

  return {
    input_tokens: inputTokens ?? 0,
    output_tokens: outputTokens ?? 0,
    total_tokens: totalTokens,
  };
}

export function resolveSessionTelemetry(sessionEntry) {
  const hasSessionId =
    typeof sessionEntry?.session_id === "string" && sessionEntry.session_id.trim().length > 0;
  const generation =
    Number.isInteger(sessionEntry?.generation) && sessionEntry.generation >= 1
      ? sessionEntry.generation
      : hasSessionId
        ? 1
        : null;
  const runCount =
    Number.isInteger(sessionEntry?.run_count) && sessionEntry.run_count >= 0
      ? sessionEntry.run_count
      : 0;
  const lastUsage = normalizeUsage(sessionEntry?.last_usage);
  const cumulativeUsage = normalizeUsage(sessionEntry?.cumulative_usage);
  const lastCostUsd =
    typeof sessionEntry?.last_cost_usd === "number" &&
    Number.isFinite(sessionEntry.last_cost_usd) &&
    sessionEntry.last_cost_usd >= 0
      ? sessionEntry.last_cost_usd
      : null;
  const cumulativeCostUsd =
    typeof sessionEntry?.cumulative_cost_usd === "number" &&
    Number.isFinite(sessionEntry.cumulative_cost_usd) &&
    sessionEntry.cumulative_cost_usd >= 0
      ? sessionEntry.cumulative_cost_usd
      : null;
  const rolloverReasons = [];

  if (runCount >= SESSION_ROLLOVER_RUN_COUNT) {
    rolloverReasons.push(`run_count>=${SESSION_ROLLOVER_RUN_COUNT}`);
  }
  if ((cumulativeUsage?.total_tokens ?? 0) >= SESSION_ROLLOVER_TOTAL_TOKENS) {
    rolloverReasons.push(`total_tokens>=${SESSION_ROLLOVER_TOTAL_TOKENS}`);
  }
  if ((cumulativeCostUsd ?? 0) >= SESSION_ROLLOVER_COST_USD) {
    rolloverReasons.push(`cost_usd>=${SESSION_ROLLOVER_COST_USD}`);
  }

  return {
    generation,
    runCount,
    lastUsage,
    cumulativeUsage,
    lastCostUsd,
    cumulativeCostUsd,
    rolloverRecommended: rolloverReasons.length > 0,
    rolloverReason: rolloverReasons.length > 0 ? rolloverReasons.join(", ") : null,
  };
}
