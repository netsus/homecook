import { StandaloneCookModeScreen } from "@/components/cooking/standalone-cook-mode-screen";

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

  return <StandaloneCookModeScreen recipeId={recipe_id} servings={servings} />;
}
