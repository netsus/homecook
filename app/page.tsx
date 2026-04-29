import { HomeScreen } from "@/components/home/home-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell
      bottomTabsMode="hidden"
      currentTab="home"
      headerMode="hidden"
    >
      <HomeScreen />
    </AppShell>
  );
}
