import { LoginScreen } from "@/components/auth/login-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import { redirect } from "next/navigation";

export const metadata = {
  description: "내 식단과 레시피북을 이어서 사용하기 위한 집밥 로그인",
  title: "로그인",
};

interface LoginPageProps {
  searchParams: Promise<{
    authError?: string;
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams.next ?? "/");
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  if (initialAuthenticated) {
    redirect(nextPath);
  }

  return (
    <LoginScreen
      authError={resolvedSearchParams.authError ?? null}
      nextPath={nextPath}
    />
  );
}
