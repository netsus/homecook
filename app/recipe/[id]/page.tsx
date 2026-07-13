import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import { defaultOpenGraphImagePath } from "@/lib/seo/default-social-image";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import {
  createPublicDataClient,
  getServerAuthUser,
} from "@/lib/supabase/server";

const DEFAULT_RECIPE_DESCRIPTION =
  "재료와 조리 과정을 확인하고 식단, 장보기, 요리 기록으로 이어가세요.";

function normalizeMetadataDescription(description: string | null) {
  const compact = description?.replace(/\s+/gu, " ").trim();
  if (!compact) return DEFAULT_RECIPE_DESCRIPTION;
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function normalizeSocialImage(imageUrl: string | null) {
  const normalized = normalizeFoodSafetyImageUrl(imageUrl);
  if (!normalized) return defaultOpenGraphImagePath;

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:"
      ? normalized
      : defaultOpenGraphImagePath;
  } catch {
    return defaultOpenGraphImagePath;
  }
}

export async function generateMetadata({ params }: RecipePageProps): Promise<Metadata> {
  const { id } = await params;
  const canonicalPath = `/recipe/${encodeURIComponent(id)}`;

  try {
    const supabase = createPublicDataClient();
    const result = await supabase
      .from("recipes")
      .select("title, description, thumbnail_url")
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      return {
        alternates: { canonical: canonicalPath },
        description: DEFAULT_RECIPE_DESCRIPTION,
        title: "레시피 상세",
      };
    }

    if (!result.data) {
      return {
        robots: { follow: false, index: false },
        title: "레시피를 찾을 수 없어요",
      };
    }

    const description = normalizeMetadataDescription(result.data.description);
    const image = normalizeSocialImage(result.data.thumbnail_url);

    return {
      alternates: { canonical: canonicalPath },
      description,
      openGraph: {
        description,
        images: [image],
        title: result.data.title,
        type: "article",
        url: canonicalPath,
      },
      title: result.data.title,
      twitter: {
        card: "summary_large_image",
        description,
        images: [image],
        title: result.data.title,
      },
    };
  } catch {
    return {
      alternates: { canonical: canonicalPath },
      description: DEFAULT_RECIPE_DESCRIPTION,
      title: "레시피 상세",
    };
  }
}

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
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-recipe-shell"
      currentTab="home"
      headerMode="hidden"
    >
      <RecipeDetailScreen
        authError={resolvedSearchParams.authError ?? null}
        initialAuthenticated={Boolean(user)}
        recipeId={id}
      />
    </AppShell>
  );
}
