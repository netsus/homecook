import { CookModeScreen } from "@/components/cooking/cook-mode-screen";

interface CookModePageProps {
  params: Promise<{ session_id: string }>;
}

export default async function CookModePage({ params }: CookModePageProps) {
  const { session_id } = await params;

  return <CookModeScreen sessionId={session_id} />;
}
