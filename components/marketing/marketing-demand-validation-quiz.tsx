"use client";

import React, { useRef } from "react";
import { CheckIcon, ChevronLeftIcon } from "@radix-ui/react-icons";
import type { MarketingValidationQuizAnswers } from "@/types/marketing-validation";
import { Frame } from "./marketing-demand-validation-hero";

type QuestionId = keyof MarketingValidationQuizAnswers;
type Answers = Partial<MarketingValidationQuizAnswers>;

const QUESTIONS = [
  { id: "q1", prompt: "평소 칼로리나 탄단지를\n얼마나 자주 기록하나요?", choices: [["daily", "거의 매일"], ["3_5", "주 3~5일"], ["1_2", "주 1~2일"], ["none", "거의 안 함 / 안 함"]] },
  { id: "q2", prompt: "일주일에 집밥을\n몇 끼 정도 먹나요?", helper: "직접 만들거나 가족이 만든 음식 모두 포함", choices: [["none", "거의 안 먹음"], ["1_2", "1~2끼"], ["3_5", "3~5끼"], ["6_plus", "6끼 이상"]] },
  { id: "q3", prompt: "집밥은 주로\n어떻게 기록하나요?", choices: [["pass", "집밥은 기록하지 않음"], ["eyeball", "먹은 양을 눈대중으로 기록"], ["track", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록"], ["measure", "재료와 음식 무게까지 재서 기록"]] },
  { id: "q4", prompt: "집밥을 기록할 때\n가장 불편한 것은?", choices: [["ingredients", "재료와 양을 하나씩 입력하는 것"], ["weight", "완성된 음식과 먹은 양을 재는 것"], ["search", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"], ["none", "별로 불편하지 않음"]] },
] as const;

export function Back({ onClick, label = "이전 화면" }: { onClick: () => void; label?: string }) {
  return <button className="icon-button back-button" type="button" onClick={onClick} aria-label={label}><ChevronLeftIcon /></button>;
}


export function UnifiedProgressHeader({ current, total, onBack, backLabel = "이전 화면", ariaLabel }: { current: number; total: number; onBack?: () => void; backLabel?: string; ariaLabel: string }) {
  return <div className="unified-progress-header" style={onBack ? undefined : { gridTemplateColumns: "minmax(0, 1fr) 44px", minHeight: 24 }}>{onBack && <Back onClick={onBack} label={backLabel} />}<div className="unified-progress-segments" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label={ariaLabel}>{Array.from({ length: total }, (_, index) => index + 1).map((item) => <span className={item < current ? "is-complete" : item === current ? "is-current" : ""} key={item} />)}</div><span className="unified-progress-count"><strong>{current}</strong> / {total}</span></div>;
}

export function MarketingDemandValidationQuiz({ index, answers, onBack, onSelect, locked, presentation }: { index: number; answers: Answers; onBack?: () => void; onSelect: (id: QuestionId, value: string) => void; locked: boolean; presentation?: "recording-entry" }) {
  const firstAnswerSent = useRef(false);
  const entry = presentation === "recording-entry";
  const questionIndex = entry ? 0 : index;
  const question = QUESTIONS[questionIndex];
  const selectionLocked = locked || (entry && answers.q1 !== undefined);
  function select(value: string) {
    if (selectionLocked || (entry && firstAnswerSent.current)) return;
    // The caller receives an answer once per entry mount, never an implicit start event.
    if (entry) firstAnswerSent.current = true;
    onSelect(question.id, value);
  }
  return <Frame stage={`question-${questionIndex + 1}`} className="quiz-screen">{entry && <div style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 4, color: "var(--mumeok-muted)" }}>
    <small style={{ fontSize: "inherit", fontWeight: 800, color: "var(--mumeok-blue-dark)" }}>무먹 / 베타 오픈 전 수요조사</small>
    <p>4문항 · 로그인 없이</p>
  </div>}<UnifiedProgressHeader current={questionIndex + 1} total={4} onBack={entry ? undefined : onBack} backLabel={questionIndex ? "이전 질문" : "이전 화면"} ariaLabel={`${questionIndex + 1} / 4 진행`} /><div className={`question-copy ${"helper" in question ? "has-helper" : "no-helper"}`}><h2 aria-label={entry ? question.prompt.replace("\n", " ") : undefined}>{question.prompt.split("\n").map((line, lineIndex) => <span key={line}>{lineIndex ? <br /> : null}{line}</span>)}</h2>{"helper" in question ? <p>{question.helper}</p> : null}</div><div className="choice-list" aria-label={question.prompt}>{question.choices.map(([value, label]) => { const active = answers[question.id] === value; return <button className={`choice-button ${active ? "is-selected" : ""}`} key={value} type="button" aria-pressed={active} disabled={selectionLocked} onClick={() => select(value)}><span>{label}</span><span className="choice-indicator" aria-hidden="true">{active ? <CheckIcon /> : null}</span></button>; })}</div></Frame>;
}
