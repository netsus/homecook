import { randomUUID } from "node:crypto";

import type { AccountMaintenanceTickDependencies } from
  "@/lib/account-maintenance/tick";
import { runRecipeImageNormalDrainStorage } from
  "@/lib/server/recipe-image-normal-drain-storage";
import { runRecipeImageQuarantineRecheckStorageScan } from
  "@/lib/server/recipe-image-quarantine-recheck-storage";
import { scanStaleRecipeImageUploads } from
  "@/lib/server/recipe-image-stale-scanner";
import { runRecipeImageTerminalTombstoneStorageScan } from
  "@/lib/server/recipe-image-terminal-tombstone-storage";

const SCAN_LIMIT = 50;

interface RecipeImageMaintenanceDbClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface RecipeImageMaintenanceStorage {
  checkObjectPresence(input: {
    bucketId: string;
    objectPath: string;
  }): Promise<
    | { kind: "absent" }
    | { kind: "failed" }
    | { kind: "present" }
  >;
  deleteObject(input: {
    bucketId: string;
    objectPath: string;
  }): Promise<{ kind: "deleted" | "failed" }>;
}

interface StoragePhaseInput {
  createLeaseToken?: () => string;
  dbClient: RecipeImageMaintenanceDbClient;
  now?: () => Date;
  storage: RecipeImageMaintenanceStorage;
}

type StoragePhaseName =
  | "normalDrain"
  | "quarantineRecheck"
  | "scanner"
  | "terminalTombstoneScan";

type StoragePhases = {
  [Phase in StoragePhaseName]-?: NonNullable<
    AccountMaintenanceTickDependencies[Phase]
  >;
};

export function createRecipeImageStorageMaintenancePhases({
  createLeaseToken = randomUUID,
  dbClient,
  now = () => new Date(),
  storage,
}: StoragePhaseInput): StoragePhases {
  return {
    scanner: async () => {
      await scanStaleRecipeImageUploads({
        dbClient,
        limit: SCAN_LIMIT,
        now,
      });
    },
    terminalTombstoneScan: async () => {
      await runRecipeImageTerminalTombstoneStorageScan({
        checkObjectPresence: storage.checkObjectPresence,
        dbClient,
        now,
      });
    },
    quarantineRecheck: async () => {
      await runRecipeImageQuarantineRecheckStorageScan({
        checkObjectPresence: storage.checkObjectPresence,
        dbClient,
        now,
      });
    },
    normalDrain: async () => {
      await runRecipeImageNormalDrainStorage({
        checkObjectPresence: storage.checkObjectPresence,
        dbClient,
        deleteObject: storage.deleteObject,
        leaseToken: createLeaseToken(),
        now,
      });
    },
  };
}
