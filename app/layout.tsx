import type { Metadata } from "next";
import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import { ProviderMemorySync } from "@/components/auth/provider-memory-sync";
import { QaFixtureToolbar } from "@/components/layout/qa-fixture-toolbar";
import { getPublicSiteOrigin } from "@/lib/legal-info";
import {
  defaultOpenGraphImagePath,
  defaultTwitterImagePath,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@/lib/seo/default-social-image";
import "./globals.css";

const siteUrl = getPublicSiteOrigin();
const siteDescription = "레시피 찾기, 식단 계획, 장보기, 요리 기록까지 이어지는 무엇을 먹든 서비스";

export const metadata: Metadata = {
  applicationName: "무엇을 먹든",
  description: siteDescription,
  icons: {
    apple: [
      {
        sizes: "180x180",
        type: "image/png",
        url: "/brand/apple-touch-icon-180.png",
      },
    ],
    icon: [
      {
        sizes: "32x32",
        type: "image/png",
        url: "/brand/favicon-32.png",
      },
    ],
  },
  metadataBase: new URL(siteUrl),
  openGraph: {
    description: siteDescription,
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
  },
  title: {
    default: "무엇을 먹든",
    template: "%s | 무엇을 먹든",
  },
  twitter: {
    card: "summary_large_image",
    description: siteDescription,
    images: [defaultTwitterImagePath],
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
