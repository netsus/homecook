import type { Metadata } from "next";
import { headers } from "next/headers";
import { HomeflowLanding } from "@/components/marketing/homeflow-landing";
import { homeflowPageEntry } from "@/lib/server/homeflow-page";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";

export const dynamic = "force-dynamic";
const title = "나의 집밥 유형 · 무먹";
const description = "4문항으로 내 집밥 유형을 알아보고, 레시피부터 장보기와 요리까지 무먹을 체험해보세요.";
const socialImage = "/assets/funnel/share/r2-homeflow-og.webp";
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: "/beta/r2/homeflow" },
  openGraph: {
    title,
    description,
    url: "/beta/r2/homeflow",
    type: "website",
    images: [{ url: socialImage, width: 1200, height: 630, type: "image/webp", alt: "무먹 집밥 흐름 유형 테스트" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [socialImage] },
};
export default async function HomeflowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const host = (await headers()).get("host") ?? "";
  const entry = homeflowPageEntry(host, search.toString(), readRound2RuntimeConfig());
  return <HomeflowLanding {...entry} siteKey={process.env.NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY ?? ""} />;
}
