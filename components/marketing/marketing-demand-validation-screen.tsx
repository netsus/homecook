"use client";

import { Result, Experience, Planner, Packaged, BetaForm, Done, RESULTS, preloadJourneyAssets, useReducedMotion, type ShareFeedback, type TurnstileResult } from "./recording-flow-views";
import { Brand, Frame, MarketingDemandValidationHero as Hero } from "./marketing-demand-validation-hero";
import { MarketingDemandValidationQuiz as Quiz } from "./marketing-demand-validation-quiz";
import { preload } from "react-dom";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { postMarketingValidation } from "@/lib/api/marketing-validation";
import {
  buildMarketingProfileAttribution,
  resolveMarketingAdVariant,
  resolveMarketingProfileSource,
  type ActiveMarketingAdVariant,
  type MarketingProfileSource,
} from "@/lib/marketing/demand-validation";
import {
  enqueueMarketingQueueAction,
  flushMarketingQueue,
  isMarketingQueueActionCoveredByServerState,
  readMarketingClientSnapshot,
  reconcileMarketingQueueWithServerState,
  writeMarketingClientSnapshot,
  type MarketingValidationQueueAction,
  type MarketingValidationUiStage,
} from "@/lib/marketing/marketing-validation-client-session";
import { MARKETING_VALIDATION_ACTIONS } from "@/types/marketing-validation";
import type {
  MarketingValidationAction,
  MarketingValidationQuizAnswers,
  MarketingValidationQuizResult,
  MarketingValidationRequestBody,
} from "@/types/marketing-validation";

type QuestionId = keyof MarketingValidationQuizAnswers;
type Answers = Partial<MarketingValidationQuizAnswers>;

interface MarketingDemandValidationScreenProps {
  getTurnstileToken?: () => Promise<TurnstileResult>;
  initialAdVariant?: ActiveMarketingAdVariant;
  initialAttribution?: Record<string, string | null>;
  initialProfileSource?: MarketingProfileSource | null;
  initialSharedResult?: MarketingValidationQuizResult | null;
}

type QueueRecovery = { message: string; resume: () => void } | null;

const RESULT_KEYS: MarketingValidationQuizResult[] = ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"];
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;




function resolveEntry() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("result");
  const sharedResult = RESULT_KEYS.includes(result as MarketingValidationQuizResult) ? result as MarketingValidationQuizResult : null;
  const profileSource: MarketingProfileSource | null = !sharedResult
    ? resolveMarketingProfileSource(params)
    : null;
  const adVariant = resolveMarketingAdVariant(params.get("utm_content"), params.get("ad_variant"));
  const attribution = profileSource
    ? buildMarketingProfileAttribution(profileSource)
    : Object.fromEntries(UTM_KEYS.flatMap((key) => params.get(key) ? [[key, params.get(key)]] : []));
  return { adVariant, attribution, profileSource, sharedResult };
}


function deriveResult(q3: MarketingValidationQuizAnswers["q3"]): MarketingValidationQuizResult {
  return { pass: "homecook-passer", eyeball: "eyeballing-master", track: "ingredient-tracker", measure: "pro-measurer" }[q3] as MarketingValidationQuizResult;
}




export function MarketingDemandValidationScreen({
  getTurnstileToken,
  initialAdVariant = "a",
  initialAttribution = {},
  initialProfileSource = null,
  initialSharedResult = null,
}: MarketingDemandValidationScreenProps) {
  const [entry, setEntry] = useState<{ adVariant: ActiveMarketingAdVariant; attribution: Record<string, string | null>; profileSource: MarketingProfileSource | null; sharedResult: MarketingValidationQuizResult | null }>({ adVariant: initialAdVariant, attribution: initialAttribution, profileSource: initialProfileSource, sharedResult: initialSharedResult });
  const [entryReady, setEntryReady] = useState(false);
  const [stage, setStage] = useState<MarketingValidationUiStage>(initialSharedResult ? "result" : "hero");
  const [history, setHistory] = useState<MarketingValidationUiStage[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<MarketingValidationQuizResult>(initialSharedResult ?? "eyeballing-master");
  const [loading, setLoading] = useState(initialSharedResult === null);
  const [shellError, setShellError] = useState("");
  const [queueRecovery, setQueueRecovery] = useState<QueueRecovery>(null);
  const [recovering, setRecovering] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>(null);
  const transitionLocked = useRef(false);
  const queueErrorRef = useRef("");
  const serverState = useRef<MarketingValidationAction | undefined>(undefined);
  const reduced = useReducedMotion();
  const preview = Boolean(entry.sharedResult && history.length === 0);

  const rememberServerState = useCallback((next: MarketingValidationAction | undefined) => {
    if (next && (!serverState.current || MARKETING_VALIDATION_ACTIONS.indexOf(next) > MARKETING_VALIDATION_ACTIONS.indexOf(serverState.current))) serverState.current = next;
  }, []);

  const sendQueued = useCallback(async (action: MarketingValidationQueueAction) => {
    if (serverState.current && isMarketingQueueActionCoveredByServerState(action, serverState.current)) return { ok: true as const, state: serverState.current };
    const response = await postMarketingValidation({ ...action, honeypot: "" } as MarketingValidationRequestBody);
    if (response.success) {
      queueErrorRef.current = "";
      rememberServerState(response.data?.state);
      return { ok: true as const, state: serverState.current };
    }
    queueErrorRef.current = response.error?.message ?? "진행 내용을 저장하지 못했어요. 다시 시도해 주세요.";
    return { ok: false as const, retryable: true };
  }, [rememberServerState]);

  const record = useCallback(async (action: MarketingValidationQueueAction) => {
    queueErrorRef.current = "";
    if (serverState.current && isMarketingQueueActionCoveredByServerState(action, serverState.current)) return true;
    enqueueMarketingQueueAction(action);
    const flushed = await flushMarketingQueue(sendQueued);
    if (flushed.stopped !== "completed") return false;
    return true;
  }, [sendQueued]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setShellError("");
    serverState.current = undefined;
    const response = await postMarketingValidation({ action: "view", honeypot: "", ad_variant: entry.adVariant, ...entry.attribution });
    if (!response.success || !response.data) {
      setShellError(response.error?.message ?? "진행 정보를 불러오지 못했어요.");
      setLoading(false);
      return;
    }
    serverState.current = response.data.state;
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
  useEffect(() => { if (entryReady && !entry.sharedResult && !loading && serverState.current) writeMarketingClientSnapshot({ stage, serverState: serverState.current, quizAnswers: Object.keys(answers).length === 4 ? answers as MarketingValidationQuizAnswers : undefined, quizResult: stage === "hero" || stage === "quiz" ? undefined : result }); }, [answers, entry.sharedResult, entryReady, loading, result, stage]);

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
  const back = () => { const previous = history.at(-1); if (!previous) { setStage("hero"); return; } setHistory((current) => current.slice(0, -1)); setStage(previous); };
  const start = async () => { if (await record({ action: "quiz_started" })) { preloadJourneyAssets(); setQuestionIndex(0); push("quiz"); } else setShellError("연결을 확인한 뒤 새로 시작해 주세요."); };
  const select = (id: QuestionId, value: string) => {
    if (transitionLocked.current) return;
    transitionLocked.current = true;
    const next = { ...answers, [id]: value } as Answers;
    setAnswers(next);
    if (id === "q3" && ["pass", "eyeball", "track", "measure"].includes(value)) {
      preload(RESULTS[deriveResult(value as MarketingValidationQuizAnswers["q3"])].asset, {
        as: "image",
        fetchPriority: "high",
      });
    }
    window.setTimeout(async () => {
      if (questionIndex < 3) setQuestionIndex((current) => current + 1);
      else {
        const exact = next as MarketingValidationQuizAnswers;
        const completed = serverState.current && isMarketingQueueActionCoveredByServerState({ action: "quiz_completed", answers: exact }, serverState.current);
        // Replaying the quiz changes only the local result; the session's first answers and funnel statistics remain unchanged.
        if (!completed) {
          const response = await postMarketingValidation({ action: "quiz_completed", answers: exact, honeypot: "" });
          if (!response.success || !response.data?.quiz_result) { setShellError(response.error?.message ?? "답변을 저장하지 못했어요."); transitionLocked.current = false; return; }
          rememberServerState(response.data.state);
        }
        setResult(deriveResult(exact.q3));
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
  const submitLead = async (email: string, token: string) => {
    const response = await postMarketingValidation({ action: "lead_submitted", email, consent: true, turnstile_token: token, honeypot: "" });
    if (!response.success) return response.error?.message ?? "신청을 처리하지 못했어요.";
    push("done");
    return null;
  };
  const reset = () => { const resetUrl = entry.profileSource === "instagram" ? "/beta" : entry.profileSource === "facebook" ? "/beta?profile_source=facebook" : `/beta?ad_variant=${entry.adVariant}`; window.history.replaceState({}, "", resetUrl); setAnswers({}); setHistory([]); setQuestionIndex(0); setResult("eyeballing-master"); setStage("hero"); setQueueRecovery(null); setRecovering(false); setShareFeedback(null); transitionLocked.current = false; queueErrorRef.current = ""; setLoading(true); setEntry((current) => ({ ...current, sharedResult: null })); };

  if (shellError) return <div className="mdv2-root"><Frame stage="empty" className="mdv2-state-screen"><Brand /><h1>새 테스트로 다시 시작할게요.</h1><p role="alert">{shellError}</p><button className="primary-button" type="button" onClick={reset}>새로 시작하기</button></Frame></div>;
  if (queueRecovery) return <div className="mdv2-root"><Frame stage="recovery" className="mdv2-state-screen"><Brand /><h1>잠시 연결이 끊겼어요.</h1><div className="mdv2-error" role="alert"><p>{queueRecovery.message}</p></div><button className="primary-button" type="button" disabled={recovering} onClick={() => void retryQueue()}>{recovering ? "다시 연결하는 중…" : "다시 시도"}</button></Frame></div>;

  let content: ReactNode;
  if (stage === "hero") content = <Hero pending={loading || !entryReady} variant={entry.adVariant} onStart={() => void start()} />;
  else if (stage === "quiz") content = <Quiz index={questionIndex} answers={answers} locked={transitionLocked.current} onBack={() => questionIndex ? setQuestionIndex((current) => current - 1) : back()} onSelect={select} />;
  else if (stage === "result") content = <Result type={result} preview={preview} onBack={preview ? reset : back} onNext={async () => { const showExperience = () => push("experience-1"); if (await record({ action: "experience_started" })) showExperience(); else showQueueRecovery("체험 화면을 열지 못했어요. 다시 시도해 주세요.", showExperience); }} onPreviewStart={reset} onShare={() => void share()} shareFeedback={shareFeedback} />;
  else if (stage.startsWith("experience-")) { const step = Number(stage.at(-1)); content = <Experience step={step} reduced={reduced} onBack={back} onNext={async () => { if (step < 5) push(`experience-${step + 1}` as MarketingValidationUiStage); else { const showPlanner = () => push("planner-homecook"); if (await record({ action: "experience_completed" })) showPlanner(); else showQueueRecovery("식단 화면을 열지 못했어요. 다시 시도해 주세요.", showPlanner); } }} />; }
  else if (stage === "planner-homecook") content = <Planner complete={false} reduced={reduced} onBack={back} onNext={() => push("packaged-food")} />;
  else if (stage === "packaged-food") content = <Packaged onBack={back} onNext={() => push("planner-complete")} />;
  else if (stage === "planner-complete") content = <Planner complete reduced={reduced} onBack={back} onNext={async () => { const showBetaForm = () => push("beta-form"); if (await record({ action: "beta_form_viewed" })) showBetaForm(); else showQueueRecovery("신청 화면을 열지 못했어요. 다시 시도해 주세요.", showBetaForm); }} />;
  else if (stage === "beta-form") content = <BetaForm onBack={back} onSubmit={submitLead} getTurnstileToken={getTurnstileToken} />;
  else content = <Done onBack={back} onReset={reset} />;

  return <div className="mdv2-root"><div className="mdv2-shell">{content}</div><p className="mdv2-live" aria-live="polite">{stage === "done" ? "신청이 완료됐어요." : ""}</p></div>;
}
