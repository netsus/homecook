import { handleYoutubeIngredientRegistration } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  return handleYoutubeIngredientRegistration(request);
}
