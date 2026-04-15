import { HomeScreen } from "@/components/home/home-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell currentTab="home" headerMode="integrated">
      <HomeScreen />
    </AppShell>
  );
}
