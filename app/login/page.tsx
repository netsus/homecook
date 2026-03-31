import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/layout/app-shell";

interface LoginPageProps {
  searchParams: Promise<{
    authError?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <AppShell currentTab="home">
      <LoginScreen authError={resolvedSearchParams.authError ?? null} />
    </AppShell>
  );
}
