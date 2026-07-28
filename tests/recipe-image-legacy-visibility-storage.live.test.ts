import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  createManagedRecipeImageStorageAdapter,
  type ManagedRecipeImageStorageClient,
} from "@/lib/server/recipe-image-managed-storage";
import {
  runManagedRecipeImageCancel,
  type ManagedRecipeImageCancelRpcClient,
} from "@/lib/server/recipe-image-managed-cancel";
import {
  runManagedRecipeImageUpload,
  type ManagedRecipeImageInspection,
  type ManagedRecipeImageRpcClient,
} from "@/lib/server/recipe-image-managed-upload";
import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";
import {
  runRecipeImageLegacyVisibilityCopy,
  type RecipeImageLegacyVisibilityCopyRpcClient,
} from "@/lib/server/recipe-image-legacy-visibility-copy";
import {
  createRecipeImageLegacyVisibilityStorageAdapter,
  type RecipeImageLegacyVisibilityStorageClient,
} from "@/lib/server/recipe-image-legacy-visibility-storage";
import { runRecipeImageNormalDrainStorage } from
  "@/lib/server/recipe-image-normal-drain-storage";
import { runRecipeImageQuarantineRecheckStorageScan } from
  "@/lib/server/recipe-image-quarantine-recheck-storage";
import { isLocalStorageLiveEnvAvailable } from
  "./recipe-image-storage-live-guard";

const storageUrl = process.env.HOMECOOK_STORAGE_LIVE_URL;
const serviceRoleKey =
  process.env.HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.HOMECOOK_STORAGE_LIVE_DB_URL;
const liveStorageAvailable = Boolean(databaseUrl)
  && isLocalStorageLiveEnvAvailable({
    databaseUrl,
    serviceRoleKey,
    storageUrl,
  });
const canonicalStorageOrigin = "https://local.homecook.test";
const managedReadUrlOrigin = "https://storage.local.test";
const managedAuthCreatedAt = "2026-01-01T00:00:00Z";
const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
function runSql(sql: string) {
  const result = spawnSync(
    "psql",
    [
      databaseUrl!,
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "psql command failed");
  }
  return result.stdout.trim();
}

interface StorageRemovalClient {
  storage: {
    from(bucketId: string): {
      remove(paths: string[]): PromiseLike<{
        error?: unknown | null;
      }>;
    };
  };
}

interface LiveBucketAdminClient {
  storage: {
    createBucket(
      bucketId: string,
      options: { public: false },
    ): PromiseLike<{ error: unknown | null }>;
    getBucket(bucketId: string): PromiseLike<{ error: unknown | null }>;
  };
}

interface LiveRpcSourceClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

function deleteStorageObjects(
  client: StorageRemovalClient,
  objects: Array<{ bucketId: string; objectPath: string }>,
) {
  return Promise.all(
    Array.from(
      objects.reduce((groups, object) => {
        const group = groups.get(object.bucketId) ?? [];
        group.push(object.objectPath);
        groups.set(object.bucketId, group);
        return groups;
      }, new Map<string, string[]>()),
    ).map(async ([bucketId, objectPaths]) => {
      if (objectPaths.length === 0) {
        return;
      }
      const removal = await client.storage.from(bucketId)
        .remove(objectPaths);
      if (removal.error) {
        throw new Error("live Storage fixture cleanup failed");
      }
    }),
  );
}

async function cleanupFixture({
  client,
  cutoverAttemptId,
  inventoryKey,
  migrationKey,
  ownerUuid,
  privateRecipeId,
  publicRecipeId,
  privateSourcePath,
  publicSourcePath,
  capabilitySnapshot,
}: {
  client: StorageRemovalClient;
  cutoverAttemptId: string;
  inventoryKey: string;
  migrationKey: string;
  ownerUuid: string;
  privateRecipeId: string;
  publicRecipeId: string;
  privateSourcePath: string;
  publicSourcePath: string;
  capabilitySnapshot: CapabilitySnapshot;
}) {
  const targetRows = runSql(`
    select target_bucket_id || E'\\t' || target_object_path
    from public.recipe_image_legacy_visibility_targets
    where migration_run_id in (
      select id
      from public.recipe_image_legacy_visibility_migration_runs
      where migration_key = '${migrationKey}'
    )
  `)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [bucketId, objectPath] = line.split("\t");
      return { bucketId, objectPath };
    });

  let storageCleanupError: unknown;
  try {
    await deleteStorageObjects(client, [
      ...targetRows,
      { bucketId: "recipe-images", objectPath: privateSourcePath },
      { bucketId: "recipe-images", objectPath: publicSourcePath },
    ]);
  } catch (error) {
    storageCleanupError = error;
  }

  restoreCapabilitySnapshot(capabilitySnapshot, {
    currentCutoverAttemptIdSql: sqlString(cutoverAttemptId),
    revision: capabilitySnapshot.revision + 1,
    state: "cutover_maintenance",
  });

  runSql(`
    begin;
    delete from public.recipe_image_object_references
    where consumer_id in (
      '${privateRecipeId}',
      '${publicRecipeId}'
    );
    delete from public.recipe_image_objects
    where id in (
      select target_object_id
      from public.recipe_image_legacy_visibility_targets
      where migration_run_id in (
        select id
        from public.recipe_image_legacy_visibility_migration_runs
        where migration_key = '${migrationKey}'
      )
    );
    delete from public.recipe_image_legacy_visibility_target_references
    where migration_target_id in (
      select id
      from public.recipe_image_legacy_visibility_targets
      where migration_run_id in (
        select id
        from public.recipe_image_legacy_visibility_migration_runs
        where migration_key = '${migrationKey}'
      )
    );
    delete from public.recipe_image_legacy_visibility_targets
    where migration_run_id in (
      select id
      from public.recipe_image_legacy_visibility_migration_runs
      where migration_key = '${migrationKey}'
    );
    delete from public.recipe_image_legacy_visibility_migration_runs
    where migration_key = '${migrationKey}';
    delete from public.recipe_image_legacy_positive_references
    where inventory_run_id in (
      select id
      from public.recipe_image_legacy_inventory_runs
      where inventory_key = '${inventoryKey}'
    );
    delete from public.recipe_image_legacy_candidate_reports
    where inventory_run_id in (
      select id
      from public.recipe_image_legacy_inventory_runs
      where inventory_key = '${inventoryKey}'
    );
    delete from public.recipe_image_legacy_inventory_runs
    where inventory_key = '${inventoryKey}';
    delete from public.account_generation_cutover_staging
    where attempt_id = '${cutoverAttemptId}';
    delete from public.account_generation_cutover_attempts
    where id = '${cutoverAttemptId}';
    delete from public.recipes
    where id in (
      '${privateRecipeId}',
      '${publicRecipeId}'
    );
    delete from public.user_account_lifecycles
    where owner_uuid = '${ownerUuid}';
    delete from public.users
    where id = '${ownerUuid}';
    commit;
  `);
  if (storageCleanupError) {
    throw storageCleanupError;
  }
}

interface CapabilitySnapshot {
  currentCutoverAttemptIdSql: string;
  revision: number;
  state: string;
  updatedAtSql: string;
}

interface ExpectedCapabilityState {
  currentCutoverAttemptIdSql: string;
  revision: number;
  state: string;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function readCapabilitySnapshot(): CapabilitySnapshot {
  const [state, revision, currentCutoverAttemptIdSql, updatedAtSql] =
    runSql(`
      select state
        || E'\\t'
        || revision
        || E'\\t'
        || quote_nullable(current_cutover_attempt_id)
        || E'\\t'
        || quote_nullable(updated_at)
      from public.account_generation_capability_state
      where singleton
    `).split("\t");

  if (
    !state
    || !revision
    || !/^\d+$/u.test(revision)
    || !currentCutoverAttemptIdSql
    || !updatedAtSql
  ) {
    throw new Error("capability fixture snapshot is invalid");
  }

  return {
    currentCutoverAttemptIdSql,
    revision: Number(revision),
    state,
    updatedAtSql,
  };
}

function restoreCapabilitySnapshot(
  snapshot: CapabilitySnapshot,
  expected: ExpectedCapabilityState = {
    currentCutoverAttemptIdSql: "NULL",
    revision: snapshot.revision + 1,
    state: "generation_active",
  },
) {
  runSql(`
    begin;
    set local session_replication_role = replica;
    update public.account_generation_capability_state
    set state = ${sqlString(snapshot.state)},
        revision = ${snapshot.revision},
        current_cutover_attempt_id =
          ${snapshot.currentCutoverAttemptIdSql},
        updated_at = ${snapshot.updatedAtSql}
    where singleton
      and state = ${sqlString(expected.state)}
      and revision = ${expected.revision}
      and current_cutover_attempt_id
        is not distinct from ${expected.currentCutoverAttemptIdSql};
    set local session_replication_role = origin;
    commit;
  `);
  const restored = runSql(`
    select count(*)
    from public.account_generation_capability_state
    where singleton
      and state = ${sqlString(snapshot.state)}
      and revision = ${snapshot.revision}
      and current_cutover_attempt_id
        is not distinct from ${snapshot.currentCutoverAttemptIdSql}
      and updated_at is not distinct from ${snapshot.updatedAtSql}
  `);
  if (restored !== "1") {
    throw new Error("capability fixture snapshot restore drifted");
  }
}

function sessionKeyHash(ownerUuid: string) {
  return createHash("sha256")
    .update(`recipe-image-storage-live:${ownerUuid}`)
    .digest("hex");
}

function seedManagedOwner(ownerUuid: string, recipeIds: string[] = []) {
  const capabilitySnapshot = readCapabilitySnapshot();
  const hash = sessionKeyHash(ownerUuid);

  runSql(`
    begin;
    insert into public.users (
      id, nickname, social_provider, social_id
    ) values (
      '${ownerUuid}',
      'Local managed image owner',
      'google',
      'local-managed-image-${ownerUuid}'
    );

    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      origin,
      status,
      activated_at
    ) values (
      '${ownerUuid}',
      1,
      '${managedAuthCreatedAt}',
      'runtime',
      'active',
      now()
    );

    insert into public.user_session_generation_bindings (
      session_key_hash,
      hmac_key_version,
      owner_uuid,
      expected_account_generation,
      auth_identity_created_at_snapshot,
      revoked_at
    ) values (
      '${hash}',
      1,
      '${ownerUuid}',
      1,
      '${managedAuthCreatedAt}',
      null
    );

    ${recipeIds.map((recipeId) => `
      insert into public.recipes (
        id, title, source_type, created_by, visibility
      ) values (
        '${recipeId}',
        'Local managed attach fixture',
        'manual',
        '${ownerUuid}',
        'private'
      );
    `).join("\n")}

    update public.account_generation_capability_state
    set state = 'generation_active',
        revision = revision + 1,
        current_cutover_attempt_id = null,
        updated_at = now()
    where singleton;
    commit;
  `);

  return {
    capabilitySnapshot,
    sessionAuthority: {
      authIdentityCreatedAt: managedAuthCreatedAt,
      hmacKeyVersion: 1,
      ownerUuid,
      sessionKeyHash: hash,
    },
  };
}

async function cleanupManagedFixture({
  capabilitySnapshot,
  client,
  objectPaths,
  ownerUuid,
}: {
  capabilitySnapshot: CapabilitySnapshot;
  client: StorageRemovalClient;
  objectPaths: string[];
  ownerUuid: string;
}) {
  let storageCleanupError: unknown;
  try {
    await deleteStorageObjects(
      client,
      objectPaths.map((objectPath) => ({
        bucketId: "recipe-images-private",
        objectPath,
      })),
    );
  } catch (error) {
    storageCleanupError = error;
  }
  restoreCapabilitySnapshot(capabilitySnapshot);

  runSql(`
    begin;
    delete from public.recipe_image_object_references
    where image_object_id in (
      select id from public.recipe_image_objects
      where owner_uuid = '${ownerUuid}'
    )
      or consumer_id in (
        select id from public.recipes
        where created_by = '${ownerUuid}'
      );
    delete from public.storage_object_deletion_outbox
    where owner_uuid = '${ownerUuid}';
    delete from public.mutation_idempotency_keys
    where owner_uuid = '${ownerUuid}';
    delete from public.image_upload_quota_counters
    where owner_uuid = '${ownerUuid}';
    delete from public.recipe_image_objects
    where owner_uuid = '${ownerUuid}';
    delete from public.recipes
    where created_by = '${ownerUuid}';
    delete from public.user_session_generation_bindings
    where owner_uuid = '${ownerUuid}';
    delete from public.user_account_lifecycles
    where owner_uuid = '${ownerUuid}';
    delete from public.users
    where id = '${ownerUuid}';
    commit;
  `);
  if (storageCleanupError) {
    throw storageCleanupError;
  }
}

function managedInspection(bytes: Buffer): ManagedRecipeImageInspection {
  return {
    actualMimeType: "image/png",
    byteSize: bytes.byteLength,
    extension: "png",
    rawSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function managedPayloadHash(inspection: ManagedRecipeImageInspection) {
  return createHash("sha256")
    .update(JSON.stringify({
      actual_mime_type: inspection.actualMimeType,
      byte_size: inspection.byteSize,
      extension: inspection.extension,
      raw_sha256: inspection.rawSha256,
    }))
    .digest("hex");
}

type ManagedStorageAdapter = ReturnType<
  typeof createManagedRecipeImageStorageAdapter
>;
type ManagedSessionAuthority = ReturnType<
  typeof seedManagedOwner
>["sessionAuthority"];
type ManagedUploadInput = Parameters<typeof runManagedRecipeImageUpload>[0];

function syntheticIssueReadUrl(now: () => Date) {
  return async ({
    bucketId,
    objectPath,
  }: {
    bucketId: string;
    objectPath: string;
  }) => ({
    expiresAt: new Date(now().getTime() + 300_000).toISOString(),
    readUrl:
      `${managedReadUrlOrigin}/storage/v1/object/sign/`
      + `${bucketId}/${objectPath}?token=${randomUUID()}`,
  });
}

function runLiveManagedUpload({
  dbClient,
  idempotencyKey,
  nowIso,
  readTakeoverObject,
  sessionAuthority,
  storageAdapter,
  uploadObject,
}: {
  dbClient: ManagedRecipeImageRpcClient;
  idempotencyKey: string;
  nowIso: string;
  readTakeoverObject?: ManagedUploadInput["readTakeoverObject"];
  sessionAuthority: ManagedSessionAuthority;
  storageAdapter: ManagedStorageAdapter;
  uploadObject?: ManagedUploadInput["uploadObject"];
}) {
  const now = () => new Date(nowIso);

  return runManagedRecipeImageUpload({
    body: new Blob([png1x1], { type: "image/png" }),
    dbClient,
    expectedReadUrlOrigin: managedReadUrlOrigin,
    idempotencyKey,
    inspection: managedInspection(png1x1),
    issueReadUrl: syntheticIssueReadUrl(now),
    maxReadUrlTtlMs: 300_000,
    now,
    readTakeoverObject: readTakeoverObject
      ?? storageAdapter.readTakeoverObject,
    sessionAuthority,
    uploadObject: uploadObject ?? storageAdapter.uploadObject,
  });
}

function managedObjectPath(objectId: string) {
  return runSql(`
    select object_path
    from public.recipe_image_objects
    where id = '${objectId}'
  `);
}

function supabaseRpcClient(client: LiveRpcSourceClient) {
  const rpc = client.rpc.bind(client);
  return {
    rpc: async (name: string, params: Record<string, unknown>) => {
      const result = await rpc(name, params);
      return {
        data: result.data,
        error: result.error
          ? { message: result.error.message }
          : null,
      };
    },
  };
}

async function ensurePrivateRecipeImageBucket(
  client: LiveBucketAdminClient,
) {
  const existing = await client.storage.getBucket("recipe-images-private");
  if (!existing.error) {
    return;
  }

  const created = await client.storage.createBucket(
    "recipe-images-private",
    { public: false },
  );
  expect(created.error).toBeNull();
}

describe.skipIf(!liveStorageAvailable)(
  "recipe image legacy visibility local DB and Storage",
  () => {
    it.sequential(
      "copies private/public bytes and swaps read projections",
      async () => {
      const ownerUuid = randomUUID();
      const privateRecipeId = randomUUID();
      const publicRecipeId = randomUUID();
      const privateSourceObjectId = randomUUID();
      const publicSourceObjectId = randomUUID();
      const cutoverAttemptId = randomUUID();
      const inventoryKey = randomUUID();
      const migrationKey = randomUUID();
      const privateSourcePath =
        `${ownerUuid}/${privateSourceObjectId}.png`;
      const publicSourcePath =
        `${ownerUuid}/${publicSourceObjectId}.png`;
      const privateLegacyUrl =
        `${canonicalStorageOrigin}/storage/v1/object/public/`
        + `recipe-images/${privateSourcePath}`;
      const publicLegacyUrl =
        `${canonicalStorageOrigin}/storage/v1/object/public/`
        + `recipe-images/${publicSourcePath}`;
      const client = createClient(storageUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const storage = createRecipeImageLegacyVisibilityStorageAdapter({
        client: client as unknown as
          RecipeImageLegacyVisibilityStorageClient,
        operationTimeoutMs: 5_000,
      });
      const sourceBucket = client.storage.from("recipe-images");
      let capabilitySnapshot: CapabilitySnapshot | null = null;
      let inventoryRunId = "";

      try {
        capabilitySnapshot = readCapabilitySnapshot();
        expect(capabilitySnapshot.state).toBe("legacy");
        expect(capabilitySnapshot.currentCutoverAttemptIdSql).toBe("NULL");

        runSql(`
          insert into public.users (
            id, nickname, social_provider, social_id
          ) values (
            '${ownerUuid}', 'Local image cutover owner',
            'google', 'local-image-cutover-${ownerUuid}'
          );

          insert into public.user_account_lifecycles (
            owner_uuid,
            account_generation,
            auth_identity_created_at_snapshot,
            origin,
            status,
            activated_at
          ) values (
            '${ownerUuid}', 1, now(), 'runtime', 'active', now()
          );

          insert into public.recipes (
            id, title, thumbnail_url, source_type, created_by, visibility
          ) values
          (
            '${privateRecipeId}',
            'Local copy swap private fixture',
            '${privateLegacyUrl}',
            'manual',
            '${ownerUuid}',
            'private'
          ),
          (
            '${publicRecipeId}',
            'Local copy swap public fixture',
            '${publicLegacyUrl}',
            'manual',
            '${ownerUuid}',
            'public'
          );
        `);

        for (const objectPath of [privateSourcePath, publicSourcePath]) {
          const upload = await sourceBucket.upload(
            objectPath,
            new Blob([png1x1], { type: "image/png" }),
            { contentType: "image/png", upsert: false },
          );
          expect(upload.error).toBeNull();
        }

        const inventory = await client.rpc(
          "inventory_recipe_image_legacy_objects",
          {
            p_inventory_key: inventoryKey,
            p_storage_origin: canonicalStorageOrigin,
          },
        );
        expect(inventory.error).toBeNull();
        expect(inventory.data).toHaveLength(1);
        const inventoryRow = inventory.data?.[0] as
          | Record<string, unknown>
          | undefined;
        inventoryRunId = String(inventoryRow?.inventory_run_id ?? "");
        expect(inventoryRunId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu,
        );
        expect(Number(inventoryRow?.known_reference_count))
          .toBeGreaterThanOrEqual(2);
        expect(Number(inventoryRow?.enqueue_count)).toBe(0);
        expect(Number(inventoryRow?.delete_count)).toBe(0);

        const positiveReferenceIds = runSql(`
          select id
          from public.recipe_image_legacy_positive_references
          where inventory_run_id = '${inventoryRunId}'
            and consumer_id in (
              '${privateRecipeId}',
              '${publicRecipeId}'
            )
          order by consumer_id
        `).split("\n").filter(Boolean);
        expect(positiveReferenceIds).toHaveLength(2);

        const cutoverRevision = capabilitySnapshot.revision + 1;
        runSql(`
          insert into public.account_generation_cutover_attempts (
            id, state, capability_revision
          ) values (
            '${cutoverAttemptId}', 'staged', ${cutoverRevision}
          );

          insert into public.account_generation_cutover_staging (
            attempt_id,
            owner_uuid,
            auth_identity_created_at_snapshot,
            proposed_account_generation,
            proposed_action,
            classification,
            validation_state
          ) values (
            '${cutoverAttemptId}',
            '${ownerUuid}',
            now(),
            1,
            'activate',
            'active_candidate',
            'validated'
          );

          update public.account_generation_capability_state
          set state = 'cutover_maintenance',
              revision = ${cutoverRevision},
              current_cutover_attempt_id = '${cutoverAttemptId}'
          where singleton
            and state = 'legacy'
            and revision = ${capabilitySnapshot.revision};
        `);

        const copyInput = {
          cutoverAttemptId,
          dbClient: client as unknown as
            RecipeImageLegacyVisibilityCopyRpcClient,
          expectedCapabilityRevision: cutoverRevision,
          inventoryRunId,
          migrationKey,
          positiveReferenceIds,
          readObject: storage.readObject,
          uploadObject: storage.uploadObject,
        };
        const firstRun =
          await runRecipeImageLegacyVisibilityCopy(copyInput);
        expect(firstRun).toEqual({
          failedCount: 0,
          failures: [],
          finalizedCount: 2,
          plannedCount: 2,
          replayedCount: 0,
        });

        const projection = await client.rpc(
          "read_recipe_image_projections",
          {
            p_recipe_ids: [privateRecipeId, publicRecipeId],
          },
        );
        expect(projection.error).toBeNull();
        expect(projection.data).toHaveLength(2);
        const projectionRows = projection.data as Array<
          Record<string, unknown>
        >;
        expect(projectionRows).toEqual([
          expect.objectContaining({
            bucket_id: "recipe-images-private",
            legacy_thumbnail_url: privateLegacyUrl,
            object_path: expect.stringMatching(
              new RegExp(`^${ownerUuid}/1/.+\\.png$`, "u"),
            ),
            recipe_id: privateRecipeId,
            reference_type: "recipe_thumbnail",
            state: "attached_private",
            visibility: "private",
          }),
          expect.objectContaining({
            bucket_id: "recipe-images",
            legacy_thumbnail_url: publicLegacyUrl,
            object_path: expect.stringMatching(/^shared\/.+\.png$/u),
            recipe_id: publicRecipeId,
            reference_type: "recipe_thumbnail",
            state: "attached_public_shared",
            visibility: "public_shared",
          }),
        ]);

        for (const row of projectionRows) {
          const bucketId = String(row.bucket_id);
          const objectPath = String(row.object_path);
          const download = await client.storage
            .from(bucketId)
            .download(objectPath);
          expect(download.error).toBeNull();
          expect(Buffer.from(await download.data!.arrayBuffer()))
            .toEqual(png1x1);
        }

        await expect(
          runRecipeImageLegacyVisibilityCopy(copyInput),
        ).resolves.toEqual({
          failedCount: 0,
          failures: [],
          finalizedCount: 2,
          plannedCount: 2,
          replayedCount: 2,
        });

        expect(Number(runSql(`
          select count(*)
          from public.storage_object_deletion_outbox
          where owner_uuid = '${ownerUuid}'
        `))).toBe(0);
      } finally {
        if (capabilitySnapshot) {
          await cleanupFixture({
            capabilitySnapshot,
            client,
            cutoverAttemptId,
            inventoryKey,
            migrationKey,
            ownerUuid,
            privateRecipeId,
            publicRecipeId,
            privateSourcePath,
            publicSourcePath,
          });
        }
      }
      },
      90_000,
    );

    it.sequential(
      "uploads, takes over and compensates against real private Storage",
      async () => {
      const ownerUuid = randomUUID();
      const { capabilitySnapshot, sessionAuthority } =
        seedManagedOwner(ownerUuid);
      const client = createClient(storageUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      await ensurePrivateRecipeImageBucket(client);
      const storageAdapter = createManagedRecipeImageStorageAdapter({
        client: client as unknown as ManagedRecipeImageStorageClient,
        signedUrlTtlSeconds: 300,
        takeoverReadTimeoutMs: 5_000,
      });
      const objectPaths: string[] = [];

      try {
        let uploadCalls = 0;
        const uploadKey = randomUUID();
        const first = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: uploadKey,
          nowIso: "2030-07-24T02:00:00.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            uploadCalls += 1;
            objectPaths.push(input.objectPath);
            await storageAdapter.uploadObject(input);
          },
        });

        if (first.kind !== "succeeded") {
          throw new Error(JSON.stringify(first));
        }
        expect(first.state).toBe("uploaded_unlinked");
        expect(uploadCalls).toBe(1);
        const uploadObjectId =
          first.kind === "succeeded" ? first.objectId : "";
        const uploadObjectPath = managedObjectPath(uploadObjectId);
        await expect(storageAdapter.checkObjectPresence({
          bucketId: "recipe-images-private",
          objectPath: uploadObjectPath,
        })).resolves.toEqual({ kind: "present" });

        const replay = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: uploadKey,
          nowIso: "2030-07-24T02:00:01.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            uploadCalls += 1;
            await storageAdapter.uploadObject(input);
          },
        });
        expect(replay).toMatchObject({
          kind: "succeeded",
          objectId: uploadObjectId,
          state: "uploaded_unlinked",
        });
        expect(uploadCalls).toBe(1);

        const takeoverKey = randomUUID();
        const inspection = managedInspection(png1x1);
        const takeoverRpc = await client.rpc(
          "reserve_recipe_image_upload",
          {
            p_actual_mime_type: inspection.actualMimeType,
            p_auth_identity_created_at_snapshot: managedAuthCreatedAt,
            p_byte_size: inspection.byteSize,
            p_extension: inspection.extension,
            p_hmac_key_version: 1,
            p_idempotency_key: takeoverKey,
            p_now: "2030-07-24T02:10:00.000Z",
            p_owner_uuid: ownerUuid,
            p_payload_hash: managedPayloadHash(inspection),
            p_raw_sha256: inspection.rawSha256,
            p_session_key_hash: sessionKeyHash(ownerUuid),
          },
        );
        expect(takeoverRpc.error).toBeNull();
        const takeoverReservation = takeoverRpc.data as
          Record<string, unknown>;
        const takeoverObjectId = String(takeoverReservation.object_id);
        const takeoverObjectPath =
          String(takeoverReservation.object_path);
        objectPaths.push(takeoverObjectPath);
        await storageAdapter.uploadObject({
          body: new Blob([png1x1], { type: "image/png" }),
          bucketId: "recipe-images-private",
          contentType: "image/png",
          objectPath: takeoverObjectPath,
          upsert: false,
        });

        let takeoverUploadCalls = 0;
        const takeover = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: takeoverKey,
          nowIso: "2030-07-24T02:16:00.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            takeoverUploadCalls += 1;
            await storageAdapter.uploadObject(input);
          },
        });
        expect(takeover).toMatchObject({
          kind: "succeeded",
          objectId: takeoverObjectId,
          state: "uploaded_unlinked",
        });
        expect(takeoverUploadCalls).toBe(0);
        await expect(storageAdapter.readTakeoverObject({
          bucketId: "recipe-images-private",
          maxBytes: RECIPE_IMAGE_MAX_BYTES,
          objectPath: takeoverObjectPath,
        })).resolves.toMatchObject({ kind: "found" });

        const compensationKey = randomUUID();
        let compensatedPath = "";
        const compensation = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: compensationKey,
          nowIso: "2030-07-24T02:20:00.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            compensatedPath = input.objectPath;
            objectPaths.push(compensatedPath);
            await storageAdapter.uploadObject(input);
            throw new Error("post-put fixture failure");
          },
        });
        expect(compensation).toEqual({
          kind: "failed",
          reason: "storage_upload_failed",
        });
        await expect(storageAdapter.checkObjectPresence({
          bucketId: "recipe-images-private",
          objectPath: compensatedPath,
        })).resolves.toEqual({ kind: "present" });
        expect(runSql(`
          select object.state
            || ':'
            || object.cleanup_generation
            || ':'
            || outbox.state
          from public.recipe_image_objects as object
          join public.storage_object_deletion_outbox as outbox
            on outbox.bucket_id = object.bucket_id
           and outbox.object_path = object.object_path
           and outbox.cleanup_generation = object.cleanup_generation
          where object.owner_uuid = '${ownerUuid}'
            and object.object_path = '${compensatedPath}'
        `)).toBe("cleanup_pending:1:pending");
      } finally {
        await cleanupManagedFixture({
          capabilitySnapshot,
          client,
          objectPaths,
          ownerUuid,
        });
      }
      },
      120_000,
    );

    it.sequential(
      "attaches one uploaded object and drains one cancelled object",
      async () => {
      const ownerUuid = randomUUID();
      const recipeId = randomUUID();
      const { capabilitySnapshot, sessionAuthority } =
        seedManagedOwner(ownerUuid, [recipeId]);
      const client = createClient(storageUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      await ensurePrivateRecipeImageBucket(client);
      const storageAdapter = createManagedRecipeImageStorageAdapter({
        client: client as unknown as ManagedRecipeImageStorageClient,
        signedUrlTtlSeconds: 300,
        takeoverReadTimeoutMs: 5_000,
      });
      const objectPaths: string[] = [];

      try {
        const attachUpload = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: randomUUID(),
          nowIso: "2030-07-24T03:00:00.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            objectPaths.push(input.objectPath);
            await storageAdapter.uploadObject(input);
          },
        });
        expect(attachUpload).toMatchObject({
          kind: "succeeded",
          state: "uploaded_unlinked",
        });
        const attachObjectId =
          attachUpload.kind === "succeeded" ? attachUpload.objectId : "";
        const attachObjectPath = managedObjectPath(attachObjectId);

        const attachRpc = await client.rpc(
          "attach_recipe_image_object",
          {
            p_auth_identity_created_at_snapshot: managedAuthCreatedAt,
            p_expected_cleanup_generation: 0,
            p_hmac_key_version: 1,
            p_image_object_id: attachObjectId,
            p_now: "2030-07-24T03:01:00.000Z",
            p_owner_uuid: ownerUuid,
            p_recipe_id: recipeId,
            p_session_key_hash: sessionKeyHash(ownerUuid),
          },
        );
        expect(attachRpc.error).toBeNull();
        const attached = attachRpc.data as Record<string, unknown>;
        expect(attached).toMatchObject({
          object_id: attachObjectId,
          outcome: "succeeded",
          recipe_id: recipeId,
          state: "attached_private",
        });
        const projection = await client.rpc(
          "read_recipe_image_projections",
          { p_recipe_ids: [recipeId] },
        );
        expect(projection.error).toBeNull();
        expect(projection.data).toEqual([
          expect.objectContaining({
            bucket_id: "recipe-images-private",
            object_path: attachObjectPath,
            recipe_id: recipeId,
            state: "attached_private",
          }),
        ]);
        const attachedDownload = await client.storage
          .from("recipe-images-private")
          .download(attachObjectPath);
        expect(attachedDownload.error).toBeNull();
        expect(Buffer.from(await attachedDownload.data!.arrayBuffer()))
          .toEqual(png1x1);

        const cancelUpload = await runLiveManagedUpload({
          dbClient: client as unknown as ManagedRecipeImageRpcClient,
          idempotencyKey: randomUUID(),
          nowIso: "2030-07-24T03:10:00.000Z",
          sessionAuthority,
          storageAdapter,
          uploadObject: async (input) => {
            objectPaths.push(input.objectPath);
            await storageAdapter.uploadObject(input);
          },
        });
        expect(cancelUpload).toMatchObject({
          kind: "succeeded",
          state: "uploaded_unlinked",
        });
        const cancelObjectId =
          cancelUpload.kind === "succeeded" ? cancelUpload.objectId : "";
        const cancelObjectPath = managedObjectPath(cancelObjectId);
        await expect(runManagedRecipeImageCancel({
          dbClient: client as unknown as ManagedRecipeImageCancelRpcClient,
          idempotencyKey: randomUUID(),
          imageObjectId: cancelObjectId,
          sessionAuthority,
        })).resolves.toEqual({
          kind: "succeeded",
          objectId: cancelObjectId,
          state: "cleanup_pending",
        });

        await expect(runRecipeImageNormalDrainStorage({
          checkObjectPresence: storageAdapter.checkObjectPresence,
          dbClient: supabaseRpcClient(client),
          deleteObject: storageAdapter.deleteObject,
          leaseToken: randomUUID(),
          now: () => new Date("2030-07-24T03:15:00.000Z"),
        })).resolves.toEqual({
          claimedCount: 1,
          deletedCount: 1,
          quarantinedCount: 0,
          staleCount: 0,
        });
        await expect(storageAdapter.checkObjectPresence({
          bucketId: "recipe-images-private",
          objectPath: cancelObjectPath,
        })).resolves.toEqual({ kind: "absent" });
        expect(runSql(`
          select object.state || ':' || outbox.terminal_result
          from public.recipe_image_objects as object
          join public.storage_object_deletion_outbox as outbox
            on outbox.bucket_id = object.bucket_id
           and outbox.object_path = object.object_path
           and outbox.cleanup_generation = object.cleanup_generation
          where object.id = '${cancelObjectId}'
        `)).toBe("deleted:deleted");
      } finally {
        await cleanupManagedFixture({
          capabilitySnapshot,
          client,
          objectPaths,
          ownerUuid,
        });
      }
      },
      120_000,
    );

    it.sequential(
      "quarantines a first 404 and requeues a late object",
      async () => {
      const ownerUuid = randomUUID();
      const { capabilitySnapshot } = seedManagedOwner(ownerUuid);
      const client = createClient(storageUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      await ensurePrivateRecipeImageBucket(client);
      const storageAdapter = createManagedRecipeImageStorageAdapter({
        client: client as unknown as ManagedRecipeImageStorageClient,
        signedUrlTtlSeconds: 300,
        takeoverReadTimeoutMs: 5_000,
      });
      const objectId = randomUUID();
      const objectPath = `${ownerUuid}/1/${objectId}.png`;
      const objectPaths = [objectPath];
      const inspection = managedInspection(png1x1);

      try {
        runSql(`
          begin;
          insert into public.recipe_image_objects (
            id,
            owner_uuid,
            account_generation,
            bucket_id,
            object_path,
            raw_sha256,
            byte_size,
            actual_mime_type,
            visibility,
            state,
            cleanup_generation,
            created_at,
            updated_at
          ) values (
            '${objectId}',
            '${ownerUuid}',
            1,
            'recipe-images-private',
            '${objectPath}',
            '${inspection.rawSha256}',
            ${inspection.byteSize},
            '${inspection.actualMimeType}',
            'private',
            'cleanup_pending',
            1,
            '2030-07-24T04:00:00.000Z',
            '2030-07-24T04:00:00.000Z'
          );

          insert into public.storage_object_deletion_outbox (
            bucket_id,
            object_path,
            owner_uuid,
            account_generation,
            cleanup_generation,
            reason,
            state,
            next_attempt_at
          ) values (
            'recipe-images-private',
            '${objectPath}',
            '${ownerUuid}',
            1,
            1,
            'storage-live-first-404',
            'pending',
            '2030-07-24T04:00:00.000Z'
          );
          commit;
        `);

        await expect(runRecipeImageNormalDrainStorage({
          checkObjectPresence: storageAdapter.checkObjectPresence,
          dbClient: supabaseRpcClient(client),
          deleteObject: storageAdapter.deleteObject,
          leaseToken: randomUUID(),
          now: () => new Date("2030-07-24T04:00:00.000Z"),
        })).resolves.toEqual({
          claimedCount: 1,
          deletedCount: 0,
          quarantinedCount: 1,
          staleCount: 0,
        });
        expect(runSql(`
          select object.state
            || ':'
            || outbox.state
            || ':'
            || (object.late_upload_quarantine_until is not null)
          from public.recipe_image_objects as object
          join public.storage_object_deletion_outbox as outbox
            on outbox.bucket_id = object.bucket_id
           and outbox.object_path = object.object_path
           and outbox.cleanup_generation = object.cleanup_generation
          where object.id = '${objectId}'
        `)).toBe("not_found_observed:awaiting_not_found_recheck:true");

        await storageAdapter.uploadObject({
          body: new Blob([png1x1], { type: "image/png" }),
          bucketId: "recipe-images-private",
          contentType: "image/png",
          objectPath,
          upsert: false,
        });

        await expect(runRecipeImageQuarantineRecheckStorageScan({
          checkObjectPresence: storageAdapter.checkObjectPresence,
          dbClient: supabaseRpcClient(client),
          now: () => new Date("2030-07-24T04:16:00.000Z"),
        })).resolves.toEqual({
          claimedCount: 1,
          pendingCount: 1,
          staleCount: 0,
          verifiedNotFoundCount: 0,
        });
        expect(runSql(`
          select object.state || ':' || outbox.state
          from public.recipe_image_objects as object
          join public.storage_object_deletion_outbox as outbox
            on outbox.bucket_id = object.bucket_id
           and outbox.object_path = object.object_path
           and outbox.cleanup_generation = object.cleanup_generation
          where object.id = '${objectId}'
        `)).toBe("cleanup_pending:pending");
      } finally {
        await cleanupManagedFixture({
          capabilitySnapshot,
          client,
          objectPaths,
          ownerUuid,
        });
      }
      },
      120_000,
    );
  },
);
