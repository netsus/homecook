import { LoginScreen } from "@/components/auth/login-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import {
  LAST_AUTH_PROVIDER_COOKIE,
  parseAuthProviderCookie,
} from "@/lib/auth/provider-cookies";
import { normalizeAuthProviderId } from "@/lib/auth/providers";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  description: "내 식단과 레시피북을 이어서 사용하기 위한 집밥 로그인",
  title: "로그인",
};

interface LoginPageProps {
  searchParams: Promise<{
    authError?: string;
    attemptedProvider?: string;
    expectedProvider?: string;
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();
  const nextPath = resolveNextPath(resolvedSearchParams.next ?? "/");
  const initialAuthenticated = await getInitialAuthenticatedFromServer();
  const expectedProvider = normalizeAuthProviderId(
    resolvedSearchParams.expectedProvider,
  );
  const attemptedProvider = normalizeAuthProviderId(
    resolvedSearchParams.attemptedProvider,
  );
  const lastProvider = parseAuthProviderCookie(
    cookieStore.get(LAST_AUTH_PROVIDER_COOKIE)?.value,
  );

  if (initialAuthenticated) {
    redirect(nextPath);
  }

  return (
    <LoginScreen
      attemptedProvider={attemptedProvider}
      authError={resolvedSearchParams.authError ?? null}
      expectedProvider={expectedProvider}
      lastProvider={lastProvider}
      nextPath={nextPath}
    />
  );
}
