import type { Metadata } from "next";

import { MarketingDemandValidationScreen } from "@/components/marketing/marketing-demand-validation-screen";

const betaDescription =
  "레시피도, 편의점도 하루·한 주 영양을 한눈에 보는 30초 식단 기록 테스트";

export const metadata: Metadata = {
  alternates: {
    canonical: "/beta",
  },
  description: betaDescription,
  openGraph: {
    description: betaDescription,
    title: "30초 식단 기록 테스트",
    type: "website",
    url: "/beta",
  },
  robots: {
    follow: false,
    index: false,
  },
  title: "30초 식단 기록 테스트",
};

export default function BetaPage() {
  return <MarketingDemandValidationScreen />;
}
