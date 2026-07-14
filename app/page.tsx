import type { Metadata } from "next";

import { HomeScreen } from "@/components/home/home-screen";
import { AppShell } from "@/components/layout/app-shell";
import {
  defaultOpenGraphImagePath,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@/lib/seo/default-social-image";

const homeDescription = "레시피를 찾고 식단, 장보기, 요리 기록으로 이어가는 무엇을 먹든 홈";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description: homeDescription,
  openGraph: {
    description: homeDescription,
    images: [
      {
        alt: socialImageAlt,
        height: socialImageSize.height,
        type: socialImageContentType,
        url: defaultOpenGraphImagePath,
        width: socialImageSize.width,
      },
    ],
    locale: "ko_KR",
    siteName: "무엇을 먹든",
    title: "무엇을 먹든",
    type: "website",
    url: "/",
  },
  title: "홈",
};

export default function Home() {
  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-home-shell"
      currentTab="home"
      headerMode="hidden"
    >
      <HomeScreen />
    </AppShell>
  );
}
