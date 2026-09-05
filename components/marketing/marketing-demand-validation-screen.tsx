"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cross2Icon,
  FileTextIcon,
  LightningBoltIcon,
  LockClosedIcon,
  PlayIcon,
  PlusIcon,
  QuoteIcon,
  ReloadIcon,
  Share2Icon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import React, { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { postMarketingValidation } from "@/lib/api/marketing-validation";
import {
  enqueueMarketingQueueAction,
  flushMarketingQueue,
  readMarketingClientSnapshot,
  reconcileMarketingQueueWithServerState,
  writeMarketingClientSnapshot,
  type MarketingValidationQueueAction,
  type MarketingValidationUiStage,
} from "@/lib/marketing/marketing-validation-client-session";
import type {
  MarketingValidationAdVariant,
  MarketingValidationQuizAnswers,
  MarketingValidationQuizResult,
  MarketingValidationRequestBody,
} from "@/types/marketing-validation";

type QuestionId = keyof MarketingValidationQuizAnswers;
type Answers = Partial<MarketingValidationQuizAnswers>;
type TurnstileResult = { ok: true; token: string } | { ok: false; message: string };

interface MarketingDemandValidationScreenProps {
  getTurnstileToken?: () => Promise<TurnstileResult>;
}

type ShareFeedback = { kind: "error" | "success"; message: string } | null;
type QueueRecovery = { message: string; resume: () => void } | null;
type HeroBodyHighlight = { text: string; tone: "a" | "b" | "negative" | "positive" };

const QA_TURNSTILE_TOKEN_KEY = "homecook.marketing-beta.turnstile-token";
const RESULT_KEYS: MarketingValidationQuizResult[] = ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"];
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const QUESTIONS = [
  { id: "q1", prompt: "평소 칼로리나 탄단지를\n얼마나 자주 기록하나요?", choices: [["daily", "거의 매일"], ["3_5", "주 3~5일"], ["1_2", "주 1~2일"], ["none", "거의 안 함 / 안 함"]] },
  { id: "q2", prompt: "일주일에 집밥을\n몇 끼 정도 먹나요?", helper: "직접 만들거나 가족이 만든 음식 모두 포함", choices: [["none", "거의 안 먹음"], ["1_2", "1~2끼"], ["3_5", "3~5끼"], ["6_plus", "6끼 이상"]] },
  { id: "q3", prompt: "집밥은 주로\n어떻게 기록하나요?", choices: [["pass", "집밥은 기록하지 않음"], ["eyeball", "먹은 양을 눈대중으로 기록"], ["track", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록"], ["measure", "재료와 음식 무게까지 재서 기록"]] },
  { id: "q4", prompt: "집밥을 기록할 때\n가장 불편한 것은?", choices: [["ingredients", "재료와 양을 하나씩 입력하는 것"], ["weight", "완성된 음식과 먹은 양을 재는 것"], ["search", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"], ["none", "별로 불편하지 않음"]] },
] as const;

const RESULTS: Record<MarketingValidationQuizResult, { title: string; quote: string; description: string; asset: string; checks?: string[] }> = {
  "homecook-passer": { title: "집밥 패스형", quote: "닭가슴살까지는 기록했는데\n김치찌개에서 앱을 닫는 타입.", description: "재료가 7개를 넘는 순간,\n인간의 영역이 아니라고 판단해요.", asset: "/assets/funnel/characters/homecook-passer.png" },
  "eyeballing-master": { title: "눈대중 장인", quote: "칼로리는 과학이지만\n내 눈도 꽤 정확하다고 믿는 편.", description: "문제는 오늘 제육볶음이\n검색한 제육볶음과 같진 않다는 것.", asset: "/assets/funnel/characters/eyeballing-master.png" },
  "ingredient-tracker": { title: "성분 추적러", quote: "고추장 17g도\n그냥 넘어가지 않는 사람.", description: "오늘도 재료를 하나씩 넣으며 앱과 씨름 중.\n필요한 건 의지보다 자동화일지도.", asset: "/assets/funnel/characters/ingredient-tracker.png" },
  "pro-measurer": { title: "프로 계량러", quote: "완성 음식까지 저울에 올렸다면\n당신은 이미 상위 기록러.", description: "문제는 이걸 매번 계산하느라\n밥보다 기록이 늦게 끝난다는 것.", asset: "/assets/funnel/characters/pro-measurer.png", checks: ["재료 무게", "완성 무게", "먹은 무게"] },
};

const HERO_COPY: Record<MarketingValidationAdVariant, { title: string; emphasis: string; body: string; bodyHighlights?: HeroBodyHighlight[]; image?: string }> = {
  default: { title: "집밥도 정확하게 기록할 수 있을까?", emphasis: "정확하게", body: "30초 테스트로 나의 집밥 기록 타입을 알아보세요." },
  a: { title: "레시피만 가져오면\n영양성분 계산까지!", emphasis: "영양성분", body: "집밥도 편하게\n식단 기록해요.", bodyHighlights: [{ text: "편하게", tone: "a" }] },
  b: { title: "수분 빠진 제육볶음 300g,\n칼로리가 달라져요.", emphasis: "칼로리", body: "집밥도 정확하게\n식단 기록해요.", bodyHighlights: [{ text: "정확하게", tone: "b" }] },
  c: { title: "내 집밥에\n영양성분표를 딱!", emphasis: "영양성분표", body: "제육볶음 검색 대신\n내 레시피로 기록해요.", bodyHighlights: [{ text: "검색", tone: "negative" }, { text: "내 레시피", tone: "positive" }] },
  d: { title: "내가 만든 집밥을\n왜 다른 음식으로 기록하지?", emphasis: "다른 음식", body: "검색해서 고른 남의 음식 대신 내 레시피로 기록해요.", image: "/assets/funnel/hero/hero-d-visual.png" },
};

function resolveEntry() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("result");
  const sharedResult = RESULT_KEYS.includes(result as MarketingValidationQuizResult) ? result as MarketingValidationQuizResult : null;
  const mapping: Record<string, MarketingValidationAdVariant> = { hook_reentry: "a", hook_cooked_weight: "b", hook_calorie_quiz: "c", hook_workaround: "d" };
  const content = params.get("utm_content");
  const candidate = params.get("ad_variant");
  const adVariant = content && mapping[content]
    ? mapping[content]
    : (["a", "b", "c", "d", "default"].includes(candidate ?? "") ? candidate as MarketingValidationAdVariant : "default");
  const attribution = Object.fromEntries(UTM_KEYS.flatMap((key) => params.get(key) ? [[key, params.get(key)]] : []));
  return { adVariant, attribution, sharedResult };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useCountUp(target: number, active: boolean, duration = 520, start = 0, reduced = false) {
  const [value, setValue] = useState(active ? target : start);
  useEffect(() => {
    if (!active) { setValue(start); return; }
    if (reduced || duration <= 0) { setValue(target); return; }
    const startedAt = window.performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setValue(Math.round(start + (target - start) * progress));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, duration, reduced, start, target]);
  return reduced && active ? target : value;
}

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
      {highlight.tone === "positive" ? <><Image className="hero-body-circle-doodle" src="/assets/funnel/annotations/circle-doodle-violet.png" alt="" width={82} height={42} aria-hidden="true" /><StarFilledIcon className="hero-body-doodle hero-body-doodle--star" aria-hidden="true" /></> : null}
    </span>;
  });
}

function formatKoreanDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
}

function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value ?? 1);
  return new Date(value("year"), value("month") - 1, value("day"), 12);
}

function deriveResult(q3: MarketingValidationQuizAnswers["q3"]): MarketingValidationQuizResult {
  return { pass: "homecook-passer", eyeball: "eyeballing-master", track: "ingredient-tracker", measure: "pro-measurer" }[q3] as MarketingValidationQuizResult;
}

function Frame({ children, stage, className = "" }: { children: ReactNode; stage: string; className?: string }) {
  return <main className={`mdv2-screen screen-content ${className}`} data-stage={stage} data-testid={`screen-${stage}`}>{children}</main>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? "is-compact" : ""}`}><Image src="/assets/funnel/brand/mumeok-symbol.png" alt="무먹" width={42} height={42} priority /><span>무엇을 먹든</span></div>;
}

function Back({ onClick, label = "이전 화면" }: { onClick: () => void; label?: string }) {
  return <button className="icon-button back-button" type="button" onClick={onClick} aria-label={label}><ChevronLeftIcon /></button>;
}

function HeroArrow() { return <ArrowRightIcon className="hero-live-arrow" aria-hidden="true" />; }

function HeroLiveVisual({ variant }: { variant: "a" | "b" | "c" }) {
  if (variant === "a") return <div className="hero-live-visual hero-live-visual--a" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-recipe-card" data-testid="hero-ui-card"><header data-testid="hero-card-label">YouTube 레시피</header><div className="hero-live-photo hero-live-photo--youtube"><Image data-testid="hero-food-image" src="/assets/funnel/food/recipe-jeyuk-thumbnail.png" alt="유튜브 제육볶음 레시피 영상" width={480} height={360} priority /><span className="hero-youtube-play" aria-hidden="true"><PlayIcon /></span></div></section>
    <div className="hero-extract-step" aria-label="재료와 양 자동 추출"><span>재료·양</span><strong>자동 추출</strong><ArrowRightIcon aria-hidden="true" /></div>
    <section className="hero-ui-card hero-facts-card hero-facts-card--a" data-testid="hero-ui-card"><header className="hero-facts-header" data-testid="hero-card-label"><strong>영양성분</strong><span>1인분 320g 기준</span></header><div className="hero-facts-calories"><span>열량</span><strong>487 <small>kcal</small></strong></div><div className="hero-facts-rows" data-testid="hero-card-detail"><div><span>탄수화물</span><strong>31g</strong></div><div><span>단백질</span><strong>39g</strong></div><div><span>지방</span><strong>22g</strong></div></div><strong className="hero-facts-payoff">자동 계산 완료 <CheckCircledIcon /></strong></section>
  </div>;
  if (variant === "b") return <div className="hero-live-visual hero-live-visual--b" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-weight-card" data-testid="hero-ui-card" aria-label="완성 무게 1083g 저울"><div className="hero-live-photo hero-live-photo--scale" data-testid="hero-card-detail"><Image data-testid="hero-food-image" src="/assets/funnel/food/jeyuk-on-scale.png" alt="저울 위 제육볶음" width={500} height={500} priority /><output className="hero-live-scale-readout" aria-label="완성 무게 1083g">1,083<small>g</small></output></div></section>
    <HeroArrow />
    <section className="hero-ui-card hero-calc-card" data-testid="hero-ui-card"><div className="hero-calc-story" data-testid="hero-card-detail"><div className="hero-weight-shift" aria-label="조리 전 1420g에서 조리 후 1083g으로 변화"><div><span>조리 전</span><strong>1,420g</strong></div><ArrowRightIcon aria-hidden="true" /><div><span>조리 후</span><strong>1,083g</strong></div></div><p className="hero-water-loss"><strong>총 칼로리는 그대로</strong></p><div className="hero-calorie-result"><span>먹은 300g</span><strong>457 <small>kcal</small></strong></div></div></section>
  </div>;
  return <div className="hero-live-visual hero-live-visual--c" data-testid="hero-live-visual">
    <section className="hero-ui-card hero-own-recipe-card" data-testid="hero-ui-card"><div className="hero-live-photo hero-live-photo--plate"><Image data-testid="hero-food-image" src="/assets/funnel/food/jeyuk-recipe-clean.png" alt="내 레시피로 만든 제육볶음" width={600} height={400} priority /></div><header data-testid="hero-card-label">내 제육볶음 레시피</header></section>
    <HeroArrow />
    <section className="hero-ui-card hero-facts-card hero-facts-card--c" data-testid="hero-ui-card"><header className="hero-facts-header" data-testid="hero-card-label"><strong>영양성분</strong><span>내 집밥 320g</span></header><div className="hero-facts-calories"><span>열량</span><strong>487 <small data-testid="hero-kcal-unit">kcal</small></strong></div><div className="hero-facts-rows" data-testid="hero-card-detail"><div><span>탄수화물</span><strong>31g</strong></div><div><span>단백질</span><strong>39g</strong></div><div><span>지방</span><strong>22g</strong></div></div><strong className="hero-facts-payoff">내 레시피 기준 <CheckCircledIcon /></strong></section>
  </div>;
}

function Hero({ variant, onStart }: { variant: MarketingValidationAdVariant; onStart: () => void }) {
  const copy = HERO_COPY[variant];
  const [before, after] = copy.title.split(copy.emphasis);
  return <Frame stage="hero" className={`hero-screen hero-screen--${variant}`}>
    <Brand />
    <div className="hero-copy-block"><p className="eyebrow">집밥 기록 30초 테스트</p><h1>{before}<span className="hero-title-accent">{copy.emphasis}</span>{after}</h1><p>{renderBodyHighlights(copy.body, copy.bodyHighlights ?? [])}</p></div>
    {variant === "a" || variant === "b" || variant === "c" ? <HeroLiveVisual variant={variant} /> : copy.image ? <div className={`hero-visual hero-reference hero-reference--${variant}`} data-hero-variant={variant}><Image src={copy.image} alt="집밥 기록 테스트 소개" width={1000} height={700} priority /></div> : <div className="hero-visual hero-visual--default"><Image src="/assets/funnel/food/recipe-jeyuk-thumbnail.png" alt="팬에서 조리 중인 제육볶음" width={480} height={360} priority /><div><Brand compact /><span>집밥도 빠르게, 내 레시피대로</span></div></div>}
    <div className="screen-actions hero-actions"><button className="primary-button" type="button" onClick={onStart}>내 집밥기록 유형 알아보기 <ArrowRightIcon /></button><p className="trust-line"><span><FileTextIcon aria-hidden="true" />4문항</span><span><LockClosedIcon aria-hidden="true" />로그인 없이</span><span><LightningBoltIcon aria-hidden="true" />결과 바로 확인</span></p></div>
  </Frame>;
}

function UnifiedProgressHeader({ current, total, onBack, backLabel = "이전 화면", ariaLabel }: { current: number; total: number; onBack: () => void; backLabel?: string; ariaLabel: string }) {
  return <div className="unified-progress-header"><Back onClick={onBack} label={backLabel} /><div className="unified-progress-segments" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label={ariaLabel}>{Array.from({ length: total }, (_, index) => index + 1).map((item) => <span className={item < current ? "is-complete" : item === current ? "is-current" : ""} key={item} />)}</div><span className="unified-progress-count"><strong>{current}</strong> / {total}</span></div>;
}

function Quiz({ index, answers, onBack, onSelect, locked }: { index: number; answers: Answers; onBack: () => void; onSelect: (id: QuestionId, value: string) => void; locked: boolean }) {
  const question = QUESTIONS[index];
  return <Frame stage={`question-${index + 1}`} className="quiz-screen"><UnifiedProgressHeader current={index + 1} total={4} onBack={onBack} backLabel={index ? "이전 질문" : "이전 화면"} ariaLabel={`${index + 1} / 4 진행`} /><div className={`question-copy ${"helper" in question ? "has-helper" : "no-helper"}`}><h2>{question.prompt.split("\n").map((line, lineIndex) => <span key={line}>{lineIndex ? <br /> : null}{line}</span>)}</h2>{"helper" in question ? <p>{question.helper}</p> : null}</div><div className="choice-list" aria-label={question.prompt}>{question.choices.map(([value, label]) => { const active = answers[question.id] === value; return <button className={`choice-button ${active ? "is-selected" : ""}`} key={value} type="button" aria-pressed={active} disabled={locked} onClick={() => onSelect(question.id, value)}><span>{label}</span><span className="choice-indicator" aria-hidden="true">{active ? <CheckIcon /> : null}</span></button>; })}</div></Frame>;
}

function Result({ type, onBack, onNext, preview, onPreviewStart, onShare, shareFeedback }: { type: MarketingValidationQuizResult; onBack: () => void; onNext: () => void; preview: boolean; onPreviewStart: () => void; onShare: () => void; shareFeedback: ShareFeedback }) {
  const result = RESULTS[type];
  const [lead, ...accent] = result.title.split(" ");
  return <Frame stage="result" className="result-screen"><Back onClick={onBack} label={preview ? "처음 화면" : "마지막 질문으로 돌아가기"} />{preview ? <p className="result-kicker">공유된 결과 · 읽기 전용</p> : <p className="result-kicker">당신의 집밥 기록 타입은…</p>}<h1><span>{lead}</span>{accent.length ? <> <em>{accent.join(" ")}</em></> : null}</h1><div className="result-character-stage"><div className="result-celebration" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <StarFilledIcon key={index} />)}</div><Image className="result-character" src={result.asset} alt={`${result.title} 캐릭터`} width={300} height={250} priority /></div><QuoteIcon className="result-quote-icon" aria-hidden="true" /><blockquote>{result.quote.split("\n").map((line) => <span key={line}>{line}</span>)}</blockquote>{result.checks ? <div className="result-checks">{result.checks.map((item) => <span key={item}><CheckCircledIcon />{item}</span>)}</div> : null}<p className="result-description">{result.description.split("\n").map((line) => <span key={line}>{line}</span>)}</p>{preview ? <button className="primary-button" type="button" onClick={onPreviewStart}>나도 테스트하기 <ArrowRightIcon /></button> : <><div className="conversion-block"><p>그런데 집밥 기록이</p><h2>20초 만에 끝난다면?</h2><span>직접 한 번 기록해보세요.</span></div><button className="primary-button" type="button" onClick={onNext}>무먹으로 <span className="primary-button-number">20초</span> 체험하기 <ArrowRightIcon /></button></>}<button className="share-button" type="button" onClick={onShare}><Share2Icon /> 내 결과 공유하기</button>{shareFeedback ? <div className={shareFeedback.kind === "error" ? "mdv2-error" : "share-status"} role={shareFeedback.kind === "error" ? "alert" : "status"} aria-live="polite"><p>{shareFeedback.message}</p>{shareFeedback.kind === "error" ? <button type="button" onClick={onShare}>다시 시도</button> : null}</div> : null}</Frame>;
}

function DemoHeader({ step, label, onBack }: { step: number; label: string; onBack: () => void }) { return <UnifiedProgressHeader current={step} total={5} onBack={onBack} ariaLabel={`체험 ${step} / 5 · ${label}`} />; }

const INGREDIENTS = [{ name: "돼지고기 목살", amount: "600g", emoji: "🥩" }, { name: "신김치", amount: "200g", emoji: "🥬" }, { name: "양파", amount: "100g", emoji: "🧅" }, { name: "고추장", amount: "100g", emoji: "🥣" }, { name: "고춧가루", amount: "21g", emoji: "🌶️" }];

function Experience({ step, onBack, onNext, reduced }: { step: number; onBack: () => void; onNext: () => void; reduced: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [adjusted, setAdjusted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const displayedPorkWeight = useCountUp(520, adjusted, 720, 600, reduced);
  const displayedWeight = useCountUp(1180, confirmed, 720, 1200, reduced);
  const calories = useCountUp(487, step === 5, 520, 0, reduced);
  const carbs = useCountUp(31, step === 5, 520, 0, reduced);
  const protein = useCountUp(39, step === 5, 520, 0, reduced);
  const fat = useCountUp(22, step === 5, 520, 0, reduced);
  if (step === 1) return <Frame stage="experience-1" className="demo-screen"><DemoHeader step={1} label="레시피 가져오기" onBack={onBack} /><div className="demo-title"><h1 className={`recipe-import-title ${status === "done" ? "is-complete" : ""}`} data-state={status === "done" ? "complete" : status} aria-label={status === "done" ? "레시피를 가져왔어요" : "유튜브 레시피를 가져올게요."}>{status === "done" ? <span className="recipe-title-success"><CheckCircledIcon data-testid="recipe-title-check" aria-hidden="true" /><span className="recipe-title-copy" data-testid="recipe-title-copy"><strong data-testid="recipe-title-keyword">레시피</strong>를 가져왔어요</span><span className="recipe-title-sparkle" data-testid="recipe-title-sparkle" aria-hidden="true">✨</span></span> : <>유튜브 레시피를 <span>가져올게요.</span></>}</h1></div><div className={`recipe-card ${status !== "idle" ? "is-importing" : ""}`}><div className="recipe-media"><Image className="recipe-thumbnail" src="/assets/funnel/food/recipe-jeyuk-thumbnail.png" alt="유튜브 제육볶음 레시피 썸네일" width={480} height={360} priority /><span className="youtube-play" aria-hidden="true"><PlayIcon /></span>{status === "loading" ? <div className="recipe-loading" role="status"><ReloadIcon /><span>레시피를 가져오는 중…</span></div> : null}</div><h2 className="recipe-name">대표요리가 되는 제육볶음</h2><div className="recipe-channel"><Image className="recipe-channel-avatar" src="/assets/funnel/food/lee-man-cook-channel-avatar.jpg" alt="이 남자의 cook 채널 프로필" width={36} height={36} /><div><strong>이 남자의 cook</strong><span>YouTube · 조회수 904만회</span></div></div></div><button className="primary-button screen-bottom-button" type="button" disabled={status === "loading"} onClick={() => { if (status === "done") { onNext(); return; } if (status !== "idle") return; setStatus("loading"); window.setTimeout(() => setStatus("done"), reduced ? 0 : 520); }}>{status === "loading" ? "가져오는 중…" : status === "done" ? <>다음 <ArrowRightIcon /></> : "무먹으로 가져오기"}</button></Frame>;
  if (step === 2) return <Frame stage="experience-2" className="demo-screen demo-two-screen"><DemoHeader step={2} label="재료 확인" onBack={onBack} /><div className="demo-title"><h1>영상 속 레시피를<br /><span>자동으로 정리</span>했어요.</h1></div><div className="ingredient-list">{INGREDIENTS.map(({ name, amount, emoji }, index) => <div key={name}><span className="ingredient-emoji" aria-hidden="true">{emoji}</span><span>{name}</span><strong data-testid={index === 0 ? "pork-amount" : undefined} className={index === 0 && adjusted ? "amount-updated" : ""}>{index === 0 ? `${displayedPorkWeight}g` : amount}</strong></div>)}<div className="ingredient-more"><span className="ingredient-more-dots" aria-hidden="true">•••</span><span>외 10개 재료</span><strong>생략</strong></div></div><div className="adjustment-card is-visible" role={adjusted ? "status" : undefined}><CheckCircledIcon /><span>{adjusted ? "돼지고기 양을 520g으로 수정했어요" : "오늘은 돼지고기를 조금 덜 넣었어요."}</span></div>{adjusted ? <button className="primary-button screen-bottom-button" type="button" onClick={onNext}>다음 <ArrowRightIcon /></button> : <button className="primary-button change-weight-button screen-bottom-button" type="button" aria-label="돼지고기 600g → 520g" disabled={transitioning} onClick={() => { if (adjusted || transitioning) return; setTransitioning(true); window.setTimeout(() => { setAdjusted(true); setTransitioning(false); }, reduced ? 0 : 420); }}>돼지고기 <span className="primary-button-number">600g</span> <span className="primary-button-symbol" aria-hidden="true">→</span> <span className="primary-button-number">520g</span></button>}</Frame>;
  if (step === 3) return <Frame stage="experience-3" className="demo-screen demo-weight-screen"><DemoHeader step={3} label="완성 무게" onBack={onBack} /><div className="demo-title"><h1>요리가 완성됐어요.</h1></div><strong className={`hero-metric ${confirmed ? "is-confirmed" : ""}`} data-testid="cooked-weight-metric">{displayedWeight.toLocaleString("ko-KR")}g</strong><p className={`metric-helper ${confirmed ? "is-confirmed" : ""}`} data-testid="weight-helper" aria-live="polite">{confirmed ? <>증발한 수분 무게를 뺀<br /><strong>정확한 무게</strong>를 <strong>입력</strong>했어요</> : <>조리하면서 줄어드는 무게를<br />고려한 예상값이에요.</>}</p><div className="cooked-scale-visual"><Image className="cooked-scale-image" src="/assets/funnel/food/jeyuk-on-scale.png" alt="완성된 제육볶음이 올라간 디지털 주방저울" width={500} height={500} priority /><output className="cooked-scale-display" aria-label="완성 무게 1180g">1,180g</output></div><button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={confirmed ? onNext : () => setConfirmed(true)}>{confirmed ? <>다음 <ArrowRightIcon /></> : <>저울로 재보니 <span className="primary-button-number">1,180g</span></>}</button></Frame>;
  if (step === 4) return <Frame stage="experience-4" className="demo-screen portion-screen"><DemoHeader step={4} label="먹은 양" onBack={onBack} /><div className="demo-title"><h1>1,180g 중 얼마나 드셨나요?</h1></div><div className="portion-visual"><Image className="portion-image" src="/assets/funnel/food/jeyuk-on-scale.png" alt="흰 접시의 제육볶음이 올라간 디지털 주방저울" width={500} height={500} priority /><output className="scale-display" aria-label="저울 표시 320g">320g</output></div><button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={onNext}><span className="primary-button-number">320g</span> 입력하기</button></Frame>;
  return <Frame stage="experience-5" className="demo-screen nutrition-screen"><DemoHeader step={5} label="영양 계산 완료" onBack={onBack} /><div className="demo-title demo-title--nutrition"><div className="nutrition-confetti" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <StarFilledIcon key={index} />)}</div><h1>계산 완료!</h1><div className="nutrition-serving-line" data-testid="nutrition-serving-line"><p>제육볶음 320g</p><strong className="nutrition-calories"><span>{calories}</span> <small>kcal</small></strong></div></div><div className="macro-grid">{[["탄수화물", `${carbs}g`, "/assets/funnel/food/macro-carb-wheat.png", "황금빛 밀 이삭"], ["단백질", `${protein}g`, "/assets/funnel/food/macro-protein-arm.png", "힘을 준 팔"], ["지방", `${fat}g`, "/assets/funnel/food/macro-fat-drop.png", "황금빛 기름 방울"]].map(([label, value, image, alt]) => <div key={label}><span>{label}</span><Image className="macro-image" src={image} alt={alt} width={74} height={74} /><strong>{value}</strong></div>)}</div><button className="primary-button screen-bottom-button" type="button" onClick={onNext}>식단에 기록하기 <ArrowRightIcon /></button></Frame>;
}

function weekDays() { const today = getKoreanToday(); const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() || 7) + 1); return Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; }); }

function WeekStrip() { const today = getKoreanToday(); return <div className="week-strip" aria-label="이번 주 날짜">{weekDays().map((date) => <span className={date.toDateString() === today.toDateString() ? "is-today" : ""} key={date.toISOString()}><small>{["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}</small><strong>{date.getDate()}</strong></span>)}</div>; }

function PlannerSummary({ calories, carbs, protein, fat, highlight, testId = "planner-summary" }: { calories: number; carbs: number; protein: number; fat: number; highlight?: "meal" | "product"; testId?: string }) { return <div className={`planner-summary ${highlight ? "is-updating" : ""}`} data-testid={testId} data-highlight={highlight}>{[["칼로리", calories, "kcal"], ["탄수화물", carbs, "g"], ["단백질", protein, "g"], ["지방", fat, "g"]].map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString("ko-KR")}<small className="planner-summary-unit"> {unit}</small></strong></div>)}</div>; }

type PlannerFood = { name: string; detail: string; image: string; product?: boolean };
const BREAKFAST: PlannerFood = { name: "그릭요거트 볼", detail: "420 kcal · 단백질 22g", image: "/assets/funnel/food/greek-yogurt-bowl.png" };
const LUNCH: PlannerFood = { name: "닭가슴살 현미밥", detail: "700 kcal · 단백질 50g", image: "/assets/funnel/food/chicken-brown-rice-bowl.png" };
const HOMECOOK: PlannerFood = { name: "제육볶음 320g", detail: "487 kcal · 단백질 39g", image: "/assets/funnel/food/recipe-jeyuk-thumbnail.png" };
const DRINK: PlannerFood = { name: "더:단백 드링크 초코", detail: "105 kcal · 단백질 20g", image: "/assets/funnel/products/the-protein-choco.png", product: true };

function PlannerMealRow({ label, foods, animateLast, highlight, ariaPrefix }: { label: string; foods: PlannerFood[]; animateLast?: boolean; highlight?: "meal" | "product"; ariaPrefix?: string }) { return <div className={`meal-row ${foods.length > 1 ? "has-multiple-foods" : ""} ${highlight ? `is-highlighted is-highlighted--${highlight}` : ""}`}><span className="meal-row-label">{label}</span><div className="meal-foods">{foods.map((food, index) => <div className={`meal-food ${animateLast && index === foods.length - 1 ? "is-entering" : ""}`} key={food.name}><Image className={food.product ? "product-thumb" : ""} src={food.image} alt="" width={46} height={46} /><div><strong>{food.name}</strong><span>{food.detail}</span></div></div>)}</div><button className="meal-add-button" type="button" disabled={Boolean(ariaPrefix)} aria-label={`${ariaPrefix ? `${ariaPrefix} ` : "오늘 "}${label} 음식 추가`}>+</button></div>; }

function TomorrowPreview() { const tomorrow = getKoreanToday(); tomorrow.setDate(tomorrow.getDate() + 1); return <section className="next-day-preview" data-testid="tomorrow-preview"><header><strong>내일 · {formatKoreanDate(tomorrow)}</strong><span>0 / 3</span></header><PlannerSummary calories={0} carbs={0} protein={0} fat={0} testId="tomorrow-summary" />{["아침", "점심", "저녁"].map((label) => <PlannerMealRow label={label} foods={[]} ariaPrefix="내일" key={label} />)}</section>; }

function Planner({ complete, onBack, onNext, reduced }: { complete: boolean; onBack: () => void; onNext: () => void; reduced: boolean }) {
  const [entered, setEntered] = useState(false); const [metricsReady, setMetricsReady] = useState(false);
  useEffect(() => { const entry = window.setTimeout(() => setEntered(true), reduced ? 0 : 200); const metrics = window.setTimeout(() => setMetricsReady(true), reduced ? 0 : complete ? 1250 : 1400); return () => { window.clearTimeout(entry); window.clearTimeout(metrics); }; }, [complete, reduced]);
  const calories = useCountUp(complete ? 1712 : 1607, metricsReady, complete ? 1150 : 1250, complete ? 1607 : 1120, reduced); const carbs = useCountUp(complete ? 184 : 177, metricsReady, 1250, complete ? 177 : 146, reduced); const protein = useCountUp(complete ? 131 : 111, metricsReady, 1250, complete ? 111 : 72, reduced); const fat = useCountUp(complete ? 61 : 60, metricsReady, 1250, complete ? 60 : 38, reduced);
  const today = getKoreanToday();
  return <Frame stage={complete ? "planner-complete" : "planner-homecook"} className="planner-screen"><div className="planner-topline"><Back onClick={onBack} /><div className="planner-heading"><CalendarIcon /><h1>이번 주 식단</h1></div></div><WeekStrip /><section className="meal-day-card"><header><strong>오늘 · {formatKoreanDate(today)}</strong><span>{complete || entered ? "3 / 3" : "2 / 3"}</span></header><PlannerSummary calories={calories} carbs={carbs} protein={protein} fat={fat} highlight={metricsReady ? complete ? "product" : "meal" : undefined} /><PlannerMealRow label="아침" foods={[BREAKFAST]} /><PlannerMealRow label="점심" foods={[LUNCH]} /><PlannerMealRow label="저녁" foods={complete ? entered ? [HOMECOOK, DRINK] : [HOMECOOK] : entered ? [HOMECOOK] : []} animateLast={entered} highlight={entered ? complete ? "product" : "meal" : undefined} /></section><TomorrowPreview /><button className="primary-button planner-floating-cta strong-action-button" type="button" onClick={onNext}>{complete ? "무료 베타 먼저 써보기" : "편의점 음식도 기록해보기"} <ArrowRightIcon /></button></Frame>;
}

function Packaged({ onBack, onNext }: { onBack: () => void; onNext: () => void }) { return <Frame stage="packaged-food" className="packaged-screen"><Back onClick={onBack} /><div className="demo-title"><h1>그리고<br /><span>편의점 음식</span>은<br />더 간단해요.</h1></div><div className="product-card"><span className="example-badge">제품 예시</span><span className="product-sparkle product-sparkle--left" aria-hidden="true">✨</span><span className="product-sparkle product-sparkle--right" aria-hidden="true">✨</span><Image src="/assets/funnel/products/the-protein-choco.png" alt="더:단백 드링크 초코 제품" width={190} height={270} priority /><div><h2>더:단백 드링크 초코</h2><p>250ml</p><div className="product-stat"><span aria-hidden="true">🔥</span><strong>105 kcal</strong></div><div className="product-stat"><span aria-hidden="true">💪</span><strong>단백질 20g</strong></div></div></div><p className="funnel-sr-only">특정 브랜드와 제휴하거나 추천하는 화면이 아닙니다.</p><button className="primary-button screen-bottom-button strong-action-button" type="button" aria-label="+ 기록하기" onClick={onNext}><PlusIcon /> 기록하기</button></Frame>; }

function BetaForm({ onBack, onSubmit, getTurnstileToken }: { onBack: () => void; onSubmit: (email: string, token: string) => Promise<string | null>; getTurnstileToken: () => Promise<TurnstileResult> }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim()) { setError("이메일을 입력해 주세요."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("이메일 형식을 확인해 주세요."); return; }
    if (!consent) { setError("이메일 수집·이용 동의가 필요해요."); return; }
    setSubmitting(true);
    const turnstile = await getTurnstileToken();
    if (!turnstile.ok) { setError(turnstile.message); setSubmitting(false); return; }
    const message = await onSubmit(email, turnstile.token);
    if (message) { setError(message); setSubmitting(false); }
  };
  return <Frame stage="beta-form" className="beta-screen"><div className="beta-topbar"><Back onClick={onBack} /><Image className="beta-brand-wordmark" src="/assets/funnel/brand/mumeok-logo-horizontal.png" alt="무먹 무엇을 먹든" width={210} height={80} /></div><div className="beta-invitation"><Image className="beta-character" src="/assets/funnel/characters/beta-invitation-mascot.png" alt="파란 초대장을 든 무먹 소금병 캐릭터" width={210} height={210} priority /><div className="beta-copy"><h1><span>무먹,</span><br />직접 써보고 싶나요?</h1><p>첫 베타테스트를 준비하고 있어요. 이메일을 남겨주시면 가장 먼저 초대드릴게요</p></div></div><form className="email-form" onSubmit={submit} noValidate><label htmlFor="beta-email">이메일</label><div className="email-input-wrap"><input id="beta-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={error ? "true" : "false"} aria-describedby={error ? "beta-error" : "privacy-details"} placeholder="name@example.com" /></div><div className="consent-block"><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>[필수]</strong> 이메일 수집·이용에 동의합니다.</span></label><details className="privacy-disclosure"><summary><ChevronRightIcon aria-hidden="true" />수집 목적과 보유 기간 보기</summary><p className="privacy-details" id="privacy-details">수집: 이메일 · 목적: 베타 초대 · 보유: 베타 초대 종료 시까지 · <Link href="/privacy">개인정보처리방침</Link></p></details></div>{error ? <div className="mdv2-error" id="beta-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>다시 시도</button></div> : null}{submitting ? <p className="mdv2-submit-status" role="status" aria-live="polite">신청 내용을 확인하고 있어요.</p> : null}<button className="primary-button" type="submit" disabled={submitting}>{submitting ? "신청 중…" : "무료 베타 초대받기"}</button></form></Frame>;
}

function Done({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  return <Frame stage="done" className="success-screen"><Back onClick={onBack} /><div className="success-character-wrap"><div className="success-celebration" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <StarFilledIcon key={index} />)}</div><Image className="success-character" src="/assets/funnel/characters/beta-success-mascot.png" alt="파란 하트와 함께 반기는 무먹 소금병 캐릭터" width={310} height={280} priority /></div><h1>신청이 완료됐어요!</h1><p>베타가 준비되면<br />이메일로 알려드릴게요.</p><button className="primary-button screen-bottom-button" type="button" onClick={onReset}>처음으로 돌아가기</button></Frame>;
}

export function MarketingDemandValidationScreen({ getTurnstileToken }: MarketingDemandValidationScreenProps) {
  const [entry, setEntry] = useState<{ adVariant: MarketingValidationAdVariant; attribution: Record<string, string | null>; sharedResult: MarketingValidationQuizResult | null }>({ adVariant: "default", attribution: {}, sharedResult: null });
  const [entryReady, setEntryReady] = useState(false);
  const [stage, setStage] = useState<MarketingValidationUiStage>("hero");
  const [history, setHistory] = useState<MarketingValidationUiStage[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<MarketingValidationQuizResult>("eyeballing-master");
  const [loading, setLoading] = useState(true);
  const [shellError, setShellError] = useState("");
  const [queueRecovery, setQueueRecovery] = useState<QueueRecovery>(null);
  const [recovering, setRecovering] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>(null);
  const transitionLocked = useRef(false);
  const queueErrorRef = useRef("");
  const reduced = useReducedMotion();
  const preview = Boolean(entry.sharedResult && history.length === 0);

  const sendQueued = useCallback(async (action: MarketingValidationQueueAction) => {
    const response = await postMarketingValidation({ ...action, honeypot: "" } as MarketingValidationRequestBody);
    if (response.success) {
      queueErrorRef.current = "";
      return { ok: true as const, state: response.data?.state };
    }
    queueErrorRef.current = response.error?.message ?? "진행 내용을 저장하지 못했어요. 다시 시도해 주세요.";
    return { ok: false as const, retryable: true };
  }, []);

  const record = useCallback(async (action: MarketingValidationQueueAction) => {
    queueErrorRef.current = "";
    enqueueMarketingQueueAction(action);
    const flushed = await flushMarketingQueue(sendQueued);
    if (flushed.stopped !== "completed") return false;
    return true;
  }, [sendQueued]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setShellError("");
    const response = await postMarketingValidation({ action: "view", honeypot: "", ad_variant: entry.adVariant, ...entry.attribution });
    if (!response.success || !response.data) {
      setShellError(response.error?.message ?? "진행 정보를 불러오지 못했어요.");
      setLoading(false);
      return;
    }
    reconcileMarketingQueueWithServerState(response.data.state);
    const snapshot = readMarketingClientSnapshot();
    if (snapshot?.quizResult) setResult(snapshot.quizResult);
    setLoading(false);
  }, [entry]);

  useEffect(() => {
    const resolved = resolveEntry();
    setEntry(resolved);
    if (resolved.sharedResult) {
      setResult(resolved.sharedResult);
      setStage("result");
      setLoading(false);
    }
    setEntryReady(true);
  }, []);
  useEffect(() => { if (entryReady && !entry.sharedResult) void initialize(); }, [entry.sharedResult, entryReady, initialize]);
  useEffect(() => { if (entryReady && !entry.sharedResult) writeMarketingClientSnapshot({ stage, quizAnswers: Object.keys(answers).length === 4 ? answers as MarketingValidationQuizAnswers : undefined, quizResult: stage === "hero" || stage === "quiz" ? undefined : result }); }, [answers, entry.sharedResult, entryReady, result, stage]);

  const push = (next: MarketingValidationUiStage) => {
    setHistory((current) => [...current, stage]);
    setStage(next);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  const showQueueRecovery = (message: string, resume: () => void) => {
    setQueueRecovery({ message: queueErrorRef.current || message, resume });
  };
  const retryQueue = async () => {
    if (!queueRecovery || recovering) return;
    setRecovering(true);
    queueErrorRef.current = "";
    const flushed = await flushMarketingQueue(sendQueued);
    if (flushed.stopped === "completed") {
      const resume = queueRecovery.resume;
      setQueueRecovery(null);
      resume();
    } else {
      setQueueRecovery((current) => current ? { ...current, message: queueErrorRef.current || current.message } : current);
    }
    setRecovering(false);
  };
  const back = () => { const previous = history.at(-1); if (!previous) { setStage("hero"); return; } setHistory((current) => current.slice(0, -1)); setStage(previous); if (previous === "quiz") setQuestionIndex((current) => Math.max(0, current - 1)); };
  const start = async () => { if (await record({ action: "quiz_started" })) { setQuestionIndex(0); push("quiz"); } else setShellError("연결을 확인한 뒤 새로 시작해 주세요."); };
  const select = (id: QuestionId, value: string) => {
    if (transitionLocked.current) return;
    transitionLocked.current = true;
    const next = { ...answers, [id]: value } as Answers;
    setAnswers(next);
    window.setTimeout(async () => {
      if (questionIndex < 3) setQuestionIndex((current) => current + 1);
      else {
        const exact = next as MarketingValidationQuizAnswers;
        const response = await postMarketingValidation({ action: "quiz_completed", answers: exact, honeypot: "" });
        if (!response.success || !response.data?.quiz_result) { setShellError(response.error?.message ?? "답변을 저장하지 못했어요."); transitionLocked.current = false; return; }
        const derived = deriveResult(exact.q3);
        setResult(response.data.quiz_result === derived ? response.data.quiz_result : derived);
        const showResult = () => push("result");
        if (await record({ action: "result_viewed" })) showResult();
        else showQueueRecovery("결과 화면을 열지 못했어요. 다시 시도해 주세요.", showResult);
      }
      transitionLocked.current = false;
    }, reduced ? 0 : 300);
  };
  const share = async () => {
    setShareFeedback(null);
    const url = new URL("/beta", window.location.origin);
    url.searchParams.set("result", result);
    const hashtags = ["#무먹", "#집밥기록", "#제육볶음"];
    const data = { title: `무먹 집밥 기록 타입: ${RESULTS[result].title}`, text: `${RESULTS[result].quote.replace("\n", " ")}\n\n${hashtags.join(" ")}`, url: url.toString() };
    try {
      if (navigator.share) {
        await navigator.share(data);
        setShareFeedback({ kind: "success", message: "공유 화면을 열었어요." });
      } else {
        await navigator.clipboard.writeText(`${data.title}\n${data.text}\n${data.url}`);
        setShareFeedback({ kind: "success", message: "링크를 복사해 뒀어요." });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareFeedback({ kind: "error", message: "공유 링크를 준비하지 못했어요. 다시 시도해 주세요." });
    }
  };
  const defaultTurnstile = async (): Promise<TurnstileResult> => {
    const token = window.sessionStorage.getItem(QA_TURNSTILE_TOKEN_KEY);
    return token ? { ok: true, token } : { ok: false, message: "보안 확인을 완료한 뒤 다시 시도해 주세요." };
  };
  const submitLead = async (email: string, token: string) => {
    const response = await postMarketingValidation({ action: "lead_submitted", email, consent: true, turnstile_token: token, honeypot: "" });
    if (!response.success) return response.error?.message ?? "신청을 처리하지 못했어요.";
    push("done");
    return null;
  };
  const reset = () => { window.history.replaceState({}, "", "/beta"); setAnswers({}); setHistory([]); setQuestionIndex(0); setResult("eyeballing-master"); setStage("hero"); void initialize(); };

  if (loading) return <div className="mdv2-root"><main className="mdv2-screen screen-content mdv2-loading" role="status" aria-label="테스트 불러오는 중"><Brand /><div /><div /><div /></main></div>;
  if (shellError) return <div className="mdv2-root"><Frame stage="empty" className="mdv2-state-screen"><Brand /><h1>새 테스트로 다시 시작할게요.</h1><p role="alert">{shellError}</p><button className="primary-button" type="button" onClick={reset}>새로 시작하기</button></Frame></div>;
  if (queueRecovery) return <div className="mdv2-root"><Frame stage="recovery" className="mdv2-state-screen"><Brand /><h1>잠시 연결이 끊겼어요.</h1><div className="mdv2-error" role="alert"><p>{queueRecovery.message}</p></div><button className="primary-button" type="button" disabled={recovering} onClick={() => void retryQueue()}>{recovering ? "다시 연결하는 중…" : "다시 시도"}</button></Frame></div>;

  let content: ReactNode;
  if (stage === "hero") content = <Hero variant={entry.adVariant} onStart={() => void start()} />;
  else if (stage === "quiz") content = <Quiz index={questionIndex} answers={answers} locked={transitionLocked.current} onBack={() => questionIndex ? setQuestionIndex((current) => current - 1) : back()} onSelect={select} />;
  else if (stage === "result") content = <Result type={result} preview={preview} onBack={back} onNext={async () => { const showExperience = () => push("experience-1"); if (await record({ action: "experience_started" })) showExperience(); else showQueueRecovery("체험 화면을 열지 못했어요. 다시 시도해 주세요.", showExperience); }} onPreviewStart={reset} onShare={() => void share()} shareFeedback={shareFeedback} />;
  else if (stage.startsWith("experience-")) { const step = Number(stage.at(-1)); content = <Experience step={step} reduced={reduced} onBack={back} onNext={async () => { if (step < 5) push(`experience-${step + 1}` as MarketingValidationUiStage); else { const showPlanner = () => push("planner-homecook"); if (await record({ action: "experience_completed" })) showPlanner(); else showQueueRecovery("식단 화면을 열지 못했어요. 다시 시도해 주세요.", showPlanner); } }} />; }
  else if (stage === "planner-homecook") content = <Planner complete={false} reduced={reduced} onBack={back} onNext={() => push("packaged-food")} />;
  else if (stage === "packaged-food") content = <Packaged onBack={back} onNext={() => push("planner-complete")} />;
  else if (stage === "planner-complete") content = <Planner complete reduced={reduced} onBack={back} onNext={async () => { const showBetaForm = () => push("beta-form"); if (await record({ action: "beta_form_viewed" })) showBetaForm(); else showQueueRecovery("신청 화면을 열지 못했어요. 다시 시도해 주세요.", showBetaForm); }} />;
  else if (stage === "beta-form") content = <BetaForm onBack={back} onSubmit={submitLead} getTurnstileToken={getTurnstileToken ?? defaultTurnstile} />;
  else content = <Done onBack={back} onReset={reset} />;

  return <div className="mdv2-root"><div className="mdv2-shell">{content}</div><p className="mdv2-live" aria-live="polite">{stage === "done" ? "신청이 완료됐어요." : ""}</p></div>;
}
