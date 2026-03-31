import { AppShell } from "@/components/layout/app-shell";
import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    authError?: string;
  }>;
}

export default async function RecipePage({
  params,
  searchParams,
}: RecipePageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <AppShell currentTab="home">
      <RecipeDetailScreen
        authError={resolvedSearchParams.authError ?? null}
        recipeId={id}
      />
    </AppShell>
  );
}
