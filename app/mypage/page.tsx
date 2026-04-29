import { AppShell } from "@/components/layout/app-shell";
import { MypageScreen } from "@/components/mypage/mypage-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function MypagePage() {
  const user = await getServerAuthUser();

  return (
    <AppShell currentTab="mypage">
      <MypageScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
