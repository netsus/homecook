import { describe, expect, it } from "vitest";

import {
  assertIsolatedDrillTarget,
  buildIsolatedDrillPlan,
  filterRunningIsolatedContainers,
  mapStorageRowsToPayloadReferences,
} from "@/scripts/lib/isolated-local-backup-restore-drill.mjs";

describe("isolated local Supabase backup and restore drill", () => {
  it("pins every mutable target to a disposable drill namespace", () => {
    expect(buildIsolatedDrillPlan({ suffix: "fixtr001" })).toMatchObject({
      cli_version: "2.110.0",
      destructive_scope: "isolated-fixture-only",
      project_id: "homecook-backup-drill-fixtr001",
      source_storage_container: "supabase_storage_homecook-backup-drill-fixtr001",
      source_storage_volume: "supabase_storage_homecook-backup-drill-fixtr001",
      restore_project_id: "homecook-backup-drill-fixtr001-restore",
      restore_storage_volume: "supabase_storage_homecook-backup-drill-fixtr001-restore",
    });
  });

  it.each([
    "homecook",
    "homecook-full-local-storage",
    "supabase_storage_homecook",
    "production-storage",
  ])("rejects non-isolated target %s", (target) => {
    expect(() => assertIsolatedDrillTarget(target)).toThrow(/isolated|drill/iu);
  });

  it("rejects suffixes that would make Supabase truncate restore resource names", () => {
    expect(() => buildIsolatedDrillPlan({ suffix: "fixture-too-long" }))
      .toThrow(/suffix/iu);
  });

  it("maps database object identity to the local file backend payload path", () => {
    expect(mapStorageRowsToPayloadReferences([
      {
        bucket_id: "fixture",
        name: "owner-a/object.bin",
        version: "version-1",
      },
    ], ["stub/stub/fixture/owner-a/object.bin/version-1"])).toEqual([
      {
        path: "stub/stub/fixture/owner-a/object.bin/version-1",
        reference: "fixture/owner-a/object.bin",
      },
    ]);
  });

  it("fails closed when one database reference cannot resolve one exact payload", () => {
    const rows = [{
      bucket_id: "fixture",
      name: "owner-a/object.bin",
      version: "version-1",
    }];
    expect(() => mapStorageRowsToPayloadReferences(rows, []))
      .toThrow(/exact Storage payload/iu);
    expect(() => mapStorageRowsToPayloadReferences(rows, [
      "fixture/owner-a/object.bin/version-1",
      "stub/stub/fixture/owner-a/object.bin/version-1",
    ])).toThrow(/exact Storage payload/iu);
  });

  it("stops only running isolated writers during a cut", () => {
    expect(filterRunningIsolatedContainers([
      { name: "supabase_auth_homecook-backup-drill-fixture01", running: true },
      { name: "supabase_rest_homecook-backup-drill-fixture01", running: false },
      { name: "supabase_storage_homecook-backup-drill-fixture01", running: true },
    ])).toEqual([
      "supabase_auth_homecook-backup-drill-fixture01",
      "supabase_storage_homecook-backup-drill-fixture01",
    ]);
  });
});
