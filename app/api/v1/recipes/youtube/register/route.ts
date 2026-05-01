import { handleYoutubeRegister } from "@/lib/server/youtube-import";

export async function POST(request: Request) {
  return handleYoutubeRegister(request);
}
