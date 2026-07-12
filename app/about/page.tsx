import type { Metadata } from "next";

import { AboutScreen } from "@/components/about/about-screen";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  description: "레시피 찾기부터 식단 계획, 장보기, 요리, 남은요리 관리까지 집밥 사용법을 알아보세요.",
  openGraph: {
    description: "레시피 찾기부터 식단 계획, 장보기, 요리, 남은요리 관리까지 집밥 사용법을 알아보세요.",
    images: ["/opengraph-image"],
    title: "집밥 가이드",
    type: "website",
    url: "/about",
  },
  title: "집밥 가이드",
};

export default function AboutPage() {
  const legal = getLegalInfo();

  return <AboutScreen contactEmail={legal.contactEmail} />;
}
