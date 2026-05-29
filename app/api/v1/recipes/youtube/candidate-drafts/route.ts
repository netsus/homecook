import { handleYoutubeCandidateDraft } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  return handleYoutubeCandidateDraft(request);
}
