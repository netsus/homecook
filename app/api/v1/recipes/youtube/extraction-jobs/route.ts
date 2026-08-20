import { youtubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";

export async function POST(request: Request) {
  return youtubeAsyncExtractionHandlers.enqueue(request);
}
