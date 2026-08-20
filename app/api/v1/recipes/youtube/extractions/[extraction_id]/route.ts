import { youtubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";

interface RouteContext { params: Promise<{ extraction_id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { extraction_id: extractionId } = await context.params;
  return youtubeAsyncExtractionHandlers.session(request, extractionId);
}
