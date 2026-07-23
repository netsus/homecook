import { createHash, timingSafeEqual } from "node:crypto";

export const ACCOUNT_MAINTENANCE_PHASES = [
  "scanner",
  "terminal_tombstone_scan",
  "quarantine_recheck",
  "normal_drain",
  "expected_owner_signal_union_zero",
  "auth_delete",
  "complete",
] as const;

type AccountMaintenancePhase = (typeof ACCOUNT_MAINTENANCE_PHASES)[number];
type PhaseStatus = "blocked" | "completed" | "failed" | "feature_off";

interface OwnerSignalEvidence {
  available: boolean;
  unionZero: boolean;
}

export interface AccountMaintenanceTickDependencies {
  scanner?: () => Promise<void>;
  terminalTombstoneScan?: () => Promise<void>;
  quarantineRecheck?: () => Promise<void>;
  normalDrain?: () => Promise<void>;
  expectedOwnerSignalUnionZero?: () => Promise<OwnerSignalEvidence>;
  authDelete?: () => Promise<void>;
  complete?: () => Promise<void>;
  jointActivationReady?: boolean;
}

interface PhaseResult {
  phase: AccountMaintenancePhase;
  status: PhaseStatus;
}

export interface AccountMaintenanceTickResult {
  featureState: "feature_off" | "joint_activation_ready";
  status: "blocked" | "completed" | "failed";
  blockedAt: AccountMaintenancePhase | null;
  phases: PhaseResult[];
}

function digestSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isMaintenanceWorkerAuthorized(
  authorizationHeader: string | null,
  configuredSecret: string | undefined,
) {
  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader ?? "");
  const candidateSecret = match?.[1] ?? "";
  const expectedSecret = configuredSecret ?? "";
  const matches = timingSafeEqual(
    digestSecret(candidateSecret),
    digestSecret(expectedSecret),
  );

  return (
    match !== null &&
    candidateSecret.length > 0 &&
    expectedSecret.length >= 32 &&
    matches
  );
}

function fillBlockedPhases(
  phases: PhaseResult[],
  afterPhase: AccountMaintenancePhase,
) {
  const startIndex = ACCOUNT_MAINTENANCE_PHASES.indexOf(afterPhase) + 1;

  for (const phase of ACCOUNT_MAINTENANCE_PHASES.slice(startIndex)) {
    phases.push({ phase, status: "blocked" });
  }
}

async function runOptionalPhase(
  phases: PhaseResult[],
  phase: AccountMaintenancePhase,
  handler: (() => Promise<void>) | undefined,
) {
  if (!handler) {
    phases.push({ phase, status: "feature_off" });
    return true;
  }

  try {
    await handler();
    phases.push({ phase, status: "completed" });
    return true;
  } catch {
    phases.push({ phase, status: "failed" });
    return false;
  }
}

export async function runAccountMaintenanceTick(
  dependencies: AccountMaintenanceTickDependencies = {},
): Promise<AccountMaintenanceTickResult> {
  const phases: PhaseResult[] = [];
  const orderedStoragePhases = [
    ["scanner", dependencies.scanner],
    ["terminal_tombstone_scan", dependencies.terminalTombstoneScan],
    ["quarantine_recheck", dependencies.quarantineRecheck],
    ["normal_drain", dependencies.normalDrain],
  ] as const;

  for (const [phase, handler] of orderedStoragePhases) {
    if (!handler) {
      phases.push({ phase, status: "feature_off" });
      fillBlockedPhases(phases, phase);
      return {
        featureState: "feature_off",
        status: "blocked",
        blockedAt: phase,
        phases,
      };
    }

    if (!(await runOptionalPhase(phases, phase, handler))) {
      fillBlockedPhases(phases, phase);
      return {
        featureState: "feature_off",
        status: "failed",
        blockedAt: phase,
        phases,
      };
    }
  }

  let ownerSignalEvidence: OwnerSignalEvidence | null = null;
  if (dependencies.expectedOwnerSignalUnionZero) {
    try {
      ownerSignalEvidence =
        await dependencies.expectedOwnerSignalUnionZero();
    } catch {
      phases.push({
        phase: "expected_owner_signal_union_zero",
        status: "failed",
      });
      fillBlockedPhases(phases, "expected_owner_signal_union_zero");
      return {
        featureState: "feature_off",
        status: "failed",
        blockedAt: "expected_owner_signal_union_zero",
        phases,
      };
    }
  }

  if (!ownerSignalEvidence?.available || !ownerSignalEvidence.unionZero) {
    phases.push({
      phase: "expected_owner_signal_union_zero",
      status: ownerSignalEvidence ? "blocked" : "feature_off",
    });
    fillBlockedPhases(phases, "expected_owner_signal_union_zero");
    return {
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "expected_owner_signal_union_zero",
      phases,
    };
  }

  phases.push({
    phase: "expected_owner_signal_union_zero",
    status: "completed",
  });

  if (!dependencies.jointActivationReady) {
    phases.push({ phase: "auth_delete", status: "feature_off" });
    phases.push({ phase: "complete", status: "blocked" });
    return {
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "auth_delete",
      phases,
    };
  }

  if (
    !(await runOptionalPhase(
      phases,
      "auth_delete",
      dependencies.authDelete,
    ))
  ) {
    fillBlockedPhases(phases, "auth_delete");
    return {
      featureState: "feature_off",
      status: "failed",
      blockedAt: "auth_delete",
      phases,
    };
  }

  if (!dependencies.authDelete) {
    phases[phases.length - 1] = {
      phase: "auth_delete",
      status: "blocked",
    };
    fillBlockedPhases(phases, "auth_delete");
    return {
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "auth_delete",
      phases,
    };
  }

  if (
    !(await runOptionalPhase(phases, "complete", dependencies.complete))
  ) {
    return {
      featureState: "feature_off",
      status: "failed",
      blockedAt: "complete",
      phases,
    };
  }

  if (!dependencies.complete) {
    phases[phases.length - 1] = {
      phase: "complete",
      status: "blocked",
    };
    return {
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "complete",
      phases,
    };
  }

  return {
    featureState: "joint_activation_ready",
    status: "completed",
    blockedAt: null,
    phases,
  };
}
