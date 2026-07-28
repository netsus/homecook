import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  runRecipeImageLegacyVisibilityCopy,
  type RecipeImageLegacyVisibilityCopyRpcClient,
} from "@/lib/server/recipe-image-legacy-visibility-copy";
import {
  createRecipeImageLegacyVisibilityStorageAdapter,
  type RecipeImageLegacyVisibilityStorageClient,
} from "@/lib/server/recipe-image-legacy-visibility-storage";

const storageUrl = process.env.HOMECOOK_STORAGE_LIVE_URL;
const serviceRoleKey =
  process.env.HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.HOMECOOK_STORAGE_LIVE_DB_URL;
const liveStorageAvailable = Boolean(
  storageUrl && serviceRoleKey && databaseUrl,
);
const canonicalStorageOrigin = "https://local.homecook.test";
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
      remove(paths: string[]): PromiseLike<unknown>;
    };
  };
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
      await client.storage.from(bucketId).remove(objectPaths);
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
  originalCapabilityRevision,
  originalCapabilityUpdatedAtSql,
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
  originalCapabilityRevision: number;
  originalCapabilityUpdatedAtSql: string;
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

  await deleteStorageObjects(client, [
    ...targetRows,
    { bucketId: "recipe-images", objectPath: privateSourcePath },
    { bucketId: "recipe-images", objectPath: publicSourcePath },
  ]);

  runSql(`
    begin;
    -- Restore the shared local fixture exactly without weakening triggers
    -- for other sessions; the production trigger permits only +1 revisions.
    set local session_replication_role = replica;
    update public.account_generation_capability_state
    set state = 'legacy',
        revision = ${originalCapabilityRevision},
        current_cutover_attempt_id = null,
        updated_at = ${originalCapabilityUpdatedAtSql}
    where singleton
      and state = 'cutover_maintenance'
      and revision = ${originalCapabilityRevision + 1}
      and current_cutover_attempt_id = '${cutoverAttemptId}';
    set local session_replication_role = origin;
    commit;

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
  `);
}

describe.skipIf(!liveStorageAvailable)(
  "recipe image legacy visibility local DB and Storage",
  () => {
    it("copies private/public bytes and swaps read projections", async () => {
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
      let capabilityRevision = 0;
      let capabilityUpdatedAtSql = "null";
      let inventoryRunId = "";

      try {
        const capabilityState = runSql(`
          select revision || E'\\t' || quote_nullable(updated_at)
          from public.account_generation_capability_state
          where singleton and state = 'legacy'
            and current_cutover_attempt_id is null
        `).split("\t");
        expect(capabilityState).toHaveLength(2);
        expect(capabilityState[0]).toMatch(/^\d+$/u);
        expect(capabilityState[1]).toMatch(/^'.+'$/u);
        capabilityRevision = Number(capabilityState[0]);
        capabilityUpdatedAtSql = capabilityState[1];

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

        const cutoverRevision = capabilityRevision + 1;
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
            and revision = ${capabilityRevision};
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
        await cleanupFixture({
          client,
          cutoverAttemptId,
          inventoryKey,
          migrationKey,
          ownerUuid,
          privateRecipeId,
          publicRecipeId,
          privateSourcePath,
          publicSourcePath,
          originalCapabilityRevision: capabilityRevision,
          originalCapabilityUpdatedAtSql: capabilityUpdatedAtSql,
        });
      }
    }, 90_000);
  },
);
