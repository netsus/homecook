import { fail, ok } from "@/lib/api/response";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import { normalizeRecipioYoutubeUrl } from "@/lib/recipio-youtube-import";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipioYoutubeDuplicateCheckData } from "@/types/recipe";

interface QueryError {
  message: string;
}

interface RecipeSourceLookupRow {
  recipe_id: string;
  youtube_url: string | null;
  youtube_video_id: string | null;
  recipes:
    | {
        id: string;
        title: string;
        thumbnail_url: string | null;
      }
    | Array<{
        id: string;
        title: string;
        thumbnail_url: string | null;
      }>
    | null;
}

function getJoinedRecipe(row: RecipeSourceLookupRow) {
  return Array.isArray(row.recipes) ? row.recipes[0] ?? null : row.recipes;
}

export async function GET(request: Request) {
  if (!isYoutubeImportEnabled()) {
    return fail("FEATURE_DISABLED", "유튜브 가져오기는 베타에서 준비 중이에요.", 404);
  }

  const parsedUrl = normalizeRecipioYoutubeUrl(new URL(request.url).searchParams.get("youtube_url") ?? "");
  if (!parsedUrl) {
    return fail("INVALID_URL", "올바른 유튜브 URL을 입력해 주세요.", 422, [
      { field: "youtube_url", reason: "invalid_url" },
    ]);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = createServiceRoleClient() ?? routeClient;
  const result = await dbClient
    .from("recipe_sources")
    .select("recipe_id, youtube_url, youtube_video_id, recipes(id, title, thumbnail_url)")
    .eq("youtube_video_id", parsedUrl.videoId)
    .maybeSingle() as {
      data: RecipeSourceLookupRow | null;
      error: QueryError | null;
    };

  if (result.error) {
    return fail("INTERNAL_ERROR", "기존 레시피를 확인하지 못했어요.", 500);
  }

  const recipe = result.data ? getJoinedRecipe(result.data) : null;

  if (!result.data || !recipe) {
    return ok<RecipioYoutubeDuplicateCheckData>({
      is_duplicate: false,
      recipe: null,
    });
  }

  return ok<RecipioYoutubeDuplicateCheckData>({
    is_duplicate: true,
    recipe: {
      recipe_id: recipe.id,
      title: recipe.title,
      thumbnail_url: recipe.thumbnail_url,
      youtube_url: result.data.youtube_url ?? parsedUrl.youtubeUrl,
      youtube_video_id: result.data.youtube_video_id ?? parsedUrl.videoId,
    },
  });
}
