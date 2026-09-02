import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronLeftIcon,
  EnvelopeClosedIcon,
  LockClosedIcon,
  PlayIcon,
  PlusIcon,
  QuoteIcon,
  ReloadIcon,
  Share2Icon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  FlowStack,
  KeyboardInput,
  MobileScroll,
  type FlowControls,
  type FlowScreen,
  useKeyboard,
} from "./mobile";

type HeroVariant = "a" | "b" | "c" | "d" | "default";
type QuestionId = "q1" | "q2" | "q3" | "q4";
type Answers = Partial<Record<QuestionId, string>>;
type ResultType = "homecook-passer" | "eyeballing-master" | "ingredient-tracker" | "pro-measurer";

type Choice = { label: string; value: string };
type Question = { id: QuestionId; helper?: string; prompt: string; choices: Choice[] };
type ResultContent = { title: string; quote: string; description: string; asset: string; checks?: string[] };

function formatKoreanDate(date: Date, { includeYear = true, includeWeekday = true } = {}) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return includeYear
    ? `${year}년 ${month}월 ${day}일${includeWeekday ? ` ${weekday}요일` : ""}`
    : `${month}/${day}${includeWeekday ? ` (${weekday})` : ""}`;
}

function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const numberPart = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value ?? 1);
  return new Date(numberPart("year"), numberPart("month") - 1, numberPart("day"), 12);
}

function useCountUp(target: number, active: boolean, duration = 520, start = 0) {
  const [value, setValue] = useState(active ? target : start);

  useEffect(() => {
    if (!active) {
      setValue(start);
      return;
    }

    const startedAt = window.performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const next = start + (target - start) * progress;
      setValue(Math.round(next));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, duration, start, target]);

  return value;
}

const questions: Question[] = [
  {
    id: "q1",
    prompt: "평소 칼로리나 탄단지를\n얼마나 자주 기록하나요?",
    choices: [
      { value: "daily", label: "거의 매일" },
      { value: "3_5", label: "주 3~5일" },
      { value: "1_2", label: "주 1~2일" },
      { value: "none", label: "거의 안 함 / 안 함" },
    ],
  },
  {
    id: "q2",
    prompt: "일주일에 집밥을\n몇 끼 정도 먹나요?",
    helper: "직접 만들거나 가족이 만든 음식 모두 포함",
    choices: [
      { value: "none", label: "거의 안 먹음" },
      { value: "1_2", label: "1~2끼" },
      { value: "3_5", label: "3~5끼" },
      { value: "6_plus", label: "6끼 이상" },
    ],
  },
  {
    id: "q3",
    prompt: "집밥은 주로\n어떻게 기록하나요?",
    choices: [
      { value: "pass", label: "집밥은 기록하지 않음" },
      { value: "eyeball", label: "먹은 양을 눈대중으로 기록" },
      { value: "track", label: "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록" },
      { value: "measure", label: "재료와 음식 무게까지 재서 기록" },
    ],
  },
  {
    id: "q4",
    prompt: "집밥을 기록할 때\n가장 불편한 것은?",
    choices: [
      { value: "ingredients", label: "재료와 양을 하나씩 입력하는 것" },
      { value: "weight", label: "완성된 음식과 먹은 양을 재는 것" },
      { value: "search", label: "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것" },
      { value: "none", label: "별로 불편하지 않음" },
    ],
  },
];

const results: Record<ResultType, ResultContent> = {
  "homecook-passer": {
    title: "집밥 패스형",
    quote: "닭가슴살까지는 기록했는데\n김치찌개에서 앱을 닫는 타입.",
    description: "재료가 많아질수록\n기록을 포기하기 쉬워요.",
    asset: "/assets/funnel/characters/homecook-passer.png",
  },
  "eyeballing-master": {
    title: "눈대중 장인",
    quote: "칼로리는 과학이지만\n내 눈도 꽤 정확하다고 믿는 편.",
    description: "비슷한 메뉴를 빠르게 골라\n기록하는 실용주의자예요.",
    asset: "/assets/funnel/characters/eyeballing-master.png",
  },
  "ingredient-tracker": {
    title: "성분 추적러",
    quote: "딱 맞는 음식이 없어\n오늘도 검색 결과를 추적하는 사람.",
    description: "긴 검색보다 내 레시피를 바로 기록하는 편이\n더 잘 맞아요.",
    asset: "/assets/funnel/characters/ingredient-tracker.png",
  },
  "pro-measurer": {
    title: "프로 계량러",
    quote: "완성 음식까지 저울에 올렸다면\n당신은 이미 상위 기록러.",
    description: "정확한 대신 매번 다시 계산하는\n시간이 오래 걸려요.",
    asset: "/assets/funnel/characters/pro-measurer.png",
    checks: ["재료 무게", "완성 무게", "먹은 무게"],
  },
};

const ingredients = [
  ["돼지고기", "600g"],
  ["양파", "200g"],
  ["대파", "100g"],
  ["고추장", "60g"],
  ["간장", "40g"],
  ["설탕", "25g"],
];

const heroCopy: Record<HeroVariant, { eyebrow: string; title: string; body: string; reference?: string }> = {
  default: { eyebrow: "집밥 기록 30초 테스트", title: "집밥도 정확하게 기록할 수 있을까?", body: "30초 테스트로 나의 집밥 기록 타입을 알아보세요." },
  a: { eyebrow: "집밥 기록 30초 테스트", title: "왜 레시피에 다 있는데\n내가 또 입력하지?", body: "집밥 하나 기록하려고 같은 재료를 다시 찾고 있었습니다.", reference: "/assets/funnel/hero/hero-a-visual.png" },
  b: { eyebrow: "집밥 기록 30초 테스트", title: "요리 전 1,420g → 요리 후 1,083g\n그럼 내가 먹은 300g은 몇 kcal일까?", body: "직접 만든 음식은 ‘1인분’보다 실제로 먹은 양이 더 중요합니다.", reference: "/assets/funnel/hero/hero-b-visual.png" },
  c: { eyebrow: "집밥 기록 30초 테스트", title: "이 제육볶음 300g,\n몇 kcal일까요?", body: "같은 300g도 재료와 양념에 따라 영양값이 달라집니다.", reference: "/assets/funnel/hero/hero-c-visual.png" },
  d: { eyebrow: "집밥 기록 30초 테스트", title: "식단은 꼼꼼히 기록하는데\n집밥만 ‘비슷한 음식’으로 넣고 있었습니다.", body: "내가 만든 음식인데 검색 결과에서 남의 음식을 고르고 있었습니다.", reference: "/assets/funnel/hero/hero-d-visual.png" },
};

function readHeroVariant(): HeroVariant {
  const params = new URLSearchParams(window.location.search);
  const content = params.get("utm_content");
  if (content === "hook_reentry") return "a";
  if (content === "hook_cooked_weight") return "b";
  if (content === "hook_calorie_quiz") return "c";
  if (content === "hook_workaround") return "d";
  const variant = params.get("ad_variant") ?? params.get("variant");
  return variant === "a" || variant === "b" || variant === "c" || variant === "d" ? variant : "default";
}

function deriveResult(q3: string | undefined): ResultType {
  if (q3 === "pass") return "homecook-passer";
  if (q3 === "track") return "ingredient-tracker";
  if (q3 === "measure") return "pro-measurer";
  return "eyeballing-master";
}

function readSharedResult(): ResultType | null {
  const result = new URLSearchParams(window.location.search).get("result");
  const match = (Object.entries(results) as Array<[ResultType, ResultContent]>).find(([, content]) => content.title === result);
  return match?.[0] ?? null;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return prefersReducedMotion;
}

function scheduleAdvance(prefersReducedMotion: boolean, callback: () => void, delay: number) {
  window.setTimeout(callback, prefersReducedMotion ? 0 : delay);
}

function ScreenFrame({ children, className = "", testId, dataAttributes = {} }: { children: ReactNode; className?: string; testId: string; dataAttributes?: Record<string, string> }) {
  const contentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const resetScroll = () => {
      const scroll = contentRef.current?.closest(".mobile-scroll");
      if (scroll instanceof HTMLElement) scroll.scrollTop = 0;
      const deviceScreen = contentRef.current?.closest(".device-screen");
      if (deviceScreen instanceof HTMLElement) deviceScreen.scrollTop = 0;
    };
    const immediateTimer = window.setTimeout(resetScroll, 0);
    const settledTimer = window.setTimeout(resetScroll, 420);
    return () => {
      window.clearTimeout(immediateTimer);
      window.clearTimeout(settledTimer);
    };
  }, [testId]);
  return (
    <MobileScroll className="app-screen">
      <main ref={contentRef} className={`screen-content ${className}`} data-testid={testId} {...dataAttributes}>
        {children}
      </main>
    </MobileScroll>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "is-compact" : ""}`}>
      <img src="/assets/funnel/brand/mumeok-symbol.png" alt="무먹" />
      <span>무엇을 먹든</span>
    </div>
  );
}

function BackButton({ flow, label = "이전 화면", fallback }: { flow: FlowControls; label?: string; fallback?: () => void }) {
  return (
    <button className="icon-button back-button" type="button" onClick={flow.canGoBack ? flow.pop : fallback} aria-label={label}>
      <ChevronLeftIcon />
    </button>
  );
}

function HeroProblemVisual({ variant }: { variant: HeroVariant }) {
  const reference = heroCopy[variant].reference;
  if (reference) {
    return (
      <div className={`hero-visual hero-reference hero-reference--${variant}`} data-testid="hero-reference" data-hero-variant={variant}>
        <img src={reference} alt={`${heroCopy[variant].eyebrow} 랜딩 시각`} />
      </div>
    );
  }
  return (
    <div className="hero-visual hero-visual--default">
      <img src="/assets/funnel/food/recipe-jeyuk-thumbnail.png" alt="팬에서 조리 중인 제육볶음" />
      <div>
        <BrandMark compact />
        <span>집밥도 빠르게, 내 레시피대로</span>
      </div>
    </div>
  );
}

function HeroScreen({ variant, onStart }: { variant: HeroVariant; onStart: () => void }) {
  const copy = heroCopy[variant];
  useEffect(() => {
    document.title = "무먹 집밥 기록 테스트";
    setShareMeta("og:title", "무먹 집밥 기록 테스트");
    setShareMeta("og:description", "집밥 기록 타입을 확인하고 무먹의 기록 흐름을 체험해보세요.");
    setShareMeta("og:image", new URL("/assets/funnel/share/og-share.png", window.location.origin).toString());
  }, []);
  return (
    <ScreenFrame className="hero-screen" testId="screen-hero">
      <BrandMark />
      <div className="hero-copy-block">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title.split("\n").map((line, lineIndex) => <span key={line}>{lineIndex ? <br /> : null}{line}</span>)}</h1>
        <p>{copy.body}</p>
      </div>
      <HeroProblemVisual variant={variant} />
      <div className="screen-actions hero-actions">
        <button className="primary-button" type="button" onClick={onStart}>
          테스트 시작하기 <ArrowRightIcon />
        </button>
        <p className="trust-line">
          <span>4문항</span>
          <span>로그인 없이</span>
          <span>결과 바로 확인</span>
        </p>
      </div>
    </ScreenFrame>
  );
}

function QuizScreen({ flow, index, selected, onSelect }: { flow: FlowControls; index: number; selected?: string; onSelect: (value: string) => void }) {
  const question = questions[index];
  return (
    <ScreenFrame className="quiz-screen" testId={`screen-question-${index + 1}`}>
      <div className="quiz-topbar">
        <BackButton flow={flow} label={index > 0 ? "이전 질문" : "이전 화면"} />
        <span className="progress-count">{index + 1} / 4</span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={index + 1} aria-label={`${index + 1} / 4 진행`}>
        <span style={{ width: `${((index + 1) / 4) * 100}%` }} />
      </div>
      <div className="question-copy">
        <h2 data-testid="question-prompt">
          {question.prompt.split("\n").map((line, lineIndex) => <span key={line}>{lineIndex ? <br /> : null}{line}</span>)}
        </h2>
        {question.helper ? <p>{question.helper}</p> : null}
      </div>
      <div className="choice-list" aria-label={question.prompt}>
        {question.choices.map((choice) => {
          const active = selected === choice.value;
          return (
            <button
              data-testid="quiz-option"
              className={`choice-button ${active ? "is-selected" : ""}`}
              type="button"
              aria-pressed={active}
              key={choice.value}
              onClick={() => onSelect(choice.value)}
            >
              <span>{choice.label}</span>
              <span className="choice-indicator" aria-hidden="true">
                {active ? <CheckIcon /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}

async function shareResult(content: ResultContent, setStatus: (value: string) => void) {
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("result", content.title);
  const hashtags = ["#무먹", "#집밥기록", "#제육볶음"];
  const shareData = {
    title: `무먹 집밥 기록 타입: ${content.title}`,
    text: `${content.quote}\n\n${hashtags.join(" ")}`,
    url: shareUrl.toString(),
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setStatus("공유 화면을 열었어요.");
      return;
    }
    await navigator.clipboard.writeText(`${shareData.title}\n${content.quote}\n${hashtags.join(" ")}\n${shareData.url}`);
    setStatus("결과 링크를 복사했어요.");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    setStatus("공유 링크를 복사하지 못했어요.");
  }
}

function setShareMeta(property: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.append(meta);
  }
  meta.content = content;
}

function ResultScreen({ flow, type, onExperience }: { flow: FlowControls; type: ResultType; onExperience: () => void }) {
  const result = results[type];
  const [shareStatus, setShareStatus] = useState("");
  const [titleLead, ...titleAccent] = result.title.split(" ");
  useEffect(() => {
    document.title = `${result.title} | 무먹 집밥 기록 테스트`;
    setShareMeta("og:title", `나의 집밥 기록 타입은 ${result.title}`);
    setShareMeta("og:description", result.quote.replace("\n", " "));
    setShareMeta("og:image", new URL("/assets/funnel/share/og-share.png", window.location.origin).toString());
  }, [result]);
  return (
    <ScreenFrame className="result-screen" testId="screen-result" dataAttributes={{ "data-result-type": type }}>
      <BackButton
        flow={flow}
        label="마지막 질문으로 돌아가기"
        fallback={() => window.location.assign(window.location.pathname)}
      />
      <p className="result-kicker">당신의 집밥 기록 타입은…</p>
      <h1>
        <span>{titleLead}</span>
        {titleAccent.length ? <> <em>{titleAccent.join(" ")}</em></> : null}
      </h1>
      <div className="result-character-stage">
        <div className="result-celebration" data-testid="result-celebration" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <StarFilledIcon key={index} />)}
        </div>
        <img data-testid="result-character" className="result-character" src={result.asset} alt={`${result.title} 캐릭터`} />
      </div>
      <QuoteIcon className="result-quote-icon" data-testid="result-quote-icon" aria-hidden="true" />
      <blockquote data-testid="result-quote-lines">
        {result.quote.split("\n").map((line) => <span key={line}>{line}</span>)}
      </blockquote>
      {result.checks ? (
        <div className="result-checks">
          {result.checks.map((check) => (
            <span key={check}>
              <CheckCircledIcon />
              {check}
            </span>
          ))}
        </div>
      ) : null}
      <p className="result-description" data-testid="result-description">
        {result.description.split("\n").map((line) => <span key={line}>{line}</span>)}
      </p>
      <div className="conversion-block">
        <p>그런데 집밥 기록이</p>
        <h2 data-testid="conversion-headline">20초 만에 끝난다면?</h2>
        <span>직접 한 번 기록해보세요.</span>
      </div>
      <button className="primary-button" type="button" onClick={onExperience}>
        무먹으로 20초 체험하기 <ArrowRightIcon />
      </button>
      <button className="share-button" type="button" onClick={() => void shareResult(result, setShareStatus)}>
        <Share2Icon /> 내 결과 공유하기
      </button>
      {shareStatus ? <p className="share-status" role="status">{shareStatus}</p> : null}
    </ScreenFrame>
  );
}

function DemoHeader({ flow, step, label }: { flow: FlowControls; step: number; label: string }) {
  return (
    <>
      <div className="demo-topbar">
        <BackButton flow={flow} />
        <span>
          체험 {step} / 5 · {label}
        </span>
      </div>
      <div className="segmented-progress" aria-label={`체험 ${step} / 5`}>
        {[1, 2, 3, 4, 5].map((item) => (
          <span className={item <= step ? "is-active" : ""} key={item} />
        ))}
      </div>
    </>
  );
}

function DemoOne({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const start = () => {
    if (status !== "idle") return;
    setStatus("loading");
    scheduleAdvance(prefersReducedMotion, () => {
      setStatus("done");
      scheduleAdvance(prefersReducedMotion, onNext, 900);
    }, 520);
  };

  return (
    <ScreenFrame className="demo-screen" testId="screen-demo-1">
      <DemoHeader flow={flow} step={1} label="레시피 가져오기" />
      <div className="demo-title">
        <h1>
          유튜브 레시피를
          <br />
          <span>가져올게요.</span>
        </h1>
      </div>
      <div className={`recipe-card ${status !== "idle" ? "is-importing" : ""}`}>
        <div className="recipe-media">
          <img
            data-testid="recipe-thumbnail"
            className="recipe-thumbnail"
            src="/assets/funnel/food/recipe-jeyuk-thumbnail.png"
            alt="유튜브 제육볶음 레시피 썸네일"
          />
          <span className="youtube-play" data-testid="youtube-play-icon" aria-hidden="true">
            <PlayIcon />
          </span>
          {status === "loading" ? <div className="recipe-loading" role="status"><ReloadIcon /><span>레시피를 가져오는 중…</span></div> : null}
        </div>
        <h2 className="recipe-name">제육볶음에 공식이 있다고?</h2>
        <p className="recipe-channel" data-testid="recipe-channel">YouTube · 셰프호윤 · 조회수 62.8만회</p>
      </div>
      {status === "done" ? (
        <div className="success-banner" role="status" data-testid="recipe-success">
          <CheckCircledIcon /><span>레시피를 가져왔어요</span><span className="success-sparkle" aria-hidden="true">✨</span>
        </div>
      ) : null}
      <button className="primary-button screen-bottom-button" type="button" onClick={start} disabled={status !== "idle"}>
        {status === "loading" ? "가져오는 중…" : "무먹으로 가져오기"}
      </button>
    </ScreenFrame>
  );
}

function DemoTwo({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [noteVisible, setNoteVisible] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setNoteVisible(true), prefersReducedMotion ? 0 : 380);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  const confirmWeight = () => {
    if (adjusted || transitioning) return;
    setTransitioning(true);
    scheduleAdvance(prefersReducedMotion, () => {
      setAdjusted(true);
      setTransitioning(false);
    }, 420);
  };

  return (
    <ScreenFrame className="demo-screen" testId="screen-demo-2">
      <DemoHeader flow={flow} step={2} label="재료 확인" />
      <div className="demo-title">
        <h1>
          영상 속 레시피를
          <br />
          <span>자동으로 정리</span>했어요.
        </h1>
      </div>
      <div className="ingredient-list">
        {ingredients.map(([name, amount], index) => (
          <div key={name}>
            <span className="ingredient-emoji" data-testid="ingredient-emoji" aria-hidden="true">{["🥩", "🧅", "🌿", "🌶️", "🥣", "🧂"][index]}</span>
            <span>{name}</span>
            <strong data-testid={name === "돼지고기" ? "pork-amount" : undefined} className={name === "돼지고기" && adjusted ? "amount-updated" : ""}>{name === "돼지고기" && adjusted ? "520g" : amount}</strong>
          </div>
        ))}
      </div>
      <div className={`adjustment-card ${noteVisible ? "is-visible" : ""} ${adjusted ? "is-completed" : ""}`} aria-hidden={!noteVisible || adjusted}>
        <span>오늘은 돼지고기를 조금 덜 넣었어요.</span>
        {!adjusted ? (
          <button className="change-weight-button" type="button" aria-label="돼지고기 양을 520g으로 바꾸기" onClick={confirmWeight} disabled={transitioning}>
            <strong>600g → 520g</strong>
          </button>
        ) : null}
      </div>
      <button className="primary-button screen-bottom-button" type="button" onClick={onNext} disabled={!adjusted}>
        다음
        <ArrowRightIcon />
      </button>
    </ScreenFrame>
  );
}

function DemoThree({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [confirmed, setConfirmed] = useState(false);
  const confirm = () => {
    if (confirmed) return;
    setConfirmed(true);
    scheduleAdvance(prefersReducedMotion, onNext, 950);
  };
  return (
    <ScreenFrame className="demo-screen demo-weight-screen" testId="screen-demo-3">
      <DemoHeader flow={flow} step={3} label="완성 무게" />
      <div className="demo-title">
        <h1>요리가 완성됐어요.</h1>
      </div>
      <p className="metric-label">예상 완성 무게</p>
      <strong className="hero-metric">{confirmed ? "1,180g" : "1,200g"}</strong>
      <p className="metric-helper" data-testid="metric-helper">조리하면서 줄어드는 무게를<br />고려한 예상값이에요.</p>
      <img className="empty-scale" src="/assets/funnel/food/empty-kitchen-scale.png" alt="빈 디지털 주방저울" />
      {confirmed ? (
        <div className="inline-feedback inline-feedback--plain" role="status">
          <CheckCircledIcon /> 수분이 날아간 만큼까지 반영했어요.
        </div>
      ) : null}
      <button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={confirm} disabled={confirmed}>
        {confirmed ? "반영 완료" : "저울로 재보니 1,180g"}
      </button>
    </ScreenFrame>
  );
}

function DemoFour({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  return (
    <ScreenFrame className="demo-screen portion-screen" testId="screen-demo-4">
      <DemoHeader flow={flow} step={4} label="먹은 양" />
      <div className="demo-title">
        <h1>1,180g 중 얼마나 드셨나요?</h1>
      </div>
      <div className="portion-visual">
        <img data-testid="portion-image" className="portion-image" src="/assets/funnel/food/jeyuk-on-scale.png" alt="흰 접시의 제육볶음이 올라간 디지털 주방저울" />
        <output className="scale-display" data-testid="scale-display" aria-label="저울 표시 320g">320g</output>
      </div>
      <button className="primary-button screen-bottom-button strong-action-button" type="button" onClick={onNext}>
        320g 입력하기
      </button>
    </ScreenFrame>
  );
}

function DemoFive({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const calories = useCountUp(487, true);
  const carbs = useCountUp(31, true);
  const protein = useCountUp(39, true);
  const fat = useCountUp(22, true);
  return (
    <ScreenFrame className="demo-screen nutrition-screen" testId="screen-demo-5">
      <DemoHeader flow={flow} step={5} label="영양 계산 완료" />
      <div className="demo-title demo-title--nutrition">
        <div className="nutrition-confetti" data-testid="nutrition-confetti" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <StarFilledIcon key={index} />)}
        </div>
        <h1>계산 완료!</h1>
        <p>오늘 먹은 제육볶음</p>
      </div>
      <strong className="nutrition-calories">
        <span>{calories}</span>{" "}
        <small>kcal</small>
      </strong>
      <div className="macro-grid">
        <div className="macro-card macro-card--carb">
          <span>탄수화물</span>
          <img className="macro-image" data-testid="macro-image" src="/assets/funnel/food/macro-carb-wheat.png" alt="황금빛 밀 이삭" />
          <strong>{carbs}g</strong>
        </div>
        <div className="macro-card macro-card--protein">
          <span>단백질</span>
          <img className="macro-image" data-testid="macro-image" src="/assets/funnel/food/macro-protein-arm.png" alt="힘을 준 팔" />
          <strong>{protein}g</strong>
        </div>
        <div className="macro-card macro-card--fat">
          <span>지방</span>
          <img className="macro-image" data-testid="macro-image" src="/assets/funnel/food/macro-fat-drop.png" alt="황금빛 기름 방울" />
          <strong>{fat}g</strong>
        </div>
      </div>
      <button className="primary-button screen-bottom-button" type="button" onClick={onNext}>
        식단에 기록하기 <ArrowRightIcon />
      </button>
    </ScreenFrame>
  );
}

function getWeekDays(reference: Date) {
  const monday = new Date(reference);
  const day = reference.getDay() || 7;
  monday.setDate(reference.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);
    return current;
  });
}

function WeekStrip() {
  const today = getKoreanToday();
  const days = getWeekDays(today);
  return (
    <div className="week-strip" aria-label="이번 주 식단">
      {days.map((day) => {
        const isToday = day.toDateString() === today.toDateString();
        const weekdayIndex = day.getDay() === 0 ? 6 : day.getDay() - 1;
        return (
          <span className={isToday ? "is-today" : ""} key={day.toISOString()}>
            <small>{["월", "화", "수", "목", "금", "토", "일"][weekdayIndex]}</small>
            <strong>{day.getDate()}</strong>
          </span>
        );
      })}
    </div>
  );
}

function PlannerSummary({ calories, carbs, protein, fat }: { calories: number; carbs: number; protein: number; fat: number }) {
  return (
    <div className="planner-summary">
      <div>
        <span>칼로리</span>
        <strong>{calories.toLocaleString("ko-KR")} kcal</strong>
      </div>
      <div>
        <span>탄수화물</span>
        <strong>{carbs.toLocaleString("ko-KR")}g</strong>
      </div>
      <div>
        <span>단백질</span>
        <strong>{protein.toLocaleString("ko-KR")}g</strong>
      </div>
      <div>
        <span>지방</span>
        <strong>{fat.toLocaleString("ko-KR")}g</strong>
      </div>
    </div>
  );
}

function PlannerWeekHeader() {
  const days = getWeekDays(getKoreanToday());
  const start = days[0];
  const end = days[6];
  return (
    <div className="planner-week-header">
      <button className="week-nav-button" type="button" aria-label="이전 주">
        <ChevronLeftIcon />
      </button>
      <p>
        이번 주 {formatKoreanDate(start, { includeYear: false, includeWeekday: false })} - {formatKoreanDate(end, { includeYear: false, includeWeekday: false })}
      </p>
      <button className="week-nav-button" type="button" aria-label="다음 주">
        <ArrowRightIcon />
      </button>
    </div>
  );
}

type PlannerFood = { name: string; detail: string; image: string; product?: boolean };

function PlannerMealRow({ label, foods, animateLast = false, highlight, testId }: { label: string; foods: PlannerFood[]; animateLast?: boolean; highlight?: "meal" | "product"; testId?: string }) {
  return (
    <div className={`meal-row ${highlight ? `is-highlighted is-highlighted--${highlight}` : ""}`} data-testid={testId} data-highlight={highlight}>
      <span className="meal-row-label">{label}</span>
      <div className="meal-foods">
        {foods.map((food, index) => (
          <div className={`meal-food ${animateLast && index === foods.length - 1 ? "is-entering" : ""}`} key={food.name}>
            <img className={food.product ? "product-thumb" : ""} src={food.image} alt="" />
            <div><strong>{food.name}</strong><span>{food.detail}</span></div>
          </div>
        ))}
      </div>
      <button className="meal-add-button" type="button" aria-label={`${label} 음식 추가`}>+</button>
    </div>
  );
}

const breakfastFood: PlannerFood = { name: "그릭요거트 볼", detail: "420 kcal · 단백질 22g", image: "/assets/funnel/food/greek-yogurt-bowl.png" };
const lunchFood: PlannerFood = { name: "닭가슴살 현미밥", detail: "700 kcal · 단백질 50g", image: "/assets/funnel/food/chicken-brown-rice-bowl.png" };
const homecookFood: PlannerFood = { name: "제육볶음 320g", detail: "487 kcal · 단백질 39g", image: "/assets/funnel/food/recipe-jeyuk-thumbnail.png" };
const drinkFood: PlannerFood = { name: "더:단백 드링크 초코", detail: "105 kcal · 단백질 20g", image: "/assets/funnel/products/the-protein-choco.png", product: true };

function TomorrowPreview() {
  const tomorrow = getKoreanToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    <section className="next-day-preview" data-testid="next-day-preview">
      <header>
        <strong>내일 · {formatKoreanDate(tomorrow, { includeYear: false })}</strong>
        <span>0 / 3</span>
      </header>
      <div className="next-day-meals">
        {["아침", "점심", "저녁"].map((label) => (
          <div key={label}>
            <span>{label}</span>
            <button className="meal-add-button" type="button" aria-label={`내일 ${label} 추가`}>+</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlannerHomecook({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);
  const [metricsReady, setMetricsReady] = useState(false);
  const today = getKoreanToday();
  const todayLabel = formatKoreanDate(today, { includeYear: false });

  useEffect(() => {
    const mealTimer = window.setTimeout(() => setEntered(true), prefersReducedMotion ? 0 : 950);
    const metricsTimer = window.setTimeout(() => setMetricsReady(true), prefersReducedMotion ? 0 : 2350);
    return () => { window.clearTimeout(mealTimer); window.clearTimeout(metricsTimer); };
  }, [prefersReducedMotion]);

  const calories = useCountUp(1607, metricsReady, 1250, 1120);
  const carbs = useCountUp(177, metricsReady, 1250, 146);
  const protein = useCountUp(111, metricsReady, 1250, 72);
  const fat = useCountUp(60, metricsReady, 1250, 38);

  return (
    <ScreenFrame className="planner-screen" testId="screen-planner-homecook" dataAttributes={{ "data-meal-entered": entered ? "true" : "false" }}>
      <div className="planner-topline">
        <BackButton flow={flow} />
        <div className="planner-heading">
          <CalendarIcon />
          <h1>이번 주 식단</h1>
        </div>
      </div>
      <PlannerSummary calories={calories} carbs={carbs} protein={protein} fat={fat} />
      <PlannerWeekHeader />
      <WeekStrip />
      <section className="meal-day-card">
        <header>
          <strong>오늘 · {todayLabel}</strong>
          <span>{entered ? "3 / 3" : "2 / 3"}</span>
        </header>
        <PlannerMealRow label="아침" foods={[breakfastFood]} />
        <PlannerMealRow label="점심" foods={[lunchFood]} />
        <PlannerMealRow label="저녁" foods={entered ? [homecookFood] : []} animateLast={entered} highlight={entered ? "meal" : undefined} testId="dinner-foods" />
      </section>
      <div className="planner-footer-stack">
        <TomorrowPreview />
        <button className="primary-button planner-floating-cta strong-action-button" type="button" onClick={onNext}>
          편의점 음식도 기록해보기 <ArrowRightIcon />
        </button>
      </div>
    </ScreenFrame>
  );
}

function PackagedFood({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  return (
    <ScreenFrame className="packaged-screen" testId="screen-packaged-food">
      <BackButton flow={flow} />
      <div className="demo-title">
        <h1>
          그리고
          <br />
          <span>편의점 음식</span>은
          <br />
          더 간단해요.
        </h1>
      </div>
      <div className="product-card" data-testid="product-card">
        <span className="example-badge">제품 예시</span>
        <span className="product-sparkle product-sparkle--left" aria-hidden="true">✨</span>
        <span className="product-sparkle product-sparkle--right" aria-hidden="true">✨</span>
        <img src="/assets/funnel/products/the-protein-choco.png" alt="더:단백 드링크 초코 제품" />
        <div>
          <h2>더:단백 드링크 초코</h2>
          <p>250ml</p>
          <div className="product-stat"><span aria-hidden="true">🔥</span><strong>105 kcal</strong></div>
          <div className="product-stat"><span aria-hidden="true">💪</span><strong>단백질 20g</strong></div>
        </div>
      </div>
      <button className="primary-button screen-bottom-button strong-action-button" type="button" aria-label="더:단백 드링크 초코 + 기록하기" onClick={onNext}>
        <PlusIcon /> 기록하기
      </button>
    </ScreenFrame>
  );
}

function PlannerComplete({ flow, onNext }: { flow: FlowControls; onNext: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [drinkEntered, setDrinkEntered] = useState(false);
  const [metricsReady, setMetricsReady] = useState(false);

  useEffect(() => {
    const drinkTimer = window.setTimeout(() => setDrinkEntered(true), prefersReducedMotion ? 0 : 950);
    const metricsTimer = window.setTimeout(() => setMetricsReady(true), prefersReducedMotion ? 0 : 2200);
    return () => {
      window.clearTimeout(drinkTimer);
      window.clearTimeout(metricsTimer);
    };
  }, [prefersReducedMotion]);

  const calories = useCountUp(1712, metricsReady, 1150, 1607);
  const carbs = useCountUp(184, metricsReady, 1150, 177);
  const protein = useCountUp(131, metricsReady, 1150, 111);
  const fat = useCountUp(61, metricsReady, 1150, 60);

  return (
    <ScreenFrame className="planner-screen" testId="screen-planner-complete" dataAttributes={{ "data-product-entered": drinkEntered ? "true" : "false" }}>
      <div className="planner-topline">
        <BackButton flow={flow} />
        <div className="planner-heading"><CalendarIcon /><h1>이번 주 식단</h1></div>
      </div>
      <PlannerSummary calories={calories} carbs={carbs} protein={protein} fat={fat} />
      <PlannerWeekHeader />
      <WeekStrip />
      <section className="meal-day-card">
        <header>
          <strong>오늘 · {formatKoreanDate(getKoreanToday(), { includeYear: false })}</strong>
          <span>3 / 3</span>
        </header>
        <PlannerMealRow label="아침" foods={[breakfastFood]} />
        <PlannerMealRow label="점심" foods={[lunchFood]} />
        <PlannerMealRow label="저녁" foods={drinkEntered ? [homecookFood, drinkFood] : [homecookFood]} animateLast={drinkEntered} highlight={drinkEntered ? "product" : undefined} testId="dinner-foods" />
      </section>
      <div className="planner-footer-stack">
        <TomorrowPreview />
        <button className="primary-button planner-floating-cta strong-action-button" type="button" onClick={onNext}>
          무료 베타 먼저 써보기 <ArrowRightIcon />
        </button>
      </div>
    </ScreenFrame>
  );
}

function BetaScreen({ flow, onSuccess }: { flow: FlowControls; onSuccess: () => void }) {
  const keyboard = useKeyboard();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim()) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("이메일 형식을 확인해주세요.");
      return;
    }
    if (!consent) {
      setError("이메일 수집·이용 동의가 필요해요.");
      return;
    }
    setError("");
    setSubmitting(true);
    keyboard.hide();
    scheduleAdvance(prefersReducedMotion, onSuccess, 500);
  };

  return (
    <ScreenFrame className="beta-screen" testId="screen-beta">
      <BackButton flow={flow} />
      <div className="beta-invitation">
        <img className="beta-character" data-testid="beta-character" src="/assets/funnel/characters/beta-invitation-mascot.png" alt="파란 초대장을 든 무먹 소금병 캐릭터" />
        <div className="beta-copy">
          <img className="beta-brand-wordmark" src="/assets/funnel/brand/mumeok-logo-horizontal.png" alt="무먹 무엇을 먹든" />
          <p><strong>직접 써보고 싶나요?</strong> 이메일을 남기면 베타가 준비되는 대로 가장 먼저 초대해드릴게요.</p>
        </div>
      </div>
      <form className="email-form" onSubmit={submit} noValidate>
        <label htmlFor="beta-email">이메일</label>
        <div className="email-input-wrap">
          <EnvelopeClosedIcon aria-hidden="true" />
          <KeyboardInput
            id="beta-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="email@example.com"
            value={email}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "email-error" : "privacy-details"}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => setError("")}
          />
        </div>
        <div className="consent-block" data-testid="consent-block">
          <label className="consent-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>베타 초대용 이메일 수집·이용에 동의합니다. <strong>(필수)</strong></span>
          </label>
          <p className="privacy-details" id="privacy-details"><LockClosedIcon /> 수집: 이메일 · 목적: 베타 초대 · 보유: 베타 초대 종료 시까지</p>
        </div>
        {error ? (
          <p className="form-error" id="email-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? "신청 중…" : "무료 베타 초대받기"}
        </button>
      </form>
    </ScreenFrame>
  );
}

function SuccessScreen({ flow, onReset }: { flow: FlowControls; onReset: () => void }) {
  return (
    <ScreenFrame className="success-screen" testId="screen-success">
      <BackButton flow={flow} />
      <div className="success-character-wrap">
        <img data-testid="success-character" className="success-character" src="/assets/funnel/characters/beta-success-mascot.png" alt="파란 하트와 함께 반기는 무먹 소금병 캐릭터" />
      </div>
      <h1>신청이 완료됐어요!</h1>
      <p>
        베타가 준비되면
        <br />
        이메일로 알려드릴게요.
      </p>
      <button className="secondary-button screen-bottom-button" type="button" onClick={onReset}>
        처음으로 돌아가기
      </button>
    </ScreenFrame>
  );
}

export default function Prototype() {
  const [, setAnswers] = useState<Answers>({});
  const [flowVersion, setFlowVersion] = useState(0);
  const answersRef = useRef<Answers>({});
  const transitionLocked = useRef(false);
  const [variant] = useState<HeroVariant>(() => readHeroVariant());
  const [sharedResult] = useState<ResultType | null>(() => readSharedResult());
  const prefersReducedMotion = usePrefersReducedMotion();

  const setAnswer = (id: QuestionId, value: string) => {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
  };

  function heroScreen(): FlowScreen {
    return { id: "hero", render: (flow) => <HeroScreen variant={variant} onStart={() => flow.push(questionScreen(0))} /> };
  }

  function questionScreen(index: number): FlowScreen {
    const question = questions[index];
    return {
      id: `question-${index + 1}`,
      render: (flow) => (
        <QuizScreen
          flow={flow}
          index={index}
          selected={answersRef.current[question.id]}
          onSelect={(value) => {
            if (transitionLocked.current) return;
            transitionLocked.current = true;
            setAnswer(question.id, value);
            scheduleAdvance(prefersReducedMotion, () => {
              transitionLocked.current = false;
              if (index < questions.length - 1) flow.push(questionScreen(index + 1));
              else flow.push(resultScreen());
            }, 300);
          }}
        />
      ),
    };
  }

  function resultScreen(forcedType?: ResultType): FlowScreen {
    const type = forcedType ?? deriveResult(answersRef.current.q3);
    return { id: "result", render: (flow) => <ResultScreen flow={flow} type={type} onExperience={() => flow.push(demoOneScreen())} /> };
  }

  function demoOneScreen(): FlowScreen {
    return { id: "demo-1", render: (flow) => <DemoOne flow={flow} onNext={() => flow.push(demoTwoScreen())} /> };
  }
  function demoTwoScreen(): FlowScreen {
    return { id: "demo-2", render: (flow) => <DemoTwo flow={flow} onNext={() => flow.push(demoThreeScreen())} /> };
  }
  function demoThreeScreen(): FlowScreen {
    return { id: "demo-3", render: (flow) => <DemoThree flow={flow} onNext={() => flow.push(demoFourScreen())} /> };
  }
  function demoFourScreen(): FlowScreen {
    return { id: "demo-4", render: (flow) => <DemoFour flow={flow} onNext={() => flow.push(demoFiveScreen())} /> };
  }
  function demoFiveScreen(): FlowScreen {
    return { id: "demo-5", render: (flow) => <DemoFive flow={flow} onNext={() => flow.push(plannerHomecookScreen())} /> };
  }
  function plannerHomecookScreen(): FlowScreen {
    return { id: "planner-homecook", render: (flow) => <PlannerHomecook flow={flow} onNext={() => flow.push(packagedFoodScreen())} /> };
  }
  function packagedFoodScreen(): FlowScreen {
    return { id: "packaged-food", render: (flow) => <PackagedFood flow={flow} onNext={() => flow.push(plannerCompleteScreen())} /> };
  }
  function plannerCompleteScreen(): FlowScreen {
    return { id: "planner-complete", render: (flow) => <PlannerComplete flow={flow} onNext={() => flow.push(betaScreen())} /> };
  }
  function betaScreen(): FlowScreen {
    return { id: "beta", render: (flow) => <BetaScreen flow={flow} onSuccess={() => flow.push(successScreen())} /> };
  }
  function successScreen(): FlowScreen {
    return {
      id: "success",
      render: (flow) => <SuccessScreen flow={flow} onReset={() => {
        answersRef.current = {};
        setAnswers({});
        setFlowVersion((current) => current + 1);
      }} />,
    };
  }

  return <FlowStack key={flowVersion} initial={sharedResult ? resultScreen(sharedResult) : heroScreen()} />;
}
