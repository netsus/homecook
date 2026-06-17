import { LoginScreen } from "@/components/auth/login-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { getServerAuthUser } from "@/lib/supabase/server";
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
  const user = await getServerAuthUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <LoginScreen
      authError={resolvedSearchParams.authError ?? null}
      nextPath={nextPath}
    />
  );
}
