export type CookingContractVersion = "legacy_v1" | "snapshot_v2";

export function resolveStoredCookingVersion({
  routeVersion,
  storedContractVersion,
}: {
  clientRelease: "current" | "immediate_previous";
  routeVersion: CookingContractVersion;
  storedContractVersion: CookingContractVersion;
  body: unknown;
}) {
  return routeVersion === storedContractVersion
    ? { ok: true as const, contractVersion: storedContractVersion }
    : {
        ok: false as const,
        status: 404 as const,
        code: "RESOURCE_NOT_FOUND" as const,
      };
}

export function evaluateSnapshotV2Drain({
  creationEnabled,
  storedContractVersion,
  seeded,
}: {
  creationEnabled: boolean;
  storedContractVersion: CookingContractVersion;
  seeded: boolean;
}) {
  const drainable = storedContractVersion === "snapshot_v2" && seeded;
  return {
    read: drainable,
    cancel: drainable,
    complete: drainable,
    start: creationEnabled && storedContractVersion === "snapshot_v2",
  };
}
