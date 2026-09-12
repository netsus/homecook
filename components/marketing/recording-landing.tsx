"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { createRecordingClient, recordingShareUrl } from "@/lib/marketing/recording-client";
import type { Round2PageProps } from "@/lib/server/marketing-round2-page";
import type { MarketingValidationQuizResult } from "@/types/marketing-validation";
import { Brand, Frame } from "./marketing-demand-validation-hero";
import { MarketingDemandValidationQuiz } from "./marketing-demand-validation-quiz";
import { BetaForm, Done, Experience, Packaged, Planner, Result, useReducedMotion, type ShareFeedback } from "./recording-flow-views";

export type RecordingLandingProps = Round2PageProps & { sharedResult?: MarketingValidationQuizResult | null };

export function RecordingLanding(props: RecordingLandingProps) {
  const [client] = useState(() => createRecordingClient(props));
  const [initial] = useState(() => client.getState());
  const [lifecycle] = useState(() => ({ generation: 0 }));
  const state = useSyncExternalStore(client.subscribe, client.getState, () => initial);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const generation = ++lifecycle.generation;
    if (!client.getState().shared) void client.connect();
    const resume = () => { if (document.visibilityState === "visible" && !client.getState().shared) void client.connect(); };
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
      queueMicrotask(() => { if (lifecycle.generation === generation) client.dispose(); });
    };
  }, [client, lifecycle]);

  const next = () => { void client.next(); };
  async function share() {
    if (!state.result) return;
    const url = recordingShareUrl(window.location.origin, state.result);
    try {
      if (navigator.share) await navigator.share({ title: "나의 집밥 기록 유형 · 무먹", url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setShareFeedback({ kind: "success", message: "공유 링크를 복사했어요." }); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareFeedback({ kind: "error", message: "공유하지 못했어요. 다시 시도해 주세요." });
    }
  }

  const error = state.core.error?.message ?? null;
  let content: React.ReactNode;
  if (state.screen === "quiz") {
    content = <MarketingDemandValidationQuiz index={state.question} answers={state.answers} presentation={state.question === 0 && (!state.answers.q1 || !!error) ? "recording-entry" : undefined} onBack={state.question > 0 ? client.back : undefined} onSelect={(id, value) => { void client.selectAnswer(id, value); }} locked={state.core.busy || !!error} />;
  } else if (state.screen === "result" && state.result) {
    content = <Result type={state.result} onBack={state.shared ? client.startTest : client.back} onNext={next} preview={state.shared} onPreviewStart={client.startTest} onShare={() => { void share(); }} shareFeedback={shareFeedback} preparedExample />;
  } else if (state.screen === "experience") {
    content = <Experience key={state.step} step={state.step} onBack={client.back} onNext={next} reduced={reduced} />;
  } else if (state.screen === "planner" || state.screen === "payoff") {
    content = <Planner key={state.screen} complete={state.screen === "payoff"} onBack={client.back} onNext={next} reduced={reduced} />;
  } else if (state.screen === "packaged") {
    content = <Packaged onBack={client.back} onNext={next} />;
  } else if (state.screen === "lead" && !props.preview && props.leadReady) {
    content = <BetaForm onBack={client.back} round2={{ ...state.core.leadForm, busy: state.core.busy, error: state.core.error?.message ?? null, onChange: client.setLeadForm, siteKey: props.turnstileSiteKey, challengeEpoch: state.core.challengeEpoch, tokenReady: state.core.tokenReady, onToken: client.setTurnstileToken, pendingLeadEdited: state.core.pendingLead?.edited ?? false, onRestore: client.restoreLeadAttempt, onRetry: () => { void client.retry(); } }} onSubmit={async (_email, token) => { if (token) client.setTurnstileToken(token); await client.submitLead(); return client.getState().core.error?.message ?? null; }} />;
  } else if (state.screen === "done" && !props.preview) {
    content = <Done onBack={client.back} onReset={client.restartLocal} />;
  } else {
    const legacy = state.screen === "legacy";
    const returning = state.screen === "returning";
    content = <Frame stage={state.screen} className="mdv2-state-screen"><Brand /><h1>{legacy ? "이전 설문을 확인해 주세요" : returning ? "이미 의견을 남겨주셨어요" : props.preview ? "체험 예시를 모두 확인했어요" : "알림 신청 준비 중이에요"}</h1><p>{legacy ? "이전 버전의 답변은 새 설문에 섞지 않아요. 로컬 설문을 다시 시작해 주세요." : returning ? "이 기기에서 확인할 수 있는 유형 정보가 없어 체험으로 이어갈게요." : props.preview ? "미리보기에서는 실제 의견이나 이메일 신청을 접수하지 않아요." : "준비가 완료되면 이메일로 베타 오픈 알림을 신청할 수 있어요."}</p>{legacy ? <button type="button" className="primary-button" onClick={client.restartLocal}>로컬 설문 다시 시작</button> : returning ? <button type="button" className="primary-button" onClick={next}>체험 이어가기</button> : <button type="button" className="primary-button" onClick={client.back}>이전 화면</button>}</Frame>;
  }

  const recoveryScroll = !!error && state.screen !== "lead";
  const footerStyle: React.CSSProperties = { flex: "0 0 auto", width: "min(100%, 390px)", margin: "0 auto", padding: "8px 24px", fontSize: 12, lineHeight: 1.5, background: "#fff" };
  return <div className="mdv2-root" style={{ display: "flex", flexDirection: "column" }}>
    <div className="mdv2-shell" style={{ flex: "1 1 0", height: "auto", overflowY: recoveryScroll ? "auto" : undefined }} inert={state.core.busy || undefined}>{recoveryScroll ? <div style={{ height: "100dvh" }}>{content}</div> : content}</div>
    {props.preview && <p role="status" style={{ ...footerStyle, textAlign: "center" }}>미리보기 · 실제 저장과 신청은 하지 않아요.</p>}
    {error && state.screen !== "lead" && <div className="mdv2-error" role="alert" style={{ ...footerStyle, maxHeight: "40dvh", overflowY: "auto" }}><p>{error}</p><button type="button" disabled={state.core.busy} onClick={() => { void client.retry(); }}>다시 시도</button>{state.core.connection === "restart_required" && <button type="button" onClick={client.restartLocal}>로컬 설문 다시 시작</button>}</div>}
    {state.core.busy && <p role="status" className="mdv2-submit-status" style={footerStyle}>진행 내용을 확인하고 있어요.</p>}
  </div>;
}
