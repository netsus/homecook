import { HomeScreen } from "@/components/home/home-screen";
import { AppShell } from "@/components/layout/app-shell";

export const metadata = {
  alternates: {
    canonical: "/",
  },
  description: "레시피를 찾고 식단, 장보기, 요리 기록으로 이어가는 무엇을 먹든 홈",
  openGraph: {
    url: "/",
  },
  title: "홈",
};

export default function Home() {
  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-home-shell"
      currentTab="home"
      headerMode="hidden"
    >
      <HomeScreen />
    </AppShell>
  );
}
