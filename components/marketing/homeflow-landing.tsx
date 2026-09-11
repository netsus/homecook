"use client";

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { ChevronLeftIcon, CheckIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { HomeflowExperience } from "@/components/marketing/homeflow-experience";
import { MarketingTurnstile, type MarketingTurnstileController } from "@/components/marketing/marketing-turnstile";
import { HOMEFLOW_RESULTS, HOMEFLOW_RESULT_BRIDGES, HOMEFLOW_CHARACTER_ASSETS } from "@/lib/marketing/homeflow-content";
import { LINEAR_HOMEFLOW_SURVEY } from "@/lib/marketing/round2-survey";
import { CAMPAIGN_END, Round2Error, LINEAR_HOMEFLOW_SURVEY_VERSION, ROUND2_VERSION, ROUND2_CONSENT_VERSION, ROUND2_PURPOSE, normalizeRound2Email, type Round2Activity, type Round2Request, type Round2SuccessData } from "@/lib/marketing-round2";
import { prepareRound2Bootstrap, restartRound2Bootstrap, buildRound2BootstrapRequest, confirmRound2Bootstrap, markRound2ParticipationExpired } from "@/lib/marketing/round2-session";
import { completeHomeflowAnswers, initialHomeflowUi, readHomeflowCache, writeHomeflowCache, reconcileHomeflowCache, mergeHomeflowServerState, postHomeflowRequest, HomeflowClientError, type HomeflowUiState, type HomeflowAnonymousRequest } from "@/lib/marketing/homeflow-client";
import type { Round2Attribution } from "@/lib/server/marketing-round2-context";
import styles from "./homeflow-landing.module.css";

type Props = { preview: boolean; pageContext: string | null; attribution: Round2Attribution; sharedResult: keyof typeof HOMEFLOW_RESULTS | null; siteKey?: string };
type LeadRequest = Extract<Round2Request, { action: "lead_submit" }>;
const common = () => ({ topic: "homeflow" as const, round_version: ROUND2_VERSION, honeypot: "" as const, event_id: crypto.randomUUID() });

function CharacterArtwork({ src, alt, celebrate = false }: { src: string | null; alt: string; celebrate?: boolean }) {
  return <div className={`${styles.characterScene} ${celebrate ? styles.celebrating : ""}`}>
    {src && <Image className={styles.characterImage} src={src} alt={alt} width={720} height={720} sizes="(max-width: 440px) 62vw, 240px" />}
    <div className={styles.sparkles} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(index => <span key={index}>✦</span>)}</div>
    {celebrate && <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ "--x": `${Math.cos(index * .9) * 130}px`, "--y": `${Math.sin(index * .9) * 110 - 40}px`, "--rotation": `${index * 47}deg`, "--delay": `${index % 4 * 55}ms` } as React.CSSProperties} />)}</div>}
  </div>;
}

export function HomeflowLanding({ preview, pageContext, attribution, sharedResult, siteKey = "" }: Props) {
  const contentOnly = !preview && !pageContext;
  const collects = !preview && !contentOnly;
  const [ui, setUi] = useState<HomeflowUiState>(initialHomeflowUi);
  const uiRef = useRef(ui);
  const serverRef = useRef<Round2SuccessData | null>(null);
  const connection = useRef<Promise<Round2SuccessData> | null>(null);
  const knownSurvey = useRef(false);
  const [shared, setShared] = useState(sharedResult);
  const [busy, setBusy] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<HomeflowClientError | Error | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const [email, setEmail] = useState(preview ? "preview@example.com" : "");
  const emailRef = useRef(preview ? "preview@example.com" : "");
  const [consent, setConsent] = useState(false);
  const consentRef = useRef(false);
  const [shareNotice, setShareNotice] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const answerLock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widget = useRef<MarketingTurnstileController | null>(null);
  const leadRequest = useRef<LeadRequest | null>(null);
  const setWidget = useCallback((controller: MarketingTurnstileController | null) => { widget.current = controller; }, []);

  const commit = useCallback((update: (current: HomeflowUiState) => HomeflowUiState) => {
    const next = update(uiRef.current);
    uiRef.current = next;
    setUi(next);
    if (collects) {
      try { writeHomeflowCache(window.localStorage, next); } catch { /* Content remains usable; server submission still uses R2 bootstrap. */ }
    }
  }, [collects]);

  const applyServer = useCallback((incoming: Round2SuccessData) => {
    const next = mergeHomeflowServerState(serverRef.current, incoming);
    serverRef.current = next;
    return next;
  }, []);

  const connect = useCallback(async (): Promise<Round2SuccessData> => {
    if (serverRef.current) return serverRef.current;
    if (connection.current) return connection.current;
    connection.current = (async () => {
      const prepared = await prepareRound2Bootstrap({ topic: "homeflow", attribution });
      if (prepared.kind === "restart_required") throw new HomeflowClientError(Date.now() >= Date.parse(CAMPAIGN_END) ? "CAMPAIGN_ENDED" : "PARTICIPATION_EXPIRED");
      const request = buildRound2BootstrapRequest(prepared, pageContext ?? undefined);
      const next = applyServer(await postHomeflowRequest(request));
      if (prepared.kind === "key") await confirmRound2Bootstrap({ topic: "homeflow", bootstrapKey: prepared.bootstrap_key, eventId: prepared.event_id, expiresAt: next.participation_expires_at });
      let cache: HomeflowUiState | null = null;
      try { cache = readHomeflowCache(window.localStorage); } catch { /* No persisted UI is available. */ }
      knownSurvey.current = cache?.participationId === next.participation_id && !!cache.confirmedSurveyEventId && completeHomeflowAnswers(cache.answers) && next.state.survey === "completed";
      const recovered = reconcileHomeflowCache(cache, next);
      commit(current => cache?.participationId !== next.participation_id && next.state.survey !== "completed" && current.screen === "quiz"
        ? { ...current, participationId: next.participation_id, expiresAt: next.participation_expires_at }
        : recovered);
      return next;
    })();
    try { return await connection.current; }
    finally { connection.current = null; }
  }, [applyServer, attribution, commit, pageContext]);

  const send = useCallback(async (request: HomeflowAnonymousRequest) => {
    commit(current => ({ ...current, pending: request }));
    try {
      const data = applyServer(await postHomeflowRequest(request));
      if (request.action === "survey_submit") knownSurvey.current = true;
      commit(current => ({ ...current, pending: null, ...(request.action === "survey_submit" ? { confirmedSurveyEventId: request.event_id, answers: request.answers } : {}) }));
      return data;
    } catch (caught) {
      if (caught instanceof HomeflowClientError && !caught.retryable) commit(current => ({ ...current, pending: null }));
      throw caught;
    }
  }, [applyServer, commit]);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); retryRef.current = operation;
    try {
      if (collects) {
        await connect();
        const pending = uiRef.current.pending;
        if (pending) await send(pending);
      }
      await operation(); retryRef.current = null;
    } catch (caught) {
      const issue = caught instanceof HomeflowClientError ? caught : caught instanceof Round2Error ? new HomeflowClientError(caught.code) : new HomeflowClientError("NETWORK", true);
      if (issue.code === "ACTIVITY_ALREADY_COMPLETED") {
        serverRef.current = null;
        try { await connect(); retryRef.current = null; return; } catch { /* Display recovery if reconnect is unavailable. */ }
      }
      if (issue.code === "PARTICIPATION_EXPIRED") await markRound2ParticipationExpired({ topic: "homeflow" });
      if (issue.code === "CONSENT_REFRESH_REQUIRED") {
        consentRef.current = false; setConsent(false); widget.current?.reset(); leadRequest.current = null; serverRef.current = null; retryRef.current = null;
      }
      setError(issue);
    } finally { busyRef.current = false; setBusy(false); }
  }, [collects, connect, send]);

  const startActivity = useCallback(async (activity: Round2Activity) => {
    if (collects && serverRef.current?.state[activity] === "not_started") await send({ ...common(), action: "activity_start", activity });
  }, [collects, send]);

  useEffect(() => {
    if (!preview && !sharedResult && pageContext) {
      void run(async () => {
        if (serverRef.current) commit(current => reconcileHomeflowCache(current, serverRef.current!));
      });
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
    // Entry props are server-owned and stable for this page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = document.querySelector<HTMLElement>("[data-homeflow-main] h1");
    node?.setAttribute("tabindex", "-1"); node?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [ui.screen, ui.question, ui.step, shared]);

  const beginQuiz = () => {
    setShared(null); setShareNotice("");
    if (shared) window.history.replaceState({}, "", "/beta/r2/homeflow");
    if (!busyRef.current) commit(current => ({ ...current, screen: "quiz", question: 0 }));
    void run(async () => {
      if (collects && serverRef.current?.state.survey === "completed") {
        commit(current => ({ ...current, screen: knownSurvey.current ? "result" : "returning" })); return;
      }
      await startActivity("survey");
      commit(current => ({ ...current, screen: "quiz" }));
    });
  };
  const submitQuiz = async () => {
    if (!completeHomeflowAnswers(uiRef.current.answers)) return;
    await startActivity("survey");
    if (collects && serverRef.current?.state.survey !== "completed") await send({ ...common(), action: "survey_submit", topic: "homeflow", survey_version: LINEAR_HOMEFLOW_SURVEY_VERSION, answers: uiRef.current.answers });
    commit(current => ({ ...current, screen: !collects || knownSurvey.current ? "result" : "returning" }));
  };
  const choose = (value: string) => {
    if (answerLock.current || busyRef.current || uiRef.current.pending) return;
    answerLock.current = true; setSelectedAnswer(value);
    const question = LINEAR_HOMEFLOW_SURVEY.questions[uiRef.current.question];
    commit(current => ({ ...current, confirmedSurveyEventId: null, answers: { ...current.answers, [question.id]: value } }));
    timer.current = setTimeout(() => {
      timer.current = null; answerLock.current = false; setSelectedAnswer(null);
      if (uiRef.current.question < 3) commit(current => ({ ...current, question: current.question + 1 }));
      else void run(submitQuiz);
    }, 300);
  };
  const beginExample = () => { void run(async () => { await startActivity("example"); commit(current => ({ ...current, screen: "experience", step: 1 })); }); };
  const nextExample = () => {
    if (uiRef.current.step < 6) { commit(current => ({ ...current, step: current.step + 1 })); return; }
    void run(async () => {
      await startActivity("example");
      if (collects && serverRef.current?.state.example !== "completed") await send({ ...common(), action: "example_complete" });
      await startActivity("lead");
      commit(current => ({ ...current, screen: serverRef.current?.state.lead === "completed" ? "done" : "lead" }));
    });
  };
  const backExample = () => commit(current => current.step > 1 ? { ...current, step: current.step - 1 } : { ...current, screen: (!collects || current.confirmedSurveyEventId) && completeHomeflowAnswers(current.answers) ? "result" : "returning" });

  const submitLead = (event: FormEvent) => {
    event.preventDefault(); if (!consent || busyRef.current) return;
    void run(async () => {
      if (contentOnly) throw new HomeflowClientError("ROUND2_DISABLED");
      if (!consentRef.current) throw new HomeflowClientError("VALIDATION_ERROR");
      if (preview) { commit(current => ({ ...current, screen: "done" })); return; }
      if (serverRef.current?.state.lead === "completed" && serverRef.current.receipt) { commit(current => ({ ...current, screen: "done" })); return; }
      await startActivity("lead");
      if (!leadRequest.current) {
        let normalized: string;
        try { normalized = normalizeRound2Email(emailRef.current); } catch { throw new HomeflowClientError("VALIDATION_ERROR"); }
        const token = await widget.current?.getToken();
        if (!token?.ok) throw new HomeflowClientError("TURNSTILE_FAILED");
        leadRequest.current = { ...common(), action: "lead_submit", email: normalized, consent: true, consent_version: ROUND2_CONSENT_VERSION, purpose: ROUND2_PURPOSE, consent_generation: serverRef.current!.consent_generation, turnstile_token: token.token };
      }
      try {
        const confirmed = applyServer(await postHomeflowRequest(leadRequest.current));
        if (confirmed.state.lead !== "completed" || !confirmed.receipt) throw new HomeflowClientError("NETWORK", true);
        leadRequest.current = null; emailRef.current = ""; setEmail(""); commit(current => ({ ...current, screen: "done" }));
      } catch (caught) {
        if (caught instanceof HomeflowClientError && !caught.retryable) { leadRequest.current = null; widget.current?.reset(); }
        throw caught;
      }
    });
  };
  const share = async (key: keyof typeof HOMEFLOW_RESULTS) => {
    const url = new URL("/beta/r2/homeflow", window.location.origin); url.searchParams.set("result", key);
    try {
      if (navigator.share) await navigator.share({ title: HOMEFLOW_RESULTS[key].title, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setShareNotice("결과 링크를 복사했어요."); }
    } catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) setShareNotice("공유하지 못했어요. 다시 시도해 주세요."); }
  };

  const resultKey = shared ?? ui.answers.q3;
  const result = resultKey ? HOMEFLOW_RESULTS[resultKey] : null;
  const question = LINEAR_HOMEFLOW_SURVEY.questions[ui.question];
  const hasHardRecovery = error instanceof HomeflowClientError && ["PARTICIPATION_REQUIRED", "CONTEXT_EXPIRED", "CONTEXT_INVALID", "PARTICIPATION_EXPIRED", "CONSENT_REFRESH_REQUIRED"].includes(error.code);
  const restartParticipation = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const prepared = await restartRound2Bootstrap({ topic: "homeflow", attribution });
      if (prepared.kind !== "key") throw new Error("브라우저 저장을 허용한 뒤 다시 시도해 주세요.");
      commit(() => initialHomeflowUi()); window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught : new Error("참여를 다시 시작하지 못했어요.")); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const goHome = () => {
    setShared(null); setError(null); setShareNotice("");
    setConsent(false); consentRef.current = false;
    commit(current => collects ? { ...current, screen: "hero", question: 0, step: 1 } : initialHomeflowUi());
    window.history.replaceState({}, "", "/beta/r2/homeflow");
  };
  const brand = <Image src="/assets/funnel/brand/mumeok-logo-horizontal.webp" alt="무먹 무엇을 먹든" width={145} height={40} className={styles.brand} />;
  const backIcon = <ChevronLeftIcon width={22} height={22} aria-hidden="true" />;

  return <main className={`${styles.shell} ${preview || contentOnly ? styles.withNotice : ""}`} data-homeflow-main>
    {preview && <div className={styles.previewNotice} role="note">로컬 미리보기 · 저장되지 않아요</div>}
    {contentOnly && !shared && <div className={styles.previewNotice} role="note">미리 둘러보기 · 입력은 저장되지 않아요</div>}
    {error && <div className={styles.error} role="alert"><p>{error.message}</p>{error instanceof HomeflowClientError && error.code === "PARTICIPATION_EXPIRED" ? <button type="button" disabled={busy} onClick={() => { void restartParticipation(); }}>새 참여 시작</button> : hasHardRecovery
      ? <button type="button" onClick={() => window.location.reload()}>페이지 다시 열기</button>
      : <button type="button" disabled={busy} onClick={() => { if (retryRef.current) void run(retryRef.current); }}>다시 시도</button>}</div>}
    {!shared && ui.screen === "experience" ? <HomeflowExperience step={ui.step as 1 | 2 | 3 | 4 | 5 | 6} demo={ui.demo} busy={busy} onDemoChange={demo => commit(current => ({ ...current, demo }))} onNext={nextExample} onBack={backExample} /> : <section className={styles.screen} data-screen={shared ? "result" : ui.screen}>
      {!shared && ui.screen === "hero" && <>
        {brand}<h1 className={styles.heroTitle}>베타 오픈 전 수요조사</h1><p className={styles.body}>나의 집밥 스타일을 알아보고<br />무먹을 먼저 체험해보세요.</p>
        <div className={styles.heroJourney} data-art-ready={heroLoaded}>
          <Image src={HOMEFLOW_CHARACTER_ASSETS.hero} alt="스마트폰을 들고 오른쪽 테스트 안내를 가리키는 광고 속 무먹 캐릭터" width={540} height={810} onLoad={() => setHeroLoaded(true)} onError={() => setHeroLoaded(true)} sizes="(max-width:440px) 44vw, 200px" priority />
          <ol>{[{ title: "테스트", detail: "내 집밥 유형 찾기" }, { title: "무먹체험", detail: "직접 눌러서 경험하기" }, { title: "베타신청", detail: "오픈 소식 먼저 받기" }].map((item, index) => <li key={item.title}><span className={styles.journeyCheck}><CheckIcon /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div>{index < 2 && <span className={styles.journeyArrow} aria-hidden="true">↓</span>}</li>)}</ol>
        </div>
        <div className={styles.footer}><button className={styles.primary} type="button" onClick={beginQuiz} disabled={busy}>4문항 테스트하기 <ArrowRightIcon aria-hidden="true" /></button><p className={styles.fine}>로그인 없이 · 결과 바로 확인</p></div>
      </>}
      {!shared && ui.screen === "quiz" && <>
        <div className={styles.quizHeader}><button className={styles.back} type="button" aria-label="이전 문항" disabled={busy || !!ui.pending || !!selectedAnswer} onClick={() => commit(current => current.question ? { ...current, question: current.question - 1 } : { ...current, screen: "hero" })}>{backIcon}</button><div className={styles.progress}>{[0, 1, 2, 3].map(n => <i key={n} className={n <= ui.question ? styles.filled : ""} />)}</div><b>{ui.question + 1} / 4</b></div>
        <fieldset className={styles.question}><legend><h1>{question.label}</h1></legend><div className={styles.options}>{question.options.map(option => <button key={option.value} type="button" aria-pressed={selectedAnswer === option.value || ui.answers[question.id] === option.value} disabled={busy || !!ui.pending || !!selectedAnswer} onClick={() => choose(option.value)}><span>{option.label}</span><i aria-hidden="true">{(selectedAnswer === option.value || ui.answers[question.id] === option.value) ? "✓" : ""}</i></button>)}</div></fieldset>
      </>}
      {(shared || ui.screen === "result") && result && resultKey && <>
        <button type="button" className={styles.back} aria-label="처음 화면" onClick={goHome}>{backIcon}</button><p className={styles.resultEyebrow}>{shared ? "공유된 집밥 유형" : "나의 집밥 유형"}</p><h1 className={styles.resultTitle}>{result.title}</h1>
        <CharacterArtwork key={resultKey} src={result.characterSrc} alt={result.characterAlt} />
        <blockquote>{result.quote}</blockquote><p className={styles.resultBody}>{result.description}</p>
        {!shared && ui.answers.q4 && ui.answers.q4 !== "none" && <p className={styles.bridge}>{HOMEFLOW_RESULT_BRIDGES[ui.answers.q4]}</p>}
        <div className={styles.footer}><button className={styles.primary} type="button" onClick={shared ? beginQuiz : beginExample} disabled={busy}>{shared ? "4문항 테스트하기" : "무먹 체험하러 가기"} <ArrowRightIcon aria-hidden="true" /></button><button className={styles.textButton} type="button" onClick={() => { void share(resultKey); }}>내 유형 공유하기</button>{shareNotice && <p className={styles.fine} role="status">{shareNotice}</p>}</div>
      </>}
      {!shared && ui.screen === "returning" && <>{brand}<h1>이미 의견을 남겨주셨어요.</h1><p className={styles.body}>이 브라우저에는 유형 결과가 남아 있지 않아요. 답변을 다시 제출하지 않고 무먹 체험을 이어갈 수 있어요.</p><div className={styles.footer}><button className={styles.primary} onClick={beginExample} disabled={busy}>무먹 체험하러 가기</button></div></>}
      {!shared && ui.screen === "lead" && <>
        <div className={styles.pageHeader}><button className={styles.back} type="button" aria-label="식사 기록으로 돌아가기" disabled={busy || !!leadRequest.current} onClick={() => { commit(current => ({ ...current, screen: "experience", step: 6 })); }}>{backIcon}</button>{brand}</div>
        <CharacterArtwork src={HOMEFLOW_CHARACTER_ASSETS.invitation} alt="파란 초대장을 들고 웃는 무먹 캐릭터" />
        <h1 className={styles.centerTitle}><em>무먹,</em> 직접 써보고 싶나요?</h1><p className={styles.body}>베타가 준비되면 이메일로 초대해드릴게요.</p>
        <form onSubmit={submitLead} className={styles.form}><label htmlFor="homeflow-email">이메일</label><input id="homeflow-email" aria-label="이메일 주소" type="email" autoComplete="email" placeholder="name@example.com" maxLength={254} required value={email} readOnly={preview || contentOnly || busy || !!leadRequest.current} onChange={event => { emailRef.current = event.target.value; setEmail(event.target.value); }} />
          <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy || !!leadRequest.current || contentOnly} onChange={event => { consentRef.current = event.target.checked; setConsent(event.target.checked); }} /><span><b>[필수]</b> 이메일 수집·이용에 동의해요.</span></label>
          <details className={styles.consentDetails}><summary>수집 목적과 보유 기간 보기</summary><dl><dt>수집 목적</dt><dd>무먹 베타 오픈 알림 발송</dd><dt>수집 항목</dt><dd>이메일 주소, 신청 주제·동의 기록</dd><dt>보유 기간</dt><dd>2026년 11월 30일까지. 철회 시 해당 정보를 삭제해요.</dd></dl></details>
          {collects && <MarketingTurnstile siteKey={siteKey} action="mumeok_r2_homeflow" onControllerChange={setWidget} />}
          <button className={styles.primary} type="submit" disabled={!consent || busy || contentOnly}>{busy ? "신청 확인 중…" : contentOnly ? "베타 신청 준비 중" : "베타오픈 신청하기"}</button>
        </form>
      </>}
      {!shared && ui.screen === "done" && <>{brand}<CharacterArtwork src={HOMEFLOW_CHARACTER_ASSETS.success} alt="색종이 사이에서 두 팔을 들고 기뻐하는 캐릭터" celebrate /><h1 className={styles.centerTitle}>신청이 완료됐어요!</h1><p className={styles.body}>베타가 준비되면<br />이메일로 알려드릴게요.</p><div className={styles.footer}><button className={styles.secondary} type="button" onClick={goHome}>처음으로 돌아가기</button></div></>}
    </section>}
  </main>;
}
