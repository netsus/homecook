import { notFound, redirect } from "next/navigation";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = { title: "내 유튜브 레시피 · 무엇을 먹든" };

export default async function YoutubeSavedRecipePage({ params }: { params: Promise<{ draft_id: string }> }) {
  const { draft_id: id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (!await getInitialAuthenticatedFromServer()) {
    redirect(`/login?next=${encodeURIComponent(`/recipes/youtube/saved/${id}`)}`);
  }
  return <YoutubeImportScreen initialSavedDraftId={id} entryContext="standalone" planDate="" columnId="" slotName="" />;
}
