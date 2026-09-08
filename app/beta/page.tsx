import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  isMarketingProfileSource,
  resolveMarketingAdVariant,
} from "@/lib/marketing/demand-validation";

import { MarketingDemandValidationScreen } from "@/components/marketing/marketing-demand-validation-screen";

const betaDescription =
  "레시피도, 편의점도 하루·한 주 영양을 한눈에 보는 30초 식단 기록 테스트";

export const metadata: Metadata = {
  alternates: { canonical: "/beta" },
  description: betaDescription,
  openGraph: {
    description: betaDescription,
    images: ["/assets/funnel/share/og-share.png"],
    title: "30초 식단 기록 테스트",
    type: "website",
    url: "/beta",
  },
  robots: { follow: false, index: false },
  title: "30초 식단 기록 테스트",
  twitter: {
    card: "summary_large_image",
    description: betaDescription,
    images: ["/assets/funnel/share/og-share.png"],
    title: "30초 식단 기록 테스트",
  },
};

type BetaSearchParams = Record<string, string | string[] | undefined>;

export default async function BetaPage({ searchParams }: { searchParams: Promise<BetaSearchParams> }) {
  const query = await searchParams;
  const first = (key: string) => Array.isArray(query[key]) ? query[key][0] : query[key];
  const sharedResult = ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"].includes(first("result") ?? "");
  const queryKeys = Object.keys(query);
  const profileSource = first("profile_source") ?? null;
  const profileEntry = !sharedResult && (
    queryKeys.length === 0
    || (queryKeys.length === 1 && !Array.isArray(query.profile_source) && isMarketingProfileSource(profileSource))
  );
  const variant = resolveMarketingAdVariant(first("utm_content") ?? null, first("ad_variant") ?? null);
  // Shared results keep their privacy-preserving URL and never create a view event.
  // Exact profile links render Hero A but keep their clean platform URL for attribution.
  if (!sharedResult && !profileEntry && (first("ad_variant") !== variant || Array.isArray(query.ad_variant))) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
    }
    params.set("ad_variant", variant);
    redirect(`/beta?${params.toString()}`);
  }
  return <MarketingDemandValidationScreen />;
}
