import { fail, ok } from "@/lib/api/response";
import {
  getRecipeImageExtension,
  isAllowedRecipeImageType,
  RECIPE_IMAGE_BUCKET,
  RECIPE_IMAGE_MAX_BYTES,
} from "@/lib/server/recipe-media";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

interface StorageBucket {
  upload(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): PromiseLike<{
    data: { path?: string } | null;
    error: { message: string } | null;
  }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

interface StorageClient {
  storage: {
    from(bucket: typeof RECIPE_IMAGE_BUCKET): StorageBucket;
  };
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "이미지 파일을 확인해 주세요.", 422, [
      { field: "image", reason: "invalid_multipart" },
    ]);
  }

  const image = formData.get("image");
  if (!isFile(image)) {
    return fail("VALIDATION_ERROR", "이미지 파일을 선택해 주세요.", 422, [
      { field: "image", reason: "required" },
    ]);
  }

  if (!isAllowedRecipeImageType(image.type)) {
    return fail("VALIDATION_ERROR", "jpeg, png, webp 이미지만 업로드할 수 있어요.", 422, [
      { field: "image", reason: "unsupported_type" },
    ]);
  }

  if (image.size > RECIPE_IMAGE_MAX_BYTES) {
    return fail("VALIDATION_ERROR", "이미지는 5MB 이하로 업로드해 주세요.", 422, [
      { field: "image", reason: "max_size" },
    ]);
  }

  const extension = getRecipeImageExtension(image.type);
  if (!extension) {
    return fail("VALIDATION_ERROR", "이미지 파일을 확인해 주세요.", 422, [
      { field: "image", reason: "unsupported_type" },
    ]);
  }

  const storageClient = (createServiceRoleClient() ?? routeClient) as unknown as StorageClient;
  const objectPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const bucket = storageClient.storage.from(RECIPE_IMAGE_BUCKET);
  const uploadResult = await bucket.upload(objectPath, image, {
    contentType: image.type,
    upsert: false,
  });

  if (uploadResult.error) {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  const publicUrl = bucket.getPublicUrl(objectPath).data.publicUrl;

  return ok({
    thumbnail_url: publicUrl,
    storage_path: `${RECIPE_IMAGE_BUCKET}/${objectPath}`,
  }, { status: 201 });
}
