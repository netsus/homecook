import { redirect } from "next/navigation";

import { NicknameOnboardingScreen } from "@/components/auth/nickname-onboarding-screen";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "무엇을 먹든에서 사용할 닉네임을 설정하는 첫 화면",
  title: "닉네임 설정",
};

interface NicknameOnboardingPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

function buildLoginPath(nextPath: string) {
  const onboardingPath = `/onboarding/nickname?next=${encodeURIComponent(nextPath)}`;

  return `/login?next=${encodeURIComponent(onboardingPath)}`;
}

export default async function NicknameOnboardingPage({
  searchParams,
}: NicknameOnboardingPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = sanitizeInternalPath(resolvedSearchParams.next, "/");
  const user = await getServerAuthUser();

  if (!user) {
    redirect(buildLoginPath(nextPath));
  }

  return <NicknameOnboardingScreen nextPath={nextPath} />;
}
