import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/layout/app-shell";
import { resolveNextPath } from "@/lib/auth/callback";

interface LoginPageProps {
  searchParams: Promise<{
    authError?: string;
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams.next ?? "/");

  return (
    <AppShell currentTab="home">
      <LoginScreen
        authError={resolvedSearchParams.authError ?? null}
        nextPath={nextPath}
      />
    </AppShell>
  );
}
