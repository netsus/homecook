// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Round2View } from "@/components/marketing/round2/round2-view";
import { ROUND2_SURVEYS, ROUND2_LEAD_COPY } from "@/lib/marketing/round2-survey";
vi.mock("@/components/marketing/round2/round2.module.css",()=>({default:{}}));

afterEach(cleanup);
const actions = () => ({ getState: vi.fn(), openActivity: vi.fn(), returnToMenu: vi.fn(), completeExample: vi.fn(async () => false), saveSurveyDraft: vi.fn(), submitSurvey: vi.fn(async () => false), setLeadForm: vi.fn(), setTurnstileToken: vi.fn(), submitLead: vi.fn(async () => false), retry: vi.fn(async () => false), restart: vi.fn(async () => false) });
function props(topic: "recording" | "homeflow" = "recording") {
  return { topic, preview: false, leadReady: false, turnstileSiteKey: "", state: { snapshot: null, connection: "connecting" as const, busy: true, error: null, draft: {}, leadForm: {email:"",consent:false},tokenReady:false,storageBlocked:false,preview:false,challengeEpoch:0 }, actions:actions() };
}
describe("R2 independent activity screens", () => {
  it.each(["recording","homeflow"] as const)("shows all %s menu actions during bootstrap and opens examples immediately", topic => {
    const p=props(topic);render(<Round2View {...p}/>);
    expect(screen.getByRole("button",{name:"베타 오픈 알림 받기"})).toBeTruthy();
    expect(screen.queryByText("아직 완료한 활동이 없어요")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
    expect(screen.getByText("사용 예시 1/3")).toBeTruthy();
    expect(p.actions.openActivity).toHaveBeenCalledWith("example");
  });
  it("requires explicit last-scene confirmation and keeps the scene when saving fails",async()=>{
    const p=props();render(<Round2View {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
    fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
    fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
    expect(screen.getByText("487 kcal")).toBeTruthy();
    expect(p.actions.completeExample).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading",{name:"사용 예시를 확인했어요"})).toBeNull();
  });
  it.each(["recording","homeflow"] as const)("uses every exact %s survey option and input notice",topic=>{
    const p=props(topic);p.state.draft={q1:"none",q2:"other",q3:"none",q4:"no"};render(<Round2View {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"의견만 남기기 · 4문항"}));
    for(const [index,q] of ROUND2_SURVEYS[topic].questions.entries()){
      expect(screen.getByRole("group",{name:q.label})).toBeTruthy();
      for(const option of q.options)expect(screen.getByRole("radio",{name:option.label})).toBeTruthy();
      if("noticeBefore" in q)expect(screen.getByText(q.noticeBefore)).toBeTruthy();
      if("noticeAfter" in q)expect(screen.getByText(q.noticeAfter)).toBeTruthy();
      if(index<3)fireEvent.click(screen.getByRole("button",{name:"다음 문항"}));
    }
    expect(screen.getByRole("button",{name:"의견 보내기"})).toBeTruthy();
  });
  it("keeps exact consent unchecked and offers the form directly without other activities",()=>{
    const p=props();render(<Round2View {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"베타 오픈 알림 받기"}));
    expect(screen.getByRole("textbox",{name:"이메일"})).toBeTruthy();
    expect((screen.getByRole("checkbox",{name:ROUND2_LEAD_COPY.consentLabel}) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(ROUND2_LEAD_COPY.minimumAgeNotice)).toBeTruthy();
    expect(screen.getByText("알림 신청 준비 중이에요.")).toBeTruthy();
    expect(p.actions.openActivity).toHaveBeenCalledTimes(1);
  });
  it("returns to the menu on browser Back without losing the activity selection on forward",()=>{
    const p=props();render(<Round2View {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
    act(()=>window.dispatchEvent(new PopStateEvent("popstate",{state:{mumeokR2:{topic:"recording",screen:"menu"}}})));
    expect(screen.getByRole("button",{name:"의견만 남기기 · 4문항"})).toBeTruthy();
  });
  it("does not pull the user back from the menu when an earlier completion response arrives",async()=>{
    const p=props();const ready={...p,state:{...p.state,connection:"ready" as const,busy:false}};
    let resolve!: (value:boolean)=>void;
    p.actions.completeExample.mockImplementation(()=>new Promise<boolean>(done=>{resolve=done;}));
    render(<Round2View {...ready}/>);
    fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
    fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
    fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
    fireEvent.click(screen.getByRole("button",{name:"예시 확인 완료"}));
    fireEvent.click(screen.getByRole("button",{name:"메뉴로"}));
    await act(async()=>resolve(true));
    expect(screen.getByRole("button",{name:"의견만 남기기 · 4문항"})).toBeTruthy();
  });
  it("offers an explicit security retry after the provider script fails",async()=>{
    const p=props();render(<Round2View {...p} leadReady turnstileSiteKey="fixture-public-key" state={{...p.state,connection:"ready",busy:false}}/>);
    fireEvent.click(screen.getByRole("button",{name:"베타 오픈 알림 받기"}));
    await vi.waitFor(()=>expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeTruthy());
    await act(async()=>document.querySelector('script[src*="challenges.cloudflare.com"]')!.dispatchEvent(new Event("error")));
    fireEvent.click(await screen.findByRole("button",{name:"보안 확인 다시 시도"}));
    await vi.waitFor(()=>expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeTruthy());
  });
  it("shows a single saving action after a failed lead request",()=>{
    const p=props();render(<Round2View {...p} state={{...p.state,busy:false,connection:"ready",error:{code:"NETWORK_ERROR",message:"저장 결과를 확인하지 못했어요.",fields:[],retryAt:null}}}/>);
    fireEvent.click(screen.getByRole("button",{name:"베타 오픈 알림 받기"}));
    expect(screen.getByRole("button",{name:"다시 시도"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"베타 오픈 알림 신청하기"})).toBeNull();
  });
  it("keeps the last example scene and one retry action after uncertain completion",()=>{
    const p=props();render(<Round2View {...p} state={{...p.state,busy:false,connection:"ready",error:{code:"NETWORK_ERROR",message:"저장 결과를 확인하지 못했어요.",fields:[],retryAt:null}}}/>);
    fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
    fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
    expect(screen.getByText("사용 예시 3/3")).toBeTruthy();
    expect(screen.getByRole("button",{name:"다시 시도"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"예시 확인 완료"})).toBeNull();
  });
});
