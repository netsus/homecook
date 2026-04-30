import { SettingsScreen } from "@/components/settings/settings-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getServerAuthUser();

  return <SettingsScreen initialAuthenticated={Boolean(user)} />;
}
