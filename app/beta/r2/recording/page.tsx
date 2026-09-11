import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { RecordingLanding } from "@/components/marketing/recording-landing";
import { buildRecordingPage } from "@/lib/server/recording-page";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "나의 집밥 기록 유형 · 무먹",
  description: "4문항으로 집밥 기록 유형을 알아보고 준비된 무먹 예시를 체험해보세요.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: "/beta/r2/recording" },
};

export default async function RecordingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, incoming] = await Promise.all([searchParams, headers()]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if ((key !== "result" && !key.startsWith("utm_")) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const entry = await buildRecordingPage({ host: incoming.get("host") ?? "", rawSearch: search.toString(), config: readRound2RuntimeConfig(), siteKey: process.env.MUMEOK_ROUND2_TURNSTILE_SITE_KEY ?? "" });
  if (!entry) notFound();
  if (entry.kind === "redirect") permanentRedirect(entry.location);
  return <><meta name="mumeok-r2-page-context" content={entry.props.pageContext} /><meta name="mumeok-r2-topic" content="recording" /><RecordingLanding {...entry.props} /></>;
}
