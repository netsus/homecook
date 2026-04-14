import { AppShell } from "@/components/layout/app-shell";
import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

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
  const user = hasSupabasePublicEnv() ? await getServerAuthUser() : null;

  return (
    <AppShell currentTab="home">
      <RecipeDetailScreen
        authError={resolvedSearchParams.authError ?? null}
        initialAuthenticated={Boolean(user)}
        recipeId={id}
      />
    </AppShell>
  );
}
