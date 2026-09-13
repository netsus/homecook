"use client";

import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  PlayIcon,
  PlusIcon,
  QuoteIcon,
  ReloadIcon,
  Share2Icon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import React, { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  MarketingTurnstile,
  type MarketingTurnstileController,
} from "@/components/marketing/marketing-turnstile";
import { MARKETING_VALIDATION_RETENTION_DAYS } from "@/lib/marketing/demand-validation";
import { Round2Turnstile } from "./round2/round2-turnstile";
import type { MarketingValidationQuizResult } from "@/types/marketing-validation";
import { Frame } from "./marketing-demand-validation-hero";
import { Back, UnifiedProgressHeader } from "./marketing-demand-validation-quiz";

export type TurnstileResult = { ok: true; token: string } | { ok: false; message: string };
export type ShareFeedback = { kind: "error" | "success"; message: string } | null;

export const RESULTS: Record<MarketingValidationQuizResult, { title: string; quote: string; description: string; asset: string; checks?: string[] }> = {
  "homecook-passer": { title: "집밥 패스형", quote: "닭가슴살까지는 기록했는데\n김치찌개에서 앱을 닫는 타입.", description: "재료가 7개를 넘는 순간,\n인간의 영역이 아니라고 판단해요.", asset: "/assets/funnel/characters/homecook-passer.webp" },
  "eyeballing-master": { title: "눈대중 장인", quote: "칼로리는 과학이지만\n내 눈도 꽤 정확하다고 믿는 편.", description: "문제는 오늘 제육볶음이\n검색한 제육볶음과 같진 않다는 것.", asset: "/assets/funnel/characters/eyeballing-master.webp" },
  "ingredient-tracker": { title: "성분 추적러", quote: "고추장 17g도\n그냥 넘어가지 않는 사람.", description: "오늘도 재료를 하나씩 넣으며 앱과 씨름 중.\n필요한 건 의지보다 자동화일지도.", asset: "/assets/funnel/characters/ingredient-tracker.webp" },
  "pro-measurer": { title: "프로 계량러", quote: "완성 음식까지 저울에 올렸다면\n당신은 이미 상위 기록러.", description: "문제는 이걸 매번 계산하느라\n밥보다 기록이 늦게 끝난다는 것.", asset: "/assets/funnel/characters/pro-measurer.webp", checks: ["재료 무게", "완성 무게", "먹은 무게"] },
};

const JOURNEY_PRELOAD_ASSETS = [
  "/assets/funnel/food/recipe-jeyuk-thumbnail.webp",
  "/assets/funnel/food/jeyuk-on-scale.webp",
  "/assets/funnel/food/greek-yogurt-bowl.webp",
  "/assets/funnel/food/chicken-brown-rice-bowl.webp",
  "/assets/funnel/food/macro-carb-wheat.webp",
  "/assets/funnel/food/macro-protein-arm.webp",
  "/assets/funnel/food/macro-fat-drop.webp",
  "/assets/funnel/products/the-protein-choco.webp",
  "/assets/funnel/characters/beta-invitation-mascot.webp",
  "/assets/funnel/characters/beta-success-mascot.webp",
  "/assets/funnel/brand/mumeok-logo-horizontal.webp",
] as const;

export function preloadJourneyAssets() {
  for (const asset of JOURNEY_PRELOAD_ASSETS) {
    preload(asset, { as: "image", fetchPriority: "low" });
  }
}

export function useReducedMotion() {
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


function formatKoreanDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
}

function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value ?? 1);
  return new Date(value("year"), value("month") - 1, value("day"), 12);
}

export function Result({ type, onBack, onNext, preview, onPreviewStart, onShare, shareFeedback, preparedExample = false }: { preparedExample?: boolean; type: MarketingValidationQuizResult; onBack: () => void; onNext: () => void; preview: boolean; onPreviewStart: () => void; onShare: () => void; shareFeedback: ShareFeedback }) {
  const result = RESULTS[type];
  const [lead, ...accent] = result.title.split(" ");
  return <Frame stage="result" className="result-screen"><Back onClick={onBack} label={preview ? "처음 화면" : "마지막 질문으로 돌아가기"} />{preview ? <p className="result-kicker">공유된 결과 · 읽기 전용</p> : <p className="result-kicker">당신의 집밥 기록 타입은…</p>}<h1><span>{lead}</span>{accent.length ? <> <em>{accent.join(" ")}</em></> : null}</h1><div className="result-character-stage"><div className="result-celebration" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <StarFilledIcon key={index} />)}</div><Image className="result-character" unoptimized src={result.asset} alt={`${result.title} 캐릭터`} width={300} height={250} priority /></div><QuoteIcon className="result-quote-icon" aria-hidden="true" /><blockquote>{result.quote.split("\n").map((line) => <span key={line}>{line}</span>)}</blockquote>{result.checks ? <div className="result-checks">{result.checks.map((item) => <span key={item}><CheckCircledIcon />{item}</span>)}</div> : null}<p className="result-description">{result.description.split("\n").map((line) => <span key={line}>{line}</span>)}</p>{preview ? <button className="primary-button" type="button" onClick={onPreviewStart}>나도 테스트하기 <ArrowRightIcon /></button> : <>{preparedExample ? <div className="conversion-block conversion-block-recording"><h2>그런데 무먹에서는 집밥을 어떻게 기록할까요?</h2></div> : <div className="conversion-block"><p>그런데 집밥 기록이</p><h2>20초 만에 끝난다면?</h2><span>직접 한 번 기록해보세요.</span></div>}<button className="primary-button" type="button" onClick={onNext}>{preparedExample ? "무먹 체험하기" : <>무먹으로 <span className="primary-button-number">20초</span> 체험하기</>} <ArrowRightIcon /></button></>}<button className="share-button" type="button" onClick={onShare}><Share2Icon /> 내 결과 공유하기</button>{shareFeedback ? <div className={shareFeedback.kind === "error" ? "mdv2-error" : "share-status"} role={shareFeedback.kind === "error" ? "alert" : "status"} aria-live="polite"><p>{shareFeedback.message}</p>{shareFeedback.kind === "error" ? <button type="button" onClick={onShare}>다시 시도</button> : null}</div> : null}</Frame>;
}

function DemoHeader({ step, label, onBack }: { step: number; label: string; onBack: () => void }) { return <UnifiedProgressHeader current={step} total={5} onBack={onBack} ariaLabel={`체험 ${step} / 5 · ${label}`} />; }

const INGREDIENTS = [{ name: "돼지고기 목살", amount: "600g", emoji: "🥩" }, { name: "신김치", amount: "200g", emoji: "🥬" }, { name: "양파", amount: "100g", emoji: "🧅" }, { name: "고추장", amount: "100g", emoji: "🥣" }, { name: "고춧가루", amount: "21g", emoji: "🌶️" }];

export function Experience({ step, onBack, onNext, reduced }: { step: number; onBack: () => void; onNext: () => void; reduced: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [adjusted, setAdjusted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [scaleReady, setScaleReady] = useState(false);
  useEffect(() => {
    preloadJourneyAssets();
  }, []);
  const displayedPorkWeight = useCountUp(520, adjusted, 720, 600, reduced);
  const displayedWeight = useCountUp(1180, confirmed, 720, 1200, reduced);
  const calories = useCountUp(487, step === 5, 520, 0, reduced);
  const carbs = useCountUp(31, step === 5, 520, 0, reduced);
  const protein = useCountUp(39, step === 5, 520, 0, reduced);
  const fat = useCountUp(22, step === 5, 520, 0, reduced);
  if (step === 1) return <Frame stage="experience-1" className="demo-screen"><DemoHeader step={1} label="레시피 가져오기" onBack={onBack} /><div className="demo-title"><h1 className={`recipe-import-title ${status === "done" ? "is-complete" : ""}`} data-state={status === "done" ? "complete" : status} aria-label={status === "done" ? "레시피를 가져왔어요" : "유튜브 레시피를 가져올게요."}>{status === "done" ? <span className="recipe-title-success"><CheckCircledIcon data-testid="recipe-title-check" aria-hidden="true" /><span className="recipe-title-copy" data-testid="recipe-title-copy"><strong data-testid="recipe-title-keyword">레시피</strong>를 가져왔어요</span><span className="recipe-title-sparkle" data-testid="recipe-title-sparkle" aria-hidden="true">✨</span></span> : <>유튜브 레시피를 <span>가져올게요.</span></>}</h1></div><div className={`recipe-card ${status !== "idle" ? "is-importing" : ""}`}><div className="recipe-media"><Image className="recipe-thumbnail" unoptimized src="/assets/funnel/food/recipe-jeyuk-thumbnail.webp" alt="유튜브 제육볶음 레시피 썸네일" width={480} height={360} priority /><span className="youtube-play" aria-hidden="true"><PlayIcon /></span>{status === "loading" ? <div className="recipe-loading" role="status"><ReloadIcon /><span>레시피를 가져오는 중…</span></div> : null}</div><h2 className="recipe-name">대표요리가 되는 제육볶음</h2><div className="recipe-channel"><Image className="recipe-channel-avatar" unoptimized src="/assets/funnel/food/lee-man-cook-channel-avatar.webp" alt="이 남자의 cook 채널 프로필" width={36} height={36} /><div><strong>이 남자의 cook</strong><span>YouTube · 조회수 904만회</span></div></div></div><button className="primary-button screen-bottom-button" type="button" disabled={status === "loading"} onClick={() => { if (status === "done") { onNext(); return; } if (status !== "idle") return; setStatus("loading"); window.setTimeout(() => setStatus("done"), reduced ? 0 : 520); }}>{status === "loading" ? "가져오는 중…" : status === "done" ? <>다음 <ArrowRightIcon /></> : "무먹으로 가져오기"}</button></Frame>;
  if (step === 2) return <Frame stage="experience-2" className="demo-screen demo-two-screen"><DemoHeader step={2} label="재료 확인" onBack={onBack} /><div className="demo-title"><h1>영상 속 레시피를<br /><span>자동으로 정리</span>했어요.</h1></div><div className="ingredient-list">{INGREDIENTS.map(({ name, amount, emoji }, index) => <div key={name}><span className="ingredient-emoji" aria-hidden="true">{emoji}</span><span>{name}</span><strong data-testid={index === 0 ? "pork-amount" : undefined} className={index === 0 && adjusted ? "amount-updated" : ""}>{index === 0 ? `${displayedPorkWeight}g` : amount}</strong></div>)}<div className="ingredient-more"><span className="ingredient-more-dots" aria-hidden="true">•••</span><span>외 10개 재료</span><strong>생략</strong></div></div><div className="adjustment-card is-visible" role={adjusted ? "status" : undefined}><CheckCircledIcon /><span>{adjusted ? "돼지고기 양을 520g으로 수정했어요" : "오늘은 돼지고기를 조금 덜 넣었어요."}</span></div>{adjusted ? <button className="primary-button screen-bottom-button" type="button" onClick={onNext}>다음 <ArrowRightIcon /></button> : <button className="primary-button change-weight-button screen-bottom-button" type="button" aria-label="돼지고기 600g → 520g" disabled={transitioning} onClick={() => { if (adjusted || transitioning) return; setTransitioning(true); window.setTimeout(() => { setAdjusted(true); setTransitioning(false); }, reduced ? 0 : 420); }}>돼지고기 <span className="primary-button-number">600g</span> <span className="primary-button-symbol" aria-hidden="true">→</span> <span className="primary-button-number">520g</span></button>}</Frame>;
  if (step === 3) return <Frame stage="experience-3" className="demo-screen demo-weight-screen"><DemoHeader step={3} label="완성 무게" onBack={onBack} /><div className="demo-title"><h1>요리가 완성됐어요.</h1></div><strong className={`hero-metric ${confirmed ? "is-confirmed" : ""}`} data-testid="cooked-weight-metric">{displayedWeight.toLocaleString("ko-KR")}g</strong><p className={`metric-helper ${confirmed ? "is-confirmed" : ""}`} data-testid="weight-helper" aria-live="polite">{confirmed ? <>증발한 수분 무게를 뺀<br /><strong>정확한 무게</strong>를 <strong>입력</strong>했어요</> : <>조리하면서 줄어드는 무게를<br />고려한 예상값이에요.</>}</p><div className="cooked-scale-visual"><Image onLoad={() => setScaleReady(true)} className="cooked-scale-image" unoptimized src="/assets/funnel/food/jeyuk-on-scale.webp" alt="완성된 제육볶음이 올라간 디지털 주방저울" width={500} height={500} priority /><output style={{ visibility: scaleReady ? "visible" : "hidden" }} className="cooked-scale-display" aria-label="완성 무게 1180g">1,180g</output></div><button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={confirmed ? onNext : () => setConfirmed(true)}>{confirmed ? <>다음 <ArrowRightIcon /></> : <>저울로 재보니 <span className="primary-button-number">1,180g</span></>}</button></Frame>;
  if (step === 4) return <Frame stage="experience-4" className="demo-screen portion-screen"><DemoHeader step={4} label="먹은 양" onBack={onBack} /><div className="demo-title"><h1>1,180g 중 얼마나 드셨나요?</h1></div><div className="portion-visual"><Image onLoad={() => setScaleReady(true)} className="portion-image" unoptimized src="/assets/funnel/food/jeyuk-on-scale.webp" alt="흰 접시의 제육볶음이 올라간 디지털 주방저울" width={500} height={500} priority /><output style={{ visibility: scaleReady ? "visible" : "hidden" }} className="scale-display" aria-label="저울 표시 320g">320g</output></div><button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={onNext}><span className="primary-button-number">320g</span> 입력하기</button></Frame>;
  return <Frame stage="experience-5" className="demo-screen nutrition-screen"><DemoHeader step={5} label="영양 계산 완료" onBack={onBack} /><div className="demo-title demo-title--nutrition"><div className="nutrition-confetti" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <StarFilledIcon key={index} />)}</div><h1>계산 완료!</h1><div className="nutrition-serving-line" data-testid="nutrition-serving-line"><p>제육볶음 320g</p><strong className="nutrition-calories"><span>{calories}</span> <small>kcal</small></strong></div></div><div className="macro-grid">{[["탄수화물", `${carbs}g`, "/assets/funnel/food/macro-carb-wheat.webp", "황금빛 밀 이삭"], ["단백질", `${protein}g`, "/assets/funnel/food/macro-protein-arm.webp", "힘을 준 팔"], ["지방", `${fat}g`, "/assets/funnel/food/macro-fat-drop.webp", "황금빛 기름 방울"]].map(([label, value, image, alt]) => <div key={label}><span>{label}</span><Image className="macro-image" unoptimized src={image} alt={alt} width={74} height={74} /><strong>{value}</strong></div>)}</div><button className="primary-button screen-bottom-button" type="button" onClick={onNext}>식단에 기록하기 <ArrowRightIcon /></button></Frame>;
}

function weekDays() { const today = getKoreanToday(); const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() || 7) + 1); return Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; }); }

function WeekStrip() { const today = getKoreanToday(); return <div className="week-strip" aria-label="이번 주 날짜">{weekDays().map((date) => <span className={date.toDateString() === today.toDateString() ? "is-today" : ""} key={date.toISOString()}><small>{["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}</small><strong>{date.getDate()}</strong></span>)}</div>; }

function PlannerSummary({ calories, carbs, protein, fat, highlight, testId = "planner-summary" }: { calories: number; carbs: number; protein: number; fat: number; highlight?: "meal" | "product"; testId?: string }) { return <div className={`planner-summary ${highlight ? "is-updating" : ""}`} data-testid={testId} data-highlight={highlight}>{[["칼로리", calories, "kcal"], ["탄수화물", carbs, "g"], ["단백질", protein, "g"], ["지방", fat, "g"]].map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString("ko-KR")}<small className="planner-summary-unit"> {unit}</small></strong></div>)}</div>; }

type PlannerFood = { name: string; detail: string; image: string; product?: boolean };
const BREAKFAST: PlannerFood = { name: "그릭요거트 볼", detail: "420 kcal · 단백질 22g", image: "/assets/funnel/food/greek-yogurt-bowl.webp" };
const LUNCH: PlannerFood = { name: "닭가슴살 현미밥", detail: "700 kcal · 단백질 50g", image: "/assets/funnel/food/chicken-brown-rice-bowl.webp" };
const HOMECOOK: PlannerFood = { name: "제육볶음 320g", detail: "487 kcal · 단백질 39g", image: "/assets/funnel/food/recipe-jeyuk-thumbnail.webp" };
const DRINK: PlannerFood = { name: "더:단백 드링크 초코", detail: "105 kcal · 단백질 20g", image: "/assets/funnel/products/the-protein-choco.webp", product: true };

function PlannerMealRow({ label, foods, animateLast, highlight, ariaPrefix }: { label: string; foods: PlannerFood[]; animateLast?: boolean; highlight?: "meal" | "product"; ariaPrefix?: string }) { return <div className={`meal-row ${foods.length > 1 ? "has-multiple-foods" : ""} ${highlight ? `is-highlighted is-highlighted--${highlight}` : ""}`}><span className="meal-row-label">{label}</span><div className="meal-foods">{foods.map((food, index) => <div className={`meal-food ${animateLast && index === foods.length - 1 ? "is-entering" : ""}`} key={food.name}><Image className={food.product ? "product-thumb" : ""} unoptimized={food.image.endsWith(".webp")} loading="eager" src={food.image} alt="" width={46} height={46} /><div><strong>{food.name}</strong><span>{food.detail}</span></div></div>)}</div><button className="meal-add-button" type="button" disabled={Boolean(ariaPrefix)} aria-label={`${ariaPrefix ? `${ariaPrefix} ` : "오늘 "}${label} 음식 추가`}>+</button></div>; }

function TomorrowPreview() { const tomorrow = getKoreanToday(); tomorrow.setDate(tomorrow.getDate() + 1); return <section className="next-day-preview" data-testid="tomorrow-preview"><header><strong>내일 · {formatKoreanDate(tomorrow)}</strong><span>0 / 3</span></header><PlannerSummary calories={0} carbs={0} protein={0} fat={0} testId="tomorrow-summary" />{["아침", "점심", "저녁"].map((label) => <PlannerMealRow label={label} foods={[]} ariaPrefix="내일" key={label} />)}</section>; }

export function Planner({ complete, onBack, onNext, reduced }: { complete: boolean; onBack: () => void; onNext: () => void; reduced: boolean }) {
  const [entered, setEntered] = useState(false); const [metricsReady, setMetricsReady] = useState(false);
  useEffect(() => { const entry = window.setTimeout(() => setEntered(true), reduced ? 0 : 200); const metrics = window.setTimeout(() => setMetricsReady(true), reduced ? 0 : complete ? 1250 : 1400); return () => { window.clearTimeout(entry); window.clearTimeout(metrics); }; }, [complete, reduced]);
  const calories = useCountUp(complete ? 1712 : 1607, metricsReady, complete ? 1150 : 1250, complete ? 1607 : 1120, reduced); const carbs = useCountUp(complete ? 184 : 177, metricsReady, 1250, complete ? 177 : 146, reduced); const protein = useCountUp(complete ? 131 : 111, metricsReady, 1250, complete ? 111 : 72, reduced); const fat = useCountUp(complete ? 61 : 60, metricsReady, 1250, complete ? 60 : 38, reduced);
  const today = getKoreanToday();
  return <Frame stage={complete ? "planner-complete" : "planner-homecook"} className="planner-screen"><div className="planner-topline"><Back onClick={onBack} /><div className="planner-heading"><CalendarIcon /><h1>이번 주 식단</h1></div></div><WeekStrip /><section className="meal-day-card"><header><strong>오늘 · {formatKoreanDate(today)}</strong><span>{complete || entered ? "3 / 3" : "2 / 3"}</span></header><PlannerSummary calories={calories} carbs={carbs} protein={protein} fat={fat} highlight={metricsReady ? complete ? "product" : "meal" : undefined} /><PlannerMealRow label="아침" foods={[BREAKFAST]} /><PlannerMealRow label="점심" foods={[LUNCH]} /><PlannerMealRow label="저녁" foods={complete ? entered ? [HOMECOOK, DRINK] : [HOMECOOK] : entered ? [HOMECOOK] : []} animateLast={entered} highlight={entered ? complete ? "product" : "meal" : undefined} /></section><TomorrowPreview /><button className="primary-button planner-floating-cta strong-action-button" type="button" onClick={onNext}>{complete ? "무료 베타 먼저 써보기" : "편의점 음식도 기록해보기"} <ArrowRightIcon /></button></Frame>;
}

export function Packaged({ onBack, onNext }: { onBack: () => void; onNext: () => void }) { return <Frame stage="packaged-food" className="packaged-screen"><Back onClick={onBack} /><div className="demo-title"><h1>그리고<br /><span>편의점 음식</span>은<br />더 간단해요.</h1></div><div className="product-card"><span className="example-badge">제품 예시</span><span className="product-sparkle product-sparkle--left" aria-hidden="true">✨</span><span className="product-sparkle product-sparkle--right" aria-hidden="true">✨</span><Image unoptimized src="/assets/funnel/products/the-protein-choco.webp" alt="더:단백 드링크 초코 제품" width={190} height={270} priority /><div><h2>더:단백 드링크 초코</h2><p>250ml</p><div className="product-stat"><span aria-hidden="true">🔥</span><strong>105 kcal</strong></div><div className="product-stat"><span aria-hidden="true">💪</span><strong>단백질 20g</strong></div></div></div><p className="funnel-sr-only">특정 브랜드와 제휴하거나 추천하는 화면이 아닙니다.</p><button className="primary-button screen-bottom-button strong-action-button" type="button" aria-label="+ 기록하기" onClick={onNext}><PlusIcon /> 기록하기</button></Frame>; }

export type RecordingLeadForm = {
  email: string; consent: boolean; busy: boolean; error: string | null;
  onChange: (patch: { email?: string; consent?: boolean }) => void;
  siteKey: string; challengeEpoch: number; pendingLeadEdited: boolean;
  tokenReady: boolean; onToken: (token: string | null) => void;
  onRestore: () => void; onRetry: () => void;
};

export function BetaForm({ onBack, onSubmit, getTurnstileToken, round2 }: { round2?: RecordingLeadForm; onBack: () => void; onSubmit: (email: string, token: string) => Promise<string | null>; getTurnstileToken?: () => Promise<TurnstileResult> }) {
  const [localEmail, setEmail] = useState("");
  const [localConsent, setConsent] = useState(false);
  const [localError, setError] = useState("");
  const [localSubmitting, setSubmitting] = useState(false);
  const email = round2?.email ?? localEmail;
  const consent = round2?.consent ?? localConsent;
  const error = localError || round2?.error || "";
  const submitting = localSubmitting || round2?.busy || false;
  const turnstileControllerRef = useRef<MarketingTurnstileController | null>(null);
  const requestTurnstileToken = useCallback(async (): Promise<TurnstileResult> => {
    if (getTurnstileToken) return getTurnstileToken();
    return turnstileControllerRef.current?.getToken() ?? {
      ok: false,
      message: "보안 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
    };
  }, [getTurnstileToken]);
  const resetTurnstile = useCallback(() => {
    if (!getTurnstileToken) turnstileControllerRef.current?.reset();
  }, [getTurnstileToken]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim()) { setError("이메일을 입력해 주세요."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("이메일 형식을 확인해 주세요."); return; }
    if (!consent) { setError("이메일 수집·이용 동의가 필요해요."); return; }
    setSubmitting(true);
    const turnstile: TurnstileResult = round2 ? (round2.tokenReady ? { ok: true, token: "" } : { ok: false, message: "보안 확인을 완료한 뒤 다시 시도해 주세요." }) : await requestTurnstileToken();
    if (!turnstile.ok) { resetTurnstile(); setError(turnstile.message); setSubmitting(false); return; }
    const message = await onSubmit(email, turnstile.token);
    if (message) { resetTurnstile(); if (!round2) setError(message); setSubmitting(false); }
    else if (round2) setSubmitting(false);
  };
  return <Frame stage="beta-form" className="beta-screen"><div className="beta-topbar"><Back onClick={onBack} /><Image className="beta-brand-wordmark" unoptimized src="/assets/funnel/brand/mumeok-logo-horizontal.webp" alt="무먹 무엇을 먹든" width={210} height={80} /></div><div className="beta-invitation"><Image className="beta-character" unoptimized src="/assets/funnel/characters/beta-invitation-mascot.webp" alt="파란 초대장을 든 무먹 소금병 캐릭터" width={210} height={210} loading="eager" /><div className="beta-copy"><h1><span>무먹,</span><br />직접 써보고 싶나요?</h1><p>첫 베타테스트를 준비하고 있어요. 이메일을 남겨주시면 가장 먼저 초대드릴게요</p></div></div><form className="email-form" onSubmit={submit} noValidate><label htmlFor="beta-email">이메일</label><div className="email-input-wrap"><input id="beta-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { if (round2) round2.onChange({ email: event.target.value }); else setEmail(event.target.value); setError(""); }} aria-invalid={error ? "true" : "false"} aria-describedby={error ? "beta-error" : "privacy-details"} placeholder="name@example.com" /></div>{round2 ? <Round2Turnstile topic="recording" siteKey={round2.siteKey} resetKey={round2.challengeEpoch} onToken={round2.onToken} onError={setError} /> : getTurnstileToken ? null : <MarketingTurnstile onControllerChange={(controller) => { turnstileControllerRef.current = controller; }} />}<div className="consent-block"><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => { if (round2) round2.onChange({ consent: event.target.checked }); else setConsent(event.target.checked); }} /><span>{round2 ? <><strong>[필수]</strong> 이메일 수집·이용에 동의해요.</> : <><strong>[필수]</strong> 이메일 수집·이용에 동의합니다.</>}</span></label><details className="privacy-disclosure"><summary><ChevronRightIcon aria-hidden="true" />수집 목적과 보유 기간 보기</summary><p className="privacy-details" id="privacy-details">{round2 ? <>수집: 이메일 주소, 신청 주제·동의 기록 · 목적: 무먹 베타 오픈 알림 발송 · 보유: 2026년 11월 30일까지이며 철회하면 삭제해요.</> : <>수집: 이메일 · 목적: 베타 초대 · 보유: 캠페인 종료 후 {MARKETING_VALIDATION_RETENTION_DAYS}일 · <Link href="/privacy">개인정보처리방침</Link></>}</p></details></div>{round2?.pendingLeadEdited ? <div className="mdv2-error" role="status"><p>이전 신청의 접수 여부를 먼저 확인해 주세요.</p><button type="button" disabled={submitting} onClick={round2.onRetry}>이전 신청 접수 확인</button><button type="button" disabled={submitting} onClick={round2.onRestore}>이전 신청 정보 복원</button></div> : null}{error ? <div className="mdv2-error" id="beta-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); if (round2 && !localError) round2.onRetry(); }}>다시 시도</button></div> : null}{submitting ? <p className="mdv2-submit-status" role="status" aria-live="polite">신청 내용을 확인하고 있어요.</p> : null}<button className="primary-button" type="submit" disabled={submitting || round2?.pendingLeadEdited}>{submitting ? "신청 중…" : "무료 베타 초대받기"}</button></form></Frame>;
}

export function Done({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  return <Frame stage="done" className="success-screen"><Back onClick={onBack} /><div className="success-character-wrap"><div className="success-celebration" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <StarFilledIcon key={index} />)}</div><Image className="success-character" unoptimized src="/assets/funnel/characters/beta-success-mascot.webp" alt="파란 하트와 함께 반기는 무먹 소금병 캐릭터" width={310} height={280} priority /></div><h1>신청이 완료됐어요!</h1><p>베타가 준비되면<br />이메일로 알려드릴게요.</p><button className="primary-button screen-bottom-button" type="button" onClick={onReset}>처음으로 돌아가기</button></Frame>;
}
