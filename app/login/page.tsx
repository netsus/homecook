import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function LoginPage() {
  return (
    <AppShell currentTab="home">
      <LoginScreen />
    </AppShell>
  );
}
