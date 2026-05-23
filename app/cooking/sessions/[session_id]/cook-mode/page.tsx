import { CookModeScreen } from "@/components/cooking/cook-mode-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

interface CookModePageProps {
  params: Promise<{ session_id: string }>;
}

export default async function CookModePage({ params }: CookModePageProps) {
  const { session_id } = await params;
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return (
    <CookModeScreen
      initialAuthenticated={initialAuthenticated}
      sessionId={session_id}
    />
  );
}
