import { redirect } from "next/navigation";

import { NicknameOnboardingScreen } from "@/components/auth/nickname-onboarding-screen";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
import { getServerAuthUser } from "@/lib/supabase/server";

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
