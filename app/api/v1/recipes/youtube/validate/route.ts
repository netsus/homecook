import { handleYoutubeValidate } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  return handleYoutubeValidate(request);
}
