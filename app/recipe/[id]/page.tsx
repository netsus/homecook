import { AppShell } from "@/components/layout/app-shell";
import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  return (
    <AppShell currentTab="home">
      <RecipeDetailScreen recipeId={id} />
    </AppShell>
  );
}
