import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { Round2Landing } from "@/components/marketing/round2/round2-landing";
import { resolveRound2Topic } from "@/lib/server/marketing-round2-context";
import { buildRound2Page } from "@/lib/server/marketing-round2-page";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteParams = { topic: string };
type SearchParams = Record<string, string | string[] | undefined>;
const titles = { recording: "내 레시피로 만든 집밥, 먹은 만큼 영양 기록", homeflow: "뭐 먹을지 정한 다음, 장보기부터 남은 요리까지" };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { topic: segment } = await params;
  const topic = resolveRound2Topic(`/beta/r2/${segment}`);
  if (!topic) notFound();
  const canonical = `/beta/r2/${topic}`;
  return {
    title: titles[topic],
    description: "현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.",
    alternates: { canonical },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title: titles[topic], url: canonical, type: "website" },
  };
}

export default async function Round2Page({ params, searchParams }: { params: Promise<RouteParams>; searchParams: Promise<SearchParams> }) {
  const [{ topic }, query, incoming] = await Promise.all([params, searchParams, headers()]);
  const search = new URLSearchParams();
  // Keep duplicates for the canonical normalizer; never serialize arbitrary query/PII into the page.
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("utm_") || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const result = await buildRound2Page({
    pathname: `/beta/r2/${topic}`,
    host: incoming.get("host") ?? "",
    rawSearch: search.toString(),
    config: readRound2RuntimeConfig(),
    siteKey: process.env.MUMEOK_ROUND2_TURNSTILE_SITE_KEY ?? "",
  });
  if (!result) notFound();
  if (result.kind === "redirect") permanentRedirect(result.location);
  return <>
    <meta name="mumeok-r2-page-context" content={result.props.pageContext} />
    <meta name="mumeok-r2-topic" content={result.props.topic} />
    <Round2Landing {...result.props} />
  </>;
}
