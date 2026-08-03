import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export default async function SnapshotV2CookModePage({ params }: { params: Promise<{ session_id: string }> }) {
  const { session_id } = await params;
  return <SnapshotV2CookModeScreen initialAuthenticated={await getInitialAuthenticatedFromServer()} sessionId={session_id} />;
}
