import {
  handleCreateYoutubeSavedRecipe,
  handleListYoutubeSavedRecipes,
} from "@/lib/server/youtube-saved-recipes";

export async function GET() {
  return handleListYoutubeSavedRecipes();
}

export async function POST(request: Request) {
  return handleCreateYoutubeSavedRecipe(request);
}
