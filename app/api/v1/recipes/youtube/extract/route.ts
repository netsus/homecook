import { handleYoutubeExtract } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  return handleYoutubeExtract(request);
}
