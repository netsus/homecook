import { RECIPE_IMAGE_MAX_BYTES, type RecipeImageMimeType } from
  "./recipe-media";
import { inspectRecipeImageUpload } from "./recipe-image-upload";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_PATH_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;
const PRIVATE_TARGET_PATH_PATTERN
  = /^([0-9a-f-]{36})\/([1-9][0-9]*)\/([0-9a-f-]{36})\.(jpg|jpeg|png|webp)$/i;
const PUBLIC_TARGET_PATH_PATTERN
  = /^shared\/([0-9a-f-]{36})\.(jpg|jpeg|png|webp)$/i;
const PLAN_KEYS = [
  "account_generation",
  "expected_visibility",
  "migration_run_id",
  "owner_uuid",
  "source_bucket_id",
  "source_object_path",
  "state",
  "target_bucket_id",
  "target_object_id",
  "target_object_path",
].sort();

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

export interface RecipeImageLegacyVisibilityCopyRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

type ReadResult =
  | { kind: "absent" | "failed" | "oversized" }
  | { kind: "found"; body: Blob };

interface CopyInput {
  cutoverAttemptId: string;
  dbClient: RecipeImageLegacyVisibilityCopyRpcClient;
  expectedCapabilityRevision: number;
  inventoryRunId: string;
  migrationKey: string;
  now?: () => Date;
  positiveReferenceIds: string[];
  readObject(input: {
    bucketId: string;
    maxBytes: number;
    objectPath: string;
  }): Promise<ReadResult>;
  uploadObject(input: {
    body: Blob;
    bucketId: string;
    contentType: RecipeImageMimeType;
    objectPath: string;
    upsert: false;
  }): Promise<{ kind: "failed" | "uploaded" }>;
}

interface PlannedTarget {
  accountGeneration: number | null;
  expectedVisibility: "private" | "public_shared";
  migrationRunId: string;
  ownerUuid: string | null;
  sourceBucketId: "recipe-images";
  sourceObjectPath: string;
  state: "finalized" | "planned";
  targetBucketId: "recipe-images" | "recipe-images-private";
  targetObjectId: string;
  targetObjectPath: string;
}

interface Inspection {
  actualMimeType: RecipeImageMimeType;
  byteSize: number;
  rawSha256: string;
}

type FailureReason =
  | "finalize_failed"
  | "source_read_failed"
  | "source_validation_failed"
  | "target_upload_failed"
  | "target_verification_failed";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

function mimeForPath(objectPath: string): RecipeImageMimeType | null {
  const extension = objectPath.toLowerCase().match(/\.([^.]+)$/u)?.[1];
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return null;
}

function parseTarget(value: unknown): PlannedTarget | null {
  const candidate = record(value);
  if (!candidate || !exactKeys(candidate, PLAN_KEYS)) {
    return null;
  }

  const migrationRunId = candidate.migration_run_id;
  const sourceBucketId = candidate.source_bucket_id;
  const sourceObjectPath = candidate.source_object_path;
  const state = candidate.state;
  const targetBucketId = candidate.target_bucket_id;
  const targetObjectId = candidate.target_object_id;
  const targetObjectPath = candidate.target_object_path;
  const expectedVisibility = candidate.expected_visibility;

  if (
    typeof migrationRunId !== "string"
    || !UUID_PATTERN.test(migrationRunId)
    || sourceBucketId !== "recipe-images"
    || typeof sourceObjectPath !== "string"
    || !SOURCE_PATH_PATTERN.test(sourceObjectPath)
    || (state !== "planned" && state !== "finalized")
    || typeof targetObjectId !== "string"
    || !UUID_PATTERN.test(targetObjectId)
    || typeof targetObjectPath !== "string"
    || mimeForPath(sourceObjectPath) !== mimeForPath(targetObjectPath)
  ) {
    return null;
  }

  if (expectedVisibility === "private") {
    const accountGeneration = positiveInteger(candidate.account_generation);
    const ownerUuid = candidate.owner_uuid;
    const pathMatch = targetObjectPath.match(PRIVATE_TARGET_PATH_PATTERN);
    if (
      accountGeneration === null
      || typeof ownerUuid !== "string"
      || !UUID_PATTERN.test(ownerUuid)
      || targetBucketId !== "recipe-images-private"
      || !pathMatch
      || pathMatch[1]?.toLowerCase() !== ownerUuid.toLowerCase()
      || Number(pathMatch[2]) !== accountGeneration
      || pathMatch[3]?.toLowerCase() !== targetObjectId.toLowerCase()
    ) {
      return null;
    }
    return {
      accountGeneration,
      expectedVisibility,
      migrationRunId,
      ownerUuid,
      sourceBucketId,
      sourceObjectPath,
      state,
      targetBucketId,
      targetObjectId,
      targetObjectPath,
    };
  }

  const pathMatch = targetObjectPath.match(PUBLIC_TARGET_PATH_PATTERN);
  if (
    expectedVisibility !== "public_shared"
    || candidate.account_generation !== null
    || candidate.owner_uuid !== null
    || targetBucketId !== "recipe-images"
    || !pathMatch
    || pathMatch[1]?.toLowerCase() !== targetObjectId.toLowerCase()
  ) {
    return null;
  }
  return {
    accountGeneration: null,
    expectedVisibility,
    migrationRunId,
    ownerUuid: null,
    sourceBucketId,
    sourceObjectPath,
    state,
    targetBucketId,
    targetObjectId,
    targetObjectPath,
  };
}

function parsePlan(value: unknown): PlannedTarget[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    return null;
  }
  const targets = value.map(parseTarget);
  if (targets.some((target) => target === null)) {
    return null;
  }
  const exactTargets = targets as PlannedTarget[];
  const migrationRunIds = new Set(
    exactTargets.map((target) => target.migrationRunId.toLowerCase()),
  );
  const objectIds = new Set(
    exactTargets.map((target) => target.targetObjectId.toLowerCase()),
  );
  const paths = new Set(
    exactTargets.map((target) =>
      `${target.targetBucketId}/${target.targetObjectPath}`.toLowerCase()
    ),
  );
  return migrationRunIds.size === 1
    && objectIds.size === exactTargets.length
    && paths.size === exactTargets.length
    ? exactTargets
    : null;
}

function validInput(input: CopyInput) {
  return UUID_PATTERN.test(input.migrationKey)
    && UUID_PATTERN.test(input.inventoryRunId)
    && UUID_PATTERN.test(input.cutoverAttemptId)
    && Number.isSafeInteger(input.expectedCapabilityRevision)
    && input.expectedCapabilityRevision > 0
    && Array.isArray(input.positiveReferenceIds)
    && input.positiveReferenceIds.length >= 1
    && input.positiveReferenceIds.length <= 100
    && input.positiveReferenceIds.every((id) => UUID_PATTERN.test(id))
    && new Set(
      input.positiveReferenceIds.map((id) => id.toLowerCase()),
    ).size === input.positiveReferenceIds.length;
}

async function inspectBody(
  body: Blob,
  objectPath: string,
): Promise<Inspection | null> {
  const expectedMime = mimeForPath(objectPath);
  if (
    !expectedMime
    || !(body instanceof Blob)
    || body.size <= 0
    || body.size > RECIPE_IMAGE_MAX_BYTES
  ) {
    return null;
  }
  try {
    const result = await inspectRecipeImageUpload(new File(
      [body],
      objectPath,
      { type: expectedMime },
    ));
    return result.ok
      ? {
        actualMimeType: result.value.actualMimeType,
        byteSize: result.value.byteSize,
        rawSha256: result.value.rawSha256,
      }
      : null;
  } catch {
    return null;
  }
}

function sameInspection(left: Inspection, right: Inspection) {
  return left.actualMimeType === right.actualMimeType
    && left.byteSize === right.byteSize
    && left.rawSha256 === right.rawSha256;
}

async function safeRead(
  input: CopyInput,
  bucketId: string,
  objectPath: string,
) {
  try {
    return await input.readObject({
      bucketId,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath,
    });
  } catch {
    return { kind: "failed" as const };
  }
}

async function verifyTarget(
  input: CopyInput,
  target: PlannedTarget,
  sourceInspection: Inspection,
) {
  const result = await safeRead(
    input,
    target.targetBucketId,
    target.targetObjectPath,
  );
  if (result.kind !== "found") {
    return result.kind === "absent" ? "absent" : "failed";
  }
  const targetInspection = await inspectBody(
    result.body,
    target.targetObjectPath,
  );
  return targetInspection && sameInspection(sourceInspection, targetInspection)
    ? "match"
    : "mismatch";
}

async function finalizeTarget(
  input: CopyInput,
  target: PlannedTarget,
  inspection: Inspection,
  nowIso: string,
) {
  try {
    const result = await input.dbClient.rpc(
      "finalize_recipe_image_legacy_visibility_target",
      {
        p_actual_mime_type: inspection.actualMimeType,
        p_byte_size: inspection.byteSize,
        p_expected_capability_revision:
          input.expectedCapabilityRevision,
        p_migration_run_id: target.migrationRunId,
        p_now: nowIso,
        p_raw_sha256: inspection.rawSha256,
        p_target_object_id: target.targetObjectId,
      },
    );
    const data = record(result.data);
    return !result.error
      && data
      && data.migration_run_id === target.migrationRunId
      && data.target_object_id === target.targetObjectId
      && data.state === "finalized"
      && typeof data.replayed === "boolean"
      ? { replayed: data.replayed }
      : null;
  } catch {
    return null;
  }
}

export async function runRecipeImageLegacyVisibilityCopy(input: CopyInput) {
  if (!validInput(input)) {
    return { kind: "failed" as const, reason: "invalid_input" as const };
  }
  const now = input.now ?? (() => new Date());
  const operationTime = now();
  if (!Number.isFinite(operationTime.getTime())) {
    return { kind: "failed" as const, reason: "invalid_input" as const };
  }

  let prepareResult: RpcResult;
  try {
    prepareResult = await input.dbClient.rpc(
      "prepare_recipe_image_legacy_visibility_migration",
      {
        p_cutover_attempt_id: input.cutoverAttemptId,
        p_expected_capability_revision:
          input.expectedCapabilityRevision,
        p_inventory_run_id: input.inventoryRunId,
        p_migration_key: input.migrationKey,
        p_positive_reference_ids: input.positiveReferenceIds,
      },
    );
  } catch {
    return { kind: "failed" as const, reason: "prepare_failed" as const };
  }
  if (prepareResult.error) {
    return { kind: "failed" as const, reason: "prepare_failed" as const };
  }

  const targets = parsePlan(prepareResult.data);
  if (!targets) {
    return {
      kind: "failed" as const,
      reason: "invalid_prepare_result" as const,
    };
  }

  const failures: Array<{
    reason: FailureReason;
    targetObjectId: string;
  }> = [];
  let finalizedCount = 0;
  let replayedCount = 0;

  for (const target of targets) {
    if (target.state === "finalized") {
      finalizedCount += 1;
      replayedCount += 1;
      continue;
    }

    const source = await safeRead(
      input,
      target.sourceBucketId,
      target.sourceObjectPath,
    );
    if (source.kind !== "found") {
      failures.push({
        reason: "source_read_failed",
        targetObjectId: target.targetObjectId,
      });
      continue;
    }
    const sourceInspection = await inspectBody(
      source.body,
      target.sourceObjectPath,
    );
    if (!sourceInspection) {
      failures.push({
        reason: "source_validation_failed",
        targetObjectId: target.targetObjectId,
      });
      continue;
    }

    let targetVerification = await verifyTarget(
      input,
      target,
      sourceInspection,
    );
    if (targetVerification === "absent") {
      const uploadBody = new Blob(
        [await source.body.arrayBuffer()],
        { type: sourceInspection.actualMimeType },
      );
      let uploadKind: "failed" | "uploaded";
      try {
        uploadKind = (await input.uploadObject({
          body: uploadBody,
          bucketId: target.targetBucketId,
          contentType: sourceInspection.actualMimeType,
          objectPath: target.targetObjectPath,
          upsert: false,
        })).kind;
      } catch {
        uploadKind = "failed";
      }
      targetVerification = await verifyTarget(
        input,
        target,
        sourceInspection,
      );
      if (uploadKind === "failed" && targetVerification === "absent") {
        failures.push({
          reason: "target_upload_failed",
          targetObjectId: target.targetObjectId,
        });
        continue;
      }
    }
    if (targetVerification !== "match") {
      failures.push({
        reason: "target_verification_failed",
        targetObjectId: target.targetObjectId,
      });
      continue;
    }

    const finalized = await finalizeTarget(
      input,
      target,
      sourceInspection,
      operationTime.toISOString(),
    );
    if (!finalized) {
      failures.push({
        reason: "finalize_failed",
        targetObjectId: target.targetObjectId,
      });
      continue;
    }
    finalizedCount += 1;
    if (finalized.replayed) {
      replayedCount += 1;
    }
  }

  return {
    failedCount: failures.length,
    failures,
    finalizedCount,
    plannedCount: targets.length,
    replayedCount,
  };
}
