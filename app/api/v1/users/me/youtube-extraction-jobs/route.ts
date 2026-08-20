import { youtubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";

export async function GET(request: Request) {
  return youtubeAsyncExtractionHandlers.list(request);
}
