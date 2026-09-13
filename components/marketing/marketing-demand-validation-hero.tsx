"use client";

import React, { type ReactNode } from "react";
import Image from "next/image";
import { ArrowRightIcon, CheckCircledIcon, Cross2Icon, FileTextIcon, LightningBoltIcon, LockClosedIcon, PlayIcon, StarFilledIcon } from "@radix-ui/react-icons";
import type { ActiveMarketingAdVariant } from "@/lib/marketing/demand-validation";

type HeroBodyHighlight = { text: string; tone: "a" | "b" | "negative" | "positive" };

const HERO_COPY: Record<ActiveMarketingAdVariant, { title: string; emphasis: string; body: string; bodyHighlights?: HeroBodyHighlight[] }> = {
  a: { title: "레시피만 가져오면\n영양성분 계산까지!", emphasis: "영양성분", body: "집밥도 편하게\n식단 기록해요.", bodyHighlights: [{ text: "편하게", tone: "a" }] },
  b: { title: "수분 빠진 제육볶음 300g,\n칼로리가 달라져요.", emphasis: "칼로리", body: "집밥도 정확하게\n식단 기록해요.", bodyHighlights: [{ text: "정확하게", tone: "b" }] },
  c: { title: "내 집밥에\n영양성분표를 딱!", emphasis: "영양성분표", body: "제육볶음 검색 대신\n내 레시피로 기록해요.", bodyHighlights: [{ text: "검색", tone: "negative" }, { text: "내 레시피", tone: "positive" }] },
};

function renderBodyHighlights(text: string, highlights: HeroBodyHighlight[]) {
  if (!highlights.length) return text;
  const escaped = highlights.map(({ text: highlight }) => highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.split(new RegExp(`(${escaped.join("|")})`, "g")).map((part, index) => {
    const highlight = highlights.find(({ text: candidate }) => candidate === part);
    if (!highlight) return part;
    return <span className={`hero-body-emphasis hero-body-emphasis--${highlight.tone}`} key={`${part}-${index}`}>
      {part}
      {highlight.tone === "a" || highlight.tone === "b" ? <StarFilledIcon className="hero-body-doodle hero-body-doodle--star" aria-hidden="true" /> : null}
      {highlight.tone === "negative" ? <Cross2Icon className="hero-body-doodle hero-body-doodle--cross" aria-hidden="true" /> : null}
      {highlight.tone === "positive" ? <><Image className="hero-body-circle-doodle" unoptimized src="/assets/funnel/annotations/circle-doodle-violet.webp" alt="" width={82} height={42} aria-hidden="true" /><StarFilledIcon className="hero-body-doodle hero-body-doodle--star" aria-hidden="true" /></> : null}
    </span>;
  });
}

export function Frame({ children, stage, className = "" }: { children: ReactNode; stage: string; className?: string }) {
  return <main className={`mdv2-screen screen-content ${className}`} data-stage={stage} data-testid={`screen-${stage}`}>{children}</main>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? "is-compact" : ""}`}><Image unoptimized src="/assets/funnel/brand/mumeok-symbol.webp" alt="무먹" width={42} height={42} priority /><span>무엇을 먹든</span></div>;
}

function HeroArrow() { return <ArrowRightIcon className="hero-live-arrow" aria-hidden="true" />; }

function HeroLiveVisual({ variant }: { variant: "a" | "b" | "c" }) {
  if (variant === "a") return <div className="hero-live-visual hero-live-visual--a" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-recipe-card" data-testid="hero-ui-card"><header data-testid="hero-card-label">YouTube 레시피</header><div className="hero-live-photo hero-live-photo--youtube"><Image data-testid="hero-food-image" unoptimized src="/assets/funnel/food/recipe-jeyuk-thumbnail.webp" alt="유튜브 제육볶음 레시피 영상" width={480} height={360} priority /><span className="hero-youtube-play" aria-hidden="true"><PlayIcon /></span></div></section>
    <div className="hero-extract-step" aria-label="재료와 양 자동 추출"><span>재료·양</span><strong>자동 추출</strong><ArrowRightIcon aria-hidden="true" /></div>
    <section className="hero-ui-card hero-facts-card hero-facts-card--a" data-testid="hero-ui-card"><header className="hero-facts-header" data-testid="hero-card-label"><strong>영양성분</strong><span>1인분 320g 기준</span></header><div className="hero-facts-calories"><span>열량</span><strong>487 <small>kcal</small></strong></div><div className="hero-facts-rows" data-testid="hero-card-detail"><div><span>탄수화물</span><strong>31g</strong></div><div><span>단백질</span><strong>39g</strong></div><div><span>지방</span><strong>22g</strong></div></div><strong className="hero-facts-payoff">자동 계산 완료 <CheckCircledIcon /></strong></section>
  </div>;
  if (variant === "b") return <div className="hero-live-visual hero-live-visual--b" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-weight-card" data-testid="hero-ui-card" aria-label="완성 무게 1083g 저울"><div className="hero-live-photo hero-live-photo--scale" data-testid="hero-card-detail"><Image data-testid="hero-food-image" unoptimized src="/assets/funnel/food/jeyuk-on-scale.webp" alt="저울 위 제육볶음" width={500} height={500} priority /><output className="hero-live-scale-readout" aria-label="완성 무게 1083g">1,083<small>g</small></output></div></section>
    <HeroArrow />
    <section className="hero-ui-card hero-calc-card" data-testid="hero-ui-card"><div className="hero-calc-story" data-testid="hero-card-detail"><div className="hero-weight-shift" aria-label="조리 전 1420g에서 조리 후 1083g으로 변화"><div><span>조리 전</span><strong>1,420g</strong></div><ArrowRightIcon aria-hidden="true" /><div><span>조리 후</span><strong>1,083g</strong></div></div><p className="hero-water-loss"><strong>총 칼로리는 그대로</strong></p><div className="hero-calorie-result"><span>먹은 300g</span><strong>457 <small>kcal</small></strong></div></div></section>
  </div>;
  return <div className="hero-live-visual hero-live-visual--c" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-own-recipe-card" data-testid="hero-ui-card"><div className="hero-live-photo hero-live-photo--plate"><Image data-testid="hero-food-image" unoptimized src="/assets/funnel/food/jeyuk-recipe-clean.webp" alt="내 레시피로 만든 제육볶음" width={600} height={400} priority /></div><header data-testid="hero-card-label">내 제육볶음 레시피</header></section>
    <HeroArrow />
    <section className="hero-ui-card hero-facts-card hero-facts-card--c" data-testid="hero-ui-card"><header className="hero-facts-header" data-testid="hero-card-label"><strong>영양성분</strong><span>내 집밥 320g</span></header><div className="hero-facts-calories"><span>열량</span><strong>487 <small data-testid="hero-kcal-unit">kcal</small></strong></div><div className="hero-facts-rows" data-testid="hero-card-detail"><div><span>탄수화물</span><strong>31g</strong></div><div><span>단백질</span><strong>39g</strong></div><div><span>지방</span><strong>22g</strong></div></div><strong className="hero-facts-payoff">내 레시피 기준 <CheckCircledIcon /></strong></section>
  </div>;
}

export function MarketingDemandValidationHero({ variant, onStart, pending = false, presentation }: { variant: ActiveMarketingAdVariant; onStart: () => void; pending?: boolean; presentation?: "recording-intro" }) {
  const copy = HERO_COPY[variant];
  const [before, after] = copy.title.split(copy.emphasis);
  const recordingIntro = presentation === "recording-intro";
  return <Frame stage="hero" className={`hero-screen hero-screen--${variant}`}>
    <Brand />
    <div className="hero-copy-block">{recordingIntro ? <>
      <small className="eyebrow">전체 약 30초</small>
      <h1>베타 오픈 전 수요조사</h1>
      <ol aria-label="진행 순서" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, margin: 0, padding: 0, listStyle: "none", color: "var(--mumeok-muted)", fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
        {["4문항 테스트", "무먹 체험", "베타 알림 신청"].map((step, index) => <li key={step} style={{ whiteSpace: "nowrap" }}>{index > 0 && <span aria-hidden="true">→ </span>}{step}</li>)}
      </ol>
    </> : <><p className="eyebrow">집밥 기록 30초 테스트</p><h1>{before}<span className="hero-title-accent">{copy.emphasis}</span>{after}</h1></>}<p>{renderBodyHighlights(copy.body, copy.bodyHighlights ?? [])}</p></div>
    <HeroLiveVisual variant={variant} />
    <div className="screen-actions hero-actions"><button aria-busy={pending} className="primary-button" disabled={pending} type="button" onClick={onStart}>{recordingIntro ? <>4문항 테스트하기 <ArrowRightIcon /></> : <>내 집밥기록 유형 알아보기 <ArrowRightIcon /></>}</button>{pending ? <p className="funnel-sr-only" role="status">방문 기록을 연결하고 있어요.</p> : null}<p className="trust-line"><span><FileTextIcon aria-hidden="true" />4문항</span><span><LockClosedIcon aria-hidden="true" />로그인 없이</span><span><LightningBoltIcon aria-hidden="true" />결과 바로 확인</span></p></div>
  </Frame>;
}
