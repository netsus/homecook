"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  WebButton,
  WebCard,
  WebCardBody,
  WebEmptyState,
  WebErrorState,
  WebShell,
} from "@/components/web";
import { postMarketingValidation } from "@/lib/api/marketing-validation";
import {
  buildQuizOutcome,
  FOLLOWUP_INTENT_OPTIONS,
  FOLLOWUP_PRIORITY_OPTIONS,
  MARKETING_INTENT_CHOICES,
  QUIZ_Q1_OPTIONS,
  QUIZ_Q2_OPTIONS,
  QUIZ_Q3_OPTIONS,
  QUIZ_Q4_OPTIONS,
  QUIZ_Q5_OPTIONS,
} from "@/lib/marketing/demand-validation";
import {
  enqueueMarketingQueueAction,
  flushMarketingQueue,
  isMarketingQueueActionCoveredByServerState,
  readMarketingClientSnapshot,
  reconcileMarketingQueueWithServerState,
  type MarketingValidationClientSnapshot,
  type MarketingValidationQueueAction,
  submitLeadWithPendingFlush,
  type MarketingValidationUiStage,
  writeMarketingClientSnapshot,
} from "@/lib/marketing/marketing-validation-client-session";
import type {
  MarketingValidationAction,
  MarketingValidationIntentChoice,
  MarketingValidationPlannerIntent,
  MarketingValidationPlannerPriority,
  MarketingValidationQuizAnswers,
  MarketingValidationQuizResult,
  MarketingValidationRequestBody,
} from "@/types/marketing-validation";
import proofImage from "@/ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png";

const styles = {
  body: "marketing-beta-body",
  checkbox: "marketing-beta-checkbox",
  checkboxLabel: "marketing-beta-checkbox-label",
  checkboxRow: "marketing-beta-checkbox-row",
  choice: "marketing-beta-choice",
  choiceActive: "marketing-beta-choice-active",
  choiceControl: "marketing-beta-choice-control",
  choiceList: "marketing-beta-choice-list",
  choiceRow: "marketing-beta-choice-row",
  choiceText: "marketing-beta-choice-text",
  conceptLine: "marketing-beta-concept-line",
  doneCard: "marketing-beta-done",
  emailActions: "marketing-beta-email-actions",
  equalButtons: "marketing-beta-equal-buttons",
  fieldGroup: "marketing-beta-field-group",
  ghostButton: "marketing-beta-ghost-button",
  headline: "marketing-beta-headline",
  helper: "marketing-beta-helper",
  heroActions: "marketing-beta-hero-actions",
  heroCard: "marketing-beta-hero",
  heroCopy: "marketing-beta-hero-copy",
  heroGrid: "marketing-beta-hero-grid",
  heroHeader: "marketing-beta-hero-header",
  heroMeta: "marketing-beta-hero-meta",
  input: "marketing-beta-input",
  kicker: "marketing-beta-kicker",
  label: "marketing-beta-label",
  nextButton: "marketing-beta-next-button",
  page: "marketing-beta-page",
  panel: "marketing-beta-panel",
  panelBody: "marketing-beta-panel-body",
  panelEyebrow: "marketing-beta-panel-eyebrow",
  panelHeader: "marketing-beta-panel-header",
  panelTitle: "marketing-beta-panel-title",
  primaryButton: "marketing-beta-primary-button",
  privacyLink: "marketing-beta-privacy-link",
  progressPill: "marketing-beta-progress-pill",
  proofFrame: "marketing-beta-proof-frame",
  proofFrameSmall: "marketing-beta-proof-frame-small",
  proofImage: "marketing-beta-proof-image",
  proofLabel: "marketing-beta-proof-label",
  proofRail: "marketing-beta-proof-rail",
  quizActions: "marketing-beta-quiz-actions",
  quizHeader: "marketing-beta-quiz-header",
  resultAccent: "marketing-beta-result-accent",
  root: "marketing-beta-root",
  secondaryButton: "marketing-beta-secondary-button",
  stack: "marketing-beta-stack",
  statusAlert: "marketing-beta-status-alert",
  statusCard: "marketing-beta-status-card",
  statusLive: "marketing-beta-status-live",
  statusText: "marketing-beta-status-text",
  keepAll: "marketing-beta-keep-all",
  wordmark: "marketing-beta-wordmark",
  followupActions: "marketing-beta-followup-actions",
  followupFieldset: "marketing-beta-followup-fieldset",
  followupLegend: "marketing-beta-followup-legend",
  followupQuestions: "marketing-beta-followup-questions",
  followupScrollCue: "marketing-beta-followup-scroll-cue",
  followupScrollShell: "marketing-beta-followup-scroll-shell",
  stageHeading: "marketing-beta-stage-heading",
  stageSection: "marketing-beta-stage-section",
} as const;

type AsyncState = "idle" | "loading" | "error" | "ready";
type FocusableMarketingStage = Exclude<MarketingValidationUiStage, "hero">;

interface TurnstileSuccess {
  ok: true;
  token: string;
}

interface TurnstileFailure {
  ok: false;
  message: string;
}

type TurnstileResult = TurnstileSuccess | TurnstileFailure;

const QA_TURNSTILE_TOKEN_KEY = "homecook.marketing-beta.turnstile-token";

interface MarketingDemandValidationScreenProps {
  getTurnstileToken?: () => Promise<TurnstileResult>;
}

const QUESTION_DEFINITIONS = [
  {
    key: "q1",
    options: QUIZ_Q1_OPTIONS,
    title: "최근 4주 동안 칼로리나 탄단지 기록은 어땠나요?",
  },
  {
    key: "q2",
    options: QUIZ_Q2_OPTIONS,
    title: "지난 7일 동안 집밥을 먹은 날은 며칠인가요?",
  },
  {
    key: "q3",
    options: QUIZ_Q3_OPTIONS,
    title: "직접 만든 음식을 기록할 때 보통 어떻게 하나요?",
  },
  {
    key: "q4",
    options: QUIZ_Q4_OPTIONS,
    title: "가장 불편한 순간은 무엇인가요?",
  },
  {
    key: "q5",
    options: QUIZ_Q5_OPTIONS,
    title: "어떤 수준이라면 실제로 써보고 싶나요?",
  },
] as const satisfies ReadonlyArray<{
  key: keyof MarketingValidationQuizAnswers;
  options: readonly string[];
  title: string;
}>;

const RESULT_COPY: Record<
  MarketingValidationQuizResult,
  { body: string; eyebrow: string; title: string }
> = {
  ingredient_reentry: {
    body: "집밥을 기록할 때마다 같은 재료를 다시 찾느라 흐름이 끊깁니다.",
    eyebrow: "기록 흐름",
    title: "재료 재입력형",
  },
  rough_match: {
    body: "대략 맞추는 기록은 되지만, 하루와 주간 흐름은 자주 비어 있습니다.",
    eyebrow: "기록 습관",
    title: "대충 기록형",
  },
  satisfied_control: {
    body: "지금 방식이 크게 불편하지 않은 편이에요. 이 응답도 제품 우선순위를 정하는 데 중요합니다.",
    eyebrow: "대조군 응답",
    title: "지금 방식도 괜찮은 편",
  },
  split_tracking: {
    body: "레시피와 완제품을 따로 기록하는 순간, 영양 흐름이 두 갈래로 나뉩니다.",
    eyebrow: "핵심 불편",
    title: "식단 분리형",
  },
  weekly_blindspot: {
    body: "기록은 하고 있지만 하루 합계와 이번 주 패턴을 다시 계산해야 해서 흐름을 놓치고 있어요.",
    eyebrow: "주간 흐름",
    title: "주간 흐름 실종형",
  },
};

const FOLLOWUP_INTENT_LABELS: Record<MarketingValidationPlannerIntent, string> = {
  definitely: "꼭 써보고 싶음",
  maybe: "상황에 따라 써볼 것 같음",
  not_needed: "필요하지 않음",
};

const FOLLOWUP_PRIORITY_LABELS: Record<MarketingValidationPlannerPriority, string> = {
  daily_macros: "날짜별 kcal·탄·단·지",
  meal_table: "아침·점심·저녁·간식 표",
  not_interested: "관심 없음",
  plan_record_switch: "요리 계획과 식단 기록 전환",
  weekly_average: "주간 평균",
};

const STAGE_ORDER: readonly MarketingValidationUiStage[] = [
  "hero",
  "quiz",
  "result",
  "intent",
  "email",
  "followup",
  "done",
];

function stageIndex(stage: MarketingValidationUiStage) {
  return STAGE_ORDER.indexOf(stage);
}

function mapServerStateToStage(
  state: MarketingValidationAction,
  snapshot: MarketingValidationClientSnapshot | null,
): MarketingValidationUiStage {
  switch (state) {
    case "view":
      return "hero";
    case "quiz_started":
      return "quiz";
    case "quiz_completed":
      return snapshot?.quizResult ? "result" : "quiz";
    case "solution_viewed":
      return "intent";
    case "intent_selected":
      return snapshot?.intentChoice === "enough" ? "done" : "email";
    case "lead_submitted":
      return "followup";
    case "followup_submitted":
      return "done";
  }
}

function pickRestoredStage(
  serverState: MarketingValidationAction,
  snapshot: MarketingValidationClientSnapshot | null,
) {
  const fallback = mapServerStateToStage(serverState, snapshot);
  if (!snapshot) return fallback;
  return stageIndex(snapshot.stage) >= stageIndex(fallback)
    ? snapshot.stage
    : fallback;
}

function buildViewRequestBody() {
  const searchParams = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

  return {
    action: "view",
    honeypot: "",
    utm_campaign: searchParams.get("utm_campaign"),
    utm_content: searchParams.get("utm_content"),
    utm_medium: searchParams.get("utm_medium"),
    utm_source: searchParams.get("utm_source"),
    utm_term: searchParams.get("utm_term"),
  } satisfies MarketingValidationRequestBody;
}

async function defaultGetTurnstileToken(): Promise<TurnstileResult> {
  if (process.env.NODE_ENV === "test") {
    return {
      ok: true,
      token: "turnstile-test-token",
    };
  }

  if (
    typeof window !== "undefined"
    && process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES === "1"
  ) {
    const token = window.sessionStorage.getItem(QA_TURNSTILE_TOKEN_KEY)
      ?? window.localStorage.getItem(QA_TURNSTILE_TOKEN_KEY);
    if (token?.trim()) {
      return {
        ok: true,
        token,
      };
    }
  }

  return {
    ok: false,
    message: "베타 신청은 아직 열리지 않았어요.",
  };
}

function hasResultData(
  stage: MarketingValidationUiStage,
  quizResult: MarketingValidationQuizResult | null,
) {
  return stageIndex(stage) >= stageIndex("result") && Boolean(quizResult);
}

function firstMissingQuestionIndex(
  answers: Partial<MarketingValidationQuizAnswers>,
) {
  const firstMissing = QUESTION_DEFINITIONS.findIndex(
    ({ key }) => !answers[key],
  );
  return firstMissing === -1 ? QUESTION_DEFINITIONS.length - 1 : firstMissing;
}

export function MarketingDemandValidationScreen({
  getTurnstileToken = defaultGetTurnstileToken,
}: MarketingDemandValidationScreenProps) {
  const [loadState, setLoadState] = useState<AsyncState>("loading");
  const [activeStage, setActiveStage] = useState<MarketingValidationUiStage>("hero");
  const [serverState, setServerState] = useState<MarketingValidationAction>("view");
  const [quizAnswers, setQuizAnswers] = useState<Partial<MarketingValidationQuizAnswers>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [quizResult, setQuizResult] = useState<MarketingValidationQuizResult | null>(null);
  const [targetQualified, setTargetQualified] = useState<boolean | null>(null);
  const [intentChoice, setIntentChoice] = useState<MarketingValidationIntentChoice | null>(null);
  const [plannerIntent, setPlannerIntent] = useState<MarketingValidationPlannerIntent | null>(null);
  const [plannerPriority, setPlannerPriority] = useState<MarketingValidationPlannerPriority | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("불러오는 중...");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [restoreGap, setRestoreGap] = useState(false);
  const [followupHasMore, setFollowupHasMore] = useState(true);
  const mountedRef = useRef(false);
  const followupScrollRef = useRef<HTMLDivElement | null>(null);
  const stageHeadingRefs = useRef<Record<FocusableMarketingStage, HTMLHeadingElement | null>>({
    done: null,
    email: null,
    followup: null,
    intent: null,
    quiz: null,
    result: null,
  });
  const stageSectionRefs = useRef<Record<FocusableMarketingStage, HTMLElement | null>>({
    done: null,
    email: null,
    followup: null,
    intent: null,
    quiz: null,
    result: null,
  });

  const currentQuestion = QUESTION_DEFINITIONS[questionIndex];
  const canAdvanceQuiz = Boolean(currentQuestion && quizAnswers[currentQuestion.key]);

  function persistSnapshot(
    patch: Partial<MarketingValidationClientSnapshot>,
  ) {
    const baseStage = patch.stage ?? activeStage;
    const storedSnapshot = readMarketingClientSnapshot();
    const nextSnapshot: MarketingValidationClientSnapshot = {
      ...(storedSnapshot ?? { stage: baseStage }),
      intentChoice: patch.intentChoice ?? intentChoice ?? undefined,
      plannerIntent: patch.plannerIntent ?? plannerIntent ?? undefined,
      plannerPriority: patch.plannerPriority ?? plannerPriority ?? undefined,
      quizAnswers: patch.quizAnswers ?? (Object.keys(quizAnswers).length > 0
        ? quizAnswers as MarketingValidationQuizAnswers
        : undefined),
      quizResult: patch.quizResult ?? quizResult ?? undefined,
      serverState: patch.serverState ?? storedSnapshot?.serverState ?? serverState,
      stage: baseStage,
      targetQualified: patch.targetQualified ?? targetQualified ?? undefined,
    };

    writeMarketingClientSnapshot(nextSnapshot);
  }

  async function sendQueuedAction(
    action: MarketingValidationQueueAction,
  ) {
    const payload = {
      ...action,
      honeypot: "",
      ...(action.action === "followup_submitted"
        ? {
            planner_intent: action.planner_intent ?? null,
            planner_priority: action.planner_priority ?? null,
          }
        : {}),
    } satisfies MarketingValidationRequestBody;

    const response = await postMarketingValidation(payload);
    if (!response.success || !response.data) {
      if (response.error?.code === "INVALID_TRANSITION") {
        const viewResponse = await postMarketingValidation(buildViewRequestBody());
        if (
          viewResponse.success
          && viewResponse.data
          && isMarketingQueueActionCoveredByServerState(
            action,
            viewResponse.data.state,
          )
        ) {
          return {
            ok: true as const,
            state: viewResponse.data.state,
          };
        }
      }
      return { ok: false as const, retryable: true };
    }

    return {
      ok: true as const,
      state: response.data.state,
    };
  }

  async function syncQueuedActions() {
    const result = await flushMarketingQueue(sendQueuedAction);
    if (result.stopped !== "completed") {
      setStatusMessage("연결이 잠시 불안정해요. 진행 내용은 이 브라우저에 잠시 보관해 둘게요.");
      setWarningMessage("연결이 잠시 불안정해요. 진행 내용은 이 브라우저에 잠시 보관해 둘게요.");
      return result;
    }

    setStatusMessage("진행 내용이 저장됐어요.");
    setWarningMessage(null);
    return result;
  }

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const snapshot = readMarketingClientSnapshot();
    if (snapshot) {
      setActiveStage(snapshot.stage);
      setIntentChoice(snapshot.intentChoice ?? null);
      setPlannerIntent(snapshot.plannerIntent ?? null);
      setPlannerPriority(snapshot.plannerPriority ?? null);
      setQuizAnswers(snapshot.quizAnswers ?? {});
      setQuestionIndex(firstMissingQuestionIndex(snapshot.quizAnswers ?? {}));
      setQuizResult(snapshot.quizResult ?? null);
      setTargetQualified(snapshot.targetQualified ?? null);
    }

    void (async () => {
      const response = await postMarketingValidation(buildViewRequestBody());
      if (!response.success || !response.data) {
        setLoadState("error");
        setPageError(response.error?.message ?? "다시 시도해 주세요.");
        setStatusMessage(response.error?.message ?? "다시 시도해 주세요.");
        return;
      }

      const restoredStage = pickRestoredStage(response.data.state, snapshot);
      const missingSnapshotForAdvancedStage =
        stageIndex(restoredStage) >= stageIndex("result")
        && !snapshot?.quizResult
        && response.data.state !== "quiz_started"
        && response.data.state !== "view";

      setServerState(response.data.state);
      reconcileMarketingQueueWithServerState(response.data.state);
      setActiveStage(restoredStage);
      setQuestionIndex(firstMissingQuestionIndex(snapshot?.quizAnswers ?? {}));
      setRestoreGap(missingSnapshotForAdvancedStage);
      setLoadState("ready");
      setStatusMessage("진행 상태를 불러왔어요.");
      persistSnapshot({
        serverState: response.data.state,
        stage: restoredStage,
      });
      void syncQueuedActions();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (loadState !== "ready" || activeStage === "hero" || restoreGap) return;

    const section = stageSectionRefs.current[activeStage];
    const heading = stageHeadingRefs.current[activeStage];
    const prefersReducedMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (activeStage === "followup") {
      followupScrollRef.current?.scrollTo?.({ behavior: "auto", top: 0 });
      setFollowupHasMore(true);
    }
    section?.scrollIntoView?.({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    heading?.focus({ preventScroll: true });
  }, [activeStage, loadState, restoreGap]);

  const resultCopy = quizResult ? RESULT_COPY[quizResult] : null;
  const showQuiz = activeStage === "quiz";
  const showResult = hasResultData(activeStage, quizResult);
  const showIntent = stageIndex(activeStage) >= stageIndex("intent") && !restoreGap;
  const showEmail = intentChoice === "needed" && stageIndex(activeStage) >= stageIndex("email");
  const showFollowup = !restoreGap && stageIndex(activeStage) >= stageIndex("followup");
  const showDone = !restoreGap && stageIndex(activeStage) >= stageIndex("done");

  function updateQuizAnswer(key: keyof MarketingValidationQuizAnswers, value: string) {
    const next = {
      ...quizAnswers,
      [key]: value,
    };
    setQuizAnswers(next);
    persistSnapshot({
      quizAnswers: next as MarketingValidationQuizAnswers,
      stage: "quiz",
    });
  }

  function handleFollowupScroll(event: React.UIEvent<HTMLDivElement>) {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    setFollowupHasMore(scrollTop + clientHeight < scrollHeight - 4);
  }

  async function handleQuizStart() {
    setActiveStage("quiz");
    setQuestionIndex(firstMissingQuestionIndex(quizAnswers));
    persistSnapshot({ stage: "quiz" });
    enqueueMarketingQueueAction({ action: "quiz_started" });
    setStatusMessage("질문을 시작했어요.");
    void syncQueuedActions();
  }

  async function handleQuizAdvance() {
    if (questionIndex < QUESTION_DEFINITIONS.length - 1) {
      setQuestionIndex((current) => current + 1);
      setStatusMessage("다음 질문으로 이동했어요.");
      return;
    }

    const answers = quizAnswers as MarketingValidationQuizAnswers;
    const outcome = buildQuizOutcome(answers);

    setQuizResult(outcome.quiz_result);
    setTargetQualified(outcome.target_qualified);
    setActiveStage("result");
    setStatusMessage("결과를 계산했어요.");
    persistSnapshot({
      quizAnswers: answers,
      quizResult: outcome.quiz_result,
      stage: "result",
      targetQualified: outcome.target_qualified,
    });

    enqueueMarketingQueueAction({
      action: "quiz_completed",
      answers,
    });
    await syncQueuedActions();
  }

  async function handleResultContinue() {
    setActiveStage("intent");
    setStatusMessage("해결 아이디어를 보여드릴게요.");
    persistSnapshot({ stage: "intent" });
    enqueueMarketingQueueAction({ action: "solution_viewed" });
    await syncQueuedActions();
  }

  async function handleIntentChoice(choice: MarketingValidationIntentChoice) {
    setIntentChoice(choice);
    setLeadError(null);
    const nextStage = choice === "needed" ? "email" : "done";
    setActiveStage(nextStage);
    setStatusMessage(
      choice === "needed"
        ? "베타 신청 단계를 준비했어요."
        : "필요하지 않아요 응답도 잘 기록했어요.",
    );
    persistSnapshot({
      intentChoice: choice,
      stage: nextStage,
    });
    enqueueMarketingQueueAction({
      action: "intent_selected",
      intent_choice: choice,
    });
    await syncQueuedActions();
  }

  async function handleLeadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadError(null);
    setBusy(true);

    const turnstile = await getTurnstileToken();
    if (!turnstile.ok) {
      setBusy(false);
      setLeadError(turnstile.message);
      setStatusMessage(turnstile.message);
      return;
    }

    const result = await submitLeadWithPendingFlush(
      {
        consent: true,
        email,
        turnstileToken: turnstile.token,
      },
      {
        sendQueuedAction,
        submitLead: async (lead) => {
          const response = await postMarketingValidation({
            action: "lead_submitted",
            consent: lead.consent,
            email: lead.email,
            honeypot: "",
            turnstile_token: lead.turnstileToken,
          });

          if (!response.success || !response.data) {
            return {
              message: response.error?.message ?? "다시 시도해 주세요.",
              ok: false as const,
              reason: "lead_failed" as const,
            };
          }

          setServerState(response.data.state);
          setActiveStage("followup");
          setStatusMessage("베타 신청을 받았어요.");
          persistSnapshot({
            serverState: response.data.state,
            stage: "followup",
          });
          return { ok: true as const };
        },
      },
    );

    if (!result.ok) {
      const message = result.reason === "pending_queue"
        ? "진행 내용을 먼저 다시 맞추는 중이에요. 잠시 후 다시 시도해 주세요."
        : result.message ?? "다시 시도해 주세요.";
      setLeadError(message);
      setStatusMessage(message);
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  async function handleFollowupSubmit(skip = false) {
    setBusy(true);
    const normalizedIntent = skip ? null : plannerIntent;
    const normalizedPriority = skip ? null : plannerPriority;

    enqueueMarketingQueueAction({
      action: "followup_submitted",
      planner_intent: normalizedIntent,
      planner_priority: normalizedPriority,
    });
    persistSnapshot({
      plannerIntent: normalizedIntent ?? undefined,
      plannerPriority: normalizedPriority ?? undefined,
      stage: "done",
    });
    setPlannerIntent(normalizedIntent);
    setPlannerPriority(normalizedPriority);
    setActiveStage("done");
    setStatusMessage("추가 의견까지 기록했어요.");
    await syncQueuedActions();
    setBusy(false);
  }

  return (
    <WebShell
      className={`${styles.root} marketing-beta-root`}
      footer={false}
      wide
    >
      <main className={`${styles.page} marketing-beta-page`}>
        <div className={styles.stack}>
          <WebCard className={`${styles.heroCard} marketing-beta-hero`}>
            <div className={styles.heroHeader}>
              <span className={styles.wordmark}>무먹</span>
            </div>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>레시피도, 편의점도</p>
                <h1 className={styles.headline}>
                  하루·한 주 영양을 <span className={styles.keepAll}>한눈에</span>
                </h1>
                <p className={styles.body}>
                  레시피와 완제품을 따로 기록하며 놓치던 하루 합계와 주간 평균.
                  30초 테스트로 내 식단 기록이 어디서 끊기는지 확인해보세요.
                </p>
                <div className={styles.heroActions}>
                  <WebButton
                    className={`${styles.primaryButton} marketing-beta-primary-cta`}
                    fullWidth
                    onClick={handleQuizStart}
                  >
                    30초 식단 기록 테스트
                  </WebButton>
                  <div className={styles.heroMeta}>
                    <span>무료 · 로그인 없이 참여</span>
                    <Link className={styles.privacyLink} href="/privacy">
                      개인정보처리방침
                    </Link>
                  </div>
                </div>
              </div>
              <div className={`${styles.proofRail} marketing-beta-proof-rail`}>
                <p className={styles.proofLabel}>개발 중인 주간 식단 화면 콘셉트입니다</p>
                <div className={`${styles.proofFrame} marketing-beta-proof-frame`}>
                  <Image
                    alt="주간 영양 화면 광고 증거"
                    className={styles.proofImage}
                    fetchPriority="high"
                    priority
                    quality={75}
                    sizes="(max-width: 639px) 440px, (max-width: 1023px) 560px, 420px"
                    src={proofImage}
                  />
                </div>
              </div>
            </div>
          </WebCard>

          <div aria-live="polite" className={styles.statusLive}>{statusMessage}</div>

          {loadState === "loading" ? (
            <WebCard className={`${styles.panel} marketing-beta-loading`}>
              <WebCardBody>
                <div className={styles.panelHeader}>
                  <p className={styles.panelEyebrow}>loading</p>
                  <h2 className={styles.panelTitle}>불러오는 중...</h2>
                </div>
              </WebCardBody>
            </WebCard>
          ) : null}

          {warningMessage ? (
            <div className={`${styles.statusCard} ${styles.statusAlert}`} role="alert">
              <p className={styles.statusText}>{warningMessage}</p>
            </div>
          ) : null}

          {loadState === "error" ? (
            <WebErrorState
              className="marketing-beta-error"
              description={pageError ?? "다시 시도해 주세요."}
              title="다시 시도해 주세요."
            />
          ) : null}

          {restoreGap ? (
            <WebEmptyState
              className="marketing-beta-empty"
              description="이 브라우저에 남아 있는 결과 요약을 찾지 못했어요. 같은 세션으로 다시 이어가려면 이 기기에서 테스트를 다시 완료해 주세요."
              title="이전 결과를 바로 복원하지 못했어요"
            />
          ) : null}

          {showQuiz ? (
            <section
              aria-labelledby="marketing-beta-quiz-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.quiz = node; }}
            >
            <WebCard className={`${styles.panel} marketing-beta-quiz`}>
              <div className={styles.quizHeader}>
                <div className={styles.panelHeader}>
                  <p className={styles.panelEyebrow}>Quiz</p>
                  <h2
                    className={`${styles.panelTitle} ${styles.stageHeading}`}
                    id="marketing-beta-quiz-heading"
                    ref={(node) => { stageHeadingRefs.current.quiz = node; }}
                    tabIndex={-1}
                  >
                    {currentQuestion.title}
                  </h2>
                </div>
                <span className={styles.progressPill}>{questionIndex + 1}/5</span>
              </div>

              <div className={styles.choiceList} role="radiogroup" aria-label={currentQuestion.title}>
                {currentQuestion.options.map((option) => {
                  const checked = quizAnswers[currentQuestion.key] === option;

                  return (
                    <label
                      className={`${styles.choice} ${checked ? styles.choiceActive : ""} marketing-beta-choice`}
                      key={option}
                    >
                      <span className={styles.choiceRow}>
                        <input
                          checked={checked}
                          className={styles.choiceControl}
                          name={currentQuestion.key}
                          onChange={() => updateQuizAnswer(currentQuestion.key, option)}
                          type="radio"
                        />
                        <span className={styles.choiceText}>{option}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className={styles.quizActions}>
                <span className={styles.helper}>단일 선택만 가능해요.</span>
                <WebButton
                  className={`${styles.nextButton} marketing-beta-next-button`}
                  disabled={!canAdvanceQuiz}
                  onClick={handleQuizAdvance}
                >
                  {questionIndex === QUESTION_DEFINITIONS.length - 1 ? "결과 보기" : "다음 질문"}
                </WebButton>
              </div>
            </WebCard>
            </section>
          ) : null}

          {showResult && resultCopy ? (
            <section
              aria-labelledby="marketing-beta-result-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.result = node; }}
            >
            <WebCard className={`${styles.panel} marketing-beta-result`}>
              <div className={styles.panelHeader}>
                <p className={styles.resultAccent}>{resultCopy.eyebrow}</p>
                <h2
                  className={`${styles.panelTitle} ${styles.stageHeading}`}
                  id="marketing-beta-result-heading"
                  ref={(node) => { stageHeadingRefs.current.result = node; }}
                  tabIndex={-1}
                >
                  {resultCopy.title}
                </h2>
                <p className={styles.panelBody}>{resultCopy.body}</p>
                {targetQualified === false ? (
                  <p className={styles.helper}>이 응답도 제품 우선순위를 정하는 데 중요합니다.</p>
                ) : null}
              </div>
              <div className={styles.quizActions}>
                <span className={styles.helper}>결과는 이메일 전에 먼저 보여드립니다.</span>
                <WebButton
                  className={styles.nextButton}
                  onClick={handleResultContinue}
                >
                  이렇게 기록할 수 있다면 어떨까요?
                </WebButton>
              </div>
            </WebCard>
            </section>
          ) : null}

          {showIntent ? (
            <section
              aria-labelledby="marketing-beta-intent-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.intent = node; }}
            >
            <WebCard className={`${styles.panel} marketing-beta-intent`}>
              <div className={styles.panelHeader}>
                <p className={styles.panelEyebrow}>Concept</p>
                <h2
                  className={`${styles.panelTitle} ${styles.stageHeading}`}
                  id="marketing-beta-intent-heading"
                  ref={(node) => { stageHeadingRefs.current.intent = node; }}
                  tabIndex={-1}
                >
                  이렇게 기록할 수 있다면 어떨까요?
                </h2>
                <p className={styles.conceptLine}>
                  레시피 영양 등록 + 완제품 등록 → 날짜별 kcal·탄·단·지 → 주간 평균
                </p>
              </div>

              <div className={styles.proofFrameSmall}>
                <Image
                  alt="주간 영양 기록 개념 증거"
                  className={styles.proofImage}
                  quality={75}
                  sizes="(max-width: 639px) 440px, (max-width: 1023px) 560px, 420px"
                  src={proofImage}
                />
              </div>

              <div className={styles.equalButtons}>
                {MARKETING_INTENT_CHOICES.map((choice) => (
                  <WebButton
                    className={`${styles.secondaryButton} marketing-beta-intent-button`}
                    fullWidth
                    key={choice}
                    onClick={() => handleIntentChoice(choice)}
                  >
                    {choice === "needed" ? "써보고 싶어요" : "지금은 필요하지 않아요"}
                  </WebButton>
                ))}
              </div>
            </WebCard>
            </section>
          ) : null}

          {showEmail ? (
            <section
              aria-labelledby="marketing-beta-email-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.email = node; }}
            >
            <WebCard className={`${styles.panel} marketing-beta-email`}>
              <form onSubmit={handleLeadSubmit}>
                <div className={styles.panelHeader}>
                  <p className={styles.panelEyebrow}>Intent</p>
                  <h2
                    className={`${styles.panelTitle} ${styles.stageHeading}`}
                    id="marketing-beta-email-heading"
                    ref={(node) => { stageHeadingRefs.current.email = node; }}
                    tabIndex={-1}
                  >
                    이런 앱이라면 써보고 싶나요?
                  </h2>
                  <p className={styles.panelBody}>
                    베타 초대와 관련 안내만 이메일로 보내드릴게요.
                  </p>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="marketing-beta-email">
                    이메일
                  </label>
                  <input
                    className={styles.input}
                    id="marketing-beta-email"
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    value={email}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.checkboxRow}>
                    <input
                      checked={consent}
                      className={styles.checkbox}
                      onChange={(event) => setConsent(event.target.checked)}
                      type="checkbox"
                    />
                    <span className={styles.checkboxLabel}>
                      베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.
                    </span>
                  </label>
                  <p className={styles.helper}>
                    <Link className={styles.privacyLink} href="/privacy">
                      개인정보처리방침
                    </Link>
                    에서 처리 목적과 보관 기준을 확인할 수 있어요.
                  </p>
                </div>

                {leadError ? (
                  <div className={`${styles.statusCard} ${styles.statusAlert}`} role="alert">
                    <p className={styles.statusText}>{leadError}</p>
                  </div>
                ) : null}

                <div className={styles.emailActions}>
                  <span className={styles.helper}>
                    Turnstile 보안 확인을 통과하지 못하면 신청은 저장되지 않아요.
                  </span>
                  <WebButton
                    className={styles.primaryButton}
                    disabled={!email || !consent || busy}
                    fullWidth
                    type="submit"
                  >
                    {busy ? "확인 중..." : "베타 우선 초대받기"}
                  </WebButton>
                </div>
              </form>
            </WebCard>
            </section>
          ) : null}

          {showFollowup ? (
            <section
              aria-labelledby="marketing-beta-followup-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.followup = node; }}
            >
            <WebCard
              className={`${styles.panel} marketing-beta-followup`}
              data-compact-panel="true"
            >
              <div className={styles.panelHeader}>
                <h2
                  className={`${styles.panelTitle} ${styles.stageHeading}`}
                  id="marketing-beta-followup-heading"
                  ref={(node) => { stageHeadingRefs.current.followup = node; }}
                  tabIndex={-1}
                >
                  조금만 더 알려주세요
                </h2>
                <p className={styles.panelBody}>선택 사항이에요. 건너뛰어도 신청은 유지돼요.</p>
              </div>

              <div className={styles.followupScrollShell}>
                <div
                  aria-label="선택형 후속 질문. 아래로 스크롤하면 두 번째 질문이 있습니다."
                  className={styles.followupQuestions}
                  data-local-scroll="true"
                  data-testid="marketing-beta-followup-scroll-region"
                  onScroll={handleFollowupScroll}
                  ref={followupScrollRef}
                  role="region"
                  tabIndex={0}
                >
              <fieldset className={styles.followupFieldset}>
                <legend className={styles.followupLegend} id="marketing-beta-followup-intent-legend">
                  이 주간 화면이 있다면 써볼 의향은?
                </legend>
                <div
                  aria-labelledby="marketing-beta-followup-intent-legend"
                  className={styles.choiceList}
                  role="radiogroup"
                >
                  {FOLLOWUP_INTENT_OPTIONS.map((option) => (
                    <label
                      className={`${styles.choice} ${plannerIntent === option ? styles.choiceActive : ""}`}
                      key={option}
                    >
                      <span className={styles.choiceRow}>
                        <input
                          checked={plannerIntent === option}
                          className={styles.choiceControl}
                          name="planner-intent"
                          onChange={() => setPlannerIntent(option)}
                          type="radio"
                        />
                        <span className={styles.choiceText}>{FOLLOWUP_INTENT_LABELS[option]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.followupFieldset}>
                <legend className={styles.followupLegend} id="marketing-beta-followup-priority-legend">
                  가장 먼저 보고 싶은 정보는?
                </legend>
                <div
                  aria-labelledby="marketing-beta-followup-priority-legend"
                  className={styles.choiceList}
                  role="radiogroup"
                >
                  {FOLLOWUP_PRIORITY_OPTIONS.map((option) => (
                    <label
                      className={`${styles.choice} ${plannerPriority === option ? styles.choiceActive : ""}`}
                      key={option}
                    >
                      <span className={styles.choiceRow}>
                        <input
                          checked={plannerPriority === option}
                          className={styles.choiceControl}
                          name="planner-priority"
                          onChange={() => setPlannerPriority(option)}
                          type="radio"
                        />
                        <span className={styles.choiceText}>{FOLLOWUP_PRIORITY_LABELS[option]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
                </div>
                {followupHasMore ? (
                  <span
                    aria-hidden="true"
                    className={styles.followupScrollCue}
                    data-testid="marketing-beta-followup-scroll-cue"
                  >
                    아래로 더 보기 ↓
                  </span>
                ) : null}
              </div>

              <div
                className={styles.followupActions}
                data-sticky-actions="true"
                data-testid="marketing-beta-followup-actions"
              >
                <WebButton
                  className={styles.ghostButton}
                  onClick={() => void handleFollowupSubmit(true)}
                >
                  건너뛰기
                </WebButton>
                <WebButton
                  className={styles.primaryButton}
                  onClick={() => void handleFollowupSubmit(false)}
                >
                  완료
                </WebButton>
              </div>
            </WebCard>
            </section>
          ) : null}

          {showDone ? (
            <section
              aria-labelledby="marketing-beta-done-heading"
              className={styles.stageSection}
              ref={(node) => { stageSectionRefs.current.done = node; }}
            >
            <WebCard className={`${styles.panel} ${styles.doneCard} marketing-beta-done`}>
              <div className={styles.panelHeader}>
                <p className={styles.panelEyebrow}>Done</p>
                <h2
                  className={`${styles.panelTitle} ${styles.stageHeading}`}
                  id="marketing-beta-done-heading"
                  ref={(node) => { stageHeadingRefs.current.done = node; }}
                  tabIndex={-1}
                >
                  {intentChoice === "enough" ? "지금은 필요하지 않아요 응답까지 기록했어요." : "응답을 저장했어요."}
                </h2>
                <p className={styles.panelBody}>
                  {intentChoice === "enough"
                    ? "지금 방식이 충분하다는 응답도 같은 무게로 제품 판단에 반영합니다."
                    : "베타 준비가 끝나면 먼저 연락드릴 수 있도록 정리해둘게요."}
                </p>
              </div>
            </WebCard>
            </section>
          ) : null}
        </div>
      </main>
    </WebShell>
  );
}
