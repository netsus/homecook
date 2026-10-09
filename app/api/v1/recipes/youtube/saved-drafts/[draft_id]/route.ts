import {
  handleGetYoutubeSavedRecipe,
  handleUpdateYoutubeSavedRecipe,
} from "@/lib/server/youtube-saved-recipes";

interface RouteContext {
  params: Promise<{ draft_id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { draft_id: draftId } = await context.params;
  return handleGetYoutubeSavedRecipe(draftId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { draft_id: draftId } = await context.params;
  return handleUpdateYoutubeSavedRecipe(request, draftId);
}
