import { inspectRecipeImageUpload } from "./recipe-image-upload";
import { RECIPE_IMAGE_MAX_BYTES } from "./recipe-media";

interface RpcClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
interface StorageClient {
  storage: {
    from(bucket: string): {
      download(path: string, options?: Record<string, never>, parameters?: { signal: AbortSignal }): PromiseLike<{ data: Blob | null; error: unknown }>;
      upload(path: string, body: Blob, options: { contentType: string; upsert: false }): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}
interface PublicationInput {
  rpcClient: RpcClient;
  storageClient: StorageClient;
  authorityParams: Record<string, unknown> & { p_owner_uuid: string };
  idempotencyKey: string;
  recipeId: string;
  expectedUpdatedAt: string;
  nutritionSnapshot: unknown;
  inputGuard: unknown;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A lost response resumes the same recipe/image target; no signed URL enters public data. */
export async function publishManualRecipe(input: PublicationInput): Promise<Record<string, unknown>> {
  const params = {
    ...input.authorityParams, p_idempotency_key: input.idempotencyKey,
    p_recipe_id: input.recipeId, p_expected_updated_at: input.expectedUpdatedAt,
    p_nutrition_snapshot: input.nutritionSnapshot, p_input_guard: input.inputGuard,
  };
  const prepared = await input.rpcClient.rpc("publish_manual_recipe", { ...params, p_verified_image: null });
  if (prepared.error) throw prepared.error;
  const plan = prepared.data;
  if (record(plan) && plan.status === "published" && record(plan.recipe)
    && plan.recipe.id === input.recipeId && plan.recipe.visibility === "public") return plan.recipe;
  if (!record(plan) || plan.status !== "copy_required"
    || (plan.phase !== "prepare" && plan.phase !== "upload")
    || typeof plan.source_object_id !== "string" || !UUID.test(plan.source_object_id)
    || typeof plan.target_object_id !== "string" || !UUID.test(plan.target_object_id)
    || plan.source_bucket_id !== "recipe-images-private" || plan.target_bucket_id !== "recipe-images"
    || typeof plan.source_object_path !== "string" || typeof plan.target_object_path !== "string"
    || typeof plan.raw_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(plan.raw_sha256)
    || !Number.isSafeInteger(plan.byte_size) || Number(plan.byte_size) <= 0 || Number(plan.byte_size) > RECIPE_IMAGE_MAX_BYTES
    || !["image/jpeg", "image/png", "image/webp"].includes(String(plan.actual_mime_type))) {
    throw new Error("Manual recipe publication evidence is invalid");
  }
  const source = plan.source_object_path.match(/^([^/]+)\/([1-9][0-9]*)\/([^/]+)\.(jpg|jpeg|png|webp)$/);
  if (!source || source[1] !== input.authorityParams.p_owner_uuid || source[3] !== plan.source_object_id
    || plan.target_object_path !== `shared/${plan.target_object_id}.${source[4]}`) {
    throw new Error("Manual recipe publication path is invalid");
  }
  const expectedSize = plan.byte_size;
  const expectedHash = plan.raw_sha256;
  const expectedMime = String(plan.actual_mime_type);
  async function verifiedBody(bucket: string, path: string) {
    const result = await input.storageClient.storage.from(bucket).download(path, {}, { signal: AbortSignal.timeout(10_000) });
    if (result.error || !result.data || result.data.size !== expectedSize) throw new Error("Manual recipe image copy is unavailable");
    const inspection = await inspectRecipeImageUpload(new File([result.data], "recipe-image", { type: expectedMime }));
    if (!inspection.ok || inspection.value.rawSha256 !== expectedHash || inspection.value.actualMimeType !== expectedMime) {
      throw new Error("Manual recipe image copy did not match its source");
    }
    return result.data;
  }
  const evidence = { target_object_id: plan.target_object_id, raw_sha256: plan.raw_sha256, byte_size: plan.byte_size, actual_mime_type: plan.actual_mime_type };
  let body: Blob | null = null;
  if (plan.phase === "prepare") {
    body = await verifiedBody("recipe-images-private", plan.source_object_path);
    // No public PUT is permitted until the asset identity/reference and recipe
    // runtime have committed. A failed DB operation therefore leaves no public blob.
    const committed = await input.rpcClient.rpc("publish_manual_recipe", { ...params, p_verified_image: evidence });
    if (committed.error) throw committed.error;
    if (record(committed.data) && committed.data.status === "published" && record(committed.data.recipe)
      && committed.data.recipe.id === input.recipeId && committed.data.recipe.visibility === "public") return committed.data.recipe;
    if (!record(committed.data) || committed.data.status !== "copy_required" || committed.data.phase !== "upload"
      || Object.entries(plan).some(([key, value]) => key !== "phase" && committed.data && (committed.data as Record<string, unknown>)[key] !== value)) {
      throw new Error("Manual recipe image publication did not commit");
    }
  } else {
    // A lost acknowledgement may follow a successful PUT. Recover it without
    // requiring the private original, which may have been removed on withdrawal.
    try { await verifiedBody("recipe-images", plan.target_object_path); }
    catch { body = await verifiedBody("recipe-images-private", plan.source_object_path); }
  }
  if (body) {
    // Never overwrite or compensate-delete: another request may already have
    // uploaded/confirmed this committed shared asset.
    await input.storageClient.storage.from("recipe-images").upload(plan.target_object_path, body, { contentType: String(plan.actual_mime_type), upsert: false });
    await verifiedBody("recipe-images", plan.target_object_path);
  }
  const final = await input.rpcClient.rpc("publish_manual_recipe", {
    ...params, p_verified_image: { ...evidence, copy_verified: true },
  });
  if (final.error) throw final.error;
  if (!record(final.data) || final.data.status !== "published" || !record(final.data.recipe)
    || final.data.recipe.id !== input.recipeId || final.data.recipe.visibility !== "public") {
    throw new Error("Manual recipe publication did not finish");
  }
  return final.data.recipe;
}
