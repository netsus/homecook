import { SettingsScreen } from "@/components/settings/settings-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = {
  description: "프로필, 끼니 이름, 요리모드 화면 켜둠, 계정 설정을 관리하는 화면",
  title: "환경설정",
};

export default async function SettingsPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return <SettingsScreen initialAuthenticated={initialAuthenticated} />;
}
