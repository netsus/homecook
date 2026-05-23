import { SettingsScreen } from "@/components/settings/settings-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export default async function SettingsPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return <SettingsScreen initialAuthenticated={initialAuthenticated} />;
}
