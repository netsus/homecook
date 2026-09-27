import { fail } from "@/lib/api/response";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";
import {
  readRecipeImageProjection,
  validateManagedRecipeImageReadTarget,
} from "@/lib/server/recipe-image-read";
import { createRecipeImageInternalClient, createRouteHandlerClient } from "@/lib/supabase/server";

/** Storage stays loopback-only. Recheck recipe access before serving its registry-bound image. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const routeClient = await createRouteHandlerClient({ anonymousPublicReadScope: "recipe-detail" });
    const recipe = await routeClient.from("recipes")
      .select("id, created_by, deleted_at, visibility")
      .eq("id", id).maybeSingle();
    if (recipe.error) {
      return createHybridAuthorityRouteError(recipe.error)
        ?? fail("INTERNAL_ERROR", "이미지를 불러오지 못했어요.", 500);
    }
    if (!recipe.data || recipe.data.deleted_at) {
      return fail("RESOURCE_NOT_FOUND", "이미지를 찾을 수 없어요.", 404);
    }
    const client = createRecipeImageInternalClient();
    if (!client) return fail("INTERNAL_ERROR", "이미지를 불러오지 못했어요.", 500);
    const projection = await readRecipeImageProjection({ client, recipeId: id });
    if (!projection?.image_object_id) return fail("RESOURCE_NOT_FOUND", "이미지를 찾을 수 없어요.", 404);
    if (recipe.data.visibility === "public" && projection.visibility !== "public_shared") {
      return fail("RESOURCE_NOT_FOUND", "이미지를 찾을 수 없어요.", 404);
    }
    const target = validateManagedRecipeImageReadTarget({
      projection,
      expectedOwnerUuid: recipe.data.created_by,
      expectedReferenceType: "recipe_thumbnail",
    });
    const result = await client.storage.from(target.bucketId).download(target.objectPath);
    if (result.error || !result.data) return fail("RESOURCE_NOT_FOUND", "이미지를 찾을 수 없어요.", 404);
    if (result.data.size > RECIPE_IMAGE_MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(result.data.type)) {
      return fail("INTERNAL_ERROR", "이미지를 불러오지 못했어요.", 500);
    }
    return new Response(result.data, {
      headers: {
        "Content-Type": result.data.type,
        "Content-Length": String(result.data.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return createHybridAuthorityRouteError(error)
      ?? fail("INTERNAL_ERROR", "이미지를 불러오지 못했어요.", 500);
  }
}
