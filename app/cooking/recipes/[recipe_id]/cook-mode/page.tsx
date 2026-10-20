import { RecipeCookingEntry } from "@/components/cooking/recipe-cooking-entry";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

interface StandaloneCookModePageProps {
  params: Promise<{ recipe_id: string }>;
  searchParams: Promise<{ servings?: string; guest?: string }>;
}

export default async function StandaloneCookModePage({
  params,
  searchParams,
}: StandaloneCookModePageProps) {
  const { recipe_id } = await params;
  const resolvedSearchParams = await searchParams;
  const servings = Math.max(1, Number(resolvedSearchParams.servings) || 1);

  const authenticated = resolvedSearchParams.guest !== "1" && await getInitialAuthenticatedFromServer();
  return <RecipeCookingEntry initialAuthenticated={authenticated} recipeId={recipe_id} servings={servings} />;
}
