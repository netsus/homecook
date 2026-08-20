type TelemetryState = "complete" | "unavailable" | "partial" | "stale" | "query_error";

export function evaluateCompatibilityRemovalGate(input: {
  telemetryState: TelemetryState;
  releaseId: string;
  headSha: string;
  observationWindowComplete: boolean;
  currentClientObserved: boolean;
  immediatePreviousClientObserved: boolean;
  noKeyCount: number;
  activeLegacyTerminalCount: number;
  newLegacyStartsBlocked: boolean;
  seededV2DrainGreen: boolean;
  rollbackDrainGreen: boolean;
  approvedContractEvolution: boolean;
}) {
  if (input.telemetryState !== "complete") {
    return {
      allowed: false as const,
      removalCount: 0 as const,
      reason: `telemetry_${input.telemetryState}`,
    };
  }
  if (!input.approvedContractEvolution) {
    return {
      allowed: false as const,
      removalCount: 0 as const,
      reason: "approved_contract_required" as const,
    };
  }
  const evidenceComplete = input.observationWindowComplete
    && input.currentClientObserved
    && input.immediatePreviousClientObserved
    && input.noKeyCount === 0
    && input.activeLegacyTerminalCount === 0
    && input.newLegacyStartsBlocked
    && input.seededV2DrainGreen
    && input.rollbackDrainGreen
    && /^[a-f0-9]{40}$/iu.test(input.headSha)
    && input.releaseId.length > 0;
  return evidenceComplete
    ? { allowed: true as const, removalCount: 1 as const, reason: "approved" as const }
    : { allowed: false as const, removalCount: 0 as const, reason: "evidence_incomplete" as const };
}
