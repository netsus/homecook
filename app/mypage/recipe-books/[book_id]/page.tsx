import { AppShell } from "@/components/layout/app-shell";
import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";
import { getServerAuthUser } from "@/lib/supabase/server";
import type { RecipeBookType } from "@/types/recipe";

const VALID_BOOK_TYPES = new Set<RecipeBookType>([
  "my_added",
  "saved",
  "liked",
  "custom",
]);

interface PageProps {
  params: Promise<{ book_id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RecipeBookDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { book_id: bookId } = await params;
  const query = await searchParams;
  const user = await getServerAuthUser();

  const rawType = typeof query.type === "string" ? query.type : "";
  const bookType: RecipeBookType = VALID_BOOK_TYPES.has(
    rawType as RecipeBookType,
  )
    ? (rawType as RecipeBookType)
    : "saved";

  const bookName =
    typeof query.name === "string" && query.name.trim()
      ? query.name.trim()
      : "레시피북";

  return (
    <AppShell currentTab="mypage" headerMode="hidden">
      <RecipeBookDetailScreen
        bookId={bookId}
        bookName={bookName}
        bookType={bookType}
        initialAuthenticated={Boolean(user)}
      />
    </AppShell>
  );
}
