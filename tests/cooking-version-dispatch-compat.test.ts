import { describe, expect, it } from "vitest";

import {
  evaluateSnapshotV2Drain,
  resolveStoredCookingVersion,
} from "@/lib/server/cooking-version-compat";

describe("stored cooking version compatibility", () => {
  it.each(["current", "immediate_previous"] as const)(
    "dispatches %s clients only from the stored contract version",
    (clientRelease) => {
      expect(resolveStoredCookingVersion({
        clientRelease,
        routeVersion: "legacy_v1",
        storedContractVersion: "legacy_v1",
        body: { mode: "snapshot_v2", expected_recipe_revision: 3 },
      })).toEqual({ ok: true, contractVersion: "legacy_v1" });
      expect(resolveStoredCookingVersion({
        clientRelease,
        routeVersion: "snapshot_v2",
        storedContractVersion: "snapshot_v2",
        body: { consumed_ingredient_ids: [] },
      })).toEqual({ ok: true, contractVersion: "snapshot_v2" });
    },
  );

  it("rejects cross-version IDs instead of body inference or parser sharing", () => {
    expect(resolveStoredCookingVersion({
      clientRelease: "current",
      routeVersion: "legacy_v1",
      storedContractVersion: "snapshot_v2",
      body: { consumed_ingredient_ids: [] },
    })).toEqual({ ok: false, status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it("drains seeded v2 read/cancel/complete while rollback keeps new writes closed", () => {
    expect(evaluateSnapshotV2Drain({
      creationEnabled: false,
      storedContractVersion: "snapshot_v2",
      seeded: true,
    })).toEqual({ read: true, cancel: true, complete: true, start: false });
    expect(evaluateSnapshotV2Drain({
      creationEnabled: false,
      storedContractVersion: "legacy_v1",
      seeded: false,
    })).toEqual({ read: false, cancel: false, complete: false, start: false });
  });
});
