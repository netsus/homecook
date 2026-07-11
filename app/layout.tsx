import type { Metadata } from "next";
import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import { ProviderMemorySync } from "@/components/auth/provider-memory-sync";
import { QaFixtureToolbar } from "@/components/layout/qa-fixture-toolbar";
import { getPublicSiteOrigin } from "@/lib/legal-info";
import "./globals.css";

const siteUrl = getPublicSiteOrigin();
const siteDescription = "레시피 찾기, 식단 계획, 장보기, 요리 기록까지 이어지는 집밥 서비스";

export const metadata: Metadata = {
  applicationName: "집밥",
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  openGraph: {
    description: siteDescription,
    images: [
      {
        alt: "집밥 — 레시피부터 장보기, 요리 기록까지",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    locale: "ko_KR",
    siteName: "집밥",
    title: "집밥",
    type: "website",
  },
  title: {
    default: "집밥",
    template: "%s | 집밥",
  },
  twitter: {
    card: "summary_large_image",
    description: siteDescription,
    images: ["/twitter-image"],
    title: "집밥",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ProviderMemorySync />
        <GrowthToastStack
          initialAuthenticated={false}
          resolveAuthenticatedOnClient
        />
        <QaFixtureToolbar />
      </body>
    </html>
  );
}
