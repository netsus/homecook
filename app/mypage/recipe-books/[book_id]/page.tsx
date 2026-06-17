import { AppShell } from "@/components/layout/app-shell";
import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import type { RecipeBookType } from "@/types/recipe";

export async function generateMetadata({ searchParams }: PageProps) {
  const query = await searchParams;
  const bookName =
    typeof query.name === "string" && query.name.trim()
      ? query.name.trim()
      : "레시피북";

  return {
    description: `${bookName}에 저장된 레시피를 책처럼 넘겨보는 레시피북 상세`,
    title: bookName,
  };
}

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
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

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
    <AppShell
      className="wave1-mypage-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <RecipeBookDetailScreen
        bookId={bookId}
        bookName={bookName}
        bookType={bookType}
        initialAuthenticated={initialAuthenticated}
      />
    </AppShell>
  );
}
