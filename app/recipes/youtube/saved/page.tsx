import { redirect } from "next/navigation";

import { YoutubeSavedRecipesScreen } from "@/components/recipe/youtube-saved-recipes-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = { title: "보관한 유튜브 레시피 · 무엇을 먹든" };

export default async function YoutubeSavedRecipesPage() {
  if (!await getInitialAuthenticatedFromServer()) {
    redirect("/login?next=%2Frecipes%2Fyoutube%2Fsaved");
  }
  return <YoutubeSavedRecipesScreen />;
}
