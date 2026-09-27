import { RecipeCookingEntry } from "@/components/cooking/recipe-cooking-entry";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

interface StandaloneCookModePageProps {
  params: Promise<{ recipe_id: string }>;
  searchParams: Promise<{ servings?: string }>;
}

export default async function StandaloneCookModePage({
  params,
  searchParams,
}: StandaloneCookModePageProps) {
  const { recipe_id } = await params;
  const resolvedSearchParams = await searchParams;
  const servings = Math.max(1, Number(resolvedSearchParams.servings) || 1);

  return <RecipeCookingEntry initialAuthenticated={await getInitialAuthenticatedFromServer()} recipeId={recipe_id} servings={servings} />;
}
