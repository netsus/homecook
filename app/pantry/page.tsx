import { AppShell } from "@/components/layout/app-shell";
import { PantryScreen } from "@/components/pantry/pantry-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "집에 있는 재료를 관리하고 장보기 제외 재료를 정리하는 팬트리",
  title: "팬트리",
};

export default async function PantryPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-pantry-shell"
      currentTab="pantry"
      headerMode="hidden"
    >
      <PantryScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
