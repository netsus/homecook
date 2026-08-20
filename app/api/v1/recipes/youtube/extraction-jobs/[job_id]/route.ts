import { youtubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";

interface RouteContext { params: Promise<{ job_id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { job_id: jobId } = await context.params;
  return youtubeAsyncExtractionHandlers.status(request, jobId);
}
