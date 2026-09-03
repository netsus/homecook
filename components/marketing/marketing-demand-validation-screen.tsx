"use client";

import Image from "next/image";
import Link from "next/link";
import React, { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  MarketingTurnstile,
  type MarketingTurnstileController,
} from "@/components/marketing/marketing-turnstile";
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

const RESULT_KEYS: MarketingValidationQuizResult[] = ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"];
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const QUESTIONS = [
  { id: "q1", prompt: "평소 칼로리나 탄단지를\n얼마나 자주 기록하나요?", choices: [["daily", "거의 매일"], ["3_5", "주 3~5일"], ["1_2", "주 1~2일"], ["none", "거의 안 함 / 안 함"]] },
  { id: "q2", prompt: "일주일에 집밥을\n몇 끼 정도 먹나요?", helper: "직접 만들거나 가족이 만든 음식 모두 포함", choices: [["none", "거의 안 먹음"], ["1_2", "1~2끼"], ["3_5", "3~5끼"], ["6_plus", "6끼 이상"]] },
  { id: "q3", prompt: "집밥은 주로\n어떻게 기록하나요?", choices: [["pass", "집밥은 기록하지 않음"], ["eyeball", "먹은 양을 눈대중으로 기록"], ["track", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록"], ["measure", "재료와 음식 무게까지 재서 기록"]] },
  { id: "q4", prompt: "집밥을 기록할 때\n가장 불편한 것은?", choices: [["ingredients", "재료와 양을 하나씩 입력하는 것"], ["weight", "완성된 음식과 먹은 양을 재는 것"], ["search", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"], ["none", "별로 불편하지 않음"]] },
] as const;

const RESULTS: Record<MarketingValidationQuizResult, { title: string; quote: string; description: string; asset: string; checks?: string[] }> = {
  "homecook-passer": { title: "집밥 패스형", quote: "닭가슴살까지는 기록했는데\n김치찌개에서 앱을 닫는 타입.", description: "재료가 많아질수록\n기록을 포기하기 쉬워요.", asset: "/assets/funnel/characters/homecook-passer.png" },
  "eyeballing-master": { title: "눈대중 장인", quote: "칼로리는 과학이지만\n내 눈도 꽤 정확하다고 믿는 편.", description: "비슷한 메뉴를 빠르게 골라\n기록하는 실용주의자예요.", asset: "/assets/funnel/characters/eyeballing-master.png" },
  "ingredient-tracker": { title: "성분 추적러", quote: "딱 맞는 음식이 없어\n오늘도 검색 결과를 추적하는 사람.", description: "긴 검색보다 내 레시피를 바로 기록하는 편이\n더 잘 맞아요.", asset: "/assets/funnel/characters/ingredient-tracker.png" },
  "pro-measurer": { title: "프로 계량러", quote: "완성 음식까지 저울에 올렸다면\n당신은 이미 상위 기록러.", description: "정확한 대신 매번 다시 계산하는\n시간이 오래 걸려요.", asset: "/assets/funnel/characters/pro-measurer.png", checks: ["재료 무게", "완성 무게", "먹은 무게"] },
};

const HERO_COPY: Record<MarketingValidationAdVariant, { title: string; body: string; image: string }> = {
  default: { title: "집밥도 정확하게 기록할 수 있을까?", body: "30초 테스트로 나의 집밥 기록 타입을 알아보세요.", image: "/assets/funnel/food/recipe-jeyuk-thumbnail.png" },
  a: { title: "왜 레시피에 다 있는데\n내가 또 입력하지?", body: "집밥 하나 기록하려고 같은 재료를 다시 찾고 있었습니다.", image: "/assets/funnel/hero/hero-a-visual.png" },
  b: { title: "요리 전 1,420g → 요리 후 1,083g\n그럼 내가 먹은 300g은 몇 kcal일까?", body: "직접 만든 음식은 ‘1인분’보다 실제로 먹은 양이 더 중요합니다.", image: "/assets/funnel/hero/hero-b-visual.png" },
  c: { title: "이 제육볶음 300g,\n몇 kcal일까요?", body: "같은 300g도 재료와 양념에 따라 영양값이 달라집니다.", image: "/assets/funnel/hero/hero-c-visual.png" },
  d: { title: "식단은 꼼꼼히 기록하는데\n집밥만 ‘비슷한 음식’으로 넣고 있었습니다.", body: "내가 만든 음식인데 검색 결과에서 남의 음식을 고르고 있었습니다.", image: "/assets/funnel/hero/hero-d-visual.png" },
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

function deriveResult(q3: MarketingValidationQuizAnswers["q3"]): MarketingValidationQuizResult {
  return { pass: "homecook-passer", eyeball: "eyeballing-master", track: "ingredient-tracker", measure: "pro-measurer" }[q3] as MarketingValidationQuizResult;
}

function Frame({ children, stage }: { children: ReactNode; stage: string }) {
  return <main className="mdv2-screen" data-stage={stage} data-testid={`screen-${stage}`}>{children}</main>;
}

function Brand() {
  return <div className="mdv2-brand"><Image src="/assets/funnel/brand/mumeok-symbol.png" alt="무먹" width={42} height={42} priority /><span>무엇을 먹든</span></div>;
}

function Back({ onClick, label = "이전 화면" }: { onClick: () => void; label?: string }) {
  return <button className="mdv2-back" type="button" onClick={onClick} aria-label={label}><span aria-hidden="true">‹</span></button>;
}

function Hero({ variant, onStart }: { variant: MarketingValidationAdVariant; onStart: () => void }) {
  const copy = HERO_COPY[variant];
  return <Frame stage="hero">
    <Brand />
    <section className="mdv2-hero-copy">
      <p className="mdv2-eyebrow">집밥 기록 30초 테스트</p>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
    </section>
    <div className={`mdv2-hero-visual is-${variant}`} data-hero-variant={variant}>
      <Image src={copy.image} alt="집밥 기록 테스트 소개" width={620} height={420} priority />
      {variant === "default" ? <div className="mdv2-hero-overlay"><Image src="/assets/funnel/brand/mumeok-symbol.png" alt="" width={32} height={32} /><strong>무엇을 먹든</strong><span>집밥도 빠르게, 내 레시피대로</span></div> : null}
    </div>
    <button className="mdv2-primary" type="button" onClick={onStart}>테스트 시작하기</button>
    <p className="mdv2-trust"><span>4문항</span><span>로그인 없이</span><span>결과 바로 확인</span></p>
  </Frame>;
}

function Quiz({ index, answers, onBack, onSelect, locked }: { index: number; answers: Answers; onBack: () => void; onSelect: (id: QuestionId, value: string) => void; locked: boolean }) {
  const question = QUESTIONS[index];
  return <Frame stage={`question-${index + 1}`}>
    <div className="mdv2-topbar"><Back onClick={onBack} label={index ? "이전 질문" : "이전 화면"} /><strong>{index + 1} / 4</strong></div>
    <div className="mdv2-progress" role="progressbar" aria-label={`${index + 1} / 4 진행`} aria-valuemin={1} aria-valuemax={4} aria-valuenow={index + 1}><span style={{ width: `${(index + 1) * 25}%` }} /></div>
    <section className="mdv2-question"><h1>{question.prompt}</h1>{"helper" in question ? <p>{question.helper}</p> : null}</section>
    <div className="mdv2-choices" aria-label={question.prompt}>
      {question.choices.map(([value, label]) => <button key={value} type="button" aria-pressed={answers[question.id] === value} disabled={locked} onClick={() => onSelect(question.id, value)}><span>{label}</span><i aria-hidden="true">{answers[question.id] === value ? "✓" : ""}</i></button>)}
    </div>
  </Frame>;
}

function Result({ type, onBack, onNext, preview, onPreviewStart, onShare, shareFeedback }: { type: MarketingValidationQuizResult; onBack: () => void; onNext: () => void; preview: boolean; onPreviewStart: () => void; onShare: () => void; shareFeedback: ShareFeedback }) {
  const result = RESULTS[type];
  return <Frame stage="result">
    <Back onClick={onBack} label={preview ? "처음 화면" : "마지막 질문으로 돌아가기"} />
    {preview ? <p className="mdv2-readonly">공유된 결과 · 읽기 전용</p> : <p className="mdv2-result-kicker">당신의 집밥 기록 타입은…</p>}
    <h1>{result.title}</h1>
    <Image className="mdv2-character" src={result.asset} alt={`${result.title} 캐릭터`} width={300} height={250} priority />
    <blockquote>{result.quote}</blockquote>
    {result.checks ? <div className="mdv2-checks">{result.checks.map((item) => <span key={item}>✓ {item}</span>)}</div> : null}
    <p className="mdv2-result-description">{result.description}</p>
    {preview ? <button className="mdv2-primary" type="button" onClick={onPreviewStart}>나도 테스트하기</button> : <>
      <div className="mdv2-conversion"><p>그런데 집밥 기록이</p><h2>20초 만에 끝난다면?</h2><span>직접 한 번 기록해보세요.</span></div>
      <button className="mdv2-primary" type="button" onClick={onNext}>무먹으로 20초 체험하기</button>
    </>}
    <button className="mdv2-secondary" type="button" onClick={onShare}>내 결과 공유하기</button>
    {shareFeedback ? <div className={shareFeedback.kind === "error" ? "mdv2-error" : "mdv2-share-status"} role={shareFeedback.kind === "error" ? "alert" : "status"} aria-live="polite"><p>{shareFeedback.message}</p>{shareFeedback.kind === "error" ? <button type="button" onClick={onShare}>다시 시도</button> : null}</div> : null}
  </Frame>;
}

function DemoHeader({ step, label, onBack }: { step: number; label: string; onBack: () => void }) {
  return <><div className="mdv2-topbar"><Back onClick={onBack} /><span>체험 {step} / 5 · {label}</span></div><div className="mdv2-segments" aria-label={`체험 ${step} / 5`}>{[1, 2, 3, 4, 5].map((item) => <span className={item <= step ? "active" : ""} key={item} />)}</div></>;
}

const INGREDIENTS = [["돼지고기", "600g"], ["양파", "200g"], ["대파", "100g"], ["고추장", "60g"], ["간장", "40g"], ["설탕", "25g"]];

function Experience({ step, onBack, onNext, reduced }: { step: number; onBack: () => void; onNext: () => void; reduced: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [adjusted, setAdjusted] = useState(false);
  const advanceLater = (delay: number) => window.setTimeout(onNext, reduced ? 0 : delay);
  if (step === 1) return <Frame stage="experience-1"><DemoHeader step={1} label="레시피 가져오기" onBack={onBack} /><h1>유튜브 레시피를<br /><em>가져올게요.</em></h1><article className="mdv2-recipe"><Image src="/assets/funnel/food/recipe-jeyuk-thumbnail.png" alt="유튜브 제육볶음 레시피 썸네일" width={520} height={260} /><h2>제육볶음에 공식이 있다고?</h2><p>YouTube · 셰프호윤 · 조회수 62.8만회</p></article>{status !== "idle" ? <p role="status">{status === "loading" ? "레시피를 가져오는 중…" : "레시피를 가져왔어요"}</p> : null}<button className="mdv2-primary" disabled={status !== "idle"} onClick={() => { setStatus("loading"); window.setTimeout(() => { setStatus("done"); advanceLater(500); }, reduced ? 0 : 520); }}>무먹으로 가져오기</button></Frame>;
  if (step === 2) return <Frame stage="experience-2"><DemoHeader step={2} label="재료 확인" onBack={onBack} /><h1>영상 속 레시피를<br /><em>자동으로 정리</em>했어요.</h1><div className="mdv2-ingredients">{INGREDIENTS.map(([name, amount]) => <div key={name}><span>{name}</span><strong>{name === "돼지고기" && adjusted ? "520g" : amount}</strong></div>)}</div>{!adjusted ? <button className="mdv2-adjust" type="button" aria-label="돼지고기 양을 520g으로 바꾸기" onClick={() => setAdjusted(true)}>오늘은 조금 덜 넣었어요 <strong>600g → 520g</strong></button> : <p role="status">돼지고기 520g을 반영했어요.</p>}<button className="mdv2-primary" type="button" disabled={!adjusted} onClick={onNext}>다음</button></Frame>;
  if (step === 3) return <Frame stage="experience-3"><DemoHeader step={3} label="완성 무게" onBack={onBack} /><h1>요리가 완성됐어요.</h1><p className="mdv2-label">예상 완성 무게</p><strong className="mdv2-metric">1,200g</strong><p>조리하면서 줄어드는 무게를 고려한 예상값이에요.</p><Image className="mdv2-scale" src="/assets/funnel/food/empty-kitchen-scale.png" alt="빈 디지털 주방저울" width={380} height={260} /><button className="mdv2-primary" type="button" onClick={() => advanceLater(200)}>저울로 재보니 1,180g</button></Frame>;
  if (step === 4) return <Frame stage="experience-4"><DemoHeader step={4} label="먹은 양" onBack={onBack} /><h1>1,180g 중 얼마나 드셨나요?</h1><div className="mdv2-portion"><Image src="/assets/funnel/food/jeyuk-on-scale.png" alt="제육볶음이 올라간 주방저울" width={480} height={350} /><output aria-label="저울 표시 320g">320g</output></div><button className="mdv2-primary" type="button" onClick={onNext}>320g 입력하기</button></Frame>;
  return <Frame stage="experience-5"><DemoHeader step={5} label="영양 계산 완료" onBack={onBack} /><div className="mdv2-nutrition-title"><h1>계산 완료!</h1><p>오늘 먹은 제육볶음</p><strong>487 <small>kcal</small></strong></div><div className="mdv2-macros">{[["탄수화물", "31g", "/assets/funnel/food/macro-carb-wheat.png"], ["단백질", "39g", "/assets/funnel/food/macro-protein-arm.png"], ["지방", "22g", "/assets/funnel/food/macro-fat-drop.png"]].map(([label, value, image]) => <div key={label}><span>{label}</span><Image src={image} alt="" width={74} height={74} /><strong>{value}</strong></div>)}</div><button className="mdv2-primary" type="button" onClick={onNext}>식단에 기록하기</button></Frame>;
}

function koreanDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}/${date.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
}

function weekDays() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() || 7) - 1));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { active: date.toDateString() === today.toDateString(), day: date.getDate(), label: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] };
  });
}

function TomorrowPreview() {
  return <section className="mdv2-tomorrow" data-testid="tomorrow-preview"><header><strong>내일 · {koreanDate(1)}</strong><span>0 / 3</span></header>{["아침", "점심", "저녁"].map((label) => <div key={label}><span>{label}</span><button type="button" disabled aria-label={`내일 ${label} 추가`}>+</button></div>)}</section>;
}

function Planner({ complete, onBack, onNext }: { complete: boolean; onBack: () => void; onNext: () => void }) {
  const days = weekDays();
  return <Frame stage={complete ? "planner-complete" : "planner-homecook"}><div className="mdv2-topbar"><Back onClick={onBack} /><h1>이번 주 식단</h1></div><div className="mdv2-summary">{(complete ? [["칼로리", "1,712 kcal"], ["탄수화물", "184g"], ["단백질", "131g"], ["지방", "61g"]] : [["칼로리", "1,607 kcal"], ["탄수화물", "177g"], ["단백질", "111g"], ["지방", "60g"]]).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="mdv2-week"><button type="button" aria-label="이전 주">‹</button><strong>이번 주 {koreanDate(-((new Date().getDay() || 7) - 1)).replace(/ \(.+\)/, "")} - {koreanDate(7 - (new Date().getDay() || 7)).replace(/ \(.+\)/, "")}</strong><button type="button" aria-label="다음 주">›</button></div><div className="mdv2-week-strip" aria-label="이번 주 날짜">{days.map((day) => <span className={day.active ? "active" : ""} key={`${day.label}-${day.day}`}><small>{day.label}</small><strong>{day.day}</strong></span>)}</div><section className="mdv2-day"><header><strong>오늘 · {koreanDate()}</strong><span>3 / 3</span></header>{[["아침", "그릭요거트 볼", "420 kcal · 단백질 22g", "/assets/funnel/food/greek-yogurt-bowl.png"], ["점심", "닭가슴살 현미밥", "700 kcal · 단백질 50g", "/assets/funnel/food/chicken-brown-rice-bowl.png"], ["저녁", complete ? "제육볶음 · 더:단백" : "제육볶음 320g", complete ? "592 kcal · 단백질 59g" : "487 kcal · 단백질 39g", "/assets/funnel/food/recipe-jeyuk-thumbnail.png"]].map(([meal, name, detail, image]) => <div className="mdv2-meal" key={meal}><span>{meal}</span><Image src={image} alt="" width={46} height={46} /><div><strong>{name}</strong><small>{detail}</small></div><button type="button" disabled aria-label={`오늘 ${meal} 추가`}>+</button></div>)}</section><TomorrowPreview /><button className="mdv2-primary" type="button" onClick={onNext}>{complete ? "무료 베타 먼저 써보기" : "편의점 음식도 기록해보기"}</button></Frame>;
}

function Packaged({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return <Frame stage="packaged-food"><Back onClick={onBack} /><h1>그리고<br /><em>편의점 음식</em>은<br />더 간단해요.</h1><article className="mdv2-product"><span className="mdv2-badge">제품 예시</span><Image src="/assets/funnel/products/the-protein-choco.png" alt="더:단백 드링크 초코 제품 예시" width={190} height={270} /><div><h2>더:단백 드링크 초코</h2><p>250ml</p><strong>105 kcal · 단백질 20g</strong></div></article><p className="mdv2-affiliation">특정 브랜드와 제휴하거나 추천하는 화면이 아닙니다.</p><button className="mdv2-primary" type="button" aria-label="+ 기록하기" onClick={onNext}>+ 기록하기</button></Frame>;
}

function BetaForm({ onBack, onSubmit, getTurnstileToken }: { onBack: () => void; onSubmit: (email: string, token: string) => Promise<string | null>; getTurnstileToken?: () => Promise<TurnstileResult> }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    const turnstile = await requestTurnstileToken();
    if (!turnstile.ok) { resetTurnstile(); setError(turnstile.message); setSubmitting(false); return; }
    const message = await onSubmit(email, turnstile.token);
    if (message) { resetTurnstile(); setError(message); setSubmitting(false); }
  };
  return <Frame stage="beta-form"><Back onClick={onBack} /><div className="mdv2-invitation"><Image src="/assets/funnel/characters/beta-invitation-mascot.png" alt="파란 초대장을 든 무먹 캐릭터" width={210} height={210} /><div><Image src="/assets/funnel/brand/mumeok-logo-horizontal.png" alt="무먹 무엇을 먹든" width={210} height={80} /><h1>직접 써보고 싶나요?</h1><p>이메일을 남기면 베타가 준비되는 대로 가장 먼저 초대해드릴게요.</p></div></div><form className="mdv2-form" onSubmit={submit} noValidate><label htmlFor="beta-email">이메일</label><input id="beta-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "beta-error" : "beta-privacy"} placeholder="email@example.com" />{getTurnstileToken ? null : <MarketingTurnstile onControllerChange={(controller) => { turnstileControllerRef.current = controller; }} />}<label className="mdv2-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />베타 초대용 이메일 수집·이용에 동의합니다. <strong>(필수)</strong></label><p id="beta-privacy">수집: 이메일 · 목적: 베타 초대 · 보유: 베타 초대 종료 시까지 · <Link href="/privacy">개인정보처리방침</Link></p>{error ? <div className="mdv2-error" id="beta-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>다시 시도</button></div> : null}<p className="mdv2-submit-status" role="status" aria-live="polite">{submitting ? "신청 내용을 확인하고 있어요." : ""}</p><button className="mdv2-primary" type="submit" disabled={submitting}>{submitting ? "신청 중…" : "무료 베타 초대받기"}</button></form></Frame>;
}

function Done({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  return <Frame stage="done"><Back onClick={onBack} /><Image className="mdv2-success-character" src="/assets/funnel/characters/beta-success-mascot.png" alt="파란 하트와 함께 반기는 무먹 캐릭터" width={310} height={280} /><h1>신청이 완료됐어요!</h1><p>베타가 준비되면<br />이메일로 알려드릴게요.</p><button className="mdv2-secondary" type="button" onClick={onReset}>처음으로 돌아가기</button></Frame>;
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
    const data = { title: `무먹 집밥 기록 타입: ${RESULTS[result].title}`, text: RESULTS[result].quote.replace("\n", " "), url: url.toString() };
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
  const submitLead = async (email: string, token: string) => {
    const response = await postMarketingValidation({ action: "lead_submitted", email, consent: true, turnstile_token: token, honeypot: "" });
    if (!response.success) return response.error?.message ?? "신청을 처리하지 못했어요.";
    push("done");
    return null;
  };
  const reset = () => { window.history.replaceState({}, "", "/beta"); setAnswers({}); setHistory([]); setQuestionIndex(0); setResult("eyeballing-master"); setStage("hero"); void initialize(); };

  if (loading) return <div className="mdv2-root"><main className="mdv2-screen mdv2-loading" role="status" aria-label="테스트 불러오는 중"><Brand /><div /><div /><div /></main></div>;
  if (shellError) return <div className="mdv2-root"><Frame stage="empty"><Brand /><h1>새 테스트로 다시 시작할게요.</h1><p role="alert">{shellError}</p><button className="mdv2-primary" type="button" onClick={reset}>새로 시작하기</button></Frame></div>;
  if (queueRecovery) return <div className="mdv2-root"><Frame stage="recovery"><Brand /><h1>잠시 연결이 끊겼어요.</h1><div className="mdv2-error" role="alert"><p>{queueRecovery.message}</p></div><button className="mdv2-primary" type="button" disabled={recovering} onClick={() => void retryQueue()}>{recovering ? "다시 연결하는 중…" : "다시 시도"}</button></Frame></div>;

  let content: ReactNode;
  if (stage === "hero") content = <Hero variant={entry.adVariant} onStart={() => void start()} />;
  else if (stage === "quiz") content = <Quiz index={questionIndex} answers={answers} locked={transitionLocked.current} onBack={() => questionIndex ? setQuestionIndex((current) => current - 1) : back()} onSelect={select} />;
  else if (stage === "result") content = <Result type={result} preview={preview} onBack={back} onNext={async () => { const showExperience = () => push("experience-1"); if (await record({ action: "experience_started" })) showExperience(); else showQueueRecovery("체험 화면을 열지 못했어요. 다시 시도해 주세요.", showExperience); }} onPreviewStart={reset} onShare={() => void share()} shareFeedback={shareFeedback} />;
  else if (stage.startsWith("experience-")) { const step = Number(stage.at(-1)); content = <Experience step={step} reduced={reduced} onBack={back} onNext={async () => { if (step < 5) push(`experience-${step + 1}` as MarketingValidationUiStage); else { const showPlanner = () => push("planner-homecook"); if (await record({ action: "experience_completed" })) showPlanner(); else showQueueRecovery("식단 화면을 열지 못했어요. 다시 시도해 주세요.", showPlanner); } }} />; }
  else if (stage === "planner-homecook") content = <Planner complete={false} onBack={back} onNext={() => push("packaged-food")} />;
  else if (stage === "packaged-food") content = <Packaged onBack={back} onNext={() => push("planner-complete")} />;
  else if (stage === "planner-complete") content = <Planner complete onBack={back} onNext={async () => { const showBetaForm = () => push("beta-form"); if (await record({ action: "beta_form_viewed" })) showBetaForm(); else showQueueRecovery("신청 화면을 열지 못했어요. 다시 시도해 주세요.", showBetaForm); }} />;
  else if (stage === "beta-form") content = <BetaForm onBack={back} onSubmit={submitLead} getTurnstileToken={getTurnstileToken} />;
  else content = <Done onBack={back} onReset={reset} />;

  return <div className="mdv2-root"><div className="mdv2-shell">{content}</div><p className="mdv2-live" aria-live="polite">{stage === "done" ? "신청이 완료됐어요." : ""}</p></div>;
}
