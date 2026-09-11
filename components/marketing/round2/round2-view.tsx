"use client";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { normalizeRound2Email, type Round2Activity, type Round2Topic } from "@/lib/marketing-round2";
import { ROUND2_LEAD_COPY, ROUND2_SURVEYS } from "@/lib/marketing/round2-survey";
import type { Round2Client, Round2ClientState } from "@/lib/marketing/round2-client";
import { Round2Turnstile } from "./round2-turnstile";
import styles from "./round2.module.css";
type Screen = "menu" | Round2Activity | "example_done" | "survey_done" | "lead_done";
type Actions = Pick<Round2Client, "getState" | "openActivity" | "returnToMenu" | "completeExample" | "saveSurveyDraft" | "submitSurvey" | "setLeadForm" | "setTurnstileToken" | "submitLead" | "retry" | "restart" | "restoreLeadAttempt">;
export type Round2ViewProps = {
    topic: Round2Topic;
    preview: boolean;
    leadReady: boolean;
    turnstileSiteKey: string;
    state: Round2ClientState;
    actions: Actions;
};
const COPY = {
    recording: { title: "내 레시피로 만든 집밥, 먹은 만큼 영양 기록", description: "레시피의 재료 정보를 가져와 확인하고, 완성한 요리와 먹은 분량을 기록으로 연결해요.", example: "내 레시피에서 영양 기록까지", survey: "집밥 기록에 대한 의견", lead: "집밥 기록, 베타 소식 받기", leadDescription: "내 레시피와 먹은 분량을 잇는 기록 기능을 준비 중이에요.", exampleDone: "내 레시피에서 먹은 분량의 추정 영양 기록으로 이어지는 예시를 보셨어요.", surveyDone: "집밥 기록에 대한 의견을 접수했어요.", leadDone: "집밥 기록 기능의 베타 오픈 알림 신청이 접수됐어요." },
    homeflow: { title: "뭐 먹을지 정한 다음, 장보기부터 남은 요리까지", description: "요리 계획에 필요한 재료를 모으고, 집에 있는 재료를 빼서 장보고, 남은 요리를 다음 식사로 이어가요.", example: "계획부터 남은 요리까지", survey: "집밥 관리에 대한 의견", lead: "집밥 관리, 베타 소식 받기", leadDescription: "계획부터 장보기, 요리와 남은 요리 관리를 준비 중이에요.", exampleDone: "요리를 계획하고, 집에 있는 재료를 빼고 장보기부터 요리와 남은 요리 관리까지의 예시를 보셨어요.", surveyDone: "집밥 준비와 관리에 대한 의견을 접수했어요.", leadDone: "집밥 관리 기능의 베타 오픈 알림 신청이 접수됐어요." },
} as const;
const DONE_TITLE = { example: "사용 예시를 확인했어요", survey: "의견을 남겨주셔서 감사해요", lead: "베타 오픈 알림 신청을 접수했어요" };
const INITIAL_LABEL = { lead: "베타 오픈 알림 받기", example: "사용 예시 먼저 보기", survey: "의견만 남기기 · 4문항" };
const COMPLETE_LABEL = { lead: "알림 접수 확인", example: "사용 예시 다시 보기", survey: "의견 접수 확인" };
function Food({ scale = false }: {
    scale?: boolean;
}) {
    const [failed, setFailed] = useState(false);
    return failed ? <p className={styles.foodFallback}>준비된 제육볶음 예시</p> : <Image className={styles.food} src={`/assets/funnel/food/${scale ? "jeyuk-on-scale" : "jeyuk-recipe-clean"}.webp`} alt="준비된 제육볶음 예시" width={350} height={160} onError={() => setFailed(true)}/>;
}
function ExampleScene({ topic, scene }: {
    topic: Round2Topic;
    scene: number;
}) {
    if (topic === "recording")
        return <div className={styles.scene}>
    <Food scale={scene === 1}/>
    {scene === 0 ? <>
      <h2>재료와 양 확인</h2>
      <dl>
        <div>
          <dt>돼지고기 목살</dt>
          <dd>
            <s>600g</s> → <strong>520g</strong>
          </dd>
        </div>
        <div>
          <dt>신김치</dt>
          <dd>200g</dd>
        </div>
        <div>
          <dt>양파</dt>
          <dd>100g</dd>
        </div>
      </dl>
      <p>재료와 양을 직접 확인·수정해요.</p>
    </> : scene === 1 ? <>
      <h2>직접 입력하는 양 · 예시</h2>
      <dl>
        <div>
          <dt>완성한 요리 무게</dt>
          <dd>
            <strong>1,180g</strong>
          </dd>
        </div>
        <div>
          <dt>먹은 양</dt>
          <dd>
            <strong>320g</strong>
          </dd>
        </div>
      </dl>
      <p>저울로 확인한 무게를 입력해요.</p>
    </> : <>
      <h2>내 레시피 · 제육볶음 기록 예시</h2>
      <p>완성한 요리 1,180g 중 먹은 양 320g</p>
      <p className={styles.nutrition}>487 kcal</p>
      <p>예시·추정치</p>
      <dl>
        <div>
          <dt>탄수화물</dt>
          <dd>31g</dd>
        </div>
        <div>
          <dt>단백질</dt>
          <dd>39g</dd>
        </div>
        <div>
          <dt>지방</dt>
          <dd>22g</dd>
        </div>
      </dl>
      <p>영양 값 전체가 예시·추정치예요.</p>
    </>}
  </div>;
    return <div className={styles.scene}>{scene === 0 ? <>
    <Food />
    <h2>요리 계획 예시</h2>
    <p className={styles.strong}>오늘 저녁 · 제육볶음</p>
    <p>필요한 재료를 확인해요.</p>
  </> : <>
    <h2>{scene === 1 ? "구매할 재료 · 예시" : "장보기 요약 · 준비된 예시"}</h2>
    <div className={styles.materials}>
      <strong>구매{scene === 1 ? "할 재료" : ""}</strong>
      <p>돼지고기 목살 · 신김치</p>
    </div>
    <div className={styles.materials}>
      <strong>집에 있어 제외{scene === 1 ? "한 재료 · 예시" : ""}</strong>
      <p>양파 · 고추장 · 고춧가루</p>
    </div>{scene === 1 ? <p>보유 재료는 직접 확인해요.</p> : <>
      <h2>요리에서 다음 식사로 · 예시</h2>
      <p className={styles.strong}>오늘 저녁 제육볶음 · 요리 완료</p>
      <p>남은 제육볶음 → 다음 식사 계획</p>
      <p>직접 표시한 상태를 잇는 예시예요.</p>
    </>}</>}</div>;
}
export function Round2View({ topic, preview, leadReady, turnstileSiteKey, state, actions }: Round2ViewProps) {
    const [screen, setScreen] = useState<Screen>("menu"), [scene, setScene] = useState(0), [question, setQuestion] = useState(0);
    const [fieldError, setFieldError] = useState<string | null>(null), [challengeError, setChallengeError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const titleRef = useRef<HTMLHeadingElement>(null), originRef = useRef<Round2Activity | null>(null);
    const menuRefs = useRef<Partial<Record<Round2Activity, HTMLButtonElement | null>>>({});
    const previousScreen = useRef<Screen>("menu");
    const navigationGeneration = useRef(0);
    const [challengeRetry, setChallengeRetry] = useState(0);
    useEffect(() => {
        window.history.replaceState({ ...window.history.state, mumeokR2: { topic, screen: "menu" } }, "");
        const back = (event: PopStateEvent) => {
            navigationGeneration.current++;
            const destination = event.state?.mumeokR2;
            const screens: Screen[] = ["menu", "example", "survey", "lead", "example_done", "survey_done", "lead_done"];
            if (destination?.topic === topic && screens.includes(destination.screen))
                setScreen(destination.screen);
            else
                setScreen("menu");
            setFieldError(null);
        };
        window.addEventListener("popstate", back);
        return () => window.removeEventListener("popstate", back);
    }, [topic]);
    function navigate(next: Screen) {
        navigationGeneration.current++;
        window.history.pushState({ ...window.history.state, mumeokR2: { topic, screen: next } }, "");
        setScreen(next);
    }
    const copy = COPY[topic], completed = (activity: Round2Activity) => state.snapshot?.state[activity] === "completed";
    const active: Round2Activity | null = screen === "menu" ? null : screen.split("_")[0] as Round2Activity;
    const isDone = screen.endsWith("_done") && active && completed(active);
    const waiting = state.busy || state.connection !== "ready";
    const cooldown = Math.max(0, Math.ceil(((state.error?.retryAt ?? 0) - now) / 1000));
    useEffect(() => {
        if (screen === "menu" && previousScreen.current !== "menu" && originRef.current)
            menuRefs.current[originRef.current]?.focus();
        else if (screen !== "menu")
            titleRef.current?.focus();
        previousScreen.current = screen;
    }, [screen, question, scene]);
    useEffect(() => {
        if (!state.error?.retryAt)
            return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [state.error?.retryAt]);
    useEffect(() => {
        setChallengeError(null);
    }, [state.challengeEpoch]);
    useEffect(() => {
        if ((screen === "lead" || screen === "survey") && state.snapshot?.state[screen] === "completed")
            setScreen(`${screen}_done`);
    }, [screen, state.snapshot]);
    useEffect(() => {
        if (state.connection === "restart_required" || state.connection === "campaign_ended") {
            setQuestion(0);
            setScene(0);
            setFieldError(null);
        }
    }, [state.connection]);
    function open(activity: Round2Activity) {
        originRef.current = activity;
        setFieldError(null);
        setChallengeError(null);
        navigate(activity !== "example" && completed(activity) ? `${activity}_done` : activity);
        if (activity === "example")
            setScene(0);
        void actions.openActivity(activity);
    }
    function menu() {
        navigate("menu");
        setFieldError(null);
        if (active)
            void actions.returnToMenu(active);
    }
    function activityButton(activity: Round2Activity, kind: "primary" | "secondary" | "text" = "text") {
        return <button type="button" className={styles[kind]} ref={node => {
                menuRefs.current[activity] = node;
            }} onClick={() => open(activity)}>{completed(activity) ? COMPLETE_LABEL[activity] : INITIAL_LABEL[activity]}{screen === "menu" && completed(activity) && <span className={styles.badge}>완료</span>}</button>;
    }
    async function finishExample() {
        const generation = navigationGeneration.current;
        if ((completed("example") || await actions.completeExample()) && generation === navigationGeneration.current)
            setScreen("example_done");
    }
    async function retry() {
        const generation = navigationGeneration.current;
        if (await actions.retry()) {
            if (active && generation === navigationGeneration.current && actions.getState().snapshot?.state[active] === "completed")
                setScreen(`${active}_done`);
        }
    }
    async function surveyNext() {
        const generation = navigationGeneration.current;
        const q = ROUND2_SURVEYS[topic].questions[question];
        if (!state.draft[q.id]) {
            setFieldError("답변을 하나 골라 주세요");
            document.getElementById(`r2-option-${q.id}-0`)?.focus();
            return;
        }
        setFieldError(null);
        if (question < 3)
            setQuestion(question + 1);
        else if (await actions.submitSurvey(state.draft) && generation === navigationGeneration.current)
            setScreen("survey_done");
    }
    async function leadSubmit(event: React.FormEvent) {
        const generation = navigationGeneration.current;
        event.preventDefault();
        setFieldError(null);
        try {
            normalizeRound2Email(state.leadForm.email);
        }
        catch {
            setFieldError("이메일 주소를 확인해 주세요.");
            document.getElementById("r2-email")?.focus();
            return;
        }
        if (!state.leadForm.consent) {
            setFieldError("개인정보 수집·이용에 동의해 주세요.");
            document.getElementById("r2-consent")?.focus();
            return;
        }
        if (!preview && !state.tokenReady) {
            setChallengeError("보안 확인을 완료해 주세요.");
            return;
        }
        if (await actions.submitLead() && generation === navigationGeneration.current)
            setScreen("lead_done");
    }
    const error = state.error;
    const editedLead = active === "lead" && state.pendingLead?.edited;
    const recovery = (error || editedLead) && <section className={styles.recovery} aria-label="참여 복구" data-screen-id={`R2_${topic.toUpperCase()}_RECOVERY`}>
    <p role="alert" id="r2-server-error">
      <strong>{editedLead || error?.code === "NETWORK_ERROR" ? (active === "lead" ? "접수 여부를 확인하지 못했어요" : "저장 여부를 확인하지 못했어요") : error?.code === "CAMPAIGN_ENDED" ? "이번 참여 기간이 끝났어요." : "아직 저장되지 않았어요."}</strong>
      <br />{error?.message}</p>{state.storageBlocked && <p>브라우저 저장소를 사용할 수 없어요. 기존 참여가 연결되면 계속할 수 있어요. 미제출 답변과 확인되지 않은 요청은 새로고침하면 사라질 수 있어요.</p>}{active === "lead" && <p>이메일과 동의 입력은 이 탭을 열어 둔 동안만 유지돼요. 새로고침하면 지워져요.</p>}{editedLead && <p>이전 신청 이메일: {state.pendingLead?.email}<br />편집한 이메일로는 아직 보내지 않았어요. 이전 신청의 접수 여부를 확인하거나, 편집을 취소하고 동의와 보안 확인을 다시 진행해 주세요.</p>}{state.connection === "restart_required" ? <button className={styles.primary} type="button" disabled={state.busy} onClick={() => void actions.restart()}>새 참여 시작</button> : state.connection !== "campaign_ended" && <button className={styles.primary} type="button" disabled={state.busy || cooldown > 0} onClick={() => void retry()}>{cooldown > 0 ? `${cooldown}초 후 다시 시도` : editedLead ? "이전 신청 접수 확인" : "다시 시도"}</button>}{editedLead && <button className={styles.secondary} type="button" disabled={state.busy} onClick={() => { actions.restoreLeadAttempt(); setFieldError(null); }}>편집 취소하고 이전 입력으로 돌아가기</button>}</section>;
    const connectionStatus = !error && state.connection !== "ready" && <p role="status" className={styles.notice}>참여 정보를 연결 중이에요. 예시와 질문은 먼저 볼 수 있어요.</p>;
    const q = ROUND2_SURVEYS[topic].questions[question];
    const title = screen === "menu" ? copy.title : isDone ? DONE_TITLE[active!] : copy[active ?? "example"];
    return <div className={styles.surface}>
    <main className={styles.page} data-screen-id={`R2_${topic.toUpperCase()}_${screen.toUpperCase()}`}>
      {preview && <p className={styles.preview}>로컬 미리보기 · 저장되지 않아요</p>}
      <header className={styles.header}>
        <span className={styles.logo}>
          <Image src="/assets/funnel/brand/mumeok-logo-horizontal.webp" width={112} height={34} alt="무먹 무엇을 먹든" priority/>
        </span>{screen !== "menu" && <button type="button" className={styles.headerBack} onClick={menu}>메뉴로</button>}</header>
      <p className={styles.eyebrow}>베타 준비 중{screen === "menu" || active === "example" ? " · 사용 예시" : ""}</p>
      <span>{isDone && <Image className={styles.mascot} src="/assets/funnel/characters/beta-success-mascot.webp" width={56} height={56} alt=""/>}</span>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>{title}</h1>
      {screen === "menu" ? <>
        <p className={styles.description}>{copy.description}</p>
        <div className={styles.foodStrip}>
          <Food />
          <span>{topic === "recording" ? "내 레시피 → 먹은 분량 추정 영양 기록" : "요리 계획 → 장보기 → 남은 요리"}</span>
        </div>
        <nav className={styles.actions} aria-label="원하는 활동 선택">{activityButton("lead", "primary")}{activityButton("example", "secondary")}{activityButton("survey")}</nav>
        <p className={styles.notice}>현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.</p>
        <p className={styles.notice}>하나만 해도 괜찮아요. 순서는 자유예요.</p>
        <p className={styles.notice}>{state.snapshot ? Object.values(state.snapshot.state).every(value => value !== "completed") ? "아직 완료한 활동이 없어요" : "완료한 활동은 위에서 다시 확인할 수 있어요." : "완료 여부를 확인하고 있어요."}</p>{recovery}{connectionStatus}</> : isDone ? <>
          <p role="status" className={styles.description}>{copy[`${active!}Done`]}</p>{active === "example" && <p className={styles.notice}>실제 서비스가 아닌 사용 예시예요.</p>}{active === "survey" && <p className={styles.notice}>접수한 답변은 지금 변경하거나 다시 제출할 수 없어요.</p>}<p className={styles.endNote}>여기서 마쳐도 괜찮아요.<br />
            <span>원하시면 다른 활동도 살펴보세요.</span>
          </p>
          <nav className={styles.actions} aria-label="완료 후 선택">
            <button className={styles.primary} onClick={menu}>메뉴로 돌아가기</button>{active !== "lead" ? activityButton("lead", "secondary") : activityButton("example", "secondary")}{active !== "survey" ? activityButton("survey") : activityButton("example")}{active === "example" && activityButton("example")}</nav>
        </> : active === "example" ? <>
          <p className={styles.notice}>실제 서비스가 아닌 준비된 예시예요.</p>
          <p className={styles.progress}>사용 예시 {scene + 1}/3</p>
          <ExampleScene topic={topic} scene={scene}/>
          <p className={styles.notice}>{ROUND2_SURVEYS[topic].questions[3].noticeBefore}</p>{recovery}{connectionStatus}<div className={styles.actions}>{scene < 2 ? <button className={styles.primary} onClick={() => setScene(scene + 1)}>다음 장면</button> : error && !completed("example") ? null : <button className={styles.primary} disabled={!completed("example") && waiting} onClick={() => void finishExample()}>{completed("example") ? "확인 완료 화면 보기" : "예시 확인 완료"}</button>}{scene > 0 && <button className={styles.text} onClick={() => setScene(scene - 1)}>이전 장면</button>}{activityButton("lead", "secondary")}</div>
        </> : active === "survey" ? <>
          <p className={styles.progress}>문항 {question + 1}/4</p>{"noticeBefore" in q && <p className={styles.condition}>{q.noticeBefore}</p>}<fieldset className={styles.question} aria-describedby={fieldError ? "r2-question-error" : undefined}>
            <legend>{q.label}</legend>{"noticeAfter" in q && <p className={styles.notice}>{q.noticeAfter}</p>}<div className={styles.options}>{q.options.map((option, index) => <label key={option.value} className={styles.option}>
                <input id={`r2-option-${q.id}-${index}`} type="radio" name={q.id} value={option.value} checked={state.draft[q.id] === option.value} onChange={() => {
                    setFieldError(null);
                    void actions.saveSurveyDraft({ ...state.draft, [q.id]: option.value });
                }}/>{option.label}</label>)}</div>
          </fieldset>{fieldError && <p id="r2-question-error" role="alert" className={styles.fieldError}>{fieldError}</p>}{recovery}{connectionStatus}<div className={styles.actions}>
            {(question < 3 || !error) && <button className={styles.primary} disabled={question === 3 && waiting} onClick={() => void surveyNext()}>{question === 3 ? "의견 보내기" : "다음 문항"}</button>}{question > 0 && <button className={styles.text} onClick={() => {
                    setFieldError(null);
                    setQuestion(question - 1);
                }}>이전 문항</button>}</div>
          <p className={styles.notice}>이메일 없이 의견만 남길 수 있어요.</p>
        </> : <>
        <p className={styles.description}>{copy.leadDescription}</p>
        <form className={styles.form} onSubmit={leadSubmit} noValidate>
          <label htmlFor="r2-email" className={styles.strong}>이메일</label>
          <input id="r2-email" className={styles.email} type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} value={state.leadForm.email} readOnly={preview} placeholder={preview ? "preview@example.com" : "이메일 주소 입력"} aria-invalid={fieldError?.startsWith("이메일") || error?.fields.includes("email") || undefined} aria-describedby={fieldError ? "r2-form-error" : error ? "r2-server-error" : undefined} onChange={event => actions.setLeadForm({ email: event.target.value })}/>
          <p className={styles.strong}>개인정보 수집·이용 동의 (필수)</p>
          <label className={styles.consent}>
            <input id="r2-consent" type="checkbox" checked={state.leadForm.consent} aria-invalid={fieldError?.startsWith("개인정보") || undefined} aria-describedby={fieldError ? "r2-form-error" : undefined} onChange={event => actions.setLeadForm({ consent: event.target.checked })}/>
            <span>{ROUND2_LEAD_COPY.consentLabel}</span>
          </label>
          <p className={styles.notice}>{ROUND2_LEAD_COPY.optionalParticipationNotice}</p>
          <p className={styles.notice}>{ROUND2_LEAD_COPY.minimumAgeNotice}</p>
          <a className={styles.text} href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a>{!leadReady ? <p role="status" className={styles.condition}>알림 신청 준비 중이에요.</p> : preview ? <p className={styles.notice}>예시 이메일 preview@example.com만 사용해요. 실제 보안 확인이나 신청은 하지 않아요.</p> : <Round2Turnstile siteKey={turnstileSiteKey} topic={topic} resetKey={state.challengeEpoch + challengeRetry} onToken={token => {
                    setChallengeError(null);
                    actions.setTurnstileToken(token);
                }} onError={message => {
                    setChallengeError(message);
                    actions.setTurnstileToken(null);
                }}/>}{challengeError && <div><p role="alert" className={styles.fieldError}>{challengeError}</p><button type="button" className={styles.secondary} onClick={()=>{setChallengeError(null);actions.setTurnstileToken(null);setChallengeRetry(value=>value+1);}}>보안 확인 다시 시도</button></div>}{fieldError && <p id="r2-form-error" role="alert" className={styles.fieldError}>{fieldError}</p>}{recovery}{connectionStatus}{!error && !editedLead && <button className={styles.primary} type="submit" disabled={waiting || !leadReady}>베타 오픈 알림 신청하기</button>}
        </form>
      </>}
      {screen !== "menu" && !isDone && <button className={styles.text} onClick={menu}>메뉴로 돌아가기</button>}{screen === "menu" && <footer>
        <a className={styles.text} href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a>
      </footer>}
    </main>
  </div>;
}
