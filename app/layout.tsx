import type { Metadata } from "next";
import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import { ProviderMemorySync } from "@/components/auth/provider-memory-sync";
import { QaFixtureToolbar } from "@/components/layout/qa-fixture-toolbar";
import { getPublicSiteOrigin } from "@/lib/legal-info";
import "./globals.css";

const siteUrl = getPublicSiteOrigin();
const siteDescription = "레시피 찾기, 식단 계획, 장보기, 요리 기록까지 이어지는 무엇을 먹든 서비스";

export const metadata: Metadata = {
  applicationName: "무엇을 먹든",
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  openGraph: {
    description: siteDescription,
    images: [
      {
        alt: "무엇을 먹든 — 레시피부터 장보기, 요리 기록까지",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    locale: "ko_KR",
    siteName: "무엇을 먹든",
    title: "무엇을 먹든",
    type: "website",
  },
  title: {
    default: "무엇을 먹든",
    template: "%s | 무엇을 먹든",
  },
  twitter: {
    card: "summary_large_image",
    description: siteDescription,
    images: ["/twitter-image"],
    title: "무엇을 먹든",
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
