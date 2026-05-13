import { HomeScreen } from "@/components/home/home-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-home-shell"
      currentTab="home"
      headerMode="desktop-only"
    >
      <HomeScreen />
    </AppShell>
  );
}
